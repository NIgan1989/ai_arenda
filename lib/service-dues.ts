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
 return {due,card:b?.card_mask?{mask:b.card_mask,test:!!b.card_test}:null,nextChargeAt:charged||!due?slot+WEEK:Math.max(slot,at),payBy:b?.failed_at&&due>0?b.failed_at+PAY_DAYS*DAY:null,paused:!!b?.paused_at,test:testMode(config),payDays:PAY_DAYS,items:list};
}

// Takes the whole debt from the card. Returns the sum taken; nothing is written when there is nothing to pay.
// The entry is written only if that much is still owed inside the same statement, so «Оплатить сейчас» that
// overlaps the Monday round cannot take the sum twice: the later one finds the debt paid and writes nothing.
async function charge(db:D1Database,user:string,b:Row,at:number,why:'week'|'now'){
 const due=await dueOf(db,user);if(due<=0||!b.card_mask)return 0;
 const key='card:'+user+':'+(why==='week'?chargeSlot(at):at),note='Списание с карты '+b.card_mask+' за услуги сервиса'+(b.card_test?' (тест)':'');
 const r=await db.batch([
  q(db,`INSERT OR IGNORE INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${dueSql('?')}>=?`,uuid(),user,'topup',due,note,ACTOR,key,at,user,user,user,user,user,user,due),
  q(db,"UPDATE autopilot_charges SET settled_at=? WHERE user_id=? AND role='cleaner' AND mode='charged' AND settled_at IS NULL AND EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)",at,user,key,at),
  q(db,'UPDATE service_billing SET last_charge_at=?,failed_at=NULL,paused_at=NULL,version=version+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',at,at,user,key,at),
  q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),ACTOR,'service-billing:'+user,JSON.stringify({action:'service_billing.charged',amount:due,test:!!b.card_test}),at,key,at),
  q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),user,`С карты ${b.card_mask} списано ${money(due)} за услуги сервиса${b.card_test?' (тестовое списание, деньги не сняты)':''}.${b.paused_at?' Пауза снята: жильё снова принимает брони, «Автопилот» можно включить заново.':''} За что: Меню, «Настройки», «Оплата услуг».`,'service:charged:'+key,at,key,at),
 ]);
 return r[0].meta.changes?due:0;
}

export async function serviceBillingAction(service:RentalService,body:Row,config:OperationConfig={}){
 const db=service.db,user=service.userId,at=epoch(),action=String(body.action||'');
 let b=await billingOf(db,user);
 if(action==='link'){
  if(!testMode(config))throw new DomainError('Привязка карты через банк готовится. Напишите в поддержку, если нужно оплатить сейчас.',503);
  await q(db,"INSERT INTO service_billing(user_id,card_mask,card_token,card_test,card_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET card_mask=excluded.card_mask,card_token=excluded.card_token,card_test=1,card_at=excluded.card_at,version=service_billing.version+1,updated_at=excluded.updated_at",user,'•• 0000','test:'+uuid(),at,at).run();
  b=await billingOf(db,user);
  // A debt that already waited for a card is paid at once, so the pause never comes or ends right here.
  const taken=b?.failed_at||b?.paused_at?await charge(db,user,b!,at,'now'):0;
  return {message:'Тестовая карта привязана.'+(taken?' Списано '+money(taken)+' (тест).':' Списания раз в неделю, по понедельникам.'),state:await serviceBillingState(service,config)};
 }
 if(action==='pay'){
  if(!b?.card_mask)throw new DomainError('Сначала привяжите карту.',409);
  const taken=await charge(db,user,b,at,'now');
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
export async function sweepDues(db:D1Database,pausePlans:(db:D1Database,user:string,at:number)=>Promise<unknown>,at=epoch()){
 const result={charged:0,asked:0,paused:0},slot=chargeSlot(at);
 // Everyone who owes, page by page: those still waiting for a card stay in debt and must not hide the rest.
 for(let after='';;){
 const owing=await rows(db,`SELECT u.id,${dueSql('u.id')} due FROM profiles u WHERE u.id>? AND ${dueSql('u.id')}>0 ORDER BY u.id LIMIT ${PAGE}`,after);
 for(const o of owing){
  const b=await billingOf(db,o.id);
  if(b?.card_mask){if(!b.last_charge_at||b.last_charge_at<slot){if(await charge(db,o.id,b,at,'week'))result.charged++;}continue;}
  if(!b?.failed_at){
   // No card on the charge day: the seven days start now.
   const r=await db.batch([q(db,'INSERT INTO service_billing(user_id,failed_at,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET failed_at=excluded.failed_at,version=service_billing.version+1,updated_at=excluded.updated_at WHERE service_billing.failed_at IS NULL',o.id,at,at),
    notice(db,o.id,`К оплате за услуги сервиса ${money(Number(o.due))}. Привяжите карту до ${dateText(at+PAY_DAYS*DAY)}: Меню, «Настройки», «Оплата услуг». Иначе новые брони и «Автопилот» встанут на паузу. Принятые брони и уборки останутся в силе.`,'service:card-ask:'+o.id+':'+slot,at)]);
   if(r[0].meta.changes)result.asked++;continue;
  }
  if(!b.paused_at&&b.failed_at+PAY_DAYS*DAY<=at){
   const r=await q(db,'UPDATE service_billing SET paused_at=?,version=version+1,updated_at=? WHERE user_id=? AND paused_at IS NULL',at,at,o.id).run();
   if(!r.meta.changes)continue;
   await pausePlans(db,o.id,at);
   await db.batch([notice(db,o.id,`Пауза: ${money(Number(o.due))} за услуги сервиса не оплачены. Новые брони и «Автопилот» остановлены, принятые брони и уборки в силе. Привяжите карту в «Оплате услуг», и всё включится снова.`,'service:paused:'+o.id+':'+b.failed_at,at),
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
