const domain = require('domain');
const http = require('http');

const logger = require('./logger.js');
const RequestHandler = require('./request-handler.js');

var server = null;

class Server {

  /**
   * Instantiates an HTTP server
   */
  constructor(config) {
    this.config = config;
    this.server = http.createServer((req, res) => this.dispatchRequest(req, res));
    const port = config.port;
    this.server.listen(port, () => logger.info(`Server listening on port ${port}`));
  }

  dispatchRequest(request, response) {
    var d = domain.create();

    // See the node.js domain documentation for a description of what the
    // following code does (https://nodejs.org/api/domain.html).
    d.on('error', function(err) {
      try {
        logger.error(`Error encountered in worker ${cluster.worker.id}`);
        logger.error(err.stack);

        // Make sure this process shuts down within 30 seconds
        var killtimer = setTimeout(function() {
          process.exit(1);
        }, 30000);
        // But don't keep the process open just for that
        killtimer.unref();

        // Stop taking new requests
        server.close();

        // Let the master know we've died
        cluster.worker.disconnect();

        // Try to send an error response to the client
        response.statusCode = 500;
        response.setHeader('content-type', 'text/plain');
        response.end('An unknown error occurred, please try again.\n');
      }
      catch (err2) {
        // Not much we can do here
        logger.error('Error, sending 500.', err2.stack);
      }
    });

    // Add request and response to this domain
    d.add(request);
    d.add(response);
    d.run(() => (new RequestHandler(request, response)).go());
    return null;
  }
}

module.exports = Server;
