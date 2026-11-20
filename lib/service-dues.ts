import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';
import {availableSql} from './regular-cleaner';

// Paying the service for its own work. There is no virtual balance and nothing to top up: the service keeps the
// account of what it earned from a participant (booking commission, cleaning match fee, «Автопилот») and takes
// the sum from the linked card once a week, on Monday morning. A week nobody could pay for gives seven days;
// after that the owner's homes stop taking new bookings and «Автопилот» pauses. Confirmed bookings and accepted
// cleanings are never touched. Until a bank with recurring payments is connected the card and the charge are
// simulated: the entry is written exactly as a real one, marked as a test.
//
// Accounting (shared with lib/company-finance.ts): a charge is a 'topup' row of owner_balance_entries whose
// owner_id is the participant; a performer's «Автопилот» month gets settled_at only when the card paid for it.
const DAY=86400,WEEK=7*DAY,ZONE=5*3600;
export const PAY_DAYS=7,CHARGE_HOUR=10;
const ACTOR='system:service-billing',PAGE=500;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g,' ')+' ₸';
const dateText=(at:number)=>new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);

/** What the participant owes the service now; never negative here (an overpayment is simply nothing to pay). */
export const dueSql=(user:string)=>`MAX(0,COALESCE((SELECT SUM(amount-withheld) FROM autopilot_charges WHERE user_id=${user} AND role='cleaner' AND mode='charged'),0)-${availableSql(user)})`;
export async function dueOf(db:D1Database,user:string){return Number((await one(db,`SELECT ${dueSql('?')} n`,user,user,user,user,user,user))?.n||0);}

/** The last Monday 10:00 (Asia/Qyzylorda) at or before `at`: the moment this week's charge is due. */
export function chargeSlot(at:number){
 const local=at+ZONE,day=Math.floor(local/DAY),monday=day-((day+3)%7),slot=monday*DAY+CHARGE_HOUR*3600-ZONE;
 return slot<=at?slot:slot-WEEK;
}
const billingOf=(db:D1Database,user:string)=>one(db,'SELECT * FROM service_billing WHERE user_id=?',user);
/** True when the owner's homes must not take new bookings. */
export async function servicePaused(db:D1Database,user:string){return !!(await one(db,'SELECT 1 x FROM service_billing WHERE user_id=? AND paused_at IS NOT NULL',user));}
const testMode=(config:OperationConfig)=>!(config.PAYMENT_GATEWAY_URL&&config.PAYMENT_GATEWAY_TOKEN);

async function items(db:D1Database,user:string){
 const list=await rows(db,`SELECT * FROM (
  SELECT 'commission' kind,c.created_at at,c.amount,'Комиссия за бронь · '||p.title title FROM platform_commissions c JOIN properties p ON p.id=c.property_id WHERE c.owner_id=?1 AND c.mode='charged' AND (SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')
  UNION ALL SELECT 'cleaning',c.created_at,c.amount,'Подбор исполнителя · '||COALESCE((SELECT title FROM properties WHERE id=c.property_id),'уборка') FROM cleaning_commissions c WHERE c.owner_id=?1 AND c.mode='charged' AND c.amount>0
  UNION ALL SELECT 'autopilot',a.created_at,a.amount-CASE WHEN a.role='cleaner' THEN a.withheld ELSE 0 END,'«Автопилот» · месяц'||CASE WHEN a.role='owner' AND a.units>1 THEN ' · объектов: '||a.units ELSE '' END FROM autopilot_charges a WHERE a.user_id=?1 AND a.mode='charged' AND a.amount>0
  UNION ALL SELECT 'payment',e.created_at,e.amount,e.note FROM owner_balance_entries e WHERE e.owner_id=?1
 ) ORDER BY at DESC LIMIT 30`,user);
 return list.map(i=>({kind:i.kind,at:i.at,amount:Number(i.amount)||0,title:String(i.title||'')}));
}

