import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from './helpers/platform.mjs';

const { ownerStep, ownerSteps, ownerStepOnMap } = await load('owner-steps');
const { hubLine, hubToday } = await load('property-hub');

const now = Date.UTC(2026, 10, 14, 7) / 1000, DAY = 86400; // 12:00 in Kazakhstan
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the owner sees the most pressing step of a booking first', () => {
  assert.deepEqual(ownerSteps({ status: 'requested' }, now).map(s => s.id), ['answer']);
  assert.equal(ownerStepOnMap(ownerStep({ status: 'requested' }, now)), 'Ответить на заявку');
  assert.deepEqual(ownerSteps({ status: 'cancelled' }, now), []);
  assert.equal(ownerStep(null, now), null);
  // A paid stay that starts in two days waits for nothing from the owner.
  assert.deepEqual(ownerSteps({ status: 'confirmed', start: now + 2 * DAY, end: now + 3 * DAY, payment_status: 'owner_verified', terms: {} }, now), []);
  // The guest is at the door: check-in comes before the deposit and the payment.
  const atDoor = { status: 'confirmed', start: now - 60, end: now + DAY, payment_status: 'unpaid', terms: { deposit_status: 'pending' } };
  assert.deepEqual(ownerSteps(atDoor, now).map(s => s.id), ['checkin', 'deposit', 'paid', 'checkout']);
  // The guest reported leaving: the owner looks at the checkout, and is not offered to confirm it a second way.
  const left = { status: 'confirmed', start: now - DAY, end: now - 60, payment_status: 'owner_verified', terms: { actual_checkin: now - DAY, checkout_reported_at: now - 30 } };
  assert.deepEqual(ownerSteps(left, now).map(s => s.id), ['checkout-review']);
});

test('the «Сегодня» tab of a flat: requests first, then today, then what comes next', () => {
  const entry = (key, start, end, tone, status) => ({ key, kind: 'booking', id: key, title: 'Жильё', start, end, planned: start, tone, status });
  const entries = [
    entry('request', now + 2 * DAY, now + 3 * DAY, 'request', 'Заявка ждёт ответа'),
    entry('over', now - 5 * 3600, now - 3600, 'done', 'Завершено'),
    entry('stay', now - 3600, now + 3600, 'stay', 'Гость проживает'),
    entry('later', now + 4 * DAY, now + 5 * DAY, 'stay', 'Бронь подтверждена'),
  ];
  const view = hubToday(entries, now);
  assert.deepEqual(view.waiting.map(e => e.key), ['request']);
  assert.deepEqual(view.today.map(e => e.key), ['stay'], 'what is over today is not shown, a request is listed once');
  assert.deepEqual(view.next.map(e => e.key), ['later']);
  assert.equal(hubLine(entries, now), 'Заявка ждёт ответа');
  assert.equal(hubLine(entries.slice(1), now), 'Гость проживает');
  assert.equal(hubLine(entries.slice(3), now), 'Сегодня свободно');
  assert.equal(hubLine([], now), 'Броней и уборок нет');
  assert.equal(hubLine([entries[0], { ...entries[0], key: 'second' }], now), 'Заявок ждут ответа: 2');
});

test('the card of a flat on the map is the hub of four tabs, on the site and in the app', () => {
  const map = read('components/map-workspace.tsx'), hub = read('components/property-hub.tsx'), chat = read('app/chat.tsx');
  assert.match(map, /<PropertyHub /);
  assert.doesNotMatch(map, /PropertyListing/, 'the listing is one tap further, under «Как видят гости»');
  assert.match(map, /ownerStepOnMap\(ownerNext\)/);
  for (const label of ['Календари площадок', 'Правила и готовность', 'Постоянный исполнитель', 'Точка на карте', 'Как видят гости', 'Создать уборку', 'Изменить цены']) assert.ok(hub.includes(label), label);
  assert.match(chat, /runOwnerStep\(stay,step as OwnerStepId\)/);
  // The «Автопилот» plan is paid per flat: its switch is the first row of the flat's settings, on the site and in the app.
  assert.match(hub, /tab==='settings'&&<div className="hub-rows">\s*<FlatAutopilotRow propertyId=\{property\.id\}/);
  assert.match(read('mobile/src/FlatHub.tsx'), /<FlatAutopilotRow propertyId=\{flat\.id\}/);
  assert.match(chat, /ownerSteps\(b,data\.serverTime\)/, 'the card of the booking and the map share one rule');
  const app = read('mobile/src/MapHome.tsx'), flat = read('mobile/src/FlatHub.tsx');
  assert.match(app, /<FlatHubHead /);
  assert.match(app, /setSelected\('property:'\+p\.id\)/, 'a flat in the list opens its card, not the page of all flats');
  assert.match(flat, /hubToday\(/);
  for (const text of [hub, flat]) assert.doesNotMatch(text, /квартир|уборщиц/i);
});
