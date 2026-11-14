import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './helpers/platform.mjs';

const { jobPlace, cleaningTasks, cleaningTime, streetAddress } = await load('job-place');
const { nowCard, ownerResponses, ownerWaiting } = await load('now-card');
const { calendarEntries } = await load('calendar-days');
const { hubLine, hubToday } = await load('property-hub');

const now = Date.UTC(2026, 10, 14, 7) / 1000, DAY = 86400;

test('the cleaner sees the place: kind, area of the city, size and what to clean, the address hidden', () => {
  const v = jobPlace({
    city: 'Павлодар', district: 'Центр', rooms: 2, cleaning_minutes: 90, address: null,
    property_photos: '["a","b"]',
    property_details: JSON.stringify({ type: 'apartment', area: 54, beds: 2, bathrooms: 1, floor: 2, floors: 9, amenities: ['wifi', 'washer', 'iron'] }),
    description: 'Сменить бельё, помыть ванную и кухню, вынести мусор',
  });
  assert.equal(v.kind, 'Квартира');
  assert.equal(v.where, 'Павлодар, Центр');
  assert.equal(v.summary, 'Квартира · 2 комнаты · 54 м²');
  assert.deepEqual(v.photos, ['a', 'b']);
  assert.deepEqual(v.facts.map(f => f.value + ' ' + f.label), ['2 комнаты', '54 м² площадь', '2 спальных места', '1 санузел']);
  assert.equal(v.floor, '2 этаж из 9');
  assert.deepEqual(v.kit, ['Стиральная машина', 'Утюг']);
  assert.deepEqual(v.tasks, ['Сменить бельё', 'Помыть ванную и кухню', 'Вынести мусор']);
  assert.equal(v.exact, false);
  assert.equal(jobPlace({ street: 'ул. Абая 12', city: 'Павлодар' }).street, 'ул. Абая 12');
  assert.equal(jobPlace({ street: 'ул. Абая 12', address: 'ул. Абая 12, кв. 45' }).street, '');
  assert.equal(streetAddress('ул. Абая 12, кв. 45'), 'ул. Абая 12');
  assert.equal(streetAddress('Павлодар, ул. Ленина 5 кв 3'), 'Павлодар, ул. Ленина 5');
  assert.equal(streetAddress('пр. Назарбаева 101, подъезд 2, этаж 5'), 'пр. Назарбаева 101');
  assert.equal(cleaningTime(90), '≈ 1 ч 30 мин');
});

test('a place with nothing filled in still reads as housing, and a free text stays whole', () => {
  const v = jobPlace({ title: 'Студия' });
  assert.equal(v.kind, 'Жильё');
  assert.equal(v.summary, 'Жильё');
  assert.deepEqual(v.photos, []);
  assert.deepEqual(v.facts, []);
  assert.deepEqual(cleaningTasks('Генеральная уборка'), ['Генеральная уборка']);
  assert.deepEqual(cleaningTasks('Окна, а также балкон'), ['Окна', 'А также балкон']);
});

test("a cleaner's response reaches the owner: «Заявки», the card «Сейчас» and the flat's «Ждут ответа»", () => {
  const job = { id: 'j1', owner_id: 'o', property_id: 'p', title: 'Жильё у парка', status: 'open', start: now + DAY, end: now + DAY + 7200, fee: 6000 };
  const data = {
    user: { id: 'o' }, bookings: [], jobs: [job, { ...job, id: 'j2', status: 'assigned', assigned_to: 'c2' }],
    applications: [{ id: 'a1', job_id: 'j1', user_id: 'c', status: 'pending' }, { id: 'a2', job_id: 'j1', user_id: 'c3', status: 'rejected' }],
  };
  assert.deepEqual(ownerResponses(data, 'o', now).map(r => [r.job.id, r.count]), [['j1', 1]]);
  assert.equal(ownerWaiting(data, 'o', now), 1);
  const card = nowCard('owner', data, now);
  assert.equal(card.kind, 'application');
  assert.equal(card.entityId, 'j1');
  assert.equal(card.title, 'Откликнулся исполнитель');
  const entries = calendarEntries(data, 'owner', 'p', now);
  assert.deepEqual(hubToday(entries, now).waiting.map(e => e.id), ['j1']);
  assert.equal(hubLine(entries, now), 'Уборка: откликнулся исполнитель');
  // Someone else's cleaning, or one that has ended, waits for nobody.
  assert.equal(ownerWaiting(data, 'x', now), 0);
  assert.equal(ownerWaiting({ ...data, jobs: [{ ...job, end: now - 1 }] }, 'o', now), 0);
});
