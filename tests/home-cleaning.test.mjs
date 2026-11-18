import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {homePrice,homeMinutes,homeDescription,homeTitle,homeAdvice,homeOrderOf}=await load('home-cleaning');
const {orderHomeCleaning,homePlaces,homeDeals}=await load('home-order');

test('the price of a home cleaning grows with its kind, rooms and windows',()=>{
 assert.equal(homePrice({kind:'regular',rooms:1}),6000);
 assert.equal(homePrice({kind:'regular',rooms:3}),10000);
 assert.equal(homePrice({kind:'general',rooms:2}),16000);
 assert.equal(homePrice({kind:'renovation',rooms:2,windows:3}),23000);
 assert.equal(homePrice({kind:'nonsense',rooms:99}),homePrice({kind:'regular',rooms:6}));
 assert.equal(homeMinutes({kind:'regular',rooms:2}),120);assert.equal(homeMinutes({kind:'general',rooms:2,windows:2}),270);
 assert.equal(homeTitle(2),'Дом · 2 комнаты');
 assert.equal(homeDescription({kind:'general',rooms:2,windows:3,wishes:' Есть кот '}),'Уборка на дом: генеральная, 2 комнаты, мойка окон: 3 окна. Средства и инвентарь свои. Пожелания: Есть кот');
});

test('the price advice follows what executors of the city really take such orders for',()=>{
 const order={kind:'general',rooms:2,windows:3};
 assert.deepEqual(homeOrderOf(homeDescription({...order,wishes:'Кот'})),order);assert.equal(homeOrderOf('Уборка после гостей'),null);
 assert.deepEqual(homeOrderOf(homeDescription({kind:'regular',rooms:5})),{kind:'regular',rooms:5,windows:0});
 // Few orders: the advice is the grid.
 assert.deepEqual(homeAdvice(order,[{kind:'regular',rooms:1,fee:9000}]),{fee:19000,market:false,deals:1});
 // Enough orders: the median of «paid / grid» corrects it; a wild sum does not count.
 const deals=[[1,7500],[1,7500],[2,10000],[3,12000],[2,10000],[1,100]].map(([rooms,fee])=>({kind:'regular',rooms,fee}));
 assert.deepEqual(homeAdvice({kind:'regular',rooms:2},deals),{fee:10000,market:true,deals:5});
});

