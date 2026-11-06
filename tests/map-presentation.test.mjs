import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {cityNearLocation,geoDistance}=await load('map-location');
const {mapSearch}=await load('map-workspace');
const {processStatus}=await load('process-status');
test('city detection stays local, recognises covered cities and does not guess far-away locations',()=>{
 assert.equal(cityNearLocation(76.95,52.287),'Павлодар');
 assert.equal(cityNearLocation(71.44,51.14),'Астана');
 for(const point of [[0,0],[37.6,55.75],[NaN,52],[181,40],[76,91]])assert.equal(cityNearLocation(...point),null);
 assert.ok(geoDistance([76.95,52.287],[76.96,52.287])<1000);
 assert.equal(processStatus('property',{display_status:{label:'Готова к заселению',tone:'good'}},'guest','g').tone,'success');
 assert.equal(processStatus('property',{display_status:{label:'На ремонте',tone:'danger'}},'owner','o').tone,'danger');
});
test('map process photos stay within the authorised process projection',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("INSERT INTO property_details(property_id,details,photos,version,revision,updated_at) VALUES (?,'{}','[\"fixture-photo\"]',1,'fixture',?) ON CONFLICT(property_id) DO UPDATE SET photos=excluded.photos").run(f.property,now());
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  const guest=await mapSearch(f.guest,'guest',{});assert.deepEqual(guest.processes.find(p=>p.id===f.booking).photos,['fixture-photo']);
  assert.equal(guest.processes.some(p=>p.kind==='job'),false);
  const other=await mapSearch(f.other,'owner',{});assert.equal(other.processes.some(p=>p.propertyId===f.property),false);
  const cleaner=await mapSearch(f.cleaner,'cleaner',{});for(const p of cleaner.processes.filter(p=>p.propertyId===f.property))assert.deepEqual(p.photos,[]);
 }finally{f.db.close();}
});
