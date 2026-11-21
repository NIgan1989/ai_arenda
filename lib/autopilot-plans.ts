import {DomainError,number} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {underAutopilot,setGuestMode} from './autopilot';
import {dueOf,sweepDues,servicePaused} from './service-dues';
import {declineAssignment} from './dispatch';
import {autopilotWeek} from './autopilot-week-db';
import {sweepHallMonths} from './platform-billing';

// «Автопилот» and the tariff. Since 2026-11-22 there is one tariff in percent: the owner pays rate_bp (4%) of every
// booking confirmed through the service (lib/platform-billing.ts), the performer cleaner_rate_bp (5%) of every
// cleaning accepted through it (the trigger of migration 0086). «Автопилот» itself costs nothing extra: a plan row only
// means the participant's AI is on. The old 'all' tier («Всё включено») is no longer offered; its code paths stay so
// that rows written before the change still read.
// Everything is summed up and taken from the linked card on Monday (lib/service-dues.ts); an unpaid week pauses
// the plan: objects go back to «Я сам», the performer's AI stops accepting. Nothing confirmed is cancelled.
// While charging is off (no bank yet) the service only records what it would take.
export type PlanRole='owner'|'cleaner';
export type Tier='pay'|'all';
const DAY=86400,MONTH=30*DAY,ZONE=5*3600;
export const LIVE="('trial','active','grace')";
export const livePlanSql=(user:string,role:PlanRole)=>`EXISTS(SELECT 1 FROM autopilot_plans ap WHERE ap.user_id=${user} AND ap.role='${role}' AND ap.status IN ${LIVE})`;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const dateText=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
const timeText=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
// Local (UTC+5) calendar helpers.
export const localDay=(t:number)=>Math.floor((t+ZONE)/DAY);
const dayStart=(t:number)=>localDay(t)*DAY-ZONE;
const minuteOfDay=(t:number)=>Math.floor(((t+ZONE)%DAY)/60);
const weekday=(t:number)=>(localDay(t)+3)%7; // 0 = Monday
const isoDay=(t:number)=>new Date((t+ZONE)*1000).toISOString().slice(0,10);

// ownerPrice and cleanerPrice are the monthly prices of «Всё включено»; the rest is paid for the result.
// ownerRate and cleanerRate (basis points) are the tariff; the other prices are kept at 0 since 2026-11-22.
export type PlanSettings={charge:boolean;ownerCharge:boolean;ownerRate:number;cleanerRate:number;ownerPrice:number;cleanerPrice:number;graceDays:number;aiBookingFee:number;aiMonthCap:number;cleanerJobFee:number;cleanerFreeJobs:number;cleanerMonthCap:number};
export async function planSettings(db:D1Database):Promise<PlanSettings>{
 const s=await one(db,"SELECT plan_charge,enabled,starts_at,rate_bp,cleaner_rate_bp,plan_owner_price,plan_cleaner_price,plan_grace_days,ai_booking_fee,ai_month_cap,cleaner_job_fee,cleaner_free_jobs,cleaner_month_cap FROM platform_billing WHERE id='global'");
 // The owner's percent is taken by the booking billing switch (lib/platform-billing.ts), the cleaner's by plan_charge.
 return {charge:!!s?.plan_charge,ownerCharge:!!s?.enabled&&Number(s?.starts_at)<=epoch(),ownerRate:Number(s?.rate_bp??400),cleanerRate:Number(s?.cleaner_rate_bp??500),ownerPrice:Number(s?.plan_owner_price??9900),cleanerPrice:Number(s?.plan_cleaner_price??2900),graceDays:Number(s?.plan_grace_days??3),
  aiBookingFee:Number(s?.ai_booking_fee??0),aiMonthCap:Number(s?.ai_month_cap??0),cleanerJobFee:Number(s?.cleaner_job_fee??0),cleanerFreeJobs:Number(s?.cleaner_free_jobs??0),cleanerMonthCap:Number(s?.cleaner_month_cap??0)};
}
export const percentText=(bp:number)=>String(bp/100).replace('.',',')+'%';
export const planOf=(db:D1Database,user:string,role:PlanRole)=>one(db,'SELECT * FROM autopilot_plans WHERE user_id=? AND role=?',user,role);
// The owner's objects that «Всё включено» covers: every rented one (not «Мой дом», not archived, not demo).
const rentedSql="p.archived_at IS NULL AND p.demo_owner IS NULL AND NOT EXISTS(SELECT 1 FROM property_details hd WHERE hd.property_id=p.id AND json_extract(hd.details,'$.type')='home')";
export const objectCount=async(db:D1Database,owner:string)=>Number((await one(db,`SELECT COUNT(*) n FROM properties p WHERE p.owner_id=? AND ${rentedSql}`,owner))?.n||0);
/** The monthly price of «Всё включено». */
export const priceFor=(s:PlanSettings,role:PlanRole,units:number)=>role==='owner'?s.ownerPrice*units:s.cleanerPrice;
const unitsFor=async(db:D1Database,role:PlanRole,user:string)=>role==='owner'?Math.max(1,await objectCount(db,user)):1;

