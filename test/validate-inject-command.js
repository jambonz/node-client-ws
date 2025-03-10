const test = require('tape');
const { 
  validateInjectCommand,
} = require('../lib/utils/validate-inject-command');

test('validate inject commands syntax', (t) => {

  /* call:status */
  validateInjectCommand('call:status', 'completed');
  t.pass('successfully call:status with completed');
  validateInjectCommand('call:status', {call_status : 'completed'});
  t.pass('successfully call:status with obj completed');
  t.throws(() => validateInjectCommand('call:status', 1 ), 'call:status checks allowed values');
  
  /* mute:status */
  validateInjectCommand('mute:status', 'mute');
  t.pass('successfully mute:status with mute');
  validateInjectCommand('mute:status', {mute_status: 'mute'});
  t.pass('successfully mute:status with obj mute');
  t.throws(() => validateInjectCommand('mute:status', 1), 'mute:status checks allowed values');

  /* conf:mute-status */
  validateInjectCommand('conf:mute-status', 'unmute');
  t.pass('successfully mute:status with mute');
  validateInjectCommand('conf:mute-status', {mute_status: 'unmute'});
  t.pass('successfully mute:status with obj  mute');
  t.throws(() => validateInjectCommand('conf:mute-status', 1), 'conf:mute-status checks allowed values');

  /* conf:hold-status */
  validateInjectCommand('conf:hold-status', 'hold');
  t.pass('successfully conf:hold-status with hold');
  validateInjectCommand('conf:hold-status', {hold_status: 'unhold'});
  t.pass('successfully conf:hold-status with obj unhold');
  t.throws(() => validateInjectCommand('conf:hold-status', 1), 'conf:hold-status checks allowed values');

  /* listen:status */
  validateInjectCommand('listen:status', 'pause');
  t.pass('successfully listen:status with pause');
  validateInjectCommand('listen:status', {listen_status : 'resume'});
  t.pass('successfully listen:status with obj resume');
  t.throws(() => validateInjectCommand('listen:status', 1), 'listen:status checks allowed values');

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
    text: 'hello',
  }), 'whisper with embedded command');

  t.doesNotThrow(() => validateInjectCommand('dub', {
    action: "sayOnTrack",
    track: "a",
    say: {
      text: "hi, this is a dub track injected by the call leg A",
    },
    loop: true,
  }, 'call-sid'), 'dub with embedded command');

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
