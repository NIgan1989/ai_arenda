import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {ownerThreads,cleanerThreads,threadsSummary,cleanerWeek,dayRibbon,lastAiMove,threadWhen}=await load('process-threads');

const now=Date.UTC(2026,10,14,7,0)/1000; // 12:00 в Алматы
const H=3600;
const owner={user:{id:'o'},ownProperties:[{id:'p1',policy:{auto_confirm:1,auto_assign:1}},{id:'p2',policy:{}}],
 bookings:[
  {id:'b1',owner_id:'o',property_id:'p1',title:'Лофт',status:'confirmed',payment_status:'owner_verified',start:now-20*H,end:now-H,created_at:now-30*H,terms:{actual_checkin:now-20*H,actual_checkout:now-H}},
  {id:'b2',owner_id:'o',property_id:'p1',title:'Студия',status:'confirmed',payment_status:'owner_verified',start:now+2*H,end:now+26*H,created_at:now-3*H,terms:{}},
  {id:'b3',owner_id:'o',property_id:'p2',title:'Дом',status:'requested',payment_status:'unpaid',start:now+5*H,end:now+8*H,created_at:now-60,expires_at:now+600,terms:{}},
  {id:'b4',owner_id:'x',property_id:'p9',title:'Чужая',status:'confirmed',start:now,end:now+H,terms:{}}],
 jobs:[{id:'j1',owner_id:'o',property_id:'p1',title:'Лофт',status:'in_progress',assigned_to:'c',checkout_confirmed:true,start:now-H,end:now+H,started_at:now-H,fee:6000,created_at:now-2*H}],
 applications:[],
 aiJournal:[{at:now-2*H,text:'ИИ назначил исполнителя',title:'Лофт',open:{kind:'job',id:'j1'}},{at:now-3*H,text:'ИИ подтвердил бронь',title:'Студия',open:{kind:'booking',id:'b2'}}]};

test('у владельца брони и уборки идут нитями, первым то, что ждёт его самого',()=>{
 const t=ownerThreads(owner,now);
 assert.deepEqual(t.map(x=>x.id),['b3','j1','b2','b1']);
 assert.equal(t[0].yours,true);assert.equal(t[0].steps[0].state,'now');assert.equal(t[0].steps[0].by,'you');
 const clean=t[1];assert.equal(clean.tag,'Уборка');assert.equal(clean.steps[0].by,'ai');assert.equal(clean.steps[2].state,'now');assert.equal(clean.status,'Уборка · 50%');
 const stay=t[2];assert.equal(stay.steps[0].by,'ai');assert.equal(stay.steps[2].state,'next');assert.equal(stay.status,'Заезд · 14:00');
 assert.equal(t[3].finished,true);assert.equal(t[3].status,'Завершено');
 assert.equal(threadsSummary('owner',t),'Ведёт 2 брони и 1 уборку · ждут вас: 1');
});

test('выезд становится текущим шагом, когда время пришло; оплату отмечает владелец',()=>{
 const due={...owner,bookings:[{id:'b5',owner_id:'o',property_id:'p1',title:'Лофт',status:'confirmed',payment_status:'owner_verified',start:now-5*H,end:now-600,created_at:now-9*H,terms:{actual_checkin:now-5*H}}],jobs:[]};
 const [b]=ownerThreads(due,now);assert.equal(b.steps[3].state,'done');assert.equal(b.steps[4].state,'now');assert.equal(b.status,'Выезд');
 const unpaid={...owner,bookings:[{...owner.bookings[1],payment_status:'unpaid'}],jobs:[{id:'j9',owner_id:'o',property_id:'p2',title:'Дом',status:'completed',assigned_to:'c',checkout_confirmed:true,start:now-3*H,end:now-H,fee:5000,created_at:now-5*H}]};
 // Гость платит владельцу напрямую: пока он не сказал «Я оплатил», владельцу проверять нечего.
 const t=ownerThreads(unpaid,now),waits=t.find(x=>x.id==='b2');
 assert.equal(waits.yours,false);assert.equal(waits.steps[1].by,'guest');assert.match(waits.line,/^Ждём перевод от гостя на ваши реквизиты/);
 // Гость сообщил о переводе: теперь шаг владельца, он проверяет банк и подтверждает.
 const told=ownerThreads({...unpaid,bookings:[{...unpaid.bookings[0],terms:{...unpaid.bookings[0].terms,payment_reported_at:now-60}}]},now).find(x=>x.id==='b2');
 assert.equal(told.yours,true);assert.equal(told.steps[1].by,'you');assert.match(told.line,/^Гость сообщил о переводе · проверьте банк и подтвердите/);
 const job=t.find(x=>x.id==='j9');assert.equal(job.yours,true);assert.equal(job.steps[4].by,'you');
 const held=ownerThreads({...unpaid,jobs:[{...unpaid.jobs[0],guarantee:'due'}]},now).find(x=>x.id==='j9');assert.equal(held.yours,false);assert.equal(held.steps[4].by,'ai');
});