test('a guest orders a cleaning of their own home and the usual process takes it',async()=>{
 const f=await fixture(),start=iso(now()+86400);
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5, кв. 7',rooms:2,kind:'general',windows:1,start,wishes:'Есть кот',longitude:76.95,latitude:52.28,requestKey:'home-1'});
 assert.equal(made.fee,17000);assert.match(made.message,/Ищем исполнителя/);
 // The address is a private object: it is not published and no guest finds it.
 const place=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(made.propertyId);
 assert.deepEqual([place.owner_id,place.published,place.title,place.rooms],['guest',0,'Дом · 2 комнаты',2]);
 assert.equal((await f.other.publicSearch({city:'Павлодар'})).properties.some(p=>p.id===made.propertyId),false);
 assert.equal((await f.cleaner.roleState('cleaner')).properties.length,0);
 // The customer became an owner, so the whole owner side of a cleaning is theirs.
 assert.ok(JSON.parse(f.db.raw.prepare("SELECT roles FROM profiles WHERE id='guest'").get().roles).includes('owner'));
 const owner=await f.guest.roleState('owner'),job=owner.jobs.find(j=>j.id===made.id);
 assert.deepEqual([job.status,job.fee,job.end-job.start],['open',17000,255*60]);assert.match(job.description,/генеральная, 2 комнаты, мойка окон: 1 окно/);
 assert.equal((await homePlaces(f.guest)).length,1);
 await assert.rejects(f.guest.saveListing(made.propertyId,{}),/частный адрес/);
 // The executor sees the order without the exact address, applies, is chosen, does the work, the customer accepts it.
 const seen=(await f.cleaner.roleState('cleaner')).jobs.find(j=>j.id===made.id);assert.equal(seen.address,null);
 await f.cleaner.jobAction(made.id,{action:'apply'});
 const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id);
 await f.guest.jobAction(made.id,{action:'assign',applicationId:app.id});
 assert.equal((await f.cleaner.roleState('cleaner')).jobs.find(j=>j.id===made.id).address,'ул. Тестовая, 5, кв. 7');
 // The same request again does not make a second order, a second order to the same address does not make a second home.
 assert.equal((await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5, кв. 7',rooms:2,kind:'general',windows:1,start,wishes:'Есть кот',requestKey:'home-1'})).id,made.id);
 const next=await orderHomeCleaning(f.guest,{propertyId:made.propertyId,rooms:3,kind:'regular',start:iso(now()+3*86400),requestKey:'home-2'});
 assert.equal(next.propertyId,made.propertyId);assert.equal(next.fee,10000);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM properties WHERE owner_id='guest'").get().n,1);
});

test('the customer sets the price, and an order cannot go to another person\'s address',async()=>{
 const f=await fixture(),start=iso(now()+86400);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',start,fee:500,requestKey:'a'}),/Цена/);
 // Below the advice is the customer's right; the order is counted in the market only once an executor took it.
 const cheap=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',start,fee:9000,requestKey:'a2'});assert.equal(cheap.fee,9000);
 assert.deepEqual(await homeDeals(f.guest,'Павлодар'),[]);
 await f.cleaner.jobAction(cheap.id,{action:'apply'});await f.guest.jobAction(cheap.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(cheap.id).id});
 assert.deepEqual(await homeDeals(f.guest,'Павлодар'),[{kind:'general',rooms:2,windows:0,fee:9000}]);
 assert.deepEqual((await f.guest.roleState('owner')).homeDeals.length,1);
 await assert.rejects(orderHomeCleaning(f.guest,{propertyId:f.property,rooms:1,kind:'regular',start,requestKey:'b'}),/адрес недоступен/);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'regular',start:'когда-нибудь',requestKey:'c'}),/когда нужна уборка/);
 const {commandRole}=await load('access');assert.deepEqual(commandRole('home-cleaning',{}),['guest','owner']);
});

test('a cleaning without a booking waits for nobody\'s departure',async()=>{
 const f=await fixture(),{cleaningThread:ownerJobThread,jobThread}=await load('process-threads'),{cleanerStep,cleanerLine}=await load('job-steps');
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'regular',start:iso(now()+1800),requestKey:'w'});
 const owner=await f.guest.roleState('owner'),mine=owner.jobs.find(j=>j.id===made.id);
 assert.equal(mine.booking_id,null);assert.ok(mine.checkout_confirmed);
 assert.doesNotMatch(JSON.stringify(ownerJobThread(mine,owner,now())),/[Вв]ыезд/);
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 const cleaner=await f.cleaner.roleState('cleaner'),job=cleaner.jobs.find(j=>j.id===made.id);
 assert.deepEqual(cleanerStep(job,undefined,'cleaner'),{id:'start',label:'Начать уборку'});assert.equal(cleanerLine(job),'Можно начинать в назначенное время');
 assert.doesNotMatch(JSON.stringify(jobThread(job,cleaner,now())),/[Вв]ыезд/);
 // The private home is not offered to the autopilot of rented objects.
 const {planState}=await load('autopilot-plans');assert.equal((await planState(f.guest,'owner')).flats.some(x=>x.id===made.propertyId),false);
});

