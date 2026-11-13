import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {dayRoute, progress, cleanerPin, routeLines, routeSummary} = await loadPure('mobile/src/cleaner-map.ts', 'mobile/src/owner-map.ts');
const {lineOrigin} = await loadPure('mobile/src/map-motion.ts');

// 2026-11-13 10:00 in Kazakhstan (UTC+5).
const now = Date.UTC(2026, 10, 13, 5) / 1000;
const at = (hour, minute = 0, days = 0) => Date.UTC(2026, 10, 13 + days, hour - 5, minute) / 1000;
const job = (id, status, start, end, extra = {}) => ({id, status, start, end, assigned_to: 'me', fee: 5000, ...extra});

test('the day route puts the cleaning under way first, then today by time, without tomorrow or other people', () => {
  const jobs = [
    job('late', 'assigned', at(15), at(18)),
    job('early', 'assigned', at(11), at(14)),
    job('now', 'in_progress', at(9), at(12)),
    job('tomorrow', 'assigned', at(11, 0, 1), at(14, 0, 1)),
    job('done', 'submitted', at(8), at(10)),
    job('other', 'assigned', at(12), at(15), {assigned_to: 'someone'}),
    job('overdue', 'assigned', at(8), at(9, 30))
  ];
  assert.deepEqual(dayRoute(jobs, 'me', now).map(s => [s.id, s.order]), [['now', 1], ['early', 2], ['late', 3]]);
});

test('progress runs from the start of the cleaning to the end of its window', () => {
  assert.equal(progress(at(9), at(11), now), 0.5);
  assert.equal(progress(at(9), at(9, 30), now), 1);
  assert.equal(progress(null, at(11), now), undefined);
  assert.equal(progress(at(11), at(10), now), undefined);
});

test('a job pin says what to do now', () => {
  const stop = {id: 'a', order: 2, start: at(11), end: at(14), status: 'assigned'};
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(11), at(14)), stop, now, false), {label: '11:00', tone: 'offer', order: 2});
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(9), at(14), {checkout_confirmed: false}), {...stop, start: at(9)}, now, false), {label: 'Ждём выезда', tone: 'offer', order: 2});
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(9, 50), at(14), {checkout_confirmed: true}), {...stop, start: at(9, 50)}, now, false), {label: 'Начинайте', tone: 'offer', order: 2});
  // A quarter of an hour late with the flat free, or past the deadline: the pin turns red.
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(9), at(14), {checkout_confirmed: true}), {...stop, start: at(9)}, now, false), {label: 'Пора начинать', tone: 'alert', order: 2});
  assert.deepEqual(cleanerPin(job('a', 'in_progress', at(7), at(9, 30), {started_at: at(7)}), {...stop, order: 1}, now, false), {label: 'Срок вышел', tone: 'alert', order: 1});
  // An assigned job nobody started, past its window: the route has dropped it, the pin still warns.
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(7), at(9, 30), {checkout_confirmed: true}), undefined, now, false), {label: 'Срок вышел', tone: 'alert'});
  assert.deepEqual(cleanerPin(job('a', 'in_progress', at(9), at(11), {started_at: at(9)}), {...stop, order: 1}, now, false), {label: 'Уборка до 11:00', tone: 'active', order: 1, progress: 0.5});
  assert.deepEqual(cleanerPin(job('a', 'submitted', at(8), at(10)), undefined, now, false), {label: 'На приёмке', tone: 'booking'});
  assert.deepEqual(cleanerPin(job('a', 'assigned', at(11, 0, 1), at(14, 0, 1)), undefined, now, false), {label: 'завтра 11:00', tone: 'offer'});
  assert.deepEqual(cleanerPin(job('a', 'open', at(11), at(14)), undefined, now, true), {label: 'Отклик ✓', tone: 'job'});
  assert.deepEqual(cleanerPin(job('a', 'open', at(11), at(14)), undefined, now, false), {label: 'Уборка', tone: 'job'});
});

test('the route joins the stops in order and has no search point', () => {
  const lines = routeLines([[76.9, 52.28], null, [76.95, 52.3], [76.97, 52.31]]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(l => [l.from, l.to, l.tone]), [[[76.9, 52.28], [76.95, 52.3], 'route'], [[76.95, 52.3], [76.97, 52.31], 'route']]);
  assert.equal(new Set(lines.map(l => l.key)).size, 2);
  assert.equal(lineOrigin(lines), null);
  assert.deepEqual(lineOrigin([{key: 'beam:a', from: [1, 2], to: [3, 4], tone: 'ask'}]), [1, 2]);
});

test('the route summary counts cleanings, kilometres and pay', () => {
  assert.equal(routeSummary([]), '');
  assert.equal(routeSummary([{fee: 5000, point: [76.9, 52.28]}]), '1 уборка · 5 000 ₸');
  const text = routeSummary([{fee: 5000, point: [76.9, 52.28]}, {fee: 4500, point: [76.95, 52.3]}, {fee: 4000, point: null}]);
  assert.equal(text, "3 уборки · 4,1 км · 13 500 ₸");
});
