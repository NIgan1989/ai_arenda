import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';

const {nowCard, nowCardWhen} = await load('now-card');
const {operationOverview} = await load('operations');
const {assistantBrief, defaultAssistantSettings} = await load('assistant');
const {roleAiLine, leaveAiAsk, takeAiAsk, aiAskKey, administratorChatPath} = await load('ai-line');

// 11 November 2026, 12:00 in Kazakhstan (UTC+5).
const now = Date.UTC(2026, 10, 11, 7, 0, 0) / 1000;
const hour = 3600, dayLength = 86400;
const ids = {guest: 'guest-1', owner: 'owner-1', cleaner: 'cleaner-1'};

const booking = (id, extra = {}) => ({
  id, title: 'Студия у набережной', status: 'confirmed', owner_id: ids.owner, guest_id: ids.guest,
  start: now + 3 * hour, end: now + 27 * hour, expires_at: now + hour, payment_status: 'owner_verified', terms: {}, ...extra,
});
const job = (id, extra = {}) => ({
  id, title: 'Уборка: Студия у набережной', status: 'assigned', owner_id: ids.owner, assigned_to: ids.cleaner,
  start: now + 2 * hour, end: now + 4 * hour, checkout_confirmed: true, ...extra,
});
// The same shape /api/state returns for one role: records plus the server-built overview and administrator brief.
function state(role, records = {}) {
  const data = {
    user: {id: ids[role]}, profile: {id: ids[role]}, properties: [], ownProperties: role === 'owner' ? [{id: 'p1', title: 'Студия у набережной', policy: {version: 1}}] : [],
    bookings: [], jobs: [], applications: [], notifications: [], ...records,
  };
  return {
    ...data, serverTime: now,
    workspaces: {[role]: operationOverview(data, ids[role], role, now)},
    assistantBrief: assistantBrief(data, role, {...defaultAssistantSettings}, now),
  };
}

test('times are written in Russian by Kazakhstan time', () => {
  assert.equal(nowCardWhen(now + 2 * hour, now), 'сегодня в 14:00');
  assert.equal(nowCardWhen(now + dayLength - 150 * 60, now), 'завтра в 09:30');
  assert.equal(nowCardWhen(now - dayLength, now), 'вчера в 12:00');
  assert.equal(nowCardWhen(now + 9 * dayLength, now), '20 ноября в 12:00');
  // 23:30 in Kazakhstan is still the same day there although the UTC date differs.
  assert.equal(nowCardWhen(now + 11.5 * hour, now), 'сегодня в 23:30');
  assert.equal(nowCardWhen(now + 12.5 * hour, now), 'завтра в 00:30');
});

test('nothing real means no card', () => {
  for (const role of ['guest', 'owner', 'cleaner']) assert.equal(nowCard(role, state(role), now), null, role);
  assert.equal(nowCard('guest', null, now), null);
  assert.equal(nowCard('owner', {bookings: [booking('b1', {status: 'requested'})]}, now), null, 'no signed-in user');
  // History does not count: finished, cancelled and expired records.
  const past = [booking('b1', {status: 'cancelled'}), booking('b2', {status: 'requested', expires_at: now - 1}),
    booking('b3', {start: now - 50 * hour, end: now - 26 * hour, terms: {actual_checkin: now - 50 * hour, actual_checkout: now - 26 * hour}})];
  assert.equal(nowCard('guest', state('guest', {bookings: past}), now), null);
  assert.equal(nowCard('owner', state('owner', {bookings: past}), now), null);
  assert.equal(nowCard('cleaner', state('cleaner', {jobs: [job('j1', {status: 'completed'}), job('j2', {status: 'open', assigned_to: null})]}), now), null);
});

test('guest sees the nearest stay or the request waiting for the owner', () => {
  const next = nowCard('guest', state('guest', {bookings: [booking('late', {start: now + 5 * dayLength, end: now + 6 * dayLength}), booking('soon')]}), now);
  assert.deepEqual([next.kind, next.title, next.detail, next.actionLabel, next.href, next.entityId, next.at],
    ['checkin', 'Ближайший заезд', 'Сегодня в 15:00 · Студия у набережной', 'Открыть', '/workspace/guest/bookings', 'soon', now + 3 * hour]);
  assert.deepEqual({kind: next.event.kind, entityId: next.event.entityId}, {kind: 'booking', entityId: 'soon'});

  const waiting = nowCard('guest', state('guest', {bookings: [booking('r1', {status: 'requested', start: now + dayLength})]}), now);
  assert.deepEqual([waiting.kind, waiting.title, waiting.detail, waiting.actionLabel],
    ['request', 'Ждём ответа владельца', 'Заезд завтра в 12:00 · Студия у набережной', 'Открыть']);

  // A request for an earlier date goes before a confirmed stay that starts later, and the other way round.
  const both = [booking('stay', {start: now + 2 * dayLength, end: now + 3 * dayLength}), booking('ask', {status: 'requested', start: now + dayLength, end: now + 2 * dayLength})];
  assert.equal(nowCard('guest', state('guest', {bookings: both}), now).entityId, 'ask');
  both[0].start = now + hour;
  assert.equal(nowCard('guest', state('guest', {bookings: both}), now).entityId, 'stay');
});

