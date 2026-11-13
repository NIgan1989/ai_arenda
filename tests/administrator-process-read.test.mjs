import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {readAdministratorProcesses,processReadIntent,processAnswer}=await load('administrator-process-read'),{generateAnswer}=await load('ai'),{roleAiLine}=await load('ai-line');
test('process read counts all own properties, scopes participants and reports verified payment facts without mutations',async()=>{
 const f=await fixture();try{
  for(let i=0;i<17;i++)await f.owner.createProperty({title:'Own '+i,city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90});
  await f.other.createProperty({title:'FOREIGN SECRET',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90});
  const count=f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n;
  const owner=await readAdministratorProcesses(f.owner,'owner');assert.match(owner.text,/Ваших объектов: 18/);assert.match(owner.text,/оплата не подтверждена/);assert.doesNotMatch(owner.text,/FOREIGN SECRET|PRIVATE ADDRESS/);
  const noAssignment=await readAdministratorProcesses(f.cleaner,'cleaner');assert.doesNotMatch(noAssignment.text,/Test apartment/);
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',booking_id=NULL,start=?,end=? WHERE id=?").run(now()+60,now()+3600,f.job.id);
  assert.match((await readAdministratorProcesses(f.cleaner,'cleaner')).text,/Test apartment/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n,count);
  await assert.rejects(readAdministratorProcesses(f.guest,'owner'),e=>e.status===403);
  const reply=await f.owner.chat({role:'owner',text:'Покажи мои актуальные процессы'});assert.match(reply.text,/Ваших объектов: 18/);assert.equal(reply.mode,'scenario');
 }finally{f.db.close();}
});
test('model process tool accepts no IDs from the model and returns server result instead of accompanying claims',async()=>{
 const original=globalThis.fetch;let executed=0,payload;const read=async()=>{executed++;return {text:'Актуальное состояние.'};};
 try{
  globalThis.fetch=async(_,options)=>{payload=JSON.parse(options.body);return Response.json({output:[{type:'function_call',name:'read_process_status',arguments:'{}'},{type:'message',content:[{type:'output_text',text:'Оплата проведена.'}]}]});};
  const r=await generateAnswer({OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},'Как сейчас дела?','owner',[],'fallback',{},undefined,undefined,undefined,read);assert.equal(r.text,'Актуальное состояние.');assert.equal(executed,1);assert.ok(payload.tools.some(t=>t.name==='read_process_status'));
  globalThis.fetch=async()=>Response.json({output:[{type:'function_call',name:'read_process_status',arguments:'{"userId":"other"}'}]});await generateAnswer({OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},'Статус','owner',[],'fallback',{},undefined,undefined,undefined,read);assert.equal(executed,1);
 }finally{globalThis.fetch=original;}
});

// ---------- The questions the first screen suggests ----------
test('the question each role is offered on the first screen is answered from the account data, without a model', async () => {
  const f = await fixture();
  try {
    const owner = roleAiLine('owner'), cleaner = roleAiLine('cleaner');
    for (const text of [owner.placeholder, owner.shortPlaceholder, 'Что сегодня требует внимания?', 'что требует внимания', 'Что у меня сегодня?', 'Есть что-то срочное?']) {
      assert.equal(processReadIntent(text, 'owner'), true, text);
      const reply = await f.owner.chat({role: 'owner', text});
      assert.equal(reply.mode, 'scenario', text);
      assert.equal(reply.fromAccount, true, text);
      // The fixture: a confirmed booking the owner has not checked the payment of, and its cleaning job without a cleaner.
      assert.match(reply.text, /^Требует внимания: 2\.\n/, text);
      assert.match(reply.text, /— Оплата не подтверждена: Test apartment · заезд (сегодня|завтра) в \d\d:\d\d/, text);
      assert.match(reply.text, /— На уборку нет исполнителя: Test apartment/, text);
      assert.doesNotMatch(reply.text, /Помогу подключить жильё|процесс|PRIVATE ADDRESS/, text);
      assert.equal(reply.action, 'bookings', text);
    }
    for (const text of [cleaner.placeholder, cleaner.shortPlaceholder, 'Есть уборки рядом на сегодня?', 'есть задания рядом', 'Свободные уборки', 'Мой график', 'Что у меня сегодня?']) {
      assert.equal(processReadIntent(text, 'cleaner'), true, text);
      const reply = await f.cleaner.chat({role: 'cleaner', text});
      assert.equal(reply.mode, 'scenario', text);
      assert.equal(reply.fromAccount, true, text);
      assert.match(reply.text, /^Назначенных уборок у вас сейчас нет\./, text);
      // The open job of the fixture is in the cleaner's city: counted and listed by district, time and fee, the flat is not named.
      assert.match(reply.text, /Свободных уборок в городе Павлодар: 1/, text);
      assert.match(reply.text, /— Центр · .* · 3 000 ₸/, text);
      assert.doesNotMatch(reply.text, /Test apartment|PRIVATE ADDRESS|Откройте задания по уборке|процесс/, text);
      assert.equal(reply.action, 'jobs', text);
    }
    // In another city the same job is not "nearby", and the answer says so.
    f.db.raw.prepare("UPDATE profiles SET city='Астана' WHERE id='cleaner'").run();
    assert.match((await readAdministratorProcesses(f.cleaner, 'cleaner')).text, /Рядом заданий нет: свободных уборок в городе Астана сейчас нет/);
    // An ordinary question is not marked as answered from the account.
    assert.equal((await f.owner.chat({role: 'owner', text: 'Как добавить вторую квартиру?'})).fromAccount, undefined);
  } finally {
    f.db.close();
  }
});

