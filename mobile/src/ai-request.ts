// The guest's request on the map screen: the conditions of a search and the free text that fills them.
// The text is read by the same rules as on the site (guestSearchRequest in lib/map-search-request.ts), so
// "14 ноября на двоих" means the same thing in the app and in the browser. This file keeps the app's form
// in step with those rules. No model is called here. Covered by mobile/tests/ai-request.test.mjs.
import {
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
  stayHours,
  stayNights,
  switchStay,
  weekendStay
} from '../../lib/map-search-request';

export type GuestDraft = {
  city: string;
  district: string;
  mode: 'daily' | 'hourly';
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
export type ChipId = 'daily' | 'hourly' | 'weekend';

// Types of home a guest can ask for, as lib/listings.ts names them (propertyTypes). Kept here so this file stays
// free of server code; mobile/tests/ai-request.test.mjs checks that the two lists match.
export const HOME_KINDS: Record<string, string> = {
  apartment: 'Квартира', studio: 'Студия', room: 'Комната', house: 'Дом',
  guesthouse: 'Гостевой дом', hostel: 'Хостел', hotel: 'Гостиница', aparthotel: 'Апарт-отель'
};

// The wishes the shared parser can read from text, in the order the form shows them.
export const WISHES: [string, string][] = [
  ['parking', 'Парковка'],
  ['wifi', 'Wi-Fi'],
  ['kitchen', 'Кухня'],
  ['workspace', 'Рабочее место']
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
  return { city, district: '', ...defaultStay('daily', now), guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '' };
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
  const kept = freshDraft(draft, now);
  const base: GuestDraft = REFINE.test(text.trim().toLocaleLowerCase('ru'))
    ? kept
    : { ...kept, district: '', guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '' };
  const result = guestSearchRequest(text, base, cities, now);
  const filters = result.filters;
  const next: GuestDraft = {
    ...base,
    city: String(filters.city || base.city),
    district: String(filters.district || ''),
    mode: filters.mode === 'hourly' ? 'hourly' : 'daily',
    start: String(filters.start),
    end: String(filters.end),
    guests: clamp(Number(filters.guests) || base.guests, 1, MAX_GUESTS),
    maxPrice: String(filters.maxPrice || ''),
    perUnit: typeof filters.perUnit === 'boolean' ? filters.perUnit : base.perUnit,
    priority: filters.priority === 'cheaper' || filters.priority === 'closer' ? filters.priority : 'balanced',
    features: Array.isArray(filters.features) ? filters.features.filter((id: unknown) => WISHES.some(([known]) => known === id)) : [],
    near: filters.near || null,
    kinds: Array.isArray(filters.kinds) ? filters.kinds.filter((id: unknown) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(HOME_KINDS, id)) : [],
    rooms: typeof filters.rooms === 'string' && /^[1-9]\+?$/.test(filters.rooms) ? filters.rooms : ''
  };
  // "почасовая" names a tariff but no day and no length: the stay follows the new tariff.
  if (!result.past && next.mode !== base.mode && !result.stated.when) Object.assign(next, switchStay(next.mode, base.start, now));
  return {
    draft: next,
    nearby: result.nearby,
    understood: result.understood,
    ...(result.past ? { past: result.past } : {}),
    note: (result.remarks || []).join(' ')
  };
}

/** The three quick requests under the line: a day from today, the nearest three hours, the nearest weekend. */
export function chipDraft(id: ChipId, draft: GuestDraft, now = Date.now()): GuestDraft {
  return { ...draft, ...(id === 'weekend' ? weekendStay(now) : defaultStay(id, now)) };
}

const PRIORITY_WORDS: Record<string, string> = { cheaper: 'дешевле', closer: 'ближе' };

/**
 * One line that says everything the search will use: "Павлодар, Центр · сегодня 19:00–22:00 · 2 гостя · до 20 000 ₸ · парковка".
 * The site's line names the place, the time, the guests and the budget; the wishes and "дешевле / ближе" are
 * added here, so that no condition is applied without being shown.
 */
export function guestSummary(draft: GuestDraft, now = Date.now()) {
  // The budget is said here, with what it is for: "до 15 000 ₸ за сутки" or "до 45 000 ₸ за всё".
  const line = guestRequestLine({ ...draft, maxPrice: '' }, now);
  const said = line.toLocaleLowerCase('ru');
  const more = [
    ...WISHES.filter(([id]) => draft.features.includes(id)).map(([, title]) => (title === 'Wi-Fi' ? title : title.toLocaleLowerCase('ru'))),
    PRIORITY_WORDS[draft.priority] || ''
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
  if (draft.perUnit) return sum + (draft.mode === 'hourly' ? ' за час' : ' за сутки');
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
    rooms: draft.rooms || ''
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

export function withMode(draft: GuestDraft, mode: 'daily' | 'hourly', now = Date.now()): GuestDraft {
  return mode === draft.mode ? draft : { ...draft, ...switchStay(mode, draft.start, now) };
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
export function shownReasons(reasons: unknown, draft: Pick<GuestDraft, 'maxPrice'>): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason): reason is string => typeof reason === 'string' && (!!draft.maxPrice || reason !== 'В пределах бюджета'))
    .map(reason => REASON_TEXT[reason] || reason);
}