export async function serviceBillingState(service:RentalService,config:OperationConfig={}){
 const db=service.db,at=epoch(),[due,b,list]=await Promise.all([dueOf(db,service.userId),billingOf(db,service.userId),items(db,service.userId)]);
 const slot=chargeSlot(at),charged=!!b?.last_charge_at&&b.last_charge_at>=slot;
 const [rules,open]=await Promise.all([chargeRules(db),one(db,"SELECT status,amount FROM card_charges WHERE user_id=? AND (status IN ('started','unknown') OR (status='held' AND request_key=?)) ORDER BY created_at DESC LIMIT 1",service.userId,'card:'+service.userId+':'+slot)]);
 return {due,stopped:!!rules.stoppedAt,checking:open&&open.status!=='held'?Number(open.amount):0,confirm:open?.status==='held'&&due>0?due:0,card:b?.card_mask?{mask:b.card_mask,test:!!b.card_test}:null,nextChargeAt:charged||!due?slot+WEEK:Math.max(slot,at),payBy:b?.failed_at&&due>0?b.failed_at+PAY_DAYS*DAY:null,paused:!!b?.paused_at,test:testMode(config),payDays:PAY_DAYS,items:list};
}

// ── Safe card charges (drizzle/0080_card_charges.sql) ──
// 1. The attempt is written first, under its own operation number, and only if that much is still owed and nothing
//    else is in flight for this person (one open attempt per person, enforced by a unique index).
// 2. Then the bank is asked, with the operation number as the idempotency key: a repeat with the same number is
//    refused by the bank, so a lost answer can never become a second charge.
// 3. The ledger entry is written only after the bank said yes. A refusal writes nothing. A lost answer leaves the
//    attempt «unknown»: it is never retried automatically, it blocks new charges for this person, and the
//    administrator is told; the bank's status (or the administrator after checking the bank) settles it.
// The administrator's stop switch halts every charge. The Monday round never takes more than the confirmation
// threshold from one person (above it the person confirms with «Оплатить сейчас») nor more than the daily limit.
export type BankAnswer={status:'succeeded'|'failed';ref?:string;error?:string};
export type Bank=(op:{id:string;amount:number;token:string;test:boolean})=>Promise<BankAnswer>;
// No bank with recurring payments is connected yet: only test cards exist (linking a real one is refused), and a test
// card always pays without taking money. The real adapter goes here, sending `op.id` as the bank's idempotency key.
export const testBank:Bank=async op=>{if(!op.test)throw new DomainError('Банк для списаний ещё не подключён.',503);return {status:'succeeded',ref:'test:'+op.id};};
const STUCK=15*60;
const waitDays=(db:D1Database,user:string,at:number)=>q(db,'UPDATE service_billing SET failed_at=COALESCE(failed_at,?),version=version+1,updated_at=? WHERE user_id=?',at,at,user);
type Admins={PLATFORM_ADMIN_IDS?:string};
const adminIds=(config:Admins)=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const tellAdmins=(db:D1Database,config:Admins,body:string,tag:string,at:number)=>adminIds(config).map(a=>notice(db,a,body,'admin:'+tag+':'+a,at));
export async function chargeRules(db:D1Database){
 const r=await one(db,"SELECT charges_stopped_at,charge_confirm_above,charge_daily_limit FROM platform_billing WHERE id='global'");
 return {stoppedAt:r?.charges_stopped_at?Number(r.charges_stopped_at):null,confirmAbove:Number(r?.charge_confirm_above||100000),dailyLimit:Number(r?.charge_daily_limit||5000000)};
}
const dayStart=(at:number)=>Math.floor((at+ZONE)/DAY)*DAY-ZONE;
async function takenToday(db:D1Database,at:number){return Number((await one(db,"SELECT COALESCE(SUM(amount),0) n FROM card_charges WHERE status IN ('started','succeeded','unknown') AND created_at>=?",dayStart(at)))?.n||0);}