test('the performer says «Выезжаю» and «Я на месте», and reports by the checklist of the kind',async()=>{
 const f=await fixture(),{cleaningThread,jobThread}=await load('process-threads'),{homeChecklist}=await load('home-cleaning');
 assert.equal(homeChecklist({kind:'regular'}).length,4);assert.equal(homeChecklist({kind:'general',windows:2}).at(-1),'Окна вымыты: 2 окна');assert.ok(homeChecklist({kind:'renovation'}).some(x=>/краски/.test(x)));
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',windows:2,start:iso(now()+1800),requestKey:'s2'});
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'arrived'}),/./);
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 const line=async()=>{const s=await f.guest.roleState('owner');return cleaningThread(s.jobs.find(j=>j.id===made.id),s,now());};
 assert.match((await line()).line,/приедет к назначенному времени/);
 assert.match((await f.cleaner.jobAction(made.id,{action:'on_way'})).message,/выехали/);assert.match((await line()).line,/в пути/);
 assert.match((await f.cleaner.jobAction(made.id,{action:'arrived'})).message,/на месте/);
 const t=await line();assert.match(t.line,/на месте, начнёт уборку/);assert.equal(t.steps[1].state,'done');assert.equal(t.steps[1].note,'Исполнитель на месте');
 // Said twice: the customer is not told twice.
 assert.match((await f.cleaner.jobAction(made.id,{action:'arrived'})).message,/уже знает/);
 const notes=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND (dedupe LIKE '%cleaner-arrived:%' OR dedupe LIKE '%cleaner-on-way:%')").all();
 assert.equal(notes.length,2);assert.ok(notes.some(n=>/Откройте дверь/.test(n.body)));
 const mine=await f.cleaner.roleState('cleaner');assert.match(jobThread(mine.jobs.find(j=>j.id===made.id),mine,now()).steps[2].note,/на месте/);
 // The usual cleaning after guests keeps its own way to say «на месте».
 await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'arrived'}),/./);
 await f.cleaner.jobAction(made.id,{action:'start'});
 const {commandRole}=await load('access');for(const action of ['on_way','arrived'])assert.deepEqual(commandRole('jobs/x',{action}),['cleaner']);
 const list=homeChecklist({kind:'general',windows:2});assert.equal(list.length,7);
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'submit',checklist:[true,true,true],report:'Готово'}),/чек-листа|фото/); // The customer's home asks for photos before and after: a report without them does not go.
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'submit',checklist:list.map(()=>true),report:'Готово'}),/фото до и после/);
 f.db.raw.prepare('UPDATE operation_rules SET require_photos=0 WHERE property_id=?').run(made.propertyId);
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'submit',checklist:list.map(()=>true),items:[...list.slice(1),'Что-то ещё'],report:'Готово'}),/Чек-лист изменился/);
 await f.cleaner.jobAction(made.id,{action:'submit',checklist:list.map(()=>true),items:list,report:'Готово'});
 const card=(await f.guest.roleState('owner')).approvals.find(c=>c.kind==='report'&&c.entityId===made.id);
 assert.ok(card.facts.some(([k,v])=>k==='Чек-лист'&&v==='7 из 7'));assert.match(card.detail,/^Готово\n\nОтмечено исполнителем: .*окна вымыты: 2 окна\.$/);
});

test('ticks of the site are not read as the points of a home cleaning, and a new performer starts from the beginning',async()=>{
 const f=await fixture();
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'general',start:iso(now()+1800),requestKey:'s3'});
 f.db.raw.prepare('UPDATE operation_rules SET require_photos=0 WHERE property_id=?').run(made.propertyId);
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 await f.cleaner.jobAction(made.id,{action:'on_way'});await f.cleaner.jobAction(made.id,{action:'arrived'});
 // The performer gives the order back: the marks of the way and the arrival are not left for the next one.
 await f.cleaner.jobAction(made.id,{action:'release'});
 assert.deepEqual({...f.db.raw.prepare('SELECT status,assigned_to,on_way_at,arrived_at FROM cleaning_jobs WHERE id=?').get(made.id)},{status:'open',assigned_to:null,on_way_at:null,arrived_at:null});
 f.db.raw.prepare("UPDATE applications SET status='pending' WHERE job_id=?").run(made.id);
 await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 await f.cleaner.jobAction(made.id,{action:'arrived'});
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='guest' AND dedupe LIKE '%cleaner-arrived:%'").get().n,2);
 // The site still sends four ticks: they are counted, not turned into points nobody confirmed.
 await f.cleaner.jobAction(made.id,{action:'start'});await f.cleaner.jobAction(made.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано'});
 const card=(await f.guest.roleState('owner')).approvals.find(c=>c.kind==='report'&&c.entityId===made.id);
 assert.equal(card.detail,'Убрано');assert.ok(card.facts.some(([k,v])=>k==='Чек-лист'&&v==='4 из 4'));
});

// Stage 3: the cancellation with a free term, the complaint about damage with photos, the rating of the performer.
const taken=async(f,key,over={})=>{
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'regular',fee:10000,start:iso(now()+5*3600),requestKey:key,...over});
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 return made;
};
const row=(f,id)=>({...f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(id)});

