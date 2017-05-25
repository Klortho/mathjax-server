const fs = require('fs-extra');
const mjAPI = require('mathjax-node');
const minimatch = require('minimatch');
const querystring = require('querystring');
const R = require('ramda');
const url = require('url');
const util = require('util');

const logger = require('winston');
const clientTemplate = require('./client-template.js');
const parseJats = require('./parse-jats.js');


// URL patterns of static files
const staticGlobs = [
  '/home.html',
  '/home.js',
  '/favicon.ico',
  '/examples/*',
  '/lib/*',
];

// Regular expressions used in determining the input format
const jatsStartTag = new RegExp('<article\\s+');
const mmlStartTag = new RegExp('<([A-Za-z_]+:)?math', 'm');

// Cache storage for static file contents (it is not much). For each static
// file, we store `contentType`, `encoding`, and `content`.
const staticFiles = {};

// File types we know about. If `encoding` is null, then
// this type of file has binary content.
const fileTypes = {
  'html': {
    contentType: 'text/html',
    encoding: 'utf-8',
  },
  'ico': {
    contentType: 'image/ico',
    encoding: null,
  },
  'js': {
    contentType: 'application/javascript',
    encoding: 'utf-8',
  },
  'latex': {
    contentType: 'application/x-tex',
    encoding: 'utf-8',
  },
  'mml': {
    contentType: 'application/mathml+xml',
    encoding: 'utf-8',
  },
  'nxml': {
    contentType: 'application/jats+xml',
    encoding: 'utf-8',
  },
  'png': {
    contentType: 'image/png',
    encoding: null,
  },
  'svg': {
    contentType: 'image/svg+xml',
    encoding: 'utf-8',
  },
  'txt': {
    contentType: 'text/plain',
    encoding: 'utf-8',
  },
};

const getFileType = ext => ext in fileTypes ? fileTypes[ext] :
  { contentType: 'application/octet-stream', encoding: 'utf-8', }



/**
 * This class defines a wrapper object for a single HTTP request
 */
class RequestHandler {

  /**
   * Constructor instantiates the object.
   */
  constructor(request, response) {
    this.request = request;
    this.response = response;
  }

  /**
   * The main method -- sets the event callbacks.
   */
  go() {
    this.data = '';
    this.request.on('data', chunk => { this.data += chunk; });
    this.request.on('end', () => {
      //console.log('In go(), `this` is: ', this);
      return this.processRequest();
    });
  }

