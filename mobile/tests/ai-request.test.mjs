import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {
  guestRequestFromText, guestSummary, newDraft, freshDraft, chipDraft, matchingBody, stayISO,
  withMode, withDay, withTime, withUnits, draftUnits, dayChoices, shownReasons, MAX_GUESTS, PAST_TEXT
} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
// The site's own reading of the same text: the app must never read a request differently.
const site = await loadPure('lib/map-search-request.ts');

const cities = ['Павлодар', 'Алматы', 'Астана'];
// Wednesday 11 November 2026, 10:00 in Kazakhstan (UTC+5).
const morning = Date.parse('2026-11-11T05:00:00Z');
const evening = Date.parse('2026-11-11T17:30:00Z'); // 22:30
const draft = newDraft('Павлодар', morning);
const parse = (text, now = morning, from = draft) => guestRequestFromText(text, from, cities, now);
const stay = result => [result.draft.mode, result.draft.start, result.draft.end];

test('a new request is a day from today for two guests, with no budget', () => {
  assert.deepEqual(draft, {city: 'Павлодар', district: '', mode: 'daily', start: '2026-11-11T14:00', end: '2026-11-12T12:00', guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '', now: false});
  assert.equal(guestSummary(draft, morning), 'Павлодар · 11–12 ноября · 2 гостя');
  // The server needs a number: the largest budget it accepts stands for "no limit".
  const body = matchingBody(draft);
  assert.equal(body.maxPrice, 100000000);
  assert.equal(body.start, '2026-11-11T14:00+05:00');
  assert.equal(body.end, '2026-11-12T12:00+05:00');
  assert.deepEqual(stayISO(draft), {start: '2026-11-11T09:00:00.000Z', end: '2026-11-12T07:00:00.000Z'});
});

