/**
 * This module is designed to let you share a single multi-transport logger
 * among several modules. See http://stackoverflow.com/revisions/17737613/2.
 *
 * The main modules (master and each worker):
 *
 *     const logger = require('./logger.js');
 *     logger.setLevel(<level>);
 *
 * Other modules:
 *
 *     const logger = require('winston');
 */

const logger = require('winston');
const defaultLevel = 'info';

logger.configure({
  transports: [
    new (logger.transports.Console)({
      level: defaultLevel,
      colorize: true,
    }),
    new (logger.transports.File)({
      filename: 'server.log',
      level: defaultLevel,
    }),
  ],
});

logger.cli();

// Adding a custom method - this will be invoked from each new worker thread.
logger.setLevel = function(level) {
  this.transports.Console.level = level;
  this.transports.File.level = level;
};

module.exports = logger;