test('a home order is cancelled free until two hours before the start, later the performer is owed a part',async()=>{
 const {homeCancel,homeCancelLine}=await load('home-cleaning'),t=now();
 assert.deepEqual(homeCancel({start:t+7200,fee:10000},t+7000),{fee:0,freeUntil:t,taken:false});
 assert.equal(homeCancel({start:t+7200,fee:10000,assigned_to:'c'},t-1).fee,0);
 assert.equal(homeCancel({start:t+7200,fee:10000,assigned_to:'c'},t).fee,3000);
 assert.equal(homeCancel({start:t+7200,fee:10000,assigned_to:'c',arrived_at:t},t).fee,5000);
 assert.equal(homeCancel({start:t+7200,fee:1000,assigned_to:'c'},t).fee,500);
 assert.match(homeCancelLine({fee:3000,taken:true},''),/положено 3 000 ₸/);assert.match(homeCancelLine({fee:0,taken:true},'сегодня до 12:00'),/бесплатная сегодня до 12:00/);assert.match(homeCancelLine({fee:0,taken:false},''),/Исполнителя ещё нет/);
 const f=await fixture();
 // In the free term: nothing is owed, no reason is asked.
 const early=await taken(f,'c1');
 assert.deepEqual(await f.guest.jobAction(early.id,{action:'cancel',expectedFee:0}),{message:'Заказ отменён бесплатно.',cancelFee:0});
 assert.equal(row(f,early.id).cancel_fee,0);assert.ok(row(f,early.id).cancelled_at);
 assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND dedupe LIKE '%cancelled:'||?").get(early.id).body,/в бесплатный срок/);
 // Later: the customer who read «free» is asked again, then the part is recorded and can be marked as paid.
 const late=await taken(f,'c2');f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+3600,now()+3*3600,late.id);
 // Before the acceptance nothing can be recorded as paid, by the card or by the journal of payments.
 {const {recordFinance}=await load('finance');await assert.rejects(recordFinance(f.guest,{kind:'job_payment',jobId:late.id,amount:1000,confirmed:true,note:'Рано',requestKey:'early-pay'}),/Сначала примите результат/);}
 await assert.rejects(f.guest.jobAction(late.id,{action:'cancel',expectedFee:0}),/Бесплатный срок отмены уже прошёл: исполнителю положено 3 000 ₸/);
 assert.equal(row(f,late.id).status,'assigned');
 const done=await f.guest.jobAction(late.id,{action:'cancel',expectedFee:3000});assert.equal(done.cancelFee,3000);assert.match(done.message,/положено 3 000 ₸/);
 assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND dedupe LIKE '%cancelled:'||?").get(late.id).body,/вам положено 3 000 ₸/);
 await f.guest.jobAction(late.id,{action:'record_job_payment',confirmed:true,expectedVersion:row(f,late.id).version});
 assert.equal(f.db.raw.prepare("SELECT SUM(amount) n FROM finance_entries WHERE job_id=? AND kind='job_payment'").get(late.id).n,3000);assert.ok(row(f,late.id).settled_at);
 assert.match((await f.guest.jobAction(late.id,{action:'record_job_payment',confirmed:true,expectedVersion:row(f,late.id).version})).message,/уже полностью/);
 // A free cancellation leaves nothing to pay; a cleaning after guests keeps its own cancellation with a reason.
 await assert.rejects(f.guest.jobAction(early.id,{action:'record_job_payment',confirmed:true,expectedVersion:row(f,early.id).version}),/Сначала примите работу/);
 await assert.rejects(f.owner.jobAction(f.job.id,{action:'cancel'}),/Причина отмены/);
});