// Accrues one month of «Всё включено». The money itself is taken from the linked card with the rest of the service
// fees (lib/service-dues.ts), so a month is never refused here: an unpaid week pauses the plan there.
async function chargeMonth(db:D1Database,plan:Row,s:PlanSettings,at:number,from:number):Promise<{ok:boolean;amount:number;units:number}>{
 const role=plan.role as PlanRole,units=await unitsFor(db,role,plan.user_id),amount=priceFor(s,role,units);
 await q(db,'INSERT OR IGNORE INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,mode,settled_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',uuid(),plan.user_id,role,from,from+MONTH,units,amount,s.charge&&amount>0?'charged':'shadow',role==='owner'||!s.charge?at:null,at).run();
 return {ok:true,amount,units};
}

// The owner's flats leave the AI: the same switches «Я сам» sets, with new policy versions so old answers expire.
async function ownerFlatsOff(db:D1Database,owner:string,at:number){
 const flats=await rows(db,`SELECT p.id FROM properties p WHERE p.owner_id=? AND ${underAutopilot('p.id')}`,owner,at);
 for(const f of flats)await db.batch([
  q(db,'UPDATE property_policies SET auto_confirm=0,auto_assign=0,version=version+1,revision=?,updated_at=? WHERE property_id=?',uuid(),at,f.id),
  q(db,'UPDATE operation_rules SET auto_offers=0,auto_replace=0,version=version+1,updated_at=? WHERE property_id=?',at,f.id),
  q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),'system:autopilot-plan',f.id,JSON.stringify({action:'property.guest_mode',mode:'manual',reason:'plan_paused'}),at)
 ]);
 return flats.length;
}
async function pause(db:D1Database,plan:Row,at:number,why:string){
 const r=await q(db,"UPDATE autopilot_plans SET status='paused',grace_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",at,plan.user_id,plan.role,plan.version).run();
 if(!r.meta.changes)return false;
 if(plan.role==='owner')await ownerFlatsOff(db,plan.user_id,at);
 await notice(db,plan.user_id,why,plan.role+':autopilot-paused:'+plan.user_id+':'+at,at).run();
 return true;
}

const payNote=(s:PlanSettings,role:PlanRole)=>role==='owner'
 ?`Тариф: ${percentText(s.ownerRate)} с каждого заселения. Автопилот, ИИ-администратор и подбор исполнителя входят, доплат нет.`
 :`Автопилот бесплатный. Тариф: ${percentText(s.cleanerRate)} с каждой выполненной уборки.`;
export const tierText=(s:PlanSettings,role:PlanRole)=>({pay:payNote(s,role),all:payNote(s,role)});

// Turns the AI on. Paying for the result needs no month and no trial: the plan is simply on ('pay'). A plan already
// on stays as it is (a «Всё включено» set to end is renewed again).
export async function ensurePlan(db:D1Database,user:string,role:PlanRole,at=epoch()){
 const plan=await planOf(db,user,role),s=await planSettings(db);
 if(plan&&['trial','active','grace'].includes(plan.status)){
  if(!plan.auto_renew)await q(db,'UPDATE autopilot_plans SET auto_renew=1,version=version+1,updated_at=? WHERE user_id=? AND role=?',at,user,role).run();
  return {status:plan.status,started:false};
 }
 // Paused for an unpaid week: nothing starts until the debt is paid.
 if(await servicePaused(db,user))throw new DomainError('Сначала оплатите услуги сервиса: Меню, «Настройки», «Оплата услуг». После оплаты автопилот включится.',402);
 await db.batch([
  q(db,"INSERT INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at,tier) VALUES (?,?,'active',?,?,?,'pay') ON CONFLICT(user_id,role) DO UPDATE SET status='active',tier='pay',next_tier=NULL,period_end=excluded.period_end,grace_until=NULL,auto_renew=1,version=autopilot_plans.version+1,updated_at=excluded.updated_at",user,role,at,at+MONTH,at),
  notice(db,user,'Автопилот включён. '+payNote(s,role)+((role==='owner'?s.ownerCharge:s.charge)?' Списание раз в неделю с привязанной карты.':' Пока плата не взимается.'),role+':autopilot-on:'+user+':'+at,at)
 ]);
 return {status:'active',started:true};
}

