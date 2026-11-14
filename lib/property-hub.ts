import type { CalendarEntry } from './calendar-days';

const DAY = 86400, SHIFT = 5 * 3600;
const dayStart = (t: number) => Math.floor((t + SHIFT) / DAY) * DAY - SHIFT;

export type HubTab = 'today' | 'calendar' | 'price' | 'settings';
export const HUB_TABS: [HubTab, string][] = [['today', 'Сегодня'], ['calendar', 'Календарь'], ['price', 'Цена'], ['settings', 'Настройки']];

// The «Сегодня» tab of a flat: requests and cleaners' responses the owner has not answered (whatever their dates), what occupies the flat
// today, and the few entries that come next. A request is listed once, among those that wait.
export function hubToday(entries: CalendarEntry[], now: number, ahead = 3) {
  const today = dayStart(now);
  const waiting = entries.filter(e => e.tone === 'request' || e.waiting);
  const rest = entries.filter(e => e.tone !== 'request' && !e.waiting);
  return {
    waiting,
    today: rest.filter(e => e.start < today + DAY && e.end > today && !(e.tone === 'done' && e.end <= now)),
    next: rest.filter(e => e.start >= today + DAY).slice(0, ahead),
  };
}

// One line under the name of the flat while its card is folded: the most pressing thing about it.
export function hubLine(entries: CalendarEntry[], now: number) {
  const view = hubToday(entries, now);
  if (view.waiting.length === 1) return view.waiting[0].kind === 'job' ? 'Уборка: ' + view.waiting[0].status.toLocaleLowerCase('ru') : 'Заявка ждёт ответа';
  if (view.waiting.length) return 'Ждут ответа: ' + view.waiting.length;
  const late = hubLate(entries, now);
  if (late) return late.status;
  if (view.today.length) return view.today[0].status + (view.today.length > 1 ? ' · ещё ' + (view.today.length - 1) : '');
  return view.next.length ? 'Сегодня свободно' : 'Броней и уборок нет';
}

// What went wrong today (a cleaning past its time, a departure nobody confirmed), when nothing waits for an answer:
// its line under the flat's name is red and opens it, so the way out is one tap from the map.
export function hubLate(entries: CalendarEntry[], now: number) {
  const view = hubToday(entries, now);
  return view.waiting.length ? undefined : view.today.find(e => e.tone === 'late');
}
