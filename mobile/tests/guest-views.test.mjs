import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {viewLog, noteViews, takeViews} = await loadPure('mobile/src/guest-views.ts');

test('a card is told once for one answer of the search', () => {
  const log = viewLog();
  assert.equal(noteViews(log, '100', ['a']), 1);
  assert.equal(noteViews(log, '100', ['a', 'b', '']), 2);
  assert.deepEqual(takeViews(log), ['a', 'b']);
  // Back on the same card: nothing new to send.
  assert.equal(noteViews(log, '100', ['a']), 0);
  assert.deepEqual(takeViews(log), []);
});

test('a new answer counts the same card again', () => {
  const log = viewLog();
  noteViews(log, '100', ['a']);
  takeViews(log);
  assert.equal(noteViews(log, '200', ['a']), 1);
  assert.deepEqual(takeViews(log), ['a']);
});