// The way to pay: for the result ('pay') or «Всё включено» ('all'). «Всё включено» is paid for a month at once;
// going back to 'pay' takes effect when the paid month ends (at once while charging is off).
export async function setTier(service:RentalService,role:PlanRole,body:Row){
 await service.requireRole(role);
 const db=service.db,user=service.userId,at=epoch(),want:Tier=body.tier==='all'?'all':'pay',s=await planSettings(db),plan=await planOf(db,user,role);
 const live=!!plan&&['trial','active','grace'].includes(plan.status);
 // One tariff since 2026-11-22: «Всё включено» is not offered any more.
 if(want==='all')throw new DomainError('Тариф один: '+payNote(s,role).replace(/^Тариф: /,''),409);
 if(!live||plan.tier==='pay')return {message:'Тариф один, в процентах: ничего менять не нужно.',state:await planState(service,role)};
 if(s.charge&&plan.status==='active'){
  await q(db,"UPDATE autopilot_plans SET next_tier='pay',auto_renew=1,version=version+1,updated_at=? WHERE user_id=? AND role=?",at,user,role).run();
  return {message:`«Всё включено» оплачено до ${dateText(plan.period_end)}. Потом — оплата за результат.`,state:await planState(service,role)};
 }
 await q(db,"UPDATE autopilot_plans SET tier='pay',next_tier=NULL,status='active',grace_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND role=?",at,user,role).run();
 return {message:'Теперь вы платите только за результат.',state:await planState(service,role)};
}

// Stop: paying for the result stops now; a paid month of «Всё включено» runs to its end and is not renewed.
export async function stopPlan(service:RentalService,role:PlanRole){
 await service.requireRole(role);
 const at=epoch(),plan=await planOf(service.db,service.userId,role);
 if(!plan||plan.status==='paused')return {message:'Автопилот уже выключен.'};
 const s=await planSettings(service.db);
 if(plan.status==='active'&&plan.tier==='all'&&s.charge){await q(service.db,'UPDATE autopilot_plans SET auto_renew=0,next_tier=NULL,version=version+1,updated_at=? WHERE user_id=? AND role=?',at,service.userId,role).run();return {message:`Автопилот работает до ${dateText(plan.period_end)} и не продлится. Включить снова можно ${role==='owner'?'в настройках жилья':'в меню'}.`};}
 await pause(service.db,plan,at,role==='owner'?'Автопилот выключен. Объекты в режиме «Я сам»: запросы гостей приходят вам.':'Автопилот выключен. Предложения уборок снова приходят вам на решение.');
 return {message:role==='owner'?'Автопилот выключен. Объекты переведены в режим «Я сам».':'Автопилот выключен.'};
}

// Owner: turn the plan on and put the chosen flats under the AI. Every flat is checked first (tariffs, cleaning
// price, mandate); only the flats that pass are switched.
export async function startOwnerPlan(service:RentalService,body:Row){
 await service.requireRole('owner');
 const ids:string[]=Array.isArray(body.propertyIds)?[...new Set<string>(body.propertyIds.map(String))].slice(0,50):[];
 if(!ids.length)throw new DomainError('Выберите объекты для автопилота.');
 const ready:string[]=[],failed:{id:string;error:string}[]=[];
 for(const id of ids){try{await setGuestMode(service,{propertyId:id,mode:'auto',cleaningFee:body.cleaningFees?.[id],check:true});ready.push(id);}catch(e){if(e instanceof DomainError)failed.push({id,error:e.message});else throw e;}}
 if(!ready.length)return {message:'Автопилот не включён: '+failed.map(f=>f.error).join(' '),done:[],failed,state:await planState(service,'owner')};
 await ensurePlan(service.db,service.userId,'owner',epoch());
 const done:string[]=[];
 for(const id of ready){try{await setGuestMode(service,{propertyId:id,mode:'auto',cleaningFee:body.cleaningFees?.[id]});done.push(id);}catch(e){if(e instanceof DomainError)failed.push({id,error:e.message});else throw e;}}
 return {message:done.length?`Автопилот включён для ${done.length} ${done.length===1?'объекта':'объектов'}.`+(failed.length?' Не получилось: '+failed.map(f=>f.error).join(' '):''):'Автопилот не включён: '+failed.map(f=>f.error).join(' '),done,failed,state:await planState(service,'owner')};
}

export async function startCleanerPlan(service:RentalService,body:Row){
 await service.requireRole('cleaner');
 await saveCleanerRules(service,body);
 await ensurePlan(service.db,service.userId,'cleaner');
 return {message:'Автопилот включён: ИИ будет брать уборки по вашим правилам.',state:await planState(service,'cleaner')};
}

export async function saveCleanerRules(service:RentalService,body:Row){
 await service.requireRole('cleaner');
 const districts=Array.isArray(body.districts)?[...new Set(body.districts.map((d:unknown)=>String(d).trim().slice(0,60)).filter(Boolean))].slice(0,20):[];
 const days=number(body.days??127,'Дни',0,127),from=number(body.fromMinute??540,'Начало дня',0,1440),to=number(body.toMinute??1200,'Конец дня',0,1440);
 if(to-from<60)throw new DomainError('Окно работы должно быть не меньше часа.');
 if(!days)throw new DomainError('Выберите хотя бы один рабочий день.');
 const minFee=number(body.minFee??0,'Минимальная оплата',0,1000000),max=number(body.maxPerDay??4,'Уборок в день',1,20),at=epoch();
 await q(service.db,'INSERT INTO cleaner_autopilot(user_id,districts,days,from_minute,to_minute,min_fee,max_per_day,ask_new_owner,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET districts=excluded.districts,days=excluded.days,from_minute=excluded.from_minute,to_minute=excluded.to_minute,min_fee=excluded.min_fee,max_per_day=excluded.max_per_day,ask_new_owner=excluded.ask_new_owner,version=cleaner_autopilot.version+1,updated_at=excluded.updated_at',service.userId,JSON.stringify(districts),days,from,to,minFee,max,body.askNewOwner===false?0:1,at).run();
 return {message:'Правила сохранены.'};
}

