"use strict";

const assert = require('assert');
const C1 = require('config-one');
const fs = require('fs');
const vows = require('vows');
const util = require('util');
const yaml = require('js-yaml');

// FIXME: tests are not done

// Get the test definitions
try {
  var testDefs = yaml.safeLoad(fs.readFileSync('test/tests.yaml', 'utf8'));
} catch (e) {
  console.error(e);
}

const suite = vows.describe('views');
const defaults = {
  port: 8888,
  mathjaxUrl: 'https://www.ncbi.nlm.nih.gov/core/mathjax/2.5/MathJax.js'
};

suite.addBatch({
  'Context': {
    topic: function() {
      const rm3 = require('../main.js');
      return rm3;
    },
    'I am a vow': function(rm3) {
      //assert(cfg);
      assert(rm3);
      const config = rm3.getConfig();
      //console.log('config: ' + util.inspect(C1.freeze(config), {depth: null}));
    }
  },
});

suite.export(module);
