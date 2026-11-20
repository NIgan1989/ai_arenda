import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {guestHelpers, narrowed, stepWords, rotateEquals, foundLine, metres} = await loadPure('mobile/src/guest-helpers.ts', 'mobile/src/ai-request.ts', 'mobile/src/model.ts', 'lib/map-search-request.ts', 'lib/i18n.ts', 'lib/i18n-words.ts', 'lib/i18n-common.ts');
const {newDraft} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
const {plural} = await loadPure('lib/map-search-request.ts');

const NOW = Date.parse('2026-11-18T10:00:00Z');
const draft = newDraft('Павлодар', NOW);
const flat = (id, amount, amenities = [], more = {}) => ({id, title: id, estimate: {amount}, details: {amenities}, match: {score: 0.5, chance: 50}, ...more});
// Six free places: three with parking, two that confirm at once, prices from 10 to 20 thousand.
const six = [
  flat('a', 14000, ['parking', 'wifi'], {instant: true}),
  flat('b', 11000, ['wifi']),
  flat('c', 12500, ['parking', 'wifi'], {instant: true}),
  flat('d', 16500, ['wifi']),
  flat('e', 18000, ['parking', 'wifi']),
  flat('f', 20000, ['wifi'])
];
const ids = list => list.map(v => v.id);

test('one or two places are not narrowed', () => {
  assert.deepEqual(guestHelpers(six.slice(0, 2), {draft}), []);
});

test('phrases really narrow: what every place has, and what almost none has, is not offered', () => {
  const helpers = guestHelpers(six, {draft});
  // Wi-Fi is in all six: no phrase. Parking and the price split the list in half.
  assert.ok(!ids(helpers).includes('f:wifi'));
  assert.deepEqual(helpers.find(h => h.id === 'f:parking'), {id: 'f:parking', title: 'Парковка', count: 3});
  assert.equal(helpers.find(h => h.id === 'cheaper').count, 3);
  assert.equal(helpers.find(h => h.id === 'instant').count, 2);
  assert.ok(helpers.length <= 4);
});

test('the price is not the first phrase unless the guest swiped past dear cards', () => {
  assert.notEqual(guestHelpers(six, {draft})[0].id, 'cheaper');
  const hot = guestHelpers(six, {draft, pricey: 3})[0];
  assert.equal(hot.id, 'cheaper');
  assert.ok(hot.hot);
  assert.match(hot.title, /^До 14.000/);
});

test('a wish the guest already set and the order the guest already chose are not offered', () => {
  assert.ok(!ids(guestHelpers(six, {draft: {...draft, features: ['parking']}})).includes('f:parking'));
  assert.ok(!ids(guestHelpers(six, {draft: {...draft, priority: 'cheaper'}})).includes('cheaper'));
  assert.ok(!ids(guestHelpers(six, {draft: {...draft, now: true}})).includes('instant'));
});

test('a step taken back is shown faded at the end and never as a live phrase', () => {
  const helpers = guestHelpers(six, {draft, tried: ['f:parking']});
  const back = helpers.find(h => h.id === 'f:parking');
  assert.ok(back.off);
  assert.equal(helpers.indexOf(back), helpers.length - 1);
});

test('the count on a phrase is exactly what the step leaves', () => {
  for (const helper of guestHelpers(six, {draft})) assert.equal(narrowed(six, [helper.id], {draft}).length, helper.count);
});

test('steps follow one another, and the middle price is of the list each step meets', () => {
  assert.deepEqual(ids(narrowed(six, ['f:parking'], {draft})), ['a', 'c', 'e']);
  // Of the three with parking the cheaper half is up to 14 000.
  assert.deepEqual(ids(narrowed(six, ['f:parking', 'cheaper'], {draft})), ['a', 'c']);
  assert.equal(stepWords(['closer', 'f:parking'], draft), 'Ближе › Парковка');
});

test('a phrase already taken is not offered on top of itself', () => {
  const left = narrowed(six, ['cheaper'], {draft});
  assert.ok(!ids(guestHelpers(left, {draft, taken: ['cheaper']})).includes('cheaper'));
});

test('a step that would leave nothing is passed over', () => {
  const none = six.map(v => ({...v, instant: false}));
  assert.equal(narrowed(none, ['instant'], {draft}).length, 6);
});

test('«Ближе» needs to know the way to every place', () => {
  const from = {longitude: 76.95, latitude: 52.28};
  const placed = six.map((v, i) => ({...v, location: {longitude: 76.95 + i * 0.01, latitude: 52.28}}));
  assert.ok(!ids(guestHelpers(six, {draft, from})).includes('closer'));
  const closer = guestHelpers(placed, {draft, from}).find(h => h.id === 'closer');
  assert.equal(closer.count, 3);
  assert.deepEqual(ids(narrowed(placed, ['closer'], {draft, from})), ['a', 'b', 'c']);
  assert.ok(Math.abs(metres(from, {longitude: 76.96, latitude: 52.28}) - 680) < 20);
});

test('equal places take the earlier seat in turn; the best choice and favourites stay put', () => {
  const list = [{...six[0], match: {score: 0.9, chance: 90, best: true}}, six[1], six[2], six[3], {...six[4], match: {score: 0.2, chance: 20}}];
  assert.deepEqual(ids(rotateEquals(list, 0)), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids(rotateEquals(list, 1)), ['a', 'c', 'd', 'b', 'e']);
  assert.deepEqual(ids(rotateEquals(list, 2)), ['a', 'd', 'b', 'c', 'e']);
  assert.deepEqual(ids(rotateEquals(list, 1, v => v.id === 'b')), ['a', 'b', 'd', 'c', 'e']);
});

test('the closed sheet says the whole answer in one line', () => {
  assert.match(foundLine(six, plural), /^6 вариантов от 11.000/);
  assert.equal(foundLine([], plural), '');
});
