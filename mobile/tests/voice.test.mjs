import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {voiceErrorNote, voiceText, voiceLevel, VOICE_LANGS} = await loadPure('mobile/src/voice.ts');

test('every error of the recogniser has plain words, and stopping by hand has none', () => {
  assert.equal(voiceErrorNote('aborted'), null);
  for (const code of ['no-speech', 'speech-timeout', 'not-allowed', 'language-not-supported', 'network', 'service-not-allowed', 'busy', 'interrupted', 'client', 'audio-capture', '']) {
    const note = voiceErrorNote(code);
    assert.ok(note && note.text.length > 10, code);
    assert.doesNotMatch(note.text, /error|undefined/i);
  }
  // Only what the phone's settings can fix offers the way there.
  assert.equal(voiceErrorNote('not-allowed').settings, true);
  assert.equal(voiceErrorNote('service-not-allowed').settings, true);
  assert.ok(!voiceErrorNote('no-speech').settings);
  assert.match(voiceErrorNote('language-not-supported', 'kk-KZ').text, /Казахскую/);
  assert.match(voiceErrorNote('language-not-supported', 'ru-RU').text, /Русскую/);
});

test('the recognised words fit the line', () => {
  assert.equal(voiceText('  Двушка   на выходные. ', 120), 'Двушка на выходные');
  assert.equal(voiceText('', 120), '');
  assert.equal(voiceText(undefined, 120), '');
  const long = voiceText('квартира на сутки '.repeat(20), 40);
  assert.ok(long.length <= 40 && !long.endsWith(' '));
  // A cut never ends in half a word.
  assert.ok('квартира на сутки '.repeat(20).startsWith(long + ' '));
});

test('the volume becomes a pulse between 0 and 1', () => {
  assert.equal(voiceLevel(-2), 0);
  assert.equal(voiceLevel(5), 0.5);
  assert.equal(voiceLevel(30), 1);
  assert.equal(voiceLevel(undefined), 0);
});

test('Russian first, Kazakh second', () => {
  assert.deepEqual(VOICE_LANGS.map(([id]) => id), ['ru-RU', 'kk-KZ']);
});
