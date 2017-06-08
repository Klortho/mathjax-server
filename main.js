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

if (cluster.isMaster) {
  const config = getConfig();
  master.main(config);
}
else {
  worker.main();
}

/**
 * Get user-config; merged from config-one files and command-line arguments
 */
function getConfig() {
  const defaults = C1();
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
      'Allow at most this many forks. Default is the number of processors in ' +
      `this machine.`)
    .option('-l, --log-level [level]',
      'Set the log level to one of "silly", "debug", "verbose", "info", ' +
      '"warn", or "error".')
    .parse(process.argv);

  const props = ['port', 'requests', 'workers', 'logLevel'];
  const args = R.pick(props, program);
  return args;
}
