import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions');
const {freeHours,makeStayOffer,wantedHours}=await load('stay-offers'),{pushPayload}=await load('web-push');
const H=3600,iso=t=>new Date(t*1000).toISOString();
async function ask(f,text,setMode=true){
 if(setMode)await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
 const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
 await sendDiscussionMessage(f.guest,'guest',{...room,text,requestKey:'q'+Math.random()});
 return (await readDiscussion(f.guest,'guest',{...room,markRead:false})).messages.at(-1);
}

test('the hours the guest named',()=>{
 assert.equal(wantedHours('Можно продлить на 2 часа?'),2);assert.equal(wantedHours('на пару часов'),2);assert.equal(wantedHours('продлить на часик'),1);assert.equal(wantedHours('Можно продлить?'),null);
});

test('free hours stop before the next stay and its cleaning',()=>{
 const t=1_800_000_000,stay={start:t+2*H,end:t+6*H};
 assert.equal(freeHours('late',stay,[],60,t,3),3);
 assert.equal(freeHours('late',stay,[[t+9*H,t+20*H]],60,t,3),2,'the next guest at +9 h, an hour of cleaning before');
 assert.equal(freeHours('late',stay,[[t+6.5*H,t+20*H]],60,t,3),0);
 assert.equal(freeHours('early',stay,[],60,t,3),1,'not earlier than half an hour from now, on the hour');
 assert.equal(freeHours('early',{start:t+10*H,end:t+14*H},[[t,t+8*H]],60,t,3),2,'after the previous stay and its cleaning');
});

test('the guest asks to stay longer: the AI names the price and the owner confirms the button',async()=>{
 const f=await fixture();try{
  const before=f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking);
  const reply=await ask(f,'Можно продлить выезд?');
  assert.equal(reply.sender_role,'owner');assert.match(reply.body,/Можно остаться до .* \(ещё 3 часа\), доплата 6\s000 ₸/);assert.doesNotMatch(reply.body,/Выезд: до/,'the offer replaces the usual checkout time');assert.match(reply.body,/владельцу/);
  const o=f.db.raw.prepare('SELECT * FROM stay_offers').get();assert.equal(o.kind,'late');assert.equal(o.end,before.end+3*H);assert.equal(o.extra,6000);assert.equal(o.automatic,0);
  assert.equal(f.db.raw.prepare('SELECT end FROM bookings WHERE id=?').get(f.booking).end,before.end,'nothing changes from the answer alone');
  const push=JSON.parse(pushPayload('guest',false,false,null,null,o));assert.equal(push.kind,'stay');assert.equal(push.decision.role,'guest');assert.match(push.decision.accept,/^Остаться до/);
  const card=(await f.guest.roleState('guest')).approvals.find(c=>c.kind==='stay');
  assert.ok(card);assert.equal(card.stay.extra,6000);assert.equal((await f.owner.roleState('owner')).approvals.some(c=>c.kind==='stay'),false);
  const r=await f.guest.decideApproval('guest',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/владельцу/);
  const change=f.db.raw.prepare('SELECT * FROM booking_changes').get();assert.equal(change.status,'pending');assert.equal(change.end,before.end+3*H);assert.equal(change.amount,before.amount+6000);
  // The owner confirms like any change of the stay.
  const ownerCard=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='change');
  await f.owner.decideApproval('owner',{id:ownerCard.id,revision:ownerCard.revision,action:'accept'});
  assert.equal(f.db.raw.prepare('SELECT end FROM bookings WHERE id=?').get(f.booking).end,before.end+3*H);
  await assert.rejects(f.guest.decideApproval('guest',{id:card.id,revision:card.revision,action:'accept'}),e=>e.status===409);
 }finally{f.db.close();}
});

test('under the owner\'s automatic extension rule the button applies at once',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  f.db.raw.prepare('UPDATE property_policies SET auto_extension=1,max_extension_hours=2,mandate_until=0 WHERE property_id=?').run(f.property);
  // The stay was booked under the current rules.
  f.db.raw.prepare('UPDATE booking_terms SET policy_version=(SELECT version FROM property_policies WHERE property_id=?) WHERE booking_id=?').run(f.property,f.booking);
  const before=f.db.raw.prepare('SELECT end FROM bookings WHERE id=?').get(f.booking).end;
  const reply=await ask(f,'Можно задержаться подольше?',false);assert.match(reply.body,/ещё 2 часа/,'not beyond the owner\'s limit');assert.match(reply.body,/сразу оформлю/);
  const card=(await f.guest.roleState('guest')).approvals.find(c=>c.kind==='stay');
  const r=await f.guest.decideApproval('guest',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/Готово: выезд до/);
  assert.equal(f.db.raw.prepare('SELECT end FROM bookings WHERE id=?').get(f.booking).end,before+2*H);
 }finally{f.db.close();}
});

test('a next guest right after: the AI says it is not possible; early check-in fits before the stay',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE properties SET published=1').run();
  const b=f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking),next=Math.ceil((b.occupied_until+30*60)/H)*H;
  const second=(await f.guest.createBooking({propertyId:f.property,start:iso(next),end:iso(next+3*H),guests:1,billingMode:'hourly',requestKey:'next',acceptTerms:true})).id;
  await f.owner.bookingAction(second,{action:'confirm',cleaningFee:0});
  const reply=await ask(f,'Можно продлить?');assert.match(reply.body,/не получится/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM stay_offers').get().n,0);
  // Early check-in: move the stay to tomorrow.
  const t=now(),start=Math.ceil((t+20*H)/H)*H;
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(start,start+2*H,start+2*H+90*60,f.booking);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE booking_id=?').run(start+2*H,start+2*H+90*60,f.booking);
  const {offer}=await makeStayOffer(f.guest,f.booking,'early',t);assert.equal(offer.kind,'early');assert.equal(offer.start,start-3*H);assert.equal(offer.extra,6000);
 }finally{f.db.close();}
});
