// One line on what is happening with an owner's object now, for its short card in «Моё жильё» (OwnProperties.tsx):
// guests inside, the next arrival, or free. Bookings that are cancelled, rejected, expired or over are ignored.
// Covered by mobile/tests/own-place.test.mjs.
type Row = Record<string, unknown>;

const part = (v: number, options: Intl.DateTimeFormatOptions) =>
  new Date(v * 1000).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', ...options });
const day = (v: number) => part(v, { day: 'numeric', month: 'long' });
const time = (v: number) => part(v, { hour: '2-digit', minute: '2-digit' });
// «сегодня 14:00», «завтра 12:00» or «18 ноября, 14:00», in Kazakhstan time.
export function when(v: number, now: number) {
  if (day(v) === day(now)) return 'сегодня ' + time(v);
  if (day(v) === day(now + 86400)) return 'завтра ' + time(v);
  return day(v) + ', ' + time(v);
}

export type PlaceNow = { line: string; busy: boolean; requests: number };

// Guests are inside from the actual check-in to the actual checkout (terms.actual_checkin/actual_checkout, as in
// lib/process-threads.ts), so a guest staying past the planned end still occupies the object.
export function placeNow(propertyId: string, bookings: Row[], now = Date.now() / 1000): PlaceNow {
  const terms = (b: Row) => (b.terms || {}) as Row;
  const own = bookings.filter(b => b.property_id === propertyId);
  const requests = own.filter(b => b.status === 'requested' && Number(b.end) > now).length;
  const confirmed = own.filter(b => b.status === 'confirmed' && !terms(b).actual_checkout);
  const inside = confirmed.find(b => terms(b).actual_checkin);
  if (inside) {
    const end = Number(inside.end);
    return { line: end > now ? 'Гости до ' + when(end, now) : 'Гости ещё не выехали, выезд был ' + when(end, now), busy: true, requests };
  }
  const next = confirmed.filter(b => Number(b.end) > now).sort((a, b) => Number(a.start) - Number(b.start))[0];
  if (next) return { line: (Number(next.start) <= now ? 'Ждём гостя, заезд ' : 'Заезд ') + when(Number(next.start), now), busy: false, requests };
  return { line: 'Свободно, броней впереди нет', busy: false, requests };
}