// The cleaner cannot work today: the AI stops accepting until tomorrow and gives back today's cleanings,
// so each owner's AI looks for a replacement at once.
export async function awayToday(service:RentalService){
 await service.requireRole('cleaner');
 const at=epoch(),end=dayStart(at)+DAY;
 await q(service.db,'UPDATE cleaner_autopilot SET paused_until=?,updated_at=? WHERE user_id=?',end,at,service.userId).run();
 // Today's offers already accepted but not yet assigned are taken back too, so nobody assigns them after this.
 const todayOpen="SELECT id FROM cleaning_jobs WHERE status='open' AND start<? AND end>?";
 await service.db.batch([
  q(service.db,`UPDATE cleaning_offers SET status='declined',decided_at=? WHERE worker_id=? AND status='accepted' AND job_id IN (${todayOpen})`,at,service.userId,end,at),
  q(service.db,`UPDATE applications SET status='rejected' WHERE user_id=? AND status='pending' AND job_id IN (${todayOpen})`,service.userId,end,at)
 ]);
 const jobs=await rows(service.db,"SELECT id FROM cleaning_jobs WHERE assigned_to=? AND status='assigned' AND start<? AND end>?",service.userId,end,at);
 let released=0;
 for(const j of jobs){try{await declineAssignment(service,{jobId:j.id,reason:'Исполнитель не может выйти сегодня. ИИ-администратор ищет замену.'});released++;}catch(e){if(!(e instanceof DomainError))throw e;}}
 return {message:released?`Сегодняшние уборки (${released}) возвращены владельцам, ИИ-администратор ищет замену. До завтра новые уборки не берём.`:'До завтра ИИ не берёт для вас новые уборки.',released};
}

// Does this cleaning fit the cleaner's autopilot? Rules, the plan and today's load; a new owner is asked
// about when the cleaner wants that.
export async function autopilotFits(db:D1Database,worker:string,job:Row,at=epoch()):Promise<boolean>{
 const r=await one(db,`SELECT c.* FROM cleaner_autopilot c WHERE c.user_id=? AND c.paused_until<=? AND ${livePlanSql('c.user_id','cleaner')}`,worker,at);
 if(!r)return false;
 let districts:string[]=[];try{districts=JSON.parse(r.districts||'[]');}catch{}
 if(districts.length&&!districts.some(d=>d.toLowerCase()===String(job.district||'').trim().toLowerCase()))return false;
 if(!(r.days>>weekday(job.start)&1))return false;
 const from=minuteOfDay(job.start),to=localDay(job.end-1)===localDay(job.start)?minuteOfDay(job.end-1)+1:1441;
 // «Весь день» (00:00–24:00) takes a job that runs past midnight too; a narrower window keeps the job inside it.
 const allDay=r.from_minute<=0&&r.to_minute>=1440;
 if(!allDay&&(from<r.from_minute||to>r.to_minute))return false;
 if(Number(job.fee)<r.min_fee)return false;
 const dayFrom=dayStart(job.start),load=await one(db,"SELECT (SELECT COUNT(*) FROM cleaning_jobs WHERE assigned_to=? AND status IN ('assigned','in_progress','submitted','completed') AND start>=? AND start<?)+(SELECT COUNT(*) FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id WHERE o.worker_id=? AND o.status='accepted' AND j.status='open' AND o.start>=? AND o.start<?) n",worker,dayFrom,dayFrom+DAY,worker,dayFrom,dayFrom+DAY);
 if(Number(load?.n||0)>=r.max_per_day)return false;
 if(r.ask_new_owner&&!await one(db,"SELECT 1 FROM cleaning_jobs WHERE owner_id=? AND assigned_to=? AND status='completed' LIMIT 1",job.owner_id,worker))return false;
 return true;
}