test('исполнитель видит своё задание до оплаты и неделю',()=>{
 const data={user:{id:'c'},jobs:[{...owner.jobs[0]},{id:'j2',owner_id:'o',property_id:'p2',title:'Дом',status:'open',start:now+26*H,end:now+28*H,fee:5000}],applications:[{job_id:'j2',user_id:'c',status:'pending',created_at:now-60}],aiJournal:[{at:now-600,text:'Автопилот взял уборку',title:'Дом',open:{kind:'job',id:'j2'}}]};
 const t=cleanerThreads(data,now);
 assert.deepEqual(t.map(x=>x.id),['j1','j2']);
 assert.equal(t[0].yours,true);assert.equal(t[0].steps[3].state,'now');
 assert.equal(t[1].steps[0].by,'ai');assert.equal(t[1].steps[1].state,'now');assert.equal(t[1].yours,false);
 const week=cleanerWeek(data,now);assert.equal(week.length,7);assert.equal(week[0].today,true);assert.equal(week[0].count,1);assert.equal(week[0].week,'Сб');
 const later={...data,jobs:[...data.jobs,{id:'j7',owner_id:'o',property_id:'p2',title:'Дача',status:'assigned',assigned_to:'c',start:now+5*24*H,end:now+5*24*H+2*H,fee:4000}]};
 assert.equal(cleanerThreads(later,now).some(x=>x.id==='j7'),false);assert.equal(dayRibbon(cleanerThreads(later,now,true),later,week[5].key,now).bars.length,1);
 const r=dayRibbon(t,data,week[0].key,now);assert.equal(r.bars.length,1);assert.equal(r.bars[0].state,'now');assert.ok(r.now);
 // Direct pay: the customer's mark does not finish the thread; the performer confirms, even a day later.
 const told={user:{id:'c'},jobs:[{id:'j5',booking_id:null,arrived_at:now-30*H,owner_id:'o',property_id:'p',title:'Дом',status:'completed',assigned_to:'c',start:now-30*H,end:now-28*H,completed_at:now-27*H,fee:5000,settled_at:now-26*H,settlement_paid:5000}]};
 const wait=cleanerThreads(told,now)[0];assert.equal(wait.finished,false);assert.equal(wait.yours,true);assert.equal(wait.steps[5].by,'you');assert.match(wait.steps[5].note,/подтвердите, что деньги пришли/);
 assert.equal(cleanerThreads({...told,jobs:[{...told.jobs[0],payment_received_at:now-25*H}]},now).length,0,'confirmed long ago: the thread is gone');
});

test('время по Алматы и последнее действие ИИ за сегодня',()=>{
 assert.equal(threadWhen(now+H,now),'13:00');assert.equal(threadWhen(now+24*H,now),'завтра 12:00');
 assert.equal(lastAiMove(owner,'owner',now).text,'ИИ назначил исполнителя');assert.equal(lastAiMove({aiJournal:[{at:now-3*86400,text:'x'}]},'owner',now),null);
 const fromNotices={user:{id:'o'},bookings:[{id:'b9',title:'Студия'}],notifications:[{dedupe:'owner:administrator-checkin:b9',body:'',created_at:now-60},{dedupe:'cleaner:overdue-remind:j1',body:'',created_at:now-30}]};
 assert.deepEqual(lastAiMove(fromNotices,'owner',now),{at:now-60,text:'ИИ заселил гостя',title:'Студия'});
});

