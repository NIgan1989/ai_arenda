import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TestDatabase,load,fixture} from './helpers/platform.mjs';
const {authRequest,sessionUser}=await load('native-auth');
const {legalState,legalMissing,acceptLegal,legalRequired}=await load('legal-acceptance');
const {LEGAL_EDITION}=await load('legal-documents');
const register=(body,client='web')=>new Request('http://localhost/api/'+(client==='mobile'?'mobile/':'')+'auth/register',{method:'POST',headers:{'content-type':'application/json',...(client==='web'?{origin:'http://localhost'}:{})},body:JSON.stringify(body)});
const rows=(db,user)=>db.raw.prepare('SELECT document,edition,client FROM legal_acceptances WHERE user_id=? ORDER BY document').all(user);

test('an account is created only with the agreement and the consent, and the server keeps the proof',async()=>{
 const db=new TestDatabase();try{
  const person={phone:'+77775550001',name:'Proof',password:'Proof password 2026'};
  await assert.rejects(authRequest(db,register(person),'register'),e=>e.status===400&&/соглашение/.test(e.message));
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,0);
  const web=await authRequest(db,register({...person,accept:'on'}),'register'),id=(await sessionUser(db,web.headers.get('set-cookie'))).userId;
  assert.deepEqual(rows(db,id).map(r=>[r.document,r.edition,r.client]),[['consent',LEGAL_EDITION,'web'],['terms',LEGAL_EDITION,'web']]);
  const phone=await authRequest(db,register({...person,phone:'+77775550002',accept:true},'mobile'),'register','mobile'),{user}=await phone.json();
  assert.deepEqual(rows(db,user.id).map(r=>r.client),['mobile','mobile']);
  assert.deepEqual(await legalMissing(db,id,'guest'),[]);
  assert.deepEqual(await legalMissing(db,id,'owner'),['owner']);
 }finally{db.close();}
});

test('a working role accepts its own offer; a new edition asks again; the person cannot accept for someone else',async()=>{
 const f=await fixture();try{
  assert.deepEqual(legalRequired('owner'),['terms','consent','owner']);
  assert.deepEqual(legalRequired('cleaner'),['terms','consent','cleaner']);
  assert.deepEqual(legalRequired('guest'),['terms','consent']);
  const before=await legalState(f.db,'owner','owner');
  assert.deepEqual(before.missing,['terms','consent','owner']);
  assert.equal(before.documents.find(d=>d.id==='owner').path,'/terms/owner');
  await assert.rejects(acceptLegal(f.db,'owner',{documents:['owner'],edition:'1 января 2020'},'mobile'),e=>e.status===409);
  await assert.rejects(acceptLegal(f.db,'owner',{documents:['admin'],edition:LEGAL_EDITION},'mobile'),e=>e.status===400);
  await assert.rejects(acceptLegal(f.db,'owner',{documents:[],edition:LEGAL_EDITION},'mobile'));
  const done=await acceptLegal(f.db,'owner',{documents:['terms','consent','owner','owner'],edition:LEGAL_EDITION,role:'owner',userId:'cleaner'},'mobile');
  assert.deepEqual(done.legal.missing,[]);
  assert.equal(rows(f.db,'owner').length,3);assert.equal(rows(f.db,'cleaner').length,0);
  // Accepting again changes nothing and keeps the first time.
  const first=f.db.raw.prepare("SELECT accepted_at FROM legal_acceptances WHERE user_id='owner' AND document='owner'").get().accepted_at;
  await acceptLegal(f.db,'owner',{documents:['owner'],edition:LEGAL_EDITION},'web');
  assert.equal(f.db.raw.prepare("SELECT accepted_at FROM legal_acceptances WHERE user_id='owner' AND document='owner'").get().accepted_at,first);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM audit_events WHERE actor_id='owner' AND action LIKE '%legal.accepted%'").get());
  // The owner offer does not cover the cleaner workspace.
  assert.deepEqual(await legalMissing(f.db,'owner','cleaner'),['cleaner']);
  // An older edition is history: the current one is asked for again.
  f.db.raw.prepare("UPDATE legal_acceptances SET edition='1 января 2020' WHERE user_id='owner'").run();
  assert.deepEqual(await legalMissing(f.db,'owner','owner'),['terms','consent','owner']);
 }finally{f.db.close();}
});
