"use strict";

const C1 = require('config-one');

// Default configuration
module.exports = {
  workers: 1,
  port: 16000,
  logLevel: 'debug',

  // The main MathJax library will have a URL like
  // https://www.ncbi.nlm.nih.gov/core/mathjax/2.5/MathJax.js
  mjLib: {
    base: 'https://www.ncbi.nlm.nih.gov/core/mathjax',
    version: '2.5',
  },
  mjLibUrl: C1(X=> {
    const d = X.mjLib;
    return `${d.base}/${d.version}/MathJax.js`;
  }),

  mjConfig: {
    base: 'https://www.ncbi.nlm.nih.gov/corehtml/pmc/js',
    scope: 'classic',
    version: '3.4.1',
  },
  mjConfigUrl: C1(X=> {
    const d = X.mjConfig;
    return `${d.base}/mathjax-config-${d.scope}.${d.version}.js`;
  }),

  mathjaxUrl: C1(X=> {
    const url = `${X.mjLibUrl}?config=${X.mjConfigUrl}`;
    return url;
  }),

  logger: {
    transports: [
      { className: "Console",
        config: {
          level: C1(X=> X.logLevel),
          colorize: true,
        },
      },
      { className: "File",
        config: {
          level: C1(X=> X.logLevel),
          filename: 'rendermath3.log',
        },
      },
    ],
  },
};
