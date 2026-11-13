import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {moveMediaToBucket,sweepMediaObjects,mediaKey}=await load('media-store');
const {calendarStatus}=await load('flat-calendars');
const {calendarProvider,connectCalendar,flatCalendars,saveCalendarSource,EXPORT_SECONDS,createCalendarExport}=await load('external-calendar');
const {runOperationalTick}=await load('background');

// An in-memory stand-in for the R2 binding with the calls the service uses.
function bucket(){const objects=new Map();return {objects,
 async put(key,bytes){objects.set(key,{bytes:new Uint8Array(bytes),uploaded:new Date()});},
 async get(key){const o=objects.get(key);return o?{arrayBuffer:async()=>o.bytes.buffer.slice(o.bytes.byteOffset,o.bytes.byteOffset+o.bytes.byteLength)}:null;},
 async delete(keys){for(const k of [].concat(keys))objects.delete(k);},
 async list({prefix,limit}){const all=[...objects.entries()].filter(([k])=>k.startsWith(prefix)).map(([key,o])=>({key,uploaded:o.uploaded}));return {objects:all.slice(0,limit),truncated:false};}};}
// The service strips metadata from uploads; this is the photo as stored.
async function stored(f){const m=await f.owner.uploadMedia({kind:'property',data:photo});return f.db.raw.prepare('SELECT data FROM media WHERE id=?').get(m.id).data;}

test('flat photos are written to the bucket and read back as the same data URL',async()=>{
 const f=await fixture(),r2=bucket();try{
  const up=await f.owner.uploadMedia({kind:'property',data:photo},r2),row=f.db.raw.prepare('SELECT data,object_key FROM media WHERE id=?').get(up.id);
  assert.equal(row.data,'');assert.equal(row.object_key,mediaKey(up.id));assert.ok(r2.objects.has(row.object_key));
  assert.equal((await f.owner.readMedia(up.id,'owner',r2)).data,await stored(f));
  // Avatars stay in the database: chats read them directly.
  const avatar=await f.owner.uploadMedia({kind:'avatar',data:photo},r2);assert.equal(f.db.raw.prepare('SELECT object_key FROM media WHERE id=?').get(avatar.id).object_key,'');
  // Without the binding the stored object cannot be served, and the service says so instead of sending an empty photo.
  await assert.rejects(f.owner.readMedia(up.id,'owner'),e=>e.status===503);
  await f.owner.deleteMedia(up.id,r2);assert.equal(r2.objects.size,0);
 }finally{f.db.close();}
});

test('without a binding photos stay in the database and are still served when a bucket appears later',async()=>{
 const f=await fixture(),r2=bucket();try{
  const plain=await f.owner.uploadMedia({kind:'property',data:photo}),data=f.db.raw.prepare('SELECT data FROM media WHERE id=?').get(plain.id).data;assert.match(data,/^data:image\/jpeg/);
  assert.equal((await f.owner.readMedia(plain.id,'owner',r2)).data,data);
 }finally{f.db.close();}
});

test('photos already in the database move to the bucket in the background, and orphans are swept',async()=>{
 const f=await fixture(),r2=bucket();try{
  const a=await f.owner.uploadMedia({kind:'property',data:photo}),b=await f.owner.uploadMedia({kind:'property',data:photo}),expected=f.db.raw.prepare('SELECT data FROM media WHERE id=?').get(a.id).data;
  assert.deepEqual(await moveMediaToBucket(f.db,undefined),{configured:false,moved:0});
  const moved=await moveMediaToBucket(f.db,r2,1);assert.equal(moved.moved,1);assert.equal(moved.remaining,true);
  await runOperationalTick(f.db,{BUCKET:r2});
  for(const id of [a.id,b.id]){const row=f.db.raw.prepare('SELECT data,object_key FROM media WHERE id=?').get(id);assert.equal(row.data,'');assert.equal((await f.owner.readMedia(id,'owner',r2)).data,expected);}
  // A row removed elsewhere (account erasure, old upload cleanup) leaves its object; the sweep removes it after an hour.
  f.db.raw.prepare('DELETE FROM media WHERE id=?').run(a.id);
  assert.equal((await sweepMediaObjects(f.db,r2)).removed,0);
  r2.objects.get(mediaKey(a.id)).uploaded=new Date(Date.now()-7200000);
  const swept=await sweepMediaObjects(f.db,r2);assert.equal(swept.removed,1);assert.ok(!r2.objects.has(mediaKey(a.id)));assert.ok(r2.objects.has(mediaKey(b.id)));
 }finally{f.db.close();}
});

