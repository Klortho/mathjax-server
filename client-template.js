"use strict";

const fs = require('fs');
const logger = require('winston');
const log = logger.log;


// This holds the client HTML file template. It's read in on startup, and saved
// for rendering jats documents' equations on the client. The exported object
// will either be `null` (if there was a problem reading the file) or else a
// string.

function initialize(mathjaxUrl) {
  const _template = fs.readFileSync('client-template.html', 'utf-8');
  self.template = _template.replace("$mathjaxUrl", mathjaxUrl);
}

// Return an HTML page with a table of equations, for rendering on the client
function clientTable(formulas, width) {
  //log.info(query.num + ": returning client template");
  //var formulas = query.q;
  //var width = query.width || null;
  var resp_page = self.template;

  var rows = '';
  formulas.forEach(function(f) {
      rows += makeRow(f, width);
  });
  resp_page = resp_page.replace("<!-- rows -->", rows);

  var sources = '';
  formulas.forEach(function(f) {
      sources += makeSource(f);
  });
  resp_page = resp_page.replace("<!-- sources -->", sources);

  return resp_page;
  //var resp_page = client_template.start + rows + client_template.end;
  //resp.setHeader('Content-type', 'text/html; charset=utf-8');
  //resp.write(resp_page);
  //resp.close();
}

// Make one row of the table
function makeRow(f, width) {
  var format = f.format == 'mml' ? "MathML" : "LaTeX, " + f.latex_style;

  var formula = f.format == 'mml' ? '<math />' :
                f.latex_style == 'text' ? '\\(\\)'
                                        : '\\[\\]';

  var formula_cell = width ?
      "<div id='" + f.id + "-div' style='width: " + width + "px;'>" + formula + "</div>" :
      "<div id='" + f.id + "-div'>" + formula + "</div>";

  return "<tr>\n" +
         "  <td>" + f.id + "</td>\n" +
         "  <td>" + format + "</td>\n" +
         "  <td>" + formula_cell + "</td>\n" +
         "</tr>\n";
}

function makeSource(f) {
  return "<div data-rid='" + f.id + "-div' data-format='" + f.format + "'>" +
         xmlEscape(f.q) +
         "</div>\n";
}

function xmlEscape(s) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/'/g, "&apos;")
          .replace(/"/g, "&quot;");
}

const self = module.exports = {
  initialize: initialize,
  template: null,
  clientTable: clientTable,
  makeRow: makeRow,
  makeSource: makeSource,
  xmlEscape: xmlEscape,
}
