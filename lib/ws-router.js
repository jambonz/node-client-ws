const assert = require('assert');
const parseurl = require('parseurl');
const Client = require('./client');
const debug = require('debug')('jambonz:node-client-ws');

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

    const matchingRoutes = this.routes.filter(({match}) => {
      /* wildcard */
      if ('*' === match) {
        debug(`matched wildcard route for path ${path}`);
        return true;
      }

      /* try matching by path */
      const urlChunks = path.split('/').filter((chunk) => chunk.length);
      const matchChunks = match.split('/').filter((chunk) => chunk.length);
      if (urlChunks.length >= matchChunks.length) {
        for (let idx = 0; idx < matchChunks.length; idx++) {
          if (urlChunks[idx] !== matchChunks[idx]) break;
          if (idx === matchChunks.length - 1) {
            req.url = urlChunks.slice(idx + 1).join('/') + '/' + (parsed.search || '');
            debug(`matched route for path ${path}`);
            return true;
          }
        }
      }
    });

    /* sort from longest match to shortest */
    const sortedMatches = matchingRoutes.sort((a, b) => {
      const aMatchChunks = a.match.split('/').filter((chunk) => chunk.length);
      const bMatchChunks = b.match.split('/').filter((chunk) => chunk.length);
      return bMatchChunks.length - aMatchChunks.length; // Descending order
    });

    const route = sortedMatches.length > 0 ? sortedMatches[0] : undefined;

    if (!route) {
      debug(`no matching route for path ${path}`);
      return false;
    }

    const {client} = route;
    return client;
  }
}

module.exports = WsRouter;
