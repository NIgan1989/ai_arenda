import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {placeNow} = await loadPure('mobile/src/own-place.ts');
// 15 November 2026, 12:00 in Almaty (UTC+5).
const now = Date.UTC(2026, 10, 15, 7, 0) / 1000, h = 3600;

test('guests inside: until when', () => {
  const r = placeNow('p1', [{property_id: 'p1', status: 'confirmed', start: now - 2 * h, end: now + 22 * h}], now);
  assert.equal(r.busy, true);
  assert.equal(r.line, 'Гости до завтра 10:00');
});

test('the next arrival, today, and requests counted', () => {
  const r = placeNow('p1', [
    {property_id: 'p1', status: 'confirmed', start: now + 2 * h, end: now + 26 * h},
    {property_id: 'p1', status: 'requested', start: now + 50 * h, end: now + 70 * h},
    {property_id: 'p2', status: 'confirmed', start: now - h, end: now + h}
  ], now);
  assert.equal(r.busy, false);
  assert.equal(r.line, 'Заезд сегодня 14:00');
  assert.equal(r.requests, 1);
});

test('free when every booking is over or cancelled', () => {
  const r = placeNow('p1', [
    {property_id: 'p1', status: 'confirmed', start: now - 30 * h, end: now - 6 * h},
    {property_id: 'p1', status: 'cancelled', start: now + h, end: now + 5 * h}
  ], now);
  assert.equal(r.line, 'Свободно, броней впереди нет');
});
