import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {mapSearchRequest,mapSearchFilters}=await load('map-search-request');
const current={city:'Павлодар',guests:'1',mode:'daily'},cities=['Астана','Алматы','Павлодар'],now=Date.parse('2026-10-30T18:00:00+05:00');
test('guided search transfers only search conditions and cannot transfer actions or stale pagination',()=>{
 assert.deepEqual(mapSearchFilters({city:'Астана',guests:'3',maxPrice:'10000',page:'99',action:'confirm',userId:'other',role:'owner',rooms:5,start:'',syntheticPreview:true}),{city:'Астана',guests:'3',mode:'daily',page:'1',maxPrice:'10000'});
});
test('map request extracts city, room minimum, capacity and KZT budget without opening administrator chat',()=>{
 const r=mapSearchRequest('Найди 2-комнатную в Астане для 3 гостей до 20 тысяч',current,cities,now);assert.equal(r.filters.city,'Астана');assert.equal(r.filters.rooms,'2');assert.equal(r.filters.guests,'3');assert.equal(r.filters.maxPrice,'20000');assert.equal(r.nearby,false);assert.ok(r.notes.some(n=>n.includes('заезд')));
});

test('word room counts and exact versus minimum survive transfer to map filters',()=>{
 const exact=mapSearchRequest('Найди однокомнатную квартиру',current,cities,now);assert.equal(exact.filters.rooms,'1');assert.equal(exact.filters.roomsExact,'1');
 const minimum=mapSearchRequest('Найди от 2 комнат в квартире',current,cities,now);assert.equal(minimum.filters.rooms,'2');assert.equal(minimum.filters.roomsExact,'0');
 assert.equal(mapSearchFilters(exact.filters).roomsExact,'1');assert.notEqual(mapSearchRequest('Не дороже 15000',current,cities,now).filters.sort,'price-desc');
});
test('relative dates use Kazakhstan time, future start and stated duration',()=>{
 const r=mapSearchRequest('Свободную завтра на 2 суток',current,cities,now);assert.equal(r.filters.start,'2026-10-31T14:00');assert.equal(r.filters.end,'2026-11-02T14:00');assert.deepEqual(r.notes,[]);
 const today=mapSearchRequest('Сегодня на 3 часа',current,cities,now);assert.equal(today.filters.start,'2026-10-30T18:05');assert.equal(today.filters.end,'2026-10-30T21:05');assert.equal(today.filters.mode,'hourly');
});
test('explicit dates do not become a price; invalid calendar dates require clarification',()=>{
 const r=mapSearchRequest('с 2026-11-01 до 2026-11-03',current,cities,now);assert.equal(r.filters.maxPrice,undefined);assert.equal(r.filters.start,'2026-11-01T14:00');assert.equal(r.filters.end,'2026-11-03T14:00');
 const invalid=mapSearchRequest('с 2026-11-31 по 2026-12-03',{...current,start:'2026-11-01T14:00',end:'2026-11-02T14:00'},cities,now);assert.equal(invalid.filters.start,undefined);assert.ok(invalid.notes.some(n=>n.includes('Уточните')));
});
test('nearby request requires a location and unknown requests never invent availability',()=>{
 const r=mapSearchRequest('Свободную рядом со мной',current,cities,now);assert.equal(r.nearby,true);assert.equal(r.filters.start,undefined);assert.ok(r.notes.length);
 const unknown=mapSearchRequest('с бассейном и красивым видом',current,cities,now);assert.equal(unknown.filters.city,'Павлодар');assert.equal(unknown.filters.start,undefined);assert.equal(unknown.summary,'Павлодар');
});

// ---------- The one-line request of the guest's first screen ----------
const lib = await load('map-search-request');
const {
  guestSearchRequest, guestRequestLine, unbrokenParts, stayLine, stayWhen, dailyStay, hourlyStay, defaultStay, weekendStay,
  nextSlot, stayNights, stayHours, NO_BUDGET,
} = lib;

const at = local => Date.parse(local + ':00+05:00');
// Wednesday 11 November 2026, 10:00 in Kazakhstan.
const morning = at('2026-11-11T10:00');
const evening = at('2026-11-11T20:17');
const draft = {
  city: 'Павлодар', district: '', mode: 'daily', guests: '2', maxPrice: '', priority: 'balanced', features: [],
  start: '2026-11-11T14:00', end: '2026-11-12T12:00', near: null,
};
const guest = (text, now = morning, from = draft) => guestSearchRequest(text, from, cities, now);
const stay = result => [result.filters.mode, result.filters.start, result.filters.end];

