// The free plan of D1 allows 5 million rows read a day. On 2026-11-21 the background check read whole tables every
// minute and the limit ran out: the hot questions must go by an index, and the owner's advice is looked for once an hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';

const plan=(db,sql)=>db.raw.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join(' | ');
const HOT={
 'the last change of a cleaning':['audit_events',"SELECT MAX(created_at) FROM audit_events WHERE entity_id='x'"],
 'the places of an owner':['properties',"SELECT id FROM properties WHERE owner_id='x'"],
 'the places of a city':['properties',"SELECT id FROM properties WHERE city='x' AND published=1"],
 'the performers of a city':['profiles',"SELECT id FROM profiles WHERE city='x'"],
 'the cleanings of an owner':['cleaning_jobs',"SELECT id FROM cleaning_jobs WHERE owner_id='x' AND status='open'"],
 'the cleanings by state':['cleaning_jobs',"SELECT id FROM cleaning_jobs WHERE status='assigned' AND start<1"],
 'the bookings by state':['bookings',"SELECT id FROM bookings WHERE status='requested'"],
 'the bookings of a guest':['bookings',"SELECT id FROM bookings WHERE guest_id='x'"],
 'the notices of a person':['notifications',"SELECT id FROM notifications WHERE user_id='x' ORDER BY created_at DESC LIMIT 40"],
 'the calls still going on':['chat_calls',"SELECT id FROM chat_calls WHERE status IN ('ringing','active') ORDER BY created_at LIMIT 50"],
 'the offers of a cleaning':['cleaning_offers',"SELECT id FROM cleaning_offers WHERE job_id='x' AND status='offered'"],
};
test('the questions asked every minute go by an index, not through the whole table',async()=>{
 const {db}=await fixture();
 for(const [what,[table,sql]] of Object.entries(HOT)){const p=plan(db,sql);assert.ok(!new RegExp('SCAN '+table+'(?! USING)').test(p),what+': '+p);}
});
test('the owner hears advice once an hour; expiries and offers are checked every time',async()=>{
 const {db,release}=await fixture(),{checkAdministratorOwner,ADVICE_EVERY}=await load('administrator-runtime'),{OWNER_EVERY}=await load('background');
 assert.equal(ADVICE_EVERY,3600);assert.equal(OWNER_EVERY,120);
 const at=now(),advice=()=>db.raw.prepare("SELECT checked_at FROM administrator_runs WHERE id='advice:owner'").get()?.checked_at;
 await checkAdministratorOwner(db,'owner',at);assert.equal(advice(),at);
 release();await checkAdministratorOwner(db,'owner',at+600);assert.equal(advice(),at,'no advice ten minutes later');
 release();await checkAdministratorOwner(db,'owner',at+ADVICE_EVERY);assert.equal(advice(),at+ADVICE_EVERY,'advice again an hour later');
});
test('the background check of an owner already queued every 30 seconds moves to every two minutes',async()=>{
 const {db}=await fixture();
 assert.match(await import('node:fs').then(fs=>fs.readFileSync('drizzle/0085_read_indexes.sql','utf8')),/UPDATE background_jobs SET repeat_seconds=120 WHERE kind='owner' AND repeat_seconds=30/);
 const {runOperationalTick}=await load('background');await runOperationalTick(db,{});
 const owner=db.raw.prepare("SELECT repeat_seconds FROM background_jobs WHERE id='owner:owner'").get();assert.equal(owner?.repeat_seconds,120);
});
