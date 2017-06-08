/**
 * This module is just a very thin wrapper around winston. It adds
 * a method reconfig(), to facilitate configuring it late.
 */
"use strict";

const winston = require('winston');

winston.reconfig = function(logConfig) {
  if (logConfig.transports) {
    winston.configure({
      transports: logConfig.transports.map(
        tcfg => new winston.transports[tcfg.className](tcfg.config)
      ),
    });
  }
};

module.exports = winston;
