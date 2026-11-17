// «Нити» автопилота: каждая бронь, уборка и задание — нить шагов от начала до конца и шаг, на котором дело сейчас.
// Блок «Автопилот» в шторке карты показывает их при входе, чтобы было видно, как дела идут без человека.
// Чистая логика (только lib/ai-move-marks.ts, lib/cancellation.ts и lib/stay-handover-text.ts): её берут и сайт (components/autopilot-threads.tsx), и приложение (mobile/src/AutopilotThreads.tsx).
// Тесты: tests/process-threads.test.mjs.

import { aiNoteOf, aiSays, aiSaysAll } from './ai-move-marks';
import {handoverState} from './stay-handover-text';
import { refundLeft } from './cancellation';
import { wordsOf } from './stay-words';

type Row = Record<string, any>;
const tenge = (n: number) => Number(n).toLocaleString('ru-RU').replace(/\u00a0|\u202f/g, ' ') + ' ₸';

// done — шаг пройден; now — идёт сейчас; next — следующий, ждёт своего времени; wait — впереди.
export type ThreadState = 'done' | 'now' | 'next' | 'wait';
// Кто делает шаг: ИИ-автопилот, гость, владелец, исполнитель или сам человек, который смотрит («Вы»).
export type ThreadBy = 'ai' | 'guest' | 'owner' | 'cleaner' | 'you';
export type ThreadStep = { key: string; label: string; state: ThreadState; by: ThreadBy; at?: number; note?: string; progress?: number };
export type ProcessThread = {
  id: string;
  kind: 'booking' | 'job';
  tag: 'Бронь' | 'Уборка' | 'Задание' | 'Возврат';
  title: string;
  propertyId?: string;
  steps: ThreadStep[];
  // Индекс текущего шага; у законченного дела — последний шаг.
  current: number;
  finished: boolean;
  // Шаг ждёт самого человека: его не сделает ни ИИ, ни другой участник.
  yours: boolean;
  // Коротко справа: «Уборка · 40%», «Заезд · 14:00», «Готово».
  status: string;
  // Строка под нитью: что сейчас и что дальше.
  line: string;
  at: number;
};

export const THREAD_BY: Record<ThreadBy, string> = { ai: '✦ ИИ', guest: 'Гость', owner: 'Владелец', cleaner: 'Исполнитель', you: 'Вы' };

