// The "Сейчас" card: the single most important thing for this person right now.
// The rules are the site's own (lib/now-card.ts), so the app and the browser never say different things
// about the same booking. This file adds the owner's quick request, which only the app's map polls for,
// and says where a tap on the card leads. Covered by mobile/tests/now-card.test.mjs.
import { nowCard as sharedNowCard, nowCardWhen } from '../../lib/now-card';

type Row = Record<string, any>;
export type NowRole = 'guest' | 'owner' | 'cleaner';
export type NowTarget =
  | { type: 'process'; kind: 'booking' | 'job'; id: string }
  | { type: 'page'; id: string }
  | { type: 'sheet' };
export type NowCard = {
  key: string;
  title: string; // what is happening: "Ближайший заезд"
  detail: string; // one line, the time first: "Завтра в 14:00 · Студия у набережной"
  action: string;
  urgent: boolean;
  target: NowTarget;
};

// The pages each role has in the app; anything else opens the summary page.
const PAGES: Record<NowRole, string[]> = {
  guest: ['bookings', 'catalog', 'calendar', 'chats', 'account'],
  owner: ['properties', 'bookings', 'cleaning', 'calendar', 'chats', 'account'],
  cleaner: ['jobs', 'assignments', 'calendar', 'chats', 'account']
};

// "сегодня в 14:00", "завтра в 09:30", "12 ноября в 14:00": Kazakhstan time, the wording of the site.
export const when = nowCardWhen;
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The detail line reads "Выезд был сегодня в 05:05 · Студия у набережной". On the screen the time stays in one
// piece: a narrow card breaks the line after it, and only a very long flat name is cut, at its end.
export function unbrokenTime(detail: string) {
  const cut = detail.indexOf(' · ');
  return cut < 0 ? detail : detail.slice(0, cut).replace(/ /g, '\u00a0') + '\u00a0· ' + detail.slice(cut + 3);
}

// A quick request has a two-minute answer window, so it goes before everything else.
function quickRequest(offers: Row[], now: number): NowCard | null {
  const offer = offers.filter(o => o.expires_at > now).sort((a, b) => a.expires_at - b.expires_at)[0];
  if (!offer) return null;
  const start = Date.parse(offer.filters?.start) / 1000;
  const time = Number.isFinite(start) ? sentence('заезд ' + nowCardWhen(start, now)) + ' · ' : '';
  return {
    key: 'offer:' + offer.id,
    title: 'Гость ждёт ответа',
    detail: time + offer.title,
    action: 'Ответить',
    urgent: true,
    target: { type: 'sheet' }
  };
}

// now is in seconds. Returns null when there is nothing real to show: the screen then shows no card at all.
export function nowCard(role: NowRole, data: Row, now: number, extra: { quickOffers?: Row[] } = {}): NowCard | null {
  if (!data?.user?.id) return null;
  if (role === 'owner') {
    const quick = quickRequest(extra.quickOffers || [], now);
    if (quick) return quick;
  }
  const card = sharedNowCard(role, data, now);
  if (!card) return null;
  const section = String(card.href || '').split('/').pop() || '';
  const target: NowTarget =
    card.entityId && (card.entityKind === 'booking' || card.entityKind === 'job')
      ? { type: 'process', kind: card.entityKind, id: card.entityId }
      : { type: 'page', id: PAGES[role].includes(section) ? section : 'overview' };
  return {
    key: card.kind + ':' + (card.entityId || section) + ':' + card.title,
    title: card.title,
    detail: card.detail,
    action: card.actionLabel,
    urgent: !!card.urgent,
    target
  };
}