test('a stay is check-in at 14:00 and check-out at 12:00 in Kazakhstan time, never in the past', () => {
  assert.deepEqual(dailyStay('2026-11-12', '2026-11-13', morning), { start: '2026-11-12T14:00', end: '2026-11-13T12:00' });
  // Today after 14:00 the check-in is the nearest half-hour that leaves 30 minutes.
  assert.deepEqual(dailyStay('2026-11-11', '2026-11-12', evening), { start: '2026-11-11T21:00', end: '2026-11-12T12:00' });
  // A check-out that is not later than the check-in moves to the first noon after it.
  assert.deepEqual(dailyStay('2026-11-12', '2026-11-12', morning), { start: '2026-11-12T14:00', end: '2026-11-13T12:00' });
  assert.deepEqual(dailyStay('2026-11-11', '2026-11-11', at('2026-11-11T23:50')), { start: '2026-11-12T00:30', end: '2026-11-12T12:00' });
  assert.deepEqual(hourlyStay('2026-11-11', '22:30', 3), { start: '2026-11-11T22:30', end: '2026-11-12T01:30' });
  assert.equal(new Date(nextSlot(at('2026-11-11T10:01'))).toISOString(), '2026-11-11T06:00:00.000Z');
  assert.equal(stayNights('2026-11-12T14:00', '2026-11-14T12:00'), 2);
  assert.equal(stayHours('2026-11-11T19:00', '2026-11-11T22:00'), 3);
});

test('the three shortcuts: a day from today, the nearest hours, the nearest weekend', () => {
  assert.deepEqual(defaultStay('daily', morning), { mode: 'daily', start: '2026-11-11T14:00', end: '2026-11-12T12:00' });
  assert.deepEqual(defaultStay('hourly', morning), { mode: 'hourly', start: '2026-11-11T10:30', end: '2026-11-11T13:30' });
  assert.deepEqual(defaultStay('hourly', at('2026-11-11T23:40'), 2), { mode: 'hourly', start: '2026-11-12T00:30', end: '2026-11-12T02:30' });
  // Wednesday: the nearest Saturday is 14 November.
  assert.deepEqual(weekendStay(morning), { mode: 'daily', start: '2026-11-14T14:00', end: '2026-11-15T12:00' });
  // On Saturday evening the weekend is today; on Sunday it is the next one.
  assert.deepEqual(weekendStay(at('2026-11-14T18:10')), { mode: 'daily', start: '2026-11-14T19:00', end: '2026-11-15T12:00' });
  assert.deepEqual(weekendStay(at('2026-11-15T09:00')), { mode: 'daily', start: '2026-11-21T14:00', end: '2026-11-22T12:00' });
});

test('dates read in Russian', () => {
  assert.equal(stayLine('2026-11-12T14:00', '2026-11-13T12:00', 'daily', morning), '12 ноября, 14:00 — 13 ноября, 12:00 · 1 сутки');
  assert.equal(stayLine('2026-11-12T14:00', '2026-11-17T12:00', 'daily', morning), '12 ноября, 14:00 — 17 ноября, 12:00 · 5 суток');
  assert.equal(stayLine('2026-11-12T19:00', '2026-11-12T22:00', 'hourly', morning), '12 ноября, 19:00–22:00 · 3 часа');
  assert.equal(stayLine('2026-11-12T22:00', '2026-11-13T03:00', 'hourly', morning), '12 ноября, 22:00 — 13 ноября, 03:00 · 5 часов');
  assert.equal(stayWhen('2026-11-11T19:00', '2026-11-11T22:00', 'hourly', morning), 'сегодня 19:00–22:00');
  assert.equal(stayWhen('2026-11-12T09:00', '2026-11-12T12:00', 'hourly', morning), 'завтра 09:00–12:00');
  assert.equal(stayWhen('2026-11-14T14:00', '2026-11-15T12:00', 'daily', morning), '14–15 ноября');
  assert.equal(stayWhen('2026-11-30T14:00', '2026-12-02T12:00', 'daily', morning), '30 ноября — 2 декабря');
});