const ZONE = 5 * 3600, DAY = 86400;
const two = (n: number) => String(n).padStart(2, '0');
const dayOf = (t: number) => Math.floor((t + ZONE) / DAY);
export function threadClock(at: number) { const d = new Date((at + ZONE) * 1000); return two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()); }
// «14:00», «завтра 14:00», «вчера 22:00», «16 ноября 14:00».
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function threadWhen(at: number, now: number) {
  const ago = dayOf(now) - dayOf(at), clock = threadClock(at);
  if (ago === 0) return clock;
  if (ago === -1) return 'завтра ' + clock;
  if (ago === 1) return 'вчера ' + clock;
  const d = new Date((at + ZONE) * 1000);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + clock;
}
const left = (seconds: number) => { const m = Math.max(1, Math.round(seconds / 60)); return m >= 60 ? Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин'; };
const part = (from: number, to: number, now: number) => to > from ? Math.max(0, Math.min(1, (now - from) / (to - from))) : 0;

// Что сделал ИИ: уведомления, которые ИИ оставляет (data.notifications состояния роли, ключи из lib/ai-move-marks.ts),
// и строки журнала «Что сделал ИИ», если они есть (data.aiJournal). Только для своей роли, от новых к старым.
type AiLine = { at: number; text: string; kind: string; id: string; title: string };
export function aiLines(data: Row | null | undefined, role: 'owner' | 'cleaner'): AiLine[] {
  const out: AiLine[] = [];
  for (const n of Array.isArray(data?.notifications) ? data!.notifications : []) {
    if (typeof n?.dedupe !== 'string' || !n.dedupe.startsWith(role + ':')) continue;
    const note = aiNoteOf(n.dedupe, Number(n.created_at), n.body);
    if (note) out.push({ at: note.at, text: note.text, kind: note.kind, id: note.id, title: '' });
  }
  for (const l of Array.isArray(data?.aiJournal) ? data!.aiJournal : [])
    if (typeof l?.at === 'number') out.push({ at: l.at, text: String(l.text || ''), kind: l.open?.kind || '', id: String(l.open?.id || ''), title: String(l.title || '') });
  const titles = new Map<string, string>([...(data?.bookings || []).map((b: Row) => ['booking:' + b.id, b.title]), ...(data?.jobs || []).map((j: Row) => ['job:' + j.id, j.title])] as [string, string][]);
  // Баня и зал говорят своими словами: тип объекта приходит в брони как property_type.
  const types = new Map<string, string>((data?.bookings || []).map((b: Row) => ['booking:' + b.id, b.property_type]) as [string, string][]);
  return out.map(l => ({ ...l, text: aiSays(l.text, types.get(l.kind + ':' + l.id)), title: l.title || titles.get(l.kind + ':' + l.id) || '' })).sort((a, b) => b.at - a.at);
}
function aiDid(data: Row, role: 'owner' | 'cleaner', kind: 'booking' | 'job', id: string) {
  const texts = aiLines(data, role).filter(l => l.kind === kind && l.id === String(id)).map(l => l.text);
  return (...words: string[]) => texts.some(t => words.some(w => aiSaysAll(w).some(v => t.startsWith(v))));
}

// Состояния шагов по порядку: первый непройденный становится «сейчас» (или «следующий», если его время ещё не пришло).
function place(steps: Omit<ThreadStep, 'state'>[], done: boolean[], live: (i: number) => boolean): { steps: ThreadStep[]; current: number; finished: boolean } {
  const first = done.findIndex(d => !d), finished = first < 0, current = finished ? steps.length - 1 : first;
  return {
    finished, current,
    steps: steps.map((s, i) => ({ ...s, state: done[i] || finished ? 'done' : i === current ? (live(i) ? 'now' : 'next') : 'wait' })),
  };
}

function statusOf(t: { steps: ThreadStep[]; current: number; finished: boolean }, now: number, finishedWord: string) {
  if (t.finished) return finishedWord;
  const s = t.steps[t.current];
  if (s.state === 'now' && typeof s.progress === 'number') return s.label + ' · ' + Math.round(s.progress * 100) + '%';
  if (s.state === 'next' && s.at) return s.label + ' · ' + threadWhen(s.at, now);
  return s.label;
}
function lineOf(t: { steps: ThreadStep[]; current: number; finished: boolean }, now: number, finishedLine: string) {
  if (t.finished) return finishedLine;
  const s = t.steps[t.current], after = t.steps[t.current + 1];
  let text = s.note || (s.state === 'next' && s.at ? s.label + ' в ' + threadWhen(s.at, now) : s.label);
  if (after) text += ' → ' + after.label + (after.by === 'ai' ? ' (ИИ)' : '') + (after.at && after.at > now ? ' ' + threadWhen(after.at, now) : '');
  return text;
}

// ---------- Бронь глазами владельца ----------
export function bookingThread(b: Row, data: Row, now: number): ProcessThread {
  const did = aiDid(data, 'owner', 'booking', b.id), terms: Row = b.terms || {}, w = wordsOf(b);
  const confirmed = ['confirmed', 'completed'].includes(b.status), paid = b.payment_status === 'owner_verified';
  // After the end of the stay the check-in can no longer be reported (lib/guest-trips.ts): the guest is led to the checkout.
  const inside = !!terms.actual_checkin, out = !!terms.actual_checkout || b.status === 'completed', over = !inside && now >= b.end;
  const auto = !!Number(data?.ownProperties?.find((p: Row) => p.id === b.property_id)?.policy?.auto_confirm);
  const inApp = data?.paymentMode === 'test' || data?.paymentMode === 'live';
  const steps: Omit<ThreadStep, 'state'>[] = [
    { key: 'request', label: 'Заявка', by: confirmed ? (did('ИИ подтвердил бронь') ? 'ai' : 'owner') : auto ? 'ai' : 'you', at: b.created_at,
      note: confirmed ? (did('ИИ подтвердил бронь') ? 'ИИ подтвердил бронь' : 'Бронь подтверждена') : auto ? 'ИИ проверяет заявку' : 'Заявка ждёт вашего ответа' },
    // The guest pays in the app (data.paymentMode): the payment confirms itself and the AI reminds the guest, the owner marks nothing.
    { key: 'pay', label: 'Оплата', by: paid || inApp ? 'guest' : 'you', note: paid ? 'Оплата подтверждена' : inApp ? 'Ждём оплату гостя · ИИ напомнит' : 'Отметьте оплату, когда гость заплатит' },
    { key: 'checkin', label: w.arrive, by: did('ИИ заселил гостя') ? 'ai' : 'guest', at: b.start,
      note: inside ? (did('ИИ заселил гостя') ? w.aiIn : w.guestIn) : w.arrive + ' в ' + threadWhen(b.start, now) },
    { key: 'stay', label: w.stay, by: 'guest', at: b.start, progress: inside && !out ? part(b.start, b.end, now) : undefined,
      note: w.guestInside },
    { key: 'checkout', label: w.leave, by: did('ИИ подтвердил выезд') ? 'ai' : 'guest', at: b.end,
      note: out ? (did('ИИ подтвердил выезд') ? w.aiOut : w.leaveOk) : terms.checkout_reported_at ? 'Гость сообщил ' + w.ofLeave + ' · подтвердите' : now >= b.end ? 'Время ' + w.leaveGen + ' прошло · подтвердите ' + w.leaveLow : w.leave + ' в ' + threadWhen(b.end, now) },
  ];
  // A deposit the owner received is a last step of its own: the stay is not closed until it is back with the guest.
  const held = terms.deposit_status === 'owner_verified' && Number(terms.deposit) > 0, owed = Number(terms.deposit_balance) || 0, kept = Number(terms.deposit_kept) || 0;
  if (held) steps.push({ key: 'deposit', label: 'Депозит', by: 'you', at: terms.deposit_returned_at || undefined,
    note: owed && handoverState(b as Parameters<typeof handoverState>[0], now) === 'ask' ? (w.arrive==='Заезд'?'Отметьте, как гость оставил жильё, потом верните депозит':'Отметьте приёмку после гостей, потом верните депозит') : owed ? 'Верните гостю ' + (kept ? 'остаток депозита ' : 'депозит ') + tenge(owed) + ' и отметьте возврат' : kept ? 'Удержано ' + tenge(kept) + (kept < Number(terms.deposit) ? ', остальное возвращено' : '') : 'Депозит возвращён' });
  const leaving = out || !!terms.checkout_reported_at || now >= b.end;
  const done = [confirmed, paid, inside, inside && leaving, out, ...(held ? [out && !owed] : [])];
  const t = place(steps, done, i => i === 0 || i === 1 || i === 3 || i === 5 || (i === 2 ? now >= b.start - 15 * 60 : now >= b.end));
  const yours = !t.finished && t.steps[t.current].by === 'you';
  return { id: b.id, kind: 'booking', tag: 'Бронь', title: b.title || 'Бронь', propertyId: b.property_id, ...t, yours,
    status: statusOf(t, now, 'Завершено'), line: lineOf(t, now, did('ИИ подтвердил выезд') ? w.aiOut : w.guestOut), at: b.start };
}

// ---------- Отменённая бронь, по которой владелец ещё должен гостю ----------
export function refundThread(b: Row, now: number): ProcessThread | null {
  const refund = refundLeft(b), deposit = b.terms?.deposit_status === 'owner_verified' ? Number(b.terms?.deposit_balance) || 0 : 0;
  if (!['cancelled', 'expired'].includes(b.status) || !(refund || deposit)) return null;
  const what = [refund && tenge(refund), deposit && 'депозит ' + tenge(deposit)].filter(Boolean).join(' и ');
  const t = place([{ key: 'cancel', label: 'Отмена', by: 'guest', note: 'Бронь отменена' }, { key: 'refund', label: 'Возврат', by: 'you', note: 'Верните гостю ' + what + ' и отметьте возврат' }], [true, false], () => true);
  return { id: b.id, kind: 'booking', tag: 'Возврат', title: b.title || 'Бронь', propertyId: b.property_id, ...t, yours: true, status: statusOf(t, now, 'Возвращено'), line: lineOf(t, now, 'Возвращено'), at: b.start };
}

// ---------- Уборка глазами владельца ----------
export function cleaningThread(j: Row, data: Row, now: number): ProcessThread {
  const did = aiDid(data, 'owner', 'job', j.id), userId = data?.user?.id;
  const assigned = !!j.assigned_to && j.status !== 'open', working = j.status === 'in_progress';
  const reported = ['submitted', 'completed'].includes(j.status), accepted = j.status === 'completed';
  const paid = accepted && (!j.assigned_to || Number(j.settlement_paid) >= Number(j.fee) || !!j.settled_at || j.guarantee === 'paid');
  // С резервом (гарантия оплаты) платит сервис; без него владелец рассчитывается сам и отмечает оплату.
  const service = !!j.guarantee || !Number(j.fee);
  const pending = (data?.applications || []).filter((a: Row) => a.job_id === j.id && a.status === 'pending').length;
  const policy = data?.ownProperties?.find((p: Row) => p.id === j.property_id)?.policy || {}, auto = !!Number(policy.auto_assign);
  const aiAccepts = did('ИИ принял уборку', 'ИИ проверил отчёт');
  // Nobody took it and its time is over: the owner decides in the card (new time, cleaned without a cleaner, cancel).
  const late = j.status === 'open' && !j.assigned_to && Number(j.end) <= now;
  const steps: Omit<ThreadStep, 'state'>[] = [
    { key: 'pick', label: late ? 'Срок прошёл' : 'Подбор', by: assigned ? (did('ИИ назначил исполнителя') ? 'ai' : 'owner') : auto && !late ? 'ai' : 'you', at: j.created_at,
      note: late ? 'Никто не взял уборку · решите в карточке' : assigned ? (did('ИИ назначил исполнителя') ? 'ИИ назначил исполнителя' : 'Исполнитель назначен')
        : pending ? (auto ? 'Откликнулись: ' + pending + ' · ИИ выберет сам' : 'Откликнулись: ' + pending + ' · выберите исполнителя')
          : auto ? 'ИИ ищет исполнителя' : 'Ждём откликов исполнителей' },
    { key: 'checkout', label: 'Выезд гостя', by: 'guest', at: j.start, note: j.checkout_confirmed ? 'Гость выехал' : 'Ждём выезда гостя' },
    { key: 'clean', label: 'Уборка', by: 'cleaner', at: j.start, progress: working ? part(Number(j.started_at) || j.start, j.end, now) : undefined,
      note: working ? (j.end > now ? 'Исполнитель убирает · ещё ' + left(j.end - now) : 'Срок уборки прошёл') : 'Уборка в ' + threadWhen(j.start, now) },
    { key: 'check', label: 'Приёмка', by: accepted ? (aiAccepts ? 'ai' : 'owner') : auto ? 'ai' : 'you', at: j.submitted_at || j.end,
      note: accepted ? (aiAccepts ? 'ИИ принял уборку' : 'Уборка принята') : auto ? 'ИИ проверяет фото' : 'Отчёт ждёт вашей проверки' },
    { key: 'pay', label: 'Оплата', by: service ? 'ai' : 'you', at: j.settled_at || undefined, note: accepted && !j.assigned_to ? 'Убрано без исполнителя' : paid ? 'Исполнителю заплачено' : service ? 'Сервис заплатит из резерва' : 'Рассчитайтесь с исполнителем и отметьте оплату' },
  ];
  const done = [assigned, !!j.checkout_confirmed && assigned, reported, accepted, paid];
  const t = place(steps, done, i => i === 0 || i === 3 || i === 4 || (i === 1 ? now >= j.start - 3600 : working));
  const mine = j.owner_id === userId;
  const yours = mine && !t.finished && t.steps[t.current].by === 'you' && (t.current !== 0 || pending > 0 || late);
  return { id: j.id, kind: 'job', tag: 'Уборка', title: j.title || 'Уборка', propertyId: j.property_id, ...t, yours,
    status: statusOf(t, now, 'Готово'), line: lineOf(t, now, paid ? 'Уборка принята и оплачена' : 'Уборка принята'), at: j.start };
}

// ---------- Задание глазами исполнителя ----------
export function jobThread(j: Row, data: Row, now: number): ProcessThread {
  const did = aiDid(data, 'cleaner', 'job', j.id), userId = data?.user?.id;
  const application = (data?.applications || []).find((a: Row) => a.job_id === j.id && a.user_id === userId);
  const isMine = j.assigned_to === userId && j.status !== 'open';
  const working = isMine && j.status === 'in_progress', reported = isMine && ['submitted', 'completed'].includes(j.status);
  const accepted = isMine && j.status === 'completed', paid = accepted && (Number(j.settlement_paid) >= Number(j.fee) || !!j.settled_at || j.guarantee === 'paid');
  const took = did('Автопилот взял уборку');
  const steps: Omit<ThreadStep, 'state'>[] = [
    { key: 'apply', label: 'Отклик', by: took ? 'ai' : 'you', at: application?.created_at, note: application || isMine ? (took ? 'Автопилот откликнулся за вас' : 'Отклик отправлен') : 'Можно откликнуться' },
    { key: 'assigned', label: 'Назначено', by: 'owner', note: isMine ? 'Вас назначили' : 'Ждём решения владельца' },
    { key: 'checkout', label: 'Выезд гостя', by: 'guest', at: j.start, note: j.checkout_confirmed ? 'Гость выехал, можно начинать' : 'Ждём выезда гостя' },
    { key: 'clean', label: 'Уборка', by: 'you', at: j.start, progress: working ? part(Number(j.started_at) || j.start, j.end, now) : undefined,
      note: working ? (j.end > now ? 'Идёт уборка · ещё ' + left(j.end - now) + ' · затем отчёт' : 'Срок прошёл · отправьте отчёт') : 'Начать уборку' },
    { key: 'check', label: 'Приёмка', by: did('ИИ принял уборку', 'ИИ проверил отчёт') ? 'ai' : 'owner', at: j.submitted_at || undefined,
      note: accepted ? 'Уборка принята' : 'Отчёт на приёмке' },
    { key: 'pay', label: 'Оплата', by: j.guarantee || !Number(j.fee) ? 'ai' : 'owner', at: j.settled_at || undefined, note: paid ? 'Оплата получена' : j.guarantee ? 'Сервис заплатит из резерва' : 'Владелец рассчитается после приёмки' },
  ];
  const done = [!!application || isMine, isMine, isMine && !!j.checkout_confirmed, reported, accepted, paid];
  const t = place(steps, done, i => i === 0 || i === 1 || i === 4 || i === 5 || (i === 2 ? now >= j.start - 3600 : i === 3 ? !!j.checkout_confirmed : false));
  const s = t.steps[t.current];
  const yours = !t.finished && s.by === 'you' && (t.current !== 3 || !!j.checkout_confirmed);
  const money = Number(j.fee) ? ' · ' + Number(j.fee).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₸' : '';
  return { id: j.id, kind: 'job', tag: 'Задание', title: j.title || 'Задание', propertyId: j.property_id, ...t, yours,
    status: t.finished ? 'Оплачено' : statusOf(t, now, 'Готово'), line: lineOf(t, now, 'Оплата получена' + money), at: j.start };
}

const RECENT = 6 * 3600, AHEAD = 3 * DAY;
// Дела, которые видны в блоке: идущие, ближайшие три дня и законченные за последние шесть часов.
const visible = (start: number, end: number, finished: boolean, now: number) => finished ? end > now - RECENT : start < now + AHEAD || end <= now + AHEAD;
const order = (a: ProcessThread, b: ProcessThread) =>
  Number(b.yours) - Number(a.yours) || Number(a.finished) - Number(b.finished)
  || Number(b.steps[b.current]?.state === 'now') - Number(a.steps[a.current]?.state === 'now') || a.at - b.at;

export function ownerThreads(data: Row | null | undefined, now: number): ProcessThread[] {
  const userId = data?.user?.id;
  if (!userId) return [];
  const bookings = (data!.bookings || []).filter((b: Row) => b.owner_id === userId && ['requested', 'confirmed', 'completed'].includes(b.status))
    .map((b: Row) => ({ b, t: bookingThread(b, data!, now) })).filter(({ b, t }: Row) => visible(b.start, Number(b.terms?.actual_checkout) || b.end, t.finished, now)).map(({ t }: Row) => t);
  const jobs = (data!.jobs || []).filter((j: Row) => j.owner_id === userId && j.status !== 'cancelled')
    .map((j: Row) => ({ j, t: cleaningThread(j, data!, now) })).filter(({ j, t }: Row) => visible(j.start, Number(j.completed_at) || j.end, t.finished, now)).map(({ t }: Row) => t);
  // Money owed to a guest after a cancellation stays in front of the owner until it is marked returned.
  const refunds = (data!.bookings || []).filter((b: Row) => b.owner_id === userId).map((b: Row) => refundThread(b, now)).filter(Boolean) as ProcessThread[];
  return [...refunds, ...bookings, ...jobs].sort(order);
}

// week: без трёхдневного горизонта — для ленты дня, где можно выбрать любой день недели.
export function cleanerThreads(data: Row | null | undefined, now: number, week = false): ProcessThread[] {
  const userId = data?.user?.id;
  if (!userId) return [];
  const applied = new Set((data!.applications || []).filter((a: Row) => a.user_id === userId && a.status === 'pending').map((a: Row) => a.job_id));
  return (data!.jobs || [])
    .filter((j: Row) => j.status !== 'cancelled' && (j.assigned_to === userId && j.status !== 'open' || j.status === 'open' && applied.has(j.id) && j.end > now))
    .map((j: Row) => ({ j, t: jobThread(j, data!, now) }))
    .filter(({ j, t }: Row) => week ? j.start < now + 7 * DAY : visible(j.start, Number(j.completed_at) || j.end, t.finished, now)).map(({ t }: Row) => t).sort(order);
}

// ---------- Бронь глазами гостя ----------
// «Вы» здесь гость: оплата (пока она тестовая и её можно внести в приложении), заезд и выезд — его шаги,
// подтверждает их владелец или ИИ. Законченная бронь без оценки ещё ждёт гостя: «Оцените проживание».
export function tripThread(b: Row, now: number, paymentMode?: string): ProcessThread {
  const terms: Row = b.terms || {}, w = wordsOf(b);
  const confirmed = ['confirmed', 'completed'].includes(b.status), paid = b.payment_status === 'owner_verified';
  const left = Number(b.amount) - (Number(terms.paid_amount) || 0), depositDue = Number(terms.deposit) > 0 && terms.deposit_status === 'pending';
  const canPay = paymentMode === 'test' && (left > 0 || depositDue);
  // After the end of the stay the check-in can no longer be reported (lib/guest-trips.ts): the guest is led to the checkout.
  const inside = !!terms.actual_checkin, out = !!terms.actual_checkout || b.status === 'completed', over = !inside && now >= b.end;
  const steps: Omit<ThreadStep, 'state'>[] = [
    { key: 'request', label: 'Заявка', by: 'owner', at: b.created_at, note: confirmed ? 'Бронь подтверждена' : 'Ждём ответа владельца' },
    { key: 'pay', label: 'Оплата', by: canPay ? 'you' : 'owner',
      note: paid && !depositDue ? 'Оплата подтверждена' : canPay && left > 0 ? (depositDue ? 'Оплатите бронь и депозит одним платежом' : 'Оплатите бронь, чтобы она не снялась') : canPay ? 'Внесите депозит, он вернётся ' + w.afterLeave : 'Владелец подтверждает оплату' },
    { key: 'checkin', label: w.arrive, by: 'you', at: b.start,
      note: inside ? w.youIn : over ? 'Срок брони закончился' : terms.checkin_reported_at ? 'Владелец подтверждает ' + w.arriveAcc : w.arrive + ' в ' + threadWhen(b.start, now) },
    { key: 'stay', label: w.stay, by: 'you', at: b.start, progress: inside && !out ? part(b.start, b.end, now) : undefined, note: w.youInside },
    { key: 'checkout', label: w.leave, by: 'you', at: b.end,
      note: out ? w.leaveOk : terms.checkout_reported_at ? 'Владелец подтверждает ' + w.leaveLow : 'Сообщите ' + w.ofLeave + ', когда уйдёте' },
  ];
  const leaving = out || !!terms.checkout_reported_at || now >= b.end;
  const t = place(steps, [confirmed, paid && !depositDue, inside || over, (inside || over) && leaving, out], i => i === 0 || i === 1 || i === 3 || (i === 2 ? now >= b.start - 15 * 60 : true));
  const review = b.status === 'completed' && !b.review_rating;
  const yours = t.finished ? review
    : t.current === 1 ? canPay
    : t.current === 2 ? t.steps[2].state === 'now' && !terms.checkin_reported_at
    : t.current === 4 && !terms.checkout_reported_at;
  return { id: b.id, kind: 'booking', tag: 'Бронь', title: b.title || 'Бронь', propertyId: b.property_id, ...t, yours,
    status: review ? 'Оцените' : statusOf(t, now, 'Завершено'), line: review ? w.done + '. Оцените его, это помогает другим гостям' : lineOf(t, now, w.done), at: b.start };
}

const REVIEW = 3 * DAY;
// Все брони гостя, которые ещё идут или впереди, и законченные: без оценки три дня, с оценкой шесть часов.
export function guestThreads(data: Row | null | undefined, now: number, paymentMode?: string): ProcessThread[] {
  const userId = data?.user?.id;
  if (!userId) return [];
  return (data!.bookings || []).filter((b: Row) => b.guest_id === userId && ['requested', 'confirmed', 'completed'].includes(b.status))
    .map((b: Row) => ({ b, t: tripThread(b, now, paymentMode) }))
    .filter(({ b, t }: Row) => !t.finished || (Number(b.terms?.actual_checkout) || b.end) > now - (t.yours ? REVIEW : RECENT))
    .map(({ t }: Row) => t).sort(order);
}

// Итог в шапке блока: «ведёт 2 брони и 1 уборку · от вас ничего не нужно».
const plural = (n: number, one: string, few: string, many: string) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
export function threadsSummary(role: 'owner' | 'cleaner' | 'guest', threads: ProcessThread[]) {
  const going = threads.filter(t => !t.finished), yours = threads.filter(t => t.yours).length;
  if (role === 'guest') {
    if (!going.length) return yours ? 'Оцените проживание' : 'Броней сейчас нет';
    return (going.length === 1 ? 'Ваша бронь' : 'Ваши брони: ' + going.length) + (yours ? ' · ждут вас: ' + yours : ' · от вас ничего не нужно');
  }
  const tail = yours ? ' · ждут вас: ' + yours : ' · от вас ничего не нужно';
  if (role === 'owner') {
    const b = going.filter(t => t.kind === 'booking').length, u = going.filter(t => t.kind === 'job').length;
    if (!b && !u) return 'Сейчас дел нет' + (threads.length ? ' · всё закончено' : '');
    const parts = [b ? b + ' ' + plural(b, 'бронь', 'брони', 'броней') : '', u ? u + ' ' + plural(u, 'уборку', 'уборки', 'уборок') : ''].filter(Boolean);
    return 'Ведёт ' + parts.join(' и ') + tail;
  }
  if (!going.length) return threads.length ? 'Все задания закончены' : 'Заданий пока нет';
  return 'Ведёт ' + going.length + ' ' + plural(going.length, 'задание', 'задания', 'заданий') + (yours ? ' · ваш шаг: ' + threads.find(t => t.yours)!.steps[threads.find(t => t.yours)!.current].label.toLowerCase() : '');
}

// Последнее, что сделал ИИ сегодня: строка под шапкой.
export function lastAiMove(data: Row | null | undefined, role: 'owner' | 'cleaner', now: number): { at: number; text: string; title: string } | null {
  const line = aiLines(data, role).find(l => dayOf(l.at) === dayOf(now) && l.at <= now + 60);
  return line ? { at: line.at, text: line.text, title: line.title } : null;
}

// ---------- Неделя и лента дня исполнителя ----------
export type WeekDay = { key: number; week: string; date: number; count: number; today: boolean };
const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export function cleanerWeek(data: Row | null | undefined, now: number): WeekDay[] {
  const userId = data?.user?.id, mine: Row[] = (data?.jobs || []).filter((j: Row) => j.assigned_to === userId && !['open', 'cancelled'].includes(j.status));
  return Array.from({ length: 7 }, (_, i) => {
    const key = dayOf(now) + i, d = new Date(key * DAY * 1000);
    return { key, week: WEEK[d.getUTCDay()], date: d.getUTCDate(), count: mine.filter(j => dayOf(j.start) === key).length, today: i === 0 };
  });
}
// Лента дня: часы дня и полосы заданий (с 8:00 до 22:00, шире, если задание выходит за край).
export type DayBar = { id: string; title: string; from: number; to: number; state: ThreadState; label: string };
export type DayRibbon = { from: number; to: number; now: number | null; ticks: { at: number; label: string }[]; bars: DayBar[] };
export function dayRibbon(threads: ProcessThread[], data: Row | null | undefined, dayKey: number, now: number): DayRibbon {
  const jobs = new Map<string, Row>((data?.jobs || []).map((j: Row) => [j.id, j]));
  const bars: DayBar[] = threads.flatMap(t => {
    const j = jobs.get(t.id);
    if (!j || dayOf(j.start) !== dayKey) return [];
    const clean = t.steps.find(s => s.key === 'clean')!;
    const state: ThreadState = t.finished || clean.state === 'done' ? 'done' : clean.state;
    return [{ id: t.id, title: t.title, from: j.start, to: j.end, state, label: threadClock(j.start) + '–' + threadClock(j.end) }];
  }).sort((a, b) => a.from - b.from);
  const base = dayKey * DAY - ZONE;
  let from = base + 8 * 3600, to = base + 22 * 3600;
  for (const b of bars) { from = Math.min(from, Math.floor((b.from - base) / 3600) * 3600 + base); to = Math.max(to, Math.ceil((b.to - base) / 3600) * 3600 + base); }
  to = Math.min(to, base + DAY);
  const ticks: { at: number; label: string }[] = [];
  const step = (to - from) / 3600 > 12 ? 4 : 2;
  for (let at = from; at <= to; at += step * 3600) ticks.push({ at, label: threadClock(at) });
  return { from, to, now: now >= from && now <= to ? now : null, ticks, bars };
}
export const ribbonX = (r: DayRibbon, at: number) => Math.max(0, Math.min(100, (at - r.from) / (r.to - r.from) * 100));
