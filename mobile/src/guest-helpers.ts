import {t} from '../../lib/i18n';
import { WISHES, BANQUET_WISHES, askFirst, categoryOf, type GuestDraft } from './ai-request';
import { money, type Row } from './model';

// «Помогайки»: short phrases under the guest's conditions that narrow what was found, one tap each, with the
// number of places left. They are counted on the phone from the answer of the search the guest already has,
// so nothing is searched again and the numbers are exact. A step can always be taken back.

export type Helper = {
  id: string;
  title: string;
  // How many of the places on screen stay after the tap.
  count: number;
  // Put first and filled: the guest's own swipes asked for it.
  hot?: boolean;
  // Tried and taken back: shown faded at the end, not offered again.
  off?: boolean;
};
export type Point = { longitude: number; latitude: number };
export type HelperContext = {
  draft: GuestDraft;
  // Where the guest is, when the phone knows: «Ближе» counts from here.
  from?: Point | null;
  // Steps the guest took back.
  tried?: string[];
  // Dear cards the guest swiped past quickly.
  pricey?: number;
  // Steps already taken: the same phrase is not offered on top of itself.
  taken?: string[];
};

const MAX = 4;
// The owner's rules are matched on the server (lib/smart-matching.ts RULE_FEATURES): the phone does not repeat them.
const RULES = new Set(['pets', 'selfcheckin', 'nodeposit', 'smoking', 'parties']);
const amount = (flat: Row) => Number(flat.estimate?.amount) || 0;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
export function metres(a: Point, b: Point) {
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
const pointOf = (flat: Row): Point | null => (flat.location && Number.isFinite(Number(flat.location.longitude)) && Number.isFinite(Number(flat.location.latitude)) ? { longitude: Number(flat.location.longitude), latitude: Number(flat.location.latitude) } : null);
// The way to a place: what the search measured from the guest's chosen point, else from where the guest is.
const away = (flat: Row, from?: Point | null) => {
  if (typeof flat.match?.distance === 'number') return flat.match.distance as number;
  const at = pointOf(flat);
  return from && at ? metres(from, at) : null;
};
const wishes = (draft: GuestDraft) => (categoryOf(draft) === 'banquet' ? BANQUET_WISHES : WISHES).filter(([id]) => !RULES.has(id) && !draft.features.includes(id));

type Candidate = { id: string; title: string; hotTitle?: string; test: (flat: Row) => boolean };
// Everything that could be offered for this list. A threshold (the middle price, the middle distance) is of this
// very list, so the same step gives the same places whenever it is applied to it.
function candidates(flats: Row[], context: HelperContext): Candidate[] {
  const out: Candidate[] = [];
  const prices = flats.map(amount).filter(v => v > 0);
  if (prices.length === flats.length && context.draft.priority !== 'cheaper') {
    const middle = median(prices);
    if (prices.some(v => v > middle)) out.push({ id: 'cheaper', title: t('Дешевле'), hotTitle: t('До {v}', { v: money(middle) }), test: flat => amount(flat) <= middle });
  }
  const ways = flats.map(flat => away(flat, context.from));
  if (ways.every(v => v !== null) && context.draft.priority !== 'closer') {
    const middle = median(ways as number[]);
    if ((ways as number[]).some(v => v > middle)) out.push({ id: 'closer', title: t('Ближе'), test: flat => (away(flat, context.from) ?? Infinity) <= middle });
  }
  if (!context.draft.now) out.push({ id: 'instant', title: t('Сразу'), test: flat => !!flat.instant && !askFirst(flat) });
  for (const [id, name] of wishes(context.draft)) out.push({ id: 'f:' + id, title: name, test: flat => (flat.details?.amenities || []).includes(id) });
  return out;
}

/** The phrases to offer for these places: up to four that really narrow, the evenest split first. */
export function guestHelpers(flats: Row[], context: HelperContext): Helper[] {
  const n = flats.length, tried = context.tried || [];
  // One or two places are looked at, not narrowed.
  if (n < 3) return [];
  const most = Math.floor((n * 2) / 3);
  const counted = candidates(flats, context)
    .map(c => ({ ...c, count: flats.filter(c.test).length }))
    .filter(c => c.count >= 2 && c.count <= most);
  const taken = context.taken || [];
  const live = counted.filter(c => !tried.includes(c.id) && !taken.includes(c.id)).sort((a, b) => Math.abs(a.count - n / 2) - Math.abs(b.count - n / 2) || b.count - a.count || a.id.localeCompare(b.id));
  const hot = (context.pricey || 0) >= 3 ? live.find(c => c.id === 'cheaper') : undefined;
  let order = live.filter(c => c !== hot);
  // The price is not pushed first by default: owners are not set racing each other down.
  if (!hot && order.length > 1 && order[0].id === 'cheaper') order = [order[1], order[0], ...order.slice(2)];
  const shown: Helper[] = [...(hot ? [{ id: hot.id, title: hot.hotTitle || hot.title, count: hot.count, hot: true }] : []), ...order.map(c => ({ id: c.id, title: c.title, count: c.count }))].slice(0, MAX);
  const back = counted.filter(c => tried.includes(c.id)).slice(0, Math.max(0, MAX + 1 - shown.length)).map(c => ({ id: c.id, title: c.title, count: c.count, off: true }));
  return shown.length ? [...shown, ...back] : [];
}

/** The places left after these steps, taken one after another; a step that would leave nothing is passed over. */
export function narrowed(flats: Row[], steps: string[], context: HelperContext): Row[] {
  let list = flats;
  for (const id of steps) {
    const step = candidates(list, context).find(c => c.id === id);
    if (!step) continue;
    const next = list.filter(step.test);
    if (next.length) list = next;
  }
  return list;
}

/** The words of the steps taken, for the row that takes the last one back: «Ближе › Парковка». */
export function stepWords(steps: string[], draft: GuestDraft) {
  const names: Record<string, string> = { cheaper: t('Дешевле'), closer: t('Ближе'), instant: t('Сразу') };
  const wish = new Map([...WISHES, ...BANQUET_WISHES]);
  return steps.map(id => names[id] || wish.get(id.slice(2)) || '').filter(Boolean).join(' › ');
}

/**
 * Places the search rated the same take the earlier seat in turn, so one owner is not always shown before an equal
 * one. The best choice, the guest's favourites (already put first) and any different rating keep their order.
 */
export function rotateEquals(flats: Row[], seed: number, fixed: (flat: Row) => boolean = () => false): Row[] {
  const out: Row[] = [];
  const key = (flat: Row) => Math.round((Number(flat.match?.score) || 0) * 100) + ':' + Math.round((Number(flat.match?.chance) || 0));
  let i = 0;
  while (i < flats.length) {
    let j = i + 1;
    if (!flats[i].match?.best && !fixed(flats[i])) while (j < flats.length && !flats[j].match?.best && !fixed(flats[j]) && key(flats[j]) === key(flats[i])) j++;
    const run = flats.slice(i, j), turn = run.length > 1 ? Math.abs(Math.trunc(seed)) % run.length : 0;
    out.push(...run.slice(turn), ...run.slice(0, turn));
    i = j;
  }
  return out;
}

/** «7 вариантов от 11 000 ₸»: the whole answer in one line, for the sheet when it is down. */
export function foundLine(flats: Row[], plural: (n: number, one: string, few: string, many: string) => string) {
  if (!flats.length) return '';
  const least = Math.min(...flats.map(amount).filter(v => v > 0));
  return flats.length + ' ' + plural(flats.length, 'вариант', 'варианта', 'вариантов') + (Number.isFinite(least) ? ' ' + t('от {price}',{price:money(least)}) : '');
}
