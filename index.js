const cluster = require('cluster');
const domain = require('domain');
const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const mjAPI = require("mathjax-node");
const program = require('commander');
const R = require('ramda');
const winston = require('winston');

const VERSION = require('./package.json').version;
const numCPUs = os.cpus().length;

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({}),
    new (winston.transports.File)({ filename: 'somefile.log' })
  ]
});
logger.cli();

// storage for static file contents (it is not much)
var testForm;
const staticFiles = {};

const contentTypes = {
  'js': 'application/javascript; charset=utf-8',
  'html': 'text/html; charset=utf-8',
  'svg': 'image/svg+xml; charset=utf-8',
  'latex': 'application/x-tex; charset=utf-8',
  'mml': 'application/mathml+xml; charset=utf-8',
  'nxml': 'application/jats+xml; charset=utf-8'
};

var requestNum = 0;


/**
 * Instantiate the MathJax wrapper object.
 */
const startMathJax = function(opts) {
  logger.info('Starting MathJax processor');
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

  mjAPI.start();
  return mjAPI;
};







/**
 * This is invoked to handle each request.
 */
const handleRequest = (mjAPI, request, response) => {

  // Helper functions for responses
  const respond = (status, type, content) => {
    response.writeHead(200, {'Content-Type': contentTypes[type]});
    response.write(content);
    return response.end();
  };
  const badRequest = msg => respond(400, 'text/plain', msg);

  var str_params = '';
  request.on('data', function(chunk) {str_params += chunk;});
  request.on('end', function() {

    // Defaults for query-string param values:
    var query = {
      num: requestNum++,
      inFormat: 'auto',
      width: null
    };
    if (request.method === 'POST')
      logger.debug('request.postRaw: ', request.postRaw);
    else
      logger.debug('request.url: ', request.url);



      var qs;   // query string, or x-www-form-urlencoded post data
      if (request.method == 'GET') {
        var url = request.url;

        // Implement the test form
        if (url == '' || url == '/') {
          return respond(200, 'html', testForm);
        }

        // Static pages must start with '/examples/' or '/resources/'
        if (url.startsWith('/examples/') || url.startsWith('/resources/')) {
          var pathname = url.substr(1);
          staticFiles[pathname] = fs.readFileSync(pathname, 'utf8');
          const extension = pathname.replace(/.*\.(.*)/, "$1");
          var type = contentTypes[extension] || 'text/plain; charset=utf-8';
          return respond(200, type, staticFiles[pathname]);
        }

        var iq = url.indexOf('?');
        if (iq == -1) {  // no query string
          return badRequest('Missing query string');
        }

        qs = url.substr(iq + 1);
      }


      else if (request.method == 'POST') {
        if (typeof request.postRaw !== 'string') {   // which can happen
          return badRequest('Missing POST content');
        }
        qs = request.postRaw;
      }

      else {  // method is not GET or POST
        return badRequest('Method not supported');
      }

      var param_strings = qs.split(/&/);
      var num_param_strings = param_strings.length;
      if (num_param_strings == 1 && param_strings[0] == '') {
        num_param_strings = 0;
      }

      for (var i = 0; i < num_param_strings; ++i) {
        var ps = param_strings[i];
        var ie = ps.indexOf('=');
        if (ie == -1) {
          return badRequest("Can't decipher request parameter");
        }
        var key = ps.substr(0, ie);
        try {
          var val = decodeURIComponent(ps.substr(ie+1).replace(/\+/g, ' '));
        }
        catch (e) {
          return badRequest('Request data not properly URI-encoded');
        }
        if (key == 'in-format') {
          if (val != 'auto' && val != 'mml' && val != 'latex' && val != 'jats') {
            return badRequest('Invalid value for in-format');
          }
          query.in_format = val;
        }
        else if (key == 'q') {
          query.q = val;
        }
        else if (key == 'width') {
          // empty string means that no max width was specified
          if (val != '') {
            var w = parseInt(val);
            if (isNaN(w) || w <= 0) {
              return badRequest('Invalid value for width');
            }
            query.width = w;
          }
        }
        else if (key == 'file') { // file name, discard
        }
        else if (key == 'latex-style') {
          if (val != "text" && val != "display") {
            return badRequest('Invalid value for latex-style');
          }
          query.latex_style = val;
        }
        else {
          return badRequest('Unrecognized parameter name');
        }
      }

      if (!query.q || query.q.match(/^\s*$/)) {   // no source math
        return badRequest('No source math detected in input');
      }


/*
      // Implement auto-detect.
      var q = query.q;
      if (query.in_format == 'auto') {
        // We assume that any XML tag that has the name 'math',
        // regardless of whether or not it is in a namespace, is mathml.
        // Also look for the opening tag '<article', to determine whether or not this is
        // JATS.  If it's not JATS, and there are no MathML opening tags, then assume it
        // is LaTeX.
        var jats_stag = new RegExp('<article\\s+');
        var mml_stag = new RegExp('<([A-Za-z_]+:)?math', 'm');
        query.in_format = q.match(jats_stag) ? 'jats' :
                          q.match(mml_stag) ? 'mml' : 'latex';

        // PMC-29429 - filter processing instructions out of MML equations
        query.q = q = q.replace(/<\?[^?]+?\?>/g, '');
        //console.log('Final equation is: ', q);
*/

    console.log('query: ', query);
    const params = {
      math: 'n^2',
      format: 'TeX',
      svg: true,
    }

  /*
    var params = JSON.parse(str_params);
  */
    mjAPI.typeset(params, function(result) {
      if (result.errors) {
        return badRequest('Conversion failed: ' + String(result.errors));
      }

      else {
        if (params.svg) {
          console.log('>>>>>>>>>> svg: ', result.svg);
          return respond(200, 'svg', result.svg);
        }

        if (params.mml) {
          return respond(200, 'mml', result.mml);
        }

        if (params.png) {
          // The reason for slice(22) to start encoding (from str to binary)
          // after base64 header info--data:image/png;base64,
          const content = new Buffer(result.png.slice(22), 'base64');
          return respond(200, 'png', content);
        }
      }
    });

  });
};


