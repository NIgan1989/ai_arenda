import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';

const DAY=86400;
const base=t=>({now:t,owner:'o',places:[{id:'a',title:'Студия',created_at:t-400*DAY},{id:'b',title:'Дом',created_at:t-400*DAY}],bookings:[],jobs:[],commissions:[],plans:[],expenses:[],reviews:[],views:[]});

test('money: revenue from sold stays, costs from cleanings, commission, plan and own expenses',async()=>{
 const {buildOwnerAnalytics}=await load('owner-analytics'),t=now(),i=base(t);
 i.bookings=[
  {id:'1',property_id:'a',guest_id:'g1',start:t-5*DAY,end:t-3*DAY,amount:30000,status:'completed',created_at:t-9*DAY},
  {id:'2',property_id:'a',guest_id:'g2',start:t-2*DAY,end:t-1*DAY,amount:15000,status:'confirmed',created_at:t-4*DAY},
  {id:'3',property_id:'b',guest_id:'g3',start:t-2*DAY,end:t-1*DAY,amount:99000,status:'cancelled',created_at:t-4*DAY},
  {id:'4',property_id:'b',guest_id:'g1',start:t-40*DAY,end:t-39*DAY,amount:20000,status:'completed',created_at:t-45*DAY},
 ];
 i.jobs=[{property_id:'a',start:t-3*DAY,fee:5000,status:'completed',assigned_to:'c'},{property_id:'a',start:t-1*DAY,fee:5000,status:'completed',assigned_to:'o'},{property_id:'b',start:t-1*DAY,fee:5000,status:'cancelled',cancel_fee:1000,assigned_to:'c'}];
 i.commissions=[{property_id:'a',amount:2250,at:t-5*DAY}];i.plans=[{period_start:t-10*DAY,amount:3000}];i.expenses=[{property_id:'b',amount:4000,created_at:t-6*DAY}];
 i.reviews=[{property_id:'a',rating:5,created_at:t-2*DAY},{property_id:'a',rating:4,created_at:t-1*DAY}];
 const r=buildOwnerAnalytics(i,'month');
 assert.equal(r.money.revenue,45000);
 // The owner's own cleaning costs nothing; a cancelled one costs its cancellation fee.
 assert.equal(r.money.cleaning,6000);assert.equal(r.money.commission,2250);assert.equal(r.money.autopilot,3000);assert.equal(r.money.other,4000);
 assert.equal(r.money.net,45000-6000-2250-3000-4000);
 assert.equal(r.stays.sold,2);assert.equal(r.stays.cancelled,1);assert.equal(r.stays.requests,3);
 assert.equal(r.stays.repeat,1,'g1 stayed before the period and came back');
 assert.equal(r.stays.rating,4.5);
 // 3 busy days of 2 places × 30 days.
 assert.equal(r.stays.occupancy,5);
 assert.equal(r.money.before.revenue,20000);assert.equal(r.money.change.revenue,125);
 assert.equal(r.places[0].id,'a');assert.equal(r.places[0].revenue,45000);
 assert.equal(r.trend.length,6);assert.equal(r.trend.reduce((s,m)=>s+m.revenue,0)>=45000,true);
 assert.ok(r.advice.length>=1&&r.advice.length<=3);
});

test('advice speaks plainly when there is nothing yet',async()=>{
 const {buildOwnerAnalytics}=await load('owner-analytics'),t=now();
 assert.match(buildOwnerAnalytics({...base(t),places:[]},'week').advice[0],/Добавьте жильё/);
 const seen={...base(t),views:[{property_id:'a',day:Math.floor((t+18000)/DAY),shown:12}]};
 assert.match(buildOwnerAnalytics(seen,'week').advice[0],/видели 12 раз/);
});

test('the owner sees only his own objects through the database',async()=>{
 const f=await fixture(),{ownerAnalytics}=await load('owner-analytics-db');
 const mine=await ownerAnalytics(f.db,'owner','week');
 assert.equal(mine.objects,1);assert.equal(mine.stays.requests,1);
 // The fixture's stay begins in an hour: it is money ahead, not yet earned.
 assert.equal(mine.money.revenue,0);assert.equal(mine.ahead.count,1);assert.ok(mine.ahead.amount>0);
 const other=await ownerAnalytics(f.db,'other','nonsense');
 assert.equal(other.period,'month');assert.equal(other.objects,0);assert.equal(other.money.revenue,0);
});
