import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';

// The owner's rules and way of check-in are searched like amenities (lib/smart-matching.ts RULE_FEATURES).
test('a guest finds a home by its rules, check-in, deposit and floor',async()=>{
 const f=await fixture();try{
  const {previewMatches,matchingInput}=await load('smart-matching');
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const start=Math.ceil((now()+3*86400)/3600)*3600,body=extra=>({city:'Павлодар',mode:'daily',start:iso(start),end:iso(start+86400),guests:1,maxPrice:100000000,priority:'balanced',features:[],...extra});
  const ids=async extra=>(await previewMatches(f.guest,body(extra))).properties.map(p=>p.id);
  const details=patch=>{const row=f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(f.property);const d={...(row?JSON.parse(row.details):{}),...patch};
   if(row)f.db.raw.prepare('UPDATE property_details SET details=? WHERE property_id=?').run(JSON.stringify(d),f.property);else f.db.raw.prepare('INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,?,?,?)').run(f.property,JSON.stringify(d),'r1',now());};
  details({type:'apartment',floor:5,checkinMethod:'meet',smoking:false,parties:false,amenities:[]});
  assert.deepEqual(await ids({features:['smoking']}),[]);
  assert.deepEqual(await ids({features:['selfcheckin']}),[]);
  assert.deepEqual(await ids({maxFloor:3}),[]);
  // The fixture asks for a deposit of 10 000.
  assert.deepEqual(await ids({features:['nodeposit']}),[]);
  details({floor:2,checkinMethod:'lockbox',smoking:true,parties:true});
  f.db.raw.prepare('UPDATE property_policies SET deposit=0 WHERE property_id=?').run(f.property);
  assert.deepEqual(await ids({features:['smoking','parties','selfcheckin','nodeposit'],maxFloor:3}),[f.property]);
  assert.throws(()=>matchingInput(body({features:['spa']})),/удобства/);
  // Nothing free on the floor asked for: the empty answer names the floor.
  details({floor:9});
  const empty=await previewMatches(f.guest,body({maxFloor:1}));
  assert.equal(empty.empty.blocker,'maxFloor');
 }finally{f.db.close();}
});
