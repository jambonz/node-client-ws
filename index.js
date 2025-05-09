const http = require('http');
const assert = require('assert');
const { WebSocketServer } = require('ws');
const Client = require('./lib/client');
const Router = require('./lib/ws-router');
const parseurl = require('parseurl');
const { validateAppConfig, getAppConfig, mergeEnvVarsWithDefaults } = require('./lib/utils/validator');

assert.ok(typeof validateAppConfig === 'function', 'validateAppConfig must be a function');
console.log('validateAppConfig is a function');
const handleProtocols = (protocols) => (protocols.has('ws.jambonz.org') ? 'ws.jambonz.org' : false);

const createEndpoint = ({
  server,
  port,
  logger,
  middlewares = [],
  externalWss = []
}) => {
  logger = logger || { info: () => {}, error: () => {}, debug: () => {} };
  assert.ok(
    typeof logger.info === 'function' &&
    typeof logger.error === 'function' &&
    typeof logger.debug === 'function',
    'logger must be an object with info, error, and debug methods'
  );

  /* support for paths that are handled by external code; i.e. mutliple servers sharing single http server */
  const mapOfExternalWss = new Map();
  if (externalWss.length > 0) {
    assert.ok(
      Array.isArray(externalWss) &&
      externalWss.every((s) => {
        return typeof s.path === 'string' &&
        s.wss && typeof s.wss.handleUpgrade == 'function' && typeof s.wss.emit == 'function';
      }),
      'externalWss must be an array of objects with path (string) and wss (WebSocketServer) properties'
    );
  }
  for (const s of externalWss) {
    mapOfExternalWss.set(s.path, s.wss);
  }

  const router = new Router();
  const wss = new WebSocketServer({ noServer: true, handleProtocols });

  const applyMiddlewares = async(req, res, middlewares) => {
    for (let i = 0; i < middlewares.length; i++) {
      await new Promise((resolve, reject) => {
        const next = (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        };
        try {
          const result = middlewares[i](req, res, next);
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });
    }
  };

  /* Middleware to check if a service has been installed for this path */
  const validateRoute = (req, res, next) => {
    const parsed = parseurl(req);
    const client = router.route(req);
    if (!client) {
      logger.debug(`No client found for path: ${parsed.pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    req.client = client;
    next();
  };

  server.on('upgrade', async(req, socket, head) => {
    const parsed = parseurl(req);

    /* check if this is a path we are delegating to an external wss */
    if (mapOfExternalWss.has(parsed.pathname)) {
      logger.debug(`delegating to external wss for path: ${parsed.pathname}`);
      const wssExt = mapOfExternalWss.get(parsed.pathname);
      wssExt.handleUpgrade(req, socket, head, (ws) => {
        wssExt.emit('connection', ws, req);
      });
      return;
    }

    const res = new http.ServerResponse(req);
    res.assignSocket(socket);

    req.locals = req.locals || {};
    req.locals.logger = logger;
    await applyMiddlewares(req, res, [...middlewares, validateRoute]);
    const client = req.client;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.req = req; // attach the request to the websocket in case middleware attached data
      client.handle(ws, parsed.pathname);
    });
  });

  if (port) server.listen(port);

  function makeService({ path }) {
    const client = new Client(logger, path);
    router.use(path, client);
    return client;
  }

  return makeService;
};

module.exports = { createEndpoint, validateAppConfig, getAppConfig, mergeEnvVarsWithDefaults };
