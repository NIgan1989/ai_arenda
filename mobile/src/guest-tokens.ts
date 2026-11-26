import {L,t as tr} from '../../lib/i18n';
// The guest's conditions as tokens under the AI line: one token per condition, in one order on every screen.
// What the guest set (in words, by a chip or in the form) is a token that can be taken off; the day, the guests
// and the city are always there and open their part of the form. Nothing is decided here: each token only says
// what the draft holds and what the draft is without it. Covered by mobile/tests/guest-tokens.test.mjs.
import { banquetWhen, plural, stayWhen, CHECKIN_TIME } from '../../lib/map-search-request';
import { BANQUET_WISHES, BATH_WISHES, WISHES, allKinds, budgetWords, categoryOf, classWords, homeWords, occasionTitle, wishesOf, type GuestDraft } from './ai-request';

// The parts of the form a token opens.
export type Section = 'when' | 'guests' | 'price' | 'where' | 'home' | 'wishes' | 'priority';
export type GuestToken = {
  id: string;
  title: string;
  section: Section;
  // What the draft becomes when the token is taken off; absent for what a search always has.
  clear?: Partial<GuestDraft>;
};

const cap = (text: string) => (text ? text[0].toLocaleUpperCase('ru') + text.slice(1) : text);
const PRIORITY: Record<string, string> = L({ balanced: 'Баланс', cheaper: 'Дешевле', closer: 'Ближе' });

/** "Сегодня 19:00–22:00", "18–19 ноября", "18–19 ноября, с 19:30", "18–19 ноября, ночь с 22:00", "Завтра, вечер 18:00–00:00". */
export function whenWords(draft: GuestDraft, now = Date.now()) {
  if (categoryOf(draft) === 'banquet') return cap(banquetWhen(draft.start, now));
  const days = stayWhen(draft.start, draft.end, draft.mode, now), from = draft.start.slice(11);
  if (draft.mode === 'hourly') return cap(days);
  if (draft.mode === 'night') return tr('{days}, ночь с {from}',{days:cap(days),from});
  return cap(days) + (draft.now || from !== CHECKIN_TIME ? ', ' + tr('с {from}',{from}) : '');
}
export const guestsWords = (draft: Pick<GuestDraft, 'guests'>) => draft.guests + ' ' + plural(draft.guests, 'гость', 'гостя', 'гостей');
const floorWords = (floor: number) => (floor === 1 ? tr('Первый этаж') : tr('Не выше {floor} этажа',{floor}));
const wishTitle = (id: string, draft: GuestDraft) => [...wishesOf(categoryOf(draft)), ...WISHES, ...BATH_WISHES, ...BANQUET_WISHES].find(([known]) => known === id)?.[1] || '';
const nearWords = (draft: GuestDraft) => (draft.near?.label ? tr('Рядом: {label}',{label:draft.near.label}) : draft.now ? tr('Рядом с вами') : tr('Рядом с точкой'));

/** Every condition the search will use, in the order the sheet shows them. */
export function guestTokens(draft: GuestDraft, now = Date.now()): GuestToken[] {
  const category = categoryOf(draft), venue = category !== 'stay', every = allKinds(category);
  const tokens: GuestToken[] = [];
  if (category === 'banquet' && occasionTitle(draft.occasion)) tokens.push({ id: 'occasion', title: occasionTitle(draft.occasion), section: 'when' });
  // The type: any home, or the whole of «Баня» or «Банкет», is not a condition.
  const typed = venue ? draft.kinds.length < every.length : draft.kinds.length > 0;
  if (typed || draft.rooms) tokens.push({ id: 'home', title: cap(homeWords(typed ? draft : { kinds: [], rooms: draft.rooms })), section: 'home', clear: { kinds: every, rooms: '' } });
  // The class of the home («Комфорт или Премиум»), only for «Жильё».
  if (!venue && draft.classes?.length) tokens.push({ id: 'class', title: classWords(draft.classes), section: 'home', clear: { classes: [] } });
  // «Сейчас» takes its point from the phone: taken off, the point goes with it.
  const mine = draft.now && !!draft.near && !draft.near.label;
  if (draft.now) tokens.push({ id: 'now', title: mine ? tr('Сейчас, рядом с вами') : tr('Готово сейчас'), section: 'when', clear: { now: false, ...(mine ? { near: null, priority: 'balanced' as const } : {}) } });
  tokens.push({ id: 'when', title: whenWords(draft, now), section: 'when' });
  tokens.push({ id: 'guests', title: guestsWords(draft), section: 'guests' });
  const budget = budgetWords(draft);
  if (budget) tokens.push({ id: 'price', title: budget, section: 'price', clear: { maxPrice: '', perUnit: true } });
  tokens.push({ id: 'city', title: draft.city, section: 'where' });
  if (draft.district.trim()) tokens.push({ id: 'district', title: draft.district.trim(), section: 'where', clear: { district: '' } });
  if (draft.near && !mine) tokens.push({ id: 'near', title: nearWords(draft), section: 'where', clear: { near: null, ...(draft.priority === 'closer' ? { priority: 'balanced' as const } : {}) } });
  for (const id of draft.features) {
    const title = wishTitle(id, draft);
    if (title) tokens.push({ id: 'f:' + id, title, section: 'wishes', clear: { features: draft.features.filter(v => v !== id) } });
  }
  if (draft.maxFloor) tokens.push({ id: 'floor', title: floorWords(draft.maxFloor), section: 'home', clear: { maxFloor: 0 } });
  // «Сейчас» is the nearest first by itself: «ближе» is not said twice.
  if (draft.priority !== 'balanced' && !draft.now) tokens.push({ id: 'priority', title: PRIORITY[draft.priority], section: 'priority', clear: { priority: 'balanced' } });
  return tokens;
}

