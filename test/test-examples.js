"use strict";


const assert = require('assert');
const C1 = require('config-one');
const fs = require('fs');
const vows = require('vows');
const yaml = require('js-yaml');

const RenderMath3 = require('../index.js');


// Get document, or throw exception on error
try {
  var testDefs = yaml.safeLoad(fs.readFileSync('test/tests.yaml', 'utf8'));
  //console.log(testDefs);
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
      const mj = RenderMath3.startMathJax(defaults);
      const rm3 = new RenderMath3(defaults);
      rm3.createServer();
      return {
        mj: mj,
        rm3: rm3,
      };
    },
    'I am a vow': function(topic) {
      const rm3 = topic.rm3;
      assert(rm3.server);
      rm3.server.close();
    }
  },
});

suite.export(module);
