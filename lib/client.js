const Emitter = require('events');
const assert = require('assert');
const Session = require('./session');
const debug = require('debug')('jambonz:node-client-ws');

class Client extends Emitter {
  constructor(logger) {
    super();

    this.logger = logger;
  }

  handle(ws, path) {
    this._boundHandler = this._onMessage.bind(this, ws, path);
    ws.on('message', this._boundHandler);
  }

  _onMessage(ws, path, data, isBinary) {
    if (isBinary) {
      this.logger.info('discarding incoming binary message');
      return;
    }
    try {
      const msg = JSON.parse(data);
      assert.ok(msg.type, 'missing type property');
      assert.ok(msg.msgid, 'missing msgid property');

      debug({msg}, 'Received message from jambonz');
      switch (msg.type) {
        case 'session:new':
        case 'session:adulting':
          this._onSessionEvent(ws, path, msg);
          break;
        case 'session:reconnect':
          this._onSessionEvent(ws, path, msg, 'session:reconnect');
          break;
        case 'session:redirect':
          this._onSessionRedirect(ws, path, msg);
          break;
        default:
          debug(`Client: discarding msg type ${msg.type}`);
      }
    } catch (err) {
      debug({err}, 'Error handling incoming message');
      throw err;
    }
  }

  _onSessionEvent(ws, path, msg, type = 'session:new') {
    const logger = typeof this.logger.child === 'function' ?
      this.logger.child({call_sid: msg.call_sid}) :
      this.logger;
    const session = new Session({logger, ws, msg});
    /* Note: all further messaging after session:new will be handled by the session */
    ws.off('message', this._boundHandler);
    this.emit(type, session, path, ws.req);
  }

  _onSessionRedirect(ws, path, msg) {
    const logger = typeof this.logger.child === 'function' ?
      this.logger.child({call_sid: msg.call_sid}) :
      this.logger;
    const session = new Session({logger, ws, msg});
    /* Note: all further messaging after session:new will be handled by the session */
    ws.off('message', this._boundHandler);
    session.reply();

    // Check if there are listeners for "session:redirect", otherwise emit "session:new"
    if (this.listenerCount('session:redirect') > 0) {
      this.emit('session:redirect', session, path, ws.req);
    } else {
      this.emit('session:new', session, path, ws.req);
    }
  }
}

module.exports = Client;