/**
 * The tokens an empty answer blames (lib/smart-matching.ts emptyHint): the condition that leaves nothing free.
 * They are shown in red, so the guest sees what to take off.
 */
export function blamedTokens(empty: { reason?: string; blocker?: string } | null | undefined, tokens: GuestToken[]): string[] {
  const has = (id: string) => tokens.some(t => t.id === id);
  const one = (id: string) => (has(id) ? [id] : []);
  switch (empty?.reason) {
    case 'city': return one('city');
    case 'guests': return one('guests');
    case 'budget': return one('price');
    case 'now': return one('now');
    case 'hourly': case 'minHours': case 'prep': case 'busy': return one('when');
    case 'filters':
      if (empty.blocker === 'kinds' || empty.blocker === 'rooms') return one('home');
      if (empty.blocker === 'district') return one('district');
      if (empty.blocker === 'near') return one('near');
      if (empty.blocker === 'maxFloor') return one('floor');
      if (empty.blocker === 'features') return tokens.filter(t => t.id.startsWith('f:')).map(t => t.id);
      // No single condition is to blame: the answer says «без района, типа и пожеланий», so those are marked.
      return tokens.filter(t => t.id === 'home' || t.id === 'district' || t.id.startsWith('f:')).map(t => t.id);
    default: return [];
  }
}

/** What a part of the form holds, for its row in the list of all conditions. */
export function sectionWords(draft: GuestDraft, section: Section, now = Date.now()) {
  const category = categoryOf(draft), venue = category !== 'stay';
  if (section === 'when') return [category === 'banquet' ? occasionTitle(draft.occasion) : '', whenWords(draft, now)].filter(Boolean).join(' · ');
  if (section === 'guests') return guestsWords(draft);
  if (section === 'price') return cap(budgetWords(draft)) || tr('Любая');
  if (section === 'where') return [draft.city, draft.district.trim(), draft.near ? nearWords(draft) : ''].filter(Boolean).join(' · ');
  if (section === 'home') {
    const typed = venue ? draft.kinds.length < allKinds(category).length : draft.kinds.length > 0;
    return cap([homeWords(typed ? draft : { kinds: [], rooms: draft.rooms }), category === 'stay' ? classWords(draft.classes) : ''].filter(Boolean).join(', ')) || (category === 'bath' ? tr('Любая') : category === 'banquet' ? tr('Любой') : tr('Любое'));
  }
  if (section === 'wishes') return draft.features.map(id => wishTitle(id, draft)).filter(Boolean).join(', ') || tr('Не важно');
  return PRIORITY[draft.priority] || PRIORITY.balanced;
}
export const SECTION_TITLES = (draft: GuestDraft): [Section, string][] => {
  const category = categoryOf(draft);
  return [
    ['when', tr('Когда')],
    ['guests', tr('Гости')],
    ['price', category === 'banquet' ? tr('Цена на гостя') : tr('Цена')],
    ['where', tr('Где')],
    ['home', category === 'banquet' ? tr('Зал или кафе') : category === 'bath' ? tr('Баня или сауна') : tr('Тип, класс, комнаты')],
    ['wishes', category === 'stay' ? tr('Удобства и правила') : tr('Обязательно')],
    ['priority', tr('Что важнее')]
  ];
};
