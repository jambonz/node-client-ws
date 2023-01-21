const assert = require('assert');
const {WebSocketServer} = require('ws');
const Client = require('./lib/client');
const Router = require('./lib/ws-router');
const handleProtocols = (protocols) => {
  if (!protocols.has('ws.jambonz.org')) return false;
  return 'ws.jambonz.org';
};

const createEndpoint = ({server, port, logger}) => {
  logger = logger || {info: () => {}, error: () => {}, debug: () => {}};
  assert.ok(typeof logger.info === 'function' &&
    typeof logger.error === 'function' &&
    typeof logger.debug === 'function',
  'logger must be an object with info, error, and debug methods');
  const router = new Router();
  const wss = new WebSocketServer({ noServer: true, handleProtocols });
  server.on('upgrade', (req, socket, head) => {
    console.log('got upgrade request');
    const client = router.route(req);
    if (!client) {
      console.log('no client found');
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    console.log('found client');
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log('upgrade complete');
      client.handle(ws, req);
    });
  });
  if (port) server.listen(port);

  function makeService({path}) {
    const client = new Client(logger);
    router.use(path, client);
    return client;
  }

  return makeService;
};

module.exports = { createEndpoint };
