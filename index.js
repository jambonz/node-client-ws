const assert = require('assert');
const {WebSocketServer} = require('ws');
const Client = require('./lib/client');
const Router = require('./lib/ws-router');
const handleProtocols = (protocols) => {
  if (!protocols.has('ws.jambonz.org')) return false;
  return 'ws.jambonz.org';
};
const parseurl = require('parseurl');

const createEndpoint = ({server, port, logger}) => {
  logger = logger || {info: () => {}, error: () => {}, debug: () => {}};
  assert.ok(typeof logger.info === 'function' &&
    typeof logger.error === 'function' &&
    typeof logger.debug === 'function',
  'logger must be an object with info, error, and debug methods');
  const router = new Router();
  const wss = new WebSocketServer({ noServer: true, handleProtocols });
  server.on('upgrade', (req, socket, head) => {
    const parsed = parseurl(req);
    const client = router.route(req);
    if (!client) {
      logger.debug(`No client found for path: ${parsed.path}`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      client.handle(ws, parsed.path);
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
