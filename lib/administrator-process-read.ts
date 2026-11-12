import type {Role} from './domain';
import type {RentalService} from './service';
import {processStatus} from './process-status';
import {nowCardWhen} from './now-card';

type Row = Record<string, any>;

const normal = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');

// A request to do something is never answered with a read-only summary.
const ACTION = /создай|подтверди|оплати|отмен|продли|передай|отправь|сделай/u;
// "мои брони", "статус уборки", "актуальные заявки".
const MINE = /мои|моих|актуал|статус|сейчас|что.*вниман/u;
const SUBJECT = /брон|заяв|уборк|задан|объект|квартир|процесс/u;
// "что сегодня требует внимания?", "что требует внимания", "что у меня сегодня?", "есть что-то срочное?",
// "какие дела на сегодня", "мой график".
const TODAY = new RegExp([
  'что[^.?!]*(?:требует|вниман|срочн)',
  'что\\s+(?:у\\s+меня\\s+)?(?:на\\s+)?(?:сегодня|завтра)',
  'есть[^.?!]*срочн',
  '(?:дела|планы?|задачи)\\s+на\\s+сегодня',
  'мой\\s+график',
  'мо[её]\\s+расписани',
].join('|'), 'u');
// The cleaner's "есть уборки рядом на сегодня?", "есть задания рядом", "свободные уборки", "есть работа на сегодня?".
const JOB = /уборк|задани|работ|заказ/u;
const NEARBY = /рядом|поблизости|недалеко|сегодня|завтра|свободн|открыт|доступн/u;

/**
 * True when the text asks what is going on with the person's own bookings and cleaning jobs: such a question
 * is answered from the account's data (readAdministratorProcesses), with or without a model.
 * The questions the first screen itself suggests (roleAiLine in lib/ai-line.ts) must all pass here.
 */
export function processReadIntent(text: string, role?: Role) {
  const request = normal(text);
  if (ACTION.test(request)) return false;
  if (MINE.test(request) && SUBJECT.test(request)) return true;
  if (TODAY.test(request)) return true;
  return role === 'cleaner' && JOB.test(request) && NEARBY.test(request);
}

const zone = 'Asia/Almaty';
const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'});
const day = (seconds: number) => dayFormat.format(new Date(seconds * 1000));
const money = (amount: number) => new Intl.NumberFormat('ru-RU').format(amount).replace(/\s/g, ' ') + ' ₸';
const byStart = (a: Row, b: Row) => a.start - b.start;
const OPEN_JOB = ['open', 'assigned', 'in_progress', 'submitted'];
const LIST = 6;

type View = {state: Row; role: Role; userId: string; now: number; when: (at: number) => string};

// "— one", "— two" and, when the list is longer than fits a chat bubble, how many are left.
function listed(items: string[]) {
  const lines = items.slice(0, LIST).map(item => '— ' + item);
  if (items.length > LIST) lines.push('И ещё: ' + (items.length - LIST) + '.');
  return lines;
}

// What is sorted by time and still ahead: the nearest one is named when today itself is empty.
type Ahead = {at: number; text: string};
const nearest = (ahead: Ahead[]) => ahead.sort((a, b) => a.at - b.at)[0]?.text;

/**
 * The owner's "Что сегодня требует внимания?": what waits for the owner's own decision or check,
 * then what is planned for today. Read from the bookings and cleaning jobs themselves.
 */
