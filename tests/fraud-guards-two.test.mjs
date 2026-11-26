import {test} from 'node:test';import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {fixture,load,now} from './helpers/platform.mjs';
const {RentalService}=await load('service'),{savePayout,applyDuePayouts,payChange}=await load('payout');
const {printDistance,samePhoto,photoTwins}=await load('photo-print'),{photoPrint,sweepPrints}=await load('photo-decode');
const {sweepSilence,sweepRefundHolds,REFUND_HOLD_BY}=await load('owner-silence');
const {savePilotPolicy,readPilotPolicy}=await load('pilot-governance');
const {receiptMemo,guestMemo,bankOf}=await load('payout-words');

// Step 2, point 2: the owner's details are fixed in the booking; a later change shows the guest a red warning.
test('the payout details are fixed at confirmation; a later change is shown to the guest and told to them',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  // The fixture's booking was confirmed before the owner gave any details: the first ones given are fixed in it.
  await savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:'Дулат Н.',link:''});
  assert.equal(R.prepare('SELECT phone FROM booking_payouts WHERE booking_id=?').get(f.booking).phone,'+77011234567');
  const mine=b=>b.find(x=>x.id===f.booking);
  assert.equal(mine((await f.guest.state()).bookings).pay_change,null);
  // A change waits 24 hours (PR #190); when it goes into use the guest of the confirmed booking hears of it.
  R.prepare("UPDATE payout_details SET pending_phone='+77019998877',pending_recipient='Иван П.',pending_link='',pending_role='owner',pending_until=? WHERE user_id='owner'").run(now()-1);
  assert.equal(await applyDuePayouts(f.db),1);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:payout-changed:%'").get().body,/сменил реквизиты/);
  const change=mine((await f.guest.state()).bookings).pay_change;
  assert.deepEqual({recipient:change.recipient,tail:change.tail},{recipient:'Дулат Н.',tail:'4567'});
  // The fixed details never follow the change.
  assert.equal(R.prepare('SELECT phone FROM booking_payouts WHERE booking_id=?').get(f.booking).phone,'+77011234567');
  // A booking confirmed after the change fixes the new details.
  assert.equal(payChange(null,'{}'),null);
  assert.equal(payChange(JSON.stringify({phone:'+7',recipient:'A',link:''}),JSON.stringify({phone:'+7',recipient:'A',link:''})),null);
 }finally{f.db.close();}
});

// Step 2, point 3: the same photo on homes of two owners.
function picture(seed,size=96){
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,v=Math.floor(127+120*Math.sin((x*seed+y*(7-seed))/9));data[i]=v;data[i+1]=(v*seed)%255;data[i+2]=255-v;data[i+3]=255;}
 return {data,width:size,height:size};
}
const bytes=(img,quality)=>new Uint8Array(jpeg.encode(img,quality).data);
test('a photo saved again keeps its print, another photo does not',()=>{
 const a=photoPrint(bytes(picture(2),90)),again=photoPrint(bytes(picture(2),40)),other=photoPrint(bytes(picture(5),90));
 assert.match(a,/^[0-9a-f]{16}$/);
 assert.ok(samePhoto(a,again),'recompressed: '+printDistance(a,again));
 assert.ok(!samePhoto(a,other),'another photo: '+printDistance(a,other));
 assert.equal(photoPrint(new Uint8Array([1,2,3])),'','unreadable');
 const flat={data:new Uint8Array(32*32*4).fill(200),width:32,height:32};
 assert.equal(photoPrint(bytes(flat,90)),'','one colour matches nothing');
});
test('homes of different owners sharing a photo go to the administrator',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const upload=async(service,img)=>(await service.uploadMedia({kind:'property',data:'data:image/jpeg;base64,'+Buffer.from(bytes(img,85)).toString('base64')})).id;
  const own=await upload(f.owner,picture(2)),copy=await upload(f.other,picture(2)),fresh=await upload(f.other,picture(5));
  // Printed in the background, outside the upload.
  assert.equal(R.prepare('SELECT COUNT(*) n FROM media_prints').get().n,0);
  assert.equal((await sweepPrints(f.db,undefined,[])).printed,3);
  const second=(await f.other.createProperty({title:'Copied',city:'Павлодар',district:'Центр',address:'OTHER',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const photos=(id,list)=>R.prepare("INSERT INTO property_details(property_id,details,photos,revision,updated_at) VALUES (?,'{}',?,'r',?) ON CONFLICT(property_id) DO UPDATE SET photos=excluded.photos").run(id,JSON.stringify(list),now());
  photos(f.property,[own]);photos(second,[fresh]);
  assert.deepEqual(await photoTwins(f.db,second),[]);
  photos(second,[fresh,copy]);
  const twins=await photoTwins(f.db,second);
  assert.equal(twins.length,1);assert.equal(twins[0].propertyId,f.property);assert.equal(twins[0].photoId,copy);
  // The AI check of the home waits for a person with the reason.
  const {flatChecks}=await load('admin-autocheck');
  assert.equal(flatChecks({description:'x'.repeat(100),title:'t',photos:5,mapped:true,price:1,comparable:[],duplicateAddress:false,rejectedBefore:0,openComplaints:0,twins:'Фото повторяют'}).find(c=>c.key==='photo-twins').state,'risk');
  // Shown homes are looked at in the background, once.
  R.prepare('UPDATE properties SET published=1 WHERE id=?').run(second);
  // Both homes are shown, so both are named to the administrator.
  assert.equal((await sweepPrints(f.db,undefined,['admin'])).told,2);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='admin' AND dedupe LIKE 'admin:photo-twins:%'").get().body,/Copied|Test apartment/);
  assert.equal((await sweepPrints(f.db,undefined,['admin'])).told,0);
 }finally{f.db.close();}
});

// Step 2, point 5: an owner who keeps a guest's money three days after a cancellation takes no new bookings.
test('an unreturned refund puts the owner on pause after three days; marking it lifts the pause',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  await f.owner.bookingAction(f.booking,{action:'paid'});
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  await sweepSilence(f.db,{});await sweepRefundHolds(f.db,{});
  assert.equal(R.prepare('SELECT 1 x FROM account_restrictions').get(),undefined,'not before three days');
  R.prepare("UPDATE audit_events SET created_at=? WHERE entity_id=? AND action='silence.money_seen'").run(now()-73*3600,f.booking);
  const r=await sweepRefundHolds(f.db,{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(r.held,1);
  const hold=R.prepare('SELECT * FROM account_restrictions WHERE user_id=?').get('owner');
  assert.equal(hold.kind,'hold');assert.equal(hold.created_by,REFUND_HOLD_BY);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:refund-hold:'+f.booking).body,/пауза снимется сама/);
  assert.ok(R.prepare("SELECT 1 x FROM notifications WHERE user_id='admin' AND dedupe LIKE 'admin:refund-hold:%'").get());
  // A pause put by a person is never lifted here.
  const terms=()=>R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking);
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms().version});
  assert.ok(terms().refund_recorded_at);
  assert.equal((await sweepRefundHolds(f.db,{})).lifted,1);
  assert.equal(R.prepare('SELECT 1 x FROM account_restrictions').get(),undefined);
  R.prepare("INSERT INTO account_restrictions(user_id,kind,reason,booking_id,created_by,created_at) VALUES ('owner','hold','person',NULL,'admin',?)").run(now());
  assert.equal((await sweepRefundHolds(f.db,{})).lifted,0);
 }finally{f.db.close();}
});

