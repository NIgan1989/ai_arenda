import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {aiMarkOf, latestMove, AI_SAYS, AI_WINDOW, aiNoteOf, journalWhen, journalToday} = await loadPure('lib/ai-move-marks.ts');

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

test('the journal keeps every step of the AI as one short line, also those without a pin', () => {
  assert.deepEqual(aiNoteOf('owner:administrator-approved:j1', 100), {kind: 'job', id: 'j1', text: 'ИИ принял уборку', at: 100});
  assert.deepEqual(aiNoteOf('owner:price:s1', 100), {kind: '', id: '', text: 'ИИ посоветовал цену', at: 100});
  assert.deepEqual(aiNoteOf('guest:test-deposit-return:b1', 100), {kind: 'booking', id: 'b1', text: 'ИИ вернул депозит', at: 100});
  assert.deepEqual(aiNoteOf('cleaner:day-plan:w1:2026-11-13', 100), {kind: '', id: '', text: 'ИИ составил план дня', at: 100});
  // What a person did is not in the journal of the AI.
  assert.equal(aiNoteOf('cleaner:assigned:j1', 100), null);
});

test('journal times read as today, yesterday or a date, in Kazakhstan time', () => {
  const noon = Date.UTC(2026, 10, 13, 7, 0) / 1000; // 12:00 in UTC+5
  assert.equal(journalWhen(noon - 3600, noon), 'сегодня 11:00');
  assert.equal(journalWhen(noon - 86400, noon), 'вчера 12:00');
  assert.equal(journalWhen(noon - 3 * 86400, noon), '10.11 12:00');
  assert.equal(journalToday([{at: noon - 60}, {at: noon - 13 * 3600}, {at: noon - 86400}], noon), 1);
});
