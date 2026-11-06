import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {parseCalendar,saveCalendarSource,previewCalendarImport,commitCalendarImport,createCalendarExport,exportCalendar,importCalendar}=await load('external-calendar');
const calendar=(events)=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Contract fixtures//EN\r\n'+events.join('\r\n')+'\r\nEND:VCALENDAR\r\n';
const event=(uid,start,end,extra='')=>'BEGIN:VEVENT\r\nUID:'+uid+'\r\nDTSTART'+start+'\r\nDTEND'+end+'\r\n'+extra+'\r\nEND:VEVENT';
test('representative all-day, UTC, folded UID and transparent/cancelled ICS events have explicit availability semantics',()=>{
 const blocks=parseCalendar('\uFEFF'+calendar([event('booking-fixture',';VALUE=DATE:20261029',';VALUE=DATE:20261031'),event('airbnb-fixture-\r\n folded',':20261101T090000Z',':20261102T070000Z'),event('not-busy',':20261103T090000Z',':20261103T100000Z','TRANSP:TRANSPARENT'),event('cancelled',':20261103T090000Z',':20261103T100000Z','STATUS:CANCELLED')]));
 assert.equal(blocks.length,2);assert.equal(blocks[0].end-blocks[0].start,48*3600);assert.equal(blocks[1].uid,'airbnb-fixture-folded');assert.equal(new Date(blocks[0].start*1000).toISOString(),'2026-10-28T19:00:00.000Z');
 assert.throws(()=>parseCalendar(calendar([event('bad',':20260230T090000Z',':20260301T070000Z')])));assert.throws(()=>parseCalendar(calendar([event('recurring',':20261101T090000Z',':20261102T070000Z','RRULE:FREQ=DAILY')])));
});
test('calendar preview makes no changes; confirmation is bound to owner/file/version and retries safely',async()=>{
 const f=await fixture();try{
  const source=(await saveCalendarSource(f.owner,{propertyId:f.property,label:'Calendar',provider:'booking',externalPropertyId:'listing-17'},{})).id,text=calendar([event('one',':20261101T090000Z',':20261102T070000Z')]);
  const result=await previewCalendarImport(f.owner,{sourceId:source,ics:text});assert.equal(result.preview.added,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM external_blocks').get().n,0);
  await assert.rejects(commitCalendarImport(f.other,{previewId:result.preview.id,ics:text,confirmed:true}),e=>e.status===403);await assert.rejects(commitCalendarImport(f.owner,{previewId:result.preview.id,ics:text}),e=>e.status===400);await assert.rejects(commitCalendarImport(f.owner,{previewId:result.preview.id,ics:text.replace('UID:one','UID:changed'),confirmed:true}),e=>e.status===409);
  await commitCalendarImport(f.owner,{previewId:result.preview.id,ics:text,confirmed:true});await commitCalendarImport(f.owner,{previewId:result.preview.id,ics:text,confirmed:true});assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM external_blocks').get().n,1);
  const empty=await previewCalendarImport(f.owner,{sourceId:source,ics:calendar([])});assert.equal(empty.preview.removed,1);f.db.raw.prepare('UPDATE calendar_sources SET version=version+1 WHERE id=?').run(source);await assert.rejects(commitCalendarImport(f.owner,{previewId:empty.preview.id,ics:calendar([]),confirmed:true}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM external_blocks').get().n,1);
  const feed=await createCalendarExport(f.owner,{propertyId:f.property},{});assert.ok(feed.url.endsWith('.ics'));assert.match(await exportCalendar(f.db,feed.url.split('/').at(-1)),/BEGIN:VCALENDAR/);
 }finally{f.db.close();}
});
test('import conflicts are visible before confirmation and a source mapping cannot target another apartment twice',async()=>{
 const f=await fixture();try{
  const source=(await saveCalendarSource(f.owner,{propertyId:f.property,label:'Calendar',provider:'airbnb',externalPropertyId:'external-id'},{})).id;
  const row=f.db.raw.prepare('SELECT start,occupied_until FROM bookings WHERE id=?').get(f.booking),fmt=t=>new Date(t*1000).toISOString().replace(/[-:]/g,'').replace('.000',''),text=calendar([event('conflict',':'+fmt(row.start),':'+fmt(row.occupied_until))]);
  const preview=await previewCalendarImport(f.owner,{sourceId:source,ics:text});assert.equal(preview.preview.conflicts.length,1);assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
  await assert.rejects(saveCalendarSource(f.owner,{propertyId:f.property,label:'Duplicate',provider:'airbnb',externalPropertyId:'external-id'},{}));
 }finally{f.db.close();}
});
