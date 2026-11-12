import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs',{recursive:true});
const output=mkdtempSync(resolve('outputs/mobile-session-test-'));
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
writeFileSync(output+'/session-state.js',compile('mobile/src/session-state.ts'));
const {SessionState,StaleSessionError}=await import(pathToFileURL(output+'/session-state.js'));
const origin='https://rent.company.kz',a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}

test('a slow older Keychain write cannot finish as the active session or overwrite the newest persisted account',async()=>{
 const gate=deferred(),writes=[];let stored=null;
 const session=new SessionState({read:async()=>stored,write:async value=>{writes.push(value);if(writes.length===1)await gate.promise;stored=value;}});
 const old=session.save(a,origin),oldResult=old.catch(e=>e);await Promise.resolve();const oldSnapshot=session.snapshot();assert.equal(oldSnapshot.transitioning,true);
 const latest=session.save(b,origin);assert.equal(session.snapshot().token,null);assert.equal(session.currentGeneration(),2);gate.resolve();
 assert.ok(await oldResult instanceof StaleSessionError);await latest;
 assert.equal(session.snapshot().token,b);assert.equal(JSON.parse(stored).token,b);assert.equal(writes.length,2);assert.throws(()=>session.assertCurrent(oldSnapshot),StaleSessionError);
});

test('a stale restore cannot install another account and superseded queued writes never reach storage',async()=>{
 const gate=deferred(),writes=[];let stored=JSON.stringify({origin,token:a});
 const session=new SessionState({read:async()=>{await gate.promise;return stored;},write:async value=>{writes.push(value);stored=value;}});
 const restore=session.restore(origin).catch(e=>e);await Promise.resolve();const superseded=session.save(b,origin).catch(e=>e),latest=session.save(c,origin);gate.resolve();
 assert.ok(await restore instanceof StaleSessionError);assert.ok(await superseded instanceof StaleSessionError);await latest;
 assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0]).token,c);assert.equal(session.snapshot().token,c);
});

test('restoration binds tokens to the exact API origin and persistence failure never installs a login',async()=>{
 let stored=JSON.stringify({origin:'https://other.company.kz',token:a}),fail=false;
 const session=new SessionState({read:async()=>stored,write:async value=>{if(fail)throw Error('Storage unavailable');stored=value;}});
 assert.equal(await session.restore(origin),null);stored='invalid JSON';assert.equal(await session.restore(origin),null);
 await session.save(a,origin);assert.equal(await session.restore(origin),a);
 fail=true;await assert.rejects(session.save(b,origin),/Storage unavailable/);assert.equal(session.snapshot().token,null);assert.equal(session.snapshot().transitioning,false);
 fail=false;await session.save(null,origin);assert.equal(stored,null);assert.equal(await session.restore(origin),null);
 await assert.rejects(session.save('legacy-token',origin));
});

async function apiFixture(){
 writeFileSync(output+'/platform.js',"export const Platform={OS:'web'};");
 writeFileSync(output+'/secure-store.js',"export async function getItemAsync(){throw Error('Web preview must not access Keychain');} export async function setItemAsync(){throw Error('Web preview must not access Keychain');} export async function deleteItemAsync(){throw Error('Web preview must not access Keychain');}");
 const source=compile('mobile/src/api.ts').replaceAll("from 'react-native'","from './platform.js'").replaceAll("from 'expo-secure-store'","from './secure-store.js'").replaceAll("from './session-state'","from './session-state.js'").replaceAll("from './loading'","from './loading.js'");
 writeFileSync(output+'/loading.js',compile('mobile/src/loading.ts'));
 writeFileSync(output+'/api.js',source);const previous=process.env.EXPO_PUBLIC_API_URL;process.env.EXPO_PUBLIC_API_URL=origin;
 try{return await import(pathToFileURL(output+'/api.js'));}finally{if(previous===undefined)delete process.env.EXPO_PUBLIC_API_URL;else process.env.EXPO_PUBLIC_API_URL=previous;}
}
test('old HTTP success, 401 and network failure become StaleSessionError before they can affect a new login',async()=>{
 const api=await apiFixture(),original=globalThis.fetch;try{
  for(const outcome of ['success','401','network']){
   await api.saveSession(a);api.setWorkspaceRole('guest');const gate=deferred();let headers;
   globalThis.fetch=async(_,options)=>{headers=options.headers;return gate.promise;};
   const result=api.request('/api/state').catch(e=>e);api.setWorkspaceRole('owner');await api.saveSession(b);
   if(outcome==='network')gate.reject(Error('Connection lost'));else gate.resolve(Response.json({profile:{id:'old-account'}},{status:outcome==='401'?401:200}));
   const stale=await result;assert.ok(stale instanceof api.StaleSessionError);assert.ok(!(stale instanceof api.ApiError));assert.equal(headers.Authorization,'Bearer '+a);assert.equal(headers['X-Workspace-Role'],'guest');
   globalThis.fetch=async(_,options)=>{assert.equal(options.headers.Authorization,'Bearer '+b);return Response.json({profile:{id:'new-account'}});};
   assert.equal((await api.request('/api/state')).profile.id,'new-account');
  }
 }finally{globalThis.fetch=original;await api.saveSession(null);}
});

test('current 401 remains actionable; explicit role and body idempotency key remain canonical',async()=>{
 const api=await apiFixture(),original=globalThis.fetch;try{
  await api.saveSession(a);api.setWorkspaceRole('owner');let seen;
  globalThis.fetch=async(_,options)=>{seen=options;return Response.json({saved:true});};
  await api.request('/api/bookings',{requestKey:'body-key-123'},'POST','different-header-key','guest');assert.equal(seen.headers['X-Workspace-Role'],'guest');assert.equal(seen.headers['Idempotency-Key'],'body-key-123');assert.equal(seen.credentials,'omit');assert.equal(seen.redirect,'error');
  globalThis.fetch=async()=>Response.json({error:'Session expired'},{status:401});await assert.rejects(api.request('/api/state'),e=>e instanceof api.ApiError&&e.status===401);
 }finally{globalThis.fetch=original;await api.saveSession(null);}
});
