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

export function placeNow(propertyId: string, bookings: Row[], now = Date.now() / 1000): PlaceNow {
  const mine = bookings.filter(b => b.property_id === propertyId && ['requested', 'confirmed'].includes(String(b.status)) && Number(b.end) > now);
  const requests = mine.filter(b => b.status === 'requested').length;
  const inside = mine.find(b => b.status === 'confirmed' && Number(b.start) <= now);
  if (inside) return { line: 'Гости до ' + when(Number(inside.end), now), busy: true, requests };
  const next = mine.filter(b => b.status === 'confirmed').sort((a, b) => Number(a.start) - Number(b.start))[0];
  if (next) return { line: 'Заезд ' + when(Number(next.start), now), busy: false, requests };
  return { line: 'Свободно, броней впереди нет', busy: false, requests };
}
