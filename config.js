const C1 = require('config-one');

// Default configuration

module.exports = {
  workers: 1,
  port: 16000,
  logLevel: 'debug',

  mathjax: {
    SVG: {
      font: 'STIX-Web',
    },
  },

  _mathjaxConfigFilename: {
    // The main MathJax library will have a URL like
    // https://www.ncbi.nlm.nih.gov/core/mathjax/2.5/MathJax.js
    lib: {
      base: 'https://www.ncbi.nlm.nih.gov/core/mathjax',
      version: '2.6.1',
      url: C1(X=> {
        const me = X._mathjaxConfigFilename.lib;
        return `${me.base}/${me.version}/MathJax.js`;
      }),
    },

    // The config script URL is something like
    // /corehtml/pmc/js/mathjax-config-classic.3.4.js
    config: {
      base: '/corehtml/pmc/js',
      scope: 'classic',
      version: '3.4',
      url: C1(X=> {
        const me = X._mathjaxConfigFilename.config;
        return `${me.base}/mathjax-config-${me.scope}.${me.version}.js`;
      }),
    },
  },

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
