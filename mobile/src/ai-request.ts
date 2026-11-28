import {L,forms,t,tLine} from '../../lib/i18n';
// The guest's request on the map screen: the conditions of a search and the free text that fills them.
// The text is read by the same rules as on the site (guestSearchRequest in lib/map-search-request.ts), so
// "14 ноября на двоих" means the same thing in the app and in the browser. This file keeps the app's form
// in step with those rules. No model is called here. Covered by mobile/tests/ai-request.test.mjs.
import {
  BANQUET_KINDS,
  BATH_KINDS,
  LEISURE_KINDS,
  SPORT_KINDS,
  AUTO_KINDS,
  MAX_BANQUET_GUESTS,
  banquetSlot,
  banquetStay,
  defaultBanquet,
  type BanquetSlot,
  CHECKIN_TIME,
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
  // label: the landmark the point stands for («железнодорожный вокзал»), when the guest named one.
  near: { longitude: number; latitude: number; radius: number; label?: string } | null;
  kinds: string[]; // types of home (lib/listings.ts propertyTypes); [] for any
  rooms: string; // '2' exactly two rooms, '2+' at least two; '' for any
  classes?: string[]; // классы жилья (lib/stay-class.ts): any of these; absent or [] for any
  now: boolean; // «Сейчас»: only homes ready now that confirm at once, the nearest first
  maxFloor?: number; // «первый этаж», «не выше 3 этажа»: the highest floor; absent or 0 for any
  occasion?: string; // «Банкет» only: what the hall is taken for (OCCASIONS); 'memorial' keeps every word quiet
};
export type ParsedRequest = {
  draft: GuestDraft; // the conditions with everything the text says applied
  nearby: boolean; // the guest asked for "рядом": the screen asks for a point on the map
  place?: string; // a landmark to search around («у вокзала»): the screen finds its point on the map
  understood: boolean; // false when the text named no condition we know
  // The day or the hour the text names is already behind. Nothing is moved to another day and nothing
  // is searched: the screen says so and opens the form.
  past?: 'date' | 'time';
  // What was cut or could not be taken as written ("Максимум 23 часа, ищу на 23."); '' when nothing was.
  note: string;
};
export type ChipId = 'now' | 'night' | 'daily' | 'hourly' | 'weekend' | 'evening' | 'tomorrow' | 'toi' | 'party' | 'memorial';

// Types of home a guest can ask for, as lib/listings.ts names them (propertyTypes). Kept here so this file stays
// free of server code; mobile/tests/ai-request.test.mjs checks that the two lists match.
export const HOME_KINDS: Record<string, string> = L({
  apartment: 'Квартира', studio: 'Студия', room: 'Комната', house: 'Дом',
  guesthouse: 'Гостевой дом', hostel: 'Хостел', hotel: 'Гостиница', aparthotel: 'Апарт-отель', resort: 'База отдыха',
  banya: 'Баня', sauna: 'Сауна',
  banquet: 'Банкетный зал', cafe: 'Кафе',
  loft: 'Лофт', photostudio: 'Фотостудия', meeting: 'Конференц-зал', karaoke_room: 'Караоке-кабинка', playroom: 'Детская комната', gazebo: 'Беседка, юрта', quest: 'Квест',
  field: 'Футбольное поле', court: 'Корт', sporthall: 'Спортзал', billiard: 'Бильярд', gameclub: 'Игровой клуб',
  carwash: 'Автомойка', tires: 'Шиномонтаж', carservice: 'Автосервис', detailing: 'Детейлинг'
});