test('the example in the line becomes three hours today in the centre', () => {
  const result = parse('На 3 часа сегодня в центре');
  assert.deepEqual(stay(result), ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  assert.equal(result.draft.district, 'Центр');
  assert.equal(result.understood, true);
  assert.equal(result.nearby, false);
  assert.equal(guestSummary(result.draft, morning), 'Павлодар, Центр · сегодня 10:30–13:30 · 2 гостя');
});

test('the three chips', () => {
  assert.deepEqual(stay({draft: chipDraft('daily', draft, morning)}), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
  assert.deepEqual(stay({draft: chipDraft('hourly', draft, morning)}), ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  // The nearest Saturday is 14 November.
  assert.deepEqual(stay({draft: chipDraft('weekend', draft, morning)}), ['daily', '2026-11-14T14:00', '2026-11-15T12:00']);
  assert.equal(guestSummary(chipDraft('weekend', draft, morning), morning), 'Павлодар · 14–15 ноября · 2 гостя');
});

test('calendar dates, ranges and word counts are read the way the site reads them', () => {
  const dated = parse('14 ноября на двоих');
  assert.deepEqual(stay(dated), ['daily', '2026-11-14T14:00', '2026-11-15T12:00']);
  assert.equal(dated.draft.guests, 2);
  assert.equal(dated.understood, true);
  assert.deepEqual(stay(parse('с 14 по 16 ноября')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
  assert.deepEqual(stay(parse('на двое суток')), ['daily', '2026-11-11T14:00', '2026-11-13T12:00']);
  assert.equal(parse('на двое суток').draft.guests, 2);
  assert.deepEqual(stay(parse('послезавтра на неделю')), ['daily', '2026-11-13T14:00', '2026-11-20T12:00']);
  // Nights are the «На ночь» tariff: the owner's nightly price where it is cheaper.
  assert.deepEqual(stay(parse('в пятницу вечером на две ночи')), ['night', '2026-11-13T19:00', '2026-11-15T12:00']);
});

test('a time range is a start and a length, not a daily stay', () => {
  assert.deepEqual(stay(parse('сегодня с 18 до 21')), ['hourly', '2026-11-11T18:00', '2026-11-11T21:00']);
  assert.deepEqual(stay(parse('завтра с 18:30 до 21')), ['hourly', '2026-11-12T18:30', '2026-11-12T21:30']);
  assert.deepEqual(stay(parse('сегодня с 22 до 2')), ['hourly', '2026-11-11T22:00', '2026-11-12T02:00']);
  // A range of dates stays a range of dates.
  assert.deepEqual(stay(parse('с 14 до 16 ноября')), ['daily', '2026-11-14T14:00', '2026-11-16T12:00']);
});

test('half hours are kept, not rounded up', () => {
  const result = parse('в 18:30 завтра на 2 часа в Астане на троих');
  assert.deepEqual(stay(result), ['hourly', '2026-11-12T18:30', '2026-11-12T20:30']);
  assert.equal(result.draft.city, 'Астана');
  assert.equal(result.draft.guests, 3);
  assert.equal(guestSummary(result.draft, morning), 'Астана · завтра 18:30–20:30 · 3 гостя');
});

test('city, guests, budget and wishes', () => {
  const result = parse('Недорого в Астане для 3 гостей до 15 тысяч завтра на 2 суток с парковкой');
  assert.deepEqual(stay(result), ['daily', '2026-11-12T14:00', '2026-11-14T12:00']);
  assert.equal(result.draft.city, 'Астана');
  assert.equal(result.draft.guests, 3);
  assert.equal(result.draft.maxPrice, '15000');
  assert.equal(result.draft.priority, 'cheaper');
  assert.deepEqual(result.draft.features, ['parking']);
  assert.equal(matchingBody(result.draft).maxPrice, 15000);
  // Everything that is applied is part of the line the guest sees: the budget, the wish and "дешевле" too.
  assert.equal(guestSummary(result.draft, morning), 'Астана · 12–14 ноября · 3 гостя · до 15 000 ₸ за всё · парковка · дешевле');
  assert.equal(guestSummary({...draft, features: ['wifi', 'workspace'], priority: 'closer', near: {longitude: 76.95, latitude: 52.29, radius: 5000}}, morning), 'Павлодар, рядом с выбранным местом · 11–12 ноября · 2 гостя · Wi-Fi · рабочее место · ближе');
  assert.equal(parse('до 18:00').draft.maxPrice, '');
  // Another city drops the district and the point of the previous one.
  const moved = parse('в Алматы', morning, {...draft, district: 'Центр', near: {longitude: 76.95, latitude: 52.29, radius: 5000}});
  assert.equal(moved.draft.district, '');
  assert.equal(moved.draft.near, null);
});

test('a tariff named without a day or a length takes its usual stay', () => {
  assert.deepEqual(stay(parse('почасовая')), ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  const hourly = chipDraft('hourly', draft, morning);
  assert.deepEqual(stay(parse('посуточно', morning, hourly)), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
});

test('a screen opened in the morning still searches the future in the afternoon', () => {
  const opened = newDraft('Павлодар', Date.parse('2026-11-11T07:30:00Z')); // 12:30
  const later = Date.parse('2026-11-11T09:30:00Z'); // 14:30
  assert.equal(opened.start, '2026-11-11T14:00');
  assert.equal(freshDraft(opened, later).start, '2026-11-11T15:00');
  // Text that names no time keeps the stay, but never in the past.
  const guests = parse('на двоих', later, opened);
  assert.deepEqual(stay(guests), ['daily', '2026-11-11T15:00', '2026-11-12T12:00']);
  assert.equal(chipDraft('daily', opened, later).start, '2026-11-11T15:00');
  // 22:30: three hours "today" start at 23:00 and end after midnight.
  assert.deepEqual(stay(parse('на 3 часа сегодня', evening)), ['hourly', '2026-11-11T23:00', '2026-11-12T02:00']);
  // A stated hour that has already passed today means tomorrow.
  assert.deepEqual(stay(parse('в 9 утра на 4 часа')), ['hourly', '2026-11-12T09:00', '2026-11-12T13:00']);
});

test('text with no condition changes nothing and says so; "рядом" asks for a point', () => {
  const unknown = parse('с бассейном и красивым видом');
  assert.equal(unknown.understood, false);
  assert.deepEqual(unknown.draft, draft);
  assert.equal(parse('привет').understood, false);
  const near = parse('квартира рядом');
  assert.equal(near.nearby, true);
  assert.equal(near.understood, true);
});

test('the form changes the same start and end the text does', () => {
  const hourly = withMode(draft, 'hourly', morning);
  assert.deepEqual([hourly.mode, hourly.start, hourly.end], ['hourly', '2026-11-11T10:30', '2026-11-11T13:30']);
  assert.equal(draftUnits(hourly), 3);
  assert.equal(withMode(hourly, 'hourly', morning), hourly);
  // Hours: another day keeps the time, a new time keeps the length, a new length keeps the start.
  const friday = withDay(hourly, '2026-11-13', morning);
  assert.deepEqual([friday.start, friday.end], ['2026-11-13T10:30', '2026-11-13T13:30']);
  assert.deepEqual([withTime(friday, '19:00', morning).start, withTime(friday, '19:00', morning).end], ['2026-11-13T19:00', '2026-11-13T22:00']);
  assert.deepEqual([withUnits(friday, 5, morning).start, withUnits(friday, 5, morning).end], ['2026-11-13T10:30', '2026-11-13T15:30']);
  // A time that has passed today moves to the nearest half hour.
  assert.equal(withTime(hourly, '08:00', morning).start, '2026-11-11T10:30');

  // Days: check-in at 14:00, check-out at noon; the counter is the days the tariff counts.
  assert.equal(draftUnits(draft), 1);
  const three = withUnits(draft, 3, morning);
  assert.deepEqual([three.start, three.end, draftUnits(three)], ['2026-11-11T14:00', '2026-11-14T12:00', 3]);
  const moved = withDay(three, '2026-11-20', morning);
  assert.deepEqual([moved.start, moved.end, draftUnits(moved)], ['2026-11-20T14:00', '2026-11-23T12:00', 3]);
  // A check-in before noon: the same number of days ends a day earlier.
  const early = withTime(moved, '09:00', morning);
  assert.deepEqual([early.start, early.end, draftUnits(early)], ['2026-11-20T09:00', '2026-11-22T12:00', 3]);
  assert.deepEqual([withUnits(early, 1, morning).end, draftUnits(withUnits(early, 1, morning))], ['2026-11-20T12:00', 1]);
});

test('the form offers a week of days and keeps a later day the text named', () => {
  const week = dayChoices(draft, morning);
  assert.deepEqual(week.slice(0, 3), [['2026-11-11', 'Сегодня'], ['2026-11-12', 'Завтра'], ['2026-11-13', 'пт, 13 ноября']]);
  assert.equal(week.length, 7);
  const later = dayChoices(parse('25 ноября').draft, morning);
  assert.deepEqual(later.at(-1), ['2026-11-25', 'ср, 25 ноября']);
  assert.equal(later.length, 8);
});

test('reasons are shown in plain words, and the budget only when one was named', () => {
  const reasons = ['В пределах бюджета', 'Готовность проверена', 'Примерно 1.2 км от выбранной зоны'];
  assert.deepEqual(shownReasons(reasons, draft), ['Готово к заселению', 'Примерно 1.2 км от выбранной зоны']);
  assert.deepEqual(shownReasons(reasons, {maxPrice: '20000'})[0], 'В пределах бюджета');
  assert.deepEqual(shownReasons(undefined, draft), []);
});

test('a day or an hour that has passed is not moved and not searched', () => {
  const gone = parse('10 ноября на двоих');
  assert.equal(gone.past, 'date');
  assert.equal(gone.understood, true);
  // The stay stays as it was: nothing is moved to another day or to next year.
  assert.deepEqual(stay(gone), stay({draft}));
  assert.equal(parse('вчера').past, 'date');
  assert.equal(parse('сегодня в 9 утра').past, 'time');
  assert.equal(parse('завтра в 9 утра').past, undefined);
  assert.deepEqual(Object.keys(PAST_TEXT).sort(), ['date', 'time']);
});

test('what the rules cut is said in a note', () => {
  const long = parse('на 30 часов завтра');
  assert.equal(draftUnits(long.draft), 23);
  assert.match(long.note, /23/);
  const crowd = parse('завтра на сутки, 80 гостей');
  assert.equal(crowd.draft.guests, MAX_GUESTS);
  assert.match(crowd.note, new RegExp(String(MAX_GUESTS)));
  assert.equal(parse('завтра на сутки на двоих').note, '');
});

test('the app reads every request exactly as the site does', () => {
  const texts = [
    'На 3 часа сегодня в центре', '14 ноября на двоих', 'с 14 по 16 ноября', 'на двое суток', 'сегодня с 18 до 21',
    'в 18:30 завтра на 2 часа в Астане на троих', 'на неделю вдвоём', 'послезавтра вечером на 5 часов до 20 тысяч',
    'на выходные в Алматы с парковкой', 'завтра', 'в пятницу на сутки'
  ];
  for (const text of texts) {
    const mine = parse(text).draft, theirs = site.guestSearchRequest(text, draft, cities, morning).filters;
    assert.deepEqual(
      [mine.city, mine.district, mine.mode, mine.start, mine.end, String(mine.guests), mine.maxPrice],
      [theirs.city, theirs.district || '', theirs.mode, theirs.start, theirs.end, String(theirs.guests), String(theirs.maxPrice || '')],
      text
    );
  }
});

// ---------- Stage 1 of the guest search audit (2026-11-17): what the guest asked is what is searched ----------
const {HOME_KINDS, homeWords, budgetWords} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');

test('rooms and the type of home are read, shown and sent, never dropped', () => {
  const two = parse('2-комнатная на завтра');
  assert.equal(two.draft.rooms, '2');
  assert.match(guestSummary(two.draft, morning), /2 комн\./);
  assert.equal(matchingBody(two.draft).rooms, '2');
  assert.equal(parse('двушка').draft.rooms, '2');
  assert.equal(parse('однушка').understood, true);
  assert.equal(parse('однушка').draft.rooms, '1');
  assert.equal(parse('от 2 комнат').draft.rooms, '2+');
  assert.deepEqual(parse('номер в гостинице').draft.kinds, ['hotel']);
  assert.deepEqual(parse('гостевой дом на выходные').draft.kinds, ['guesthouse']);
  assert.deepEqual(parse('дом с баней').draft.kinds, ['house']);
  assert.deepEqual(parse('студия на 3 часа').draft.kinds, ['studio']);
  // "Квартира" is how guests say "жильё": it narrows nothing.
  assert.deepEqual(parse('квартира на сутки').draft.kinds, []);
  assert.equal(homeWords({kinds: ['studio', 'apartment'], rooms: '3+'}), 'студия или квартира, от 3 комн.');
});

test('the types of home are the ones owners choose from', async () => {
  const listings = await import('node:fs').then(fs => fs.readFileSync(new URL('../../lib/listings.ts', import.meta.url), 'utf8'));
  for (const [id, title] of Object.entries(HOME_KINDS)) assert.ok(listings.includes(id + ":'" + title + "'"), id);
});

test('a town the service is not in is said, and the nearest city is searched', () => {
  const town = parse('Сейчас в Экибастузе', morning, {...draft, city: 'Алматы'});
  assert.equal(town.draft.city, 'Павлодар');
  assert.match(town.note, /Экибастуз: жилья в сервисе пока нет\. Ищу в ближайшем городе — Павлодар\./);
});

test('a budget per day is multiplied by the days; a bare amount is for the whole stay', () => {
  const perDay = parse('до 15 тысяч за сутки на 3 дня');
  assert.equal(perDay.draft.perUnit, true);
  assert.equal(matchingBody(perDay.draft).maxPrice, 45000);
  assert.equal(budgetWords(perDay.draft), 'до 15 000 ₸ за сутки');
  const perHour = parse('на 3 часа до 3000 в час');
  assert.equal(matchingBody(perHour.draft).maxPrice, 9000);
  const total = parse('на 3 дня до 40000');
  assert.equal(total.draft.perUnit, false);
  assert.equal(matchingBody(total.draft).maxPrice, 40000);
});

test('a new phrase starts over; a refinement keeps the conditions', () => {
  const seven = parse('нас 7 человек').draft;
  assert.equal(seven.guests, 7);
  const next = parse('однушка', morning, seven).draft;
  assert.equal(next.guests, 2);
  assert.equal(next.rooms, '1');
  // The place and the time stay.
  const hours = parse('в Астане на 3 часа').draft, moved = parse('с парковкой', morning, hours).draft;
  assert.equal(moved.city, 'Астана');
  assert.equal(moved.mode, 'hourly');
  const refined = parse('а дешевле', morning, {...seven, rooms: '2'}).draft;
  assert.equal(refined.guests, 7);
  assert.equal(refined.rooms, '2');
  assert.equal(refined.priority, 'cheaper');
});

test('an hour that has passed today is searched tomorrow, and the guest is told', () => {
  const late = parse('в 22:00', Date.parse('2026-11-11T18:10:00Z'));
  assert.equal(late.draft.start.slice(0, 10), '2026-11-12');
  assert.match(late.note, /Сегодня 22:00 уже прошло, ищу на завтра\./);
});

test('«Сейчас» and «На ночь» chips', () => {
  const at = local => Date.parse(local + ':00+05:00');
  const now = chipDraft('now', draft, at('2026-11-17T13:05'));
  assert.deepEqual([now.mode, now.start, now.end, now.now], ['daily', '2026-11-17T13:30', '2026-11-18T12:00', true]);
  assert.equal(matchingBody(now).now, true);
  assert.equal(guestSummary(now, at('2026-11-17T13:05')), 'Павлодар · 17–18 ноября · 2 гостя · заезд с 13:30 · готово сейчас');
  assert.equal(guestSummary({ ...now, near: { longitude: 77, latitude: 52, radius: 15000 }, priority: 'closer' }, at('2026-11-17T13:05')), 'Павлодар · 17–18 ноября · 2 гостя · заезд с 13:30 · готово сейчас, рядом с вами');
  // On the hourly tariff «Сейчас» is the nearest three hours; after midnight it is the night under way.
  const hourly = chipDraft('now', { ...draft, mode: 'hourly' }, at('2026-11-17T13:05'));
  assert.deepEqual([hourly.mode, hourly.start, hourly.end], ['hourly', '2026-11-17T13:30', '2026-11-17T16:30']);
  const late = chipDraft('now', draft, at('2026-11-18T01:10'));
  assert.deepEqual([late.start, late.end], ['2026-11-18T01:30', '2026-11-18T12:00']);
  // «На ночь» leaves «Сейчас» and the point it took from the phone.
  const night = chipDraft('night', { ...now, near: { longitude: 77, latitude: 52, radius: 15000 }, priority: 'closer' }, at('2026-11-17T21:00'));
  assert.deepEqual([night.mode, night.start, night.end, night.now, night.near, night.priority], ['night', '2026-11-17T21:30', '2026-11-18T12:00', false, null, 'balanced']);
  assert.equal(matchingBody(night).mode, 'night');
  assert.match(guestSummary({ ...night, maxPrice: '9000' }, at('2026-11-17T21:00')), /до 9 000 ₸ за ночь/);
  // A phrase with «сейчас» asks for the same, a later phrase without it does not.
  assert.equal(parse('сейчас на двоих', at('2026-11-17T13:05')).draft.now, true);
  assert.equal(parse('завтра на сутки', at('2026-11-17T13:05'), now).draft.now, false);
  assert.equal(parse('на ночь', at('2026-11-17T21:00')).draft.mode, 'night');
});

const L = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');

test('one button: a home that confirms by itself is booked, a home with quick answers is asked first', () => {
  assert.equal(L.askFirst({quickRequest: true, instant: false}), true);
  assert.equal(L.askFirst({quickRequest: true, instant: true}), false);
  assert.equal(L.askFirst({quickRequest: false}), false);
  assert.equal(L.askFirst({}), false);
});

test('the AI line says what the model understood and what the search leaves out', () => {
  assert.equal(L.understoodNote('завтра на сутки', []), 'ИИ понял так: «завтра на сутки».');
  assert.equal(L.understoodNote('завтра на сутки', ['с собакой', '', 5, 'у вокзала']), 'ИИ понял так: «завтра на сутки». Пока не ищу по условиям: с собакой, у вокзала.');
  assert.match(L.notUnderstoodNote('permission', []), /разрешите/);
  assert.match(L.notUnderstoodNote('none', ['с видом на реку']), /^Пока не ищу по условиям: с видом на реку\. Назовите день и срок/);
  for (const status of ['off', 'busy', 'none', undefined]) assert.match(L.notUnderstoodNote(status, []), /^Не понял запрос\. Назовите день и срок/);
});

test('phrases in the words the model is told to use pass the rules', () => {
  const cities = ['Павлодар', 'Астана'], at = Date.parse('2026-11-17T13:00:00+05:00'), draft = L.newDraft('Павлодар', at);
  for (const phrase of ['с 20 ноября на 7 суток на двоих', 'завтра на 30 суток', 'в пятницу на 2 ночи на 4 человек до 9000 за ночь', 'сейчас на 3 часа студия', '25 ноября на сутки в Астане 2-комнатная с парковкой'])
    assert.equal(L.guestRequestFromText(phrase, draft, cities, at).understood, true, phrase);
});
