"use scrict";

const cluster = require('cluster');
const mjAPI = require("mathjax-node");

const clientTemplate = require('./client-template.js');
const logger = require('./logger.js');
const Server = require('./server.js');


/**
 * Main function for a worker process
 */
function main() {
  process.on('message', start);

  /**
   * The worker doesn't start until it gets its config
   */
  function start(config) {
    logger.reconfig(config.logger);
    logger.info(`Starting...`);

    // FIXME: need to read in the config file and insert it here
    startMathJax({});
    clientTemplate.initialize(config.mathJax.url);
    const server = new Server(config);
  }
}

/**
 * Configure the MathJax interface, and start it. Like the logger, this is a
 * singleton.
 */
function startMathJax(mjCfg) {
  logger.info('Starting MathJax processor');
  logger.silly('MathJax config: ', mjCfg);
  mjAPI.config(mjCfg);
  mjAPI.start();
};


module.exports = {
  main,
  startMathJax,
};
