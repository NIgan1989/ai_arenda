// Every category end to end on an in-memory copy of the service (2026-11-18): listing, search, quote, request,
// confirmation, test payment and deposit, check-in window, check-in and out, handover, review, deposit return,
// cleaning after the guest, a cancellation with refund and a rejection; then home cleaning and the special cases
// (date change, late and owner cancellation, disputed checkout, kept deposit, rework, a cleaner who gives up).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {RentalService}=await load('service');
// Direct settlement: the guest transfers to the owner and says «Я оплатил»; the owner confirms what came.
// These journeys pay in advance, as a place with five completed stays and a 100% prepayment does (lib/prepay.ts).
const payDirect=async(g,b,kind)=>{R.prepare('UPDATE booking_terms SET prepay_percent=100 WHERE booking_id=?').run(b);await g.bookingAction(b,{action:'report_paid'});return owner.bookingAction(b,{action:kind==='payment'?'paid':kind==='deposit'?'deposit_received':'received'});};
const {saveHandover}=await load('stay-handover'),{saveStayReview}=await load('stay-reviews');
const {writeOperations}=await load('operations-api'),{previewMatches}=await load('smart-matching'),{orderHomeCleaning}=await load('home-order');
const {homeChecklist,homeOrderOf}=await load('home-cleaning'),{saveEvidence}=await load('evidence');

const results=[];let current='';
async function step(name,fn){try{const r=await fn();results.push({group:current,name,ok:true,note:typeof r==='string'?r:''});return r;}catch(e){results.push({group:current,name,ok:false,note:String(e?.message||e).slice(0,300)});return undefined;}}
const f=await fixture(),R=f.db.raw;
R.prepare("INSERT INTO platform_billing(id,test_payments) VALUES ('global',1) ON CONFLICT(id) DO UPDATE SET test_payments=1").run();
// Clear the fixture's own stay.
R.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);R.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE id=?").run(f.job.id);
const person=async(id,name,roles)=>{const s=new RentalService(f.db,id);await s.saveProfile({name,roles,city:'Павлодар',contact:'+7700000'+id.length,districts:'Центр',experience:'Опыт 3 года',availability:'Каждый день'});return s;};
const owner=f.owner,guest=f.guest,cleaner=f.cleaner;const guest2=await person('guest2','Гость Два',['guest']),cleaner2=await person('cleaner2','Исполнитель Два',['cleaner']),homeClient=await person('client','Заказчик уборки',['guest']);
const asOwner=id=>new RentalService(f.db,id),cfg={};
const op=(svc,role,path,body)=>writeOperations(svc,role,path.split('/'),body,cfg,false);
const pic=async svc=>(await svc.uploadMedia({kind:'property',data:photo})).id;
// Moves a booking (and its cleaning) so it starts `by` seconds from now.
const startIn=(bookingId,by)=>{const b=R.prepare('SELECT start,end FROM bookings WHERE id=?').get(bookingId),d=now()+by-b.start;R.prepare('UPDATE bookings SET start=start+?,end=end+?,occupied_until=occupied_until+?,expires_at=expires_at+? WHERE id=?').run(d,d,d,d,bookingId);R.prepare('UPDATE cleaning_jobs SET start=start+?,end=end+? WHERE booking_id=?').run(d,d,bookingId);};
const endNow=bookingId=>{const b=R.prepare('SELECT start,end FROM bookings WHERE id=?').get(bookingId),d=now()-60-b.end;R.prepare('UPDATE bookings SET start=start+?,end=end+?,occupied_until=occupied_until+? WHERE id=?').run(d,d,d,bookingId);};

const desc='Светлое и чистое место для отдыха, всё необходимое есть, рядом остановка и магазины, тихий двор и парковка.';
const KINDS=[
 {type:'apartment',mode:'daily'},{type:'studio',mode:'hourly'},{type:'room',mode:'daily'},{type:'house',mode:'daily'},{type:'guesthouse',mode:'nightly'},
 {type:'hostel',mode:'daily'},{type:'hotel',mode:'daily'},{type:'aparthotel',mode:'hourly'},
 {type:'banya',mode:'hourly',bath:1},{type:'sauna',mode:'hourly',bath:1},{type:'banquet',mode:'daily',hall:1},{type:'cafe',mode:'daily',hall:1}];