// What the participant paid (or would pay, while charging is off) for the result in a period: the owner's commissions,
// match fees and «Автопилот» per booking; the performer's fees per cleaning. Cancelled bookings and free ones do not count.
export async function spentFor(db:D1Database,user:string,role:PlanRole,from:number,to:number){
 const liveBooking="(SELECT status FROM bookings WHERE id=%s) IN ('confirmed','completed')";
 const fees=`COALESCE((SELECT SUM(f.amount) FROM service_fees f WHERE f.user_id=?1 AND f.role='${role}' AND f.mode IN ('charged','shadow') AND f.created_at>=?2 AND f.created_at<=?3 AND (f.kind<>'ai_booking' OR ${liveBooking.replace('%s','f.ref_id')})),0)`;
 const sql=role==='owner'?`SELECT ${fees}+COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=?1 AND c.mode IN ('charged','shadow') AND c.created_at>=?2 AND c.created_at<=?3 AND ${liveBooking.replace('%s','c.booking_id')}),0)
  +COALESCE((SELECT SUM(amount) FROM cleaning_commissions WHERE owner_id=?1 AND mode IN ('charged','shadow') AND created_at>=?2 AND created_at<=?3),0) n`:`SELECT ${fees} n`;
 return Number((await one(db,sql,user,from,to))?.n||0);
}

export async function planState(service:RentalService,role:PlanRole){
 const db=service.db,at=epoch(),s=await planSettings(db),plan=await planOf(db,service.userId,role),week=at-7*DAY;
 const live=!!plan&&['trial','active','grace'].includes(plan.status);
 const tier:Tier=live&&plan.tier==='all'?'all':'pay',units=await unitsFor(db,role,service.userId),allAmount=priceFor(s,role,units),spent30=await spentFor(db,service.userId,role,at-MONTH,at);
  const freeLeft=role==='cleaner'?Math.max(0,s.cleanerFreeJobs-Number((await one(db,"SELECT COUNT(*) n FROM service_fees WHERE user_id=? AND kind='cleaning' AND mode IN ('free','charged')",service.userId))?.n||0)):0;
 const base={plan:plan?{status:plan.status,periodEnd:plan.period_end,graceUntil:plan.grace_until,autoRenew:!!plan.auto_renew,startedAt:plan.started_at,tier:plan.tier,nextTier:plan.next_tier||null}:null,live,tier,
  settings:{charge:role==='owner'?s.ownerCharge:s.charge,rate:role==='owner'?s.ownerRate:s.cleanerRate,ownerRate:s.ownerRate,cleanerRate:s.cleanerRate,price:role==='owner'?s.ownerPrice:s.cleanerPrice,trialDays:0,graceDays:s.graceDays,aiBookingFee:s.aiBookingFee,aiMonthCap:s.aiMonthCap,cleanerJobFee:s.cleanerJobFee,cleanerFreeJobs:s.cleanerFreeJobs,cleanerMonthCap:s.cleanerMonthCap},
  terms:tierText(s,role),billing:{objects:role==='owner'?units:1,allAmount,spent30,advise:false,freeLeft}};
 if(role==='owner'){
  // A private home that is only cleaned (lib/home-cleaning.ts) is not rented, so it is not offered to the AI.
  const flats=await rows(db,`SELECT p.id,p.title,p.own_staff,COALESCE(pp.cleaning_fee,0) cleaning_fee,pp.property_id IS NOT NULL has_policy,CASE WHEN ${underAutopilot('p.id')} THEN 1 ELSE 0 END managed FROM properties p LEFT JOIN property_policies pp ON pp.property_id=p.id WHERE p.owner_id=? AND NOT EXISTS(SELECT 1 FROM property_details hd WHERE hd.property_id=p.id AND json_extract(hd.details,'$.type')='home') AND p.archived_at IS NULL AND p.demo_owner IS NULL ORDER BY p.created_at`,at,service.userId);
  const managed=flats.filter(f=>f.managed).length;
  const stats=await one(db,`SELECT (SELECT COUNT(*) FROM audit_events a JOIN properties p ON p.id=a.entity_id WHERE p.owner_id=? AND a.actor_id='system:autopilot' AND a.created_at>?) answered,
   (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND b.status IN ('confirmed','completed') AND b.created_at>? AND ${underAutopilot('p.id')}) bookings,
   (SELECT COUNT(*) FROM cleaning_jobs j WHERE j.owner_id=? AND j.status='completed' AND j.completed_at>? AND ${underAutopilot('j.property_id')}) cleanings`,service.userId,week,service.userId,week,at,service.userId,week,at);
  // An owner with a banquet hall or a café sees its month too (lib/platform-billing.ts sweepHallMonths).
  const hall=await one(db,"SELECT s.hall_small_upto,s.hall_mid_upto,s.hall_fee_small,s.hall_fee_mid,s.hall_fee_large FROM platform_billing s WHERE s.id='global' AND EXISTS(SELECT 1 FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND json_extract(d.details,'$.type') IN ('banquet','cafe'))",service.userId);
  const hallScale=hall?{smallUpto:Number(hall.hall_small_upto),midUpto:Number(hall.hall_mid_upto),small:Number(hall.hall_fee_small),mid:Number(hall.hall_fee_mid),large:Number(hall.hall_fee_large)}:null;
  return {...base,hallScale,flats:flats.map(f=>({id:f.id,title:f.title,ownStaff:!!f.own_staff,cleaningFee:f.cleaning_fee,ready:!!f.has_policy,managed:!!f.managed})),units:managed,nextAmount:allAmount,due:await dueOf(db,service.userId),week:{answered:Number(stats?.answered||0),bookings:Number(stats?.bookings||0),cleanings:Number(stats?.cleanings||0)}};
 }
 const rules=await one(db,'SELECT * FROM cleaner_autopilot WHERE user_id=?',service.userId);
 let districts:string[]=[];try{districts=JSON.parse(rules?.districts||'[]');}catch{}
 const profile=await one(db,'SELECT city FROM profiles WHERE id=?',service.userId);
 const cityDistricts=(await rows(db,"SELECT DISTINCT district FROM properties WHERE city=? AND district<>'' AND archived_at IS NULL ORDER BY district LIMIT 30",profile?.city||'')).map(r=>r.district);
 const today=await rows(db,"SELECT j.id,j.start,j.end,j.fee,p.title,p.address,p.district FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.assigned_to=? AND j.status IN ('assigned','in_progress') AND j.start<? AND j.end>? ORDER BY j.start",service.userId,dayStart(at)+DAY,dayStart(at));
 const stats=await one(db,"SELECT (SELECT COUNT(*) FROM audit_events WHERE actor_id='system:cleaner-autopilot' AND entity_id IN (SELECT id FROM cleaning_offers WHERE worker_id=?) AND created_at>?) taken,(SELECT COALESCE(SUM(fee),0) FROM cleaning_jobs WHERE assigned_to=? AND status='completed' AND completed_at>?) earned",service.userId,week,service.userId,week);
 return {...base,rules:rules?{districts,days:rules.days,fromMinute:rules.from_minute,toMinute:rules.to_minute,minFee:rules.min_fee,maxPerDay:rules.max_per_day,askNewOwner:!!rules.ask_new_owner,pausedUntil:rules.paused_until}:null,cityDistricts,today:today.map(j=>({...j,from:timeText(j.start),to:timeText(j.end)})),week:{taken:Number(stats?.taken||0),earned:Number(stats?.earned||0)}};
}

