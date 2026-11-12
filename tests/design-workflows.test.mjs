import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {processStatus}=await load('process-status');
test('catalog pagination, sorting and filters preserve safe public projection',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
  for(let i=0;i<4;i++){const p=await f.owner.createProperty({title:'Catalog '+i,city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Fixture',price:12000+i*1000,rooms:i+1,capacity:4,cleaningMinutes:90});f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(p.id);}
  const first=await f.guest.publicSearch({limit:'2',sort:'price-asc'}),second=await f.guest.publicSearch({limit:'2',page:'2',sort:'price-asc'});
  assert.equal(first.total,5);assert.equal(first.totalPages,3);assert.equal(first.properties.length,2);assert.ok(first.properties[1].price<=second.properties[0].price);assert.equal(new Set([...first.properties,...second.properties].map(p=>p.id)).size,4);
  for(const p of first.properties)for(const key of ['address','owner_id','contact'])assert.equal(p[key],undefined);
  const filtered=await f.guest.publicSearch({rooms:'3',minPrice:'13000',maxPrice:'15000',sort:'price-desc'});assert.equal(filtered.total,2);assert.equal(filtered.properties[0].price,15000);
  assert.equal((await f.guest.publicSearch({page:'999',limit:'2'})).page,3);
  for(const bad of [{page:'0'},{limit:'61'},{limit:'1.5'},{minPrice:'5',maxPrice:'4'},{sort:'unsafe'}])await assert.rejects(f.guest.publicSearch(bad));
  const slim=await f.guest.roleState('guest',{catalog:false});assert.deepEqual(slim.properties,[]);assert.equal(slim.bookings.length,1);assert.deepEqual(slim.jobs,[]);
 }finally{f.db.close();}
});
test('pending applications cannot display a second invitation to apply',()=>{
 const job={status:'open',assigned_to:null};assert.equal(processStatus('job',job,'cleaner','c',{status:'pending'}).label,'Отклик отправлен');assert.equal(processStatus('job',job,'cleaner','c',{status:'pending'}).bucket,'waiting');assert.equal(processStatus('job',{status:'submitted'},'owner','o').bucket,'waiting');assert.equal(processStatus('booking',{status:'cancelled'},'guest','g').bucket,'done');
});
