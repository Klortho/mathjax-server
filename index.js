const cluster = require('cluster');
const C1 = require('config-one');
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
const winston = require('winston');

const clientTemplate = require('./client-template.js');
const RequestHandler = require('./request-handler.js');
const VERSION = require('./package.json').version;
const numCPUs = os.cpus().length;

// `logger` is just an alias, since we're using winston's default logger.
// Note that it's usable right away, but won't be properly configured until
// after the config and command-line arguments have been read in.
const logger = winston;

// FIXME: temporary for debugging
winston.default.transports.console.level = 'debug';


process.on('uncaughtException', function(err) {
  // the function callback here ensures that all the logs are flushed
  logger.error('Unexpected fatal exception!\n', err,
    function(err, level, msg, meta) {
      logger.error('bye');
      process.exit(1);
    }
  );
});

///////////////////////////////////////////////////////

class RenderMath3 {
  constructor() {
    this.isMaster = cluster.isMaster;
  }

  main() {
    if (this.isMaster) this.masterMain();
    else this.workerMain();
  }

  /**
   * Main entry point, when this is accessed from command line, for the master
   * process.
   */
  masterMain() {

    const args = this.parseArgs();
    const defaults = C1();
    this.config = C1.extend(defaults, args);

    this.configureLogger();
    logger.info(`This is PMC MathJax server, version ${program.version()}`);
    logger.info(`Master (pid ${process.pid}) starting...`);
    logger.debug('Command line args: ', args);
    logger.debug('Config: ' + C1.ppString(this.config));

    this.spawnWorkers();

    cluster.on('disconnect', worker => {
      logger.error(`Worker ${worker.id} disconnected. Spawning another.`);
      this.spawnWorker();
    });
    cluster.on('exit', worker => {
      logger.error(`Worker ${worker.id} died.`);
    });
  }

  workerMain() {
    logger.info(`Worker ${cluster.worker.id} starting...`);
    process.on('message', cfg => {
      this.config = cfg;
      clientTemplate.initialize(cfg.mathjaxUrl);
      this.configureLogger();
      this.startMathJax();
      this.createServer()
    });
  }

  /**
   * Parse the command-line options. This is done only by the master process.
   * The args get merged with config, and passed to each worker as a message.
   */
  parseArgs() {
    program
      .version('0.9.0')
      .option('-p, --port [num]',
        'IP port on which to start the server')
      .option(`--workers [${numCPUs}]`,
        'Allow at most this many forks. Default is the number of processors in ' +
        `this machine.`)
      .option('-l, --log-level [level]',
        'Set the log level to one of "silly", "debug", "verbose", "info", ' +
        '"warn", or "error".')
      .parse(process.argv);

    const props = ['port', 'requests', 'workers', 'logLevel'];

    const args = R.pick(props, program);
    logger.log('silly', `args: ${args}`);
    return args;
  };

  /**
   * Configures Winston's default logger.
   */
  configureLogger() {
    winston.configure({
      transports: this.config.logger.transports.map(tcfg =>
        new winston.transports[tcfg.className](tcfg.config)
      ),
    });
  }

  spawnWorker() {
    if (!this.isMaster) return;
    const worker = cluster.fork();
    logger.debug(`Spawning worker ${worker.id}`);
    worker.send(this.config);
    return worker;
  }

  spawnWorkers() {
    if (!this.isMaster) return;
    const reqWorkers = this.config.workers;
    const numWorkers = Math.min(reqWorkers, numCPUs);
    logger.debug(`We will spawn ${numWorkers} worker(s).`);
    if (numWorkers != reqWorkers) {
      logger.info(`You requested ${reqWorkers} workers, but only ` +
        `${numWorkers} will be spawned, because of the number of available ` +
        `CPUs.`);
    }
    // Fork workers.
    R.range(0, numWorkers).forEach(i => this.spawnWorker());
  }

  /**
   * Instantiate the MathJax wrapper object.
   */
  startMathJax() {
    logger.info('Starting MathJax processor');
    logger.log('silly', 'this.config: ', this.config);
    mjAPI.config(this.config.mjConfigUrl);
    mjAPI.start();
  }

  /**
   * Instantiates an HTTP server
   */
  createServer() {
    this.server = http.createServer((req, resp) => this.dispatchRequest(req, resp));
    const port = this.config.port;
    this.server.listen(port, function() {
      logger.info('Server listening on port %s' , port);
    });
  };

  // Note that the domain feature is *pending deprecation*, which means there's
  // nothing to do here yet.
  dispatchRequest(request, response) {
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
        this.server.close();
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
  }
}

///////////////////////////////////////////////////////
if (require.main === module) {
  const rm3 = new RenderMath3();
  rm3.main();
}