function ownerToday({state, userId, now, when}: View) {
  const today = day(now), urgent: string[] = [], plan: string[] = [], ahead: Ahead[] = [];
  const bookings: Row[] = (state.bookings || []).filter((b: Row) => b.owner_id === userId).sort(byStart);
  const jobs: Row[] = (state.jobs || []).filter((j: Row) => j.owner_id === userId && OPEN_JOB.includes(j.status)).sort(byStart);

  for (const b of bookings) {
    if (b.status === 'requested' && b.expires_at > now) {
      urgent.push(`Заявка ждёт ответа: ${b.title} · заезд ${when(b.start)} · ответить до ${when(b.expires_at)}`);
      continue;
    }
    if (b.status !== 'confirmed' || b.terms?.actual_checkout) continue;
    if (b.end <= now) {
      urgent.push(`Выезд не подтверждён: ${b.title} · гость должен был выехать ${when(b.end)}`);
      continue;
    }
    if (b.payment_status !== 'owner_verified') urgent.push(`Оплата не подтверждена: ${b.title} · заезд ${when(b.start)}`);
    if (!b.terms?.actual_checkin) {
      if (b.start <= now) urgent.push(`Заселение не подтверждено: ${b.title} · время заезда ${when(b.start)}`);
      else if (day(b.start) === today) plan.push(`Заезд гостя ${when(b.start)}: ${b.title}`);
      else ahead.push({at: b.start, text: `заезд гостя ${when(b.start)}, ${b.title}`});
    }
    if (day(b.end) === today) plan.push(`Выезд гостя ${when(b.end)}: ${b.title}`);
  }
  for (const j of jobs) {
    if (j.status === 'submitted') urgent.push(`Отчёт об уборке ждёт проверки: ${j.title}`);
    else if (j.end <= now) urgent.push(`Срок уборки прошёл: ${j.title} · нужно было закончить ${when(j.end)}`);
    else if (j.status === 'open') urgent.push(`На уборку нет исполнителя: ${j.title} · ${when(j.start)}`);
    else if (j.status === 'in_progress') plan.push(`Уборка идёт: ${j.title} · до ${when(j.end)}`);
    else if (day(j.start) === today) plan.push(`Уборка ${when(j.start)}: ${j.title}`);
    else ahead.push({at: j.start, text: `уборка ${when(j.start)}, ${j.title}`});
  }

  const lines: string[] = [];
  if (urgent.length) lines.push('Требует внимания: ' + urgent.length + '.', ...listed(urgent));
  if (plan.length) lines.push(urgent.length ? 'Сегодня по плану:' : 'Срочного нет. Сегодня по плану:', ...listed(plan));
  if (!urgent.length && !plan.length) {
    const next = nearest(ahead);
    lines.push(!(state.ownProperties || []).length ? 'Сегодня ничего срочного. Квартир у вас пока нет: добавьте первую, и гости смогут её найти.'
      : next ? 'Сегодня ничего срочного. Ближайшее: ' + next + '.'
        : 'Сегодня ничего срочного: заявок, заездов и уборок нет.');
  }
  if (urgent.length || plan.length) lines.push('Все действия — в карточке брони или уборки. Проверено сейчас.');
  return lines.join('\n');
}

/** The guest's "что у меня сегодня?": the stay itself and a request the owner has not answered yet. */
function guestToday({state, userId, now, when}: View) {
  const today = day(now), urgent: string[] = [], plan: string[] = [], ahead: Ahead[] = [];
  const bookings: Row[] = (state.bookings || []).filter((b: Row) => b.guest_id === userId).sort(byStart);
  for (const b of bookings) {
    if (b.status === 'requested' && b.expires_at > now) {
      plan.push(`Ждём ответа владельца: ${b.title} · заезд ${when(b.start)}`);
      continue;
    }
    if (b.status !== 'confirmed' || b.terms?.actual_checkout) continue;
    if (b.end <= now) urgent.push(b.terms?.checkout_reported_at
      ? `Владелец ещё не подтвердил выезд: ${b.title}`
      : `Сообщите о выезде: ${b.title} · время выезда было ${when(b.end)}`);
    else if (b.start <= now) plan.push(`${b.terms?.actual_checkin ? 'Вы заселены' : 'Время заезда наступило'}: ${b.title} · выезд ${when(b.end)}`);
    else if (day(b.start) === today) plan.push(`Заезд ${when(b.start)}: ${b.title}`);
    else ahead.push({at: b.start, text: `заезд ${when(b.start)}, ${b.title}`});
  }
  const lines: string[] = [];
  if (urgent.length) lines.push('Требует внимания: ' + urgent.length + '.', ...listed(urgent));
  if (plan.length) lines.push(urgent.length ? 'Ещё на сегодня:' : 'Сегодня:', ...listed(plan));
  if (!urgent.length && !plan.length) {
    const next = nearest(ahead);
    lines.push(next ? 'Сегодня ничего срочного. Ближайшее: ' + next + '.' : 'Сегодня ничего срочного: броней и заявок нет.');
  }
  if (urgent.length || plan.length) lines.push('Все действия — в карточке брони. Проверено сейчас.');
  return lines.join('\n');
}

/**
 * The cleaner's "Есть уборки рядом на сегодня?" and "Мой график": the cleaner's own jobs first,
 * then the open jobs of the cleaner's city. "Рядом" is that city: the service does not know where the person is.
 */
