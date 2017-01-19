// home.js
// This runs on the app's home page.

(function($) {

  // Sets the form's method to either 'GET' or 'POST', depending on the value of
  // the form's "method" control
  function setMethod() {
    $('#form').attr('method', $('#method').val());
  }

  // Handle any changes to the in-format select option.
  // Set the latex-style to enabled or disabled, according to the
  // currently selected value of math format
  function inFormatHandler() {
    var val = $('#math-in-format-select').val();
    if (val == 'mml' || val == 'jats') {
      $('#latex-style-select').attr('disabled', 'disabled');
      $('#latex-style-label').attr('class', 'disabled');
    }
    else {
      $('#latex-style-select').removeAttr('disabled');
      $('#latex-style-label').attr('class', '');
    }
  }

  // Handler for the user clicking on an example link
  const exampleLinkHandler = function(evt) {
    const url = $(this).attr('href');
    fetch(url)
    .then(response => {
      if (response.status !== 200)
        return Promise.reject('Reading example file failed.');
      else
        return response.text();
    })
    .then(text => {
      $('#q').val(text);
      return null;
    })
    .catch(err => alert('Sorry, there was a problem: ' + err));
    return false;
  };

  // Populate the example list
  function makeExampleList() {
    fetch('examples/examples.yaml')
    .then(response => response.text())
    .then(content => {

      const entries = jsyaml.load(content);
      $('#examples-div ul').append(
        entries.filter(entry => entry.example)
        .map(ex =>
          `<li><a href='examples/${ex.filename}'>${ex.description}</a></li>`)
      );

      $('#examples-div a').on("click", exampleLinkHandler);
    });
  }

  $(document).ready(function() {
    // Check that browser supports the File API
    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
      alert('Your browser doesn\'t seem to support the HTML File API, so you won\'t be able ' +
            'to upload files.');
    }

    // Event handlers
    $('#method').on('change', setMethod);
    $('#math-in-format-select').on('change', inFormatHandler);
    $('#file').on('change', function(evt) {
      var file = evt.target.files[0];
      var reader = new FileReader();
      reader.onload = function(evt) {
        $('#q').val(evt.target.result);
      };
      reader.readAsText(file);
    });
    //$('#out-format-select').on('change', out_format_handler);

    // Page initialization
    setMethod();
    inFormatHandler();
    makeExampleList();
  });

})(jQuery);
