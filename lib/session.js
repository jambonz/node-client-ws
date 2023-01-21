const Emitter = require('events');
const {validate, specs} = require('./utils');

class Session extends Emitter {
  constructor(ws, msg) {
    super();
    this.ws = ws;
    this.call_sid = msg.call_sid;
    this.b3 = msg.b3;
    this.msgid = msg.msgid;
    this._acked = false;
    this.payload = [];

    // eslint-disable-next-line no-unused-vars
    const {sip_status, sip_reason, call_status, ...rest} = msg.data;
    this.data = rest;

    for (const [key, value] of Object.entries(msg.data)) {
      this[key] = value;
    }


    ws.on('message', this._onMessage.bind(this));
    ws.on('close', this._onClose.bind(this));
  }

  send({execImmediate = true, reply = false} = {}) {
    const queueCommand = !execImmediate;
    const ack = reply || !this._acked ;
    const msg = {
      type: ack ? 'ack' : 'command',
      ...(ack && {msgid: this.msgid}),
      ...(!ack && {command: 'redirect', queueCommand}),
      ...(this.payload.length && {data: this.payload})
    };
    console.log({msg}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.log({err, msg}, 'Error sending command to jambonz');
    }
    this._acked = true;
    this.payload = [];
  }

  reply({execImmediate = true} = {}) {
    this.send({execImmediate, reply: true});
  }

  toJSON() {
    return {
      call_sid: this.call_sid,
      b3: this.b3,
      ...this.data
    };
  }

  _onClose(code, reason) {
    console.log({code, reason: reason.toString()}, 'Session: websocket closed');
    this.emit('close', code, reason);
  }

  _onMessage(data, isBinary) {
    if (isBinary) {
      console.log('discarding incoming binary message');
      return;
    }
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'verb:hook':
          console.log({msg}, 'Session: Received verb:hook message from jambonz');
          this.msgid = msg.msgid;
          if (this.listeners(msg.hook).length === 0) this.reply();
          else this.emit(msg.hook, msg.data);
          break;
        default:
          break;
      }
      console.log({msg}, 'Session: Received message from jambonz');
    } catch (err) {
      console.log({err}, 'Error handling incoming message');
    }
  }

  addVerb(verb, payload) {
    validate(verb, payload);
    this.payload.push({verb: verb.replace('_', ':'), ...payload});
    return this;
  }
}

/* add methods for all of the jambonz verbs */
for (const [verb] of specs) {
  Session.prototype[verb] = function(payload) {
    return Session.prototype.addVerb.call(this, verb, payload);
  };
}


module.exports = Session;
