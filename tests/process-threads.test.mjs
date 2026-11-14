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
 const t=ownerThreads(unpaid,now);assert.equal(t.find(x=>x.id==='b2').yours,true);
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
});

test('время по Алматы и последнее действие ИИ за сегодня',()=>{
 assert.equal(threadWhen(now+H,now),'13:00');assert.equal(threadWhen(now+24*H,now),'завтра 12:00');
 assert.equal(lastAiMove(owner,'owner',now).text,'ИИ назначил исполнителя');assert.equal(lastAiMove({aiJournal:[{at:now-3*86400,text:'x'}]},'owner',now),null);
 const fromNotices={user:{id:'o'},bookings:[{id:'b9',title:'Студия'}],notifications:[{dedupe:'owner:administrator-checkin:b9',body:'',created_at:now-60},{dedupe:'cleaner:overdue-remind:j1',body:'',created_at:now-30}]};
 assert.deepEqual(lastAiMove(fromNotices,'owner',now),{at:now-60,text:'ИИ заселил гостя',title:'Студия'});
});
