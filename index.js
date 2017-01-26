const cluster = require('cluster');
const domain = require('domain');
const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const minimatch = require('minimatch');
const mjAPI = require("mathjax-node");
const program = require('commander');
const querystring = require('querystring');
const R = require('ramda');
const url = require('url');
const util = require('util');

const logger = require('./logger.js');
const RequestHandler = require('./request-handler.js');
const parseJats = require('./parse-jats.js').parseJats;
const VERSION = require('./package.json').version;
const numCPUs = os.cpus().length;

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


var server  = null;

// FIXME: the domain feature is *deprecated*; this should be refactored.
const dispatchRequest = (request, response) => {
  var d = domain.create();
  d.on('error', function(err) {
    logger.error(err.stack);
    // See the node.js domain documentation for a description of what the
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
  if (opts.logLevel) logger.setLevel(opts.logLevel);

  startMathJax(opts);

  server = http.createServer(dispatchRequest);
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
  if (program.logLevel) logger.setLevel(program.logLevel);

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
