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
    this._ttsCounter = 0;
    this._ttsPaused = false;

    // eslint-disable-next-line no-unused-vars
    const {sip_status, sip_reason, call_status, ...rest} = msg.data;
    this.data = rest;

    for (const [key, value] of Object.entries(msg.data)) {
      this[key] = value;
    }

    this.pendingTtsTokens = [];
    this.queuedTtsTokens = [];

    ws.on('message', this._onMessage.bind(this));
    ws.on('close', this._onClose.bind(this));
  }

  get isTtsPaused() {
    return this._ttsPaused;
  }

  processTtsTokensResult(data) {
    const { id, status, reason } = data;
    const index = this.pendingTtsTokens.findIndex((obj) => obj.id === id);
    if (index === -1) {
      debug({id, data}, 'processTtsTokensResult: Received unexpected tts:tokens-result');
      this.logger.info({ id, data }, 'Received unexpected tts:tokens-result message');
      return;
    }
    const obj = this.pendingTtsTokens[index];

    if (status === 'ok') {
      debug(`processTtsTokensResult: received ok for id ${id}`);
      obj.resolver({status: 'ok'});
    } else if (reason === 'full') {
      debug(`processTtsTokensResult: received reason=full for id ${id}`);
      if (!this._ttsPaused) {
        this.logger.info({ id, status, reason }, 'Received tts:tokens-result message with reason=full');
      }
      this._ttsPaused = true;
      this.queuedTtsTokens.push(obj.tokens);
      obj.resolver({status: 'full'});
    } else {
      debug(`processTtsTokensResult: received error for id ${id}: status: ${status}, reason: ${reason}`);
      this.logger.info({ id, status, reason }, 'Error processing tts:tokens-result message');
      obj.rejector(new Error(`tts-token error: ${reason}`));
    }
    this.pendingTtsTokens.splice(index, 1);
    debug(`processTtsTokensResult: we now have ${this.pendingTtsTokens.length} pending tts token requests`);
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

  sendCommand(command, data = {}) {
    const msg = {
      type: 'command',
      command,
      queueCommand: false,
      data
    };
    //debug({command, data}, 'sending command');
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.info({err, msg}, 'Error sending command to jambonz');
    }
  }

  sendToolOutput(tool_call_id, data) {
    return this.sendCommand('llm:tool-output', {tool_call_id, data});
  }

  updateLlm(data) {
    return this.sendCommand('llm:update', data);
  }

  async sendTtsTokens(text) {
    const id = ++this._ttsCounter;
    const obj = {id, tokens: text};
    debug(`sendTtsTokens: sending ${text.length} with id ${id}`);
    this.sendCommand('tts:tokens', obj);
    const p = new Promise((resolve, reject) => {
      obj.resolver = resolve;
      obj.rejector = reject;
    });
    this.pendingTtsTokens.push(obj);
    return p;
  }

  clearTtsTokens() {
    this.queuedTtsTokens = [];
    this._ttsPaused = false;
    debug('clearTtsTokens: sending tts:clear');
    return this.sendCommand('tts:clear');
  }

  flushTtsTokens() {
    debug('sendTtsFlush: sending tts:flush');
    return this.sendCommand('tts:flush');
  }

  async resumeTtsStreaming() {
    const arr = [...this.queuedTtsTokens];
    this.queuedTtsTokens = [];
    this._ttsPaused = false;
    for (const text of arr) {
      this.sendTtsTokens(text);
    }
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
        case 'tts:streaming-event':
          debug({msg}, `Session: Received ${msg.type} message from jambonz`);
          if (msg.data?.event_type === 'stream_resumed') {
            this.resumeTtsStreaming();
          }
          this.emit(msg.type, msg.data);
          break;
        case 'tts:tokens-result':
          this.processTtsTokensResult(msg.data);
          break;
        case 'call:status':
        case 'verb:status':
        case 'jambonz:error':
          //debug({msg}, `Session: Received ${msg.type} message from jambonz`);
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
