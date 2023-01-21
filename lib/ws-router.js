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
      const urlChunks = path.split('/').filter((c) => c.length);
      const matchChunks = match.split('/').filter((c) => c.length);
      if (urlChunks.length >= matchChunks.length) {
        let idx = 0;
        do {
          if (urlChunks[idx] !== matchChunks[idx]) break;
          idx++;
        } while (idx < matchChunks.length);
        if (idx > 0) {
          req.url = urlChunks.slice(idx).join('/') + '/' + (parsed.search || '');
          return true;
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
