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
  process.on('message', config => {
    logger.reconfig(config.logger);
    logger.info(`Starting...`);
    start(config);
  });
}


/**
 * The worker doesn't start until it gets its config
 */
function start(config) {

  // FIXME: the config you see here and the mathjax-config-*.3.4.1.js should
  // both come from the same source.

  startMathJax({
    extensions: "TeX/noErrors, TeX/noUndefined, TeX/AMSmath, TeX/AMSsymbols",

    MathJax: {
      TeX: {
        Macros: {
          AA: "{\\unicode{x212B}}",
          emph: ["\\mathit{#1}", 1],
          P: "{¶}",

          // upgreek
          upalpha: "{\\unicode[times]{x03B1}}",
          upbeta: "{\\unicode[times]{x03B2}}",
          upgamma: "{\\unicode[times]{x03B3}}",
          updelta: "{\\unicode[times]{x03B4}}",
          upepsilon: "{\\unicode[times]{x03B5}}",
          upzeta: "{\\unicode[times]{x03B6}}",
          upeta: "{\\unicode[times]{x03B7}}",
          uptheta: "{\\unicode[times]{x03B8}}",
          upiota: "{\\unicode[times]{x03B9}}",
          upkappa: "{\\unicode[times]{x03BA}}",
          uplambda: "{\\unicode[times]{x03BB}}",
          upmu: "{\\unicode[times]{x03BC}}",
          upnu: "{\\unicode[times]{x03BD}}",
          upxi: "{\\unicode[times]{x03BE}}",
          uppi: "{\\unicode[times]{x03C0}}",
          uprho: "{\\unicode[times]{x03C1}}",
          upsigma: "{\\unicode[times]{x03C3}}",
          uptau: "{\\unicode[times]{x03C4}}",
          upupsilon: "{\\unicode[times]{x03C5}}",
          upphi: "{\\unicode[times]{x03C6}}",
          upchi: "{\\unicode[times]{x03C7}}",
          uppsi: "{\\unicode[times]{x03C8}}",
          upomega: "{\\unicode[times]{x03C9}}",
          upvarepsilon: "{ε}",
          upvartheta: "{θ}",
          upvarpi: "{π}",
          upvarrho: "{ρ}",
          upvarsigma: "{σ}",
          upvarphi: "{φ}",
          Upgamma: "{\\unicode[times]{x0393}}",
          Updelta: "{\\unicode[times]{x0394}}",
          Uptheta: "{\\unicode[times]{x0398}}",
          Uplambda: "{\\unicode[times]{x039B}}",
          Upxi: "{\\unicode[times]{x039E}}",
          Uppi: "{\\unicode[times]{x03A0}}",
          Upsigma: "{\\unicode[times]{x03A3}}",
          Upupsilon: "{\\unicode[times]{x03A5}}",
          Upphi: "{\\unicode[times]{x03A6}}",
          Uppsi: "{\\unicode[times]{x03A8}}",
          Upomega: "{\\unicode[times]{x03A9}}",

          // wasysym symbols
          permil: "{‰}"
        },
      },
    },
  });
  //  MathJax.ElementJax.mml.mbase.prototype.SVGlinebreakPenalty.nestfactor = 200;
  //  MathJax.ElementJax.mml.mbase.prototype.SVGlinebreakPenalty.toobig = 1200;

  clientTemplate.initialize(config.mathJax.url);
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
  startMathJax,
};
