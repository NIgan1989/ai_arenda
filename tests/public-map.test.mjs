import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {RentalService}=await load('service');
const {saveMapPoint}=await load('map-workspace');

test('anonymous map returns only current approximate points of published search results',async()=>{
 const f=await fixture();try{
  const anonymous=new RentalService(f.db,'');
  await saveMapPoint(f.owner,'owner',{propertyId:f.property,longitude:76.95123,latitude:52.28765,confirmed:true,version:0});
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  assert.equal((await anonymous.publicSearch({map:'1'})).properties.length,0);
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
  const result=await anonymous.publicSearch({map:'1',city:'Павлодар'}),p=result.properties[0];
  assert.equal(p.location.precision,'approximate');assert.equal(p.location.radius,900);
  assert.notEqual(p.location.longitude,76.95123);assert.notEqual(p.location.latitude,52.28765);
  for(const key of ['address','owner_id','contact','address_fingerprint'])assert.equal(p[key],undefined);
  for(const key of ['address','address_fingerprint','version'])assert.equal(p.location[key],undefined);
  assert.equal(result.journeys,undefined);assert.equal(result.processes,undefined);
  assert.deepEqual(result.center,[76.95,52.287]);
  assert.equal((await anonymous.publicSearch({map:'1',rooms:'20'})).properties.length,0);
  assert.equal((await anonymous.publicSearch({})).properties[0].location,undefined);
  f.db.raw.prepare('UPDATE properties SET address=? WHERE id=?').run('Changed private address',f.property);
  assert.equal((await anonymous.publicSearch({map:'1'})).properties[0].location,null);
 }finally{f.db.close();}
});

test('anonymous map checks dates and prices without allowing booking or private operations',async()=>{
 const f=await fixture();try{
  const anonymous=new RentalService(f.db,'');f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
  const filters={map:'1',mode:'hourly',start:iso(now()+3600),end:iso(now()+10800)};
  assert.equal((await anonymous.publicSearch(filters)).properties.length,0);
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE property_id=?").run(f.property);
  const available=await anonymous.publicSearch(filters);assert.equal(available.availabilityChecked,true);assert.equal(available.properties[0].estimate.amount,4000);
  await assert.rejects(anonymous.authorizeWorkspace('guest','operations'));
 }finally{f.db.close();}
});
