import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {openDiscussion,readDiscussion}=await load('process-discussions');
const {startCall,incomingCall,callState,answerCall,endCall,publishCall,subscribeCall,renegotiateCall,sweepCalls}=await load('chat-calls');
const {sendDiscussionMessage:sendDiscussion,readDiscussion:readRoom}=await load('process-discussions');

// A fake Cloudflare Realtime: it remembers the requests and answers like the SFU does.
function fakeRealtime(){
 const calls=[];let n=0;
 const realtimeFetch=async(url,init)=>{const body=init.body?JSON.parse(init.body):undefined;calls.push({url,method:init.method,body,auth:init.headers.Authorization});
  if(url.endsWith('/sessions/new'))return Response.json({sessionId:'s'+(++n)});
  if(url.endsWith('/tracks/new'))return Response.json(body.sessionDescription?{sessionDescription:{type:'answer',sdp:'v=0 answer'},tracks:[{mid:'0',trackName:'voice'}]}:{requiresImmediateRenegotiation:true,sessionDescription:{type:'offer',sdp:'v=0 offer'},tracks:[{mid:'1',trackName:'voice',sessionId:body.tracks[0].sessionId}]});
  if(url.endsWith('/renegotiate'))return Response.json({});
  return new Response('{}',{status:404});};
 return {calls,config:{REALTIME_APP_ID:'36991914e0adb4f6135390c128ac4772',REALTIME_APP_TOKEN:'token-token-token-token',realtimeFetch}};
}
test('a call in the app: ring, answer, voice both ways, a line in the chat, and no number',async()=>{
 const f=await fixture(),R=f.db.raw,rt=fakeRealtime();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  R.prepare("UPDATE bookings SET status='confirmed',start=?,end=?+7200,occupied_until=?+14400 WHERE id=?").run(now()+5*86400,now()+5*86400,now()+5*86400,f.booking);
  const read=await readDiscussion(f.guest,'guest',room,rt.config);assert.equal(read.call.app,true);assert.equal(read.call.phone,null);assert.equal(read.call.note,'','a confirmed booking can be called at once in the app');
  await assert.rejects(startCall(f.guest,'guest',room,{}),/не подключены/);
  const {call}=await startCall(f.guest,'guest',room,rt.config);assert.equal(call.status,'ringing');assert.equal(call.side,'caller');
  assert.equal((await startCall(f.guest,'guest',room,rt.config)).call.id,call.id,'a second tap joins the same call');
  const ring=(await incomingCall(f.owner)).call;assert.equal(ring.id,call.id);assert.equal(ring.role,'owner');
  assert.equal((await publishCall(f.guest,'guest',{callId:call.id,sdp:'v=0 mine',mid:'0'},rt.config)).sdp,'v=0 answer');
  await assert.rejects(answerCall(f.guest,'guest',{callId:call.id}),/только тот, кому звонят/);
  await assert.rejects(callState(f.other,'owner',{callId:call.id}),e=>e.status===404);
  await answerCall(f.owner,'owner',{callId:call.id});
  await assert.rejects(subscribeCall(f.guest,'guest',{callId:call.id},rt.config),/ещё подключается/);
  await publishCall(f.owner,'owner',{callId:call.id,sdp:'v=0 theirs',mid:'0'},rt.config);
  const pull=await subscribeCall(f.guest,'guest',{callId:call.id},rt.config);assert.equal(pull.sdp,'v=0 offer');assert.equal(pull.renegotiate,true);
  assert.deepEqual(rt.calls.at(-1).body.tracks,[{location:'remote',sessionId:'s2',trackName:'voice'}],'the guest receives the owner’s voice');
  await renegotiateCall(f.guest,'guest',{callId:call.id,sdp:'v=0 reply'},rt.config);
  assert.ok(rt.calls.every(c=>c.auth==='Bearer token-token-token-token'&&c.url.startsWith('https://rtc.live.cloudflare.com/v1/apps/36991914e0adb4f6135390c128ac4772/')));
  assert.equal((await callState(f.guest,'guest',{callId:call.id,audio:true})).call.connected,false,'one side hearing is not a connected call');
  assert.equal((await callState(f.owner,'owner',{callId:call.id,audio:true})).call.connected,true);
  R.prepare('UPDATE chat_calls SET answered_at=answered_at-90,caller_audio=caller_audio-75,callee_audio=callee_audio-75 WHERE id=?').run(call.id);
  assert.equal((await endCall(f.owner,'owner',{callId:call.id})).call.status,'ended');
  const line=(await readDiscussion(f.guest,'guest',room,rt.config)).messages.at(-1);assert.equal(line.call_log,1);assert.match(line.body,/^Звонок · 1:1[56]$/);assert.ok(line.audio_ms>=75000);
  assert.equal((await incomingCall(f.owner)).call,null);
 }finally{f.db.close();}
});
test('a ring nobody answers is missed, a declined one is said in the chat, and a request is not called',async()=>{
 const f=await fixture(),R=f.db.raw,rt=fakeRealtime();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  R.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(f.booking);
  await assert.rejects(startCall(f.guest,'guest',room,rt.config),/после подтверждения брони/);
  R.prepare("UPDATE bookings SET status='confirmed',start=?,end=?+7200,occupied_until=?+14400 WHERE id=?").run(now()+5*86400,now()+5*86400,now()+5*86400,f.booking);
  const first=(await startCall(f.guest,'guest',room,rt.config)).call;
  R.prepare('UPDATE chat_calls SET created_at=created_at-60 WHERE id=?').run(first.id);
  assert.equal((await incomingCall(f.owner)).call,null);assert.equal((await callState(f.guest,'guest',{callId:first.id})).call.status,'missed');
  const second=(await startCall(f.owner,'owner',room,rt.config)).call;assert.notEqual(second.id,first.id);
  assert.equal((await endCall(f.guest,'guest',{callId:second.id})).call.status,'declined');
  const bodies=(await readDiscussion(f.guest,'guest',room,rt.config)).messages.filter(m=>m.call_log).map(m=>m.body);
  assert.deepEqual(bodies,['Пропущенный звонок','Звонок отклонён']);
 }finally{f.db.close();}
});

