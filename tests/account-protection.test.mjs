import {test} from 'node:test';import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {fixture,load,now} from './helpers/platform.mjs';
const {savePayout,payoutOf,payoutState,applyDuePayouts,PAYOUT_HOLD}=await load('payout'),{adminFactorPassed,adminFactorState,adminFactorAction,sweepAdminFactor,adminTelegramRelinkBlocked,ADMIN_SESSION}=await load('admin-factor');

const password='owner-password-123';
function account(R,id,phone){const salt='0123456789abcdef0123456789abcdef',hash=pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex');R.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,credential_version,created_at) VALUES (?,?,?,?,?,1,?)').run(id,phone,id,`pbkdf2-sha512$100000$${salt}$${hash}`,'x',now());}

test('payout details: a change asks for the password, waits 24 hours with a notice, and can be cancelled',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  account(R,'owner','+77000000001');
  // The first details go into use at once.
  const first=await savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:'Дулат Н.'},'owner');
  assert.equal(first.pending,null);assert.equal((await payoutOf(f.db,'owner')).phone,'+77011234567');
  // Saving the same again changes nothing and needs no password.
  assert.match((await savePayout(f.owner,{phone:'87011234567',recipient:'Дулат Н.'},'owner')).message,/не изменились/);
  // Someone in the account without the password cannot redirect the money.
  await assert.rejects(savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'Мошенник'},'owner'),e=>e.status===403&&/пароль/i.test(e.message));
  await assert.rejects(savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'Мошенник',password:'wrong-password'},'owner'),e=>e.status===403&&/не подходит/.test(e.message));
  // With the password the change waits; payers still see the old details.
  const asked=await savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'Новый П.',password},'owner');
  assert.equal(asked.pending.phone,'+77779999999');assert.ok(asked.pending.until>=now()+PAYOUT_HOLD-5);
  assert.equal((await payoutOf(f.db,'owner')).phone,'+77011234567');
  assert.equal((await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking).owner_pay.phone,'+77011234567');
  const told=R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:payout:requested:%'").get();
  assert.match(told.body,/заменятся на Kaspi \+7 777 999 99 99/);assert.match(told.body,/Отменить замену/);
  assert.ok(R.prepare("SELECT 1 FROM audit_events WHERE entity_id='payout:owner' AND action LIKE '%change_requested%'").get());
  // Not yet due: nothing changes.
  assert.equal(await applyDuePayouts(f.db,now()+60),0);
  // «Отменить замену» keeps the old details.
  assert.match((await savePayout(f.owner,{action:'cancel'},'owner')).message,/отменена/);
  assert.equal((await payoutState(f.db,'owner')).pending,null);
  assert.equal(await applyDuePayouts(f.db,now()+PAYOUT_HOLD+60),0);
  // Asked again and left alone: after 24 hours the new details are in use, marked as changed for the payer.
  await savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'Новый П.',password},'owner');
  const at=now()+PAYOUT_HOLD+60;
  assert.equal(await applyDuePayouts(f.db,at),1);assert.equal(await applyDuePayouts(f.db,at),0,'applied once');
  assert.deepEqual(await payoutOf(f.db,'owner'),{phone:'+77779999999',recipient:'Новый П.',link:''});
  const pay=(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking).owner_pay;
  assert.equal(pay.changed_at,at);
  assert.ok(R.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:payout:changed:%'").get());
 }finally{f.db.close();}
});

test('payout details: five wrong passwords stop the attempts for 15 minutes',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  account(R,'owner','+77000000001');
  await savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:'Дулат Н.'},'owner');
  for(let i=0;i<5;i++)await assert.rejects(savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'X Y',password:'bad-'+i},'owner'),e=>e.status===403);
  await assert.rejects(savePayout(f.owner,{phone:'+7 777 999 99 99',recipient:'X Y',password},'owner'),e=>e.status===429,'even the right password waits');
  assert.equal((await payoutState(f.db,'owner')).pending,null);
 }finally{f.db.close();}
});

