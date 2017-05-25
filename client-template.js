const fs = require('fs');
const logger = require('./logger.js');
const log = logger.log;


// This holds the client HTML file template. It's read in on startup, and saved
// for rendering jats documents' equations on the client. The exported object
// will either be `null` (if there was a problem reading the file) or else a
// string.

const templateFile = 'client-template.html';
const template = fs.readFileSync(templateFile, 'utf-8');

// Return an HTML page with a table of equations, for rendering on the client
function client_table(resp, query) {
  log.info(query.num + ": returning client template");
  var formulas = query.q;
  var width = query.width || null;

  // We have to do some munging of the mathjax_url to avoid the 15-second problem.
  // This is a nasty hack, but I can't think of a better solution. The problem is that
  // PMC mathjax config files must be invoked host-relative, because they have this line
  // at the end:
  //    MathJax.Ajax.loadComplete("/corehtml/pmc/js/mathjax-config-classic.3.4.1.js");
  // But, inside phantomjs, if you try to use host-relative URL for the mathjax config
  // file, it fails. So, we've configured our servers to start phantomjs using the
  // full URLs of the config file, including domain, like this:
  //    phantomjs main.js --mathjax=https://www.ncbi.nlm.nih.gov/core/mathjax/2.5/MathJax.js?\
  //        config=https://www.ncbi.nlm.nih.gov/corehtml/pmc/js/mathjax-config-classic.3.4.1.js
  // But that means that, when setting the script tag in the page returned to the client,
  // we have to strip out the schema and domain from the config file URL.
  var re = /(https?:\/\/([a-z]+)\.ncbi\.nlm\.nih\.gov[^?]*)\?config=https?:\/\/([a-z]+)\.ncbi\.nlm\.nih\.gov(.*)/;
  var m = mathjaxUrl.match(re);
  if (m && m[2] == m[3]) {
    mathjax_url = m[1] + "?config=" + m[4];
  }




  resp_page = client_template.replace("$mathjaxUrl", mathjaxUrl);

  var rows = '';
  formulas.forEach(function(f) {
      rows += make_row(f, width);
  });
  resp_page = resp_page.replace("<!-- rows -->", rows);

  var sources = '';
  formulas.forEach(function(f) {
      sources += make_source(f);
  });
  resp_page = resp_page.replace("<!-- sources -->", sources);


  //var resp_page = client_template.start + rows + client_template.end;
  resp.setHeader('Content-type', 'text/html; charset=utf-8');
  resp.write(resp_page);
  resp.close();
}

// Make one row of the table
function make_row(f, width) {
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

function make_source(f) {
  return "<div data-rid='" + f.id + "-div' data-format='" + f.format + "'>" +
         xml_escape(f.q) +
         "</div>\n";
}

function xml_escape(s) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/'/g, "&apos;")
          .replace(/"/g, "&quot;");
}
