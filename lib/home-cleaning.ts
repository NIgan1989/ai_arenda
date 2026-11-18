// Уборка на дом (с 2026-11-18): человек, который ничего не сдаёт, заказывает уборку своего дома.
// Заказ — обычное задание на уборку (cleaning_jobs) на частном объекте типа «home»: он не публикуется
// и гостям не виден. Здесь только слова и расчёт, без зависимостей: файл читают сервер и приложение.
export const HOME_TYPE = 'home';
export const isHome = (type?: string | null) => type === HOME_TYPE;

export type HomeKind = 'regular' | 'general' | 'renovation';
// Цену заказчик ставит сам (решение 2026-11-18), сервис только советует. Основа совета, тенге: поддерживающая
// уборка одной комнаты и доплата за каждую следующую; генеральная и уборка после ремонта идут множителем.
// Когда в городе накопились заказы, совет подстраивается под то, за сколько исполнители их на деле берут.
export const HOME_MIN_FEE = 1000, HOME_FEE_STEP = 500, HOME_MARKET_DEALS = 5;
export const HOME_BASE = 6000, HOME_ROOM = 2000, HOME_WINDOW = 1000, HOME_MAX_ROOMS = 6, HOME_MAX_WINDOWS = 20;
export const homeKinds: Record<HomeKind, { label: string; hint: string; times: number }> = {
  regular: { label: 'Поддерживающая', hint: 'Пыль, полы, кухня, санузел', times: 1 },
  general: { label: 'Генеральная', hint: 'Всё, включая шкафы, технику и труднодоступные места', times: 2 },
  renovation: { label: 'После ремонта', hint: 'Строительная пыль, следы краски и клея', times: 2.5 },
};
export const homeKind = (kind: unknown): HomeKind => kind === 'general' || kind === 'renovation' ? kind : 'regular';
const whole = (value: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(value)) || min));
export const homeRooms = (rooms: unknown) => whole(rooms, 1, HOME_MAX_ROOMS);
export const homeWindows = (windows: unknown) => whole(windows, 0, HOME_MAX_WINDOWS);

export type HomeOrder = { kind?: unknown; rooms?: unknown; windows?: unknown };
// Основа совета по цене: сколько такая уборка стоит по нашей сетке.
export function homePrice(o: HomeOrder) {
  const k = homeKinds[homeKind(o.kind)];
  return Math.round((HOME_BASE + HOME_ROOM * (homeRooms(o.rooms) - 1)) * k.times / 500) * 500 + HOME_WINDOW * homeWindows(o.windows);
}
// Совет по цене. deals — суммы недавних заказов города, которые исполнители взяли, вместе с их условиями:
// медиана отношения «заплатили / сетка» поправляет сетку. Пока заказов мало, совет равен сетке.
export type HomeDeal = HomeOrder & { fee: number };
export function homeAdvice(o: HomeOrder, deals: HomeDeal[] = []) {
  const base = homePrice(o), ratios = deals.map(d => Number(d.fee) / homePrice(d)).filter(r => r > 0.3 && r < 3).sort((a, b) => a - b);
  if (ratios.length < HOME_MARKET_DEALS) return { fee: base, market: false, deals: ratios.length };
  const mid = ratios.length >> 1, median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { fee: Math.max(HOME_MIN_FEE, Math.round(base * median / HOME_FEE_STEP) * HOME_FEE_STEP), market: true, deals: ratios.length };
}
// Условия заказа из строки задания (её пишет homeDescription): по ним считается рынок.
export function homeOrderOf(description: unknown): HomeOrder | null {
  const m = /^Уборка на дом: ([а-яё ]+?), (\d+) комнат[аы]?(?:, мойка окон: (\d+))?/i.exec(String(description || ''));
  if (!m) return null;
  const kind = (Object.keys(homeKinds) as HomeKind[]).find(k => homeKinds[k].label.toLowerCase() === m[1].toLowerCase());
  return kind ? { kind, rooms: Number(m[2]), windows: Number(m[3] || 0) } : null;
}
// Сколько времени закладываем на работу, минут: от него считается окончание задания.
export function homeMinutes(o: HomeOrder) {
  const k = homeKinds[homeKind(o.kind)];
  return Math.min(720, Math.round((90 + 30 * (homeRooms(o.rooms) - 1)) * k.times / 30) * 30 + 15 * homeWindows(o.windows));
}
export const roomsLabel = (rooms: unknown) => { const n = homeRooms(rooms); return n + (n === 1 ? ' комната' : n < 5 ? ' комнаты' : ' комнат'); };
export const windowsLabel = (windows: unknown) => { const n = homeWindows(windows); return n + (n === 1 ? ' окно' : n > 1 && n < 5 ? ' окна' : ' окон'); };
// Название частного объекта: его видят заказчик и исполнитель, адреса в нём нет.
export const homeTitle = (rooms: unknown) => 'Дом · ' + roomsLabel(rooms);
// Средства и инвентарь приносит исполнитель (решение 2026-11-18).
export const HOME_SUPPLIES = 'Средства и инвентарь свои.';
// Условия задания одной строкой: их читает исполнитель до отклика.
export function homeDescription(o: HomeOrder & { wishes?: unknown }) {
  const windows = homeWindows(o.windows), wishes = String(o.wishes || '').trim();
  return ['Уборка на дом: ' + homeKinds[homeKind(o.kind)].label.toLowerCase(), roomsLabel(o.rooms), ...(windows ? ['мойка окон: ' + windowsLabel(windows)] : [])].join(', ') + '. ' + HOME_SUPPLIES + (wishes ? ' Пожелания: ' + wishes : '');
}
