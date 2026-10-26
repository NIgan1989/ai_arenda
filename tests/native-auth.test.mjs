import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs/auth-test',{recursive:true});
for(const name of ['domain','native-auth'])writeFileSync(`outputs/auth-test/${name}.js`,ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './domain'","from './domain.js'"));
const {authRequest,sessionUser,normalizePhone,digest}=await import(pathToFileURL(process.cwd()+'/outputs/auth-test/native-auth.js'));
function fixture(){
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync('drizzle/0000_boring_unus.sql','utf8'));raw.exec(readFileSync('drizzle/0007_native_auth.sql','utf8'));
 const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return raw.prepare(sql).get(...values)||null;},async run(){return {meta:{changes:raw.prepare(sql).run(...values).changes}};}};},async batch(statements){raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
 const call=(action,body={},headers={})=>authRequest(db,new Request('http://localhost/api/auth/'+action,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)}),action);
 return {db,raw,call};
}
test('normalizes phone numbers and rejects malformed input',()=>{
 assert.equal(normalizePhone('8 (777) 123-45-67'),'+77771234567');assert.equal(normalizePhone('+7 777 123 45 67'),'+77771234567');
 for(const value of ['abc+77771234567','123','+00000000000'])assert.throws(()=>normalizePhone(value));
});
test('registration, password verification, session isolation, logout, recovery and replay rejection',async()=>{
 const f=fixture();try{
 const user={name:'Test User',phone:'+77771234567',password:'Long password 2026'};
 const registration=await f.call('register',user);assert.equal(registration.status,201);
 const code=(await registration.json()).recoveryCode,cookie=registration.headers.get('set-cookie');
 assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 const account=f.raw.prepare('SELECT * FROM auth_accounts').get();assert.notEqual(account.password_hash,user.password);assert.notEqual(account.recovery_hash,code);
 const profile=f.raw.prepare('SELECT * FROM profiles WHERE id=?').get(account.id);assert.deepEqual(JSON.parse(profile.roles),['guest']);assert.equal(profile.contact,user.phone);assert.equal(profile.name,user.name);
 assert.equal((await sessionUser(f.db,cookie)).userId,account.id);
 assert.equal(await sessionUser(f.db,'arenda_session='+'0'.repeat(64)),null);
 assert.equal(await sessionUser(f.db,'__sites_local_auth=1'),null);
 await assert.rejects(f.call('login',{...user,password:'Wrong password'}),e=>e.status===401);
 await assert.rejects(f.call('register',user),e=>e.status===409);
 const login=await f.call('login',{...user,phone:'8 (777) 123-45-67'}),secondCookie=login.headers.get('set-cookie');
 assert.equal(login.status,200);await f.call('logout',{}, {cookie:secondCookie});assert.equal(await sessionUser(f.db,secondCookie),null);
 await assert.rejects(f.call('recover',{...user,recoveryCode:'incorrect code'}),e=>e.status===401);
 const recovery=await f.call('recover',{...user,password:'New password 2026',recoveryCode:code});const newCode=(await recovery.json()).recoveryCode;assert.notEqual(newCode,code);
 assert.equal(await sessionUser(f.db,cookie),null);
 await assert.rejects(f.call('recover',{...user,recoveryCode:code}),e=>e.status===401);
 await assert.rejects(f.call('login',user),e=>e.status===401);
 const next=await f.call('login',{...user,password:'New password 2026'});assert.equal(next.status,200);
 const nextCookie=next.headers.get('set-cookie');f.raw.prepare('UPDATE auth_sessions SET expires_at=0').run();assert.equal(await sessionUser(f.db,nextCookie),null);
 }finally{f.raw.close();}
});
test('rejects cross-site requests, short passwords, and limits repeated guesses in the database',async()=>{
 const f=fixture();try{
 const user={phone:'+77770000000',password:'Wrong password'};
 await assert.rejects(f.call('login',user,{origin:'https://other.test'}),e=>e.status===403);
 await assert.rejects(f.call('login',user,{origin:''}),e=>e.status===403);
 await assert.rejects(f.call('register',{...user,password:'short'}),e=>e.status===400);
 for(let i=0;i<10;i++)await assert.rejects(f.call('login',user),e=>e.status===401);
 await assert.rejects(f.call('login',user),e=>e.status===429);
 assert.ok(f.raw.prepare('SELECT count(*) AS total FROM auth_attempt_limits').get().total>0);
 }finally{f.raw.close();}
});

test('login adds the base guest profile without overwriting existing roles or profile fields',async()=>{
 const f=fixture();try{
  const user={name:'Owner User',phone:'+77771112233',password:'Long password 2026'};
  await f.call('register',{...user,roles:['admin','owner'],city:'Алматы'});
  const account=f.raw.prepare('SELECT id FROM auth_accounts').get();
  assert.deepEqual(JSON.parse(f.raw.prepare('SELECT roles FROM profiles').get().roles),['guest']);
  f.raw.prepare("UPDATE profiles SET roles='[\"owner\"]',name='Saved name',city='Астана',contact='Saved contact'").run();
  await f.call('login',user);const profile=f.raw.prepare('SELECT * FROM profiles WHERE id=?').get(account.id);
  assert.deepEqual(new Set(JSON.parse(profile.roles)),new Set(['owner','guest']));assert.equal(profile.name,'Saved name');assert.equal(profile.city,'Астана');assert.equal(profile.contact,'Saved contact');
  await f.call('login',user);assert.equal(JSON.parse(f.raw.prepare('SELECT roles FROM profiles').get().roles).length,2);
 }finally{f.raw.close();}
});
