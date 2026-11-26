import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {withAdmins,isMainAdmin}=await load('platform-admins');
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');
const {isPlatformAdmin}=await load('account');

// «Администраторы» (migration 0105): the main administrator (the secret) adds an account by its phone; the added one
// passes every check of an administrator but cannot change the list, and its removal closes its confirmed sessions.
test('the main administrator adds and removes another one by phone', async () => {
  const f = await fixture(), raw = f.db.raw;
  for (const [id, phone] of [['owner', '+77010000001'], ['guest', '+77010000002'], ['cleaner', '+77010000003']])
    raw.prepare("INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,'x','x',?)").run(id, phone, id, now());
  const secret = {PLATFORM_ADMIN_IDS: 'owner', DB: f.db};
  let env = await withAdmins(secret);
  assert.equal(env.PLATFORM_OWNER_IDS, 'owner');
  assert.equal(isPlatformAdmin('guest', env.PLATFORM_ADMIN_IDS), false);

  await assert.rejects(writePlatformAdmin(f.owner, 'admins/add', {phone: '+7 701 000 00 02'}, env), /Подтвердите/);
  await assert.rejects(writePlatformAdmin(f.owner, 'admins/add', {phone: '+7 701 000 00 09', confirmed: true}, env), /ещё нет аккаунта/);
  await assert.rejects(writePlatformAdmin(f.owner, 'admins/add', {phone: '+7 701 000 00 01', confirmed: true}, env), /главный/);
  const added = await writePlatformAdmin(f.owner, 'admins/add', {phone: '+7 701 000 00 02', confirmed: true}, env);
  assert.match(added.message, /добавлен/);
  await assert.rejects(writePlatformAdmin(f.owner, 'admins/add', {phone: '+77010000002', confirmed: true}, env), /уже администратор/);

  env = await withAdmins(secret);
  assert.equal(isPlatformAdmin('guest', env.PLATFORM_ADMIN_IDS), true);
  assert.equal(isMainAdmin('guest', env), false);
  assert.equal(isMainAdmin('owner', env), true);
  const list = await readPlatformAdmin(f.guest, 'admins', {}, env);
  assert.equal(list.canManage, false);
  assert.deepEqual(list.added.map(a => [a.userId, a.phone, a.you]), [['guest', '+7 ••• 00 02', true]]);
  // An added administrator cannot change the list, not even to add someone else.
  await assert.rejects(writePlatformAdmin(f.guest, 'admins/add', {phone: '+77010000003', confirmed: true}, env), /только главный/);
  await assert.rejects(writePlatformAdmin(f.guest, 'admins/remove', {userId: 'owner'}, env), /только главный/);

  raw.prepare("INSERT INTO admin_factor(user_id,session_hash,expires_at,created_at) VALUES ('guest','s',?,?)").run(now() + 3600, now());
  assert.match((await writePlatformAdmin(f.owner, 'admins/remove', {userId: 'guest'}, env)).message, /убран/);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM admin_factor WHERE user_id='guest'").get().n, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('admin.added','admin.removed')").get().n, 2);
  env = await withAdmins(secret);
  assert.equal(isPlatformAdmin('guest', env.PLATFORM_ADMIN_IDS), false);
  await assert.rejects(readPlatformAdmin(f.guest, 'admins', {}, env), /администратор/i);
  await assert.rejects(writePlatformAdmin(f.owner, 'admins/remove', {userId: 'guest'}, env), /уже нет/);
});

test('without the table or the database the configuration stays as it was', async () => {
  const config = {PLATFORM_ADMIN_IDS: 'a,b'};
  assert.equal(await withAdmins(config), config);
  const broken = {prepare() { return {bind() { return this; }, async all() { throw new Error('no such table'); }}; }};
  assert.deepEqual(await withAdmins(config, broken), {PLATFORM_ADMIN_IDS: 'a,b', PLATFORM_OWNER_IDS: 'a,b'});
});
