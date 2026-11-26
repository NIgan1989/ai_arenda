import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {formCount, countDraft, resetDraft, hasChoices} = await loadPure('mobile/src/form-count.ts', 'mobile/src/ai-request.ts', 'lib/map-search-request.ts');
const {newDraft} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');

const now = Date.parse('2026-11-18T15:00:00+05:00');
const place = (stay_class, amount) => ({id: stay_class + amount, stay_class, estimate: {amount}});
const list = [place('economy', 8000), place('standard', 12000), place('standard', 14000), place('comfort', 20000), place('comfort', 22000), place('premium', 40000)];

test('the count asks without the class and applies the class on the phone', () => {
  const draft = {...newDraft(now), classes: ['comfort', 'premium']};
  assert.deepEqual(countDraft(draft).classes, []);
  const count = formCount(draft, list);
  assert.equal(count.total, 3);
  assert.equal(count.more, false);
  assert.deepEqual(count.classes, {economy: 1, standard: 2, comfort: 2, premium: 1});
  assert.equal(formCount({...draft, classes: []}, list).total, 6);
  assert.equal(formCount(draft, Array.from({length: 60}, (_, i) => place('comfort', 10000 + i))).more, true);
});

test('the usual price is the middle half per day, and only without a budget', () => {
  const draft = newDraft(now), units = 1;
  const count = formCount(draft, list);
  assert.equal(units, 1);
  assert.deepEqual([count.low, count.high], [12000, 22000]);
  assert.deepEqual([formCount({...draft, maxPrice: '15000'}, list).low, formCount(draft, list.slice(0, 4)).low], [null, null]);
});

test('«Сбросить» keeps the day, the guests and the city', () => {
  const draft = {...newDraft(now), guests: 3, kinds: ['studio'], classes: ['premium'], rooms: '2', features: ['wifi'], maxPrice: '20000', priority: 'cheaper', district: 'Центр'};
  assert.equal(hasChoices(draft), true);
  const clean = resetDraft(draft);
  assert.deepEqual([clean.guests, clean.city, clean.start, clean.end], [3, draft.city, draft.start, draft.end]);
  assert.deepEqual([clean.kinds, clean.classes, clean.rooms, clean.features, clean.maxPrice, clean.priority, clean.district], [[], [], '', [], '', 'balanced', '']);
  assert.equal(hasChoices(clean), false);
  assert.equal(hasChoices(newDraft(now)), false);
});
