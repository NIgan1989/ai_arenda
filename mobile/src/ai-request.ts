// The guest's request on the map screen: the conditions of a search and the free text that fills them.
// The text is read by the same rules as on the site (guestSearchRequest in lib/map-search-request.ts), so
// "14 ноября на двоих" means the same thing in the app and in the browser. This file keeps the app's form
// in step with those rules. No model is called here. Covered by mobile/tests/ai-request.test.mjs.
import {
  BATH_KINDS,
  CHECKOUT_TIME,
  MAX_GUESTS as SHARED_MAX_GUESTS,
  NO_BUDGET,
  addDays,
  dailyStay,
  defaultStay,
  freshStay,
  guestRequestLine,
  guestSearchRequest,
  hourlyStay,
  kzToday,
  nextSlot,
  stayHours,
  stayNights,
  switchStay,
  weekendStay
} from '../../lib/map-search-request';

export type GuestDraft = {
  city: string;
  district: string;
  // 'night': a stay till the morning, at the owner's nightly price where it is cheaper than a day.
  mode: 'daily' | 'hourly' | 'night';
  start: string; // Kazakhstan time, 'YYYY-MM-DDTHH:mm'
  end: string;
  guests: number;
  maxPrice: string; // budget in tenge; '' when the guest named none
  perUnit: boolean; // maxPrice is a price per day (per hour for an hourly stay), not for the whole stay
  priority: 'balanced' | 'cheaper' | 'closer';
  features: string[]; // amenity ids the flat must have
  near: { longitude: number; latitude: number; radius: number } | null;
  kinds: string[]; // types of home (lib/listings.ts propertyTypes); [] for any
  rooms: string; // '2' exactly two rooms, '2+' at least two; '' for any
  now: boolean; // «Сейчас»: only homes ready now that confirm at once, the nearest first
};
export type ParsedRequest = {
  draft: GuestDraft; // the conditions with everything the text says applied
  nearby: boolean; // the guest asked for "рядом": the screen asks for a point on the map
  understood: boolean; // false when the text named no condition we know
  // The day or the hour the text names is already behind. Nothing is moved to another day and nothing
  // is searched: the screen says so and opens the form.
  past?: 'date' | 'time';
  // What was cut or could not be taken as written ("Максимум 23 часа, ищу на 23."); '' when nothing was.
  note: string;
};
export type ChipId = 'now' | 'night' | 'daily' | 'hourly' | 'weekend' | 'evening' | 'tomorrow';

// Types of home a guest can ask for, as lib/listings.ts names them (propertyTypes). Kept here so this file stays
// free of server code; mobile/tests/ai-request.test.mjs checks that the two lists match.
export const HOME_KINDS: Record<string, string> = {
  apartment: 'Квартира', studio: 'Студия', room: 'Комната', house: 'Дом',
  guesthouse: 'Гостевой дом', hostel: 'Хостел', hotel: 'Гостиница', aparthotel: 'Апарт-отель',
  banya: 'Баня', sauna: 'Сауна'
};

// What the guest looks for, chosen above the line like a tariff in a taxi (lib/listings.ts categories).
// «Баня» is a bath or a sauna taken whole for a few hours. The category is kept in the types of the request:
// only bath types named means «Баня», anything else «Жильё».
export type Category = 'stay' | 'bath';
export const BATH_TYPES: string[] = BATH_KINDS;
export const CATEGORIES: { id: Category; title: string; icon: string; hint: string }[] = [
  { id: 'stay', title: 'Жильё', icon: '🏠', hint: 'Жильё: на сутки, на ночь или на часы' },
  { id: 'bath', title: 'Баня', icon: '♨️', hint: 'Баня и сауна: на несколько часов' }
];
export const categoryOf = (draft: Pick<GuestDraft, 'kinds'>): Category => (draft.kinds.length && draft.kinds.every(id => BATH_KINDS.includes(id)) ? 'bath' : 'stay');
/** The types a category offers in the form, with their names. */
export const categoryKinds = (category: Category): [string, string][] => Object.entries(HOME_KINDS).filter(([id]) => BATH_KINDS.includes(id) === (category === 'bath'));
/** Another category is another request: the place stays, what narrowed the search starts over, a bath is by the hour. */
export function withCategory(draft: GuestDraft, category: Category, now = Date.now()): GuestDraft {
  if (categoryOf(draft) === category) return draft;
  const clean = { ...draft, district: '', maxPrice: '', perUnit: true, priority: 'balanced' as const, features: [], near: null, rooms: '', now: false };
  return category === 'bath'
    ? { ...clean, ...defaultStay('hourly', now), guests: Math.max(draft.guests, 4), kinds: [...BATH_KINDS] }
    : { ...clean, ...defaultStay('daily', now), guests: 2, kinds: [] };
}