// Takes the whole debt from the card. Returns the sum taken; nothing is written when there is nothing to pay.
// «Оплатить сейчас» that overlaps the Monday round cannot take the sum twice: only one attempt can be open, and the
// second one finds the debt paid.
async function charge(db:D1Database,user:string,b:Row,at:number,why:'week'|'now',config:Admins={},bank:Bank=testBank):Promise<number>{
 const due=await dueOf(db,user);if(due<=0||!b.card_mask)return 0;
 const rules=await chargeRules(db);
 if(rules.stoppedAt){if(why==='now')throw new DomainError('Списания с карт временно остановлены. Ничего не списано, попробуйте позже.',503);return 0;}
 const key='card:'+user+':'+(why==='week'?chargeSlot(at):at),mask=String(b.card_mask);
 if(why==='week'&&due>rules.confirmAbove){
  // A large week is not taken automatically: the person confirms it, and the administrator sees it.
  const r=await q(db,"INSERT OR IGNORE INTO card_charges(id,user_id,request_key,amount,status,reason,card_mask,test,created_at,finished_at) VALUES (?,?,?,?,'held','week',?,?,?,?)",uuid(),user,key,due,mask,b.card_test?1:0,at,at).run();
  if(r.meta.changes)await db.batch([waitDays(db,user,at),notice(db,user,`К оплате за услуги сервиса ${money(due)}. Сумма крупная, поэтому сама с карты не спишется: подтвердите её кнопкой «Оплатить сейчас» в «Оплате услуг» до ${dateText(at+PAY_DAYS*DAY)}.`,'service:held:'+key,at),...tellAdmins(db,config,`Крупное списание ждёт подтверждения участника: ${money(due)}. Админка → Доходы → Списания.`,'charge-held:'+key,at)]);
  return 0;
 }
 if(why==='week'&&await takenToday(db,at)+due>rules.dailyLimit){
  const r=await db.batch(tellAdmins(db,config,`Дневной предел списаний (${money(rules.dailyLimit)}) достигнут, остальные списания отложены до завтра. Если это не ожидалось, остановите списания: Админка → Доходы → Списания.`,'charge-limit:'+dayStart(at),at));
  void r;return 0;
 }
 const id=uuid(),test=b.card_test?1:0;
 const started=await q(db,`INSERT OR IGNORE INTO card_charges(id,user_id,request_key,amount,status,reason,card_mask,test,created_at) SELECT ?,?,?,?,'started',?,?,?,? WHERE ${dueSql('?')}>=? AND NOT EXISTS(SELECT 1 FROM card_charges WHERE user_id=? AND status IN ('started','unknown'))`,id,user,key,due,why,mask,test,at,user,user,user,user,user,user,due,user).run();
 if(!started.meta.changes)return 0;
 let answer:BankAnswer;
 try{answer=await bank({id,amount:due,token:String(b.card_token||''),test:!!test});}
 catch(e){
  if(e instanceof DomainError&&e.status===503){await q(db,"UPDATE card_charges SET status='failed',error=?,finished_at=? WHERE id=? AND status='started'",e.message.slice(0,200),epoch(),id).run();if(why==='now')throw e;return 0;}
  // The answer is lost: the bank may or may not have taken the money. Never repeat; wait for its status.
  await db.batch([q(db,"UPDATE card_charges SET status='unknown',error='no_answer',finished_at=? WHERE id=? AND status='started'",epoch(),id),...tellAdmins(db,config,`Банк не ответил на списание ${money(due)} (операция ${id.slice(0,8)}). Повторять не будем. Проверьте операцию в банке и отметьте итог: Админка → Доходы → Списания.`,'charge-unknown:'+id,at)]);
  if(why==='now')throw new DomainError('Банк не ответил. Повторно списывать не будем: проверим операцию и сообщим итог.',502);
  return 0;
 }
 if(answer.status!=='succeeded'){
  await db.batch([q(db,"UPDATE card_charges SET status='failed',error=?,bank_ref=?,finished_at=? WHERE id=? AND status='started'",String(answer.error||'declined').slice(0,200),String(answer.ref||'').slice(0,200),epoch(),id),
   ...(why==='week'?[waitDays(db,user,at),notice(db,user,`Банк отклонил списание ${money(due)} с карты ${mask}. Деньги не сняты. Оплатите до ${dateText(at+PAY_DAYS*DAY)}: «Оплата услуг», «Оплатить сейчас» или другая карта. Иначе новые брони и «Автопилот» встанут на паузу.`,'service:declined:'+key,at)]:[])]);
  if(why==='now')throw new DomainError('Банк отклонил списание. Деньги не сняты. Проверьте карту или привяжите другую.',402);
  return 0;
 }
 return settle(db,{id,user_id:user,amount:due,request_key:key,card_mask:mask,test},answer.ref||'',at,!!b.paused_at);
}
// The bank said yes: the money is taken, so the ledger records it whatever happened to the debt in between
// (anything over the debt simply stays as an overpayment).
async function settle(db:D1Database,c:Row,ref:string,at:number,wasPaused:boolean){
 const id=String(c.id),user=String(c.user_id),due=Number(c.amount),key=String(c.request_key),test=!!c.test;
 const note='Списание с карты '+c.card_mask+' за услуги сервиса'+(test?' (тест)':'');
 const r=await db.batch([
  q(db,"UPDATE card_charges SET status='succeeded',bank_ref=?,finished_at=? WHERE id=? AND status IN ('started','unknown')",ref.slice(0,200),at,id),
  q(db,"INSERT OR IGNORE INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0",uuid(),user,'topup',due,note,ACTOR,key,at),
  q(db,"UPDATE autopilot_charges SET settled_at=? WHERE user_id=? AND role='cleaner' AND mode='charged' AND settled_at IS NULL AND EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)",at,user,key,at),
  q(db,'UPDATE service_billing SET last_charge_at=?,failed_at=NULL,paused_at=NULL,version=version+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',at,at,user,key,at),
  q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),ACTOR,'service-billing:'+user,JSON.stringify({action:'service_billing.charged',amount:due,test,operation:id}),at,key,at),
  q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),user,`С карты ${c.card_mask} списано ${money(due)} за услуги сервиса${test?' (тестовое списание, деньги не сняты)':''}.${wasPaused?' Пауза снята: жильё снова принимает брони, «Автопилот» можно включить заново.':''} За что: Меню, «Настройки», «Оплата услуг».`,'service:charged:'+key,at,key,at),
 ]);
 return r[1].meta.changes?due:0;
}