// What the guest looks for, chosen above the line like a tariff in a taxi (lib/listings.ts categories).
// «Баня» is a bath or a sauna taken whole for a few hours. The category is kept in the types of the request:
// only bath types named means «Баня», anything else «Жильё».
// «Досуг», «Спорт», «Авто» (2026-11-28) are taken by the hour, as a bath is (isHourly).
export type Category = 'stay' | 'bath' | 'banquet' | 'leisure' | 'sport' | 'auto';
const PLACE_GROUPS: Record<'leisure' | 'sport' | 'auto', string[]> = { leisure: LEISURE_KINDS, sport: SPORT_KINDS, auto: AUTO_KINDS };
export const BATH_TYPES: string[] = BATH_KINDS;
export const BANQUET_TYPES: string[] = BANQUET_KINDS;
export const CATEGORIES: { id: Category; title: string; any: string; hint: string }[] = L([
  { id: 'stay', title: 'Жильё', any: 'Любое жильё', hint: 'на сутки, на ночь или на часы' },
  { id: 'bath', title: 'Баня', any: 'Любая баня', hint: 'на несколько часов' },
  { id: 'banquet', title: 'Банкет', any: 'Любой зал', hint: 'той, юбилей, поминки' },
  { id: 'leisure', title: 'Досуг', any: 'Любое место', hint: 'лофт, фотостудия, караоке, беседка' },
  { id: 'sport', title: 'Спорт', any: 'Любое место', hint: 'поле, корт, бильярд, игровой клуб' },
  { id: 'auto', title: 'Авто', any: 'Любой сервис', hint: 'мойка, шиномонтаж, СТО' }
]);
/** Taken by the hour inside the place's hours: a bath and the places of «Досуг», «Спорт», «Авто». */
export const isHourly = (category: Category) => category === 'bath' || category === 'leisure' || category === 'sport' || category === 'auto';
// What a hall is taken for (lib/listings.ts occasions). A memorial meal is spoken of quietly on every screen.
export const OCCASIONS: [string, string][] = L([['toi', 'Свадьба, той'], ['uzatu', 'Қыз ұзату'], ['kudalyk', 'Құдалық, сватовство'], ['betashar', 'Беташар'], ['sundet', 'Сүндет той'], ['tusau', 'Тұсаукесер'], ['besik', 'Бесік той, шілдехана'], ['party', 'Юбилей, мерейтой'], ['birthday', 'День рождения'], ['corporate', 'Корпоратив'], ['graduation', 'Выпускной'], ['newyear', 'Новый год'], ['kids', 'Детский праздник'], ['conference', 'Конференция, семинар'], ['memorial', 'Поминки: ас, жетісі, қырқы'], ['other', 'Другое']]);
export const occasionTitle = (id?: string) => OCCASIONS.find(([known]) => known === id)?.[1] || '';
// A guest asks for a cleaning of their own home, not for a place: «уборка завтра», «нужна уборка», «клининг», «убраться
// в квартире». A stay that merely mentions cleaning («квартира после уборки») is still a search.
export const cleaningAsk = (text: string) =>
  /^\s*(?:(?:мне|нужна|нужен|нужно|хочу|заказать|закажу)\s+){0,3}(?:уборк|клининг|убрать(?:ся)?(?=\s|$)|генеральн\S*\s+уборк)/i.test(text) ||
  /уборк\S*\s+(?:на\s+дом|дома|в\s+квартир|квартир)/i.test(text);
export const isQuiet = (draft: { occasion?: string }) => draft.occasion === 'memorial';
/** Every type of a category; none for «Жильё», where no type named is any home. */
export const allKinds = (category: Category): string[] => (category === 'bath' ? [...BATH_KINDS] : category === 'banquet' ? [...BANQUET_KINDS] : category === 'stay' ? [] : [...PLACE_GROUPS[category]]);
const every = (kinds: string[], of: string[]) => kinds.length > 0 && kinds.every(id => of.includes(id));
export const categoryOf = (draft: Pick<GuestDraft, 'kinds'>): Category => (every(draft.kinds, BATH_KINDS) ? 'bath' : every(draft.kinds, BANQUET_KINDS) ? 'banquet' : every(draft.kinds, LEISURE_KINDS) ? 'leisure' : every(draft.kinds, SPORT_KINDS) ? 'sport' : every(draft.kinds, AUTO_KINDS) ? 'auto' : 'stay');
export const kindCategoryOf = (kind?: string): Category => categoryOf({ kinds: kind ? [kind] : [] });
/** The largest party of a category: fifty, a thousand in a banquet hall. */
export const maxGuestsOf = (category: Category) => (category === 'banquet' ? MAX_BANQUET_GUESTS : SHARED_MAX_GUESTS);
/** The types a category offers in the form, with their names. */
export const categoryKinds = (category: Category): [string, string][] => Object.entries(HOME_KINDS).filter(([id]) => kindCategoryOf(id) === category);
/** What the category button says: the one type that is chosen, or the category itself. `id` names the icon (KindIcon). */
export function kindChoice(draft: Pick<GuestDraft, 'kinds'>): { id: string; title: string } {
  const category = CATEGORIES.find(c => c.id === categoryOf(draft))!, one = draft.kinds.length === 1 ? draft.kinds[0] : '';
  return one && HOME_KINDS[one] ? { id: one, title: HOME_KINDS[one] } : { id: category.id, title: category.title };
}
/** A type chosen in the category picker: the category changes with it; no type is the whole category. */
export function withKind(draft: GuestDraft, category: Category, kind: string | null, now = Date.now()): GuestDraft {
  const next = withCategory(draft, category, now);
  return { ...next, kinds: kind ? [kind] : allKinds(category) };
}
/**
 * Another category is another request: the place stays, what narrowed the search starts over. A bath is by the
 * hour; a banquet is a slot of one day for a large party, the nearest Saturday evening to begin with.
 */
