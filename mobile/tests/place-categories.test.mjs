import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

// «Досуг», «Спорт», «Авто» (2026-11-28): the guest picks them like a bath, by the hour.
const {guestRequestFromText, newDraft, withCategory, withKind, categoryOf, chipDraft, CATEGORIES, allKinds} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
const {headLine} = await loadPure('mobile/src/head-line.ts', 'lib/ai-line.ts');
const cities = ['Павлодар'];
const morning = Date.parse('2026-11-11T05:00:00Z'); // 10:00 in Kazakhstan

test('the three new categories are in the picker, each a group of hourly places', () => {
  assert.deepEqual(CATEGORIES.map(c => c.id), ['stay', 'bath', 'banquet', 'leisure', 'sport', 'auto']);
  const draft = newDraft('Павлодар', morning);
  const wash = withCategory(draft, 'auto', morning);
  assert.equal(wash.mode, 'hourly');
  assert.equal(wash.guests, 1);
  assert.deepEqual(wash.kinds, allKinds('auto'));
  // A car takes an hour.
  assert.equal(Date.parse(wash.end + ':00+05:00') - Date.parse(wash.start + ':00+05:00'), 3600000);
  const field = withKind(draft, 'sport', 'field', morning);
  assert.deepEqual([categoryOf(field), field.guests, field.kinds], ['sport', 10, ['field']]);
  assert.equal(categoryOf(withCategory(draft, 'leisure', morning)), 'leisure');
});

test('words take the guest to the place\'s category', () => {
  const draft = newDraft('Павлодар', morning);
  const wash = guestRequestFromText('автомойка завтра в 10:00', draft, cities, morning).draft;
  assert.deepEqual([categoryOf(wash), wash.mode, wash.kinds], ['auto', 'hourly', ['carwash']]);
  const loft = guestRequestFromText('лофт на 12 человек в субботу в 18:00', draft, cities, morning).draft;
  assert.deepEqual([categoryOf(loft), loft.mode, loft.guests], ['leisure', 'hourly', 12]);
});

test('«Авто» has its own line and «Завтра» is the morning', () => {
  assert.equal(headLine('guest', morning, 'auto').placeholder, 'Мойка завтра в 10:00');
  assert.deepEqual(headLine('guest', morning, 'auto').chips.map(c => c.id), ['now', 'tomorrow']);
  const wash = chipDraft('tomorrow', withCategory(newDraft('Павлодар', morning), 'auto', morning), morning);
  assert.deepEqual([wash.start, wash.end], ['2026-11-12T10:00', '2026-11-12T11:00']);
});
