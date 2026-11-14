import {DomainError,number} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {underAutopilot,setGuestMode} from './autopilot';
import {ownerAvailable} from './regular-cleaner';
import {declineAssignment} from './dispatch';

// «Автопилот» as a paid plan. The owner pays a monthly price for each flat under the AI, the cleaner pays
// one monthly price. Every plan starts with a free trial; then the price is taken once a month: the owner's
// from the service balance, the cleaner's withheld from the next payout. If the money is not there, the plan
// gets a few days of grace, then pauses: flats go back to «Я сам», the cleaner's AI stops accepting. Nothing
// already confirmed is cancelled. While charging is off (no bank yet) the service only records what it would take.
export type PlanRole='owner'|'cleaner';
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

export type PlanSettings={charge:boolean;ownerPrice:number;cleanerPrice:number;trialDays:number;graceDays:number};
export async function planSettings(db:D1Database):Promise<PlanSettings>{
 const s=await one(db,"SELECT plan_charge,plan_owner_price,plan_cleaner_price,plan_trial_days,plan_grace_days FROM platform_billing WHERE id='global'");
 return {charge:!!s?.plan_charge,ownerPrice:Number(s?.plan_owner_price??4900),cleanerPrice:Number(s?.plan_cleaner_price??1900),trialDays:Number(s?.plan_trial_days??14),graceDays:Number(s?.plan_grace_days??3)};
}
export const planOf=(db:D1Database,user:string,role:PlanRole)=>one(db,'SELECT * FROM autopilot_plans WHERE user_id=? AND role=?',user,role);
const managedCount=async(db:D1Database,owner:string,at:number)=>Number((await one(db,`SELECT COUNT(*) n FROM properties p WHERE p.owner_id=? AND p.archived_at IS NULL AND ${underAutopilot('p.id')}`,owner,at))?.n||0);
// What the cleaner still has to receive through the service, less what is already withheld.
const cleanerPending=async(db:D1Database,cleaner:string)=>Number((await one(db,"SELECT COALESCE((SELECT SUM(amount) FROM cleaning_holds WHERE cleaner_id=? AND status IN ('held','due')),0)-COALESCE((SELECT SUM(amount-withheld) FROM autopilot_charges WHERE user_id=? AND role='cleaner' AND mode='charged' AND settled_at IS NULL),0) n",cleaner,cleaner))?.n||0);
export const priceFor=(s:PlanSettings,role:PlanRole,units:number)=>role==='owner'?s.ownerPrice*units:s.cleanerPrice;

