const cluster = require('cluster');
const domain = require('domain');
const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const minimatch = require("minimatch");
const mjAPI = require("mathjax-node");
const program = require('commander');
const querystring = require('querystring');
const R = require('ramda');
const url = require('url');
const util = require('util');
const winston = require('winston');

const parseJats = require('./parse-jats.js').parseJats;
const VERSION = require('./package.json').version;
const numCPUs = os.cpus().length;

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ level: 'info' }),
    new (winston.transports.File)({ filename: 'server.log', level: 'info' })
  ]
});
logger.cli();

// URL patterns of static files
const staticGlobs = [
  '/home.html',
  '/home.js',
  '/favicon.ico',
  '/examples/*',
  '/lib/*',
];

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

// Cache storage for static file contents (it is not much). For each static
// file, we store `contentType`, `encoding`, and `content`.
const staticFiles = {};

// Regular expressions used in determining the input format
const jatsStartTag = new RegExp('<article\\s+');
const mmlStartTag = new RegExp('<([A-Za-z_]+:)?math', 'm');

const setLogLevel = logLevel => {
  logger.transports.console.level = logLevel;
  logger.transports.file.level = logLevel;
};


/**
 * Instantiate the MathJax wrapper object.
 */
const startMathJax = function(opts) {
  logger.info('Starting MathJax processor');
/*
  mjAPI.config({
    MathJax: {
      SVG: {
        font: "STIX-Web"
      },
      tex2jax: {
        preview: ["[math]"],
        processEscapes: true,
        processClass: ['math'],
        skipTags: ["script","noscript","style","textarea","pre","code"]
      },
      TeX: {
        noUndefined: {disabled: true},
        Macros: {
        mbox: ['{\\text{#1}}',1],
        mb: ['{\\mathbf{#1}}',1],
        mc: ['{\\mathcal{#1}}',1],
        mi: ['{\\mathit{#1}}',1],
        mr: ['{\\mathrm{#1}}',1],
        ms: ['{\\mathsf{#1}}',1],
        mt: ['{\\mathtt{#1}}',1]
        }
      }
    }
  });
*/
  mjAPI.config({
    MathJax: {
      SVG: {
        font: 'STIX-Web',
      },
    },
    extensions: '',
  });

  mjAPI.start();
};


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
    this.request.on('end', () => this.processRequest());
  }

  /**
   * This is called back when the request is complete and ready to process
   */
  processRequest() {
    try {
      const rh = this;
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
      // FIXME: this should be `debug`:
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

      // FIXME: do we still need this?
      // PMC-29429 - filter processing instructions out of MML equations
      //query.q = q = q.replace(/<\?[^?]+?\?>/g, '');


      // FIXME: implement jats

      // Parse JATS files
      if (format === 'jats') {
        var jatsFormulas = parseJats(q);

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

      // FIXME: should be `debug`:
      logger.debug('mjOpts: ' + util.inspect(mjOpts));

      mjAPI.typeset(mjOpts, function(result) {
        try {
          // FIXME: this should be `debug`:
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
      // FIXME: this should be `debug`, but my setting the log level isn't propogating
      // to the subprocesses.
      logger.info('Exception during process(): ' + err.stack);
      return rh.badRequest('Sorry, I can\'t seem to decipher this request.');
    }

  }


  /**
   * Checks to see if this is a valid request for a static resource. If so,
   * it delivers the resource and returns true. Otherwise, it returns false.
   * The request must be GET, and not have a query string.
   */
  doStatic() {
    if (this.method !== 'GET' ||
        Object.keys(this.parsed).length > 0) return false;

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
        return this.badRequest('An error occurred trying to serve a static resource');
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
    response.write(content);
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


// FIXME: the domain feature is *deprecated*; this should be refactored.
const dispatchRequest = (request, response) => {
  var d = domain.create();
  d.on('error', function(err) {
    logger.error(err.stack);
    // See the node.js domain documentation for a descriptino of what the
    // following code does (https://nodejs.org/api/domain.html).
    try {
      var killtimer = setTimeout(function() {
        process.exit(1);
      }, 30000);
      killtimer.unref();
      server.close();
      cluster.worker.disconnect();
      response.statusCode = 500;
      response.setHeader('content-type', 'text/plain');
      response.end('An unknown error occurred, please try again.\n');
    }
    catch (err2) {
      logger.error('Error, sending 500.', err2.stack);
    }
  });
  d.add(request);
  d.add(response);
  d.run(function() {
    const handler = new RequestHandler(request, response);
    handler.go();
  });
  return null;
};


/**
 * Instantiates an HTTP server
 */
const createServer = function(opts) {
  logger.info('createServer: opts: ' + util.inspect(opts));
  if (opts.logLevel) setLogLevel(opts.logLevel);

  startMathJax(opts);

  const server = http.createServer(dispatchRequest);
  server.listen(opts.port, function() {
    logger.info('Server listening on port %s' , opts.port);
  });
  return server;
};

/**
 * Main entry point, when this is accessed from command line, for the master
 * process.
 */
const masterMain = function() {
  logger.debug(`Master (pid ${process.pid}) starting...`);
  const opts = MJS.parseOpts();

  const numWorkers = Math.min(opts.workers, numCPUs);
  logger.debug(`We will spawn ${numWorkers} worker(s).`);

  /**
   * Helper function for master, to spawn a new child worker.
   */
  const spawnWorker = function() {
    const worker = cluster.fork();
    logger.debug(`Spawning worker ${worker.id}`);
    worker.send(opts);
    return worker;
  };

  // Fork workers.
  R.range(0, numWorkers).map(spawnWorker);

  cluster.on('disconnect', worker => {
    logger.error(`Worker ${worker.id} disconnected.`);
    spawnWorker();
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker ${worker.id} died.`);
  });
};

/**
 * Main entry point for workers.
 */
const workerMain = function() {
  logger.info(`Worker ${cluster.worker.id} starting...`);
  process.on('message', createServer);
};


/**
 * Parse the command-line options. This is done only by the master process.
 */
const parseOpts = function() {
  program
    .version('0.9.0')
    .option('-p, --port [num]',
      'IP port on which to start the server [16000]', 16000)
    //.option('-r, --requests [num]',
    //  'Process this many requests and then exit. Default is to keep running ' +
    //  'forever [Infinity]', Infinity)
    .option(`--workers [${numCPUs}]`,
      'Allow at most this many forks. Default is the number of processors in ' +
      `this machine. [${numCPUs}]`, numCPUs)
    .option('-l, --log-level [level]',
      'Set the log level to one of "silly", "debug", "verbose", "info", ' +
      '"warn", or "error". [info]', 'info')
    .parse(process.argv);

  const props = ['port', 'requests', 'workers', 'logLevel'];
  if (program.logLevel) setLogLevel(program.logLevel);

  logger.info(`This is PMC MathJax server, version ${program.version()}`);
  props.forEach(prop => {
    logger.info(`  ${prop}: ${program[prop]}`);
  });
  return R.pick(props, program);
};


const MJS = module.exports = {
  masterMain,
  workerMain,
  parseOpts,
  startMathJax,
  createServer,
};


// If we were called from the command line 。。。
if (require.main === module) {
  cluster.isMaster ? masterMain() : workerMain();
}
