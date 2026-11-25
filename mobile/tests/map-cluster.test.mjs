import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {groupPins, pinWidth} = await loadPure('mobile/src/map-math.ts');

const box = (key, x, y, extra = {}) => ({key, x, y, width: pinWidth('18 тыс.'), height: 32, ...extra});
// True when two drawn pins would cover each other; a pin that stands for several is 28px wider.
const overlap = (a, b, wide) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + (wide ? 14 : 0) && Math.abs(a.y - b.y) < (a.height + b.height) / 2;

test('pins that do not touch are all shown on their own', () => {
  const groups = groupPins([box('a', 60, 100), box('b', 260, 100), box('c', 60, 200)]);
  assert.deepEqual(groups, [{key: 'a', members: ['a']}, {key: 'b', members: ['b']}, {key: 'c', members: ['c']}]);
});

test('pins that would cover each other become one pin with the rest behind it', () => {
  // The first screen of the stand: "14 [18 тыс.] ыс. 16 тыс." on one line.
  const row = [box('14', 120, 250, {rank: 14000}), box('18', 165, 250, {rank: 18000}), box('15', 210, 250, {rank: 15000}), box('16', 250, 250, {rank: 16000})];
  const groups = groupPins(row);
  // The cheapest is the one that stays visible.
  assert.equal(groups[0].key, '14');
  assert.deepEqual(groups.flatMap(group => group.members).sort(), ['14', '15', '16', '18']);
  // No two shown pins overlap, even when a shown pin carries its "+N".
  const shown = groups.map(group => ({...row.find(pin => pin.key === group.key), wide: group.members.length > 1}));
  for (const a of shown) for (const b of shown) if (a !== b) assert.equal(overlap(a, b, a.wide || b.wide), false);
});

test('the selected pin is never hidden behind a cheaper neighbour', () => {
  const pins = [box('cheap', 100, 100, {rank: 9000}), box('selected', 130, 100, {rank: -1})];
  assert.deepEqual(groupPins(pins), [{key: 'selected', members: ['selected', 'cheap']}]);
});

test('pins one above another are separate when their boxes do not meet', () => {
  assert.equal(groupPins([box('a', 100, 100), box('b', 100, 150)]).length, 2);
  assert.equal(groupPins([box('a', 100, 100), box('b', 100, 125)]).length, 1);
  assert.deepEqual(groupPins([]), []);
});

const {planGroup} = await loadPure('mobile/src/map-math.ts');
const at = (key, lng, lat, important) => ({key, point: [lng, lat], important});

test('a pin alone stays a pin', () => {
  assert.deepEqual(planGroup([at('a', 76.95, 52.28)]), {kind: 'pin', key: 'a', dots: []});
});

test('homes in one building become one mark «N в доме»', () => {
  const plan = planGroup([at('a', 76.95, 52.28), at('b', 76.95005, 52.28005), at('c', 76.9501, 52.2799)]);
  assert.deepEqual(plan, {kind: 'cluster', key: 'a', members: ['a', 'b', 'c'], house: true});
});

test('a small group keeps its first pin and shows the others as dots', () => {
  assert.deepEqual(planGroup([at('a', 76.95, 52.28), at('b', 76.952, 52.281)]), {kind: 'pin', key: 'a', dots: ['b']});
});

test('a large group of ordinary pins becomes one round mark with the count', () => {
  const plan = planGroup([0, 1, 2, 3, 4].map(i => at('p' + i, 76.95 + i * 0.002, 52.28)));
  assert.equal(plan.kind, 'cluster');
  assert.equal(plan.house, false);
  assert.equal(plan.members.length, 5);
});

test('a small group with a pin that waits keeps that pin and dots, a large one folds into a round mark', () => {
  assert.deepEqual(planGroup([at('ask', 76.95, 52.28, true), at('p1', 76.952, 52.28)]), {kind: 'pin', key: 'ask', dots: ['p1']});
  const plan = planGroup([at('ask', 76.95, 52.28, true), ...[1, 2, 3, 4].map(i => at('p' + i, 76.95 + i * 0.002, 52.28))]);
  assert.equal(plan.kind, 'cluster');
  assert.equal(plan.key, 'ask');
});

const {roundLabels} = await loadPure('mobile/src/map-math.ts');
test('round marks close together: the first keeps its label, the next one goes without', () => {
  const marks = [{x: 100, y: 100, pin: {key: 'ask', label: 'Заявка'}}, {x: 150, y: 120, pin: {key: 'stay', label: 'Гость до 12:00'}}, {x: 300, y: 300, pin: {key: 'far', label: '10 тыс.'}}];
  assert.deepEqual([...roundLabels(marks)], ['stay']);
});