// The wishes the shared parser can read from text, in the order the form shows them.
export const WISHES: [string, string][] = [
  ['parking', 'Парковка'],
  ['wifi', 'Wi-Fi'],
  ['kitchen', 'Кухня'],
  ['workspace', 'Рабочее место']
];
// What a company asks of a bath; the ids are the shared amenities.
export const BATH_WISHES: [string, string][] = [
  ['pool', 'Бассейн'],
  ['plunge', 'Купель'],
  ['brooms', 'Веники'],
  ['karaoke', 'Караоке'],
  ['grill', 'Мангал'],
  ['parking', 'Парковка']
];
// The largest party the service accepts; the form and the text stop at the same number.
export const MAX_GUESTS = SHARED_MAX_GUESTS;
// What the screen says when the text names a day or an hour that is behind, in the words of the site.
export const PAST_TEXT = { date: 'Эта дата уже прошла.', time: 'Это время уже прошло.' };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** What the form starts with: today until tomorrow, two guests, no budget. */
export function newDraft(city: string, now = Date.now()): GuestDraft {
  return { city, district: '', ...defaultStay('daily', now), guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '', now: false };
}

/** The same conditions with the stay moved out of the past, for a screen that stayed open. */
export function freshDraft(draft: GuestDraft, now = Date.now()): GuestDraft {
  return { ...draft, ...freshStay(draft, now) };
}

// Words that refine the last request instead of starting a new one: "а дешевле", "ещё с парковкой", "теперь на завтра".
const REFINE = /^(?:а|и|ещ[её]|теперь|только|плюс|также|тоже|добав[а-я]*|но|подешевле|дешевле|ближе|поближе)(?=$|[^а-яё])/;

/**
 * Free text as the conditions of a search. A new phrase is a new request: the place and the time stay, and
 * what narrows a search (guests, budget, district, home type, wishes, a point) starts over, so that "нас 7
 * человек" said a minute ago does not empty every later search. A phrase that starts as a refinement ("а
 * дешевле", "ещё с парковкой") keeps it all. Nothing is invented: what the text does not name stays as it was.
 */
export function guestRequestFromText(text: string, draft: GuestDraft, cities: string[], now = Date.now()): ParsedRequest {
  // «Квартира» names no type of home (any home will do), but said in «Баня» it leaves that category.
  const home = /квартир|жиль[её]|однушк|двушк|тр[её]шк/.test(text.toLocaleLowerCase('ru'));
  const kept = home && categoryOf(draft) === 'bath' ? withCategory(freshDraft(draft, now), 'stay', now) : freshDraft(draft, now);
  const base: GuestDraft = REFINE.test(text.trim().toLocaleLowerCase('ru'))
    ? kept
    // The category chosen above the line stays: in «Баня» a new phrase is still about a bath, and keeps the party.
    : { ...kept, district: '', guests: categoryOf(kept) === 'bath' ? kept.guests : 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: categoryOf(kept) === 'bath' ? [...BATH_KINDS] : [], rooms: '', now: false };
  const result = guestSearchRequest(text, base, cities, now);
  const filters = result.filters;
  const next: GuestDraft = {
    ...base,
    city: String(filters.city || base.city),
    district: String(filters.district || ''),
    mode: filters.mode === 'hourly' || filters.mode === 'night' ? filters.mode : 'daily',
    start: String(filters.start),
    end: String(filters.end),
    guests: clamp(Number(filters.guests) || base.guests, 1, MAX_GUESTS),
    maxPrice: String(filters.maxPrice || ''),
    perUnit: typeof filters.perUnit === 'boolean' ? filters.perUnit : base.perUnit,
    priority: filters.priority === 'cheaper' || filters.priority === 'closer' ? filters.priority : 'balanced',
    features: Array.isArray(filters.features) ? filters.features.filter((id: unknown) => [...WISHES, ...BATH_WISHES].some(([known]) => known === id)) : [],
    near: filters.near || null,
    kinds: Array.isArray(filters.kinds) ? filters.kinds.filter((id: unknown) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(HOME_KINDS, id)) : [],
    rooms: typeof filters.rooms === 'string' && /^[1-9]\+?$/.test(filters.rooms) ? filters.rooms : '',
    now: filters.now === true
  };
  // "почасовая" names a tariff but no day and no length: the stay follows the new tariff.
  if (!result.past && next.mode !== base.mode && !result.stated.when) Object.assign(next, { ...switchStay(next.mode, base.start, now), mode: next.mode });
  return {
    draft: next,
    nearby: result.nearby,
    understood: result.understood,
    ...(result.past ? { past: result.past } : {}),
    note: (result.remarks || []).join(' ')
  };
}