// The administrator: the stop switch, and the outcome of an attempt whose answer was lost (after checking the bank).
export async function cardChargesAdmin(db:D1Database){
 const rules=await chargeRules(db),at=epoch();
 const open=await rows(db,"SELECT c.id,c.user_id,c.amount,c.status,c.reason,c.card_mask,c.test,c.error,c.created_at,c.finished_at,p.name name FROM card_charges c LEFT JOIN profiles p ON p.id=c.user_id WHERE c.status IN ('unknown','started') OR (c.status IN ('held','failed') AND c.created_at>?) ORDER BY c.created_at DESC LIMIT 50",at-14*DAY);
 const recent=await rows(db,"SELECT c.id,c.user_id,c.amount,c.status,c.reason,c.card_mask,c.test,c.created_at,p.name name FROM card_charges c LEFT JOIN profiles p ON p.id=c.user_id ORDER BY c.created_at DESC LIMIT 20");
 return {...rules,today:await takenToday(db,at),open,recent};
}
export async function cardChargesAction(db:D1Database,adminId:string,body:Row){
 const at=epoch(),action=String(body.action||'');
 if(action==='stop'||action==='resume'){
  const stop=action==='stop';
  await db.batch([q(db,"UPDATE platform_billing SET charges_stopped_at=?,charges_stopped_by=?,version=version+1,updated_by=?,updated_at=? WHERE id='global'",stop?at:null,stop?adminId:null,adminId,at),
   q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),adminId,'platform_billing',JSON.stringify({action:stop?'admin.charges_stopped':'admin.charges_resumed'}),at)]);
  return {message:stop?'Все списания с карт остановлены. Долги копятся, ничего не списывается, пока вы не включите снова.':'Списания с карт снова включены.',state:await cardChargesAdmin(db)};
 }
 if(action==='limits'){
  const confirm=Math.floor(Number(body.confirmAbove)),daily=Math.floor(Number(body.dailyLimit));
  if(!(confirm>=1000&&confirm<=10000000)||!(daily>=10000&&daily<=1000000000))throw new DomainError('Проверьте пределы: подтверждение от 1 000 ₸, дневной предел от 10 000 ₸.');
  await db.batch([q(db,"UPDATE platform_billing SET charge_confirm_above=?,charge_daily_limit=?,version=version+1,updated_by=?,updated_at=? WHERE id='global'",confirm,daily,adminId,at),
   q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),adminId,'platform_billing',JSON.stringify({action:'admin.charge_limits',confirm,daily}),at)]);
  return {message:'Пределы списаний сохранены.',state:await cardChargesAdmin(db)};
 }
 if(action==='resolve'){
  const id=String(body.id||''),outcome=String(body.outcome||'');
  if(!['succeeded','failed'].includes(outcome))throw new DomainError('Отметьте, списал ли банк деньги.');
  if(body.confirmed!==true)throw new DomainError('Подтвердите, что проверили операцию в банке.');
  const c=await one(db,"SELECT * FROM card_charges WHERE id=? AND status IN ('unknown','started')",id);
  if(!c)throw new DomainError('Эта операция уже решена.',409);
  if(c.status==='started'&&Number(c.created_at)+STUCK>at)throw new DomainError('Операция ещё идёт. Подождите 15 минут.',409);
  await q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),adminId,'service-billing:'+c.user_id,JSON.stringify({action:'admin.charge_resolved',operation:id,outcome}),at).run();
  if(outcome==='succeeded'){await q(db,'UPDATE card_charges SET resolved_by=? WHERE id=?',adminId,id).run();await settle(db,c,String(body.bankRef||'checked'),at,false);return {message:'Отмечено: банк списал деньги. Запись в учёте сделана.',state:await cardChargesAdmin(db)};}
  await q(db,"UPDATE card_charges SET status='failed',error='admin: not taken',resolved_by=?,finished_at=? WHERE id=? AND status IN ('unknown','started')",adminId,at,id).run();
  return {message:'Отмечено: банк деньги не списал. Новые списания этому участнику снова возможны.',state:await cardChargesAdmin(db)};
 }
 throw new DomainError('Неизвестное действие.');
}
// An attempt left «started» (the worker stopped between the record and the bank) becomes «unknown» and is reported.
async function sweepStuck(db:D1Database,config:Admins,at:number){
 for(const c of await rows(db,"SELECT id,amount FROM card_charges WHERE status='started' AND created_at<=? LIMIT 50",at-STUCK)){
  const r=await q(db,"UPDATE card_charges SET status='unknown',error='stuck',finished_at=? WHERE id=? AND status='started'",at,c.id).run();
  if(r.meta.changes)await db.batch(tellAdmins(db,config,`Списание ${money(Number(c.amount))} (операция ${String(c.id).slice(0,8)}) не завершилось. Повторять не будем. Проверьте в банке и отметьте итог: Админка → Доходы → Списания.`,'charge-unknown:'+c.id,at));
 }
}

