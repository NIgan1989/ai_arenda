import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/platform.mjs';

const { stayWords } = await load('stay-words');
const { categories } = await load('listings');
const { guestSteps } = await load('guest-trips');
const { ownerSteps } = await load('owner-steps');
const { tripThread } = await load('process-threads');

test('у каждой категории свои слова брони', () => {
  for (const type of categories.stay.types) assert.equal(stayWords(type).arrive, 'Заезд');
  for (const type of categories.bath.types) assert.equal(stayWords(type).arrive, 'Приход');
  for (const type of categories.banquet.types) assert.equal(stayWords(type).arrive, 'Начало');
  assert.equal(stayWords(undefined).stay, 'Проживание');
});

const now = 1_800_000_000;
const booking = (property_type) => ({ id: 'b', status: 'confirmed', payment_status: 'owner_verified', amount: 1000, start: now - 600, end: now + 7200, property_type, terms: { paid_amount: 1000 } });

test('гость бани приходит и уходит, а не заселяется', () => {
  assert.deepEqual(guestSteps(booking('banya'), now).filter(s => s.id !== 'late').map(s => s.label), ['Я на месте', 'Сообщить об уходе']);
  assert.deepEqual(guestSteps(booking('banquet'), now).filter(s => s.id !== 'late').map(s => s.label), ['Мы на месте', 'Сообщить об окончании']);
  assert.deepEqual(guestSteps(booking('flat'), now).filter(s => s.id !== 'late').map(s => s.label), ['Я заселился', 'Сообщить о выезде']);
});

test('владелец бани и зала видит свои слова', () => {
  assert.deepEqual(ownerSteps(booking('sauna'), now).map(s => s.label), ['Подтвердить приход', 'Подтвердить уход']);
  assert.deepEqual(ownerSteps(booking('cafe'), now).map(s => s.label), ['Подтвердить начало', 'Подтвердить окончание']);
});

test('нить брони зала: начало, мероприятие, окончание', () => {
  const labels = tripThread(booking('banquet'), now).steps.map(s => s.label);
  assert.deepEqual(labels.slice(2), ['Начало', 'Мероприятие', 'Окончание']);
  assert.ok(!JSON.stringify(tripThread(booking('banya'), now)).match(/аезд|ыезд|рожив|засел/));
});

test('оповещения: жильё прежними словами, баня и зал своими', async () => {
  const { venueOr, isHome } = await load('stay-words');
  assert.equal(venueOr({ property_type: 'flat' }, 'жильё', 'объект'), 'жильё');
  assert.equal(venueOr({}, 'жильё', 'объект'), 'жильё');
  assert.equal(venueOr({ property_type: 'sauna' }, 'жильё', 'объект'), 'объект');
  assert.ok(!isHome({ property_type: 'cafe' }));
  for (const type of ['banya', 'banquet']) for (const text of Object.values(stayWords(type))) assert.ok(!/аезд|ыезд|рожив|засел|жиль/i.test(text), text);
});
