import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

// The rules themselves live in lib/now-card.ts and are tested in tests/now-card.test.mjs.
// Here: the app shows exactly what the site shows, adds the owner's quick request, and knows where a tap leads.
const {nowCard, unbrokenTime} = await loadPure('mobile/src/now-card.ts', 'lib/now-card.ts');
const shared = await loadPure('lib/now-card.ts');

// 11 November 2026, 10:00 in Kazakhstan (UTC+5).
const now = Date.parse('2026-11-11T05:00:00Z') / 1000;
const at = iso => Date.parse(iso) / 1000;
const user = {id: 'me'};
const booking = extra => ({id: 'b1', title: 'Студия у набережной', guest_id: 'me', owner_id: 'owner', status: 'confirmed', start: at('2026-11-12T09:00:00Z'), end: at('2026-11-13T07:00:00Z'), expires_at: now + 1800, terms: {}, ...extra});
const job = extra => ({id: 'j1', title: 'Студия у набережной', assigned_to: 'me', status: 'assigned', start: at('2026-11-12T07:00:00Z'), end: at('2026-11-12T09:00:00Z'), ...extra});

test('nothing real means no card for any role', () => {
  for (const role of ['guest', 'owner', 'cleaner']) assert.equal(nowCard(role, {user, bookings: [], jobs: []}, now), null);
  assert.equal(nowCard('guest', {user: null, bookings: [booking()]}, now), null);
  const stale = [booking({status: 'cancelled'}), booking({id: 'b2', start: now - 90000, end: now - 3600, terms: {actual_checkin: now - 90000, actual_checkout: now - 3600}}), booking({id: 'b3', guest_id: 'other'})];
  assert.equal(nowCard('guest', {user, bookings: stale}, now), null);
});

test('the title says what is happening; the detail is one line with the time first', () => {
  const next = nowCard('guest', {user, bookings: [booking()]}, now);
  assert.deepEqual(next, {key: 'checkin:b1:Ближайший заезд', title: 'Ближайший заезд', detail: 'Завтра в 14:00 · Студия у набережной', action: 'Открыть', urgent: false, target: {type: 'process', kind: 'booking', id: 'b1'}});
  const requested = booking({id: 'b2', status: 'requested', start: at('2026-11-11T13:00:00Z'), end: at('2026-11-11T16:00:00Z')});
  const waiting = nowCard('guest', {user, bookings: [booking(), requested]}, now);
  assert.equal(waiting.title, 'Ждём ответа владельца');
  assert.equal(waiting.detail, 'Заезд сегодня в 18:00 · Студия у набережной');
});

test('the guest is "заселён" only after the check-in is confirmed', () => {
  const started = booking({start: now - 7200, end: at('2026-11-12T05:00:00Z')});
  const arrived = nowCard('guest', {user, bookings: [started]}, now);
  assert.equal(arrived.title, 'Время заезда наступило');
  assert.equal(arrived.detail, 'Выезд завтра в 10:00 · Студия у набережной');
  assert.equal(nowCard('guest', {user, bookings: [{...started, terms: {actual_checkin: now - 7000}}]}, now).title, 'Вы заселены');
});

test('after the check-out time the guest is asked to report it', () => {
  const over = booking({start: now - 90000, end: now - 3600, terms: {actual_checkin: now - 90000}});
  const overdue = nowCard('guest', {user, bookings: [over]}, now);
  assert.equal(overdue.title, 'Сообщите о выезде');
  assert.equal(overdue.detail, 'Выезд был сегодня в 09:00 · Студия у набережной');
  assert.equal(overdue.urgent, true);
  // Once reported, the card stops asking: it is calm and no longer says "Вы заселены".
  const reported = nowCard('guest', {user, bookings: [{...over, terms: {...over.terms, checkout_reported_at: now - 60}}]}, now);
  assert.notEqual(reported.title, overdue.title);
  assert.notEqual(reported.title, 'Вы заселены');
  assert.equal(reported.urgent, false);
  assert.deepEqual(reported.target, {type: 'process', kind: 'booking', id: 'b1'});
});

test('a cleaning job past its deadline is not shown as a calm reminder', () => {
  const next = nowCard('cleaner', {user, jobs: [job({id: 'j2', start: at('2026-11-14T07:00:00Z'), end: at('2026-11-14T09:00:00Z')}), job()]}, now);
  assert.deepEqual(next, {key: 'job:j1:Следующая уборка', title: 'Следующая уборка', detail: 'Завтра в 12:00 · Студия у набережной', action: 'Открыть', urgent: false, target: {type: 'process', kind: 'job', id: 'j1'}});
  const late = nowCard('cleaner', {user, jobs: [job({start: now - 18000, end: now - 10800})]}, now);
  assert.equal(late.title, 'Срок уборки прошёл');
  assert.equal(late.urgent, true);
  const running = nowCard('cleaner', {user, jobs: [job(), job({id: 'j3', status: 'in_progress', start: now - 600, end: at('2026-11-11T08:00:00Z')})]}, now);
  assert.equal(running.title, 'Уборка идёт');
  assert.equal(running.detail, 'Срок: сегодня в 13:00 · Студия у набережной');
});