export async function serviceBillingAction(service:RentalService,body:Row,config:OperationConfig&Admins={},bank:Bank=testBank){
 const db=service.db,user=service.userId,at=epoch(),action=String(body.action||'');
 let b=await billingOf(db,user);
 if(action==='link'){
  if(!testMode(config))throw new DomainError('Привязка карты через банк готовится. Напишите в поддержку, если нужно оплатить сейчас.',503);
  await q(db,"INSERT INTO service_billing(user_id,card_mask,card_token,card_test,card_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET card_mask=excluded.card_mask,card_token=excluded.card_token,card_test=1,card_at=excluded.card_at,version=service_billing.version+1,updated_at=excluded.updated_at",user,'•• 0000','test:'+uuid(),at,at).run();
  b=await billingOf(db,user);
  // A debt that already waited for a card is paid at once, so the pause never comes or ends right here.
  // Linking pays a debt that already waited, unless it is above the confirmation threshold: that one waits for «Оплатить сейчас».
  const taken=(b?.failed_at||b?.paused_at)&&await dueOf(db,user)<=(await chargeRules(db)).confirmAbove?await charge(db,user,b!,at,'now',config,bank).catch(()=>0):0;
  return {message:'Тестовая карта привязана.'+(taken?' Списано '+money(taken)+' (тест).':' Списания раз в неделю, по понедельникам.'),state:await serviceBillingState(service,config)};
 }
 if(action==='pay'){
  if(!b?.card_mask)throw new DomainError('Сначала привяжите карту.',409);
  const taken=await charge(db,user,b,at,'now',config,bank);
  return {message:taken?'Списано '+money(taken)+(b.card_test?' (тест).':'.'):'Сейчас платить нечего.',state:await serviceBillingState(service,config)};
 }
 if(action==='unlink'){
  if(!b?.card_mask)return {message:'Карта не привязана.',state:await serviceBillingState(service,config)};
  if(await dueOf(db,user)>0)throw new DomainError('Сначала оплатите начисленное, потом карту можно отвязать.',409);
  await q(db,"UPDATE service_billing SET card_mask='',card_token='',card_test=0,card_at=NULL,version=version+1,updated_at=? WHERE user_id=?",at,user).run();
  return {message:'Карта отвязана.',state:await serviceBillingState(service,config)};
 }
 throw new DomainError('Неизвестное действие.');
}