const requestHandler = mjAPI => (request, response) => {
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
    handleRequest(mjAPI, request, response);
  });
  return null;
};


/**
 * Instantiates an HTTP server
 */
const createServer = function(opts) {
  const mjAPI = startMathJax(opts);

  const server = http.createServer(requestHandler(mjAPI));
  server.listen(opts.port, function() {
    logger.info('Server listening on port %s' , opts.port);
  });
  return server;

/*
  var server = http.createServer(function (request, response) {
    var d = domain.create();
    d.on('error', function(err) {
      logger.error(err.stack);
      try {
        var killtimer = setTimeout(function() {
          process.exit(1);
        }, 30000);
        killtimer.unref();
        server.close();
        cluster.worker.disconnect();
        response.statusCode = 500;
        response.setHeader('content-type', 'text/plain');
        response.end('problem!\n');
      }
      catch (err2) {
        logger.error('Error, sending 500.', err2.stack);
      }
    });
    d.add(request);
    d.add(response);
    d.run(function() {
      handleRequest(mjAPI, request, response);
    });
  });
  server.listen(opts.port, function() {
    logger.info('Server listening on port %s' , opts.port);
  });
  return server;
*/
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
    //spawnWorker();
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker ${worker.id} died.`);
  });
};


/**
 * Main entry point for workers.
 */
const workerMain = function() {
  logger.debug(`Worker ${cluster.worker.id} starting...`);

  // Initialize some global data
  testForm = fs.readFileSync('test-form.html', 'utf8')
    .replace("<!-- version -->", VERSION);

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
    .option('-r, --requests [num]',
      'Process this many requests and then exit. Default is to keep running ' +
      'forever [Infinity]', Infinity)
    .option(`--workers [${numCPUs}]`,
      'Allow at most this many forks. Default is the number of processors in ' +
      `this machine. [${numCPUs}]`, numCPUs)
    .option('-l, --log-level [level]',
      'Set the log level to one of "silly", "debug", "verbose", "info", ' +
      '"warn", or "error". [info]', 'info')
    .parse(process.argv);

  const props = ['port', 'requests', 'workers', 'logLevel'];
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
  handleRequest,
  createServer,
};


// If we were called from the command line 。。。
if (require.main === module) {
  cluster.isMaster ? masterMain() : workerMain();
}
