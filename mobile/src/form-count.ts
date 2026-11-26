// What the guest's form says while it is being filled (concept of 2026-11-26, Airbnb «Show 307 places»): how many
// places the conditions find, how many of them are of each class, and what places usually cost here.
// One answer of /api/public/matching without the class counts every class; the class is then applied here, the same
// simple filter as lib/smart-matching.ts rankMatches. Nothing about the search changes. Covered by mobile/tests/form-count.test.mjs.
import { allKinds, categoryOf, draftUnits, type GuestDraft } from './ai-request';

type Row = Record<string, any>;
export type FormCount = {
  total: number; // what «Показать» will find
  more: boolean; // the answer stopped at its limit: «60+»
  classes: Record<string, number>; // places of each class among those found without the class
  low: number | null; // what a place usually costs per day (per hour, per guest): the middle half of the prices
  high: number | null;
};

/** The conditions the count asks for: every one but the class, so that one answer counts every class. */
export const countDraft = (draft: GuestDraft): GuestDraft => ({ ...draft, classes: [] });

const round = (v: number) => (v >= 5000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100);
const quartile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

/** The count of an answer found for countDraft(draft); limit is the answer's own (lib/smart-matching.ts previewMatches). */
export function formCount(draft: GuestDraft, properties: Row[], limit = 60): FormCount {
  const classes: Record<string, number> = {};
  for (const p of properties) if (p.stay_class) classes[p.stay_class] = (classes[p.stay_class] || 0) + 1;
  const asked = draft.classes || [];
  const total = asked.length ? properties.filter(p => asked.includes(p.stay_class)).length : properties.length;
  // The price of one day (hour, guest) of the places found; a budget already cuts the list, so it says nothing then.
  const per = categoryOf(draft) === 'banquet' ? Math.max(1, draft.guests) : Math.max(1, draftUnits(draft));
  const prices = draft.maxPrice ? [] : properties.map(p => Number(p.estimate?.amount) / per).filter(v => v > 0).sort((a, b) => a - b);
  const enough = prices.length >= 5;
  return { total, more: properties.length >= limit, classes, low: enough ? round(quartile(prices, 0.25)) : null, high: enough ? round(quartile(prices, 0.75)) : null };
}

/** «Сбросить»: what the guest chose is taken off; the day, the guests, the city and the category stay. */
export function resetDraft(draft: GuestDraft): GuestDraft {
  const category = categoryOf(draft);
  return { ...draft, district: '', near: null, maxPrice: '', perUnit: true, priority: 'balanced', features: [], kinds: allKinds(category), rooms: '', classes: [], maxFloor: 0 };
}
/** Whether «Сбросить» has anything to take off. */
export function hasChoices(draft: GuestDraft) {
  const clean = resetDraft(draft);
  return draft.district.trim() !== '' || !!draft.near || !!draft.maxPrice || draft.priority !== 'balanced' || draft.features.length > 0
    || draft.kinds.length !== clean.kinds.length || !!draft.rooms || !!draft.classes?.length || !!draft.maxFloor;
}