test('у гостя бронь идёт той же нитью: его шаги — оплата, заезд, выезд и оценка',async()=>{
 const {guestThreads,tripThread}=await load('process-threads');
 const trip=(id,patch={})=>({id,guest_id:'g',property_id:'p1',title:'Студия',status:'confirmed',payment_status:'pending',amount:20000,start:now+2*H,end:now+26*H,created_at:now-3*H,terms:{paid_amount:0},...patch});
 const pay=tripThread(trip('pay'),now,'test');
 assert.equal(pay.yours,true);assert.equal(pay.steps[1].state,'now');assert.equal(pay.status,'Оплата');assert.match(pay.line,/^Переведите оплату владельцу и нажмите «Я оплатил» → Заезд 14:00$/);
 // Гость сказал «Я оплатил»: дальше ждёт владельца, шаг не его.
 const live=tripThread(trip('live',{terms:{paid_amount:0,payment_reported_at:now}}),now);assert.equal(live.yours,false);assert.equal(live.steps[1].by,'owner');assert.match(live.line,/^Владелец проверяет перевод и подтвердит/);
 const deposit=tripThread(trip('dep',{payment_status:'owner_verified',terms:{paid_amount:20000,deposit:5000,deposit_status:'pending'}}),now,'test');
 assert.equal(deposit.yours,true);assert.match(deposit.line,/^Переведите депозит владельцу, он вернётся/);
 // Оплачено, до заезда ещё два часа: от гостя ничего не нужно; за 15 минут до заезда шаг становится его.
 const paid=trip('paid',{payment_status:'owner_verified',terms:{paid_amount:20000}});
 assert.equal(tripThread(paid,now,'test').yours,false);assert.equal(tripThread(paid,now,'test').status,'Заезд · 14:00');
 assert.equal(tripThread(paid,now+2*H-600,'test').yours,true);
 assert.equal(tripThread({...paid,terms:{paid_amount:20000,checkin_reported_at:now}},now+2*H,'test').yours,false);
 const inside=tripThread({...paid,start:now-H,end:now+H,terms:{paid_amount:20000,actual_checkin:now-H}},now,'test');
 assert.equal(inside.status,'Проживание · 50%');assert.equal(inside.yours,false);
 const leave=tripThread({...paid,start:now-5*H,end:now-600,terms:{paid_amount:20000,actual_checkin:now-5*H}},now,'test');
 assert.equal(leave.status,'Выезд');assert.equal(leave.yours,true);
 // Срок брони вышел, а заезд так и не отмечен: «Я заселился» уже недоступно, гостя ведём к выезду.
 const missed=tripThread({...paid,start:now-5*H,end:now-600},now,'test');
 assert.equal(missed.status,'Выезд');assert.equal(missed.yours,true);assert.equal(missed.steps[2].state,'done');
 assert.equal(tripThread({...paid,start:now-5*H,end:now-600,terms:{paid_amount:20000,checkout_reported_at:now-60}},now,'test').yours,false);
 const done=trip('done',{status:'completed',payment_status:'owner_verified',start:now-30*H,end:now-20*H,terms:{paid_amount:20000,actual_checkin:now-30*H,actual_checkout:now-20*H}});
 assert.equal(tripThread(done,now,'test').yours,true);assert.equal(tripThread(done,now,'test').status,'Оцените');
 const state={user:{id:'g'},bookings:[done,{...done,id:'rated',review_rating:5},trip('pay'),trip('asked',{status:'requested',start:now+50*H,end:now+60*H}),trip('other',{guest_id:'x'}),trip('off',{status:'cancelled'})]};
 const t=guestThreads(state,now,'test');
 // Оценённая бронь суточной давности ушла, чужая и отменённая не показаны; первым идёт то, что ждёт гостя.
 assert.deepEqual(t.map(x=>x.id),['pay','done','asked']);
 assert.equal(threadsSummary('guest',t),'Ваши брони: 2 · ждут вас: 2');
 assert.equal(threadsSummary('guest',[]),'Броней сейчас нет');
});