test('administrator: the management opens only after the code from Telegram, per session, for 8 hours',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const config={PLATFORM_ADMIN_IDS:'owner',TEST_DATA_ONLY:'1'},session='a'.repeat(64),other='b'.repeat(64);
  assert.equal(await adminFactorPassed(f.db,'owner',session,config),false);
  assert.equal(await adminFactorPassed(f.db,'guest',session,config),false);
  await assert.rejects(adminFactorAction(f.db,'guest',session,{action:'send'},config),e=>e.status===403);
  assert.deepEqual(await adminFactorState(f.db,'guest',session,config),{admin:false,required:false,verified:false});
  const sent=await adminFactorAction(f.db,'owner',session,{action:'send'},config);assert.match(sent.testCode,/^\d{6}$/);
  // The code is not kept anywhere the app shows, and not in clear.
  assert.equal(R.prepare('SELECT COUNT(*) n FROM notifications WHERE body LIKE ?').get('%'+sent.testCode+'%').n,0);
  assert.notEqual(R.prepare('SELECT code_hash FROM admin_factor WHERE session_hash=?').get(session).code_hash,sent.testCode);
  await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'send'},config),e=>e.status===429,'one code a minute');
  const wrong=sent.testCode==='000000'?'111111':'000000';
  await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'verify',code:wrong},config),e=>e.status===403);
  // Another session cannot use this session's code.
  await assert.rejects(adminFactorAction(f.db,'owner',other,{action:'verify',code:sent.testCode},config),e=>e.status===410);
  const ok=await adminFactorAction(f.db,'owner',session,{action:'verify',code:sent.testCode},config);
  assert.equal(ok.verified,true);assert.ok(ok.until>=now()+ADMIN_SESSION-5);
  assert.equal(await adminFactorPassed(f.db,'owner',session,config),true);
  assert.equal(await adminFactorPassed(f.db,'owner',other,config),false);
  assert.ok(R.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'admin:factor-ok:%'").get(),'the administrator is told in Telegram');
  // The code works once.
  await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'verify',code:sent.testCode},config),e=>e.status===410);
  // After 8 hours the session asks again and the row is swept.
  R.prepare('UPDATE admin_factor SET expires_at=? WHERE session_hash=?').run(now()-1,session);
  assert.equal(await adminFactorPassed(f.db,'owner',session,config),false);
  await sweepAdminFactor(f.db);assert.equal(R.prepare('SELECT COUNT(*) n FROM admin_factor').get().n,0);
  // The server setting can switch the factor off, for an administrator who lost Telegram.
  assert.equal(await adminFactorPassed(f.db,'owner',session,{...config,ADMIN_SECOND_FACTOR:'off'}),true);
 }finally{f.db.close();}
});

test('administrator: five wrong codes burn the code and warn the administrator; no Telegram, no code',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const config={PLATFORM_ADMIN_IDS:'owner',TEST_DATA_ONLY:'1'},session='c'.repeat(64);
  const sent=await adminFactorAction(f.db,'owner',session,{action:'send'},config),wrong=sent.testCode==='000000'?'111111':'000000';
  for(let i=0;i<4;i++)await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'verify',code:wrong},config),e=>e.status===403);
  await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'verify',code:wrong},config),e=>e.status===429);
  await assert.rejects(adminFactorAction(f.db,'owner',session,{action:'verify',code:sent.testCode},config),e=>e.status===410,'the right code no longer works');
  assert.ok(R.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'admin:factor-failed:%'").get());
  // Outside the test stand the code goes only to a connected Telegram chat.
  await assert.rejects(adminFactorAction(f.db,'owner','d'.repeat(64),{action:'send'},{PLATFORM_ADMIN_IDS:'owner',TELEGRAM_BOT_TOKEN:'t'}),e=>e.status===409&&/Telegram/.test(e.message));
 }finally{f.db.close();}
});

test('administrator: a new code never revives an expired confirmation, and the code chat cannot be moved without the code',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const config={PLATFORM_ADMIN_IDS:'owner',TEST_DATA_ONLY:'1'},session='e'.repeat(64);
  const sent=await adminFactorAction(f.db,'owner',session,{action:'send'},config);
  await adminFactorAction(f.db,'owner',session,{action:'verify',code:sent.testCode},config);
  // The confirmation ran out but the row is not swept yet; asking for a code must not open the management again.
  R.prepare('UPDATE admin_factor SET verified_at=?,expires_at=?,code_sent_at=? WHERE session_hash=?').run(now()-ADMIN_SESSION-10,now()-5,now()-ADMIN_SESSION-10,session);
  await adminFactorAction(f.db,'owner',session,{action:'send'},config);
  assert.equal(await adminFactorPassed(f.db,'owner',session,config),false);
  assert.equal((await adminFactorState(f.db,'owner',session,config)).verified,false);
  // A code sent near the end of a confirmation keeps the row for the code but does not lengthen the confirmation.
  const near='f'.repeat(64),s2=await adminFactorAction(f.db,'owner',near,{action:'send'},config);
  await adminFactorAction(f.db,'owner',near,{action:'verify',code:s2.testCode},config);
  R.prepare('UPDATE admin_factor SET verified_at=?,expires_at=?,code_sent_at=? WHERE session_hash=?').run(now()-ADMIN_SESSION+30,now()+30,now()-120,near);
  await adminFactorAction(f.db,'owner',near,{action:'send'},config);
  assert.ok((await adminFactorState(f.db,'owner',near,config)).until<=now()+30);
  // Linking Telegram: the first chat is open; once a chat receives the codes, only a confirmed session may link another.
  assert.equal(await adminTelegramRelinkBlocked(f.db,'owner',false,config),false);
  R.prepare("INSERT INTO delivery_channels VALUES ('owner','owner','telegram','111',0,?,?)").run(now(),now());
  assert.equal(await adminTelegramRelinkBlocked(f.db,'owner',false,config),true,'switching notices off does not free the way');
  assert.equal(await adminTelegramRelinkBlocked(f.db,'owner',true,config),false);
  assert.equal(await adminTelegramRelinkBlocked(f.db,'guest',false,config),false);
  assert.equal(await adminTelegramRelinkBlocked(f.db,'owner',false,{...config,ADMIN_SECOND_FACTOR:'off'}),false);
 }finally{f.db.close();}
});