test('guest during and after the stay', () => {
  const living = booking('b1', {start: now - 2 * hour, end: now + 22 * hour, terms: {actual_checkin: now - hour}});
  const card = nowCard('guest', state('guest', {bookings: [booking('next', {start: now + hour}), living]}), now);
  assert.deepEqual([card.kind, card.title, card.detail, card.entityId], ['stay', 'Вы заселены', 'Выезд завтра в 10:00 · Студия у набережной', 'b1']);
  assert.equal(nowCard('guest', state('guest', {bookings: [{...living, terms: {}}]}), now).title, 'Время заезда наступило');

  const over = booking('b2', {start: now - 30 * hour, end: now - 2 * hour, terms: {actual_checkin: now - 30 * hour}});
  const leave = nowCard('guest', state('guest', {bookings: [living, over]}), now);
  assert.deepEqual([leave.kind, leave.title, leave.detail, leave.urgent, leave.entityId],
    ['checkout', 'Сообщите о выезде', 'Выезд был сегодня в 10:00 · Студия у набережной', true, 'b2']);
  over.terms.checkout_reported_at = now - hour;
  const reported = nowCard('guest', state('guest', {bookings: [over]}), now);
  assert.deepEqual([reported.title, reported.urgent], ['Выезд на проверке', false]);
});

test('owner sees a waiting request first, then urgent checks, then today', () => {
  const request = booking('r1', {status: 'requested', start: now + dayLength, expires_at: now + 1800});
  const laterRequest = booking('r2', {status: 'requested', start: now + 2 * hour, expires_at: now + 3000});
  const arrival = booking('in', {start: now + 2 * hour, end: now + 26 * hour});
  const departure = booking('out', {start: now - 20 * hour, end: now + hour, terms: {actual_checkin: now - 20 * hour}});
  const overdue = booking('gone', {start: now - 30 * hour, end: now - hour, terms: {actual_checkin: now - 30 * hour}});
  const tomorrow = booking('far', {start: now + 20 * hour, end: now + 44 * hour});

  const first = nowCard('owner', state('owner', {bookings: [arrival, overdue, laterRequest, request]}), now);
  assert.deepEqual([first.kind, first.title, first.detail, first.actionLabel, first.href, first.entityId, first.urgent],
    ['request', 'Заявка ждёт ответа', 'Заезд завтра в 12:00 · Студия у набережной', 'Ответить', '/workspace/owner/bookings', 'r1', true]);

  const urgent = nowCard('owner', state('owner', {bookings: [arrival, overdue]}), now);
  assert.deepEqual([urgent.kind, urgent.title, urgent.detail, urgent.entityId, urgent.urgent],
    ['attention', 'Выезд не подтверждён', 'Сегодня в 11:00 · Студия у набережной', 'gone', true]);
  assert.equal(urgent.event.id.startsWith('booking:gone:'), true);

  const today = nowCard('owner', state('owner', {bookings: [tomorrow, arrival, departure]}), now);
  assert.deepEqual([today.kind, today.title, today.detail, today.entityId], ['checkout', 'Выезд гостя', 'Сегодня в 13:00 · Студия у набережной', 'out']);
  const checkin = nowCard('owner', state('owner', {bookings: [tomorrow, arrival]}), now);
  assert.deepEqual([checkin.kind, checkin.title, checkin.detail, checkin.actionLabel], ['checkin', 'Заезд гостя', 'Сегодня в 14:00 · Студия у набережной', 'Открыть']);
});

