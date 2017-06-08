'use strict';

const R = require('ramda');

/**
 * Utility functions for generating HTML
 */

/**
 * Serialize an object into an HTML attributes string
 */
const serialAttrs = attrs =>
  attrs ? Object.keys(attrs).map(name => `${xmlEscape(name)}='${xmlEscape(attrs[name])}'`)
        : '';

/**
 * Create an HTML element. Two calling signatures:
 *   1. htmlElem('tag', { attr: 'val', ...}, 'node', 'node', 'node', ...)
 *   2. htmlElem('tag', 'node', 'node', 'node', ...);
 */
const htmlElem = function(tag, ...args) {
  const hasAttrs = typeof args[0] === 'object';
  const attrStr = hasAttrs ? ' ' + serialAttrs(args[0]) : '';
  const content = args.slice(hasAttrs ? 1 : 0).join('');
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

/**
 * Returns a function that creates a specific HTML element
 */
const elem = tag => R.partial(htmlElem, [tag]);

// Some functions to create elements
const div = elem('div');
const tr = elem('tr');
const td = elem('td');

const xmlEscape = s =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/'/g, "&apos;")
   .replace(/"/g, "&quot;");

module.exports = {
  htmlElem,
  elem,
  div,
  tr,
  td,
  xmlEscape,
}