/**
 * The quick requests under the line. «Сейчас»: from the nearest half-hour that leaves 15 minutes, for a day (for
 * three hours on the hourly tariff), only homes ready now that confirm at once. «На ночь»: tonight till noon at the
 * nightly price where it is cheaper; after midnight, from now. The others: a day from today, the nearest three
 * hours, the nearest weekend.
 */
export function chipDraft(id: ChipId, draft: GuestDraft, now = Date.now()): GuestDraft {
  if (id === 'now') {
    const from = new Date(nextSlot(now, 15) + 5 * 3600000).toISOString().slice(0, 16), today = kzToday(now);
    const stay = draft.mode === 'hourly'
      ? { mode: 'hourly' as const, ...hourlyStay(from.slice(0, 10), from.slice(11), 3) }
      : { mode: draft.mode, ...dailyStay(today, addDays(today, 1), now, from.slice(11), 15, true) };
    return { ...draft, ...stay, now: true };
  }
  // Leaving «Сейчас» also lets go of the point it took from the phone.
  const loose = draft.now ? { near: null, priority: 'balanced' as const } : {};
  // «Вечером» and «Завтра» of the category «Баня»: three hours from 19:00, today while the evening is ahead
  // (from the nearest half-hour once it has begun), otherwise tomorrow.
  if (id === 'evening' || id === 'tomorrow') {
    const today = kzToday(now), soon = new Date(nextSlot(now, 30) + 5 * 3600000).toISOString().slice(0, 16);
    const late = soon.slice(0, 10) !== today || soon.slice(11) > '21:00';
    const from = id === 'tomorrow' || late ? addDays(today, 1) + 'T19:00' : soon.slice(11) > '19:00' ? soon : today + 'T19:00';
    return { ...draft, mode: 'hourly', ...hourlyStay(from.slice(0, 10), from.slice(11), 3), ...loose, now: false };
  }
  return { ...draft, ...(id === 'weekend' ? weekendStay(now) : defaultStay(id, now)), ...loose, now: false };
}

const PRIORITY_WORDS: Record<string, string> = { cheaper: 'дешевле', closer: 'ближе' };

/**
 * One line that says everything the search will use: "Павлодар, Центр · сегодня 19:00–22:00 · 2 гостя · до 20 000 ₸ · парковка".
 * The site's line names the place, the time, the guests and the budget; the wishes and "дешевле / ближе" are
 * added here, so that no condition is applied without being shown.
 */
export function guestSummary(draft: GuestDraft, now = Date.now()) {
  // The budget is said here, with what it is for: "до 15 000 ₸ за сутки" or "до 45 000 ₸ за всё".
  // «Сейчас» counts from where the guest is: "рядом с вами", not "рядом с выбранным местом", and no "ближе".
  const line = guestRequestLine({ ...draft, maxPrice: '', near: draft.now ? null : draft.near }, now);
  const said = line.toLocaleLowerCase('ru');
  // «Сейчас» and «На ночь» start at an hour of their own, not at 14:00: it is said.
  const from = draft.now || draft.mode === 'night' ? 'заезд с ' + draft.start.slice(11) : '';
  const more = [
    from,
    draft.now ? (draft.near ? 'готово сейчас, рядом с вами' : 'готово сейчас') : '',
    ...WISHES.filter(([id]) => draft.features.includes(id)).map(([, title]) => (title === 'Wi-Fi' ? title : title.toLocaleLowerCase('ru'))),
    draft.now ? '' : PRIORITY_WORDS[draft.priority] || ''
  ].filter(word => word && !said.includes(word.toLocaleLowerCase('ru')));
  return [line, homeWords(draft), budgetWords(draft), ...more].filter(Boolean).join(' · ');
}

/** "студия или квартира, 2 комн."; '' when any home will do. */
export function homeWords(draft: Pick<GuestDraft, 'kinds' | 'rooms'>) {
  const kinds = (draft.kinds || []).map(id => (HOME_KINDS[id] || '').toLocaleLowerCase('ru')).filter(Boolean).join(' или ');
  const rooms = draft.rooms ? (draft.rooms.endsWith('+') ? 'от ' + draft.rooms.slice(0, -1) : draft.rooms) + ' комн.' : '';
  return [kinds, rooms].filter(Boolean).join(', ');
}

/** "до 15 000 ₸ за сутки", "до 3 000 ₸ за час", "до 45 000 ₸ за всё"; '' without a budget. */
export function budgetWords(draft: Pick<GuestDraft, 'maxPrice' | 'perUnit' | 'mode' | 'start' | 'end'>) {
  const amount = Number(draft.maxPrice);
  if (!(amount > 0) || draft.maxPrice === NO_BUDGET) return '';
  const sum = 'до ' + new Intl.NumberFormat('ru-RU').format(amount).replace(/\s/g, ' ') + ' ₸';
  if (draft.perUnit) return sum + (draft.mode === 'hourly' ? ' за час' : draft.mode === 'night' ? ' за ночь' : ' за сутки');
  return draftUnits(draft as GuestDraft) > 1 ? sum + ' за всё' : sum;
}

