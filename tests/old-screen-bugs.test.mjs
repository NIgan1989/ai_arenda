import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
// Three errors found on the board of old screens (2026-11-26).
const {ROOM_ITEMS,REPORT_ITEMS,reportNamesFit}=await load('cleaning-report');
const {historyOf}=await load('conversation-history');
const {canRate,rateClosed}=await load('review-window');

async function cleaningStarted(f){
 const R=f.db.raw;
 await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=R.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
 R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
 await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
}

test('a cleaning after guests goes with the room list the app shows',async()=>{
 const f=await fixture();try{
  await cleaningStarted(f);
  // Before the fix the server knew only the home-order lists and refused this one: «Чек-лист изменился».
  const done=await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:ROOM_ITEMS.map(()=>true),items:ROOM_ITEMS,report:'Убрано'});
  assert.match(done.message,/Отчёт отправлен/);
  const row=f.db.raw.prepare('SELECT status,checklist FROM cleaning_jobs WHERE id=?').get(f.job.id);
  assert.equal(row.status,'submitted');assert.deepEqual(JSON.parse(row.checklist),ROOM_ITEMS);
 }finally{f.db.close();}
});

test('a list the job does not show is still refused',async()=>{
 const f=await fixture();try{
  await cleaningStarted(f);
  const wrong=['Пыль','Пол','Окна','Двери'];
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'submit',checklist:wrong.map(()=>true),items:wrong,report:'Убрано'}),/Чек-лист изменился/);
  assert.equal(reportNamesFit('',REPORT_ITEMS),false);assert.equal(reportNamesFit('',ROOM_ITEMS),true);
 }finally{f.db.close();}
});

test('the guest can rate the day after checkout, the term is 14 days',async()=>{
 const f=await fixture();try{
  const R=f.db.raw;R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-7200,now()-600,now()+3000,f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  const b=(await f.guest.state()).bookings.find(x=>x.id===f.booking),day=now()+86400;
  assert.equal(b.status,'completed');assert.ok(b.terms.actual_checkout);
  assert.equal(canRate(b,day),true);assert.equal(rateClosed(b,day),false);
  assert.equal(rateClosed(b,now()+15*86400),true);
 }finally{f.db.close();}
});

test('opening the rules or the editor adds nothing to «История»',()=>{
 const said={id:'a',sender:'assistant',text:'Бронь подтверждена.'},user={id:'b',sender:'user',text:'привет'};
 const marked={id:'c',sender:'assistant',text:'Правила и готовность жилья.',block:'property-settings',payload:{id:'p'},screen:true};
 const legacy={id:'d',sender:'assistant',text:'Правила и готовность жилья.',block:'property-settings',payload:{id:'p'}};
 const editor={id:'e',sender:'assistant',text:'',block:'property-editor',payload:{id:'p',step:'photos'}};
 const reason={id:'f',sender:'assistant',text:'Включите автоподтверждение, чтобы ИИ отвечал сам.',block:'property-settings',payload:{id:'p'}};
 assert.deepEqual(historyOf([said,user,marked,legacy,editor,reason]).map(m=>m.id),['a','b','f']);
});

test('a completed stay with no known checkout does not say the term has passed',()=>{
 const b={status:'completed',terms:{actual_checkout:null}},t=now();
 assert.equal(canRate(b,t),false);assert.equal(rateClosed(b,t),false);
 assert.equal(rateClosed({status:'completed',terms:{actual_checkout:t-15*86400}},t),true);
 assert.equal(rateClosed({status:'completed',review_rating:5,terms:{actual_checkout:t-15*86400}},t),false);
});
