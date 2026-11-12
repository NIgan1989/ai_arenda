import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/platform.mjs';

test('a flat without history is deleted outright, with all its settings',async()=>{
 const f=await fixture();try{
  const draft=(await f.owner.createProperty({title:'Черновик',city:'Павлодар',district:'Центр',address:'Ленина 1',description:'Draft',price:9000,rooms:1,capacity:2,cleaningMinutes:60})).id;
  await assert.rejects(f.other.removeProperty(draft),/не найдена/);
  const r=await f.owner.removeProperty(draft);assert.equal(r.removed,'deleted');
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties WHERE id=?').get(draft).n,0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_operations WHERE property_id=?').get(draft).n,0);
  await assert.rejects(f.owner.removeProperty(draft),/не найдена/);
 }finally{f.db.close();}
});

test('a flat with bookings waits for future stays, then is archived and keeps its history',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.owner.removeProperty(f.property),/будущие брони/);
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE property_id=?").run(f.property);
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE property_id=?").run(f.property);
  const r=await f.owner.removeProperty(f.property);assert.equal(r.removed,'archived');
  const row=f.db.raw.prepare('SELECT published,archived_at FROM properties WHERE id=?').get(f.property);assert.equal(row.published,0);assert.ok(row.archived_at);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings WHERE property_id=?').get(f.property).n,1);
  const state=await f.owner.state(false);assert.ok(!state.ownProperties.some(p=>p.id===f.property));
  assert.throws(()=>f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property),/property_archived/);
  await assert.rejects(f.owner.removeProperty(f.property),/не найдена/);
 }finally{f.db.close();}
});

test('a booking made after the checks stops the removal, and an archived flat takes no new bookings or cleanings',async()=>{
 const f=await fixture();try{
  const read=f.owner.one.bind(f.owner);f.owner.one=async(sql,...args)=>/COUNT\(\*\) n FROM bookings|FROM cleaning_jobs WHERE property_id=\? AND status IN/.test(sql)?null:read(sql,...args);
  await assert.rejects(f.owner.removeProperty(f.property),/появилась бронь или уборка/);
  assert.equal(f.db.raw.prepare('SELECT archived_at FROM properties WHERE id=?').get(f.property).archived_at,null);
  f.owner.one=read;
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE property_id=?").run(f.property);
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE property_id=?").run(f.property);
  assert.equal((await f.owner.removeProperty(f.property)).removed,'archived');
  assert.throws(()=>f.db.raw.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,start,end,fee,description,status,created_at) SELECT 'late',id,owner_id,1,2,0,'x','open',1 FROM properties WHERE id=?").run(f.property),/property_archived/);
 }finally{f.db.close();}
});
