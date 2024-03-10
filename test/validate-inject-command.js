const test = require('tape');
const { 
  validateInjectCommand,
} = require('../lib/utils/validate-inject-command');

test('validate inject commands syntax', (t) => {

  /* call:status */
  validateInjectCommand('call:status', 'completed');
  t.pass('successfully call:status with completed');
  t.throws(() => validateInjectCommand('call:status', 'in-progress'), 'call:status checks allowed values');
  
  /* mute:status */
  validateInjectCommand('mute:status', 'mute');
  t.pass('successfully mute:status with mute');
  t.throws(() => validateInjectCommand('mute:status', 'unmutedd'), 'mute:status checks allowed values');

  /* conf:mute-status */
  validateInjectCommand('conf:mute-status', 'unmute');
  t.pass('successfully mute:status with mute');
  t.throws(() => validateInjectCommand('conf:mute-status', 'unmutedd'), 'conf:mute-status checks allowed values');

  /* conf:hold-status */
  validateInjectCommand('conf:hold-status', 'hold');
  t.pass('successfully conf:hold-status with hold');
  validateInjectCommand('conf:hold-status', 'unhold');
  t.pass('successfully conf:hold-status with unhold');
  t.throws(() => validateInjectCommand('conf:hold-status', 'unmutedd'), 'conf:hold-status checks allowed values');

  /* listen:status */
  validateInjectCommand('listen:status', 'pause');
  t.pass('successfully listen:status with pause');
  validateInjectCommand('listen:status', 'resume');
  t.pass('successfully listen:status with resume');
  t.throws(() => validateInjectCommand('listen:status', 'unmutedd'), 'listen:status checks allowed values');

  /* record */
  validateInjectCommand('record', { action: 'startCallRecording', recordingID: 'foo', siprecServerURL: 'http://foo.com' });
  t.pass('successfully record with startCallRecording');
  validateInjectCommand('record', {
    action: 'startCallRecording',
    recordingID: 'foo',
    siprecServerURL: 'http://foo.com',
    headers: {
      'X-custom-header': 'foo'
    }
  });
  t.pass('successfully record with stopCallRecording');
  validateInjectCommand('record', { action: 'stopCallRecording'});
  t.pass('successfully record with stopCallRecording');

  /* whisper */
  t.doesNotThrow(() => validateInjectCommand('whisper', 'http://foo.com'), 'whisper with url');
  t.doesNotThrow(() => validateInjectCommand('whisper', {
    verb: 'say',
    text: 'hello'
  }), 'whisper with embedded command');

  /* sip:request */
  t.doesNotThrow(() => validateInjectCommand('sip:request', {method: 'INFO'}), 'sip:request with method');

  /* dtmf */
  t.doesNotThrow(() => validateInjectCommand('dtmf', {digit: '1', duration: 250}), 'dtmf with digit');

  /* tag */
  t.doesNotThrow(() => validateInjectCommand('tag', {foo: 'bar'}), 'tag with object');

  /* transcribe:status */
  t.doesNotThrow(() => validateInjectCommand('transcribe:status', 'pause'), 'transcribe:status with pause');
  t.doesNotThrow(() => validateInjectCommand('transcribe:status', 'resume'), 'transcribe:status with resume');

  /* conf:participant-action */
  t.doesNotThrow(() => validateInjectCommand('conf:participant-action', {action: 'tag', tag: 'foo'}), 'conf:participant-action with tag');

  /* dub */
  t.doesNotThrow(() => validateInjectCommand('dub', {action: 'addTrack', track: 'a'}), 'dub with addTrack');

  /* boostAudioSignal */
  t.doesNotThrow(() => validateInjectCommand('boostAudioSignal', '-2 dB'), 'boostAudioSignal -2 dB');
  t.doesNotThrow(() => validateInjectCommand('boostAudioSignal', '1 dB'), 'boostAudioSignal 1 dB');
  t.doesNotThrow(() => validateInjectCommand('boostAudioSignal', '+1 dB'), 'boostAudioSignal +1 dB');
  t.doesNotThrow(() => validateInjectCommand('boostAudioSignal', -2), 'boostAudioSignal -2');
  t.end();
});
