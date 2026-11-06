import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';import {pbkdf2Sync,randomBytes,createHash} from 'node:crypto';
import {root,openQaDatabase,qaModule} from './qa-database.mjs';import {photo} from '../tests/fixtures/photo.mjs';
if(process.argv.slice(2).join(' ')!=='--confirm-isolated')throw Error('Use --confirm-isolated; only outputs/browser-qa is supported');
const geography=JSON.parse(readFileSync(resolve(root,'tests/fixtures/kazakhstan-cities.json'),'utf8')),cities=Object.entries(geography.regions).flatMap(([region,names])=>names.map(city=>({city,region})));
if(cities.length!==90||new Set(cities.map(c=>c.city)).size!==90)throw Error('Expected 90 unique cities');
const db=openQaDatabase(),{RentalService}=await qaModule('service'),{saveWorkerDispatch,saveOperationRules}=await qaModule('dispatch'),{recordFinance}=await qaModule('finance');
const at=()=>Math.floor(Date.now()/1000),iso=t=>new Date(t*1000).toISOString(),marker='kazakhstan-qa-v1';
const password='Kazakhstan-fixture-2026',salt=randomBytes(16).toString('hex'),hash='pbkdf2-sha512$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex');
const out=resolve(root,'outputs/browser-qa/kazakhstan');mkdirSync(out,{recursive:true});
try{
 const allowed=db.raw.prepare("SELECT COUNT(*) n FROM profiles WHERE id NOT LIKE 'kzqa-%' AND id NOT IN ('qa-owner','qa-guest','qa-cleaner')").get();if(allowed.n)throw Error('Refusing a database with non-QA profiles');
 const existing=db.raw.prepare('SELECT action FROM audit_events WHERE id=?').get(marker);if(existing){console.log(JSON.stringify({alreadySeeded:true,...JSON.parse(existing.action)}));process.exitCode=0;}
 else{
 const accounts=[],listings=[],scenarios=[];let accountNo=0;
 await db.transaction(async()=>{
  const policy=db.raw.prepare("SELECT * FROM pilot_policy WHERE id='global'").get();if(policy.require_owner_review||policy.require_cleaner_review||policy.require_phone)throw Error('Seed requires fresh QA defaults; it does not disable existing admission policy');
  // Existing small browser fixtures remain available privately; the public city catalogue is exactly this dataset.
  db.raw.prepare("UPDATE properties SET published=0 WHERE owner_id='qa-owner'").run();
  for(const [index,{city,region}] of cities.entries()){
   const group={owner:[],guest:[],cleaner:[]};
   for(const [role,count] of [['owner',2],['guest',3],['cleaner',3]])for(let n=1;n<=count;n++){
    const id='kzqa-'+String(index+1).padStart(2,'0')+'-'+role+'-'+n,phone='+700'+String(++accountNo).padStart(8,'0'),name='ТЕСТ · '+city+' · '+({owner:'Владелец',guest:'Гость',cleaner:'Исполнитель'})[role]+' '+n;
    db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,phone,name,hash,createHash('sha256').update('fixture-only:'+id).digest('hex'),at());
    const service=new RentalService(db,id);await service.saveProfile({name,roles:role==='guest'?['guest']:['guest',role],city,contact:'Тестовый контакт — не звонить',districts:'Тестовый центр, Тестовый парк',experience:'Синтетическая анкета для проверки сервиса',availability:'Только тестовый стенд'});
    if(role==='cleaner')await saveWorkerDispatch(service,{receiveOffers:true});group[role].push(service);accounts.push({id,role,city,region,name,phone,password});
   }
   const rental={hourlyPrice:1500+index%5*250,minHours:2,nightlyPrice:9000+index%7*1000,checkinTime:'14:00',checkoutTime:'12:00',deposit:5000,houseRules:'Тестовые правила. Объект вымышленный, бронирование не создаёт реальную поездку.'};
   const images=[];for(const owner of group.owner)images.push((await owner.uploadMedia({kind:'property',data:photo})).id);
   const properties=[];
   for(let n=0;n<10;n++){
    const owner=group.owner[Math.floor(n/5)],rooms=n%3+1,capacity=rooms+1,price=8000+index%9*1000+n*750;
    const item=await owner.saveListing(null,{title:'ТЕСТ · '+city+' · '+rooms+'-комнатная №'+(n+1),city,district:n%2?'Тестовый парк':'Тестовый центр',address:'Вымышленный проезд Тестовый, дом '+(n+1)+', квартира '+(index+1),description:'СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ ДЛЯ ТЕСТИРОВАНИЯ. Реальной квартиры по этому описанию нет. Проверка поиска, тарифов, календаря и рабочих процессов в городе '+city+'. Фотография — технический тестовый образец.',price,rooms,capacity,cleaningMinutes:60+n%3*30,published:true,photos:[images[Math.floor(n/5)]],expectedVersion:0,policyVersion:0,details:{type:n%4===0&&rooms===1?'studio':'apartment',area:30+n*7,beds:capacity,bathrooms:1,floor:n+1,floors:12,checkinMethod:n%2?'lockbox':'meet',amenities:['wifi','kitchen','linen',...(n%2?['washer','parking']:['tv'])],pets:n%3===0,smoking:false,parties:false},rental});
    await owner.savePolicy(item.id,{...rental,dailyPrice:price,expectedVersion:1,autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:5000});
    await owner.readinessAction(item.id,{readiness:'ready',expectedVersion:1,inspected:true,note:'Синтетическая готовность, не подтверждает реальный объект'});
    await saveOperationRules(owner,{propertyId:item.id,expectedVersion:0,autoOffers:true,autoReplace:false,requirePhotos:true,offerMinutes:10});
    properties.push({id:item.id,owner});listings.push({id:item.id,city,region,ownerId:owner.userId,title:'ТЕСТ · '+city+' · №'+(n+1),price,rooms});
   }
   // Three independent properties and guests per city: pending, partially paid, assigned cleaning.
   for(let n=0;n<3;n++){
    const p=properties[n],guest=group.guest[n],start=at()+(n+1)*86400,end=start+7200;
    const b=await guest.createBooking({propertyId:p.id,start:iso(start),end:iso(end),billingMode:'hourly',guests:1,requestKey:marker+':'+index+':'+n,acceptTerms:true});
    if(n>0)await p.owner.bookingAction(b.id,{action:'confirm',cleaningFee:3000});
    if(n===1)await recordFinance(p.owner,{kind:'payment',bookingId:b.id,amount:1000,confirmed:true,note:'Синтетическая частичная оплата — реальные деньги не переводились',requestKey:marker+':pay:'+index});
    if(n===2){const job=db.raw.prepare('SELECT id FROM cleaning_jobs WHERE booking_id=?').get(b.id);await group.cleaner[0].jobAction(job.id,{action:'apply'});const application=db.raw.prepare('SELECT id FROM applications WHERE job_id=? AND user_id=?').get(job.id,group.cleaner[0].userId);await p.owner.jobAction(job.id,{action:'assign',applicationId:application.id});}
    if(n===2){const endNow=at()+600,startNow=endNow-7200;db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=?+(SELECT cleaning_minutes*60 FROM properties WHERE id=property_id) WHERE id=?').run(startNow,endNow,endNow,b.id);db.raw.prepare('UPDATE booking_terms SET original_end=? WHERE booking_id=?').run(endNow,b.id);db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=?+(SELECT cleaning_minutes*60 FROM properties WHERE id=property_id) WHERE booking_id=?').run(endNow,endNow,b.id);}
    scenarios.push({city,bookingId:b.id,propertyId:p.id,guestId:guest.userId,stage:['requested','partial_payment','assigned_cleaning'][n]});
   }
   await properties[4].owner.readinessAction(properties[4].id,{readiness:'maintenance',expectedVersion:2,note:'Тестовый ремонт'});
  }
  const result={cities:90,listings:listings.length,owners:180,guests:270,cleaners:270,bookings:scenarios.length,createdAt:at()};
  db.raw.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run(marker,'qa-owner','qa-dataset',JSON.stringify(result),at());
  if(db.raw.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key validation failed');
 });
 writeFileSync(resolve(out,'accounts.json'),JSON.stringify(accounts,null,2));writeFileSync(resolve(out,'listings.json'),JSON.stringify(listings,null,2));writeFileSync(resolve(out,'scenarios.json'),JSON.stringify(scenarios,null,2));
 writeFileSync(resolve(out,'accounts.csv'),'role,city,name,phone,password\n'+accounts.map(a=>[a.role,a.city,a.name,a.phone,a.password].map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n'));
 console.log(JSON.stringify({created:true,cities:90,listings:900,accounts:720,bookings:270,credentials:'outputs/browser-qa/kazakhstan/accounts.csv'}));
 }
}finally{db.raw.close();}