test('the customer rates the performer once after the acceptance, and the next customers see the average',async()=>{
 const f=await fixture(),{reliabilityFor}=await load('reliability');
 const made=await taken(f,'r1',{start:iso(now()+1800)});f.db.raw.prepare('UPDATE operation_rules SET require_photos=0 WHERE property_id=?').run(made.propertyId);
 await assert.rejects(f.guest.jobAction(made.id,{action:'rate',rating:5}),/после приёмки/);
 await f.cleaner.jobAction(made.id,{action:'arrived'});await f.cleaner.jobAction(made.id,{action:'start'});await f.cleaner.jobAction(made.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано'});
 await f.guest.jobAction(made.id,{action:'approve'});
 await assert.rejects(f.guest.jobAction(made.id,{action:'rate',rating:6}),/./);await assert.rejects(f.cleaner.jobAction(made.id,{action:'rate',rating:5}),/./);
 assert.match((await f.guest.jobAction(made.id,{action:'rate',rating:4,note:' Аккуратно '})).message,/Спасибо/);
 await assert.rejects(f.guest.jobAction(made.id,{action:'rate',rating:1}),/уже оценили/);
 assert.deepEqual((({rating,rating_note})=>({rating,rating_note}))(row(f,made.id)),{rating:4,rating_note:'Аккуратно'});
 assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND dedupe LIKE '%rated:%'").get().body,/★★★★☆ «Аккуратно»/);
 assert.ok((await reliabilityFor(f.db,'cleaner',['cleaner'])).get('cleaner').facts.includes('оценка заказчиков 4,0'));
});

test('a complaint about damage needs a photo, reaches the performer and opens an issue',async()=>{
 const f=await fixture(),{saveDamagePhoto,listEvidence}=await load('evidence'),{photo}=await import('./fixtures/photo.mjs');
 const made=await taken(f,'d1',{start:iso(now()+1800)});f.db.raw.prepare('UPDATE operation_rules SET require_photos=0 WHERE property_id=?').run(made.propertyId);
 // Before the report there is nothing to complain about.
 await assert.rejects(saveDamagePhoto(f.guest,{jobId:made.id,data:photo}),/после отчёта/);
 await f.cleaner.jobAction(made.id,{action:'arrived'});await f.cleaner.jobAction(made.id,{action:'start'});await f.cleaner.jobAction(made.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано'});
 await assert.rejects(f.guest.jobAction(made.id,{action:'damage',text:'Разбита ваза'}),/хотя бы одно фото/);
 await assert.rejects(saveDamagePhoto(f.other,{jobId:made.id,data:photo}),/./);
 await saveDamagePhoto(f.guest,{jobId:made.id,data:photo});
 assert.match((await f.guest.jobAction(made.id,{action:'damage',text:'Разбита ваза'})).message,/Жалоба отправлена/);
 const issue=f.db.raw.prepare("SELECT description,opened_role,other_user FROM administrator_issues WHERE entity_id=?").get(made.id);
 assert.deepEqual({...issue},{description:'Ущерб при уборке: Разбита ваза (фото: 1)',opened_role:'owner',other_user:'cleaner'});
 assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='cleaner' AND body LIKE 'Заказчик сообщил об ущербе%Разбита ваза%'").get());
 // Both sides see the photo; the performer's side knows it is not theirs.
 assert.deepEqual((await listEvidence(f.cleaner,'cleaner',made.id)).map(p=>[p.phase,p.mine]),[['damage',0]]);
 assert.deepEqual((await listEvidence(f.guest,'owner',made.id)).map(p=>[p.phase,p.mine]),[['damage',1]]);
 // Two days after the acceptance the term is over; no more than six photos.
 await f.guest.jobAction(made.id,{action:'approve'});
 for(let i=0;i<5;i++)await saveDamagePhoto(f.guest,{jobId:made.id,data:photo});
 await assert.rejects(saveDamagePhoto(f.guest,{jobId:made.id,data:photo}),/до 6 фото/);
 f.db.raw.prepare('UPDATE cleaning_jobs SET completed_at=? WHERE id=?').run(now()-49*3600,made.id);
 await assert.rejects(f.guest.jobAction(made.id,{action:'damage',text:'Ещё царапина'}),/Срок прошёл/);
 await assert.rejects(saveDamagePhoto(f.guest,{jobId:made.id,data:photo}),/двух суток/);
});

// Stage 4: the cleaning repeats on a schedule and goes to the pinned performer first.
test('a home cleaning repeats on a schedule: the next order appears three days ahead with the same terms',async()=>{
 const {saveHomeRepeat,repeatHomeCleanings,nextRepeat,repeatLabel}=await load('home-repeat'),{checkAdministratorOwner}=await load('administrator-runtime');
 const t=now();assert.equal(nextRepeat(t-86400,7,t),t+6*86400);assert.equal(nextRepeat(t-30*86400,7,t),t+5*86400);assert.equal(repeatLabel(14),'Раз в 2 недели');assert.equal(repeatLabel(0),'Не повторять');
 const f=await fixture(),jobs=()=>f.db.raw.prepare("SELECT id,start,end,fee,description,status FROM cleaning_jobs WHERE owner_id='guest' ORDER BY start").all();
 // Nothing to repeat before the first order; a stranger's address is not theirs to schedule.
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',windows:1,fee:15000,wishes:'Кот',start:iso(now()+1800),requestKey:'p1'});
 await assert.rejects(saveHomeRepeat(f.other,{propertyId:made.propertyId,every:7}),/./);await assert.rejects(saveHomeRepeat(f.guest,{propertyId:made.propertyId,every:5}),/как часто/);
 const first=jobs()[0],saved=await saveHomeRepeat(f.guest,{propertyId:made.propertyId,every:7});
 assert.equal(saved.next,first.start+7*86400);assert.match(saved.message,/^Каждую неделю: следующая уборка .* за 15 000 ₸/);
 assert.equal((await f.guest.roleState('owner')).ownProperties.find(p=>p.id===made.propertyId).details.repeat.every,7);
 // More than three days ahead: nothing yet. Three days before: the order is made once, the customer is told.
 assert.equal(await repeatHomeCleanings(f.guest,now()),0);
 f.db.raw.prepare('UPDATE cleaning_jobs SET start=start-4*86400-3600,end=end-4*86400-3600,status=\'completed\' WHERE id=?').run(first.id);
 await checkAdministratorOwner(f.db,'guest');assert.equal(await repeatHomeCleanings(f.guest,now()),0);
 const [old,next]=jobs();assert.equal(jobs().length,2);
 assert.deepEqual([next.start-old.start,next.end-next.start,next.fee,next.description,next.status],[7*86400,old.end-old.start,15000,old.description,'open']);
 assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE '%home-repeat:%'").get().body,/по расписанию заказана уборка .* за 15 000 ₸\. Отменить бесплатно можно до/);
 // The customer cancels this one: it is a skip, not ordered again; the following one comes in its time.
 await f.guest.jobAction(next.id,{action:'cancel',expectedFee:0});
 assert.equal(await repeatHomeCleanings(f.guest,now()),0);assert.equal(await repeatHomeCleanings(f.guest,next.start+4*86400+60),1);
 assert.equal(jobs().at(-1).start,next.start+7*86400);
 // Turned off: the orders already made stay, new ones do not come.
 assert.match((await saveHomeRepeat(f.guest,{propertyId:made.propertyId,every:0})).message,/выключен/);
 f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE owner_id='guest' AND status='open'").run();
 assert.equal(await repeatHomeCleanings(f.guest,next.start+20*86400),0);
});

test('a pinned performer gets the home order first and their «yes» assigns them',async()=>{
 const {pinRegular}=await load('regular-cleaner'),{coordinateDispatch,decideOffer}=await load('dispatch');
 const f=await fixture(),first=await taken(f,'g1',{start:iso(now()+1800)});
 assert.match((await pinRegular(f.guest,{propertyId:first.propertyId,cleanerId:'cleaner'})).message,/./);
 assert.ok((await f.guest.roleState('owner')).ownProperties.find(p=>p.id===first.propertyId).regular_cleaner_name);
 f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE id=?").run(first.id);
 const second=await orderHomeCleaning(f.guest,{propertyId:first.propertyId,kind:'regular',fee:9000,start:iso(now()+2*86400),requestKey:'g2'});
 await coordinateDispatch(f.guest);
 const offer=f.db.raw.prepare("SELECT id,worker_id FROM cleaning_offers WHERE job_id=? AND status='offered'").get(second.id);assert.equal(offer.worker_id,'cleaner');
 assert.equal((await decideOffer(f.cleaner,{id:offer.id,action:'accept'})).assigned,true);
 assert.deepEqual({...f.db.raw.prepare('SELECT status,assigned_to FROM cleaning_jobs WHERE id=?').get(second.id)},{status:'assigned',assigned_to:'cleaner'});
});
