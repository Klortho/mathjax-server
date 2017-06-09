'use strict';
/**
 * This module is just a very thin wrapper around winston. It adds
 * a method reconfig(), to facilitate configuring it late. You can use it
 * before it's reconfigured; e.g.:
 *    const logger = require('./logger.js');
 *    logger.info('...');     //=> messages will just go to the console
 *    logger.reconfig(cfg);
 *    logger.error('...');    //=> will go to console and file.
 */

const cluster = require('cluster');
const winston = require('winston');

const logPrefix = () => {
  const txt = cluster.isMaster ? 'master' : `worker ${cluster.worker.id}`;
  return `[${txt}]`;
};


winston.reconfig = function(loggerCfg) {
  const winstonCfg = {
    transports: loggerCfg.transports.map(tcfg =>
      new winston.transports[tcfg.className](tcfg.config)),
    filters: [(level, msg, meta) => `${logPrefix()} ${msg}`]
  };
  winston.configure(winstonCfg);
};

module.exports = winston;
