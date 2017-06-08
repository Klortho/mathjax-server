"use strict";

const cluster = require('cluster');
const os = require('os');
const R = require('ramda');

const logger = require('./logger.js');

/**
 * Main function for the master process.
 */
function main(config) {
  logger.reconfig(config.logger);
  logger.info(`This is PMC MathJax server, version ${config.version}`);
  logger.info(`Master (pid ${process.pid}) starting...`);

  spawnWorkers(config);

  cluster.on('disconnect', workerProcess => {
    logger.error(`Worker ${workerProcess.id} disconnected. Spawning another.`);
    this.spawnWorker();
  });
  cluster.on('exit', workerProcess => {
    logger.error(`Worker ${workerProcess.id} died.`);
  });
}

/**
 * Spawn the complete collection of worker processes on startup.
 */
function spawnWorkers(config) {
  const requested = config.workers;
  const numWorkers = Math.min(requested, os.cpus().length);
  logger.debug(`Spawning ${numWorkers} workers`);
  R.times(i => spawnWorker(config), numWorkers);
};

/**
 * Spawn a single worker process.
 */
function spawnWorker(config) {
  const workerProcess = cluster.fork();
  logger.debug(`Spawning worker id ${workerProcess.id}`);
  workerProcess.send(config);
  return workerProcess;
};

module.exports = {
  main
};
