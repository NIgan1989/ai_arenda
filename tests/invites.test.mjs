import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
// Приглашения и промокоды (2026-11-27): a month without the commission for both, from the first booking of the one who came.
const {inviteState,redeemInvite,friendCode,adminInvites,createPartnerCode,setPartnerCodeActive,readInviteLink,inviteLink,codeStem,normalizeInviteCode}=await load('invites');
const {accrueCommission,freshSql,sweepHallMonths,previousMonth}=await load('platform-billing');
const {RentalService}=await load('service');
const DAY=86400;
const again=async(f,at)=>{const R=f.db.raw;R.prepare('DELETE FROM platform_commissions WHERE booking_id=?').run(f.booking);await accrueCommission(f.db,f.booking,R.prepare('SELECT id FROM audit_events LIMIT 1').get().id,at).run();return R.prepare('SELECT mode FROM platform_commissions WHERE booking_id=?').get(f.booking).mode;};
// A first commission of another owner, as accrueCommission writes it on a confirmation.
const firstBooking=(f,owner,at,mode='charged')=>{const id='b-'+owner+'-'+at;f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'confirmed',0,'owner_verified',?,?)").run(id,f.property,at+DAY*400,at+DAY*400+7200,at+DAY*400+7200,id,at);return f.db.raw.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed,capacity) VALUES (?,?,?,10000,400,400,?,1,?,0,2)").run(id,owner,f.property,mode,at);};
const owner=async(f,id,name)=>{const s=new RentalService(f.db,id);await s.saveProfile({name,roles:['owner'],city:'Павлодар',contact:'test'});return s;};
const billing=f=>f.db.raw.prepare("UPDATE platform_billing SET enabled=1,starts_at=0,free_days=0,free_bookings=0 WHERE id='global'").run();

test('a friend\'s code is made once from the name; the link is read only from our site or the app',async()=>{
 assert.equal(codeStem('Дулат Ахметов'),'DULAT');assert.equal(codeStem('Әсел'),'ASEL');assert.equal(codeStem(''),'AQ');
 assert.equal(normalizeInviteCode(' dulat-482 '),'DULAT482');
 assert.equal(readInviteLink('aiarenda://invite/dulat482','https://x.kz'),'DULAT482');
 assert.equal(readInviteLink(inviteLink('https://x.kz','DULAT482'),'https://x.kz'),'DULAT482');
 for(const bad of ['https://evil.kz/i/DULAT482','https://x.kz/s/DULAT482','aiarenda://invite/a','aiarenda://invite/%E0'])assert.equal(readInviteLink(bad,'https://x.kz'),null);
 const f=await fixture();try{
  const code=await friendCode(f.db,'owner');assert.match(code,/^OWNER\d{3}$/);
  assert.equal(await friendCode(f.db,'owner'),code);
  const state=await inviteState(f.owner);assert.equal(state.code,code);assert.equal(state.days,30);
  // The fixture's owner already had a booking through the app: their own code box is closed.
  assert.equal(state.canRedeem,false);
 }finally{f.db.close();}
});

test('the one who came and the friend get 30 days from the first booking of the one who came, not from the code',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  billing(f);
  const code=await friendCode(f.db,'owner');
  await assert.rejects(redeemInvite(f.owner,{code}),/ваш код/);
  assert.equal((await inviteState(f.other)).canRedeem,true);
  const r=await redeemInvite(f.other,{code:code.toLowerCase()});assert.match(r.message,/30 дней/);
  assert.equal(r.state.came.by,'Owner');assert.equal(r.state.canRedeem,false);
  await assert.rejects(redeemInvite(f.other,{code}),/один раз/);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe='owner:invite:other'").get().body,/месяц без комиссии/);
  // A code alone gives nothing: the friend still pays until the one who came has a booking.
  const t=now();
  assert.equal(await again(f,t),'charged');
  assert.equal((await inviteState(f.owner)).friends[0].state,'waiting');
  // The one who came has a pending month: their first booking is already free.
  assert.equal(R.prepare(`SELECT ${freshSql("'other'",'?')} f`).get(t).f,1);
  firstBooking(f,'other',t);
  const days=R.prepare("SELECT user_id,starts_at FROM invite_bonuses ORDER BY user_id").all();
  assert.deepEqual(days.map(d=>[d.user_id,d.starts_at]),[['other',t],['owner',t]]);
  assert.equal(await again(f,t+29*DAY),'free');
  assert.equal(await again(f,t+31*DAY),'charged');
  const state=await inviteState(f.owner);assert.equal(state.friends[0].state,'active');assert.equal(state.friends[0].bonus.until,t+30*DAY);
  assert.equal(R.prepare(`SELECT ${freshSql("'other'",'?')} f`).get(t+31*DAY).f,0);
 }finally{f.db.close();}
});