// 12 November 2026, 10:00 in Kazakhstan (UTC+5).
const NOW = Date.UTC(2026, 10, 12, 5, 0, 0) / 1000, HOUR = 3600;
const ownerState = (bookings = [], jobs = [], ownProperties = [{id: 'p1'}]) => ({serverTime: NOW, ownProperties, bookings, jobs});
const booking = fields => ({id: 'b' + Math.random(), owner_id: 'owner', guest_id: 'guest', title: 'Студия у набережной', status: 'confirmed',
  payment_status: 'owner_verified', start: NOW + 5 * HOUR, end: NOW + 29 * HOUR, expires_at: NOW + HOUR, terms: {}, ...fields});
const job = fields => ({id: 'j' + Math.random(), owner_id: 'owner', title: 'Студия у набережной', city: 'Павлодар', district: 'Центр',
  status: 'assigned', assigned_to: 'cleaner', fee: 4000, start: NOW + 2 * HOUR, end: NOW + 4 * HOUR, ...fields});

test('the owner is told what waits for an answer, what is planned for today, or honestly that nothing is urgent', () => {
  const ask = state => processAnswer(state, 'owner', 'owner', NOW, 'Что сегодня требует внимания?');

  assert.equal(ask(ownerState()), 'Сегодня ничего срочного: заявок, заездов и уборок нет.');
  assert.match(ask(ownerState([], [], [])), /^Сегодня ничего срочного\. Объектов у вас пока нет/);
  // Something is ahead, but not today.
  assert.equal(ask(ownerState([booking({start: NOW + 30 * HOUR, end: NOW + 54 * HOUR})])),
    'Сегодня ничего срочного. Ближайшее: заезд гостя завтра в 16:00, Студия у набережной.');

  const request = ask(ownerState([booking({status: 'requested', payment_status: 'pending', start: NOW + 30 * HOUR})]));
  assert.match(request, /^Требует внимания: 1\.\n— Заявка ждёт ответа: Студия у набережной · заезд завтра в 16:00 · ответить до сегодня в 11:00\n/);

  const day = ask(ownerState([
    booking({}),
    booking({title: 'Двушка в центре', start: NOW - 20 * HOUR, end: NOW + 2 * HOUR, terms: {actual_checkin: NOW - 19 * HOUR}}),
  ], [job({})]));
  assert.equal(day, [
    'Срочного нет. Сегодня по плану:',
    '— Выезд гостя сегодня в 12:00: Двушка в центре',
    '— Заезд гостя сегодня в 15:00: Студия у набережной',
    '— Уборка сегодня в 12:00: Студия у набережной',
    'Все действия — в карточке брони или уборки. Проверено сейчас.',
  ].join('\n'));

  const late = ask(ownerState([
    booking({start: NOW - 30 * HOUR, end: NOW - 2 * HOUR, terms: {actual_checkin: NOW - 29 * HOUR}}),
    booking({title: 'Двушка в центре', payment_status: 'pending', start: NOW - HOUR}),
  ], [job({status: 'submitted'}), job({status: 'in_progress', start: NOW - 3 * HOUR, end: NOW - HOUR})]));
  assert.match(late, /^Требует внимания: 5\./);
  assert.match(late, /— Выезд не подтверждён: Студия у набережной · гость должен был выехать сегодня в 08:00/);
  assert.match(late, /— Оплата не подтверждена: Двушка в центре · заезд сегодня в 09:00/);
  assert.match(late, /— Заселение не подтверждено: Двушка в центре · время заезда сегодня в 09:00/);
  assert.match(late, /— Отчёт об уборке ждёт проверки: Студия у набережной/);
  assert.match(late, /— Срок уборки прошёл: Студия у набережной · нужно было закончить сегодня в 09:00/);

  // Another owner's records and finished ones never appear.
  const foreign = ask(ownerState([booking({owner_id: 'other'}), booking({status: 'cancelled'}), booking({terms: {actual_checkout: NOW - HOUR}})],
    [job({owner_id: 'other'}), job({status: 'completed'})]));
  assert.equal(foreign, 'Сегодня ничего срочного: заявок, заездов и уборок нет.');
  // A question that is not about today still gets the full summary.
  assert.match(processAnswer(ownerState([booking({})]), 'owner', 'owner', NOW, 'Мои брони'), /^Ваших объектов: 1\. Броней без выезда: 1\./);
});

