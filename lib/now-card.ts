import type { Role } from './domain';
import type { OperationEvent } from './operations';

type Row = Record<string, any>;

export type NowCardKind =
  | 'request' | 'checkin' | 'checkout' | 'stay'
  | 'job' | 'application' | 'attention' | 'administrator';

// The one thing a person should see on the first screen right now.
export type NowCard = {
  kind: NowCardKind;
  title: string;
  detail: string;
  at: number;
  actionLabel: string;
  href?: string;
  entityId?: string;
  entityKind?: 'booking' | 'job' | 'property';
  urgent?: boolean;
  event?: OperationEvent;
};

const zone = 'Asia/Almaty';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'long' });
const day = (seconds: number) => dayFormat.format(new Date(seconds * 1000));

// "сегодня в 14:00", "завтра в 09:30", "12 ноября в 14:00" in Kazakhstan time.
export function nowCardWhen(at: number, now: number) {
  const date = new Date(at * 1000), time = timeFormat.format(date), key = day(at);
  if (key === day(now)) return 'сегодня в ' + time;
  if (key === day(now + 86400)) return 'завтра в ' + time;
  if (key === day(now - 86400)) return 'вчера в ' + time;
  return dateFormat.format(date) + ' в ' + time;
}

// The time goes first: a long flat name may be cut on a narrow screen, the time may not.
const line = (time: string, name: string) => time.charAt(0).toUpperCase() + time.slice(1) + ' · ' + name;

// The card names the state of things, not a task: what lib/operations.ts calls "Проверить фактический выезд"
// is "Выезд не подтверждён" here. before: what the time in the detail line is the time of.
const STATES: Record<string, { title: string; before?: string }> = {
  'Подтвердить заявку': { title: 'Заявка ждёт ответа', before: 'ответить до ' },
  'Проверить фактический выезд': { title: 'Выезд не подтверждён' },
  'Проверить поступление оплаты': { title: 'Оплата не подтверждена', before: 'заезд ' },
  'Проверить отчёт об уборке': { title: 'Отчёт ждёт проверки', before: 'срок был ' },
  'Найти исполнителя': { title: 'Уборка без исполнителя' },
};

const byAt = (a: Row, b: Row) => a.at - b.at;
const section = (role: Role, kind: string) =>
  kind === 'job' ? (role === 'owner' ? 'cleaning' : 'assignments') : kind === 'property' ? 'properties' : 'bookings';

// The owner's open cleanings that cleaners have answered, the soonest first, with the number of responses waiting.
// The «Заявки» page, the card «Сейчас» and the «Сегодня» tab of a flat use the same list.
export function ownerResponses(data: Row | null | undefined, userId: string, now: number): { job: Row; count: number; applications: Row[] }[] {
  const pending: Row[] = (data?.applications || []).filter((a: Row) => a.status === 'pending');
  return (data?.jobs || [])
    .filter((j: Row) => j.owner_id === userId && j.status === 'open' && j.end > now)
    .map((job: Row) => { const applications = pending.filter(a => a.job_id === job.id); return { job, count: applications.length, applications }; })
    .filter((r: { count: number }) => r.count > 0)
    .sort((a: { job: Row }, b: { job: Row }) => a.job.start - b.job.start);
}

// The owner's autopilot (auto_assign of the flat, lib/administrator-runtime.ts) takes a response by itself: it proposes the
// first who applied and assigns him 30 minutes after the proposal, or at once when the cleaning starts within the hour.
// Said under the response so the owner knows what happens if he does nothing.
export function autopilotPick(data: Row | null | undefined, job: Row, applications: Row[], now: number): string {
  const flat = (data?.ownProperties || []).find((p: Row) => p.id === job.property_id), policy = flat?.policy || {};
  if (!Number(policy.auto_assign) || Number(job.fee) > Number(policy.cleaning_budget || 0)) return '';
  const first = [...applications].sort((a, b) => a.created_at - b.created_at || String(a.id).localeCompare(String(b.id)))[0];
  if (!first) return '';
  const name = first.worker?.name || first.name || 'первый откликнувшийся';
  if (job.start <= now + 3600) return 'Если не выберете сами, автопилот в ближайшие минуты назначит: ' + name;
  const asked = (data?.notifications || []).find((n: Row) => n.dedupe === 'owner:administrator-propose:' + first.id);
  const at = asked ? asked.created_at + 900 : 0;
  return 'Если не выберете сами, автопилот ' + (at > now ? 'в ' + timeFormat.format(new Date(at * 1000)) : 'через 15 минут') + ' назначит: ' + name;
}

