// Уборка на дом (с 2026-11-18): человек, который ничего не сдаёт, заказывает уборку своего дома.
// Заказ — обычное задание на уборку (cleaning_jobs) на частном объекте типа «home»: он не публикуется
// и гостям не виден. Здесь только слова и расчёт, без зависимостей: файл читают сервер и приложение.
export const HOME_TYPE = 'home';
export const isHome = (type?: string | null) => type === HOME_TYPE;

export type HomeKind = 'regular' | 'general' | 'renovation';
// Цена поддерживающей уборки одной комнаты и доплата за каждую следующую, тенге. Генеральная и уборка
// после ремонта считаются множителем. Цифры стартовые: их задаёт оператор сервиса перед запуском.
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
// Сколько стоит заказ. Сумму ниже этой заказчик поставить не может, выше может.
export function homePrice(o: HomeOrder) {
  const k = homeKinds[homeKind(o.kind)];
  return Math.round((HOME_BASE + HOME_ROOM * (homeRooms(o.rooms) - 1)) * k.times / 500) * 500 + HOME_WINDOW * homeWindows(o.windows);
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
// Условия задания одной строкой: их читает исполнитель до отклика.
export function homeDescription(o: HomeOrder & { wishes?: unknown }) {
  const windows = homeWindows(o.windows), wishes = String(o.wishes || '').trim();
  return ['Уборка на дом: ' + homeKinds[homeKind(o.kind)].label.toLowerCase(), roomsLabel(o.rooms), ...(windows ? ['мойка окон: ' + windowsLabel(windows)] : [])].join(', ') + '.' + (wishes ? ' Пожелания: ' + wishes : '');
}