/** The party a category of places starts with. */
export const placeGuests = (category: Category) => (category === 'auto' ? 1 : category === 'sport' ? 10 : category === 'leisure' ? 6 : 4);
export function withCategory(draft: GuestDraft, category: Category, now = Date.now()): GuestDraft {
  if (categoryOf(draft) === category) return draft;
  const { occasion: _left, ...rest } = draft;
  const clean = { ...rest, district: '', maxPrice: '', perUnit: true, priority: 'balanced' as const, features: [], near: null, rooms: '', now: false, maxFloor: 0 };
  if (category === 'banquet') return { ...clean, ...defaultBanquet(now), guests: 50, kinds: [...BANQUET_KINDS] };
  if (category === 'bath') return { ...clean, ...defaultStay('hourly', now), guests: Math.min(Math.max(draft.guests, 4), SHARED_MAX_GUESTS), kinds: [...BATH_KINDS] };
  // «Авто» brings one car; «Спорт» a team; «Досуг» a company.
  if (isHourly(category)) return { ...clean, ...defaultStay('hourly', now, category === 'auto' ? 1 : 3), guests: placeGuests(category), kinds: allKinds(category) };
  return { ...clean, ...defaultStay('daily', now), guests: 2, kinds: [] };
}

// The wishes the shared parser can read from text, in the order the form shows them: the amenities an owner
// marks, and 'pets' for the owner's rule «можно с питомцами».
export const WISHES: [string, string][] = L([
  ['parking', 'Парковка'],
  ['wifi', 'Wi-Fi'],
  ['kitchen', 'Кухня'],
  ['workspace', 'Рабочее место'],
  ['pets', 'С питомцами'],
  ['aircon', 'Кондиционер'],
  ['washer', 'Стиральная машина'],
  ['tv', 'Телевизор'],
  ['balcony', 'Балкон'],
  ['elevator', 'Лифт'],
  ['crib', 'Детская кроватка'],
  ['hairdryer', 'Фен'],
  ['iron', 'Утюг'],
  ['linen', 'Постельное бельё'],
  ['towels', 'Полотенца'],
  ['jacuzzi', 'Джакузи'],
  // The owner's rules and way of check-in (lib/smart-matching.ts RULE_FEATURES).
  ['selfcheckin', 'Самозаселение'],
  ['nodeposit', 'Без депозита'],
  ['smoking', 'Можно курить'],
  ['parties', 'Для вечеринок']
]);
// What a company asks of a bath; the ids are the shared amenities.
export const BATH_WISHES: [string, string][] = L([
  ['steam', 'Парилка'],
  ['pool', 'Бассейн'],
  ['jacuzzi', 'Джакузи'],
  ['plunge', 'Купель'],
  ['brooms', 'Веники'],
  ['karaoke', 'Караоке'],
  ['grill', 'Мангал'],
  ['billiards', 'Бильярд'],
  ['towels', 'Полотенца'],
  ['wifi', 'Wi-Fi'],
  ['parking', 'Парковка']
]);
// What is asked of a banquet hall; the ids are the shared amenities.
export const BANQUET_WISHES: [string, string][] = L([
  ['halal', 'Халяль'],
  ['prayer', 'Комната для намаза'],
  ['stage', 'Сцена'],
  ['sound', 'Звук и микрофон'],
  ['dancefloor', 'Танцпол'],
  ['karaoke', 'Караоке'],
  ['ownfood', 'Свои продукты'],
  ['kidsroom', 'Детская комната'],
  ['aircon', 'Кондиционер'],
  ['wifi', 'Wi-Fi'],
  ['parking', 'Парковка']
]);
// «Досуг», «Спорт», «Авто»: the few shared wishes their owners can mark too.
export const PLACE_WISHES: [string, string][] = WISHES.filter(([id]) => ['parking', 'wifi', 'aircon', 'kitchen', 'tv'].includes(id));
export const wishesOf = (category: Category) => (category === 'bath' ? BATH_WISHES : category === 'banquet' ? BANQUET_WISHES : isHourly(category) ? PLACE_WISHES : WISHES);
// The largest party the service accepts; the form and the text stop at the same number.
export const MAX_GUESTS = SHARED_MAX_GUESTS;
// What the screen says when the text names a day or an hour that is behind, in the words of the site.
export const PAST_TEXT = L({ date: 'Эта дата уже прошла.', time: 'Это время уже прошло.' });