const listingFor=(k,photos)=>{
 const hall=k.hall,bath=k.bath;
 return {title:'Тест '+k.type,city:'Павлодар',district:'Центр',address:'ул. Тестовая, '+(KINDS.indexOf(k)+1),description:desc,price:hall?400000:bath?24000:12000,rooms:hall||bath?1:2,capacity:hall?200:bath?8:4,cleaningMinutes:60,photos,published:false,expectedVersion:0,policyVersion:0,
  details:{type:k.type,area:hall?300:50,beds:hall?1:bath?1:4,bathrooms:1,floor:2,floors:5,checkinMethod:'meet',amenities:hall?['halal']:bath?['steam']:['wifi'],pets:false,smoking:false,parties:!!hall,...(hall?{menu:'Бешбармак'}:{})},
  rental:hall?{hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:0,houseRules:'Правила зала.',includedGuests:50,extraGuestPrice:8000}
   :bath?{hourlyPrice:4000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:5000,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500,prepMinutes:60}
   :{hourlyPrice:2500,minHours:2,nightlyPrice:k.mode==='nightly'?9000:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'Не курить.'},
  ...(hall?{ownStaff:true}:{})};
};
const day=Math.floor((now()+3*86400)/86400)*86400;
const slot=(k,i)=>{const d=day+i*2*86400;if(k.hall)return [d+7*3600,d+12*3600];if(k.mode==='hourly')return [d+5*3600,d+8*3600];if(k.mode==='nightly')return [d+9*3600,d+86400+7*3600];return [d+9*3600,d+86400+7*3600];};
const bookingBody=(k,id,[s,e],key)=>({propertyId:id,start:iso(s),end:iso(e),guests:k.hall?80:k.bath?6:2,billingMode:k.mode,requestKey:key,acceptTerms:true,...(k.hall?{occasion:'toi'}:{})});

