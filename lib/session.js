const Emitter = require('events');
const {validateInjectCommand} = require('./utils/validate-inject-command');
const {validateVerb, specs} = require('@jambonz/verb-specifications');
const _specs = new Map(Object.entries(specs));
const debug = require('debug')('jambonz:node-client-ws');

class Session extends Emitter {
  constructor({logger, ws, msg}) {
    super();
    this.logger = logger;
    this.ws = ws;
    this.call_sid = msg.call_sid;
    this.b3 = msg.b3;
    this.msgid = msg.msgid;
    this._acked = false;
    this.payload = [];
    this.locals = {};

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
    debug({msg}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.info({err, msg}, 'Error sending command to jambonz');
    }
    this._acked = true;
    this.payload = [];
  }

  sendToolOutput(tool_call_id, data) {
    const msg = {
      type: 'command',
      command: 'llm:tool-output',
      queueCommand: false,
      tool_call_id,
      data
    };
    debug({msg}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.info({err, msg}, 'Error sending command to jambonz');
    }
  }

  updateLlm(data) {
    const msg = {
      type: 'command',
      command: 'llm:update',
      queueCommand: false,
      data
    };
    debug({msg}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.info({err, msg}, 'Error sending command to jambonz');
    }
  }

  reply({execImmediate = true} = {}) {
    this.send({execImmediate, reply: true});
  }

  injectCommand(command, opts = {}, call_sid) {
    validateInjectCommand(command, opts);
    const msg = {
      type: 'command',
      command,
      ...(call_sid && {callSid: call_sid}),
      data: opts
    };
    debug({msg}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.info({err, msg}, 'Error sending command to jambonz');
    }
    this.payload = [];
  }

  toJSON() {
    return {
      call_sid: this.call_sid,
      b3: this.b3,
      ...this.data
    };
  }

  close() {
    this.ws.close();
  }

  _onClose(code, reason) {
    debug({code, reason: reason.toString()}, 'Session: websocket closed');
    this.emit('close', code, reason);
  }

  _onMessage(data, isBinary) {
    if (isBinary) {
      debug('discarding incoming binary message');
      return;
    }
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'verb:hook':
        case 'session:redirect':
        case 'dial:confirm':
          debug({msg}, `Session: Received ${msg.type} message from jambonz`);
          this.msgid = msg.msgid;
          if (this.listeners(msg.hook).length === 0) this.reply();
          else this.emit(msg.hook, msg.data);
          break;
        case 'llm:event':
        case 'llm:tool-call':
          debug({msg}, `Session: Received ${msg.type} message from jambonz`);
          this.emit(msg.hook, msg.data);
          break;
        case 'call:status':
        case 'verb:status':
        case 'jambonz:error':
          debug({msg}, `Session: Received ${msg.type} message from jambonz`);
          this.emit(msg.type, msg.data);
          break;
        default:
          this.logger.info({msg}, 'Session: Received unexpected message from jambonz');
          break;
      }
    } catch (err) {
      this.logger.info({err}, 'Error handling incoming message');
    }
  }

  addVerb(verb, payload) {
    validateVerb(verb, payload, this.logger);
    this.payload.push({verb: verb.replace('_', ':'), ...payload});
    return this;
  }
}

/* add methods for all of the jambonz verbs */
for (const [verb] of _specs) {
  Session.prototype[verb.replace(':', '_')] = function(payload) {
    return Session.prototype.addVerb.call(this, verb, payload);
  };
}


module.exports = Session;
