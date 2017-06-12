"use strict";

const C1 = require('config-one');
const cluster = require('cluster');
const os = require('os');
const program = require('commander');
const R = require('ramda');

const logger = require('./logger.js');
const RequestHandler = require('./request-handler.js');
const server = require('./server.js');
const VERSION = require('./package.json').version;
const master = require('./master.js');
const worker = require('./worker.js');

const numCPUs = os.cpus().length;


/**
 * If this was invoked from the command line, get the config, then invoke
 * the main() function for the master process or the worker processes.
 */
if (!module.parent) {
  if (cluster.isMaster) {
    // The config is only read once -- in the master process. The master sends
    // the config to each worker in a message.
    const config = getConfig();
    master.main(config);
  }
  else worker.main();
}

/**
 * Get user-config; merged from config-one files and command-line arguments
 */
function getConfig() {
  const defaults = C1();
  logger.reconfig(defaults.logger);
  const args = programArgs();
  const config = C1.extend(defaults, args, {version: VERSION});
  return config;
}

/**
 * Parse the command-line options.
 */
function programArgs() {
  program
    .option('-p, --port [num]',
      'IP port on which to start the server')
    .option(`--workers [${numCPUs}]`,
      'Spawn at most this many worker processes. Defaults to the number of CPUs',
      parseInt)
    .option('-l, --log-level [level]',
      'Set the log level to one of "silly", "debug", "verbose", "info", ' +
      '"warn", or "error".');
  program
    .parse(process.argv);
  console.log('program.workers: %d', program.workers);

  const props = ['port', 'workers', 'logLevel'];
  const args = R.pick(props, program);
  logger.debug('Command line arguments: %j', args);
  return args;
}

module.exports = {
  getConfig,
  programArgs,
}