const summary=[];
for(const [i,k] of KINDS.entries()){
 current=k.type;const row={type:k.type};summary.push(row);
 const photos=[await pic(owner)];
 const id=await step('владелец добавил объект',async()=>(await owner.saveListing(null,listingFor(k,photos))).id);if(!id)continue;
 R.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);
 const ownStaff=R.prepare('SELECT own_staff FROM properties WHERE id=?').get(id).own_staff;row.ownStaff=ownStaff;
 await step('готовность «ready»',async()=>{const o=R.prepare('SELECT version FROM property_operations WHERE property_id=?').get(id);await owner.readinessAction(id,{readiness:'ready',note:'Проверено',inspected:true,expectedVersion:o.version});});
 const [s,e]=slot(k,i);
 await step('гость находит в поиске своей категории',async()=>{const kinds=k.hall?['banquet','cafe']:k.bath?['banya','sauna']:[k.type];const r=await previewMatches(guest,{city:'Павлодар',mode:k.mode==='nightly'?'night':k.mode,start:iso(s),end:iso(e),guests:k.hall?80:k.bath?6:2,maxPrice:100000000,priority:'balanced',features:[],kinds});const found=r.properties.find(p=>p.id===id);if(!found)throw Error('не найден, найдено: '+r.properties.length);return 'цена '+found.estimate?.amount;});
 await step('расчёт цены',async()=>{const q=await guest.bookingQuote(bookingBody(k,id,[s,e]));row.amount=q.amount;return String(q.amount);});
 const b=await step('гость отправил заявку',async()=>(await guest.createBooking(bookingBody(k,id,[s,e],'b-'+k.type))).id);if(!b)continue;
 await step('владелец подтвердил',async()=>(await owner.bookingAction(b,{action:'confirm',cleaningFee:ownStaff?0:3000})).message);
 const t=()=>R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(b);
 await step('гость перевёл, владелец подтвердил оплату',async()=>(await payDirect(guest,b,'payment')).message);
 if(t().deposit)await step('владелец подтвердил депозит',async()=>(await payDirect(guest,b,'deposit')).message);
 await step('статус оплаты у брони',async()=>{const r=R.prepare('SELECT payment_status FROM bookings WHERE id=?').get(b);const tt=t();if(r.payment_status!=='owner_verified')throw Error('payment_status='+r.payment_status);if(tt.deposit&&tt.deposit_status!=='owner_verified')throw Error('deposit_status='+tt.deposit_status);return 'оплачено '+tt.paid_amount;});
 // Changing the dates before arrival.
 await step('гость предлагает другие даты (расчёт)',async()=>{const r=await guest.changeQuote?.(b,{start:iso(s+86400),end:iso(e+86400)});return r?JSON.stringify(r).slice(0,80):'нет метода changeQuote';});
 await step('заселение до окна закрыто',async()=>{try{await guest.bookingAction(b,{action:'report_checkin'});}catch(e){if(/15 минут/.test(e.message))return 'закрыто, как надо';throw e;}throw Error('открылось раньше 15 минут');});
 startIn(b,10*60);
 await step('гость сообщил о заселении',async()=>(await guest.bookingAction(b,{action:'report_checkin'})).message);
 await step('фото гостя при заселении',async()=>(await op(guest,'guest','stay-photo',{bookingId:b,data:photo})).message||'ok');
 await step('владелец подтвердил заселение',async()=>(await owner.bookingAction(b,{action:'checkin'})).message);
 endNow(b);
 await step('гость сообщил о выезде',async()=>(await guest.bookingAction(b,{action:'report_checkout'})).message);
 await step('владелец подтвердил выезд',async()=>(await owner.bookingAction(b,{action:'checkout'})).message);
 await step('приёмка «всё хорошо»',async()=>(await saveHandover(owner,{bookingId:b,verdict:'ok'})).message);
 await step('отзыв гостя',async()=>(await saveStayReview(guest,{bookingId:b,rating:5,text:'Всё понравилось'})).message);
 if(t()?.deposit)await step('владелец вернул депозит',async()=>(await owner.bookingAction(b,{action:'record_deposit_return',confirmed:true,expectedVersion:t().version})).message);
 // Cleaning after the guest.
 const job=R.prepare("SELECT * FROM cleaning_jobs WHERE booking_id=? AND status<>'cancelled'").get(b);
 if(ownStaff){await step('свой персонал: уборки для исполнителей нет',async()=>{if(job)throw Error('создана уборка '+job.status);return 'нет уборки';});}
 else{
  await step('уборка создана после брони',async()=>{if(!job)throw Error('нет уборки');return job.status+' '+job.fee+' ₸';});
  if(job){
   await step('исполнитель откликнулся',async()=>(await cleaner.jobAction(job.id,{action:'apply'})).message);
   const app=R.prepare("SELECT id FROM applications WHERE job_id=? AND user_id='cleaner'").get(job.id);
   await step('владелец назначил',async()=>(await owner.jobAction(job.id,{action:'assign',applicationId:app?.id})).message);
   R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-60,now()+3600,job.id);
   await step('исполнитель начал',async()=>(await cleaner.jobAction(job.id,{action:'start'})).message);
   await step('исполнитель отправил отчёт',async()=>(await cleaner.jobAction(job.id,{action:'submit',report:'Убрано, бельё сменено.',checklist:[true,true,true,true]})).message);
   await step('владелец принял',async()=>(await owner.jobAction(job.id,{action:'approve'})).message);
   await step('владелец оценил',async()=>(await owner.jobAction(job.id,{action:'rate',rating:5,note:'Спасибо'})).message);
   await step('оплата уборки отмечена',async()=>{const j=R.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(job.id);return (await owner.jobAction(job.id,{action:'record_job_payment',confirmed:true,expectedVersion:j.version})).message;});
   await step('после уборки объект снова «готов»',async()=>{const r=R.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(id).readiness;if(r!=='ready')throw Error('readiness='+r);return r;});
  }
 }
 // Second booking: cancelled by the guest after paying, refund marked by the owner.
 const [s2,e2]=[s+86400,e+86400];
 const b2=await step('вторая заявка (другой гость)',async()=>(await guest2.createBooking(bookingBody(k,id,[s2,e2],'b2-'+k.type))).id);
 if(b2){
  await step('владелец подтвердил вторую',async()=>(await owner.bookingAction(b2,{action:'confirm',cleaningFee:ownStaff?0:3000})).message);
  await step('второй гость оплатил',async()=>(await payDirect(guest2,b2,'all')).message);
  await step('второй гость отменил',async()=>(await guest2.bookingAction(b2,{action:'cancel',reason:'Планы изменились'})).message);
  await step('владелец отметил возврат',async()=>{const tt=R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(b2);return (await owner.bookingAction(b2,{action:'record_refund',confirmed:true,expectedVersion:tt.version})).message;});
  await step('уборка второй брони отменена',async()=>{const j=R.prepare('SELECT status FROM cleaning_jobs WHERE booking_id=?').get(b2);if(j&&!['cancelled'].includes(j.status))throw Error('уборка '+j.status);return j?j.status:'не было';});
 }
 // Third: the owner rejects.
 const b3=await step('третья заявка',async()=>(await guest2.createBooking(bookingBody(k,id,[s2,e2],'b3-'+k.type))).id);
 if(b3)await step('владелец отклонил',async()=>(await owner.bookingAction(b3,{action:'reject',reason:'Даты заняты'})).message);
}
// Home cleaning.
current='уборка на дом';
const start=new Date((Math.floor(now()/3600)+30)*3600*1000).toISOString();
await step('заказ уборки на дом',async()=>{const r=await orderHomeCleaning(homeClient,{kind:'standard',rooms:2,windows:0,wishes:'',start,address:'ул. Домашняя, 5',city:'Павлодар',district:'Центр',fee:9000},{});return r;});
const hj=R.prepare("SELECT j.* FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE p.owner_id='client'").get();
if(hj){
 await step('исполнитель видит заказ',async()=>{const st=await cleaner2.roleState('cleaner');if(!st.jobs.some(j=>j.id===hj.id))throw Error('не видит');return 'видит';});
 await step('исполнитель откликнулся',async()=>(await cleaner2.jobAction(hj.id,{action:'apply'})).message);
 const app=R.prepare("SELECT id FROM applications WHERE job_id=? AND user_id='cleaner2'").get(hj.id);
 await step('заказчик выбрал исполнителя',async()=>(await homeClient.jobAction(hj.id,{action:'assign',applicationId:app?.id})).message);
 R.prepare('UPDATE cleaning_jobs SET start=?,end=end-start+? WHERE id=?').run(now()+600,now()+600,hj.id);
 await step('«Выезжаю»',async()=>(await cleaner2.jobAction(hj.id,{action:'on_way'})).message);
 await step('«Я на месте»',async()=>(await cleaner2.jobAction(hj.id,{action:'arrived'})).message);
 await step('начал уборку',async()=>(await cleaner2.jobAction(hj.id,{action:'start'})).message);
 const jj=R.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(hj.id);const order=homeOrderOf(jj.description);const named=order?homeChecklist(order):null;
 await step('фото до и после',async()=>{for(const phase of ['before','after'])await saveEvidence(cleaner2,{jobId:hj.id,phase,data:photo});return '2 фото';});
 await step('отчёт по чек-листу',async()=>(await cleaner2.jobAction(hj.id,{action:'submit',report:'Готово',checklist:(named||[1,2,3,4]).map(()=>true),...(named?{items:named}:{})})).message);
 await step('заказчик принял',async()=>(await homeClient.jobAction(hj.id,{action:'approve'})).message);
 await step('заказчик оценил',async()=>(await homeClient.jobAction(hj.id,{action:'rate',rating:5})).message);
 await step('второй заказ и отмена в бесплатный срок',async()=>{const st2=new Date((Math.floor(now()/3600)+48)*3600*1000).toISOString();await orderHomeCleaning(homeClient,{kind:'general',rooms:2,windows:2,start:st2,propertyId:hj.property_id,fee:15000},{});const j=R.prepare("SELECT id FROM cleaning_jobs WHERE property_id=? AND status='open'").get(hj.property_id);return (await homeClient.jobAction(j.id,{action:'cancel',expectedFee:0})).message;});
} else results.push({group:current,name:'заказ создал задание',ok:false,note:'нет задания'});


