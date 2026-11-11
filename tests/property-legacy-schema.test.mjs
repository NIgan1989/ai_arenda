import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {saveEvidence}=await load('evidence');
const {recordFinance}=await load('finance');
const legacy=f=>f.db.raw.exec("ALTER TABLE properties ADD COLUMN property_type TEXT NOT NULL DEFAULT 'apartment'; ALTER TABLE properties ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day'; ALTER TABLE bookings ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day';");
const listing={title:'Учебная квартира',city:'Павлодар',district:'Центр',address:'Синтетический адрес',description:'Учебная квартира для автоматической проверки полного процесса проживания и уборки. Это вымышленные сведения.',price:10000,rooms:1,capacity:2,cleaningMinutes:90,photos:[],published:false,expectedVersion:0,policyVersion:0,details:{type:'apartment',checkinMethod:'meet',amenities:['wifi'],area:40,beds:2,bathrooms:1,floor:2,floors:5},rental:{hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:5000,houseRules:'Учебные правила'}};

test('legacy property columns allow create, edit, publish and the full guest-owner-cleaner cycle',async()=>{
 const f=await fixture();try{
  legacy(f);
  const minimal=await f.owner.createProperty(listing);
  assert.equal(f.db.raw.prepare('SELECT property_type FROM properties WHERE id=?').get(minimal.id).property_type,'apartment');
  const draft=await f.owner.saveListing(null,listing);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(draft.id).published,0);
  const image=await f.owner.uploadMedia({kind:'property',data:photo});
  await f.owner.saveListing(draft.id,{...listing,photos:[image.id],published:true,expectedVersion:1,policyVersion:1});
  const op=f.db.raw.prepare('SELECT version FROM property_operations WHERE property_id=?').get(draft.id);
  await f.owner.readinessAction(draft.id,{readiness:'ready',expectedVersion:op.version,inspected:true,note:'Учебная проверка'});
  const body={propertyId:draft.id,start:iso(now()+3*86400),end:iso(now()+4*86400),guests:2,billingMode:'daily',requestKey:'legacy-full-cycle',acceptTerms:true};
  const quote=await f.guest.bookingQuote(body),booking=(await f.guest.createBooking({...body,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version})).id;
  await f.owner.bookingAction(booking,{action:'confirm',cleaningFee:3000});
  const job=f.db.raw.prepare('SELECT id FROM cleaning_jobs WHERE booking_id=?').get(booking);
  await f.cleaner.jobAction(job.id,{action:'apply'});
  const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(job.id);
  await f.owner.jobAction(job.id,{action:'assign',applicationId:app.id});
  // Move time only in this in-memory synthetic database.
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-60,now()+1800,now()+7200,booking);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+1800,now()+7200,job.id);
  for(const [kind,amount] of [['payment',quote.amount],['deposit',quote.policy.deposit]])await recordFinance(f.owner,{kind,bookingId:booking,amount,confirmed:true,note:'Синтетическая запись без банковского перевода',requestKey:'legacy-'+kind});
  await f.owner.bookingAction(booking,{action:'checkin'});
  await f.guest.bookingAction(booking,{action:'report_checkout'});
  await f.owner.bookingAction(booking,{action:'checkout'});
  await f.cleaner.jobAction(job.id,{action:'start'});
  for(const phase of ['before','after'])await saveEvidence(f.cleaner,{jobId:job.id,phase,data:photo});
  await f.cleaner.jobAction(job.id,{action:'submit',checklist:[true,true,true,true],report:'Учебный отчёт'});
  await f.owner.jobAction(job.id,{action:'approve'});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(booking).status,'completed');
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(job.id).status,'completed');
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(draft.id).readiness,'ready');
  assert.equal(f.db.raw.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.db.close();}
});

test('private demo creation also works with legacy property columns and remains private',async()=>{
 const f=await fixture();try{
  legacy(f);await f.other.demo();
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM properties WHERE demo_owner='other'").get().n,2);
  const search=await f.guest.publicSearch();assert.equal(search.properties.some(p=>p.demo_owner==='other'),false);
 }finally{f.db.close();}
});
