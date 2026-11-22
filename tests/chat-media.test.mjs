import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {openDiscussion,readDiscussion,sendDiscussionMessage,discussionAudio,discussionInbox,voiceInput,placeInput}=await load('process-discussions');

// The chat like a messenger (2026-11-22): a point on the map and a voice message, so people keep talking in the service.
const AUDIO='data:audio/mp4;base64,'+Buffer.from('....ftypM4A sound').toString('base64');
test('a voice message and a point on the map are checked before they are kept',()=>{
 assert.deepEqual(voiceInput({data:AUDIO,ms:4200}),{data:AUDIO,ms:4200});
 assert.throws(()=>voiceInput({data:'data:image/png;base64,AAAA',ms:4000}),/не записалось/);
 assert.throws(()=>voiceInput({data:AUDIO,ms:90000}),/до одной минуты/);
 assert.equal(placeInput({lat:52.2873321,lon:76.9674123}),'{"lat":52.287332,"lon":76.967412}');
 assert.throws(()=>placeInput({lat:0,lon:0}),/точку/);assert.throws(()=>placeInput({lat:95,lon:10}),/точку/);
});
test('in a booking chat a voice message goes at once, and a point once the booking is confirmed',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3*86400,now()+3*86400,now()+3*86400,f.booking);
  let read=await readDiscussion(f.guest,'guest',room);assert.deepEqual(read.media,{place:true,voice:true});
  await sendDiscussionMessage(f.guest,'guest',{...room,voice:{data:AUDIO,ms:3000},requestKey:'v1'});
  const point=await sendDiscussionMessage(f.guest,'guest',{...room,place:{lat:52.28,lon:76.96},requestKey:'p1'});
  await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...room,place:{lat:52.28,lon:76.96},voice:{data:AUDIO,ms:3000},requestKey:'p2'}),/отдельными/);
  R.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(f.booking);
  await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...room,place:{lat:52.28,lon:76.96},requestKey:'p3'}),/после подтверждения брони/);
  R.prepare("UPDATE bookings SET status='confirmed',start=?,end=?+7200,occupied_until=?+14400 WHERE id=?").run(now()+3600,now()+3600,now()+3600,f.booking);
  read=await readDiscussion(f.owner,'owner',room);assert.deepEqual(read.media,{place:true,voice:true});
  const voice=await sendDiscussionMessage(f.owner,'owner',{...room,voice:{data:AUDIO,ms:3000},requestKey:'v2'});
  assert.equal((await sendDiscussionMessage(f.owner,'owner',{...room,voice:{data:AUDIO,ms:3000},requestKey:'v2'})).seq,voice.seq,'a repeat of the same key is the same message');
  read=await readDiscussion(f.guest,'guest',room);
  const p=read.messages.find(m=>m.seq===point.seq),v=read.messages.find(m=>m.seq===voice.seq);
  assert.deepEqual(p.place,{lat:52.28,lon:76.96});assert.equal(p.body,'Точка на карте');
  assert.equal(v.voice,1);assert.equal(v.audio_ms,3000);assert.equal(v.body,'Голосовое сообщение');assert.equal(v.audio_data,undefined,'the list does not carry the recording');
  assert.equal((await discussionAudio(f.guest,'guest',{...room,seq:voice.seq})).data,AUDIO);
  await assert.rejects(discussionAudio(f.other,'owner',{...room,seq:voice.seq}));
  assert.equal((await discussionInbox(f.guest,'guest')).rooms.find(r=>r.id===room.roomId).latest.voice,1);
 }finally{f.db.close();}
});
