const C1 = require('config-one');
const cluster = require('cluster');
const os = require('os');
const program = require('commander');
const R = require('ramda');

const logger = require('./logger.js');

/*
const fs = require('fs-extra');
const minimatch = require('minimatch');
const querystring = require('querystring');
const url = require('url');
const util = require('util');
*/

const RequestHandler = require('./request-handler.js');
const server = require('./server.js');
const VERSION = require('./package.json').version;
const numCPUs = os.cpus().length;

const master = require('./master.js');
const worker = require('./worker.js');


// `logger` is just an alias, since we're using winston's default logger.
// Note that it's usable right away, but won't be properly configured until
// after the config and command-line arguments have been read in.
//const logger = winston;

if (cluster.isMaster) {
  const config = getConfig();
  master.main(config);
}
else {
  worker.main();
}


function getConfig() {
  const defaults = C1();
  const args = programArgs();
  const config = C1.extend(defaults, args, {version: VERSION});
  return config;
}

/**
 * Parse the command-line options. This is done only by the master process.
 * The args get merged with config, and passed to each worker as a message.
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
  //console.log('args: ', args);
  return args;
}
