/**
 * This module lets you share a single multi-transport logger
 * among several modules. See http://stackoverflow.com/revisions/17737613/2.
 *
 * Usage:
 *
 *     const logger = require('./logger.js');
 *     logger.setLevel(<level>);
 *     const log = logger.log;
 *     log.debug('time waits for no man');
 */

const winston = require('winston');
const defaultLevel = 'info';

winston.configure({
  transports: [
    new (winston.transports.Console)({
      level: defaultLevel,
      colorize: true,
    }),
    new (winston.transports.File)({
      level: defaultLevel,
      filename: 'rendermath3.log',
    }),
  ],
});

// Adding a custom method - this will be invoked from each new worker thread.
const setLevel = function(level) {
  winston.default.transports.console.level = level;
  winston.default.transports.file.level = level;
};

module.exports = {
  log: winston,       // for the .log() methods
  winston: winston,   // an alias, for convenience
  setLevel: setLevel,
};
