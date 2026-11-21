import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {saveIdentityDoc,removeIdentityDoc,listIdentityDocs,readIdentityDoc,identityQueue,decideIdentity,identityOf}=await load('identity-docs');
const {RentalService}=await load('service');

// «Удостоверение личности»: every role attaches it once; only the participant and the platform administrator see it.
test('a guest sends the first booking request only with the ID attached; only the administrator sees the photo',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("DELETE FROM identity_docs WHERE user_id='guest'").run();
  const start=now()+2*86400,request=key=>f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+3*3600),guests:1,billingMode:'hourly',requestKey:key,acceptTerms:true});
  await assert.rejects(request('no-id'),e=>e.status===409&&/удостоверения личности/.test(e.message));
  const first=await saveIdentityDoc(f.guest,{data:photo});assert.match(first.message,/только администратор/);
  await saveIdentityDoc(f.guest,{data:photo});
  await assert.rejects(saveIdentityDoc(f.guest,{data:photo}),e=>e.status===409,'front and back only');
  const docs=(await listIdentityDocs(f.guest,'')).docs;assert.equal(docs.length,2);
  await assert.rejects(readIdentityDoc(f.owner,docs[0].id),e=>e.status===404,'the owner never sees it');
  assert.match((await readIdentityDoc(new RentalService(f.db,'admin'),docs[0].id,{},true)).data,/^data:image\/jpeg/);
  await removeIdentityDoc(f.guest,{id:docs[1].id});
  assert.ok((await request('with-id')).id,'the request goes through while the check runs in the background');
 }finally{f.db.close();}
});

test('the administrator confirms the ID (photos deleted) or turns it down with a reason',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const admin=new RentalService(f.db,'admin');
  R.prepare('DELETE FROM identity_docs').run();
  await assert.rejects(decideIdentity(admin,{userId:'guest',action:'confirm',namesMatch:true}),e=>e.status===409);
  const stored=new Map(),BUCKET={put:async(k,v)=>{stored.set(k,v);},delete:async k=>{stored.delete(k);},get:async k=>stored.has(k)?{arrayBuffer:async()=>stored.get(k).buffer}:null};
  await saveIdentityDoc(f.guest,{data:photo},{BUCKET});await saveIdentityDoc(f.cleaner,{data:photo},{BUCKET});
  assert.equal(stored.size,2);
  assert.deepEqual((await identityQueue(f.db)).map(r=>r.user_id).sort(),['cleaner','guest']);
  const view=await listIdentityDocs(admin,'guest',true);assert.equal(view.names.profile,'Guest');
  await assert.rejects(decideIdentity(admin,{userId:'guest',action:'confirm'},{BUCKET}),/ФИО/);
  assert.match((await decideIdentity(admin,{userId:'guest',action:'confirm',namesMatch:true},{BUCKET})).message,/подтверждена/);
  assert.deepEqual(await identityOf(f.db,'guest'),{attached:1,checked:true});
  assert.equal(stored.size,1,'the confirmed photo left the storage');
  assert.equal(R.prepare("SELECT data||object_key v FROM identity_docs WHERE user_id='guest'").get().v,'');
  await assert.rejects(saveIdentityDoc(f.guest,{data:photo}),e=>e.status===409,'replaced only through support');
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'identity:checked:%'").get().body,/подтвердил/);
  // Turned down: the photos go, the person learns why and attaches again.
  await assert.rejects(decideIdentity(admin,{userId:'cleaner',action:'reject'},{BUCKET}),/Причина/);
  await decideIdentity(admin,{userId:'cleaner',action:'reject',reason:'Фото размыто.'},{BUCKET});
  assert.equal((await identityOf(f.db,'cleaner')).attached,0);assert.equal(stored.size,0);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND dedupe LIKE 'identity:rejected:%'").get().body,/Фото размыто/);
  assert.equal((await identityQueue(f.db)).length,0);
 }finally{f.db.close();}
});

test('an owner and a performer are approved only with the ID attached',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("DELETE FROM identity_docs WHERE user_id='cleaner'").run();
  const {decideParticipantReview}=await load('participant-security');
  R.prepare("INSERT INTO participant_reviews(id,user_id,role,status,reference,created_at) VALUES ('r-id','cleaner','cleaner','pending','x',?)").run(now());
  await assert.rejects(decideParticipantReview(new RentalService(f.db,'admin'),{id:'r-id',expectedVersion:1,status:'approved',method:'Manual',notes:'Checked in person'},true),e=>e.status===409&&/удостоверени/.test(e.message));
 }finally{f.db.close();}
});