function cleanerJobs({state, role, userId, now, when}: View) {
  const jobs: Row[] = state.jobs || [], lines: string[] = [];
  const mine = jobs.filter(job => job.assigned_to === userId && OPEN_JOB.includes(job.status)).sort(byStart);
  if (mine.length) {
    lines.push('Ваши уборки: ' + mine.length + '.');
    lines.push(...listed(mine.map(job => {
      const late = job.status !== 'submitted' && job.end <= now;
      return `${job.title} · ${processStatus('job', job, role, userId).label} · ` + (late ? `срок прошёл ${when(job.end)}` : when(job.start));
    })));
  } else {
    lines.push('Назначенных уборок у вас сейчас нет.');
  }

  const city = String(state.profile?.city || '').trim(), place = city ? ' в городе ' + city : '';
  const open = jobs.filter(job => job.status === 'open' && job.end > now && (!city || job.city === city)).sort(byStart);
  if (open.length) {
    const today = open.filter(job => day(job.start) === day(now)).length;
    lines.push(`Свободных уборок${place}: ${open.length}` + (today ? `, из них сегодня: ${today}.` : '. На сегодня свободных нет.'));
    // The flat is not named until the owner assigns the job: district, time and fee are what every cleaner may see.
    lines.push(...listed(open.map(job => [job.district || job.city, when(job.start), money(job.fee)].filter(Boolean).join(' · '))));
    lines.push('Откликнуться можно в разделе «Найти задания». Адрес откроется после назначения.');
  } else {
    lines.push(`Рядом заданий нет: свободных уборок${place} сейчас нет. Новые появятся в разделе «Найти задания».`);
  }
  lines.push('Проверено сейчас.');
  return lines.join('\n');
}

/** Everything the person has open: the answer to "мои брони", "статус уборки" and the model's read tool. */
function summary({state, role, userId, when}: View) {
  const bookings: Row[] = state.bookings || [];
  const jobs: Row[] = role === 'guest' ? [] : state.jobs || [];
  const activeBookings = bookings.filter(booking => ['requested', 'confirmed'].includes(booking.status) && !booking.terms?.actual_checkout);
  const activeJobs = jobs.filter(job => OPEN_JOB.includes(job.status));
  const tasks: Row[] = (state.administrator?.tasks || [])
    .filter((task: Row) => task.status === 'open')
    .sort((a: Row, b: Row) => b.priority - a.priority || a.deadline - b.deadline);

  const lines: string[] = [];
  if (role === 'owner') lines.push(`Ваших квартир: ${state.ownProperties?.length || 0}. Броней без выезда: ${activeBookings.length}. Уборок не закрыто: ${activeJobs.length}.`);
  else lines.push(`Ваших броней без выезда: ${activeBookings.length}.`);

  if (tasks.length) {
    lines.push('Требуют внимания: ' + tasks.length + '.');
    for (const task of tasks.slice(0, LIST)) lines.push('— ' + task.title + ' · ' + task.reason);
  }

  const items = [
    ...activeBookings.map(item => ({item, kind: 'booking' as const})),
    ...activeJobs.map(item => ({item, kind: 'job' as const})),
  ].sort((a, b) => a.item.start - b.item.start);
  if (items.length) lines.push(role === 'owner' ? 'Ближайшие брони и уборки:' : 'Ваши брони:');
  for (const {item, kind} of items.slice(0, LIST)) {
    const payment = kind === 'booking' ? ' · оплата ' + (item.payment_status === 'owner_verified' ? 'подтверждена владельцем' : 'не подтверждена') : '';
    lines.push('— ' + item.title + ' · ' + processStatus(kind, item, role, userId).label + payment + ' · ' + when(item.start));
  }
  if (!items.length && !tasks.length) lines.push('Незакрытых броней и уборок сейчас нет.');

  lines.push('Проверено сейчас. Оплату, заезд и приёмку уборки подтверждайте в карточке брони или уборки.');
  return lines.join('\n');
}

/**
 * The answer itself, from the state the role may see (roleState of the service). The question decides its shape:
 * "что сегодня требует внимания?" gets what is urgent and what is planned for today; any question of a cleaner
 * gets the cleaner's own jobs and the open jobs nearby; everything else gets the full summary.
 */
export function processAnswer(state: Row, role: Role, userId: string, now: number, question = '') {
  const view: View = {state, role, userId, now, when: at => nowCardWhen(at, now)};
  if (role === 'cleaner') return cleanerJobs(view);
  if (TODAY.test(normal(question))) return role === 'owner' ? ownerToday(view) : guestToday(view);
  return summary(view);
}

/**
 * What the person has right now, read from the database at the moment of the question.
 * Nothing is changed and nothing that the role may not see is included.
 */
export async function readAdministratorProcesses(s: RentalService, role: Role, question = '') {
  const state: Row = await s.roleState(role, {catalog: false});
  const now: number = state.serverTime || Math.floor(Date.now() / 1000);
  return {text: processAnswer(state, role, s.userId, now, question)};
}
