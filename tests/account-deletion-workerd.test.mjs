import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {TestDatabase} from './helpers/platform.mjs';

test('actual Workerd D1 executes deletion preflight and the atomic erase guard without desktop SQLite assumptions',{timeout:60000},async()=>{
 // The helper prepares the real service modules and final schema, but every
 // deletion below runs inside Workerd against an isolated in-memory D1 binding.
 const fixture=new TestDatabase(),folder=resolve('outputs','deletion-workerd-'+process.pid);mkdirSync(folder,{recursive:true});
 const modules='../platform-tests-'+process.pid+'/',script=resolve(folder,'worker.mjs');
 writeFileSync(script,`
 import {RentalService} from ${JSON.stringify(modules+'service.js')};
 import {authRequest,sessionUser} from ${JSON.stringify(modules+'native-auth.js')};
 import {safetyAction} from ${JSON.stringify(modules+'account-safety.js')};
 import {accountDeletionState,accountDeletionAction} from ${JSON.stringify(modules+'account-deletion.js')};
 const credentials={phone:'+77774440001',name:'Workerd deletion fixture',password:'workerd-fixture-password'};
 const auth=(action,body,mobile=false)=>new Request('http://localhost/api/'+(mobile?'mobile/':'')+'auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(mobile?{}:{origin:'http://localhost'})},body:JSON.stringify(body)});
 export default {async fetch(request,env){try{
  const registered=await authRequest(env.DB,auth('register',credentials),'register'),cookie=registered.headers.get('set-cookie');
  const user=await sessionUser(env.DB,cookie),s=new RentalService(env.DB,user.userId);
  const login=await authRequest(env.DB,auth('login',credentials,true),'login','mobile'),{token}=await login.json();
  await safetyAction(s,'guest','deletion',{action:'request',confirmed:true});
  const state=await accountDeletionState(s,'guest');if(!state.canEraseActiveDatabase)throw Error('Unused fixture unexpectedly blocked: '+state.blockers.map(b=>b.code).join(','));
  const result=await accountDeletionAction(s,'guest',{action:'erase',requestId:state.request.id,password:credentials.password,confirmed:true,confirmation:'УДАЛИТЬ АККАУНТ'});
  const webGone=await sessionUser(env.DB,cookie)===null,mobileGone=await sessionUser(env.DB,null,'Bearer '+token)===null,profileGone=await s.profile()===null;
  const receipt=await env.DB.prepare('SELECT id FROM account_erasure_receipts WHERE id=?').bind(result.receipt.id).first();
  const next={...credentials,phone:'+77774440002'},registration=await authRequest(env.DB,auth('register',next),'register'),nextUser=await sessionUser(env.DB,registration.headers.get('set-cookie')),owner=new RentalService(env.DB,nextUser.userId);
  await owner.connectRole('owner',{});const property=(await owner.createProperty({title:'Used D1 fixture',city:'Павлодар',district:'Центр',address:'Fixture address',description:'Fixture',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
  await safetyAction(owner,'owner','deletion',{action:'request',confirmed:true});const used=await accountDeletionState(owner,'owner');let blocked=false;
  try{await accountDeletionAction(owner,'owner',{action:'erase',requestId:used.request.id,password:next.password,confirmed:true,confirmation:'УДАЛИТЬ АККАУНТ'});}catch(error){blocked=error.status===409;}
  const retained=!!await env.DB.prepare('SELECT id FROM properties WHERE id=?').bind(property).first();
  return Response.json({eligible:state.canEraseActiveDatabase,erased:result.erased,webGone,mobileGone,profileGone,receiptSaved:!!receipt,usedBlocked:blocked,usedRetained:retained});
 }catch(error){return Response.json({error:String(error.message||error)},{status:500});}}};
 `);
 const mf=new Miniflare({modules:true,modulesRoot:resolve('outputs'),modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs']}],scriptPath:script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'deletion-d1-fixture'},d1Persist:false,log:undefined});
 try{
  const db=await mf.getD1Database('DB');
  // One prepared DDL statement at a time preserves trigger bodies. Bounded
  // batches avoid relying on D1.exec's newline-splitting migration behaviour.
  const definitions=fixture.raw.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'view' THEN 3 ELSE 4 END,name").all();
  for(let i=0;i<definitions.length;i+=20)await db.batch(definitions.slice(i,i+20).map(row=>db.prepare(row.sql)));
  for(const {name} of fixture.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   for(const row of fixture.raw.prepare('SELECT * FROM '+name).all()){
    const columns=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();
   }
  }
  const response=await mf.dispatchFetch('http://localhost/test'),result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.deepEqual(result,{eligible:true,erased:true,webGone:true,mobileGone:true,profileGone:true,receiptSaved:true,usedBlocked:true,usedRetained:true});
 }finally{fixture.close();await mf.dispose();}
});