test('owner without requests and without moves today gets the next check, else nothing', () => {
  const unpaid = booking('far', {start: now + 30 * hour, end: now + 54 * hour, payment_status: 'unpaid'});
  const payment = nowCard('owner', state('owner', {bookings: [unpaid]}), now);
  assert.deepEqual([payment.kind, payment.title, payment.detail], ['attention', 'Оплата не подтверждена', 'Заезд завтра в 18:00 · Студия у набережной']);

  const report = nowCard('owner', state('owner', {jobs: [job('j1', {status: 'submitted'})]}), now);
  assert.deepEqual([report.title, report.href, report.entityKind], ['Отчёт ждёт проверки', '/workspace/owner/cleaning', 'job']);

  assert.equal(nowCard('owner', state('owner', {bookings: [booking('far', {start: now + 30 * hour, end: now + 54 * hour})]}), now), null);
  // An owner with no flats gets no placeholder card: the chip "Добавить квартиру" covers it.
  assert.equal(nowCard('owner', state('owner', {ownProperties: []}), now), null);
});

test('the administrator hint is carried only when nothing is more important', () => {
  const stay = booking('b1', {start: now - 2 * hour, end: now + 22 * hour, terms: {actual_checkin: now - hour},
    changes: [{id: 'c1', status: 'pending', expires_at: now + hour, proposer_role: 'guest'}]});
  // Tomorrow's stay is not on today's list, so the pending change proposed by the guest becomes the card.
  const quiet = {...stay, start: now + 30 * hour, end: now + 54 * hour, terms: {}};
  const hint = nowCard('owner', state('owner', {bookings: [quiet]}), now);
  assert.deepEqual([hint.kind, hint.title, hint.href, hint.entityId], ['administrator', 'Согласовать изменение проживания', '/workspace/owner/bookings', 'b1']);
  assert.match(hint.detail, /Студия у набережной/);
  // With a request waiting the same hint stays out of the way.
  assert.equal(nowCard('owner', state('owner', {bookings: [quiet, booking('r1', {status: 'requested'})]}), now).kind, 'request');
  // Low-priority and setup prompts never become a card.
  const guest = state('guest');
  assert.equal(guest.assistantBrief.prompts[0].kind, 'setup');
  assert.equal(nowCard('guest', guest, now), null);
  // Reactive mode has no automatic prompts.
  const silent = state('owner', {bookings: [quiet]});
  silent.assistantBrief = {...silent.assistantBrief, automatic: false};
  assert.equal(nowCard('owner', silent, now), null);
});

test('cleaner sees the running job, then the next assigned one', () => {
  const later = job('later', {start: now + 5 * hour, end: now + 7 * hour});
  const soon = job('soon');
  const running = job('run', {status: 'in_progress', start: now - hour, end: now + hour});
  const foreign = job('other', {assigned_to: 'someone-else', start: now + 600});
  const open = job('open', {status: 'open', assigned_to: null, start: now + 600});

  const next = nowCard('cleaner', state('cleaner', {jobs: [open, foreign, later, soon]}), now);
  assert.deepEqual([next.kind, next.title, next.detail, next.actionLabel, next.href, next.entityId, next.at],
    ['job', 'Следующая уборка', 'Сегодня в 14:00 · Уборка: Студия у набережной', 'Открыть', '/workspace/cleaner/assignments', 'soon', now + 2 * hour]);
  assert.deepEqual({kind: next.event.kind, entityId: next.event.entityId}, {kind: 'job', entityId: 'soon'});

  const work = nowCard('cleaner', state('cleaner', {jobs: [later, soon, running]}), now);
  assert.deepEqual([work.title, work.detail, work.entityId, work.urgent], ['Уборка идёт', 'Срок: сегодня в 13:00 · Уборка: Студия у набережной', 'run', false]);

  const late = nowCard('cleaner', state('cleaner', {jobs: [job('missed', {start: now - 3 * hour, end: now - hour})]}), now);
  assert.deepEqual([late.title, late.urgent], ['Срок уборки прошёл', true]);
});

test('cleaner waiting for the owner: report on review, then a pending response', () => {
  const sent = job('sent', {status: 'submitted', start: now - 3 * hour, end: now - hour});
  const open = job('open', {status: 'open', assigned_to: null, start: now + dayLength, end: now + dayLength + 2 * hour});
  const applications = [{id: 'a1', job_id: 'open', user_id: ids.cleaner, status: 'pending'}];

  assert.equal(nowCard('cleaner', state('cleaner', {jobs: [sent, open], applications}), now).title, 'Отчёт ждёт приёмки');
  const applied = nowCard('cleaner', state('cleaner', {jobs: [open], applications}), now);
  assert.deepEqual([applied.kind, applied.title, applied.detail, applied.actionLabel, applied.entityId],
    ['application', 'Ждём ответа на отклик', 'Завтра в 12:00 · Уборка: Студия у набережной', 'Открыть', 'open']);
  assert.equal(nowCard('cleaner', state('cleaner', {jobs: [open], applications: [{...applications[0], status: 'rejected'}]}), now), null);
  // An assigned job is more important than anything that only waits.
  assert.equal(nowCard('cleaner', state('cleaner', {jobs: [sent, open, job('mine')], applications}), now).entityId, 'mine');
});

