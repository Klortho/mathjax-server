"use strict";

const fs = require('fs-extra');
const mjAPI = require('mathjax-node');
const minimatch = require('minimatch');
const querystring = require('querystring');
const R = require('ramda');
const url = require('url');
const util = require('util');

const clientTemplate = require('./client-template.js');
const logger = require('winston');
const parseJats = require('./parse-jats.js');

// URL patterns of static files
const staticGlobs = [
  '/home.html',
  '/home.js',
  '/favicon.*',
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
  'md': {
    contentType: 'text/plain',
    encoding: 'utf-8',
  }
};

// Get the file type object, given an extension
const getFileType = ext => ext in fileTypes ? fileTypes[ext] :
  { contentType: 'application/octet-stream', encoding: 'utf-8', }

// Valid values for the `in-format` parameter
const inFormats = ['auto', 'mml', 'latex', 'jats'];

// Valid values for `latex-style`
const latexStyles = ['text', 'display'];

/**
 * A RequestHandler object is a wrapper for a single HTTP request
 */
class RequestHandler {

  constructor(request, response) {
    this.request = request;
    this.response = response;
  }

  /**
   * The main method -- sets the event callbacks to collect the incoming data
   */
  go() {
    this.requestContent = '';
    this.request.on('data', chunk => { this.requestContent += chunk; });
    this.request.on('end', () => {
      return this.processRequest();
    });
  }

  /**
   * This is called when the request is complete and ready to process
   */
  processRequest() {
    const self = this;
    try {
      const request = self.request;
      const method = request.method;
      logger.info(`${method} ${request.url}`);

      // Parse the URL
      const urlObj = self.urlObj = url.parse(request.url);
      logger.silly('  ... parsed URL: ' + util.inspect(urlObj));

      if (method === 'GET') {
        self.paramStr = urlObj.query;
      }

      else if (method === 'POST') {
        // Verify that there is some POST content
        if (self.requestContent.length === 0)
          return self.badRequest('Missing POST content');
        logger.debug('POST content: ', self.requestContent);
        self.paramStr = self.requestContent;
      }

      else {
        return self.badRequest('Method not supported');
      }

      // Handle static resources
      if (self.handleStatic()) return null;

      // Extract the request params, using these defaults
      const defaults = {
        q: '',
        'in-format': 'auto',
        'latex-style': 'display',
        width: '800',
      };
      const parsed = querystring.parse(self.paramStr);
      const params = self.params = R.merge(defaults, parsed);
      logger.silly('Params: ' + util.inspect(params));

      //const allowedPnames = R.keys(defaults);
      //const givenPnames = R.keys(parsed);
      //if (R.difference(givenPnames, allowedPnames).length > 0) {
      //  return self.badRequest('Unrecognized parameter name(s)');
      //}

      // validate all of the params
      const inFormat = params['in-format'];
      if (!R.contains(inFormat, inFormats)) {
        return self.badRequest('Invalid value for in-format');
      }

      const latexStyle = params['latex-style'];
      if (!R.contains(latexStyle, latexStyles)) {
        return self.badRequest('Invalid value for latex-style');
      }

      const width = parseInt(params.width);
      if (isNaN(width) || width <= 0) {
        return self.badRequest('Invalid value for width');
      }

      const q = params.q;
      if (!q || q.match(/^\s*$/)) {   // no source math
        return self.badRequest('No source math detected in input');
      }

      // Implement auto-detect.
      // We assume that any XML tag that has the name 'math',
      // regardless of whether or not it is in a namespace, is mathml.
      // Also look for the opening tag '<article', to determine whether or not this is
      // JATS.  If it's not JATS, and there are no MathML opening tags, then assume it
      // is LaTeX.
      const format = self.format = inFormat !== 'auto' ? inFormat
        : q.match(jatsStartTag) ? 'jats'
        : q.match(mmlStartTag) ? 'mml'
        : 'latex';
      logger.debug('Resolved format: %s', format);

      // FIXME: do we still need this?
      // PMC-29429 - filter processing instructions out of MML equations
      //query.q = q = q.replace(/<\?[^?]+?\?>/g, '');

      // Handle JATS files
      if (format === 'jats') {
        return self.handleJats();
      }

      // Handle math equations
      return self.handleEquation();
    }
    catch(err) {
      logger.error('Exception during process(): ' + err.stack);
      return self.badRequest('Sorry, I can\'t seem to decipher this request.');
    }
  }

  /**
   * Checks to see if this is a valid request for a static resource. If so,
   * it delivers the resource and returns true. Otherwise, it returns false.
   * The request must be GET, and not have a query string.
   * If a serious error occurs, this responds with an error page, and returns
   * true.
   */
  handleStatic() {
    if ( this.request.method !== 'GET' ) return false;

    /* || (this.paramStr &&
         typeof this.paramStr === 'string' && this.paramStr.length > 0))
    {
      return false;
    }*/

    const _path = this.urlObj.pathname || '/';
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
        if (err.code === 'ENOENT') {
          logger.info(`Static resource not found: ${realPath}`);
          this.respond(404, 'txt', '404 - File not found!');
        }
        else {
          // this shouldn't happen, I don't think; so log an error
          const msg = 'Error trying to retrieve a static resource';
          logger.error(`${msg}: "${realPath}": ${err}`);
          this.respond(400, 'txt', msg);
        }
        return true;
      }
    }

    const sfile = staticFiles[realPath];
    this.respond(200, sfile.extension, sfile.content);
    return true;
  }

  handleJats() {
    var jatsFormulas = parseJats(this.params.q);
    if (typeof jatsFormulas === "string") {
      return this.badRequest(jatsFormulas);
    }
    const content = clientTemplate.page(jatsFormulas, this.params.width);
    return this.respond(200, 'html', content);
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
    response.write(content);
    response.end();
    return null;
  }

  /**
   * Handle an equation - either MathML or TeX
   */
  handleEquation() {
    const self = this;
    const params = self.params;
    const format = self.format;

    // Get rid of processing instructions here
    const q = format !== 'mml' ? params.q :
      params.q.replace(/<\?.*?\?>/g, '');

    // Convert rendermath params to mathjax-node conventions
    const mjOpts = {
      math: q,
      format: (format === 'mml' ? 'MathML' : 'TeX'),
      svg: true,
    };
    logger.silly(`mjOpts: ${util.inspect(mjOpts)}`);

    // FIXME: need a timeout here; see test #12
    mjAPI.typeset(mjOpts, function(result) {
      try {
        logger.silly('MathJax result: ' + util.inspect(result));

        if (result.errors) {
          return self.badRequest('Conversion failed: ' + result.errors);
        }
        else if (result.svg) {
          return self.respond(200, 'svg', result.svg);
        }
        else if (result.mml) {
          return self.respond(200, 'mml', result.mml);
        }
        else if (result.png) {
          // slice(22) starts the encoding (from base64 to binary)
          // after the base64 header info; viz. "data:image/png;base64"
          return self.respond(200, 'png', new Buffer(result.png.slice(22), 'base64'));
        }
        else if (result.html) {
          return self.respond(200, 'html', result.html);
        }
        else {
          return self.respond(500, 'txt', 'Sorry, an unknown problem was encountered');
        }
      }
      catch(err) {
        logger.error('Caught exception trying to typeset: ' + err.stack);
        return self.respond(500, 'txt', 'Error trying to typeset the equation');
      }
    });
  }

  /**
   * Utility function for a "bad query" response.
   */
  badRequest(msg) {
    this.respond(400, 'txt', msg);
  }
}

module.exports = RequestHandler;