test('the days follow the free start and each other, so a month is always whole',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  billing(f);R.prepare("UPDATE platform_billing SET free_days=14 WHERE id='global'").run();
  const first=R.prepare("SELECT MIN(created_at) n FROM properties WHERE owner_id='owner'").get().n;
  const third=await owner(f,'third','Третий');
  const code=await friendCode(f.db,'owner');
  await redeemInvite(f.other,{code});await redeemInvite(third,{code});
  // Both come during the owner's 14 days: the first month starts when they end, the second one after the first.
  firstBooking(f,'other',first+DAY);firstBooking(f,'third',first+2*DAY);
  const starts=R.prepare("SELECT source_id,starts_at FROM invite_bonuses WHERE user_id='owner' ORDER BY starts_at").all();
  assert.deepEqual(starts.map(s=>s.starts_at),[first+14*DAY,first+44*DAY]);
  assert.equal(await again(f,first+70*DAY),'free');
  assert.equal(await again(f,first+75*DAY),'charged');
 }finally{f.db.close();}
});

test('no code after a booking, no swapping codes, at most six friends\' months a year',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const code=await friendCode(f.db,'other');
  await assert.rejects(redeemInvite(f.owner,{code}),/до первой брони/);
  await redeemInvite(f.other,{code:await friendCode(f.db,'owner')});
  // «other» came by the owner's code: the owner cannot enter «other»'s code back, even without bookings.
  R.prepare("DELETE FROM platform_commissions WHERE owner_id='owner'").run();
  await assert.rejects(redeemInvite(f.owner,{code}),/Обменяться кодами нельзя/);
  await assert.rejects(redeemInvite(f.other,{code:'NOPE1'}),/нет или он больше не действует/);
  for(let i=0;i<5;i++)R.prepare("INSERT INTO invite_bonuses(user_id,role,source_id,code,days,starts_at,created_at) VALUES ('owner','owner',?,'X',30,NULL,?)").run('s'+i,now());
  const fourth=await owner(f,'fourth','Четвёртый');
  await redeemInvite(fourth,{code:await friendCode(f.db,'owner')});
  assert.equal(R.prepare("SELECT 1 FROM invite_bonuses WHERE user_id='owner' AND source_id='fourth'").get(),undefined);
  assert.ok(R.prepare("SELECT 1 FROM invite_bonuses WHERE user_id='fourth' AND source_id='fourth'").get());
  assert.match(R.prepare("SELECT body FROM notifications WHERE dedupe='owner:invite:fourth'").get().body,/лимит/);
  assert.equal((await inviteState(f.owner)).friends.find(x=>x.name==='Четвёртый').state,'limit');
 }finally{f.db.close();}
});