// The daily round: renewals of «Всё включено» (or its return to paying for the result), grace, pauses, reminders,
// the cleaner's day plan at 8:00 and the owner's Monday report.
export async function sweepPlans(db:D1Database,at=epoch(),config:{PLATFORM_ADMIN_IDS?:string}={}){
 const s=await planSettings(db),result:Row={renewed:0,grace:0,paused:0,reminded:0,dayPlans:0,reports:0};
 const due=await rows(db,`SELECT * FROM autopilot_plans WHERE tier='all' AND ((status IN ('trial','active') AND period_end<=?) OR status='grace') ORDER BY period_end LIMIT 100`,at);
 for(const plan of due){
  // An explicit stop wins over a scheduled return to paying for the result.
  if(plan.status!=='grace'&&!plan.auto_renew){if(await pause(db,plan,at,'Автопилот выключен: оплаченный месяц «Всё включено» закончился. Включить снова можно '+(plan.role==='owner'?'в настройках жилья.':'в меню.')))result.paused++;continue;}
  if(plan.status!=='grace'&&plan.next_tier==='pay'){
   const r=await q(db,"UPDATE autopilot_plans SET tier='pay',next_tier=NULL,period_end=?,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",at+MONTH,at,plan.user_id,plan.role,plan.version).run();
   if(r.meta.changes){result.renewed++;await notice(db,plan.user_id,'«Всё включено» закончилось. Дальше вы платите только за результат: '+payNote(s,plan.role).charAt(0).toLowerCase()+payNote(s,plan.role).slice(1),plan.role+':plan-pay:'+plan.user_id+':'+plan.period_end,at).run();}
   continue;
  }
  const from=plan.status==='grace'?at:Math.max(plan.period_end,at-DAY),paid=await chargeMonth(db,plan,s,at,from);
  if(paid.ok){
   const r=await q(db,"UPDATE autopilot_plans SET status='active',period_end=?,grace_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",from+MONTH,at,plan.user_id,plan.role,plan.version).run();
   if(r.meta.changes){result.renewed++;if(s.charge&&paid.amount>0)await notice(db,plan.user_id,`«Всё включено» продлено до ${dateText(from+MONTH)}: ${money(paid.amount)} спишется с привязанной карты вместе с остальными услугами.`,plan.role+':autopilot-paid:'+plan.user_id+':'+from,at).run();}
   continue;
  }
  if(plan.status!=='grace'){
   const until=at+s.graceDays*DAY;
   const r=await q(db,"UPDATE autopilot_plans SET status='grace',grace_until=?,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",until,at,plan.user_id,plan.role,plan.version).run();
   if(r.meta.changes){result.grace++;await notice(db,plan.user_id,`«Всё включено» не оплачено: ${money(paid.amount)}. До ${dateText(until)} он работает, потом встанет на паузу.`,plan.role+':autopilot-grace:'+plan.user_id+':'+plan.period_end,at).run();}
  }else if(plan.grace_until<=at){if(await pause(db,plan,at,plan.role==='owner'?'Автопилот на паузе: оплата не прошла. Объекты в режиме «Я сам», принятые брони и уборки в силе. Оплатите услуги и включите в настройках жилья.':'Автопилот на паузе: оплата не прошла. Принятые уборки в силе. Включите снова в профиле.'))result.paused++;}
 }
 if(s.charge){
  const soon=await rows(db,"SELECT * FROM autopilot_plans WHERE tier='all' AND next_tier IS NULL AND status IN ('trial','active') AND auto_renew=1 AND period_end>? AND period_end<=? LIMIT 200",at,at+3*DAY);
  for(const plan of soon){
   const amount=priceFor(s,plan.role,await unitsFor(db,plan.role,plan.user_id));if(!amount)continue;
   const r=await notice(db,plan.user_id,`${dateText(plan.period_end)} «Всё включено» продлится на месяц: ${money(amount)} с привязанной карты.`,plan.role+':autopilot-remind:'+plan.user_id+':'+plan.period_end,at).run();
   if(r.meta.changes)result.reminded++;
  }
 }
 // 8:00: the cleaner's plan for today, addresses in order.
 if(minuteOfDay(at)>=8*60){
  const from=dayStart(at),list=await rows(db,`SELECT j.assigned_to,j.start,j.end,j.fee,p.title,p.address FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status='assigned' AND j.start>=? AND j.start<? AND ${livePlanSql('j.assigned_to','cleaner')} ORDER BY j.assigned_to,j.start LIMIT 500`,from,from+DAY);
  const by=new Map<string,Row[]>();for(const j of list)by.set(j.assigned_to,[...(by.get(j.assigned_to)||[]),j]);
  for(const [worker,jobs] of by){
   const body='План на сегодня: '+jobs.map((j,i)=>`${i+1}) ${timeText(j.start)}–${timeText(j.end)} ${j.address||j.title}, ${money(j.fee)}`).join('; ')+'. После уборки сразу отправьте фото, чтобы её приняли.';
   const r=await notice(db,worker,body,'cleaner:day-plan:'+worker+':'+isoDay(at),at).run();if(r.meta.changes)result.dayPlans++;
  }
 }
 // Monday after 9:00: the owner's week under the autopilot.
 if(weekday(at)===0&&minuteOfDay(at)>=9*60){
  const owners=await rows(db,`SELECT user_id FROM autopilot_plans WHERE role='owner' AND status IN ${LIVE} LIMIT 500`),week=at-7*DAY;
  for(const o of owners){
   // The same seven days the owner sees in «Автопилот» (lib/autopilot-week.ts): the notice goes to Telegram as well.
   const w=await autopilotWeek(db,o.user_id,at,true);
   const r=await notice(db,o.user_id,w.summary+' Подробнее: меню → Автопилот.','owner:autopilot-week:'+o.user_id+':'+isoDay(at),at).run();
   if(r.meta.changes)result.reports++;
  }
 }
 // The month of every hall that had a booking through the app (written once a month, safe to repeat).
 result.hallMonths=await sweepHallMonths(db,at);
 // The weekly card charge for all service fees; a debt unpaid for seven days pauses the debtor's plans.
 result.dues=await sweepDues(db,async(d,user,t)=>{for(const plan of await rows(d,"SELECT * FROM autopilot_plans WHERE user_id=? AND status IN ('trial','active','grace')",user))await pause(d,plan,t,plan.role==='owner'?'Автопилот на паузе: услуги сервиса не оплачены. Объекты в режиме «Я сам», принятые брони и уборки в силе.':'Автопилот на паузе: услуги сервиса не оплачены. Принятые уборки в силе.');},at,config);
 return result;
}