// Audit 2026-11-22: the server ends a ring by itself, a call without voice is not a «Звонок · 0:09», and a call whose
// booking was cancelled ends at once with the reason, ringing or not.
const confirm=(f,R)=>R.prepare("UPDATE bookings SET status='confirmed',start=?,end=?+7200,occupied_until=?+14400 WHERE id=?").run(now()+5*86400,now()+5*86400,now()+5*86400,f.booking);
test('a ring nobody asks about is ended by the server: a line in the chat, unread, and a notice',async()=>{
 const f=await fixture(),R=f.db.raw,rt=fakeRealtime();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});confirm(f,R);
  const {call}=await startCall(f.guest,'guest',room,rt.config);
  assert.equal(await sweepCalls(f.db),0,'a fresh ring goes on');
  R.prepare('UPDATE chat_calls SET created_at=created_at-60 WHERE id=?').run(call.id);
  assert.equal(await sweepCalls(f.db),1);
  assert.equal(R.prepare('SELECT status FROM chat_calls WHERE id=?').get(call.id).status,'missed');
  const owner=await readDiscussion(f.owner,'owner',room,rt.config);assert.equal(owner.messages.at(-1).body,'Пропущенный звонок');
  const n=R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:missed-call:'+call.id);assert.match(n.body,/Пропущенный звонок/);
  assert.equal(await sweepCalls(f.db),0,'once');
 }finally{f.db.close();}
});
test('a call answered but never heard ends as «Связь не установлена», without a length',async()=>{
 const f=await fixture(),R=f.db.raw,rt=fakeRealtime();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});confirm(f,R);
  const {call}=await startCall(f.guest,'guest',room,rt.config);await answerCall(f.owner,'owner',{callId:call.id});
  R.prepare('UPDATE chat_calls SET answered_at=answered_at-9 WHERE id=?').run(call.id);
  const done=(await endCall(f.guest,'guest',{callId:call.id})).call;assert.equal(done.status,'ended');assert.equal(done.reason,'Связь не установлена');
  const line=(await readDiscussion(f.guest,'guest',room,rt.config)).messages.at(-1);assert.equal(line.body,'Связь не установлена');assert.equal(Number(line.audio_ms),0);
  const second=(await startCall(f.guest,'guest',room,rt.config)).call;await answerCall(f.owner,'owner',{callId:second.id});
  await callState(f.owner,'owner',{callId:second.id,audio:true});
  R.prepare('UPDATE chat_calls SET answered_at=answered_at-40,caller_seen=?,callee_seen=? WHERE id=?').run(now(),now(),second.id);
  const timed=(await callState(f.guest,'guest',{callId:second.id})).call;assert.equal(timed.status,'ended','no voice for 30 seconds ends the call');assert.equal(timed.reason,'Связь не установлена');
 }finally{f.db.close();}
});
test('a cancelled booking ends a call that is ringing or going on, and says why',async()=>{
 const f=await fixture(),R=f.db.raw,rt=fakeRealtime();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});confirm(f,R);
  const {call}=await startCall(f.guest,'guest',room,rt.config);
  R.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  await assert.rejects(answerCall(f.owner,'owner',{callId:call.id}),/Бронь уже не активна/);
  assert.equal((await incomingCall(f.owner)).call,null);
  const seen=(await callState(f.guest,'guest',{callId:call.id})).call;assert.equal(seen.status,'cancelled');assert.equal(seen.reason,'Бронь уже не активна.');
  confirm(f,R);const second=(await startCall(f.guest,'guest',room,rt.config)).call;await answerCall(f.owner,'owner',{callId:second.id});
  R.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  assert.equal(await sweepCalls(f.db),1,'the server ends it too');
  const ended=(await callState(f.owner,'owner',{callId:second.id})).call;assert.equal(ended.status,'ended');assert.equal(ended.reason,'Бронь уже не активна.');
 }finally{f.db.close();}
});
test('a point on the map closes a day after check-out; the points sent stay',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  R.prepare("UPDATE bookings SET status='completed',start=?,end=? WHERE id=?").run(now()-5*86400,now()-3*86400,f.booking);
  assert.equal((await readRoom(f.guest,'guest',room)).media.place,false);
  await assert.rejects(sendDiscussion(f.guest,'guest',{...room,place:{lat:52.28,lon:76.97},requestKey:'late'}),/до суток после выезда/);
  R.prepare("UPDATE bookings SET end=? WHERE id=?").run(now()-3600,f.booking);
  assert.equal((await readRoom(f.guest,'guest',room)).media.place,true);
  assert.equal((await sendDiscussion(f.guest,'guest',{...room,place:{lat:52.28,lon:76.97},requestKey:'soon'})).sent,true);
 }finally{f.db.close();}
});
