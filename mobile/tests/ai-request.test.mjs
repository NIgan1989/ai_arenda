import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {
  guestRequestFromText, guestSummary, newDraft, freshDraft, chipDraft, matchingBody, stayISO,
  withMode, withDay, withTime, withUnits, draftUnits, dayChoices, shownReasons, MAX_GUESTS, PAST_TEXT, nearPlace, placeMissedNote, pinPrice
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
  assert.deepEqual(draft, {city: 'Павлодар', district: '', mode: 'daily', start: '2026-11-11T14:00', end: '2026-11-12T12:00', guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '', now: false, maxFloor: 0});
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

// Категория «Баня» (2026-11-17): chosen above the line, kept by the next phrase, searched by the hour.
test('the category «Баня»: by the hour, both bath types, kept by a new phrase and left by the name of a home', async () => {
  const {newDraft, withCategory, categoryOf, categoryKinds, guestRequestFromText, chipDraft, matchingBody} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  const at = Date.parse('2026-11-17T10:00:00+05:00'), stay = newDraft('Павлодар', at);
  assert.equal(categoryOf(stay), 'stay');
  const bath = withCategory({...stay, maxPrice: '9000', district: 'Центр'}, 'bath', at);
  assert.equal(categoryOf(bath), 'bath');
  assert.deepEqual([bath.mode, bath.kinds, bath.guests, bath.maxPrice, bath.district], ['hourly', ['banya', 'sauna'], 4, '', '']);
  assert.deepEqual(matchingBody(bath).kinds, ['banya', 'sauna']);
  assert.deepEqual(categoryKinds('bath').map(([id]) => id), ['banya', 'sauna']);
  assert.ok(!categoryKinds('stay').some(([id]) => id === 'banya'));
  // A new phrase in «Баня» is still about a bath.
  const said = guestRequestFromText('на 6 человек сегодня в 20:00', bath, ['Павлодар'], at).draft;
  assert.deepEqual([categoryOf(said), said.mode, said.guests, said.start, said.end], ['bath', 'hourly', 6, '2026-11-17T20:00', '2026-11-17T23:00']);
  // «Сауна» narrows it; the name of a home leaves the category; «баня» said in «Жильё» enters it.
  assert.deepEqual(guestRequestFromText('сауна завтра вечером', bath, ['Павлодар'], at).draft.kinds, ['sauna']);
  assert.equal(categoryOf(guestRequestFromText('квартира на сутки', bath, ['Павлодар'], at).draft), 'stay');
  const entered = guestRequestFromText('баня на шестерых в 19:00', stay, ['Павлодар'], at).draft;
  assert.deepEqual([categoryOf(entered), entered.mode, entered.start], ['bath', 'hourly', '2026-11-17T19:00']);
  // Back to «Жильё»: a day for two.
  const back = withCategory(bath, 'stay', at);
  assert.deepEqual([back.mode, back.kinds, back.guests], ['daily', [], 2]);
  // «Вечером»: 19:00 today; late in the evening and «Завтра»: 19:00 tomorrow.
  const evening = chipDraft('evening', bath, at);
  assert.deepEqual([evening.start, evening.end], ['2026-11-17T19:00', '2026-11-17T22:00']);
  assert.equal(chipDraft('evening', bath, Date.parse('2026-11-17T19:40:00+05:00')).start, '2026-11-17T20:30');
  assert.equal(chipDraft('evening', bath, Date.parse('2026-11-17T22:10:00+05:00')).start, '2026-11-18T19:00');
  assert.equal(chipDraft('tomorrow', bath, at).start, '2026-11-18T19:00');
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
  // A hall is asked for by its day and guests, a bath by its day and hours: not by «сутки на двоих».
  assert.equal(L.notUnderstoodNote('none', [], 'banquet'), 'Не понял запрос. Назовите день и число гостей, например: «5 декабря на 150 гостей».');
  assert.match(L.notUnderstoodNote('off', [], 'bath'), /«сегодня в 18:00 на 3 часа»/);
});

test('phrases in the words the model is told to use pass the rules', () => {
  const cities = ['Павлодар', 'Астана'], at = Date.parse('2026-11-17T13:00:00+05:00'), draft = L.newDraft('Павлодар', at);
  for (const phrase of ['с 20 ноября на 7 суток на двоих', 'завтра на 30 суток', 'в пятницу на 2 ночи на 4 человек до 9000 за ночь', 'сейчас на 3 часа студия', '25 ноября на сутки в Астане 2-комнатная с парковкой'])
    assert.equal(L.guestRequestFromText(phrase, draft, cities, at).understood, true, phrase);
});

test('the term of the last phrase does not stick to a new one', () => {
  const hours = parse('на 3 часа');
  assert.equal(hours.draft.mode, 'hourly');
  // A new phrase names a day and no length: a day, not the three hours said before.
  const next = parse('двушка завтра', morning, hours.draft);
  assert.deepEqual(stay(next), ['daily', '2026-11-12T14:00', '2026-11-13T12:00']);
  assert.equal(next.note, '');
  // A new phrase names no stay at all: a day from today, and the guest is told the stay was let go of.
  const seven = parse('нас 7 человек', morning, hours.draft);
  assert.deepEqual(stay(seven), ['daily', '2026-11-11T14:00', '2026-11-12T12:00']);
  assert.match(seven.note, /Срок не назван: ищу на сутки с сегодня/);
  // Nothing to let go of: no note.
  assert.equal(parse('нас 4 человека').note, '');
  // A refinement keeps the stay.
  for (const text of ['а на четверых', 'ещё с парковкой', 'с собакой', 'без парковки дешевле']) assert.deepEqual(stay(parse(text, morning, hours.draft)), stay(hours), text);
  // «с пятницы», «с 18 до 21» start a request of their own.
  assert.equal(parse('с пятницы на 2 суток', morning, {...hours.draft, guests: 7}).draft.guests, 2);
  assert.equal(parse('с 18 до 21', morning, {...hours.draft, guests: 7}).draft.guests, 2);
});

test('pets and every amenity of a home are searched; what is not is named', () => {
  const dog = parse('двушка завтра с собакой');
  assert.deepEqual(dog.draft.features, ['pets']);
  assert.match(guestSummary(dog.draft, morning), /с питомцами/);
  assert.deepEqual(matchingBody(dog.draft).features, ['pets']);
  assert.deepEqual(parse('с кондиционером и стиралкой на сутки').draft.features.sort(), ['aircon', 'washer']);
  // «Без …» takes a wish off; it never asks for it.
  assert.deepEqual(parse('без собаки', morning, dog.draft).draft.features, []);
  assert.deepEqual(parse('завтра без животных').draft.features, []);
  assert.deepEqual(parse('без парковки, но с кондиционером', morning, {...dog.draft, features: ['parking', 'pets']}).draft.features, ['pets', 'aircon']);
  const bath = parse('дом с баней на выходные');
  assert.equal(bath.understood, true);
  assert.deepEqual(bath.draft.kinds, ['house']);
  assert.match(bath.note, /Пока не умею искать: баня\./);
  assert.match(parse('завтра рядом с вокзалом, хорошие отзывы').note, /Пока не умею искать: отзывы\./);
  // Nothing but such words: not a request, and the note still names them.
  const only = parse('с бассейном');
  assert.equal(only.understood, false);
  assert.match(only.note, /бассейн/);
  assert.equal(parse('рядом со мной').note, '');
});

test('everyday phrases are read by the rules, without the model', () => {
  for (const text of ['хочу снять квартиру', 'нужно жильё', 'посуточно', 'где переночевать']) assert.equal(parse(text).understood, true, text);
  assert.deepEqual(stay(parse('на месяц')), ['daily', '2026-11-11T14:00', '2026-12-11T12:00']);
  assert.match(parse('на 2 месяца').note, /Максимум 30 суток/);
  assert.deepEqual(stay(parse('на новый год')), ['daily', '2026-12-31T14:00', '2027-01-01T12:00']);
  assert.equal(parse('привет').understood, false);
});

test('«студия или однушка» is either of them', () => {
  const either = parse('студия или однушка');
  assert.deepEqual(either.draft.kinds, ['studio', 'apartment']);
  assert.equal(either.draft.rooms, '1');
  const wide = parse('студия или двушка');
  assert.deepEqual(wide.draft.kinds, ['studio', 'apartment']);
  assert.equal(wide.draft.rooms, '');
  assert.match(wide.note, /любой из названных типов/);
  assert.equal(parse('двухкомнатная студия').draft.rooms, '2');
});

test('an hour of their own for a day is shown in the conditions', () => {
  const late = parse('сегодня в 22:00');
  assert.equal(late.draft.start, '2026-11-11T22:00');
  assert.match(guestSummary(late.draft, morning), /заезд с 22:00/);
  assert.doesNotMatch(guestSummary(draft, morning), /заезд/);
});
test('the category button: a tile chooses one type, «Любое» the whole category', async () => {
  const {newDraft, withKind, kindChoice, categoryOf} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  const at = Date.parse('2026-11-17T06:00:00Z'), stay = newDraft('Павлодар', at);
  assert.deepEqual(kindChoice(stay), {id: 'stay', title: 'Жильё'});
  const sauna = withKind(stay, 'bath', 'sauna', at);
  assert.deepEqual([sauna.kinds, sauna.mode, categoryOf(sauna)], [['sauna'], 'hourly', 'bath']);
  assert.deepEqual(kindChoice(sauna), {id: 'sauna', title: 'Сауна'});
  const any = withKind(sauna, 'bath', null, at);
  assert.deepEqual(any.kinds, ['banya', 'sauna']);
  assert.equal(kindChoice(any).title, 'Баня');
  const house = withKind(any, 'stay', 'house', at);
  assert.deepEqual([house.kinds, house.mode, kindChoice(house).title], [['house'], 'daily', 'Дом']);
  assert.deepEqual(withKind(house, 'stay', null, at).kinds, []);
});

test('a landmark is searched around: «у вокзала», «возле ТРЦ»', () => {
  const cases = {
    'двушка завтра у вокзала': 'железнодорожный вокзал',
    'рядом с вокзалом на 3 часа': 'железнодорожный вокзал',
    'возле трц батыр молл на сутки': 'трц батыр молл',
    'недалеко от набережной недорого': 'набережная',
    'около автовокзала сегодня вечером': 'автовокзал',
    'студия в районе рынка': 'центральный рынок',
  };
  for (const [text, place] of Object.entries(cases)) {
    const result = parse(text);
    assert.equal(result.place, place, text);
    assert.equal(result.understood, true, text);
    assert.equal(result.nearby, false, text);
  }
  // «Рядом со мной» and a bare «рядом» are the guest's own place, not a landmark; an hour is not one either.
  for (const text of ['рядом со мной', 'квартира рядом', 'около 5 вечера завтра', 'у нас двое детей']) assert.equal(parse(text).place, undefined, text);
  // The point the server found becomes the place of the search, and the line names it.
  const asked = parse('двушка завтра у вокзала');
  const near = nearPlace(asked.draft, {longitude: 76.9712, latitude: 52.3004, name: 'Вокзал Павлодар'}, asked.place);
  assert.deepEqual(near.near, {longitude: 76.9712, latitude: 52.3004, radius: 3000, label: 'Вокзал Павлодар'});
  assert.equal(near.priority, 'closer');
  assert.match(guestSummary(near, morning), /Павлодар, рядом: Вокзал Павлодар · /);
  // The label stays in the app: the server gets the point only.
  assert.deepEqual(matchingBody(near).near, {longitude: 76.9712, latitude: 52.3004, radius: 3000});
  assert.equal(nearPlace(asked.draft, {name: 'x'}, 'вокзал'), asked.draft);
  assert.equal(nearPlace(asked.draft, {longitude: 1, latitude: 2}, 'вокзал').near.label, 'вокзал');
  assert.equal(placeMissedNote('вокзал'), 'Не нашёл на карте: вокзал. Ищу по всему городу.');
  // A landmark said after a request refines it; a new request lets go of the landmark.
  assert.equal(parse('у набережной', morning, {...asked.draft, guests: 4}).draft.guests, 4);
  assert.equal(parse('студия завтра', morning, near).draft.near, null);
  // The words of a home after the landmark are not part of it.
  assert.equal(parse('у вокзала двушка завтра').place, 'железнодорожный вокзал');
  assert.equal(parse('возле вокзала квартира на сутки').place, 'железнодорожный вокзал');
  assert.equal(parse('рядом с трц батыр молл студия').place, 'трц батыр молл');
  // «Сейчас у вокзала» stays «Сейчас»: only homes ready now, around the landmark.
  const urgent = parse('сейчас у вокзала'), there = nearPlace(urgent.draft, {longitude: 76.97, latitude: 52.3, name: 'Вокзал'}, urgent.place);
  assert.equal(there.now, true);
  assert.match(guestSummary(there, morning), /рядом: Вокзал · .*готово сейчас(?!, рядом с вами)/);
  // The site does not find landmarks on the map: there the guest is still told so.
  assert.match(site.guestSearchRequest('завтра рядом с вокзалом', draft, cities, morning).remarks.join(' '), /место рядом с ориентиром/);
  assert.equal(parse('завтра рядом с вокзалом').note, '');
});

test('one price format on the pins; the rating on a card is a star', () => {
  assert.deepEqual([800, 9000, 9500, 12000, 14900, 120000].map(pinPrice), ['800 ₸', '9 тыс.', '9,5 тыс.', '12 тыс.', '14,9 тыс.', '120 тыс.']);
  assert.deepEqual(shownReasons(['Оценка 4,8 из 5 · 3 отзыва', 'Готовность проверена'], {maxPrice: ''}), ['★ 4,8 · 3 отзыва', 'Готово к заселению']);
});

// «Банкет» (2026-11-17): a hall for a той, an anniversary or a memorial meal. A slot of one day, a price per guest.
test('«Банкет»: a hall is a slot of one day for a large party', async () => {
  const mod = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  const hall = mod.withKind(newDraft('Павлодар', morning), 'banquet', null, morning);
  assert.equal(mod.categoryOf(hall), 'banquet');
  // The nearest Saturday evening, fifty guests to begin with.
  assert.deepEqual([hall.mode, hall.start, hall.end, hall.guests, hall.kinds], ['daily', '2026-11-14T18:00', '2026-11-15T00:00', 50, ['banquet', 'cafe']]);
  // Another day keeps the slot, another slot keeps the day.
  const later = withDay(hall, '2026-12-05', morning);
  assert.deepEqual([later.start, later.end], ['2026-12-05T18:00', '2026-12-06T00:00']);
  assert.deepEqual([mod.withSlot(later, '2026-12-05', 'lunch').start, mod.withSlot(later, '2026-12-05', 'lunch').end], ['2026-12-05T12:00', '2026-12-05T17:00']);
  // The price named is per guest: the server gets it for the whole party, with what the hall is for.
  const body = matchingBody({ ...later, guests: 150, maxPrice: '8000', occasion: 'toi' });
  assert.deepEqual([body.maxPrice, body.guests, body.occasion, body.mode], [1200000, 150, 'toi', 'daily']);
  assert.equal(guestSummary({ ...later, guests: 150, maxPrice: '8000', occasion: 'toi', features: ['halal'] }, morning), 'Свадьба, той · Павлодар · 5 декабря, вечер 18:00–00:00 · 150 гостей · до 8 000 ₸ за гостя · халяль');
  // Leaving the category lets go of the occasion and of the large party.
  const home = mod.withKind({ ...later, occasion: 'toi', guests: 150 }, 'stay', null, morning);
  assert.deepEqual([home.occasion, home.guests, home.kinds], [undefined, 2, []]);
  // A slot that has begun gives way to the usual one.
  assert.equal(freshDraft({ ...hall, start: '2026-11-11T12:00', end: '2026-11-11T17:00' }, Date.parse('2026-11-11T08:00:00Z')).start, '2026-11-14T18:00');
});

test('«Банкет»: the line and the chips say what the hall is for; a memorial meal is quiet', async () => {
  const mod = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  const start = newDraft('Павлодар', morning);
  // Said in «Жильё»: the category changes with the phrase.
  const toi = guestRequestFromText('той на 150 человек 5 декабря', start, cities, morning).draft;
  assert.deepEqual([mod.categoryOf(toi), toi.occasion, toi.guests, toi.start], ['banquet', 'toi', 150, '2026-12-05T18:00']);
  assert.equal(guestRequestFromText('банкетный зал в субботу', start, cities, morning).draft.guests, 50);
  // A memorial meal: tomorrow at lunch, by the chip and by the word.
  const chip = chipDraft('memorial', start, morning);
  assert.deepEqual([chip.occasion, chip.start, chip.end, mod.isQuiet(chip)], ['memorial', '2026-11-12T12:00', '2026-11-12T17:00', true]);
  const said = guestRequestFromText('поминки на 60 человек послезавтра', start, cities, morning).draft;
  assert.deepEqual([said.occasion, said.guests, said.start], ['memorial', 60, '2026-11-13T12:00']);
  assert.equal(mod.isQuiet(toi), false);
  // In the category a refinement keeps the day, the party and the occasion.
  const lunch = guestRequestFromText('а в обед', toi, cities, morning).draft;
  assert.deepEqual([lunch.start, lunch.guests, lunch.occasion], ['2026-12-05T12:00', 150, 'toi']);
  // «Квартира» leaves the category; a flat is never searched for 150 guests.
  const flat = guestRequestFromText('квартира на двоих завтра', toi, cities, morning).draft;
  assert.deepEqual([mod.categoryOf(flat), flat.guests, flat.occasion], ['stay', 2, undefined]);
  assert.equal(pinPrice(1200000), '1,2 млн');
  assert.deepEqual(mod.dayChoices(toi, morning).map(([, label]) => label).slice(0, 4), ['Завтра', 'Послезавтра', 'сб, 14 ноября', 'вс, 15 ноября']);
});

test('a bath said in the line: the whole category, four guests, its wishes in the conditions', () => {
  const now = Date.parse('2026-11-17T12:50:00Z'), stay = newDraft('Павлодар', now);
  const read = text => guestRequestFromText(text, stay, cities, now);
  const pool = read('баня с бассейном и бильярдом');
  assert.deepEqual(pool.draft.kinds, ['banya', 'sauna']);
  assert.equal(pool.draft.guests, 4);
  assert.equal(guestSummary(pool.draft, now), 'Павлодар · сегодня 18:30–21:30 · 4 гостя · баня или сауна · бассейн · бильярд');
  // «Сейчас» in a bath says no «заезд».
  assert.ok(!guestSummary(read('баня сейчас').draft, now).includes('заезд'));
  assert.deepEqual(read('квартира с сауной').draft.kinds, []);
  assert.equal(read('баня с ночёвкой').note, 'Баню бронируют по часам, ищу на 3 часа.');
});

test('every wish an owner can mark is read from text, and «завтрак» is not «завтра»', () => {
  const read = text => parse(text).draft;
  assert.equal(read('гостиница с завтраком').start, draft.start);
  assert.match(parse('гостиница с завтраком').note, /завтрак/);
  assert.deepEqual(read('с постельным бельём и полотенцами').features, ['linen', 'towels']);
  assert.deepEqual(read('можно курить').features, ['smoking']);
  assert.deepEqual(read('для вечеринки на 10 человек').features, ['parties']);
  assert.deepEqual(read('бесконтактное заселение').features, ['selfcheckin']);
  assert.deepEqual(read('без депозита').features, ['nodeposit']);
  assert.equal(parse('можно курить').note, '');
  assert.equal(read('первый этаж').maxFloor, 1);
  assert.equal(read('не выше 3 этажа').maxFloor, 3);
  assert.equal(matchingBody(read('не выше 3 этажа')).maxFloor, 3);
  assert.deepEqual(read('вай фай и кондей').features.sort(), ['aircon', 'wifi']);
  assert.equal(read('за 10 тысяч').maxPrice, '10000');
  assert.equal(read('семья с двумя детьми').guests, 4);
  assert.equal(read('с ребёнком').guests, 3);
  assert.equal(read('на 4 гостей с ребёнком').guests, 4);
  assert.deepEqual(read('квартира на день рождения').kinds, []);
  assert.equal(parse('на Торайгырова').place, 'улица торайгырова');
  assert.deepEqual(read('монша').kinds, ['banya', 'sauna']);
});

// 2026-11-18: «уборка завтра» in the guest's line searched for a place to stay; it is the home cleaning order.
test('a cleaning typed into the guest line is the home cleaning order, not a search', async () => {
  const {cleaningAsk} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  for (const text of ['уборка завтра', 'Уборка', 'нужна уборка в 3 комнатах', 'хочу заказать уборку', 'клининг на субботу', 'убраться в квартире', 'генеральная уборка', 'уборка на дом'])
    assert.equal(cleaningAsk(text), true, text);
  for (const text of ['квартира после уборки', 'баня на вечер', 'квартира на 2 суток', 'хостел с уборкой'])
    assert.equal(cleaningAsk(text), false, text);
});

test('the examples the app shows in Kazakh and in English are read as the Russian ones', async () => {
  const {tIn} = await loadPure('lib/i18n.ts');
  const read = (text, from = draft) => { const r = parse(text, morning, from); return {draft: r.draft, understood: r.understood, past: r.past}; };
  // The examples of the line (lib/ai-line.ts, mobile/src/head-line.ts), each in the category it is shown in.
  const bath = chipDraft('evening', {...draft, kinds: ['banya', 'sauna'], guests: 4}, morning);
  for (const [key, from] of [['На 3 часа сегодня в центре', draft], ['Баня на 6 человек сегодня в 20:00', draft], ['Баня на 6 человек сегодня в 20:00', bath], ['Баня на 6 в 20:00', bath], ['Баня на 6 в 20:00', draft], ['Той на 150 человек 5 декабря', draft], ['Той на 150, 5 декабря', draft]]) {
    const ru = read(key, from);
    assert.equal(ru.understood, true, key);
    for (const l of ['kk', 'en']) {
      const said = tIn(l, key);
      assert.notEqual(said, key, 'no translation: ' + key);
      assert.deepEqual(read(said, from), ru, l + ': ' + said);
    }
  }
  assert.equal(read('Баня на 6 в 20:00').draft.guests, 6);
  assert.equal(read('Bathhouse for 6 people today at 20:00', bath).draft.guests, 6);
  assert.equal(read('Той на 150, 5 декабря').draft.guests, 150);
  // «На 3 часа» stays a length, not a party.
  assert.equal(read('Баня на 3 часа завтра', bath).draft.guests, 4);
  // The examples inside the hints.
  for (const [ru, kk, en] of [
    ['завтра на сутки на двоих', 'ертең бір тәулікке екі адамға', 'tomorrow for one day for two'],
    ['завтра на сутки до 15 000', 'ертең бір тәулікке 15 000-ға дейін', 'tomorrow for a day up to 15 000'],
    ['на выходные до 20 тыс', 'демалыс күндеріне 20 мың теңгеге дейін', 'for the weekend up to 20k'],
    ['послезавтра на 2 ночей на троих', 'бүрсігүні 2 түнге үш адамға', 'the day after tomorrow for 2 nights for three'],
    ['квартира сегодня на ночь дешевле', 'бүгін түнге пәтер арзанырақ', 'cheaper flat tonight'],
    ['баня 5 декабря в 20:00 на 8 человек', '5 желтоқсанда 20:00-де 8 адамға монша', 'sauna on December 5th at 8 pm for 8 guests'],
  ]) {
    assert.deepEqual(read(kk), read(ru), kk);
    assert.deepEqual(read(en), read(ru), en);
  }
  // Russian is read as before: a Russian word is never taken for a Kazakh or an English one.
  assert.equal(read('Екибастуз завтра на сутки').draft.guests, 2);
});

test('классы жилья: named in the line, kept by a refinement, sent to the server, the same as the owners choose', async () => {
  const {STAY_CLASS_LIST, classesFromText, classWords} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');
  assert.deepEqual(classesFromText('комфорт или премиум на сутки'), ['comfort', 'premium']);
  assert.deepEqual(classesFromText('люкс в центре'), ['premium']);
  const first = parse('эконом на сутки');
  assert.deepEqual(first.draft.classes, ['economy']);
  assert.deepEqual(matchingBody(first.draft).classes, ['economy']);
  // «а с парковкой» refines: the class stays; a new phrase without a class lets it go.
  assert.deepEqual(parse('а с парковкой', morning, first.draft).draft.classes, ['economy']);
  assert.equal(parse('двушка завтра', morning, first.draft).draft.classes, undefined);
  assert.equal(matchingBody(draft).classes, undefined);
  assert.equal(classWords(['premium', 'comfort']), 'Комфорт или Премиум');
  const lib = await import('node:fs').then(fs => fs.readFileSync(new URL('../../lib/stay-class.ts', import.meta.url), 'utf8'));
  for (const [id, title] of STAY_CLASS_LIST) assert.ok(lib.includes(id + ":'" + title + "'"), id);
});