// Platform admin: the prices of the hybrid tariff, grace and whether money is taken.
export async function plansAdminState(db:D1Database){
 const s=await planSettings(db),at=epoch();
 const counts=await rows(db,"SELECT role,CASE WHEN status='paused' THEN 'paused' WHEN tier='all' THEN 'all' ELSE 'pay' END kind,COUNT(*) n FROM autopilot_plans GROUP BY role,kind");
 const month=await rows(db,"SELECT role,mode,COALESCE(SUM(amount),0) amount FROM autopilot_charges WHERE created_at>? GROUP BY role,mode",at-MONTH);
 const fees=await rows(db,"SELECT role,mode,COUNT(*) n,COALESCE(SUM(amount),0) amount FROM service_fees f WHERE created_at>? AND (f.kind<>'ai_booking' OR (SELECT status FROM bookings WHERE id=f.ref_id) IN ('confirmed','completed')) GROUP BY role,mode",at-MONTH);
 const flats=Number((await one(db,`SELECT COUNT(*) n FROM properties p WHERE ${underAutopilot('p.id')}`,at))?.n||0);
 const taken=Number((await one(db,"SELECT COUNT(*) n FROM audit_events WHERE actor_id='system:cleaner-autopilot' AND created_at>?",at-MONTH))?.n||0);
 const pick=(role:string)=>({pay:0,all:0,paused:0,...Object.fromEntries(counts.filter(c=>c.role===role).map(c=>[c.kind,Number(c.n)]))});
 const sum=(role:string,mode:string)=>Number(month.find(m=>m.role===role&&m.mode===mode)?.amount||0);
 const fee=(role:string,mode:string)=>Number(fees.find(m=>m.role===role&&m.mode===mode)?.amount||0);
 const count=(role:string)=>fees.filter(m=>m.role===role).reduce((n,m)=>n+Number(m.n),0);
 return {settings:s,
  owner:{...pick('owner'),flats,results30:count('owner'),fees30:fee('owner','charged'),feesShadow30:fee('owner','shadow'),charged30:sum('owner','charged'),shadow30:sum('owner','shadow')},
  cleaner:{...pick('cleaner'),taken30:taken,results30:count('cleaner'),fees30:fee('cleaner','charged'),feesShadow30:fee('cleaner','shadow'),free30:fee('cleaner','free'),charged30:sum('cleaner','charged'),shadow30:sum('cleaner','shadow')}};
}
export async function savePlanSettings(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите изменение тарифов.');
 const before=await planSettings(service.db),n=(key:string,label:string,max:number,fallback:number)=>body[key]===undefined?fallback:number(body[key],label,0,max);
 const ownerPrice=n('ownerPrice','«Всё включено» для владельца',1000000,before.ownerPrice),cleanerPrice=n('cleanerPrice','«Всё включено» для исполнителя',1000000,before.cleanerPrice),grace=n('graceDays','Дней отсрочки',30,before.graceDays);
 const aiFee=n('aiBookingFee','Плата за бронь ИИ',100000,before.aiBookingFee),aiCap=n('aiMonthCap','Потолок «Автопилота» в месяц',1000000,before.aiMonthCap);
 const jobFee=n('cleanerJobFee','Плата исполнителя за уборку',100000,before.cleanerJobFee),freeJobs=n('cleanerFreeJobs','Бесплатных уборок',1000,before.cleanerFreeJobs),jobCap=n('cleanerMonthCap','Потолок исполнителя в месяц',1000000,before.cleanerMonthCap);
 const pct=body.cleanerRatePercent===undefined?before.cleanerRate/100:Number(body.cleanerRatePercent);
 if(!Number.isFinite(pct)||pct<0||pct>30||Math.round(pct*10)!==pct*10)throw new DomainError('Процент исполнителя: от 0 до 30%, с шагом 0,1.');
 const cleanerRate=Math.round(pct*100),charge=body.charge===true?1:0,at=epoch();
 await service.db.batch([
  q(service.db,"UPDATE platform_billing SET plan_charge=?,plan_owner_price=?,plan_cleaner_price=?,plan_grace_days=?,ai_booking_fee=?,ai_month_cap=?,cleaner_job_fee=?,cleaner_free_jobs=?,cleaner_month_cap=?,cleaner_rate_bp=?,version=version+1,updated_by=?,updated_at=? WHERE id='global'",charge,ownerPrice,cleanerPrice,grace,aiFee,aiCap,jobFee,freeJobs,jobCap,cleanerRate,service.userId,at),
  q(service.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),service.userId,'platform_billing',JSON.stringify({action:'admin.plans_saved',charge,ownerPrice,cleanerPrice,grace,aiFee,aiCap,jobFee,freeJobs,jobCap,cleanerRate}),at)
 ]);
 // People on a plan hear about new prices or the start of charging.
 const after=await planSettings(service.db);
 if(charge&&(!before.charge||before.ownerPrice!==ownerPrice||before.cleanerPrice!==cleanerPrice||before.aiBookingFee!==aiFee||before.aiMonthCap!==aiCap||before.cleanerJobFee!==jobFee||before.cleanerMonthCap!==jobCap||before.cleanerFreeJobs!==freeJobs||before.cleanerRate!==cleanerRate)){
  const people=await rows(service.db,`SELECT user_id,role,tier FROM autopilot_plans WHERE status IN ${LIVE} LIMIT 2000`);
  for(const p of people)await notice(service.db,p.user_id,`Условия сервиса: ${tierText(after,p.role)[p.tier==='all'?'all':'pay']} Списание раз в неделю с привязанной карты. Новые цены действуют для новых броней и уборок. Отключить можно в профиле.`,p.role+':autopilot-terms:'+p.user_id+':'+at,at).run();
 }
 return {message:charge?'Тарифы сохранены, плата включена.':'Тарифы сохранены. Плата выключена, сервис только считает.',state:await plansAdminState(service.db)};
}
export const planRequired=(role:string):PlanRole=>{if(role!=='owner'&&role!=='cleaner')throw new DomainError('Автопилот есть у владельца и исполнителя.',403);return role;};
