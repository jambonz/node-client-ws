const assert = require('assert');
const Emitter = require('events');
const {validateInjectCommand} = require('./utils/validate-inject-command');
const {fixInjectCommand} = require('./utils/fix-inject-command');
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
    this.commandQueue = []; // Single queue for all commands

    // eslint-disable-next-line no-unused-vars
    const {sip_status, sip_reason, call_status, ...rest} = msg.data;
    this.data = rest;

    for (const [key, value] of Object.entries(msg.data)) {
      this[key] = value;
    }

    ws.on('message', this._onMessage.bind(this));
    ws.on('close', this._onClose.bind(this));
  }

  get isTtsPaused() {
    return this._ttsPaused;
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
    fixInjectCommand(command, opts);
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

  sendTtsTokens(text) {
    if (!text || typeof text !== 'string') throw new Error('Invalid tokens provided');

    const id = ++this._ttsCounter;
    const promise = new Promise((resolve, reject) => {
      this.commandQueue.push({ type: 'tokens', id, tokens: text, resolve, reject });
    });

    /* if the queue was empty, process the queue and send this message out immediately */
    if (this.commandQueue.length === 1 && !this._ttsPaused) this._processQueue();

    return promise;
  }

  handleTtsTokensResult(data) {
    const { id, status, reason } = data;
    assert.ok(this.commandQueue.length > 0, 'matching request should always be at the head of the queue');
    assert.ok(id === this.commandQueue[0].id, 'matching request should always be at the head of the queue');

    /* remove the first command from the queue */
    const command = this.commandQueue[0];

    if (status === 'ok') {
      debug(`handleTtsTokensResult: received ok for id ${id}`);
      this.commandQueue.shift();
      command.resolve();
    } else if (reason === 'full') {
      debug(`handleTtsTokensResult: received reason=full for id ${id}`);
      this._ttsPaused = true;
      command.resolve();
    } else {
      debug(`handleTtsTokensResult: received error for id ${id}: status=${status}, reason=${reason}`);
      this.commandQueue.shift();
      command.reject(new Error(`tts-token error: ${reason}`));
    }

    if (this.commandQueue.length > 0 && !this._ttsPaused) {
      this._processQueue();
    }
  }

  clearTtsTokens() {
    /* resolve all of the commands in the queue and clear it */
    for (const command of this.commandQueue) {
      if (command.type === 'tokens') {
        command.resolve();
      }
    }
    this.commandQueue = [];
    this._ttsPaused = false;
    debug('clearTtsTokens: sending tts:clear');
    return this.sendCommand('tts:clear');
  }

  flushTtsTokens() {
    debug('flushTtsTokens: queuing tts:flush command');

    if (this.commandQueue.length === 0) {
      this.sendCommand('tts:flush');
    }
    else {
      this.commandQueue.push({ type: 'flush' });
    }
  }

  resumeTtsStreaming() {
    debug('resumeTtsStreaming: resuming TTS streaming');
    this._ttsPaused = false;
    this._processQueue();
  }

  handleUserInterruption() {
    debug('handleUserInterruption: received user interruption');

    this.emit('tts:user_interrupt');


    /* resolve all of the commands in the queue and clear it */
    for (const command of this.commandQueue) {
      if (command.type === 'tokens') {
        command.resolve();
      }
    }
    this.commandQueue = [];
    this._ttsPaused = false;
  }

  async _processQueue() {
    assert(this.commandQueue.length > 0, 'queue should not be empty');
    assert(this._ttsPaused === false, 'queue should not be processed when paused');

    /* process any flush commands at the head of the queue */
    while (this.commandQueue.length > 0 && this.commandQueue[0].type === 'flush') {
      debug('_processQueue: sending tts:flush command');
      this.sendCommand('tts:flush');
      this.commandQueue.shift();
    }

    if (this.commandQueue.length > 0 && !this._ttsPaused) {
      assert(this.commandQueue[0].type === 'tokens', 'next command should be tokens');
      const command = this.commandQueue[0];
      debug(`_processQueue: sending tts:tokens id ${command.id}`);
      this.sendCommand('tts:tokens', { id: command.id, tokens: command.tokens });
    }

    debug('_processQueue: queue processing completed');
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
          else if (msg.data?.event_type === 'user_interruption') {
            this.handleUserInterruption();
          }
          this.emit(msg.type, msg.data);
          break;
        case 'tts:tokens-result':
          this.handleTtsTokensResult(msg.data);
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