/** The request as /api/public/matching and matching/begin expect it: Kazakhstan time with its offset. */
export function matchingBody(draft: GuestDraft) {
  return {
    city: draft.city,
    district: draft.district.trim(),
    mode: draft.mode,
    start: draft.start + '+05:00',
    end: draft.end + '+05:00',
    guests: draft.guests,
    // The server compares the price of the whole stay: a price per day or per hour is multiplied out here.
    maxPrice: Number(draft.maxPrice) ? Math.min(Number(NO_BUDGET), Number(draft.maxPrice) * (draft.perUnit ? draftUnits(draft) : 1)) : Number(NO_BUDGET),
    priority: draft.priority,
    features: draft.features,
    near: draft.near,
    kinds: draft.kinds || [],
    rooms: draft.rooms || '',
    now: !!draft.now
  };
}

/** The stay as two UTC timestamps, for the booking form. */
export function stayISO(draft: Pick<GuestDraft, 'start' | 'end'>) {
  const iso = (local: string) => new Date(local + ':00+05:00').toISOString();
  return { start: iso(draft.start), end: iso(draft.end) };
}

// ---------- The form: every control changes the same start and end the text does ----------

/** Hours of an hourly stay, or the days the daily tariff counts. */
export function draftUnits(draft: GuestDraft) {
  return draft.mode === 'hourly' ? clamp(stayHours(draft.start, draft.end), 1, 23) : clamp(stayNights(draft.start, draft.end), 1, 30);
}

function stayFor(draft: GuestDraft, date: string, time: string, units: number, now: number) {
  if (draft.mode === 'hourly') return freshStay({ mode: 'hourly', ...hourlyStay(date, time, units) }, now);
  // The tariff counts started days: a check-in before noon and a check-out at noon the next day are two of them.
  const checkout = addDays(date, time < CHECKOUT_TIME ? units - 1 : units);
  return dailyStay(date, checkout, now, time);
}

export function withMode(draft: GuestDraft, mode: GuestDraft['mode'], now = Date.now()): GuestDraft {
  return mode === draft.mode ? draft : { ...draft, ...switchStay(mode, draft.start, now), mode };
}
export function withDay(draft: GuestDraft, date: string, now = Date.now()): GuestDraft {
  // A daily stay on another day starts at the usual check-in hour again.
  const time = draft.mode === 'hourly' ? draft.start.slice(11) : '14:00';
  return { ...draft, ...stayFor(draft, date, time, draftUnits(draft), now) };
}
export function withTime(draft: GuestDraft, time: string, now = Date.now()): GuestDraft {
  return { ...draft, ...stayFor(draft, draft.start.slice(0, 10), time, draftUnits(draft), now) };
}
export function withUnits(draft: GuestDraft, units: number, now = Date.now()): GuestDraft {
  return { ...draft, ...stayFor(draft, draft.start.slice(0, 10), draft.start.slice(11), units, now) };
}

/** The days the form offers: a week from today, plus the chosen day when the text named a later one. */
export function dayChoices(draft: GuestDraft, now = Date.now()): [string, string][] {
  const today = kzToday(now);
  const label = (date: string, offset: number) => {
    if (offset === 0) return 'Сегодня';
    if (offset === 1) return 'Завтра';
    const day = new Date(date + 'T00:00:00Z');
    return WEEKDAYS[day.getUTCDay()] + ', ' + day.getUTCDate() + ' ' + MONTHS[day.getUTCMonth()];
  };
  const days: [string, string][] = [0, 1, 2, 3, 4, 5, 6].map(offset => [addDays(today, offset), label(addDays(today, offset), offset)]);
  const chosen = draft.start.slice(0, 10);
  if (!days.some(([date]) => date === chosen)) days.push([chosen, label(chosen, -1)]);
  return days.sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------- Search results ----------

const REASON_TEXT: Record<string, string> = { 'Готовность проверена': 'Готово к заселению' };

/** The server's reasons as the guest reads them: no "в пределах бюджета" when no budget was named. */
export function shownReasons(reasons: unknown, draft: Pick<GuestDraft, 'maxPrice'>, bath = false): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason): reason is string => typeof reason === 'string' && (!!draft.maxPrice || reason !== 'В пределах бюджета'))
    .map(reason => (bath && reason === 'Готовность проверена' ? 'Готово к приходу гостей' : REASON_TEXT[reason] || reason));
}