// Extra situations on one flat.
current='особые случаи';
{
 const id=(await owner.saveListing(null,listingFor({type:'apartment',mode:'daily'},[await pic(owner)]))).id;R.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);
 const o=R.prepare('SELECT version FROM property_operations WHERE property_id=?').get(id);await owner.readinessAction(id,{readiness:'ready',note:'ok',inspected:true,expectedVersion:o.version});
 const k={type:'apartment',mode:'daily'},d0=day+20*86400,span=(n)=>[d0+n*3*86400+9*3600,d0+n*3*86400+86400+7*3600];
 const terms=b=>R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(b);
 // 1. Guest moves the dates, owner accepts, guest pays the difference.
 const b=await step('бронь для переноса',async()=>(await guest.createBooking(bookingBody(k,id,span(0),'x1'))).id);
 await owner.bookingAction(b,{action:'confirm',cleaningFee:3000});await payDirect(guest,b,'all');
 const [ns,ne]=[span(0)[0],span(0)[1]+86400];
 const cq=await step('гость рассчитал продление на сутки',async()=>{const q=await guest.bookingChangeQuote(b,'guest',{start:iso(ns),end:iso(ne)});return q;});
 const ch=await step('гость отправил изменение',async()=>(await guest.proposeBookingChange(b,'guest',{start:iso(ns),end:iso(ne),requestKey:'c1',expectedAmount:cq?.amount,baseVersion:cq?.baseVersion,policyVersion:cq?.policyVersion,acceptTerms:true,reason:'Задержусь на день'})).id);
 await step('владелец принял изменение',async()=>(await owner.decideBookingChange(b,ch,'owner',{action:'accept'})).message);
 await step('сумма брони выросла',async()=>{const x=R.prepare('SELECT amount FROM bookings WHERE id=?').get(b).amount;if(x!==24000)throw Error('amount='+x);return String(x);});
 await step('гость доплатил разницу',async()=>(await payDirect(guest,b,'payment')).message);
 await step('уборка сдвинулась на новый выезд',async()=>{const j=R.prepare("SELECT start FROM cleaning_jobs WHERE booking_id=? AND status<>'cancelled'").get(b);if(!j)throw Error('нет уборки');if(j.start<ne-3600)throw Error('уборка в '+iso(j.start)+', выезд '+iso(ne));return iso(j.start);});
 // 2. Late cancellation: what the guest gets back.
 const b2=await step('бронь для поздней отмены',async()=>(await guest2.createBooking(bookingBody(k,id,span(1),'x2'))).id);
 await owner.bookingAction(b2,{action:'confirm',cleaningFee:3000});await payDirect(guest2,b2,'all');
 startIn(b2,3*3600);
 await step('поздняя отмена гостем (за 3 часа)',async()=>(await guest2.bookingAction(b2,{action:'cancel',reason:'Не успеваю'})).message);
 await step('возврат по правилам',async()=>{const t=terms(b2);return 'к возврату '+t.refund_due+' из '+t.paid_amount;});
 await step('владелец отметил возврат и депозит',async()=>{await owner.bookingAction(b2,{action:'record_refund',confirmed:true,expectedVersion:terms(b2).version});return (await owner.bookingAction(b2,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(b2).version})).message;});
 // 3. Owner cancels a confirmed booking.
 const b3=await step('бронь, которую отменит владелец',async()=>(await guest.createBooking(bookingBody(k,id,span(2),'x3'))).id);
 await owner.bookingAction(b3,{action:'confirm',cleaningFee:3000});await payDirect(guest,b3,'payment');
 await step('владелец отменил подтверждённую',async()=>(await owner.bookingAction(b3,{action:'cancel',reason:'Авария, нет воды'})).message);
 await step('гостю положен полный возврат',async()=>{const t=terms(b3);if(t.refund_due!==null&&t.refund_due<t.paid_amount)throw Error('refund_due='+t.refund_due+' paid='+t.paid_amount);return 'refund_due='+t.refund_due;});
 // 4. Stay with damage: owner disputes checkout, then keeps part of the deposit.
 const b4=await step('бронь с ущербом',async()=>(await guest.createBooking(bookingBody(k,id,span(3),'x4'))).id);
 await owner.bookingAction(b4,{action:'confirm',cleaningFee:3000});await payDirect(guest,b4,'all');
 startIn(b4,5*60);await guest.bookingAction(b4,{action:'report_checkin'});await owner.bookingAction(b4,{action:'checkin'});endNow(b4);
 await guest.bookingAction(b4,{action:'report_checkout'});
 await step('владелец оспорил выезд',async()=>(await owner.bookingAction(b4,{action:'dispute_checkout',reason:'Ключи не оставлены'})).message);
 await guest.bookingAction(b4,{action:'report_checkout'});await owner.bookingAction(b4,{action:'checkout'});
 await step('приёмка с замечаниями и фото',async()=>(await saveHandover(owner,{bookingId:b4,verdict:'issues',issues:['damage'],note:'Разбита кружка'})).message);
 await step('удержание из депозита',async()=>(await owner.bookingAction(b4,{action:'keep_deposit',amount:2000,reason:'Разбита кружка'})).message);
 await step('возврат остатка депозита',async()=>{const r=await owner.bookingAction(b4,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(b4).version});const back=R.prepare("SELECT SUM(amount) n FROM finance_entries WHERE booking_id=? AND kind='deposit_return'").get(b4).n;if(back!==8000)throw Error('вернули '+back);return r.message+' '+back;});
 // 5. Cleaning: report sent back for rework, then the cleaner gives up a second job.
 const job=R.prepare("SELECT * FROM cleaning_jobs WHERE booking_id=? AND status<>'cancelled'").get(b4);
 if(job){
  await cleaner.jobAction(job.id,{action:'apply'});const a=R.prepare("SELECT id FROM applications WHERE job_id=? AND user_id='cleaner'").get(job.id);await owner.jobAction(job.id,{action:'assign',applicationId:a.id});
  R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-60,now()+3600,job.id);await cleaner.jobAction(job.id,{action:'start'});
  await cleaner.jobAction(job.id,{action:'submit',report:'Готово',checklist:[true,true,true,true]});
  await step('владелец вернул на доработку',async()=>(await owner.jobAction(job.id,{action:'revise',reason:'Пыль на полках'})).message);
  await step('исполнитель отправил снова',async()=>(await cleaner.jobAction(job.id,{action:'submit',report:'Протёрла полки',checklist:[true,true,true,true]})).message);
  await step('приёмка после доработки',async()=>(await owner.jobAction(job.id,{action:'approve'})).message);
 }
 await step('владелец создал уборку вручную',async()=>(await owner.createJob({propertyId:id,start:iso(now()+5*3600),end:iso(now()+7*3600),fee:4000,description:'Генеральная уборка',requestKey:'mj'})).message);
 const mj=R.prepare("SELECT * FROM cleaning_jobs WHERE property_id=? AND booking_id IS NULL AND status='open'").get(id);
 if(mj){
  await cleaner2.jobAction(mj.id,{action:'apply'});
  await step('исполнитель отозвал отклик',async()=>(await cleaner2.jobAction(mj.id,{action:'withdraw'})).message);
  await cleaner.jobAction(mj.id,{action:'apply'});const a=R.prepare("SELECT id FROM applications WHERE job_id=? AND user_id='cleaner'").get(mj.id);await owner.jobAction(mj.id,{action:'assign',applicationId:a.id});
  await step('исполнитель отказался после назначения',async()=>(await cleaner.jobAction(mj.id,{action:'release'})).message);
  await step('уборка снова в поиске',async()=>{const j=R.prepare('SELECT status,assigned_to FROM cleaning_jobs WHERE id=?').get(mj.id);if(j.status!=='open'||j.assigned_to)throw Error(j.status+' '+j.assigned_to);return 'open';});
  await step('владелец отменил уборку',async()=>(await owner.jobAction(mj.id,{action:'cancel',reason:'Не нужна'})).message);
 }
 await step('гость не может забронировать занятые даты',async()=>{try{await guest2.createBooking(bookingBody(k,id,[ns,ne],'x9'));}catch(e){return 'отказ: '+e.message;}throw Error('бронь на занятые даты прошла');});
 await step('владелец не может забронировать своё',async()=>{try{await owner.createBooking(bookingBody(k,id,span(5),'x10'));}catch(e){return 'отказ: '+e.message.slice(0,60);}throw Error('прошла');});
}

f.db.close();
test('every category goes through booking, payment, stay, cleaning and refunds',()=>{
 assert.deepEqual(results.filter(r=>!r.ok).map(r=>r.group+': '+r.name+' — '+r.note),[]);
 assert.ok(results.length>400);
});
