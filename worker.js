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
  logger.info(`Worker ${cluster.worker.id} starting...`);
  process.on('message', start);
}

/**
 * The worker won't start until it gets its config
 */
function start(config) {
  logger.reconfig(config.logger);
  startMathJax(config.mjConfig);
  clientTemplate.initialize(config.mathjaxUrl);
  const server = new Server(config);
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
  start,
  startMathJax,
};
