import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {leftShort, pinAct, ownerDeal, dealChain, threadChain, nextArrival, ownerMargin, ownerPinAct, attention, nextAttention, marginLabel} = await loadPure('mobile/src/pin-deal.ts', 'lib/process-threads.ts', 'lib/ai-move-marks.ts', 'lib/stay-handover-text.ts', 'lib/cancellation.ts', 'lib/stay-words.ts');
const {ownerThreads, cleanerThreads, guestThreads} = await loadPure('lib/process-threads.ts', 'lib/ai-move-marks.ts', 'lib/stay-handover-text.ts', 'lib/cancellation.ts', 'lib/stay-words.ts');

// 2026-11-19 20:15 in Kazakhstan (UTC+5).
const now = Date.UTC(2026, 10, 19, 15, 15) / 1000;
const at = (h, m = 0) => Date.UTC(2026, 10, 19, h - 5, m) / 1000;
const owner = {id: 'o1'}, flat = {id: 'p1', policy: {}};
const stay = (over = {}) => ({id: 'b1', property_id: 'p1', owner_id: 'o1', guest_id: 'g1', status: 'completed', payment_status: 'owner_verified', start: at(15), end: at(18), created_at: at(12), amount: 4500, title: 'Студия у Иртыша', terms: {actual_checkin: at(15), actual_checkout: at(18, 5)}, ...over});
const next = {id: 'b2', property_id: 'p1', owner_id: 'o1', guest_id: 'g2', status: 'confirmed', payment_status: 'owner_verified', start: at(21), end: at(23), created_at: at(13), amount: 4500, title: 'Студия у Иртыша', terms: {}};
const job = (over = {}) => ({id: 'j1', property_id: 'p1', owner_id: 'o1', booking_id: 'b1', status: 'submitted', assigned_to: 'c1', start: at(18), end: at(20, 30), created_at: at(12), submitted_at: at(20), fee: 4000, title: 'Студия у Иртыша', checkout_confirmed: 1, ...over});
const state = (bookings, jobs, user = owner) => ({user, ownProperties: [flat], bookings, jobs, applications: [], notifications: []});

test('the time left is short enough for a tag and shown only within three hours', () => {
  assert.equal(leftShort(45 * 60), '45 мин');
  assert.equal(leftShort(90 * 60), '1,5 ч');
  assert.equal(leftShort(120 * 60), '2 ч');
  assert.equal(leftShort(4 * 3600), '');
  assert.equal(leftShort(-60), '');
});

test('a report to accept before the next arrival puts «Проверить уборку · 45 мин» on the pin of the place', () => {
  const data = state([stay(), next], [job()]);
  assert.equal(nextArrival(data, 'p1', at(18)), at(21));
  const act = pinAct('owner', ownerThreads(data, now), data, now, t => t.propertyId === 'p1');
  assert.deepEqual(act, {label: 'Проверить уборку · 45 мин', kind: 'job', id: 'j1', urgent: true});
  assert.equal(pinAct('owner', ownerThreads(data, now), data, now, t => t.propertyId === 'other'), null);
});

test('a step that is somebody else\'s puts no tag on the pin', () => {
  const data = state([stay(), next], [job({status: 'in_progress', started_at: at(18, 10), submitted_at: null})]);
  assert.equal(pinAct('owner', ownerThreads(data, now), data, now, t => t.propertyId === 'p1'), null);
});

test('the deal of a place is one line: request, payment, stay, cleaning, ready', () => {
  const data = state([stay(), next], [job()]);
  const deal = ownerDeal(data, 'p1', now);
  assert.deepEqual(deal.stages.map(s => s.label), ['Заявка', 'Оплата', 'Проживание', 'Уборка', 'Готово']);
  assert.deepEqual(dealChain(deal).states, ['done', 'done', 'done', 'now', 'wait']);
  assert.equal(deal.finished, false);
  assert.deepEqual(deal.open, {kind: 'job', id: 'j1'});
  assert.ok(deal.history.length >= 10);
  assert.ok(deal.history.every(s => s.open.id === 'b1' || s.open.id === 'j1'));
});

test('an accepted cleaning closes the deal: every stage is done, and the next booking becomes the deal', () => {
  const closed = state([stay()], [job({status: 'completed', completed_at: at(20, 10)})]);
  const deal = ownerDeal(closed, 'p1', now);
  assert.equal(deal.finished, true);
  assert.deepEqual(dealChain(deal).states, ['done', 'done', 'done', 'done', 'done']);
  const withNext = ownerDeal(state([stay(), next], [job({status: 'completed', completed_at: at(20, 10)})]), 'p1', now);
  assert.equal(withNext.id, 'b2');
  assert.equal(withNext.finished, false);
  // A deal closed long ago is no longer the story of the place.
  assert.equal(ownerDeal(closed, 'p1', now + 7 * 3600), null);
});

test('a stay under way is «now» on the line and the cleaning waits its turn', () => {
  const data = state([stay({status: 'confirmed', terms: {actual_checkin: at(15)}, end: at(21)})], [job({status: 'open', assigned_to: null, start: at(21), end: at(22), checkout_confirmed: 0})]);
  const deal = ownerDeal(data, 'p1', now);
  assert.deepEqual(dealChain(deal).states, ['done', 'done', 'now', 'wait', 'wait']);
  assert.ok(dealChain(deal).progress > 0.8);
});