test('the flat calendar screen connects a platform link in one step and shows its state',async()=>{
 const f=await fixture(),fetch=globalThis.fetch;try{
  assert.deepEqual(calendarProvider('https://www.airbnb.ru/calendar/ical/1.ics?s=x'),{provider:'airbnb',label:'Airbnb'});
  assert.deepEqual(calendarProvider('https://admin.booking.com/hotel/hoteladmin/ical.html?t=1'),{provider:'booking',label:'Booking.com'});
  assert.equal(calendarProvider('https://sutochno.ru/calendar/export/1.ics').label,'Суточно');
  await assert.rejects(connectCalendar(f.owner,{propertyId:f.property,url:'просто текст'},{}),/https/);
  await assert.rejects(connectCalendar(f.owner,{propertyId:f.property,url:'https://evil.example.com/a.ics'},{}),/не принимаются/);
  await assert.rejects(connectCalendar(f.other,{propertyId:f.property,url:'https://www.airbnb.ru/calendar/ical/1.ics'},{}),e=>e.status===403);
  const dt=t=>new Date(t*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),start=Math.floor(Date.now()/1000)+20*86400;
  globalThis.fetch=async()=>new Response(['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a1','DTSTART:'+dt(start),'DTEND:'+dt(start+86400),'END:VEVENT','END:VCALENDAR'].join('\r\n'),{headers:{'content-type':'text/calendar'}});
  const ok=await connectCalendar(f.owner,{propertyId:f.property,url:'webcal://www.airbnb.ru/calendar/ical/1.ics'},{});
  assert.match(ok.message,/Airbnb подключён/);assert.equal(ok.count,1);
  globalThis.fetch=async()=>new Response('nope',{status:500});
  const bad=await connectCalendar(f.owner,{propertyId:f.property,url:'https://admin.booking.com/hotel/hoteladmin/ical.html?t=1'},{});
  assert.equal(bad.failed,true);assert.match(bad.message,/не загрузился/);
  const screen=await flatCalendars(f.owner,{propertyId:f.property});
  const air=screen.sources.find(s=>s.label==='Airbnb'),booking=screen.sources.find(s=>s.label==='Booking.com');
  assert.equal(air.busy,1);assert.equal(calendarStatus(air).tone,'ok');assert.match(calendarStatus(air).text,/занято 1 период/);
  assert.equal(calendarStatus(booking).tone,'warn');assert.match(calendarStatus(booking).text,/заявки на это жильё остановлены/);
  await assert.rejects(flatCalendars(f.other,{propertyId:f.property}),e=>e.status===403);
  // The link handed to other platforms keeps working: they poll it for as long as the flat is listed.
  const feed=await createCalendarExport(f.owner,{propertyId:f.property},{});assert.ok(feed.expiresAt-Math.floor(Date.now()/1000)>=EXPORT_SECONDS-60);
  assert.equal((await flatCalendars(f.owner,{propertyId:f.property})).exportLinks,1);
 }finally{globalThis.fetch=fetch;f.db.close();}
});

test('a manual source is shown as loaded by file, an owner-set host list still applies',async()=>{
 const f=await fixture();try{
  await saveCalendarSource(f.owner,{propertyId:f.property,label:'Файл'},{});
  const s=(await flatCalendars(f.owner,{propertyId:f.property})).sources[0];assert.equal(calendarStatus(s).tone,'off');
  await assert.rejects(saveCalendarSource(f.owner,{propertyId:f.property,label:'x',url:'https://www.airbnb.ru/a.ics'},{CALENDAR_ALLOWED_HOSTS:'calendar.google.com'}),/не принимаются/);
 }finally{f.db.close();}
});
