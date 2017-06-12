"use strict";

const C1 = require('config-one');

function makeUrl(spec) {
  return spec.authority + spec.path + spec.filename;
}

// Default configuration
module.exports = {
  workers: 1,
  port: 16000,
  logLevel: 'debug',

  mathJax: {
    main: {
      authority: 'https://www.ncbi.nlm.nih.gov',
      version: '2.5',
      path: C1(X=> `/core/mathjax/${X.mathJax.main.version}/`),
      filename: 'MathJax.js',
      url: C1(X=> makeUrl(X.mathJax.main)),
    },
    configFile: {
      authority: '',
      path: '/lib/',
      scope: 'classic',
      version: '3.4.1',
      filename: C1(X=> {
        const self = X.mathJax.configFile;
        return `mathjax-config-${self.scope}.${self.version}.js`;
      }),
      url: C1(X=> makeUrl(X.mathJax.configFile)),
    },
    url: C1(X=> `${X.mathJax.main.url}?config=${X.mathJax.configFile.url}`),
  },

  logger: {
    transports: [
      { className: 'Console',
        config: {
          level: C1(X=> X.logLevel),
          colorize: true,
        },
      },
      { className: 'File',
        config: {
          level: C1(X=> X.logLevel),
          filename: 'rendermath3.log',
        },
      },
    ],
  },
};
