import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {placeNow, takenNow} = await loadPure('mobile/src/own-place.ts');
// 15 November 2026, 12:00 in Almaty (UTC+5).
const now = Date.UTC(2026, 10, 15, 7, 0) / 1000, h = 3600;

test('guests inside: until when', () => {
  const r = placeNow('p1', [{property_id: 'p1', status: 'confirmed', start: now - 2 * h, end: now + 22 * h, terms: {actual_checkin: now - h}}], now);
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

test('a guest past the planned end is still inside; a missed arrival is awaited', () => {
  const late = placeNow('p1', [{property_id: 'p1', status: 'confirmed', start: now - 26 * h, end: now - 2 * h, terms: {actual_checkin: now - 25 * h}}], now);
  assert.equal(late.busy, true);
  assert.equal(late.line, 'Гости ещё не выехали, выезд был сегодня 10:00');
  const waiting = placeNow('p1', [{property_id: 'p1', status: 'confirmed', start: now - h, end: now + 20 * h}], now);
  assert.equal(waiting.busy, false);
  assert.equal(waiting.line, 'Ждём гостя, заезд сегодня 11:00');
  const gone = placeNow('p1', [{property_id: 'p1', status: 'confirmed', start: now - 26 * h, end: now - 2 * h, terms: {actual_checkin: now - 25 * h, actual_checkout: now - 3 * h}}], now);
  assert.equal(gone.line, 'Свободно, броней впереди нет');
});

test('taken now: a guest inside or a stay whose time has come, not a later arrival', () => {
  const b = (o) => ({property_id: 'p1', status: 'confirmed', start: now - h, end: now + 20 * h, ...o});
  assert.equal(takenNow('p1', [b({})], now), true);
  assert.equal(takenNow('p1', [b({start: now - 26 * h, end: now - 2 * h, terms: {actual_checkin: now - 25 * h}})], now), true);
  assert.equal(takenNow('p1', [b({start: now + 2 * h, end: now + 26 * h})], now), false);
  assert.equal(takenNow('p1', [b({status: 'requested'})], now), false);
  assert.equal(takenNow('p1', [b({terms: {actual_checkin: now - h, actual_checkout: now - 60}})], now), false);
  assert.equal(takenNow('p2', [b({})], now), false);
});