  /**
   * This is called back when the request is complete and ready to process
   */
  processRequest() {
    const rh = this;
    try {
      const request = rh.request;
      const method = rh.method = request.method;
      logger.info(method + ' ' + request.url);
      if (method === 'POST') logger.debug('POST data: ', rh.data);

      // Validate the HTTP method
      if (method !== 'GET' && method !== 'POST')
        return rh.badRequest('Method not supported');

      // Validate a POST request's payload
      if (method === 'POST' && rh.data.length === 0)
        return rh.badRequest('Missing POST content');

      // Parse the URL
      const urlObj = rh.urlObj = url.parse(request.url);

      // Parse the query string
      const parsed = rh.parsed = querystring.parse(
        method === 'GET' ? urlObj.query : rh.data);
      logger.debug('Query string, parsed: ' + util.inspect(parsed));

      // If the URL specifies a static resource, deliver that
      if (rh.doStatic()) return null;

      // This object includes defaults for query-string param values:
      const defaults = {
        q: '',
        'in-format': 'auto',
        'latex-style': 'display',
        width: '800',
      };
      const params = R.merge(defaults, parsed);


      // validate and normalize
      const inFormat = params['in-format'];
      if (!['auto', 'mml', 'latex', 'jats'].find(v => v === inFormat)) {
        return rh.badRequest('Invalid value for in-format');
      }

      const latexStyle = params['latex-style'];
      if (!['text', 'display'].find(v => v === latexStyle)) {
        return rh.badRequest('Invalid value for latex-style');
      }

      const _width = params.width;
      const width = parseInt(_width);
      if (isNaN(width) || width <= 0) {
        return rh.badRequest('Invalid value for width');
      }

      const q = params.q;
      if (!q || q.match(/^\s*$/)) {   // no source math
        return rh.badRequest('No source math detected in input');
      }


      // Implement auto-detect.
      // We assume that any XML tag that has the name 'math',
      // regardless of whether or not it is in a namespace, is mathml.
      // Also look for the opening tag '<article', to determine whether or not this is
      // JATS.  If it's not JATS, and there are no MathML opening tags, then assume it
      // is LaTeX.
      const format = inFormat !== 'auto' ? inFormat
        : q.match(jatsStartTag) ? 'jats'
        : q.match(mmlStartTag) ? 'mml'
        : 'latex';
      logger.debug('format: ', format);

      // FIXME: do we still need this?
      // PMC-29429 - filter processing instructions out of MML equations
      //query.q = q = q.replace(/<\?[^?]+?\?>/g, '');

      // Parse JATS files
      if (format === 'jats') {
        logger.debug('calling parseJats');
        var jatsFormulas = parseJats(q);
        logger.debug('jatsFormulas: ', jatsFormulas);

        if (typeof jatsFormulas === "string") {
          return rh.badRequest(jatsFormulas);
        }
        return rh.respond(200, 'html', jatsFormulas);
      }

      // Convert rendermath params to mathjax-node conventions
      const mjOpts = {
        math: params.q,
        format: {
          'mml': 'MathML',
          'latex': 'TeX',
        }[format],
        svg: true,
      };

      logger.debug('mjOpts: ' + util.inspect(mjOpts));

      mjAPI.typeset(mjOpts, function(result) {
        try {
          logger.debug('MathJax result: ' + util.inspect(result));

          if (result.errors) {
            return rh.badRequest('Conversion failed: ' + result.errors);
          }
          else if (result.svg) {
            return rh.respond(200, 'svg', result.svg);
          }
          else if (result.mml) {
            return rh.respond(200, 'mml', result.mml);
          }
          else if (result.png) {
            // slice(22) starts the encoding (from base64 to binary)
            // after the base64 header info; viz. "data:image/png;base64"
            return rh.respond(200, 'png', new Buffer(result.png.slice(22), 'base64'));
          }
          else if (result.html) {
            return rh.respond(200, 'html', result.html);
          }
          else {
            return rh.respond(500, 'txt', 'Sorry, an unknown problem was encountered');
          }
        }
        catch(error) {
          logger.error('Caught exception trying to typeset: ' + err.stack);
          return rh.respond(500, 'txt', 'Error trying to typeset the equation');
        }
      });
    }

    catch(err) {
      logger.error('Exception during process(): ' + err.stack);
      return rh.badRequest('Sorry, I can\'t seem to decipher this request.');
    }
  }

  /**
   * Checks to see if this is a valid request for a static resource. If so,
   * it delivers the resource and returns true. Otherwise, it returns false.
   * The request must be GET, and not have a query string.
   * If a serious error occurs, this responds with an error page, and returns
   * true.
   */
  doStatic() {
    if (this.method !== 'GET' ||
        Object.keys(this.parsed).length > 0) return false;

    const _path = this.urlObj.pathname || '/';
    console.log('_path: ', _path);
    const realPath = _path === '/' ? '/home.html' : _path;

    if (!staticGlobs.find(glob => minimatch(realPath, glob))) return false;

    // memo-ize the results in staticFiles
    if (!(realPath in staticFiles)) {
      try {
        const extension = realPath.replace(/.*\.(.*)/, "$1");
        const encoding = getFileType(extension).encoding;
        const tmpl = fs.readFileSync('static' + realPath, encoding);
        // If this is a text file, do our little template substitution
        const content = encoding === 'utf8' ?
          tmpl.replace("<!-- version -->", VERSION) : tmpl;

        // Cache the results
        staticFiles[realPath] = {
          extension: extension,
          content: content,
        };
      }
      catch(err) {
        const msg = 'An error occurred trying to serve a static resource';
        logger.error(msg + ': ' + err.stack);
        this.badRequest(msg);
        return true;
      }
    }

    const sfile = staticFiles[realPath];
    this.respond(200, sfile.extension, sfile.content);
    return true;
  }


  /**
   * Utility function to output a response all in one go.
   */
  respond(status, typeId, content) {
    const response = this.response;
    const fileType = getFileType(typeId),
          cType = fileType.contentType,
          encoding = fileType.encoding,
          cTypeHeader = cType + (encoding === '' ? '' : `; charset=${encoding}`);

    response.writeHead(status, {'Content-Type': cTypeHeader});
    // FIXME: need client template here
    response.write("<html><body>you win!</body></html>");
    response.end();
    return null;
  }

  /**
   * Utility function for a "bad query" response.
   */
  badRequest(msg) {
    this.respond(400, 'txt', msg);
  }
}

module.exports = RequestHandler;