test('the performer sees «Отправить отчёт» with the time left on the pin of the cleaning under way', () => {
  const data = state([], [job({status: 'in_progress', started_at: at(18, 10), submitted_at: null, end: at(20, 45)})], {id: 'c1'});
  const threads = cleanerThreads(data, now);
  assert.deepEqual(pinAct('cleaner', threads, data, now, t => t.id === 'j1'), {label: 'Отправить отчёт · 30 мин', kind: 'job', id: 'j1', urgent: true});
  assert.deepEqual(threadChain(threads[0]).states.slice(0, 4), ['done', 'done', 'done', 'now']);
});

test('the guest sees «Оплатить» on the pin of a confirmed booking that is not paid', () => {
  const b = {...next, guest_id: 'g2', payment_status: 'pending', terms: {}};
  const data = state([b], [], {id: 'g2'});
  const act = pinAct('guest', guestThreads(data, now), data, now, t => t.id === 'b2');
  assert.deepEqual(act, {label: 'Оплатить · 45 мин', kind: 'booking', id: 'b2', urgent: true});
});

test('the margin before the next arrival says the reason with its numbers', () => {
  // Assigned, the guest is out, the cleaning of 50 minutes has not begun, 45 minutes to the arrival: it does not fit.
  const waiting = state([stay(), next], [job({status: 'assigned', start: at(20), end: at(20, 50), submitted_at: null})]);
  const m = ownerMargin(waiting, 'p1', now);
  assert.equal(m.why, 'До заезда 45 мин · уборка займёт 50 мин');
  assert.equal(m.tight, true);
  assert.deepEqual(ownerPinAct(ownerThreads(waiting, now), waiting, 'p1', now), {label: 'Уборка не успевает', why: 'До заезда 45 мин · уборка займёт 50 мин', kind: 'job', id: 'j1', urgent: true});
  // Nobody is assigned: that is the reason, whatever the time.
  const nobody = state([stay(), next], [job({status: 'open', assigned_to: null, submitted_at: null})]);
  assert.equal(ownerPinAct(ownerThreads(nobody, now), nobody, 'p1', now).why, 'До заезда 45 мин · исполнитель не назначен');
  assert.equal(ownerPinAct(ownerThreads(nobody, now), nobody, 'p1', now).label, 'Найти исполнителя');
  // The work is running and fits, the arrival is within the hour: the owner watches it.
  const running = state([stay(), next], [job({status: 'in_progress', start: at(20), end: at(20, 40), started_at: at(20), submitted_at: null})]);
  assert.deepEqual(ownerPinAct(ownerThreads(running, now), running, 'p1', now), {label: 'Следить за уборкой', why: 'До заезда 45 мин · уборке осталось 25 мин', kind: 'job', id: 'j1', urgent: true});
  // The same with the arrival two hours away: nothing to decide, the pin stays calm.
  const far = state([stay(), {...next, start: at(22, 15)}], [job({status: 'in_progress', start: at(20), end: at(20, 40), started_at: at(20), submitted_at: null})]);
  assert.equal(ownerMargin(far, 'p1', now).decide, false);
  assert.equal(ownerPinAct(ownerThreads(far, now), far, 'p1', now), null);
  // Started late: what is left of it no longer fits.
  const late = state([stay(), next], [job({status: 'in_progress', start: at(20), end: at(21), started_at: at(20, 10), submitted_at: null})]);
  assert.equal(ownerMargin(late, 'p1', now).why, 'До заезда 45 мин · уборке осталось 45 мин');
  // The report is in: the owner checks it, with the arrival as the reason.
  const report = state([stay(), next], [job()]);
  assert.deepEqual(ownerPinAct(ownerThreads(report, now), report, 'p1', now), {label: 'Проверить уборку', why: 'До заезда 45 мин · отчёт ждёт приёмки', kind: 'job', id: 'j1', urgent: true});
  // No arrival within six hours: no margin, the usual step of the owner stands on the pin.
  const free = state([stay()], [job()]);
  assert.equal(ownerMargin(free, 'p1', now), null);
  assert.equal(ownerPinAct(ownerThreads(free, now), free, 'p1', now).label, 'Проверить уборку');
});

test('«Требуют внимания» walks the pins with a tag, urgent first, round and round', () => {
  const keys = attention([{key: 'a'}, {key: 'b', act: {urgent: false}}, {key: 'c', act: {urgent: true}}]);
  assert.deepEqual(keys, ['c', 'b']);
  assert.equal(nextAttention(keys, ''), 'c');
  assert.equal(nextAttention(keys, 'c'), 'b');
  assert.equal(nextAttention(keys, 'b'), 'c');
  assert.equal(nextAttention([], 'b'), '');
});

test('once a performer is assigned and the cleaning fits, the pin says the margin that is back', () => {
  // 20:15 now, arrival 21:30, cleaning 20:20–21:10 assigned, the guest is out: 75 − (50 + 15) = 10 minutes to spare.
  const data = state([stay(), {...next, start: at(21, 30)}], [job({status: 'assigned', start: at(20, 20), end: at(21, 10), submitted_at: null})]);
  const m = ownerMargin(data, 'p1', now);
  assert.equal(m.decide, false);
  assert.equal(marginLabel(m), 'Назначено · запас 10 мин');
  // Nobody assigned, or a decision is due: no such label.
  assert.equal(marginLabel(ownerMargin(state([stay(), next], [job({status: 'open', assigned_to: null})]), 'p1', now)), '');
  assert.equal(marginLabel(null), '');
});
