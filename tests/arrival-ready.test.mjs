import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {arrivalSteps,arrivalCodes,fitsAt,readyAt,ARRIVAL_STEP}=await load('arrival-ready');
const {previewMatches}=await load('smart-matching');
const home={id:'h',cleaning_minutes:60,policy:{},display_status:{code:'ready'}};
test('the strip steps by half an hour round the first arrival, never in the past, and keeps its steps while moving',()=>{
 const t=1_800_000_000,steps=arrivalSteps(t,null,t-3*3600);
 assert.equal(steps.length,13);assert.equal(steps[4],t);assert.ok(steps.every((v,i)=>!i||v-steps[i-1]===ARRIVAL_STEP));
 assert.deepEqual(arrivalSteps(t+3600,t,t-3*3600),steps);
 assert.ok(arrivalSteps(t,null,t-600).every(v=>v>=t-660));
 // A strange anchor (not on a step, too far) is ignored.
 assert.equal(arrivalSteps(t,t+100,t-3*3600)[4],t);
});
test('ready, «уточняем» and not free: by the stays, the cleaning and who has taken it',()=>{
 const t=1_800_000_000,n=t-3*3600,stay={property_id:'h',kind:'stay',start:t-7200,end:t-3600,until:t-3600+3600};
 // The guest before leaves an hour earlier, the cleaning (an hour) ends at the arrival: free, but nobody took the cleaning.
 assert.equal(fitsAt(home,[stay],t,7200,n),true);assert.equal(readyAt(home,[stay],t,n),false);
 const job={property_id:'h',kind:'job',start:t-3600,end:t-600,until:t-600,status:'open'};
 assert.equal(readyAt(home,[stay,job],t,n),false);assert.equal(readyAt(home,[stay,{...job,status:'assigned'}],t,n),true);
 // Nothing before the arrival: a ready home is ready, one waiting for a check is not.
 assert.equal(readyAt(home,[],t,n),true);assert.equal(readyAt({...home,display_status:{code:'inspection'}},[],t,n),false);
 // A stay right after: the home's cleaning time is kept before it.
 assert.equal(fitsAt(home,[{property_id:'h',kind:'stay',start:t+7200+1800,end:t+9*3600,until:t+10*3600}],t,7200,n),false);
 // Within the hour only a home that is ready now.
 assert.equal(fitsAt({...home,display_status:{code:'awaiting_cleaning'}},[],n+30,7200,n),false);
 assert.equal(arrivalCodes(home,[stay],[t-3600,t],7200,n),'-c');
});
test('the guest search carries the strip: a home busy at the asked time is offered from its first free step',async()=>{
 const f=await fixture();try{
  const start=now()+2*3600,body={city:'Павлодар',start:iso(start),end:iso(start+7200),guests:'1',mode:'hourly',maxPrice:'100000',priority:'balanced',features:[]};
  const r=await previewMatches(f.guest,body);
  assert.equal(r.properties.length,0);assert.equal(r.arrival.at,start);assert.equal(r.later.length,1);
  const p=r.later[0];assert.equal(p.arrival.length,r.arrival.steps.length);
  // The stay of the fixture ends in three hours, its cleaning takes ninety minutes: free from 4.5 hours on, cleaning not taken.
  assert.equal(p.arrivalFrom,start+5*ARRIVAL_STEP);assert.equal(p.arrival[r.arrival.steps.indexOf(p.arrivalFrom)],'c');assert.ok(p.estimate.amount>0);
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='assigned',assigned_to='cleaner' WHERE id=?").run(f.job.id||f.job);
  const again=await previewMatches(f.guest,{...body,start:iso(p.arrivalFrom),end:iso(p.arrivalFrom+7200),around:iso(start)});
  assert.deepEqual(again.arrival.steps,r.arrival.steps);assert.equal(again.properties.length,1);assert.equal(again.properties[0].arrival[again.arrival.steps.indexOf(p.arrivalFrom)],'r');
  // Free only before the asked arrival: still on the map, counted at its own steps.
  const ahead=now()+9*3600;f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('next',?,'guest',?,?,?,1,4000,'confirmed',0,'paid','next',?)").run(f.property,ahead,ahead+7200,ahead+7200+5400,now());
  const late=now()+7*3600,earlier=await previewMatches(f.guest,{...body,start:iso(late),end:iso(late+7200)});
  assert.equal(earlier.properties.length,0);assert.equal(earlier.later.length,1);assert.equal(earlier.later[0].arrival[earlier.arrival.steps.indexOf(late)],'-');assert.ok(earlier.later[0].arrivalFrom<late);
  // The waves of a request to owners do not need the strip.
  assert.equal((await previewMatches(f.guest,body,false)).arrival,undefined);
 }finally{f.db.close();}
});