test('the cleaner is told about own jobs and the open jobs of the city, or honestly that there are none nearby', () => {
  const state = jobs => ({serverTime: NOW, profile: {city: 'Павлодар'}, jobs});
  const ask = jobs => processAnswer(state(jobs), 'cleaner', 'cleaner', NOW, 'Есть уборки рядом на сегодня?');

  assert.equal(ask([]), [
    'Назначенных уборок у вас сейчас нет.',
    'Рядом заданий нет: свободных уборок в городе Павлодар сейчас нет. Новые появятся в разделе «Найти задания».',
    'Проверено сейчас.',
  ].join('\n'));

  const busy = ask([
    job({}),
    job({status: 'open', assigned_to: null, title: 'SECRET FLAT', fee: 3500, start: NOW + 3 * HOUR, end: NOW + 5 * HOUR}),
    job({status: 'open', assigned_to: null, title: 'SECRET FLAT 2', district: 'Усолка', start: NOW + 30 * HOUR, end: NOW + 32 * HOUR}),
    job({status: 'open', assigned_to: null, city: 'Астана'}),
    job({status: 'open', assigned_to: null, start: NOW - 5 * HOUR, end: NOW - HOUR}),
    job({assigned_to: 'someone-else'}),
  ]);
  assert.match(busy, /^Ваши уборки: 1\.\n— Студия у набережной · .* · сегодня в 12:00\n/);
  assert.match(busy, /Свободных уборок в городе Павлодар: 2, из них сегодня: 1\./);
  assert.match(busy, /— Центр · сегодня в 13:00 · 3 500 ₸\n— Усолка · завтра в 16:00 · 4 000 ₸/);
  assert.doesNotMatch(busy, /SECRET FLAT|Астана/);
});

test('the guest is told about the stay of today or honestly that nothing is urgent', () => {
  const ask = bookings => processAnswer({serverTime: NOW, bookings}, 'guest', 'guest', NOW, 'что у меня сегодня');
  assert.equal(ask([]), 'Сегодня ничего срочного: броней и заявок нет.');
  assert.match(ask([booking({})]), /^Сегодня:\n— Заезд сегодня в 15:00: Студия у набережной\n/);
  assert.match(ask([booking({start: NOW - 30 * HOUR, end: NOW - HOUR})]), /^Требует внимания: 1\.\n— Сообщите о выезде: Студия у набережной · время выезда было сегодня в 09:00/);
  assert.doesNotMatch(ask([booking({guest_id: 'other'})]), /Студия/);
});

test('a request to do something, or to create a cleaning job, is not answered with a summary', () => {
  for (const text of ['Создай уборку на сегодня', 'Подтверди бронь', 'Отмени мою бронь', 'Оплати уборку']) {
    assert.equal(processReadIntent(text, 'owner'), false, text);
  }
  // "Nearby jobs" is a cleaner's question; an owner who needs a cleaning today is asking for something else.
  assert.equal(processReadIntent('Нужна уборка на сегодня', 'owner'), false);
  assert.equal(processReadIntent('Нужна уборка на сегодня', 'cleaner'), true);
  assert.equal(processReadIntent('Можно с собакой?', 'guest'), false);
  assert.equal(processReadIntent('Как добавить вторую квартиру?', 'owner'), false);
  assert.equal(processReadIntent('Покажи мои актуальные процессы'), true);
});
