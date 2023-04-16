const assert = require('assert');
const parseurl = require('parseurl');
const Client = require('./client');

class WsRouter {
  constructor() {
    this.routes = [];
  }

  use(match, client) {
    if (!client) {
      client = match;
      match = '*';
    }
    assert(client instanceof Client);
    this.routes.push({match, client});
  }

  route(req) {
    const parsed = parseurl(req);
    const path = parsed.pathname;

    const route = this.routes.find(({match}) => {
      /* wildcard */
      if ('*' === match) return true;

      /* try matching by path */
      const urlChunks = path.split('/').filter((chunk) => chunk.length);
      const matchChunks = match.split('/').filter((chunk) => chunk.length);
      if (urlChunks.length >= matchChunks.length) {
        for (let idx = 0; idx < matchChunks.length; idx++) {
          if (urlChunks[idx] !== matchChunks[idx]) break;
          if (idx === matchChunks.length - 1) {
            req.url = urlChunks.slice(idx + 1).join('/') + '/' + (parsed.search || '');
            return true;
          }
        }
      }
    });

    if (!route) {
      return false;
    }

    const {client} = route;
    return client;
  }
}

module.exports = WsRouter;
