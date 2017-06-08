"use strict";

const fs = require('fs');
const R = require('ramda');

const logger = require('./logger.js');
const htmlUtils = require('./html-utils.js');

const { htmlElem, elem, div, tr, td, xmlEscape } = htmlUtils;

/**
 * This holds the HTML template used for rendering JATS equations on the client.
 */
const _template = fs.readFileSync('client-template.html', 'utf-8');

var template;
function initialize(mathjaxUrl) {
  template = _template.replace('${mathjaxUrl}', mathjaxUrl);
}

/**
 * Return an HTML page with a table of equations, for rendering on the client.
 */
const page = (equations, width) => {
  const rows = equations.map(row(width)).join('\n');
  const sources = equations.map(source).join('\n');
  const resp_page = template
    .replace('${rows}', rows)
    .replace('${sources}', sources);

  return resp_page;
}

/**
 * Curried function that makes one row of the table for a given page.
 */
const row = R.curry((width, eq) => {
  const format = eq.format === 'mml' ? "MathML" : "LaTeX, " + eq.latex_style;

  // We'll populate each cell, initially, with an empty equation of the right type
  const empty =
            eq.format === 'mml' ? '<math />'
    : eq.latex_style === 'text' ? '\\(\\)'
                                : '\\[\\]';

  return tr(
    td(eq.id),
    td(format),
    td(
      div(
        { id: eq.id + '-div',
          style: width ? `width: ${width}px;` : '', },
        empty
      )
    )
  );
});

/**
 * Returns the source div for a single equation.
 */
const source = eq =>
  div(
    { 'data-rid': eq.id + '-div',
      'data-format': eq.format, },
    xmlEscape(eq.q)
  );



module.exports = {
  initialize,
  template,
  page,
  row,
  source,
};