test('the owner sees a quick request first, then a booking request, then today', () => {
  const mine = extra => booking({guest_id: 'guest', owner_id: 'me', ...extra});
  const checkin = mine({id: 'in', start: at('2026-11-11T09:00:00Z'), end: at('2026-11-12T07:00:00Z')});
  const today = nowCard('owner', {user, bookings: [checkin]}, now);
  assert.equal(today.title, 'Заезд гостя');
  assert.equal(today.detail, 'Сегодня в 14:00 · Студия у набережной');
  assert.deepEqual(today.target, {type: 'process', kind: 'booking', id: 'in'});

  const requested = mine({id: 'r1', status: 'requested', start: at('2026-11-13T09:00:00Z')});
  const request = nowCard('owner', {user, bookings: [checkin, requested]}, now);
  assert.equal(request.title, 'Заявка ждёт ответа');
  assert.equal(request.detail, 'Заезд 13 ноября в 14:00 · Студия у набережной');
  assert.equal(request.action, 'Ответить');
  assert.equal(request.urgent, true);
  assert.deepEqual(request.target, {type: 'process', kind: 'booking', id: 'r1'});

  // A quick request has a two-minute window: it goes first and opens the sheet. An expired one is ignored.
  const offer = {id: 'o1', title: 'Двушка в центре', expires_at: now + 90, filters: {start: '2026-11-11T13:00:00.000Z'}};
  const quick = nowCard('owner', {user, bookings: [requested]}, now, {quickOffers: [offer]});
  assert.deepEqual(quick, {key: 'offer:o1', title: 'Гость ждёт ответа', detail: 'Заезд сегодня в 18:00 · Двушка в центре', action: 'Ответить', urgent: true, target: {type: 'sheet'}});
  assert.equal(nowCard('owner', {user, bookings: []}, now, {quickOffers: [{...offer, expires_at: now - 1}]}), null);
  // The owner's own trips as a guest do not appear in the owner role.
  assert.equal(nowCard('owner', {user, bookings: [booking({status: 'requested'})]}, now), null);
});

test('a card without a booking or a job opens a page the app has', () => {
  const brief = task => ({automatic: true, prompts: [{title: 'Проверить квартиру', reason: 'Гости спрашивают про парковку', priority: 2, at: now, ...task}]});
  const property = nowCard('owner', {user, bookings: [], assistantBrief: brief({kind: 'property', entityId: 'p1'})}, now);
  assert.equal(property.title, 'Проверить квартиру');
  assert.deepEqual(property.target, {type: 'page', id: 'properties'});
  // A section the app does not have opens the summary.
  const other = nowCard('guest', {user, bookings: [], assistantBrief: brief({kind: 'note', section: 'operations'})}, now);
  assert.deepEqual(other.target, {type: 'page', id: 'overview'});
});

test('every card is the site\'s card, word for word', () => {
  const cases = [
    ['guest', {user, bookings: [booking()]}],
    ['guest', {user, bookings: [booking({start: now - 90000, end: now - 3600})]}],
    ['guest', {user, bookings: [booking({start: now - 90000, end: now - 3600, terms: {actual_checkin: now - 90000, checkout_reported_at: now - 60}})]}],
    ['guest', {user, bookings: [booking({start: now - 7200, end: now + 7200})]}],
    ['owner', {user, bookings: [booking({guest_id: 'g', owner_id: 'me', start: now + 3600, end: now + 90000})]}],
    ['cleaner', {user, jobs: [job({start: now - 18000, end: now - 10800})]}],
    ['owner', {user, bookings: [booking({guest_id: 'g', owner_id: 'me', status: 'requested'})]}],
    ['cleaner', {user, jobs: [job()]}],
    ['cleaner', {user, jobs: [job({status: 'submitted'})]}]
  ];
  for (const [role, data] of cases) {
    const mine = nowCard(role, data, now), theirs = shared.nowCard(role, data, now);
    assert.deepEqual([mine.title, mine.detail, mine.action, mine.urgent], [theirs.title, theirs.detail, theirs.actionLabel, !!theirs.urgent]);
  }
});

test('on the screen the time of the detail line is never split or cut', () => {
  const shown = unbrokenTime('Выезд был сегодня в 09:00 · Студия у набережной');
  // The only places a narrow card may break the line are after the dot and inside the flat name.
  assert.equal(shown, 'Выезд\u00a0был\u00a0сегодня\u00a0в\u00a009:00\u00a0· Студия у набережной');
  assert.equal(unbrokenTime('Гости спрашивают про парковку'), 'Гости спрашивают про парковку');
});
