import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {aiMarkOf, latestMove, AI_SAYS, AI_WINDOW} = await loadPure('lib/ai-move-marks.ts');

test('the notices the AI leaves are read as moves on what they are about', () => {
  assert.deepEqual(aiMarkOf('owner:administrator-confirmed:b1', 100), {kind: 'booking', id: 'b1', move: 'confirmed', at: 100});
  assert.deepEqual(aiMarkOf('owner:administrator-assigned:j1:3', 100), {kind: 'job', id: 'j1', move: 'assigned', at: 100});
  assert.deepEqual(aiMarkOf('owner:no-show:j2:4', 100), {kind: 'job', id: 'j2', move: 'replaced', at: 100});
  assert.deepEqual(aiMarkOf('owner:matching-auto:o1', 100), {kind: 'matching-offer', id: 'o1', move: 'answered', at: 100});
  assert.deepEqual(aiMarkOf('cleaner:autopilot-took:c1', 100), {kind: 'cleaning-offer', id: 'c1', move: 'took', at: 100});
  assert.deepEqual(aiMarkOf('cleaner:overdue-remind:j3:999', 100), {kind: 'job', id: 'j3', move: 'reminded', at: 100});
  // A booking the AI confirmed at once, told apart from a new request by its words.
  assert.deepEqual(aiMarkOf('owner:booking:b7', 100, 'AI администратор принял бронь на «Студия» по вашим правилам.'), {kind: 'booking', id: 'b7', move: 'confirmed', at: 100});
  assert.equal(aiMarkOf('owner:booking:b7', 100, 'Новая заявка на «Студия».'), null);
  // A notice of a person, not of the AI, is not a move.
  assert.equal(aiMarkOf('owner:released:j1:2', 100), null);
  assert.equal(aiMarkOf('owner:administrator-confirmed:', 100), null);
  assert.equal(aiMarkOf(42, 100), null);
});

test('every move has a short line in Russian', () => {
  for (const [move, text] of Object.entries(AI_SAYS)) {
    assert.match(text, /^(ИИ|Автопилот) /, move);
    assert.ok(text.length <= 26, move);
  }
});

test('a pin shows the newest move about it, only within the window', () => {
  const marks = [
    {kind: 'booking', id: 'b1', move: 'confirmed', at: 1000, propertyId: 'p1'},
    {kind: 'job', id: 'j1', move: 'accepted', at: 1100, propertyId: 'p1'},
    {kind: 'job', id: 'j9', move: 'assigned', at: 1150, propertyId: 'p9'}
  ];
  // The owner's pin is the object: any move at it counts, even about a cleaning that has left the map.
  assert.deepEqual(latestMove(marks, [{kind: 'property', id: 'p1'}], 1200), {move: 'accepted', at: 1100});
  // The cleaner's pin is the job.
  assert.deepEqual(latestMove(marks, [{kind: 'job', id: 'j9'}], 1200), {move: 'assigned', at: 1150});
  assert.equal(latestMove(marks, [{kind: 'job', id: 'nope'}], 1200), undefined);
  // Too old: the map is quiet again.
  assert.equal(latestMove(marks, [{kind: 'property', id: 'p1'}], 1100 + AI_WINDOW + 1), undefined);
  assert.equal(latestMove(null, [{kind: 'property', id: 'p1'}], 1200), undefined);
});
