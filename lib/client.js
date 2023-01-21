const Emitter = require('events');
const assert = require('assert');
const Session = require('./session');

class Client extends Emitter {
  constructor(logger) {
    super();

    this.logger = logger;
  }

  handle(ws, req) {
    this.req = req;
    this._boundHandler = this._onMessage.bind(this, ws);
    ws.on('message', this._boundHandler);
  }

  _onMessage(ws, data, isBinary) {
    if (isBinary) {
      console.log('discarding incoming binary message');
      return;
    }
    try {
      const msg = JSON.parse(data);
      assert.ok(msg.type, 'missing type property');
      assert.ok(msg.msgid, 'missing msgid property');

      console.log({msg}, 'Received message from jambonz');
      switch (msg.type) {
        case 'session:new':
          this._onSessionNew(ws, msg);
          break;
        default:
          console.log(`Client: discarding msg type ${msg.type}`);
      }
    } catch (err) {
      console.log({err}, 'Error handling incoming message');
    }
  }

  _onSessionNew(ws, msg) {
    const logger = typeof this.logger.child === 'function' ?
      this.logger.child({call_sid: msg.call_sid}) :
      this.logger;
    const session = new Session({logger, ws, msg});
    /* Note: all further messaging after session:new will be handled by the session */
    ws.off('message', this._boundHandler);
    this.emit('session:new', session);
  }
}

module.exports = Client;