test('the summary line names the city, the time and the guests; the budget only when there is one', () => {
  const hourly = { ...draft, mode: 'hourly', start: '2026-11-11T19:00', end: '2026-11-11T22:00' };
  assert.equal(guestRequestLine(hourly, morning), 'Павлодар · сегодня 19:00–22:00 · 2 гостя');
  assert.equal(guestRequestLine({ ...hourly, district: 'Центр', guests: '1', maxPrice: '15000' }, morning), 'Павлодар, Центр · сегодня 19:00–22:00 · 1 гость · до 15 000 ₸');
  assert.equal(guestRequestLine({ ...draft, guests: '5', maxPrice: NO_BUDGET }, morning), 'Павлодар · 11–12 ноября · 5 гостей');
});

test('the placeholder request: three hours today in the centre', () => {
  const result = guest('Квартира на 3 часа сегодня в центре');
  assert.deepEqual(stay(result), ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  assert.equal(result.filters.district, 'Центр');
  assert.deepEqual(result.stated, { city: false, district: true, when: true, guests: false, budget: false, wishes: false });
  assert.equal(result.understood, true);
  // Nothing the text did not name is changed.
  assert.equal(result.filters.city, 'Павлодар');
  assert.equal(result.filters.guests, '2');
});

test('hours: "на 3 часа", an evening, a named hour', () => {
  assert.deepEqual(stay(guest('на 3 часа')), ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  assert.deepEqual(stay(guest('на 2 часа сегодня вечером')), ['hourly', '2026-11-11T19:00', '2026-11-11T21:00']);
  // 20:17: this evening has begun, so the stay starts at the nearest half-hour.
  assert.deepEqual(stay(guest('на 2 часа сегодня вечером', evening)), ['hourly', '2026-11-11T21:00', '2026-11-11T23:00']);
  assert.deepEqual(stay(guest('завтра утром на 4 часа')), ['hourly', '2026-11-12T09:00', '2026-11-12T13:00']);
  assert.deepEqual(stay(guest('в 18:30 на пару часов')), ['hourly', '2026-11-11T18:30', '2026-11-11T20:30']);
  // A named hour that has passed, with no day, means tomorrow.
  assert.deepEqual(stay(guest('в 9 утра на 3 часа')), ['hourly', '2026-11-12T09:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('почасовая завтра')), ['hourly', '2026-11-12T14:00', '2026-11-12T17:00']);
  // The length chosen before is kept when the text names only the day.
  const six = { ...draft, mode: 'hourly', start: '2026-11-11T12:00', end: '2026-11-11T18:00' };
  assert.deepEqual(stay(guest('завтра вечером', morning, six)), ['hourly', '2026-11-12T19:00', '2026-11-13T01:00']);
});

test('days: "сегодня", "завтра", "на сутки", "на выходные", a weekday and written dates', () => {
  assert.deepEqual(stay(guest('сегодня')), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('сегодня', evening)), ['daily', '2026-11-11T21:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('завтра')), ['daily', '2026-11-12T14:00', '2026-11-13T12:00']);
  assert.deepEqual(stay(guest('на сутки')), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('на сутки', morning, { ...draft, mode: 'hourly' })), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('завтра на двое суток')), ['daily', '2026-11-12T14:00', '2026-11-14T12:00']);
  assert.deepEqual(stay(guest('на выходные')), ['daily', '2026-11-14T14:00', '2026-11-15T12:00']);
  assert.deepEqual(stay(guest('в пятницу на неделю')), ['daily', '2026-11-13T14:00', '2026-11-20T12:00']);
  assert.deepEqual(stay(guest('с 14 по 16 ноября')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
  assert.deepEqual(stay(guest('с 30 ноября по 2 декабря')), ['daily', '2026-11-30T14:00', '2026-12-02T12:00']);
  assert.deepEqual(stay(guest('с 14.11 по 16.11')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
  assert.deepEqual(stay(guest('с 2026-11-20 по 2026-11-22')), ['daily', '2026-11-20T14:00', '2026-11-22T12:00']);
  // A date that has passed this year is next year's.
  assert.deepEqual(stay(guest('5 января на 3 суток')), ['daily', '2027-01-05T14:00', '2027-01-08T12:00']);
  assert.deepEqual(stay(guest('срочно на сутки')), ['daily', '2026-11-11T10:30', '2026-11-12T12:00']);
});

test('guests, city, district and budget', () => {
  assert.equal(guest('на двоих').filters.guests, '2');
  assert.equal(guest('2 гостя', morning, { ...draft, guests: '1' }).filters.guests, '2');
  assert.equal(guest('нас трое').filters.guests, '3');
  assert.equal(guest('для 4 человек').filters.guests, '4');
  // "двое суток" is a length of stay.
  assert.equal(guest('на двое суток').stated.guests, false);

  const city = guest('Астана', morning, { ...draft, district: 'Центр', near: { longitude: 76.95, latitude: 52.28, radius: 5000 } });
  assert.equal(city.filters.city, 'Астана');
  assert.equal(city.filters.district, '');
  assert.equal(city.filters.near, null);
  assert.equal(city.stated.city, true);
  assert.equal(guest('в Алматы в центре').filters.district, 'Центр');

  assert.equal(guest('до 15000').filters.maxPrice, '15000');
  assert.equal(guest('до 15 000 тенге').filters.maxPrice, '15000');
  assert.equal(guest('не дороже 20 тысяч').filters.maxPrice, '20000');
  // A time, a date or a count after "до" is not money.
  for (const text of ['до 18:00', 'с 12 до 14 ноября', 'до 3 часов', 'до 5 гостей', 'надо 2 комнаты']) {
    assert.equal(guest(text).stated.budget, false, text);
  }
  assert.equal(guest('подешевле с парковкой и wi-fi').filters.priority, 'cheaper');
  assert.deepEqual(guest('подешевле с парковкой и wi-fi').filters.features, ['parking', 'wifi']);
});

test('what the text does not name is asked for, not invented', () => {
  // No day and no length: the dates stay as they were and the screen asks "когда".
  for (const text of ['на двоих', 'Астана', 'в центре', 'до 15000']) {
    const result = guest(text);
    assert.equal(result.stated.when, false, text);
    assert.equal(result.understood, true, text);
    assert.deepEqual([result.filters.start, result.filters.end], [draft.start, draft.end], text);
  }
  const unknown = guest('с бассейном и красивым видом');
  assert.equal(unknown.understood, false);
  assert.deepEqual(unknown.filters, draft);
  const near = guest('квартира рядом на 3 часа');
  assert.equal(near.nearby, true);
  assert.equal(guest('рядом с вокзалом').nearby, false);
});

test('a whole sentence', () => {
  const result = guest('Квартира в Астане на двоих завтра с 19:00 на 3 часа до 15 тысяч');
  assert.deepEqual(stay(result), ['hourly', '2026-11-12T19:00', '2026-11-12T22:00']);
  assert.equal(result.filters.city, 'Астана');
  assert.equal(result.filters.guests, '2');
  assert.equal(result.filters.maxPrice, '15000');
  assert.equal(guestRequestLine(result.filters, morning), 'Астана · завтра 19:00–22:00 · 2 гостя · до 15 000 ₸');
});

test('the form keeps a stay in the future and offers only start times that are still ahead', () => {
  const { switchStay, freshStay, startTimes, addDays } = lib;
  assert.equal(addDays('2026-11-30', 2), '2026-12-02');
  assert.deepEqual(switchStay('hourly', '2026-11-11T14:00', morning), { mode: 'hourly', start: '2026-11-11T10:30', end: '2026-11-11T13:30' });
  assert.deepEqual(switchStay('hourly', '2026-11-14T14:00', morning), { mode: 'hourly', start: '2026-11-14T14:00', end: '2026-11-14T17:00' });
  assert.deepEqual(switchStay('daily', '2026-11-14T19:00', morning), { mode: 'daily', start: '2026-11-14T14:00', end: '2026-11-15T12:00' });

  // A form left open: the same length, moved to the nearest half-hour.
  assert.deepEqual(freshStay({ mode: 'hourly', start: '2026-11-11T08:00', end: '2026-11-11T12:00' }, morning), { start: '2026-11-11T10:30', end: '2026-11-11T14:30' });
  assert.deepEqual(freshStay({ mode: 'daily', start: '2026-11-10T14:00', end: '2026-11-13T12:00' }, evening), { start: '2026-11-11T21:00', end: '2026-11-13T12:00' });
  const ahead = { mode: 'daily', start: '2026-11-12T14:00', end: '2026-11-13T12:00' };
  assert.deepEqual(freshStay(ahead, morning), { start: ahead.start, end: ahead.end });

  assert.deepEqual(startTimes('2026-11-11', morning).slice(0, 2), ['10:30', '11:00']);
  assert.equal(startTimes('2026-11-12', morning).length, 48);
  assert.deepEqual(startTimes('2026-11-11', at('2026-11-11T23:55'), '23:30'), ['23:30']);
  assert.ok(startTimes('2026-11-12', morning, '18:05').includes('18:05'));
});

// ---------- A day that has passed, hours "from … to …", and what cannot be taken as written ----------
// Thursday 12 November 2026, 04:30 in Kazakhstan: just after midnight the guest still thinks of "the 11th" as today.
const night = at('2026-11-12T04:30');
const nightDraft = { ...draft, start: '2026-11-12T14:00', end: '2026-11-13T12:00' };
const late = text => guestSearchRequest(text, nightDraft, cities, night);

test('a day that has passed is reported, never moved to next year or searched', () => {
  for (const text of [
    'на сутки 10 ноября',
    'на 5 дней с 10 ноября',
    'с 10 по 15 ноября',
    'с 10.11 по 14.11',
    'с 2026-11-01 по 2026-11-03',
    'на сутки вчера',
    'позавчера на двоих',
  ]) {
    const result = late(text);
    assert.equal(result.past, 'date', text);
    assert.equal(result.stated.when, false, text);
    assert.equal(result.understood, true, text);
    assert.deepEqual([result.filters.start, result.filters.end], [nightDraft.start, nightDraft.end], text);
  }
  // The tariff the text asked for still opens with a stay of its own kind: three hours from now, not 22 "hours".
  const hours = late('на 3 часа 11 ноября в 23:00');
  assert.equal(hours.past, 'date');
  assert.deepEqual(stay(hours), ['hourly', '2026-11-12T05:00', '2026-11-12T08:00']);
  // What else the text named is kept.
  assert.equal(late('Астана на троих 10 ноября').filters.city, 'Астана');
  assert.equal(late('Астана на троих 10 ноября').filters.guests, '3');
  // Today and the days ahead are not "passed".
  assert.equal(late('12 ноября').past, undefined);
  assert.equal(late('на сутки завтра').past, undefined);
});

test('only a date far behind is next year\'s, and then the year is printed', () => {
  const january = late('5 января на 3 суток');
  assert.deepEqual(stay(january), ['daily', '2027-01-05T14:00', '2027-01-08T12:00']);
  assert.equal(guestRequestLine(january.filters, night), 'Павлодар · 5–8 января 2027 · 2 гостя');
  assert.equal(stayLine('2027-01-05T14:00', '2027-01-08T12:00', 'daily', night), '5 января 2027, 14:00 — 8 января 2027, 12:00 · 3 суток');
  assert.equal(stayWhen('2027-01-05T19:00', '2027-01-05T22:00', 'hourly', night), '5 января 2027 19:00–22:00');
  const newYear = late('с 28 декабря по 3 января');
  assert.deepEqual(stay(newYear), ['daily', '2026-12-28T14:00', '2027-01-03T12:00']);
  assert.equal(guestRequestLine(newYear.filters, night), 'Павлодар · 28 декабря — 3 января 2027 · 2 гостя');
  // Read on 1 January, the same words mean the December that has just passed.
  const afterNewYear = guestSearchRequest('с 28 декабря по 3 января', nightDraft, cities, at('2027-01-01T10:00'));
  assert.equal(afterNewYear.past, 'date');
  // In the current year no year is printed.
  assert.equal(stayWhen('2026-11-14T14:00', '2026-11-15T12:00', 'daily', night), '14–15 ноября');
});

test('a check-in date that has passed becomes today until tomorrow, not "now until noon"', () => {
  // The date field was typed by hand: check-in on the 10th, one night.
  assert.deepEqual(dailyStay('2026-11-10', '2026-11-11', night), { start: '2026-11-12T14:00', end: '2026-11-13T12:00' });
  // A check-out that is still ahead is kept.
  assert.deepEqual(dailyStay('2026-11-10', '2026-11-15', night), { start: '2026-11-12T14:00', end: '2026-11-15T12:00' });
  // After 14:00 the check-in is the nearest half-hour, the check-out still tomorrow.
  assert.deepEqual(dailyStay('2026-11-10', '2026-11-11', at('2026-11-12T18:10')), { start: '2026-11-12T19:00', end: '2026-11-13T12:00' });
});

test('"с 18 до 21" is hours; "с 14 по 16 ноября" stays a range of dates', () => {
  assert.deepEqual(stay(late('сегодня с 18 до 21')), ['hourly', '2026-11-12T18:00', '2026-11-12T21:00']);
  assert.deepEqual(stay(late('с 18:00 до 21:00 сегодня')), ['hourly', '2026-11-12T18:00', '2026-11-12T21:00']);
  assert.deepEqual(stay(late('завтра с 18:30 до 21')), ['hourly', '2026-11-13T18:30', '2026-11-13T21:30']);
  assert.deepEqual(stay(late('с 6 до 9 вечера')), ['hourly', '2026-11-12T18:00', '2026-11-12T21:00']);
  assert.deepEqual(stay(late('с 9 утра до 12 завтра')), ['hourly', '2026-11-13T09:00', '2026-11-13T12:00']);
  // Past midnight.
  assert.deepEqual(stay(late('с 22 до 2 завтра')), ['hourly', '2026-11-13T22:00', '2026-11-14T02:00']);
  // The end of the range is not a budget.
  assert.equal(late('сегодня с 18 до 21').stated.budget, false);
  assert.deepEqual(stay(late('с 14 по 16 ноября')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
  assert.deepEqual(stay(late('с 14 до 16 ноября')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
  assert.deepEqual(stay(late('с 14.11 по 16.11')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
});

test('"до 15 ноября" is the check-out of a stay that starts today', () => {
  assert.deepEqual(stay(late('до 15 ноября')), ['daily', '2026-11-12T14:00', '2026-11-15T12:00']);
  assert.deepEqual(stay(late('по 15 ноября на двоих')), ['daily', '2026-11-12T14:00', '2026-11-15T12:00']);
  assert.deepEqual(stay(late('до 20.11')), ['daily', '2026-11-12T14:00', '2026-11-20T12:00']);
  assert.equal(late('до 15 ноября').stated.budget, false);
  // "Until today" is one night from today; "until the 10th" has passed.
  assert.deepEqual(stay(late('до 12 ноября')), ['daily', '2026-11-12T14:00', '2026-11-13T12:00']);
  assert.equal(late('до 10 ноября').past, 'date');
});

test('an hour of today that has passed is reported, never moved to the nearest time', () => {
  // 04:30: "today at two" and "today from one to three" are behind.
  for (const text of ['сегодня в 2:00 на 3 часа', 'сегодня с 1 до 3', 'на сутки сегодня в 3 утра', '12 ноября в 02:30 на 2 часа']) {
    const result = late(text);
    assert.equal(result.past, 'time', text);
    assert.equal(result.stated.when, false, text);
    assert.deepEqual(result.remarks, [], text);
  }
  // The dates of the form are left as they were; only a tariff the text changed opens with its own kind of stay.
  assert.deepEqual(stay(late('на сутки сегодня в 3 утра')), ['daily', nightDraft.start, nightDraft.end]);
  assert.deepEqual(stay(late('сегодня в 2:00 на 3 часа')), ['hourly', '2026-11-12T05:00', '2026-11-12T08:00']);

  // A part of the day is behind only when all of it is: at 20:17 the morning and the afternoon are, the evening is not.
  assert.equal(guest('на 2 часа сегодня утром', evening).past, 'time');
  assert.equal(guest('на 2 часа сегодня днём', evening).past, 'time');
  const tonight = guest('на 2 часа сегодня вечером', evening);
  assert.equal(tonight.past, undefined);
  assert.deepEqual(stay(tonight), ['hourly', '2026-11-11T21:00', '2026-11-11T23:00']);
  assert.deepEqual(tonight.remarks, []);

  // Without a named day the nearest such hour is meant: tomorrow's, and nothing has "passed".
  const nine = guest('в 9 утра на 3 часа', evening);
  assert.equal(nine.past, undefined);
  assert.deepEqual(stay(nine), ['hourly', '2026-11-12T09:00', '2026-11-12T12:00']);
  assert.deepEqual(stay(guest('с 18 до 20', evening)), ['hourly', '2026-11-12T18:00', '2026-11-12T20:00']);
  assert.deepEqual(stay(guest('утром на 2 часа', evening)), ['hourly', '2026-11-12T09:00', '2026-11-12T11:00']);
  // The evening is still on: "вечером" without a day is this evening.
  assert.deepEqual(stay(guest('вечером на 2 часа', evening)), ['hourly', '2026-11-11T21:00', '2026-11-11T23:00']);

  // An hour that is ahead but closer than the nearest half-hour that can be taken: that half-hour, and the note says so.
  const close = guest('сегодня в 20:30 на 2 часа', evening);
  assert.equal(close.past, undefined);
  assert.deepEqual(stay(close), ['hourly', '2026-11-11T21:00', '2026-11-11T23:00']);
  assert.deepEqual(close.remarks, ['Ближайшее время — 21:00.']);
  assert.deepEqual(guest('в 20:30 на 2 часа', evening).remarks, ['Ближайшее время — 21:00.']);
});

test('what is cut to the longest stay or the largest party is said, not changed in silence', () => {
  const long = late('на 30 часов завтра');
  assert.deepEqual(stay(long), ['hourly', '2026-11-13T14:00', '2026-11-14T13:00']);
  assert.deepEqual(long.remarks, ['Максимум 23 часа, ищу на 23.']);
  assert.deepEqual(stay(late('на 23 часа завтра')), ['hourly', '2026-11-13T14:00', '2026-11-14T13:00']);
  assert.deepEqual(late('на 23 часа завтра').remarks, []);
  const month = late('на 45 суток');
  assert.deepEqual(stay(month), ['daily', '2026-11-12T14:00', '2026-12-12T12:00']);
  assert.deepEqual(month.remarks, ['Максимум 30 суток, ищу на 30.']);
  assert.deepEqual(late('на 6 недель').remarks, ['Максимум 30 суток, ищу на 30.']);

  for (const text of ['99 гостей', '150 гостей на сутки']) {
    const crowd = late(text);
    assert.equal(crowd.filters.guests, '50', text);
    assert.equal(crowd.stated.guests, true, text);
    assert.equal(crowd.understood, true, text);
    assert.deepEqual(crowd.remarks, ['Гостей не больше 50, ищу на 50.'], text);
  }
  assert.deepEqual(late('50 гостей').remarks, []);
  // Several things at once: each is said.
  assert.deepEqual(late('на 40 часов завтра, 80 человек').remarks, ['Гостей не больше 50, ищу на 50.', 'Максимум 23 часа, ищу на 23.']);

  // What is taken as written needs no note.
  assert.deepEqual(guest('Квартира на 3 часа сегодня в центре').remarks, []);
});

test('the summary line breaks only between its parts and names the chosen place', () => {
  const line = guestRequestLine({ ...draft, district: 'Центр', maxPrice: '20000', mode: 'hourly', start: '2026-11-11T19:00', end: '2026-11-11T22:00' }, morning);
  assert.equal(line, 'Павлодар, Центр · сегодня 19:00–22:00 · 2 гостя · до 20 000 ₸');
  const shown = unbrokenParts(line);
  // The only places where the line may break: after each dot.
  assert.deepEqual(shown.split(' '), ['Павлодар,\u00a0Центр\u00a0·', 'сегодня\u00a019:00–\u206022:00\u00a0·', '2\u00a0гостя\u00a0·', 'до\u00a020\u00a0000\u00a0₸']);
  assert.equal(shown.replace(/\u00a0/g, ' ').replace(/\u2060/g, ''), line);
  // A range of days does not break at its dash either.
  assert.equal(unbrokenParts('Павлодар · 13–14 ноября · 2 гостя'), 'Павлодар\u00a0· 13–\u206014\u00a0ноября\u00a0· 2\u00a0гостя');
  const near = { ...draft, near: { longitude: 76.95, latitude: 52.28, radius: 5000 } };
  assert.equal(guestRequestLine(near, morning), 'Павлодар, рядом с выбранным местом · 11–12 ноября · 2 гостя');
});
