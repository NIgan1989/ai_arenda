import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';import {photo} from './fixtures/photo.mjs';
const {safetyAction,safetyState}=await load('account-safety'),{openDiscussion,sendDiscussionMessage,readDiscussion,discussionInbox,discussionPhoto}=await load('process-discussions'),{administratorConversation}=await load('administrator-conversation');
test('operator access is explicit, audited, scoped to one reported message, and never expands participant access',async()=>{
 const f=await fixture();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking}),sent=await sendDiscussionMessage(f.owner,'owner',{...room,text:'Reported material',photo,requestKey:'one'});
  await safetyAction(f.guest,'guest','report',{...room,kind:'message',targetId:String(sent.seq),reason:'Please review'});const report=(await safetyState(f.owner,'owner',true)).queue[0];
  await assert.rejects(safetyAction(f.owner,'owner','inspect',{reportId:report.id,reason:'Review'}),e=>e.status===403);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM moderation_access_events').get().n,0);
  await assert.rejects(safetyAction(f.owner,'owner','inspect',{reportId:report.id},true));
  const result=await safetyAction(f.owner,'owner','inspect',{reportId:report.id,reason:'Review'},true);assert.equal(result.material.body,'Reported material');assert.equal(result.material.hasPhoto,true);assert.equal(result.material.photo,undefined);
  const included=await safetyAction(f.owner,'owner','inspect',{reportId:report.id,reason:'Review attachment',includePhoto:true},true);assert.ok(included.material.photo);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM moderation_access_events').get().n,2);
  await assert.rejects(readDiscussion(f.other,'owner',room),e=>e.status===403);assert.equal((await safetyState(f.guest,'guest')).queue,undefined);
 }finally{f.db.close();}
});
test('hiding redacts message, reply preview, inbox and photo API; restoring and stale-write protection preserve business facts',async()=>{
 const f=await fixture();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking}),sent=await sendDiscussionMessage(f.owner,'owner',{...room,text:'Private original',photo,requestKey:'one'});
  await sendDiscussionMessage(f.guest,'guest',{...room,text:'Reply',replyTo:sent.seq,requestKey:'reply'});
  await safetyAction(f.guest,'guest','report',{...room,kind:'message',targetId:String(sent.seq),reason:'Review'});const report=(await safetyState(f.owner,'owner',true)).queue[0],body={reportId:report.id,reason:'Confirmed review',decision:'hide',expectedVersion:0};
  const before=f.db.raw.prepare('SELECT status,payment_status,amount FROM bookings WHERE id=?').get(f.booking);
  await safetyAction(f.owner,'owner','moderate',body,true);const messages=(await readDiscussion(f.guest,'guest',room)).messages;assert.match(messages[0].body,/скрыто/);assert.equal(messages[0].photo,0);assert.match(messages[1].reply_body,/скрыто/);await assert.rejects(discussionPhoto(f.guest,'guest',{...room,seq:sent.seq}),e=>e.status===404);
  assert.doesNotMatch(JSON.stringify(await discussionInbox(f.guest,'guest')),/Private original/);await assert.rejects(safetyAction(f.owner,'owner','moderate',body,true),e=>e.status===409);
  await safetyAction(f.owner,'owner','moderate',{...body,decision:'restore',expectedVersion:1},true);assert.equal((await readDiscussion(f.guest,'guest',room)).messages[0].body,'Private original');assert.ok((await discussionPhoto(f.guest,'guest',{...room,seq:sent.seq})).data);
  assert.deepEqual(f.db.raw.prepare('SELECT status,payment_status,amount FROM bookings WHERE id=?').get(f.booking),before);
 }finally{f.db.close();}
});
test('AI moderation hides and restores search metadata; original and operator reasons are never forwarded to the model',async()=>{
 const f=await fixture();try{
  await f.guest.chat({role:'guest',text:'Найди квартиру'});const message=(await administratorConversation(f.guest,'guest')).messages.at(-1);assert.ok(message.search);
  await safetyAction(f.guest,'guest','report',{kind:'ai',targetId:message.id,reason:'Review answer'});const report=(await safetyState(f.owner,'owner',true)).queue[0],body={reportId:report.id,reason:'Review',decision:'hide',expectedVersion:0};
  await safetyAction(f.owner,'owner','moderate',body,true);const hidden=(await administratorConversation(f.guest,'guest')).messages.at(-1);assert.match(hidden.body,/скрыт/);assert.equal(hidden.search,undefined);
  await safetyAction(f.owner,'owner','moderate',{...body,decision:'restore',expectedVersion:1},true);assert.equal((await administratorConversation(f.guest,'guest')).messages.at(-1).body,message.body);assert.ok((await administratorConversation(f.guest,'guest')).messages.at(-1).search);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,0);
 }finally{f.db.close();}
});