const MONTHS = L(['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']);
const WEEKDAYS = L(['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Классы жилья as lib/stay-class.ts names them; mobile/tests/ai-request.test.mjs checks that the two lists match.
export const STAY_CLASS_LIST: [string, string][] = L([['economy', 'Эконом'], ['standard', 'Стандарт'], ['comfort', 'Комфорт'], ['premium', 'Премиум']]);
const CLASS_WORDS: [string, RegExp][] = [['economy', /эконом|economy|үнемді/], ['standard', /стандарт|standard/], ['comfort', /комфорт|comfort|жайлы/], ['premium', /премиум|люкс|lux|vip|вип|элитн|бизнес[- ]?класс|premium/]];
/** The classes a phrase names, in their order: «комфорт или премиум» → comfort, premium. */
export function classesFromText(text: string) {
  const low = text.toLocaleLowerCase('ru');
  return CLASS_WORDS.filter(([, re]) => re.test(low)).map(([id]) => id);
}
export const classWords = (classes: string[] = []) => STAY_CLASS_LIST.filter(([id]) => classes.includes(id)).map(([, title]) => title).join(t(' или '));

/** What the form starts with: today until tomorrow, two guests, no budget. */
export function newDraft(city: string, now = Date.now()): GuestDraft {
  return { city, district: '', ...defaultStay('daily', now), guests: 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: [], rooms: '', now: false, maxFloor: 0 };
}

/** The same conditions with the stay moved out of the past, for a screen that stayed open. */
export function freshDraft(draft: GuestDraft, now = Date.now()): GuestDraft {
  // A banquet slot that has begun gives way to the usual one; a slot is never cut short.
  if (categoryOf(draft) === 'banquet') return new Date(draft.start + ':00+05:00').getTime() >= now + 30 * 60000 ? draft : { ...draft, ...defaultBanquet(now, draft.occasion) };
  return { ...draft, ...freshStay(draft, now) };
}

// Words that refine the last request instead of starting a new one: "а дешевле", "ещё с парковкой", "теперь на завтра".
const REFINE = /^(?:а|и|ещ[её]|теперь|только|плюс|также|тоже|добав[а-я]*|но|подешевле|дешевле|ближе|поближе|желательно|главное|без|у|возле|около|рядом|недалеко|вблизи|со?(?=\s+(?!понедельник|вторник|сред|четверг|пятниц|суббот|воскресень|завтра|сегодня|послезавтра|утра|вечера|обеда)[а-яё]))(?=$|[^а-яё])/;

/**
 * Free text as the conditions of a search. A new phrase is a new request: only the city stays. What narrows a
 * search (guests, budget, district, home type, wishes, a point) starts over, so that "нас 7 человек" said a
 * minute ago does not empty every later search; and the stay starts over as a day from today, so that "на 3
 * часа" said a minute ago does not turn "двушка завтра" into three hours. When that lets go of a stay the guest
 * had set, the note says so. A phrase that starts as a refinement ("а дешевле", "ещё с парковкой", "с собакой")
 * keeps it all. Nothing is invented: what a refinement does not name stays as it was.
 */
export function guestRequestFromText(text: string, draft: GuestDraft, cities: string[], now = Date.now()): ParsedRequest {
  // «Квартира» names no type of home (any home will do), but said in «Баня» it leaves that category.
  const home = /квартир|жиль[её]|однушк|двушк|тр[её]шк/.test(text.toLocaleLowerCase('ru'));
  const fresh = freshDraft(draft, now);
  const kept = home && categoryOf(fresh) !== 'stay' ? withCategory(fresh, 'stay', now) : fresh;
  // The category chosen in the sheet stays: in «Баня» a new phrase is still about a bath, by the hour, and keeps the
  // party; in «Банкет» it is still about a hall, its guests and what it is for.
  const category = categoryOf(kept), bath = isHourly(category), venue = category !== 'stay';
  const refining = REFINE.test(text.trim().toLocaleLowerCase('ru'));
  const usual = category === 'banquet' ? defaultBanquet(now, kept.occasion) : defaultStay(bath ? 'hourly' : 'daily', now, category === 'auto' ? 1 : 3);
  const base: GuestDraft = refining
    ? kept
    : { ...kept, ...usual, district: '', guests: venue ? kept.guests : 2, maxPrice: '', perUnit: true, priority: 'balanced', features: [], near: null, kinds: allKinds(category), rooms: '', now: false, maxFloor: 0 };
  const result = guestSearchRequest(text, base, cities, now, { places: true });
  const filters = result.filters;
  const kinds: string[] = Array.isArray(filters.kinds) ? filters.kinds.filter((id: unknown) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(HOME_KINDS, id)) : [];
  const to = categoryOf({ kinds }), hall = to === 'banquet';
  const { occasion: _before, classes: _classes, ...plain } = base;
  // «комфорт», «премиум», «эконом»: a class named is a new choice; a refinement that names none keeps the classes.
  const named = classesFromText(text), classes = to === 'stay' ? (named.length ? named : refining ? base.classes || [] : []) : [];
  const next: GuestDraft = {
    ...plain,
    // A hall named in «Жильё» or «Баня» without its guests starts at fifty, the party a hall is taken for.
    ...(hall ? { occasion: typeof filters.occasion === 'string' && filters.occasion ? filters.occasion : category === 'banquet' ? base.occasion || '' : '' } : {}),
    city: String(filters.city || base.city),
    district: String(filters.district || ''),
    mode: filters.mode === 'hourly' || filters.mode === 'night' ? filters.mode : 'daily',
    start: String(filters.start),
    end: String(filters.end),
    // A bath named in «Жильё» without its guests starts at four, as the category button does.
    guests: hall && category !== 'banquet' && !result.stated.guests ? 50 : isHourly(to) && category !== to && !result.stated.guests ? placeGuests(to) : clamp(Number(filters.guests) || base.guests, 1, maxGuestsOf(to)),
    maxPrice: String(filters.maxPrice || ''),
    perUnit: typeof filters.perUnit === 'boolean' ? filters.perUnit : base.perUnit,
    priority: filters.priority === 'cheaper' || filters.priority === 'closer' ? filters.priority : 'balanced',
    features: Array.isArray(filters.features) ? filters.features.filter((id: unknown) => [...WISHES, ...BATH_WISHES, ...BANQUET_WISHES].some(([known]) => known === id)) : [],
    near: filters.near || null,
    kinds,
    rooms: typeof filters.rooms === 'string' && /^[1-9]\+?$/.test(filters.rooms) ? filters.rooms : '',
    ...(classes.length ? { classes } : {}),
    now: filters.now === true,
    maxFloor: Number(filters.maxFloor) >= 1 ? Number(filters.maxFloor) : 0
  };
  // "почасовая" names a tariff but no day and no length: the stay follows the new tariff.
  if (!hall && !result.past && next.mode !== base.mode && !result.stated.when) Object.assign(next, { ...switchStay(next.mode, base.start, now), mode: next.mode });
  // The stay the guest had set is let go of, and the new phrase names none: said, so that it is not a surprise.
  const reset = !hall && !refining && !result.stated.when && !result.past && result.understood && next.mode === 'daily' && (kept.mode !== usual.mode || kept.start !== usual.start || kept.end !== usual.end);
  return {
    draft: next,
    nearby: result.nearby,
    ...(result.place ? { place: result.place } : {}),
    // A class alone («премиум», «только люкс») is a condition the search understands.
    understood: result.understood || (to === 'stay' && named.length > 0),
    ...(result.past ? { past: result.past } : {}),
    note: [...(result.remarks || []), reset ? t('Срок не назван: ищу на сутки с сегодня.') : ''].filter(Boolean).join(' ')
  };
}

/**
 * The quick requests under the line. «Сейчас»: from the nearest half-hour that leaves 15 minutes, for a day (for
 * three hours on the hourly tariff), only homes ready now that confirm at once. «На ночь»: tonight till noon at the
 * nightly price where it is cheaper; after midnight, from now. The others: a day from today, the nearest three
 * hours, the nearest weekend.
 */
export function chipDraft(id: ChipId, draft: GuestDraft, now = Date.now()): GuestDraft {
  // The chips of «Банкет» say what the hall is for. A memorial meal is soon and at lunch: tomorrow at 12:00.
  if (id === 'toi' || id === 'party' || id === 'memorial') {
    const hall = withCategory(draft, 'banquet', now);
    return { ...hall, occasion: id, ...(id === 'memorial' ? defaultBanquet(now, id) : hall.occasion === 'memorial' ? defaultBanquet(now) : {}) };
  }
  // «Авто»: a car takes an hour, «Завтра» is the morning.
  const car = categoryOf(draft) === 'auto';
  if (car && id === 'tomorrow') return { ...draft, mode: 'hourly', ...hourlyStay(addDays(kzToday(now), 1), '10:00', 1), ...(draft.now ? { near: null, priority: 'balanced' as const } : {}), now: false };
  if (id === 'now') {
    const from = new Date(nextSlot(now, 15) + 5 * 3600000).toISOString().slice(0, 16), today = kzToday(now);
    const stay = draft.mode === 'hourly'
      ? { mode: 'hourly' as const, ...hourlyStay(from.slice(0, 10), from.slice(11), car ? 1 : 3) }
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

const PRIORITY_WORDS: Record<string, string> = L({ cheaper: 'дешевле', closer: 'ближе' });

/**
 * One line that says everything the search will use: "Павлодар, Центр · сегодня 19:00–22:00 · 2 гостя · до 20 000 ₸ · парковка".
 * The site's line names the place, the time, the guests and the budget; the wishes and "дешевле / ближе" are
 * added here, so that no condition is applied without being shown.
 */
export function guestSummary(draft: GuestDraft, now = Date.now()) {
  // The budget is said here, with what it is for: "до 15 000 ₸ за сутки" or "до 45 000 ₸ за всё".
  // «Сейчас» counts from where the guest is: "рядом с вами", not "рядом с выбранным местом", and no "ближе".
  const line = guestRequestLine({ ...draft, maxPrice: '', near: draft.now && !draft.near?.label ? null : draft.near }, now);
  const said = line.toLocaleLowerCase('ru');
  // «Сейчас» and «На ночь» start at an hour of their own, not at 14:00: it is said.
  // So does a day the guest asked to start at an hour of their own («в 22:00»).
  const category = categoryOf(draft), hall = category === 'banquet';
  // A bath is by the hour: its line already says «18:30–21:30», and nobody «заезжает» there.
  const from = category === 'stay' && (draft.now || draft.mode === 'night' || (draft.mode === 'daily' && draft.start.slice(11) !== CHECKIN_TIME)) ? t('заезд с {time}',{time:draft.start.slice(11)}) : '';
  const more = [
    from,
    draft.now ? (draft.near && !draft.near.label ? t('готово сейчас, рядом с вами') : t('готово сейчас')) : '',
    ...wishesOf(category).filter(([id]) => draft.features.includes(id)).map(([, title]) => (title === 'Wi-Fi' ? title : title.toLocaleLowerCase('ru'))),
    draft.maxFloor ? (draft.maxFloor === 1 ? t('первый этаж') : t('не выше {maxFloor} этажа',{maxFloor:draft.maxFloor})) : '',
    draft.now ? '' : PRIORITY_WORDS[draft.priority] || ''
  ].filter(word => word && !said.includes(word.toLocaleLowerCase('ru')));
  // A landmark is named: "рядом: железнодорожный вокзал", not "рядом с выбранным местом".
  const where = draft.near?.label ? line.replace(t('рядом с выбранным местом'), t('рядом: {label}', { label: draft.near.label })) : line;
  return [hall ? occasionTitle(draft.occasion) : '', where, hall && draft.kinds.length > 1 ? '' : homeWords(draft), budgetWords(draft), ...more].filter(Boolean).join(' · ');
}

/** "студия или квартира, 2 комн."; '' when any home will do. */
export function homeWords(draft: Pick<GuestDraft, 'kinds' | 'rooms'>) {
  const kinds = (draft.kinds || []).map(id => (HOME_KINDS[id] || '').toLocaleLowerCase('ru')).filter(Boolean).join(t(' или '));
  const rooms = draft.rooms ? (draft.rooms.endsWith('+') ? t('от {n} комн.',{n:draft.rooms.slice(0, -1)}) : t('{n} комн.',{n:draft.rooms})) : '';
  return [kinds, rooms].filter(Boolean).join(', ');
}

/** "до 15 000 ₸ за сутки", "до 3 000 ₸ за час", "до 45 000 ₸ за всё"; '' without a budget. */
export function budgetWords(draft: Pick<GuestDraft, 'maxPrice' | 'perUnit' | 'mode' | 'start' | 'end'> & { kinds?: string[] }) {
  const amount = Number(draft.maxPrice);
  if (!(amount > 0) || draft.maxPrice === NO_BUDGET) return '';
  const sum = new Intl.NumberFormat('ru-RU').format(amount).replace(/\s/g, ' ');
  if (categoryOf({ kinds: draft.kinds || [] }) === 'banquet') return draft.perUnit ? t('до {sum} ₸ за гостя',{sum}) : t('до {sum} ₸ за всё',{sum});
  if (draft.perUnit) return draft.mode === 'hourly' ? t('до {sum} ₸ за час',{sum}) : draft.mode === 'night' ? t('до {sum} ₸ за ночь',{sum}) : t('до {sum} ₸ за сутки',{sum});
  return draftUnits(draft as GuestDraft) > 1 ? t('до {sum} ₸ за всё',{sum}) : t('до {sum} ₸',{sum});
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
    // In «Банкет» the price named is per guest.
    maxPrice: Number(draft.maxPrice) ? Math.min(Number(NO_BUDGET), Number(draft.maxPrice) * (draft.perUnit ? (categoryOf(draft) === 'banquet' ? draft.guests : draftUnits(draft)) : 1)) : Number(NO_BUDGET),
    priority: draft.priority,
    features: draft.features,
    near: draft.near ? { longitude: draft.near.longitude, latitude: draft.near.latitude, radius: draft.near.radius } : null,
    kinds: draft.kinds || [],
    rooms: draft.rooms || '',
    ...(categoryOf(draft) === 'stay' && draft.classes?.length ? { classes: draft.classes } : {}),
    now: !!draft.now,
    ...(draft.maxFloor ? { maxFloor: draft.maxFloor } : {}),
    ...(categoryOf(draft) === 'banquet' && draft.occasion ? { occasion: draft.occasion } : {})
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
/** The slot of a banquet day, and another day with the same slot. */
export const draftSlot = (draft: Pick<GuestDraft, 'start'>): BanquetSlot => banquetSlot(draft.start);
export function withSlot(draft: GuestDraft, date: string, slot: BanquetSlot): GuestDraft {
  return { ...draft, mode: 'daily', ...banquetStay(date, slot) };
}
export function withDay(draft: GuestDraft, date: string, now = Date.now()): GuestDraft {
  if (categoryOf(draft) === 'banquet') return withSlot(draft, date, draftSlot(draft));
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
    if (offset === 0) return t('Сегодня');
    if (offset === 1) return t('Завтра');
    if (offset === 2 && categoryOf(draft) === 'banquet') return t('Послезавтра');
    const day = new Date(date + 'T00:00:00Z');
    return WEEKDAYS[day.getUTCDay()] + ', ' + day.getUTCDate() + ' ' + MONTHS[day.getUTCMonth()];
  };
  // A hall is taken ahead: tomorrow and the day after (a memorial meal), then the Saturdays and Sundays of three weeks.
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay(), saturday = (6 - weekday + 7) % 7;
  const offsets = categoryOf(draft) === 'banquet' ? [...new Set([1, 2, ...[0, 7, 14].flatMap(week => [saturday + week, saturday + week + 1])])].filter(n => n > 0).sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
  const days: [string, string][] = offsets.map(offset => [addDays(today, offset), label(addDays(today, offset), offset)]);
  const chosen = draft.start.slice(0, 10);
  if (!days.some(([date]) => date === chosen)) days.push([chosen, label(chosen, -1)]);
  return days.sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------- Search results ----------

const REASON_TEXT: Record<string, string> = L({ 'Готовность проверена': 'Готово к заселению' });
// The reasons with a number inside (lib/smart-matching.ts): tLine finds them here with {n} for the number.
export const REASON_LINES = /* i18n */ ['Отвечает в среднем за {n} минуту', 'Отвечает в среднем за {n} минуты', 'Отвечает в среднем за {n} минут', 'Отвечает в среднем за {n} час', 'Отвечает в среднем за {n} часа', 'Отвечает в среднем за {n} часов',
  'Около {n} минуты на машине', 'Около {n} минут на машине', 'Примерно {n} км от выбранного места'];

// A reason of the server in the language of the app: the fixed ones by the table, «Оценка 4,8 из 5 · 3 отзыва» as «★ 4,8 · 3».
const shownReason = (reason: string) => {
  const rated = reason.match(/^Оценка (\S+) из 5(?: · (\d+) отзыв\S*)?$/);
  return rated ? '★ ' + rated[1] + (rated[2] ? ' · ' + rated[2] + ' ' + forms(Number(rated[2]), 'отзыв', 'отзыва', 'отзывов') : '') : tLine(reason);
};
/** The server's reasons as the guest reads them: no "в пределах бюджета" when no budget was named. */
export function shownReasons(reasons: unknown, draft: Pick<GuestDraft, 'maxPrice'>, bath = false): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason): reason is string => typeof reason === 'string' && (!!draft.maxPrice || reason !== 'В пределах бюджета'))
    // "Оценка 4,8 из 5 · 3 отзыва" is "★ 4,8 · 3 отзыва" on a card.
    .map(reason => (bath && reason === 'Готовность проверена' ? t('Готово к приходу гостей') : REASON_TEXT[reason] || shownReason(reason)));
}

/** «Забронировать» asks the owner first: the home does not confirm by itself, and its owner answers quick requests. */
export const askFirst = (property: { quickRequest?: unknown; instant?: unknown }) => !!property.quickRequest && !property.instant;

const droppedWords = (dropped: unknown) => (Array.isArray(dropped) ? dropped.filter((v): v is string => typeof v === 'string' && !!v.trim()).slice(0, 5) : []);
/** The model put the guest's phrase into the words of the search: the guest sees those words and what was left out. */
export function understoodNote(phrase: string, dropped: unknown): string {
  const left = droppedWords(dropped);
  return t('ИИ понял так: «{phrase}».',{phrase}) + (left.length ? ' ' + t('Пока не ищу по условиям: {list}.',{list:left.join(', ')}) : '');
}
/** The model did not help: why, and what the guest can do. */
/** What to say instead, with an example for the kind of place searched: a hall is asked for by its day and guests. */
export function askExample(category: Category = 'stay'): string {
  if (category === 'banquet') return t('Назовите день и число гостей, например: «5 декабря на 150 гостей».');
  if (category === 'auto') return t('Назовите день и время, например: «завтра в 10:00 на час».');
  if (isHourly(category)) return t('Назовите день и время, например: «сегодня в 18:00 на 3 часа».');
  return t('Назовите день и срок, например: «завтра на сутки на двоих».');
}
export function notUnderstoodNote(status: unknown, dropped: unknown, category: Category = 'stay'): string {
  const left = droppedWords(dropped);
  if (status === 'permission') return t('Не понял запрос. ИИ разберёт такие фразы, если вы разрешите передавать ему ваши сообщения: спросите ИИ-администратора.');
  if (status === 'none' && left.length) return t('Пока не ищу по условиям: {list}.',{list:left.join(', ')}) + ' ' + askExample(category);
  return t('Не понял запрос.') + ' ' + askExample(category);
}

// ---------- A landmark ----------

/** The point of a landmark the server found, as the place to search around: three kilometres, the nearest first. */
export function nearPlace(draft: GuestDraft, spot: { longitude?: unknown; latitude?: unknown; name?: unknown }, asked: string): GuestDraft {
  const longitude = Number(spot.longitude), latitude = Number(spot.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return draft;
  const label = (typeof spot.name === 'string' && spot.name.trim() ? spot.name.trim() : asked).slice(0, 60);
  return { ...draft, near: { longitude, latitude, radius: 3000, label }, priority: 'closer' };
}

/** What the guest reads when the landmark was not found on the map. */
export const placeMissedNote = (asked: string) => t('Не нашёл на карте: {asked}. Ищу по всему городу.',{asked});

/** One format for a price on a map pin: "9 тыс.", "9,5 тыс.", "12 тыс."; under a thousand "800 ₸", from a million "1,2 млн". */
export function pinPrice(amount: number): string {
  if (amount < 1000) return Math.round(amount) + ' ₸';
  // A banquet for a hundred guests: "1,2 млн".
  if (amount >= 1000000) return t('{v} млн',{v:String(Math.round(amount / 100000) / 10).replace('.', ',')});
  return t('{v} тыс.',{v:String(Math.round(amount / 100) / 10).replace('.', ',')});
}