test('the AI line of each role: the same words as in the app, shortcuts that fit one row', () => {
  // The labels are short enough for one row of a 360px phone; a shortened one keeps its full name for a screen reader.
  assert.deepEqual(roleAiLine('guest').chips.map(chip => chip.label), ['На сутки', 'На часы', 'На выходные']);
  assert.equal(roleAiLine('guest').placeholder, 'На 3 часа сегодня в центре');
  assert.deepEqual(roleAiLine('owner').chips.map(chip => chip.label), ['Заявки', 'Календарь', '+ Квартира']);
  assert.deepEqual(roleAiLine('owner').chips.map(chip => chip.hint || chip.label), ['Заявки гостей', 'Календарь', 'Добавить квартиру']);
  assert.equal(roleAiLine('owner').placeholder, 'Что сегодня требует внимания?');
  assert.deepEqual(roleAiLine('cleaner').chips.map(chip => chip.label), ['Задания рядом', 'Мой график']);
  assert.equal(roleAiLine('cleaner').placeholder, 'Есть уборки рядом на сегодня?');
  for (const role of ['guest', 'owner', 'cleaner']) {
    const line = roleAiLine(role);
    // About 7.5px a letter in the 16px text of a chip, 32px of padding and a border, 8px between chips, 328px of row.
    const row = line.chips.reduce((width, chip) => width + chip.label.length * 7.5 + 34, 0) + (line.chips.length - 1) * 8;
    assert.ok(row <= 328, role + ': ' + row);
    // The example for a line narrower than a 360px phone gives it is really shorter.
    if (line.shortPlaceholder) assert.ok(line.shortPlaceholder.length < line.placeholder.length - 5, role);
    for (const chip of line.chips) if (chip.href) assert.match(chip.href, new RegExp('^/workspace/' + role + '/[a-z]+(\\?new=1)?$'), chip.id);
  }
});

// A stand-in for sessionStorage of one tab.
const tab = () => {
  const values = new Map();
  return {
    values,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: key => void values.delete(key),
  };
};

test('a question for the administrator is carried between pages in the tab, never in the address', () => {
  assert.equal(administratorChatPath('owner'), '/workspace/owner/chats');
  assert.equal(aiAskKey('cleaner'), 'ai-arenda-ask:cleaner');

  const storage = tab(), at = 1_800_000_000_000;
  assert.equal(leaveAiAsk('owner', '  Что сегодня\n требует внимания? ', storage, at), true);
  // Another role of the same account does not get it.
  assert.equal(takeAiAsk('cleaner', storage, at), '');
  // Taken once: the second read, for example after a reload, finds nothing to send.
  assert.equal(takeAiAsk('owner', storage, at + 1000), 'Что сегодня требует внимания?');
  assert.equal(takeAiAsk('owner', storage, at + 2000), '');
  assert.equal(storage.values.size, 0);

  // Nothing to carry.
  assert.equal(leaveAiAsk('owner', '   ', storage, at), false);
  assert.equal(storage.values.size, 0);
  // A long text is cut the same way the line cuts it.
  leaveAiAsk('guest', 'я'.repeat(5000), storage, at);
  assert.equal(takeAiAsk('guest', storage, at).length, 2000);

  // A question left long ago is forgotten, not sent.
  leaveAiAsk('owner', 'Старый вопрос', storage, at);
  assert.equal(takeAiAsk('owner', storage, at + 31 * 60 * 1000), '');
  assert.equal(storage.values.size, 0);
  // Something else under the key (or damaged) is removed and ignored.
  for (const junk of ['not json', '"text"', '{"text":5,"at":' + at + '}', '{"text":"x"}', 'null']) {
    storage.setItem(aiAskKey('owner'), junk);
    assert.equal(takeAiAsk('owner', storage, at), '', junk);
    assert.equal(storage.values.size, 0, junk);
  }
  // No storage (switched off in the browser): nothing is kept and nothing breaks.
  assert.equal(leaveAiAsk('owner', 'Вопрос', null, at), false);
  assert.equal(takeAiAsk('owner', null, at), '');
  const broken = {getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() {}};
  assert.equal(leaveAiAsk('owner', 'Вопрос', broken, at), false);
  assert.equal(takeAiAsk('owner', broken, at), '');
});
