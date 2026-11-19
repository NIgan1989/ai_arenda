import type { GuestDraft } from './ai-request';

// «Готово к 18:00»: the guest moves the arrival along the strip under the map, and each pin says what that home will be
// at that time. The answer of the search carries the steps of the strip and, for every home, a code per step
// (lib/arrival-ready.ts): r ready, c free but the cleaning is not confirmed, - not free at that arrival.
export type Arrival = { steps: number[]; at: number };
export type HomeAt = { state: 'ready' | 'check' | 'later' | 'busy'; from?: number };
type Coded = { arrival?: unknown };

// Kazakhstan time, as everything the guest reads.
export const clock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' });

export function arrivalOf(preview: { arrival?: unknown } | null | undefined): Arrival | null {
  const a = preview?.arrival as Arrival | undefined;
  return a && Array.isArray(a.steps) && a.steps.length > 1 && typeof a.at === 'number' ? a : null;
}
// What a home is at the arrival `at`: ready, free but not confirmed, free from a later step, or not free at all.
export function homeAt(home: Coded, arrival: Arrival, at: number): HomeAt {
  const codes = typeof home.arrival === 'string' ? home.arrival : '',
    i = arrival.steps.indexOf(at);
  if (codes.length !== arrival.steps.length || i < 0) return { state: 'ready' };
  if (codes[i] === 'r') return { state: 'ready' };
  if (codes[i] === 'c') return { state: 'check' };
  const next = arrival.steps.findIndex((t, k) => k > i && codes[k] !== '-');
  return next < 0 ? { state: 'busy' } : { state: 'later', from: arrival.steps[next] };
}
// The words on the pin. A home ready at the chosen arrival shows its price (''): moving the arrival to 19:00 turns
// «После 19:00» into a price, so the guest sees which homes the move opened and can take one at once.
export function pinWords(home: HomeAt) {
  return home.state === 'ready' ? '' : home.state === 'check' ? 'Уточняем' : home.state === 'later' ? 'После ' + clock(home.from!) : 'Занято';
}
// The line in the card: the same, with the reason.
export function cardWords(home: HomeAt, at: number) {
  return home.state === 'ready'
    ? 'Готово к ' + clock(at)
    : home.state === 'check'
      ? 'Уточняем готовность: уборку после прошлых гостей ещё никто не подтвердил'
      : home.state === 'later'
        ? 'Доступно с ' + clock(home.from!)
        : 'В это время занято';
}
// How many homes can be taken at each step: the number under each time of the strip.
export function countsAt(homes: Coded[], arrival: Arrival) {
  return arrival.steps.map((_, i) => homes.filter(h => typeof h.arrival === 'string' && h.arrival.length === arrival.steps.length && h.arrival[i] !== '-').length);
}
// The same stay, moved to start at `at`: its length stays.
export function shiftDraft(draft: GuestDraft, at: number): GuestDraft {
  const start = Date.parse(draft.start + ':00+05:00') / 1000,
    end = Date.parse(draft.end + ':00+05:00') / 1000,
    local = (s: number) => new Date((s + 5 * 3600) * 1000).toISOString().slice(0, 16);
  return { ...draft, start: local(at), end: local(at + end - start), now: false };
}
