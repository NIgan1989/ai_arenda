import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';

const H=3600,DAY=86400;
const base=t=>({from:t-7*DAY,to:t+1,places:[{id:'a',title:'Студия'},{id:'b',title:'Баня у реки'}],arrivals:[],jobs:[],audits:[],regular:[],steps:0,plan:null});
const ai=(action)=>JSON.stringify({action,onBehalfOf:'o',propertyId:'a',policyVersion:2});

test('counts the AI\'s assignments and confirmations apart from the owner\'s own decisions',async()=>{
 const {buildAutopilotWeek}=await load('autopilot-week'),t=now(),i=base(t);
 i.audits=[
  {entity_id:'j1',actor_id:'system:rental-policy',action:ai('job.assigned'),property_id:'a'},
  {entity_id:'j1',actor_id:'system:rental-policy',action:ai('job.assigned'),property_id:'a'},
  {entity_id:'j2',actor_id:'system:dispatch',action:JSON.stringify({action:'cleaning.no_show_replacement',onBehalfOf:'o'}),property_id:'b'},
  {entity_id:'j3',actor_id:'o',action:'job.assigned',property_id:'b'},
  {entity_id:'b1',actor_id:'system:rental-policy',action:ai('booking.confirmed'),property_id:'a'},
  {entity_id:'b2',actor_id:'o',action:'booking.confirmed',property_id:'a'},
  {entity_id:'b3',actor_id:'o',action:'booking.rejected',property_id:'b'},
 ];
 i.regular=[{id:'j4',property_id:'a'},{id:'j1',property_id:'a'}];
 const w=buildAutopilotWeek(i);
 assert.equal(w.assigned,3,'j1 once, j2 replaced by the AI, j4 taken by the regular performer');
 assert.equal(w.confirmed,1);assert.equal(w.decisions,3,'the owner assigned one cleaning and decided two requests');
 const a=w.places.find(p=>p.id==='a');assert.equal(a.assigned,2);assert.equal(a.confirmed,1);assert.equal(a.decisions,1);
 assert.match(w.summary,/ИИ назначил 3 уборки, подтвердил 1 бронь/);assert.match(w.summary,/ваше решение понадобилось 3 раза/);
});

test('an arrival is ready in time when the last cleaning before it was reported by its start',async()=>{
 const {buildAutopilotWeek}=await load('autopilot-week'),t=now(),i=base(t);
 i.arrivals=[
  {id:'b1',property_id:'a',start:t-3*DAY},{id:'b2',property_id:'b',start:t-2*DAY},
  // No cleaning before it: the first guest says nothing about the autopilot.
  {id:'b3',property_id:'a',start:t-6*DAY},
  // Out of the week.
  {id:'b4',property_id:'a',start:t-9*DAY},
 ];
 i.jobs=[
  {id:'j1',property_id:'a',start:t-3*DAY-4*H,submitted_at:t-3*DAY-2*H,completed_at:t-3*DAY-H},
  // The cleaning reported 25 minutes after the guest came.
  {id:'j2',property_id:'b',start:t-2*DAY-2*H,submitted_at:t-2*DAY+25*60,completed_at:null},
  {id:'j0',property_id:'b',start:t-2*DAY-5*H,submitted_at:t-2*DAY-4*H},
 ];
 const w=buildAutopilotWeek(i);
 assert.equal(w.arrivals,2);assert.equal(w.onTime,1);
 assert.deepEqual(w.late.map(l=>[l.title,l.minutes]),[['Баня у реки',25]],'the latest cleaning before the arrival decides, not an earlier one');
 assert.match(w.summary,/к 1 из 2 заездов объект был готов вовремя/);assert.match(w.summary,/не понадобилось ни разу/);
});

test('the week label and the plan',async()=>{
 const {buildAutopilotWeek,weekLabel,weekWindow}=await load('autopilot-week');
 // 2026-11-19 20:00 in Almaty (UTC+5), a Thursday: today and the six days before it.
 const t=Date.UTC(2026,10,19,15)/1000,now7=weekWindow(t);
 assert.equal(weekLabel(now7.from,now7.to),'13–19 ноября');assert.equal(now7.to,t+1);
 // Monday 2026-11-23 10:00: the week that ended at midnight, Monday to Sunday.
 const mon=weekWindow(Date.UTC(2026,10,23,5)/1000,true);assert.equal(weekLabel(mon.from,mon.to),'16–22 ноября');
 const x=weekWindow(Date.UTC(2026,10,3,5)/1000,true);assert.equal(weekLabel(x.from,x.to),'27 октября – 2 ноября');
 const w=buildAutopilotWeek({...base(t),plan:{status:'trial',period_end:t+5*DAY,price:4900,units:2},steps:17});
 assert.deepEqual(w.plan,{status:'trial',until:t+5*DAY,price:4900,units:2});assert.equal(w.steps,17);
 assert.match(w.summary,/заездов после уборки не было/);
});

test('the loader reads only the owner\'s own things; the Monday notice carries the same numbers',async()=>{
 const f=await fixture();try{
  const {autopilotWeek}=await load('autopilot-week-db'),R=f.db.raw,t=now();
  // The fixture's owner confirmed the booking by hand.
  let w=await autopilotWeek(f.db,'owner',t);
  assert.equal(w.decisions,1);assert.equal(w.places[0].title,'Test apartment');
  // The AI assigns the cleaning on the owner's behalf.
  R.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('x1','system:rental-policy',f.job.id,JSON.stringify({action:'job.assigned',onBehalfOf:'owner',propertyId:f.property,policyVersion:1}),t-60);
  w=await autopilotWeek(f.db,'owner',t);assert.equal(w.assigned,1);
  // Another owner sees none of it.
  const other=await autopilotWeek(f.db,'other',t);assert.equal(other.assigned+other.decisions,0);assert.equal(other.places.length,0);
  // Monday after 9:00 local: the owner on a plan gets the week in a notice (and so in Telegram).
  const {sweepPlans}=await load('autopilot-plans');
  R.prepare("INSERT INTO autopilot_plans(user_id,role,status,started_at,period_end,auto_renew,version,updated_at) VALUES ('owner','owner','trial',?,?,1,1,?)").run(t,t+10*DAY,t);
  const monday=Math.floor((t+5*H)/DAY)*DAY-5*H;let at=monday;while(((Math.floor((at+5*H)/DAY)+3)%7)!==0)at+=DAY;at+=10*H;
  await sweepPlans(f.db,at);
  const n=R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:autopilot-week:%'").get();
  assert.match(n.body,/^Неделя на автопилоте: ИИ назначил \d+ уборк/);assert.match(n.body,/меню → Автопилот/);
 }finally{f.db.close();}
});