test('the administrator makes a partner code, sees what it brought and can switch it off',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  await assert.rejects(createPartnerCode(f.cleaner,{code:'x',label:'Уют'}),/латинские/);
  const made=await createPartnerCode(f.cleaner,{code:'pvl-uyut',label:'Уют Сервис',days:60,until:'2099-12-31'});
  assert.equal(made.partners[0].code,'PVLUYUT');assert.equal(made.partners[0].days,60);
  await assert.rejects(createPartnerCode(f.cleaner,{code:'PVLUYUT',label:'Ещё'}),/уже есть/);
  await redeemInvite(f.other,{code:'PVLUYUT'});
  assert.equal(R.prepare("SELECT days FROM invite_bonuses WHERE user_id='other'").get().days,60);
  assert.equal(R.prepare("SELECT COUNT(*) n FROM invite_bonuses").get().n,1);
  firstBooking(f,'other',now());
  const list=await adminInvites(f.cleaner);assert.deepEqual([list.partners[0].came,list.partners[0].booked],[1,1]);
  const off=await setPartnerCodeActive(f.cleaner,{code:'PVLUYUT',active:false});assert.equal(off.partners[0].active,false);
  const third=await owner(f,'third','Третий');
  await assert.rejects(redeemInvite(third,{code:'PVLUYUT'}),/больше не действует/);
  assert.ok(R.prepare("SELECT 1 FROM audit_events WHERE action LIKE '%invite.partner_disabled%'").get());
 }finally{f.db.close();}
});

test('two owners entering one code at once do not take the inviter past six months a year',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  for(let i=0;i<5;i++)R.prepare("INSERT INTO invite_bonuses(user_id,role,source_id,code,days,starts_at,created_at) VALUES ('owner','owner',?,'X',30,NULL,?)").run('s'+i,now());
  const code=await friendCode(f.db,'owner'),a=await owner(f,'fifth','Пятый'),b=await owner(f,'sixth','Шестой');
  // Both read five months before either writes: the count in the write itself decides.
  await Promise.all([redeemInvite(a,{code}),redeemInvite(b,{code})]);
  assert.equal(R.prepare("SELECT COUNT(*) n FROM invite_bonuses WHERE user_id='owner' AND source_id<>user_id").get().n,6);
  const told=R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:invite:%' ORDER BY dedupe").all().map(n=>/лимит/.test(n.body));
  assert.deepEqual(told.sort(),[false,true]);
  assert.equal(R.prepare("SELECT COUNT(*) n FROM audit_events WHERE action LIKE '%\"capped\":true%'").get().n,1);
 }finally{f.db.close();}
});

test('a banquet hall pays only the part of its month the invite days do not cover',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  billing(f);
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"banquet\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','banquet')").run(f.property,now());
  R.prepare('UPDATE properties SET capacity=200 WHERE id=?').run(f.property);
  const at=now(),month=previousMonth(at),length=month.end-month.start;
  const event=(id,start)=>{R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'completed',0,'owner_verified',?,?)").run(id,f.property,start,start+7200,start+7200,id,start);R.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed,capacity) VALUES (?,'owner',?,10000,0,0,'charged',1,?,0,200)").run(id,f.property,start);};
  // A month with events before, so this one is charged; 15 invite days from its first day.
  event('h0',month.start-20*DAY);event('h1',month.start+2*DAY);
  R.prepare("INSERT INTO invite_bonuses(user_id,role,source_id,code,days,starts_at,created_at) VALUES ('owner','owner','other','X',15,?,?)").run(month.start,month.start);
  await sweepHallMonths(f.db,at);
  const fee=R.prepare("SELECT amount,mode FROM service_fees WHERE kind='hall_month' AND ref_id=?").get(f.property+':'+month.name);
  assert.deepEqual({...fee},{amount:Math.round(19900*(1-15*DAY/length)),mode:'charged'});
  assert.match(R.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:hall-month:'+f.property+':'+month.name).body,/по приглашению учтены/);
  // Days that cover the whole month: the month is free.
  R.prepare("DELETE FROM service_fees").run();R.prepare("DELETE FROM notifications WHERE dedupe LIKE 'owner:hall-month:%'").run();
  R.prepare("UPDATE invite_bonuses SET days=40 WHERE user_id='owner'").run();
  await sweepHallMonths(f.db,at);
  assert.equal(R.prepare("SELECT mode FROM service_fees WHERE kind='hall_month'").get().mode,'free');
 }finally{f.db.close();}
});
