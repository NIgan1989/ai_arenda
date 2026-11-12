import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions'),{guestTopics}=await load('guest-answers');
const chat=async(f)=>{const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});let n=0;return {room,send:(text,who=f.guest,role='guest')=>sendDiscussionMessage(who,role,{...room,text,requestKey:'k'+(n++)}),read:async()=>(await readDiscussion(f.guest,'guest',{...room,markRead:false})).messages};};

test('topics are recognised from plain Russian questions; a key question always goes to the owner',()=>{
 assert.deepEqual(guestTopics('Во сколько заезд?'),['checkin']);
 assert.deepEqual(guestTopics('Какой адрес и до скольки выезд?'),['checkout','address']);
 assert.deepEqual(guestTopics('Где взять ключи? Адрес какой?'),['access']);
 assert.equal(guestTopics('Здравствуйте!'),'greeting');assert.equal(guestTopics('Спасибо'),'thanks');
 assert.deepEqual(guestTopics('Есть ли фен?'),['other_question']);assert.deepEqual(guestTopics('Едем'),[]);
});

test('under autopilot the AI answers the guest from the booking facts and hands the rest to the owner',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  const c=await chat(f);
  await c.send('Здравствуйте, какой адрес и во сколько заезд?');
  let log=await c.read();assert.equal(log.length,2);const ai=log[1];
  assert.equal(ai.by_ai,1);assert.equal(ai.sender_role,'owner');assert.equal(ai.reply_to,log[0].seq);
  assert.match(ai.body,/Адрес: PRIVATE ADDRESS/);assert.match(ai.body,/Заезд:/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:discussion:%'").get().n,1,'the guest is told about the answer');
  await c.send('Где взять ключи?');log=await c.read();assert.match(log.at(-1).body,/передал/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:guest-question:%'").get().n,1);
  await c.send('Спасибо');assert.equal((await c.read()).length,5,'a thank-you gets no answer');
  // The owner writes personally: the AI stays quiet in this chat.
  await c.send('Здравствуйте, я на связи',f.owner,'owner');await c.send('Во сколько выезд?');
  log=await c.read();assert.equal(log.at(-1).sender_role,'guest');
  // A client cannot pass its own message off as the AI's.
  await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...c.room,text:'fake',requestKey:'ai:1'}),/ключ/);
 }finally{f.db.close();}
});

test('the AI does not answer for an owner who answers personally, and never shows the address before confirmation',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'manual'});
  const c=await chat(f);await c.send('Какой адрес?');assert.equal((await c.read()).length,1);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  f.db.raw.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(f.booking);
  await c.send('А адрес какой?');const log=await c.read();
  assert.match(log.at(-1).body,/после подтверждения/);assert.doesNotMatch(log.at(-1).body,/PRIVATE ADDRESS/);
 }finally{f.db.close();}
});