/** The round: Monday's charge for everyone who owes, the 7 days for those without a card, then the pause. */
export async function sweepDues(db:D1Database,pausePlans:(db:D1Database,user:string,at:number)=>Promise<unknown>,at=epoch(),config:Admins={},bank:Bank=testBank){
 const result={charged:0,asked:0,paused:0},slot=chargeSlot(at);
 await sweepStuck(db,config,at);
 const stopped=!!(await chargeRules(db)).stoppedAt;
 // Everyone who owes, page by page: those still waiting for a card stay in debt and must not hide the rest.
 for(let after='';;){
 const owing=await rows(db,`SELECT u.id,${dueSql('u.id')} due FROM profiles u WHERE u.id>? AND ${dueSql('u.id')}>0 ORDER BY u.id LIMIT ${PAGE}`,after);
 for(const o of owing){
  const b=await billingOf(db,o.id);
  // Charges stopped by the administrator: nobody is charged, asked for a card or paused meanwhile.
  if(stopped)continue;
  if(b?.card_mask){
   if(!b.last_charge_at||b.last_charge_at<slot){if(await charge(db,o.id,b,at,'week',config,bank).catch(()=>0)){result.charged++;continue;}}
   // A card that declined, or a large sum not confirmed, gets the same seven days as a missing card.
   const fresh=await billingOf(db,o.id);if(!fresh?.failed_at||fresh.paused_at||fresh.failed_at+PAY_DAYS*DAY>at)continue;
  }
  if(!b?.card_mask&&!b?.failed_at){
   // No card on the charge day: the seven days start now.
   const r=await db.batch([q(db,'INSERT INTO service_billing(user_id,failed_at,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET failed_at=excluded.failed_at,version=service_billing.version+1,updated_at=excluded.updated_at WHERE service_billing.failed_at IS NULL',o.id,at,at),
    notice(db,o.id,`К оплате за услуги сервиса ${money(Number(o.due))}. Привяжите карту до ${dateText(at+PAY_DAYS*DAY)}: Меню, «Настройки», «Оплата услуг». Иначе новые брони и «Автопилот» встанут на паузу. Принятые брони и уборки останутся в силе.`,'service:card-ask:'+o.id+':'+slot,at)]);
   if(r[0].meta.changes)result.asked++;continue;
  }
  const w=await billingOf(db,o.id);
  if(w?.failed_at&&!w.paused_at&&w.failed_at+PAY_DAYS*DAY<=at){
   const r=await q(db,'UPDATE service_billing SET paused_at=?,version=version+1,updated_at=? WHERE user_id=? AND paused_at IS NULL',at,at,o.id).run();
   if(!r.meta.changes)continue;
   await pausePlans(db,o.id,at);
   await db.batch([notice(db,o.id,`Пауза: ${money(Number(o.due))} за услуги сервиса не оплачены. Новые брони и «Автопилот» остановлены, принятые брони и уборки в силе. Оплатите в «Оплате услуг», и всё включится снова.`,'service:paused:'+o.id+':'+w.failed_at,at),
    q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),ACTOR,'service-billing:'+o.id,JSON.stringify({action:'service_billing.paused',due:Number(o.due)}),at)]);
   result.paused++;
  }
 }
 if(owing.length<PAGE)break;after=String(owing[owing.length-1].id);
 }
 // Someone paid another way (an administrator's entry) while waiting: the clock and the pause go away.
 await q(db,`UPDATE service_billing SET failed_at=NULL,paused_at=NULL,version=version+1,updated_at=? WHERE (failed_at IS NOT NULL OR paused_at IS NOT NULL) AND ${dueSql('service_billing.user_id')}=0`,at).run();
 return result;
}
