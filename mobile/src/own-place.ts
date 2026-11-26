import {dateText,t} from '../../lib/i18n';
// One line on what is happening with an owner's object now, for its short card in «Моё жильё» (OwnProperties.tsx):
// guests inside, the next arrival, or free. Bookings that are cancelled, rejected, expired or over are ignored.
// Covered by mobile/tests/own-place.test.mjs.
type Row = Record<string, unknown>;

const part = (v: number, options: Intl.DateTimeFormatOptions) =>
  dateText(v * 1000,{ timeZone: 'Asia/Almaty', ...options });
const day = (v: number) => part(v, { day: 'numeric', month: 'long' });
const time = (v: number) => part(v, { hour: '2-digit', minute: '2-digit' });
// «сегодня 14:00», «завтра 12:00» or «18 ноября, 14:00», in Kazakhstan time.
export function when(v: number, now: number) {
  if (day(v) === day(now)) return t('сегодня {time}',{time:time(v)});
  if (day(v) === day(now + 86400)) return t('завтра {time}',{time:time(v)});
  return day(v) + ', ' + time(v);
}

export type PlaceNow = { line: string; busy: boolean; requests: number };

// Guests are inside from the actual check-in to the actual checkout (terms.actual_checkin/actual_checkout, as in
// lib/process-threads.ts), so a guest staying past the planned end still occupies the object.
export function placeNow(propertyId: string, bookings: Row[], now = Date.now() / 1000, bath = false): PlaceNow {
  const terms = (b: Row) => (b.terms || {}) as Row;
  const own = bookings.filter(b => b.property_id === propertyId);
  const requests = own.filter(b => b.status === 'requested' && Number(b.end) > now).length;
  const confirmed = own.filter(b => b.status === 'confirmed' && !terms(b).actual_checkout);
  const inside = confirmed.find(b => terms(b).actual_checkin);
  if (inside) {
    const end = Number(inside.end);
    return { line: t(end > now ? 'Гости до {when}' : bath ? 'Гости ещё не ушли, время вышло {when}' : 'Гости ещё не выехали, выезд был {when}', { when: when(end, now) }), busy: true, requests };
  }
  const next = confirmed.filter(b => Number(b.end) > now).sort((a, b) => Number(a.start) - Number(b.start))[0];
  if (next) return { line: t(Number(next.start) <= now ? (bath ? 'Ждём гостей, бронь {when}' : 'Ждём гостя, заезд {when}') : bath ? 'Гости {when}' : 'Заезд {when}', { when: when(Number(next.start), now) }), busy: false, requests };
  return { line: t('Свободно, броней впереди нет'), busy: false, requests };
}

// Taken now, for the owner's top plate «{a} из {b} заняты» (MapHome.tsx): guests inside, or a confirmed stay whose time
// has come, as the map's «Гость до …» says. An arrival later, a request or «Готово к заезду» is not a guest.
export function takenNow(propertyId: string, bookings: Row[], now = Date.now() / 1000) {
  return bookings.some(b => {
    const terms = (b.terms || {}) as Row;
    return b.property_id === propertyId && b.status === 'confirmed' && !terms.actual_checkout && (!!terms.actual_checkin || (Number(b.start) <= now && now < Number(b.end)));
  });
}