// What waits for the owner on «Заявки»: guests' requests not answered yet and cleaners' responses. The chip says the number.
export function ownerWaiting(data: Row | null | undefined, userId: string, now: number) {
  const requests = (data?.bookings || []).filter((b: Row) => b.owner_id === userId && b.status === 'requested' && b.expires_at > now).length;
  return requests + ownerResponses(data, userId, now).reduce((n, r) => n + r.count, 0);
}

export function nowCard(role: Role, data: Row | null | undefined, nowSeconds: number): NowCard | null {
  if (!data?.user?.id) return null;
  const userId = data.user.id, now = nowSeconds;
  const when = (at: number) => nowCardWhen(at, now);
  const workspace = data.workspaces?.[role], attention: OperationEvent[] = workspace?.attention || [];

  const about = (kind: NowCardKind, entityKind: 'booking' | 'job', item: Row, title: string, detail: string,
    at: number, actionLabel: string, urgent = false): NowCard => ({
    kind, title, detail, at, actionLabel, urgent, entityKind, entityId: item.id,
    href: '/workspace/' + role + '/' + section(role, entityKind),
    event: { id: entityKind + ':' + item.id, entityId: item.id, kind: entityKind, title, detail: item.title, at, urgent },
  });
  const fromEvent = (event: OperationEvent): NowCard => ({
    kind: 'attention', title: STATES[event.title]?.title || event.title,
    detail: line((STATES[event.title]?.before || '') + when(event.at), event.detail), at: event.at,
    actionLabel: 'Открыть', urgent: event.urgent, entityKind: event.kind, entityId: event.entityId,
    href: '/workspace/' + role + '/' + section(role, event.kind), event,
  });
  // The administrator's pending hint, only when nothing above it is more important.
  const administrator = (): NowCard | null => {
    const brief = data.assistantBrief, task = brief?.automatic ? brief.prompts?.[0] : null;
    if (!task || task.kind === 'setup' || task.priority < 2) return null;
    // A hint about a stay or a job that is already over is not news.
    const booking = task.kind === 'booking' ? (data.bookings || []).find((b: Row) => b.id === task.entityId) : null;
    if (booking && (!['requested', 'confirmed'].includes(booking.status) || booking.terms?.actual_checkout)) return null;
    const job = task.kind === 'job' ? (data.jobs || []).find((j: Row) => j.id === task.entityId) : null;
    if (job && ['completed', 'cancelled'].includes(job.status)) return null;
    return {
      kind: 'administrator', title: task.title, detail: task.reason, at: task.at, actionLabel: 'Открыть',
      urgent: task.priority === 3, entityId: task.entityId || undefined,
      entityKind: ['booking', 'job', 'property'].includes(task.kind) ? task.kind : undefined,
      href: '/workspace/' + role + '/' + (task.section || section(role, task.kind)),
    };
  };

  if (role === 'cleaner') {
    const mine: Row[] = (data.jobs || []).filter((j: Row) => j.assigned_to === userId);
    const working = mine.filter(j => j.status === 'in_progress').sort((a, b) => a.end - b.end)[0];
    if (working) {
      const late = working.end <= now;
      return about('job', 'job', working, late ? 'Срок уборки прошёл' : 'Уборка идёт',
        line('срок: ' + when(working.end), working.title), working.end, 'Открыть', late);
    }
    const assigned = mine.filter(j => j.status === 'assigned').sort((a, b) => a.start - b.start)[0];
    if (assigned) {
      const late = assigned.end <= now;
      return about('job', 'job', assigned, late ? 'Срок уборки прошёл' : 'Следующая уборка',
        line(when(assigned.start), assigned.title), assigned.start, 'Открыть', late);
    }
    const submitted = mine.filter(j => j.status === 'submitted').sort((a, b) => a.end - b.end)[0];
    if (submitted) return about('job', 'job', submitted, 'Отчёт ждёт приёмки',
      line('отправлен владельцу', submitted.title), submitted.end, 'Открыть');
    const applied = (data.applications || [])
      .filter((a: Row) => a.user_id === userId && a.status === 'pending')
      .map((a: Row) => (data.jobs || []).find((j: Row) => j.id === a.job_id && j.status === 'open' && j.end > now))
      .filter(Boolean).sort((a: Row, b: Row) => a.start - b.start)[0];
    if (applied) return about('application', 'job', applied, 'Ждём ответа на отклик',
      line(when(applied.start), applied.title), applied.start, 'Открыть');
    return administrator();
  }

  const bookings: Row[] = (data.bookings || []).filter((b: Row) => role === 'owner' ? b.owner_id === userId : b.guest_id === userId);
  const requests = bookings.filter(b => b.status === 'requested' && b.expires_at > now);
  const stays = bookings.filter(b => b.status === 'confirmed' && !b.terms?.actual_checkout);

  if (role === 'owner') {
    const request = requests.sort((a, b) => a.expires_at - b.expires_at)[0];
    if (request) return about('request', 'booking', request, 'Заявка ждёт ответа',
      line('заезд ' + when(request.start), request.title), request.expires_at, 'Ответить', true);
    // A cleaner answered an open cleaning: the owner chooses right from this card, the responses wait for nobody else.
    const answered = ownerResponses(data, userId, now)[0];
    if (answered) return about('application', 'job', answered.job, answered.count > 1 ? 'Откликнулись исполнители · ' + answered.count : 'Откликнулся исполнитель',
      line('уборка ' + when(answered.job.start), answered.job.title), answered.job.start, 'Выбрать', true);
    const urgent = attention.find(event => event.urgent);
    if (urgent) return fromEvent(urgent);
    const today = day(now), moves: { booking: Row; kind: 'checkin' | 'checkout'; at: number }[] = [];
    for (const b of stays) {
      if (!b.terms?.actual_checkin && day(b.start) === today && b.end > now) moves.push({ booking: b, kind: 'checkin', at: b.start });
      else if (day(b.end) === today && b.end > now) moves.push({ booking: b, kind: 'checkout', at: b.end });
    }
    const move = moves.sort(byAt)[0];
    if (move) return about(move.kind, 'booking', move.booking, move.kind === 'checkin' ? 'Заезд гостя' : 'Выезд гостя',
      line(when(move.at), move.booking.title), move.at, 'Открыть');
    return attention[0] ? fromEvent(attention[0]) : administrator();
  }

  // Guest: an unfinished check-out first, then the stay itself, then a request the owner has not answered yet.
  const overdue = stays.filter(b => b.end <= now).sort((a, b) => a.end - b.end)[0];
  if (overdue) {
    const reported = !!overdue.terms?.checkout_reported_at;
    return about('checkout', 'booking', overdue, reported ? 'Выезд на проверке' : 'Сообщите о выезде',
      line('выезд был ' + when(overdue.end), overdue.title), overdue.end, 'Открыть', !reported);
  }
  const current = stays.filter(b => b.start <= now && b.end > now).sort((a, b) => a.end - b.end)[0];
  if (current) return about('stay', 'booking', current, current.terms?.actual_checkin ? 'Вы заселены' : 'Время заезда наступило',
    line('выезд ' + when(current.end), current.title), current.end, 'Открыть');
  const next = stays.filter(b => b.start > now).sort((a, b) => a.start - b.start)[0];
  const request = requests.sort((a, b) => a.start - b.start)[0];
  if (next && (!request || next.start <= request.start)) return about('checkin', 'booking', next, 'Ближайший заезд',
    line(when(next.start), next.title), next.start, 'Открыть');
  if (request) return about('request', 'booking', request, 'Ждём ответа владельца',
    line('заезд ' + when(request.start), request.title), request.start, 'Открыть');
  return administrator();
}