// Takes one month. Returns false when the money is not there (nothing is written then).
async function chargeMonth(db:D1Database,plan:Row,s:PlanSettings,at:number,from:number,least=0):Promise<{ok:boolean;amount:number;units:number}>{
 const role=plan.role as PlanRole,units=role==='owner'?Math.max(least,await managedCount(db,plan.user_id,at)):1,amount=priceFor(s,role,units);
 if(s.charge&&amount>0){const available=role==='owner'?await ownerAvailable(db,plan.user_id):await cleanerPending(db,plan.user_id);if(available<amount)return {ok:false,amount,units};}
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

// Turns the plan on: a new one starts the free trial, a paused one pays its month first, for at least the
// flats being switched on now (they are not under the AI yet when the month is paid).
export async function ensurePlan(db:D1Database,user:string,role:PlanRole,at=epoch(),flats=1){
 const plan=await planOf(db,user,role),s=await planSettings(db);
 if(plan&&['trial','active','grace'].includes(plan.status)){
  if(!plan.auto_renew)await q(db,'UPDATE autopilot_plans SET auto_renew=1,version=version+1,updated_at=? WHERE user_id=? AND role=?',at,user,role).run();
  return {status:plan.status,started:false};
 }
 if(!plan&&s.trialDays>0){
  await db.batch([
   q(db,"INSERT OR IGNORE INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at) VALUES (?,?,'trial',?,?,?)",user,role,at,at+s.trialDays*DAY,at),
   notice(db,user,`Автопилот включён. ${s.trialDays} дней бесплатно, до ${dateText(at+s.trialDays*DAY)}. ${s.charge?'Потом '+(role==='owner'?money(s.ownerPrice)+' в месяц за объект с баланса':money(s.cleanerPrice)+' в месяц из выплат за уборки')+'. За 3 дня до списания напомним.':'Пока плата не взимается.'}`,role+':autopilot-trial:'+user,at)
  ]);
  return {status:'trial',started:true};
 }
 const paid=await chargeMonth(db,plan||{user_id:user,role},s,at,at,flats);
 if(!paid.ok)throw new DomainError(role==='owner'?`На балансе не хватает ${money(paid.amount)} за месяц автопилота. Пополните баланс и включите снова.`:`Автопилот оплачивается из выплат за уборки: нужно ${money(paid.amount)} в ожидающих выплатах. Возьмите уборку и включите снова.`,402);
 await q(db,"INSERT INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at) VALUES (?,?,'active',?,?,?) ON CONFLICT(user_id,role) DO UPDATE SET status='active',period_end=excluded.period_end,grace_until=NULL,auto_renew=1,version=autopilot_plans.version+1,updated_at=excluded.updated_at",user,role,at,at+MONTH,at).run();
 return {status:'active',started:true};
}

// Stop: a trial or an unpaid plan stops now; a paid month runs to its end and is not renewed.
export async function stopPlan(service:RentalService,role:PlanRole){
 await service.requireRole(role);
 const at=epoch(),plan=await planOf(service.db,service.userId,role);
 if(!plan||plan.status==='paused')return {message:'Автопилот уже выключен.'};
 const s=await planSettings(service.db);
 if(plan.status==='active'&&s.charge){await q(service.db,'UPDATE autopilot_plans SET auto_renew=0,version=version+1,updated_at=? WHERE user_id=? AND role=?',at,service.userId,role).run();return {message:`Автопилот работает до ${dateText(plan.period_end)} и не продлится. Включить снова можно ${role==='owner'?'в настройках жилья':'в меню'}.`};}
 await pause(service.db,plan,at,role==='owner'?'Автопилот выключен. Объекты в режиме «Я сам»: запросы гостей приходят вам.':'Автопилот выключен. Предложения уборок снова приходят вам на решение.');
 return {message:role==='owner'?'Автопилот выключен. Объекты переведены в режим «Я сам».':'Автопилот выключен.'};
}

// Owner: turn the plan on and put the chosen flats under the AI. Every flat is checked first (tariffs, cleaning
// price, mandate); a month is paid only for the flats that pass, and only those are switched.
export async function startOwnerPlan(service:RentalService,body:Row){
 await service.requireRole('owner');
 const ids:string[]=Array.isArray(body.propertyIds)?[...new Set<string>(body.propertyIds.map(String))].slice(0,50):[];
 if(!ids.length)throw new DomainError('Выберите объекты для автопилота.');
 const ready:string[]=[],failed:{id:string;error:string}[]=[];
 for(const id of ids){try{await setGuestMode(service,{propertyId:id,mode:'auto',cleaningFee:body.cleaningFees?.[id],check:true});ready.push(id);}catch(e){if(e instanceof DomainError)failed.push({id,error:e.message});else throw e;}}
 if(!ready.length)return {message:'Автопилот не включён: '+failed.map(f=>f.error).join(' '),done:[],failed,state:await planState(service,'owner')};
 await ensurePlan(service.db,service.userId,'owner',epoch(),ready.length);
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
 for(const j of jobs){try{await declineAssignment(service,{jobId:j.id,reason:'Исполнитель не может выйти сегодня. AI администратор ищет замену.'});released++;}catch(e){if(!(e instanceof DomainError))throw e;}}
 return {message:released?`Сегодняшние уборки (${released}) возвращены владельцам, AI администратор ищет замену. До завтра новые уборки не берём.`:'До завтра ИИ не берёт для вас новые уборки.',released};
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

export async function planState(service:RentalService,role:PlanRole){
 const db=service.db,at=epoch(),s=await planSettings(db),plan=await planOf(db,service.userId,role),week=at-7*DAY;
 const live=!!plan&&['trial','active','grace'].includes(plan.status);
 const base={plan:plan?{status:plan.status,periodEnd:plan.period_end,graceUntil:plan.grace_until,autoRenew:!!plan.auto_renew,startedAt:plan.started_at}:null,live,settings:{charge:s.charge,price:role==='owner'?s.ownerPrice:s.cleanerPrice,trialDays:plan?0:s.trialDays,graceDays:s.graceDays}};
 if(role==='owner'){
  const flats=await rows(db,`SELECT p.id,p.title,p.own_staff,COALESCE(pp.cleaning_fee,0) cleaning_fee,pp.property_id IS NOT NULL has_policy,CASE WHEN ${underAutopilot('p.id')} THEN 1 ELSE 0 END managed FROM properties p LEFT JOIN property_policies pp ON pp.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND p.demo_owner IS NULL ORDER BY p.created_at`,at,service.userId);
  const units=flats.filter(f=>f.managed).length;
  const stats=await one(db,`SELECT (SELECT COUNT(*) FROM audit_events a JOIN properties p ON p.id=a.entity_id WHERE p.owner_id=? AND a.actor_id='system:autopilot' AND a.created_at>?) answered,
   (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND b.status IN ('confirmed','completed') AND b.created_at>? AND ${underAutopilot('p.id')}) bookings,
   (SELECT COUNT(*) FROM cleaning_jobs j WHERE j.owner_id=? AND j.status='completed' AND j.completed_at>? AND ${underAutopilot('j.property_id')}) cleanings`,service.userId,week,service.userId,week,at,service.userId,week,at);
  return {...base,flats:flats.map(f=>({id:f.id,title:f.title,ownStaff:!!f.own_staff,cleaningFee:f.cleaning_fee,ready:!!f.has_policy,managed:!!f.managed})),units,nextAmount:priceFor(s,'owner',Math.max(units,1)),balance:await ownerAvailable(db,service.userId),week:{answered:Number(stats?.answered||0),bookings:Number(stats?.bookings||0),cleanings:Number(stats?.cleanings||0)}};
 }
 const rules=await one(db,'SELECT * FROM cleaner_autopilot WHERE user_id=?',service.userId);
 let districts:string[]=[];try{districts=JSON.parse(rules?.districts||'[]');}catch{}
 const profile=await one(db,'SELECT city FROM profiles WHERE id=?',service.userId);
 const cityDistricts=(await rows(db,"SELECT DISTINCT district FROM properties WHERE city=? AND district<>'' AND archived_at IS NULL ORDER BY district LIMIT 30",profile?.city||'')).map(r=>r.district);
 const today=await rows(db,"SELECT j.id,j.start,j.end,j.fee,p.title,p.address,p.district FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.assigned_to=? AND j.status IN ('assigned','in_progress') AND j.start<? AND j.end>? ORDER BY j.start",service.userId,dayStart(at)+DAY,dayStart(at));
 const stats=await one(db,"SELECT (SELECT COUNT(*) FROM audit_events WHERE actor_id='system:cleaner-autopilot' AND entity_id IN (SELECT id FROM cleaning_offers WHERE worker_id=?) AND created_at>?) taken,(SELECT COALESCE(SUM(fee),0) FROM cleaning_jobs WHERE assigned_to=? AND status='completed' AND completed_at>?) earned",service.userId,week,service.userId,week);
 return {...base,rules:rules?{districts,days:rules.days,fromMinute:rules.from_minute,toMinute:rules.to_minute,minFee:rules.min_fee,maxPerDay:rules.max_per_day,askNewOwner:!!rules.ask_new_owner,pausedUntil:rules.paused_until}:null,cityDistricts,today:today.map(j=>({...j,from:timeText(j.start),to:timeText(j.end)})),week:{taken:Number(stats?.taken||0),earned:Number(stats?.earned||0)}};
}

// The daily round: renewals, grace, pauses, reminders, the cleaner's day plan at 8:00 and the owner's Monday report.
export async function sweepPlans(db:D1Database,at=epoch()){
 const s=await planSettings(db),result={renewed:0,grace:0,paused:0,reminded:0,dayPlans:0,reports:0};
 const due=await rows(db,`SELECT * FROM autopilot_plans WHERE (status IN ('trial','active') AND period_end<=?) OR status='grace' ORDER BY period_end LIMIT 100`,at);
 for(const plan of due){
  if(plan.status!=='grace'&&!plan.auto_renew){if(await pause(db,plan,at,'Автопилот выключен: оплаченный месяц закончился. Включить снова можно '+(plan.role==='owner'?'в настройках жилья.':'в меню.')))result.paused++;continue;}
  const from=plan.status==='grace'?at:Math.max(plan.period_end,at-DAY),paid=await chargeMonth(db,plan,s,at,from);
  if(paid.ok){
   const r=await q(db,"UPDATE autopilot_plans SET status='active',period_end=?,grace_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",from+MONTH,at,plan.user_id,plan.role,plan.version).run();
   if(r.meta.changes){result.renewed++;if(s.charge&&paid.amount>0)await notice(db,plan.user_id,`Автопилот продлён до ${dateText(from+MONTH)}: ${money(paid.amount)} ${plan.role==='owner'?'списано с баланса':'будет удержано из ближайшей выплаты'}.`,plan.role+':autopilot-paid:'+plan.user_id+':'+from,at).run();}
   continue;
  }
  if(plan.status!=='grace'){
   const until=at+s.graceDays*DAY;
   const r=await q(db,"UPDATE autopilot_plans SET status='grace',grace_until=?,version=version+1,updated_at=? WHERE user_id=? AND role=? AND version=?",until,at,plan.user_id,plan.role,plan.version).run();
   if(r.meta.changes){result.grace++;await notice(db,plan.user_id,plan.role==='owner'?`Не хватает ${money(paid.amount)} на балансе для автопилота. Пополните до ${dateText(until)}, иначе объекты перейдут в режим «Я сам».`:`Для автопилота нужно ${money(paid.amount)} в ожидающих выплатах. До ${dateText(until)} он работает, потом встанет на паузу.`,plan.role+':autopilot-grace:'+plan.user_id+':'+plan.period_end,at).run();}
  }else if(plan.grace_until<=at){if(await pause(db,plan,at,plan.role==='owner'?'Автопилот на паузе: оплата не прошла. Объекты в режиме «Я сам», принятые брони и уборки в силе. Пополните баланс и включите в настройках жилья.':'Автопилот на паузе: оплата не прошла. Принятые уборки в силе. Включите снова в профиле.'))result.paused++;}
 }
 if(s.charge){
  const soon=await rows(db,"SELECT * FROM autopilot_plans WHERE status IN ('trial','active') AND auto_renew=1 AND period_end>? AND period_end<=? LIMIT 200",at,at+3*DAY);
  for(const plan of soon){
   const units=plan.role==='owner'?await managedCount(db,plan.user_id,at):1,amount=priceFor(s,plan.role,units);if(!amount)continue;
   const r=await notice(db,plan.user_id,`${dateText(plan.period_end)} автопилот продлится на месяц: ${money(amount)} ${plan.role==='owner'?'с баланса':'из выплат за уборки'}.`,plan.role+':autopilot-remind:'+plan.user_id+':'+plan.period_end,at).run();
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
   const n=await one(db,`SELECT (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND b.status IN ('confirmed','completed') AND b.created_at>?) bookings,(SELECT COALESCE(SUM(b.amount),0) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND b.status IN ('confirmed','completed') AND b.created_at>?) income,(SELECT COUNT(*) FROM cleaning_jobs WHERE owner_id=? AND status='completed' AND completed_at>?) cleanings`,o.user_id,week,o.user_id,week,o.user_id,week);
   const r=await notice(db,o.user_id,`Неделя на автопилоте: ${n?.bookings||0} броней на ${money(Number(n?.income||0))}, ${n?.cleanings||0} уборок принято. Подробности в профиле.`,'owner:autopilot-week:'+o.user_id+':'+isoDay(at),at).run();
   if(r.meta.changes)result.reports++;
  }
 }
 return result;
}

// Platform admin: prices, trial, grace and whether money is taken.
export async function plansAdminState(db:D1Database){
 const s=await planSettings(db),at=epoch();
 const counts=await rows(db,'SELECT role,status,COUNT(*) n FROM autopilot_plans GROUP BY role,status');
 const month=await rows(db,"SELECT role,mode,COALESCE(SUM(amount),0) amount FROM autopilot_charges WHERE created_at>? GROUP BY role,mode",at-MONTH);
 const flats=Number((await one(db,`SELECT COUNT(*) n FROM properties p WHERE ${underAutopilot('p.id')}`,at))?.n||0);
 const taken=Number((await one(db,"SELECT COUNT(*) n FROM audit_events WHERE actor_id='system:cleaner-autopilot' AND created_at>?",at-MONTH))?.n||0);
 const pick=(role:string)=>({trial:0,active:0,grace:0,paused:0,...Object.fromEntries(counts.filter(c=>c.role===role).map(c=>[c.status,Number(c.n)]))});
 const sum=(role:string,mode:string)=>Number(month.find(m=>m.role===role&&m.mode===mode)?.amount||0);
 return {settings:s,owner:{...pick('owner'),flats,charged30:sum('owner','charged'),shadow30:sum('owner','shadow'),monthly:s.ownerPrice*flats},cleaner:{...pick('cleaner'),taken30:taken,charged30:sum('cleaner','charged'),shadow30:sum('cleaner','shadow')}};
}
export async function savePlanSettings(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите изменение тарифов.');
 const ownerPrice=number(body.ownerPrice,'Цена для владельца',0,1000000),cleanerPrice=number(body.cleanerPrice,'Цена для исполнителя',0,1000000),trial=number(body.trialDays,'Бесплатных дней',0,90),grace=number(body.graceDays,'Дней отсрочки',0,30),charge=body.charge===true?1:0,at=epoch();
 const before=await planSettings(service.db);
 await service.db.batch([
  q(service.db,"UPDATE platform_billing SET plan_charge=?,plan_owner_price=?,plan_cleaner_price=?,plan_trial_days=?,plan_grace_days=?,version=version+1,updated_by=?,updated_at=? WHERE id='global'",charge,ownerPrice,cleanerPrice,trial,grace,service.userId,at),
  q(service.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),service.userId,'platform_billing',JSON.stringify({action:'admin.plans_saved',charge,ownerPrice,cleanerPrice,trial,grace}),at)
 ]);
 // People on a plan hear about a new price or the start of charging.
 if(charge&&(!before.charge||before.ownerPrice!==ownerPrice||before.cleanerPrice!==cleanerPrice)){
  const people=await rows(service.db,`SELECT user_id,role FROM autopilot_plans WHERE status IN ${LIVE} LIMIT 2000`);
  for(const p of people)await notice(service.db,p.user_id,`Условия автопилота: ${p.role==='owner'?money(ownerPrice)+' в месяц за объект с баланса':money(cleanerPrice)+' в месяц из выплат за уборки'}. Действует со следующего продления. Отключить можно в профиле.`,p.role+':autopilot-terms:'+p.user_id+':'+at,at).run();
 }
 return {message:charge?'Тарифы сохранены, плата включена.':'Тарифы сохранены. Плата выключена, сервис только считает.',state:await plansAdminState(service.db)};
}
export const planRequired=(role:string):PlanRole=>{if(role!=='owner'&&role!=='cleaner')throw new DomainError('Автопилот есть у владельца и исполнителя.',403);return role;};