// Step 2, point 1: the number is confirmed by SMS once a provider is connected; before that nothing can require it.
test('a confirmed number cannot be required without SMS, and reviews need it once required',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const current=await readPilotPolicy(f.db),admin=new RentalService(f.db,'admin');
  await assert.rejects(savePilotPolicy(admin,{expectedVersion:current.version,requireOwnerReview:false,requireCleanerReview:false,requirePhone:true,confirmed:true},true,false),/SMS-провайдера/);
  const {phoneCheck,requestPhoneCode}=await load('participant-security');
  R.prepare("INSERT OR IGNORE INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES ('guest','+77010000001','Guest','x','x',?)").run(now());
  const state=await phoneCheck(f.db,'guest',{});
  assert.deepEqual({verified:state.verified,sms:state.sms,phone:state.phone},{verified:false,sms:false,phone:'+7 701 ••• 00 01'});
  await assert.rejects(requestPhoneCode(f.guest,{}),/SMS-провайдера/);
  // With a provider: the code goes through the one SMS door (lib/sms.ts).
  const real=globalThis.fetch;let sent=null;globalThis.fetch=async(url,init)=>{sent={url:String(url),body:JSON.parse(init.body)};return new Response('{}');};
  try{await requestPhoneCode(f.guest,{SMS_GATEWAY_URL:'https://sms.example/send',SMS_GATEWAY_TOKEN:'t'});}finally{globalThis.fetch=real;}
  assert.equal(sent.body.to,'+77010000001');assert.match(sent.body.text,/Никому его не сообщайте/);
  // Reviews count only from confirmed numbers once the rule is on.
  R.prepare("UPDATE pilot_policy SET require_phone=1 WHERE id='global'").run();
  R.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  R.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-3600,f.booking);
  const {saveStayReview}=await load('stay-reviews');
  await assert.rejects(saveStayReview(f.guest,{bookingId:f.booking,rating:5}),/подтвердите номер/);
  R.prepare('UPDATE phone_verifications SET verified_at=? WHERE user_id=?').run(now(),'guest');
  assert.match((await saveStayReview(f.guest,{bookingId:f.booking,rating:5})).message,/Спасибо/);
  assert.equal((await phoneCheck(f.db,'guest',{})).verified,true);
 }finally{f.db.close();}
});

// Step 2, point 4: the memos. The owner's names the bank of the details given, not Kaspi always.
test('memos: the guest is never asked for a code, the owner checks the bank of their own details',()=>{
 assert.match(guestMemo(),/никогда не просит код/);
 assert.equal(bankOf({phone:'+77011234567'}),'Kaspi');
 assert.match(receiptMemo({phone:'+77011234567'}),/пришли в Kaspi/);
 assert.equal(bankOf(null),'');
 assert.match(receiptMemo(null),/приложение вашего банка/);
});
