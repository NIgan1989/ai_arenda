import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {ownerPin, withAiResult, soon, priceChange, thousands, travellers} = await loadPure('mobile/src/owner-map.ts');
// 2026-11-13 10:00 in Kazakhstan (UTC+5).
const now = Date.UTC(2026, 10, 13, 5, 0) / 1000;
const flat = {id: 'p1', price: 11000};
const at = (h, m = 0, dayShift = 0) => Date.UTC(2026, 10, 13 + dayShift, h - 5, m) / 1000;

test('times on owner pins are today or tomorrow in Kazakhstan time, nothing later', () => {
  assert.equal(soon(at(14), now), '14:00');
  assert.equal(soon(at(12, 30, 1), now), 'завтра 12:30');
  assert.equal(soon(at(12, 0, 2), now), '');
});

test('the most urgent state of an object wins over its price', () => {
  const job = (status, start = at(13)) => ({kind: 'job', propertyId: 'p1', status, start});
  const booking = (status, start, end) => ({kind: 'booking', propertyId: 'p1', status, start, end});
  assert.deepEqual(ownerPin(flat, [], now), {label: '11 тыс.', tone: 'home'});
  assert.deepEqual(ownerPin(flat, [job('in_progress'), booking('confirmed', at(8), at(12))], now), {label: 'Уборка идёт', tone: 'active'});
  assert.deepEqual(ownerPin(flat, [{...job('in_progress', at(9)), startedAt: at(9), end: at(11)}], now), {label: 'Уборка идёт', tone: 'active', progress: 0.5});
  assert.deepEqual(ownerPin(flat, [booking('confirmed', at(8), at(12))], now), {label: 'Гость до 12:00', tone: 'booking'});
  // Trouble is red and wins over everything: a cleaning past its deadline, an arrival within the hour before the cleaning is accepted, a cleaner who has not started.
  const hour = Math.floor((now + 5 * 3600) % 86400 / 3600), late = {...job('in_progress', at(hour - 3)), end: at(hour - 1)};
  assert.deepEqual(ownerPin(flat, [late, booking('confirmed', at(hour + 5), at(hour + 9))], now), {label: 'Уборка просрочена', tone: 'alert'});
  const soonGuest = booking('confirmed', now + 1800, now + 9 * 3600);
  assert.deepEqual(ownerPin(flat, [{...job('submitted', now - 7200), end: now + 600}, soonGuest], now), {label: 'Заезд под угрозой', tone: 'alert'});
  // The cleaning after that same guest is not a risk for their arrival.
  assert.deepEqual(ownerPin(flat, [{...job('open', now + 10 * 3600), end: now + 12 * 3600}, soonGuest], now).tone, 'booking');
  assert.deepEqual(ownerPin(flat, [{...job('assigned', now - 1200), end: now + 7200}], now), {label: 'Исполнитель не начал', tone: 'alert'});
  assert.deepEqual(ownerPin(flat, [booking('confirmed', at(8, 0, -1), at(12, 0, 1))], now), {label: 'Гость до завтра 12:00', tone: 'booking'});
  assert.deepEqual(ownerPin(flat, [booking('confirmed', at(8, 0, -1), at(9))], now), {label: 'Выезд не подтверждён', tone: 'pending'});
  assert.deepEqual(ownerPin(flat, [job('submitted')], now), {label: 'Уборка на приёмке', tone: 'job'});
  assert.deepEqual(ownerPin(flat, [booking('requested', at(20), at(12, 0, 1))], now), {label: 'Заявка', tone: 'pending'});
  assert.deepEqual(ownerPin(flat, [booking('confirmed', at(21), at(12, 0, 1))], now), {label: 'Заезд 21:00', tone: 'booking'});
  assert.deepEqual(ownerPin(flat, [job('assigned', at(15))], now), {label: 'Уборка 15:00', tone: 'job'});
  // Far in the future: not a status of now, the price stays.
  assert.deepEqual(ownerPin(flat, [booking('confirmed', at(21, 0, 5), at(12, 0, 6))], now), {label: '11 тыс.', tone: 'home'});
  // Someone else's object does not change this one.
  assert.deepEqual(ownerPin(flat, [{...job('in_progress'), propertyId: 'p2'}], now), {label: '11 тыс.', tone: 'home'});
});

test('the AI price advice shows on the pin with the AI ring', () => {
  assert.deepEqual(ownerPin(flat, [], now, {from: 11000, to: 13000}), {label: '11 → 13 тыс.', tone: 'home', best: true});
  assert.equal(priceChange(9000, 9500), thousands(9000) + ' → ' + thousands(9500));
  assert.deepEqual(ownerPin(flat, [], now, {from: 11000, to: 11000}), {label: '11 тыс.', tone: 'home'});
  // A guest inside matters more than a price.
  assert.equal(ownerPin(flat, [{kind: 'booking', propertyId: 'p1', status: 'confirmed', start: at(8), end: at(12)}], now, {from: 11000, to: 13000}).label, 'Гость до 12:00');
});

test('only people with a fresh point are on the map', () => {
  assert.deepEqual(travellers([
    {id: 'a', kind: 'job', longitude: 76.95, latitude: 52.28},
    {id: 'b', kind: 'booking', longitude: 76.9, latitude: 52.3},
    {id: 'c', kind: 'job', longitude: null, latitude: null}
  ]), [
    {key: 'journey:a', point: [76.95, 52.28], label: 'Исполнитель в пути'},
    {key: 'journey:b', point: [76.9, 52.3], label: 'Гость в пути'}
  ]);
});

test('a cleaning the AI has just accepted shows as a result on a calm pin only', () => {
  assert.deepEqual(withAiResult({label: '20 тыс', tone: 'home'}, 'accepted'), {label: 'Готово к заезду', tone: 'booked'});
  assert.deepEqual(withAiResult({label: 'Гость живёт', tone: 'booked'}, 'accepted'), {label: 'Гость живёт', tone: 'booked'});
  assert.deepEqual(withAiResult({label: '20 тыс', tone: 'home'}, 'confirmed'), {label: '20 тыс', tone: 'home'});
});
