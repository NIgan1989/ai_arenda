import {amenities,kindLabel} from './listings';
type Row = Record<string, any>;

// The place to clean, as the cleaner sees it before and after the assignment: photos, the kind of housing, the area
// of the city, its size and what there is to clean. The exact address stays hidden until the owner assigns the cleaner.
// The site (components/job-place.tsx) and the app (mobile/src/JobPlace.tsx) draw the same facts.

export type PlaceFact = { id: 'rooms' | 'area' | 'beds' | 'bath'; value: string; label: string };
export type JobPlaceView = {
  photos: string[];
  kind: string;
  where: string;
  /** «2 этаж из 9»: said next to the area of the city, so the size tiles stay in one row. */
  floor: string;
  /** Short line for a list row or the map: «Квартира · 1 комната · 45 м²». */
  summary: string;
  facts: PlaceFact[];
  /** Things on site that matter for cleaning: washer, iron, linen… */
  kit: string[];
  /** What to clean, one item a line. */
  tasks: string[];
  /** Expected time of the cleaning set by the owner, in minutes; 0 when unknown. */
  minutes: number;
  /** The address is known: the cleaner is assigned (or it is the owner). */
  exact: boolean;
};

const parse = <T,>(value: unknown, fallback: T): T => {
  if (value && typeof value === 'object') return value as T;
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T ?? fallback; } catch { return fallback; }
};

export function plural(n: number, [one, few, many]: [string, string, string]) {
  const tens = n % 100, units = n % 10;
  return tens >= 11 && tens <= 14 ? many : units === 1 ? one : units >= 2 && units <= 4 ? few : many;
}

const KIT = ['washer', 'iron', 'linen', 'towels', 'kitchen', 'elevator'];

// «Сменить бельё, помыть ванную и кухню, вынести мусор» → three lines. Text that does not split cleanly stays whole.
export function cleaningTasks(text: unknown): string[] {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return [];
  const parts = value.split(/\s*(?:\n|;|•|•|,\s+(?=[а-яёa-z])|\.\s+(?=[А-ЯЁA-Z]))\s*/u)
    .map(part => part.replace(/^[-–—*\d.)\s]+/u, '').replace(/[.;,\s]+$/u, '').trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 10 || parts.some(part => part.length < 3)) return [value];
  return parts.map(part => part[0].toLocaleUpperCase('ru') + part.slice(1));
}

export function cleaningTime(minutes: number) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return '≈ ' + (h ? h + ' ч' : '') + (h && m ? ' ' : '') + (m ? m + ' мин' : '');
}

export function jobPlace(job: Row | null | undefined): JobPlaceView {
  const j = job || {}, d = parse<Row>(j.property_details, {}) || {};
  const photos = parse<unknown[]>(j.property_photos, []).filter((id): id is string => typeof id === 'string' && !!id);
  const rooms = Number(j.rooms) || 0, area = Number(d.area) || 0, beds = Number(d.beds) || 0, bath = Number(d.bathrooms) || 0;
  const floor = Number(d.floor), floors = Number(d.floors) || 0;
  const facts: PlaceFact[] = [];
  if (rooms && d.type !== 'room') facts.push({ id: 'rooms', value: String(rooms), label: plural(rooms, ['комната', 'комнаты', 'комнат']) });
  if (area) facts.push({ id: 'area', value: area + ' м²', label: 'площадь' });
  if (beds) facts.push({ id: 'beds', value: String(beds), label: plural(beds, ['спальное место', 'спальных места', 'спальных мест']) });
  if (bath) facts.push({ id: 'bath', value: String(bath), label: plural(bath, ['санузел', 'санузла', 'санузлов']) });
  const hasFloor = Number.isFinite(floor) && d.floor !== undefined && d.floor !== null && d.type !== 'house';
  const kind = kindLabel(d.type);
  const size = [rooms && d.type !== 'room' ? rooms + ' ' + plural(rooms, ['комната', 'комнаты', 'комнат']) : '', area ? area + ' м²' : ''].filter(Boolean);
  const list: string[] = Array.isArray(d.amenities) ? d.amenities : [];
  return {
    photos,
    kind,
    where: [j.city, j.district].filter(Boolean).join(', '),
    floor: !hasFloor ? '' : floor === 0 ? 'цокольный этаж' : floor + ' этаж' + (floors ? ' из ' + floors : ''),
    summary: [kind, ...size].join(' · '),
    facts,
    kit: KIT.filter(key => list.includes(key)).map(key => amenities[key]),
    tasks: cleaningTasks(j.description),
    minutes: Number(j.cleaning_minutes) || 0,
    exact: !!j.address,
  };
}
