import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {underAutopilot} from './autopilot';

// Platform revenue model: the owner pays a commission for every booking confirmed
// through the service. While billing is off (or before its start date) every
// confirmation still records a shadow commission, which is the revenue forecast.
// A cancelled booking never costs the owner anything: balances count only
// commissions whose booking is still confirmed or completed.

export type BillingSettings={enabled:number;starts_at:number;rate_bp:number;ai_rate_bp:number;min_fee:number;max_fee:number;free_bookings:number;version:number;updated_at:number};
const live="(SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')";

export function commissionFor(amount:number,s:Pick<BillingSettings,'rate_bp'|'min_fee'|'max_fee'>){
 let fee=Math.floor((amount*s.rate_bp+5000)/10000);
 if(s.max_fee>0)fee=Math.min(fee,s.max_fee);
 fee=Math.max(fee,s.min_fee);
 return Math.max(0,Math.min(fee,amount));
}

// Statement for the booking-confirmation batch. The amount is computed in SQL from the
// settings row read in the same batch, so a concurrent settings change cannot split it.
// A flat under autopilot at confirmation time pays the AI rate (ai_rate_bp) instead of the base rate.
export function accrueCommission(db:D1Database,bookingId:string,auditId:string,at:number){
 const fee="MIN(x.amount,MAX(x.min_fee,CASE WHEN x.max_fee>0 THEN MIN(x.max_fee,(x.amount*x.rate+5000)/10000) ELSE (x.amount*x.rate+5000)/10000 END))";
 const used=`(SELECT COUNT(*) FROM platform_commissions c WHERE c.owner_id=x.owner_id AND c.mode IN ('free','charged') AND ${live})`;
 return q(db,`INSERT OR IGNORE INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed)
  SELECT x.id,x.owner_id,x.property_id,x.amount,x.rate,${fee},CASE WHEN x.enabled=1 AND x.starts_at<=? THEN CASE WHEN ${used}<x.free_bookings THEN 'free' ELSE 'charged' END ELSE 'shadow' END,x.version,?,x.managed
  FROM (SELECT z.*,CASE WHEN z.managed=1 THEN z.ai_rate_bp ELSE z.rate_bp END rate FROM (SELECT b.id,p.owner_id,b.property_id,b.amount,s.min_fee,s.max_fee,s.enabled,s.starts_at,s.free_bookings,s.version,s.rate_bp,s.ai_rate_bp,CASE WHEN ${underAutopilot('b.property_id')} THEN 1 ELSE 0 END managed
   FROM bookings b JOIN properties p ON p.id=b.property_id JOIN platform_billing s ON s.id='global'
   WHERE b.id=? AND b.status='confirmed' AND p.demo_owner IS NULL AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)) z) x`,at,at,at,bookingId,auditId);
}

export async function billingSettings(db:D1Database){
 return (await one(db,"SELECT enabled,starts_at,rate_bp,ai_rate_bp,min_fee,max_fee,free_bookings,version,updated_at FROM platform_billing WHERE id='global'")) as BillingSettings|null;
}
export function billingPhase(s:BillingSettings|null,at=epoch()){return !s||!s.enabled?'off':s.starts_at>at?'scheduled':'active';}

const balanceSql=`COALESCE((SELECT SUM(amount) FROM owner_balance_entries e WHERE e.owner_id=o.id),0)-COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=o.id AND c.mode='charged' AND ${live}),0)`;

const ownerFilter="EXISTS(SELECT 1 FROM properties p WHERE p.owner_id=o.id AND p.demo_owner IS NULL)";
// Paged and searchable on the server, so every owner stays reachable however many there are.
export async function billingOwners(service:RentalService,params:Row){
 const search=String(params.search||'').trim();if(search.length>100)throw new DomainError('Сократите запрос.');
 const page=number(params.page||0,'Страница',0,100000),limit=10,pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
 const where=`${ownerFilter} AND o.name LIKE ? ESCAPE '\\'`;
 const [settings,total,list]=await Promise.all([billingSettings(service.db),one(service.db,`SELECT COUNT(*) count FROM profiles o WHERE ${where}`,pattern),
  rows(service.db,`SELECT o.id,o.name,(SELECT COUNT(*) FROM properties p WHERE p.owner_id=o.id AND p.demo_owner IS NULL) properties,(SELECT COUNT(*) FROM platform_commissions c WHERE c.owner_id=o.id AND ${live}) bookings,(SELECT COUNT(*) FROM platform_commissions c WHERE c.owner_id=o.id AND c.mode IN ('free','charged') AND ${live}) billed_bookings,COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=o.id AND c.mode='charged' AND ${live}),0) charged,COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=o.id AND ${live}),0) projected,COALESCE((SELECT SUM(amount) FROM owner_balance_entries e WHERE e.owner_id=o.id),0) credited,${balanceSql} balance FROM profiles o WHERE ${where} ORDER BY balance ASC,projected DESC,o.name,o.id LIMIT ? OFFSET ?`,pattern,limit,page*limit)]);
 const free=settings?.free_bookings||0;
 return {owners:list.map(o=>({...o,freeLeft:Math.max(0,free-(o.billed_bookings||0))})),total:total?.count||0,page,limit};
}

export async function billingState(service:RentalService){
 const db=service.db,at=epoch(),month=at-30*86400;
 const settings=await billingSettings(db);
 const totals=(since:number)=>one(db,`SELECT COUNT(*) bookings,COALESCE(SUM(c.booking_amount),0) turnover,COALESCE(SUM(c.amount),0) projected,COALESCE(SUM(CASE WHEN c.mode='charged' THEN c.amount ELSE 0 END),0) charged,COALESCE(SUM(CASE WHEN c.mode='free' THEN c.amount ELSE 0 END),0) waived FROM platform_commissions c WHERE c.created_at>=? AND ${live}`,since);
 const [last30,allTime,monthly,owners,topups,ai,history,debtors]=await Promise.all([
  totals(month),totals(0),
  rows(db,`SELECT strftime('%Y-%m',c.created_at+18000,'unixepoch') month,COUNT(*) bookings,SUM(c.booking_amount) turnover,SUM(c.amount) projected,SUM(CASE WHEN c.mode='charged' THEN c.amount ELSE 0 END) charged FROM platform_commissions c WHERE c.created_at>=? AND ${live} GROUP BY month ORDER BY month DESC`,at-183*86400),
  billingOwners(service,{}),
  rows(db,'SELECT e.id,e.kind,e.amount,e.note,e.created_at,o.name owner_name FROM owner_balance_entries e LEFT JOIN profiles o ON o.id=e.owner_id ORDER BY e.created_at DESC,e.id LIMIT 20'),
  one(db,'SELECT COALESCE(SUM(charged_cost_micros),0) micros,COUNT(*) requests FROM ai_usage_reservations WHERE created_at>=?',month),
  rows(db,"SELECT action,created_at at FROM audit_events WHERE entity_id='platform-billing' ORDER BY created_at DESC,rowid DESC LIMIT 10"),
  one(db,`SELECT COUNT(*) count FROM profiles o WHERE ${ownerFilter} AND ${balanceSql}<0`),
 ]);
 return {
  settings,phase:billingPhase(settings,at),serverTime:at,
  last30,allTime,monthly,
  owners:owners.owners,ownersTotal:owners.total,ownersLimit:owners.limit,
  debtors:debtors?.count||0,
  topups,
  aiCostUsd30:Math.round((ai?.micros||0)/10000)/100,aiRequests30:ai?.requests||0,
  history:history.map(h=>{try{return {...JSON.parse(h.action),at:h.at};}catch{return {action:'unknown',at:h.at};}}),
 };
}

const owners=(db:D1Database)=>rows(db,"SELECT DISTINCT p.owner_id id FROM properties p WHERE p.demo_owner IS NULL");
const dateText=(at:number)=>new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',year:'numeric'});

export async function saveBillingSettings(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите условия оплаты и их влияние на владельцев.');
 if(typeof body.enabled!=='boolean')throw new DomainError('Укажите, включена ли плата.');
 const percent=Number(body.ratePercent);
 if(!Number.isFinite(percent)||percent<0||percent>30||Math.round(percent*10)!==percent*10)throw new DomainError('Комиссия: от 0 до 30%, с шагом 0,1.');
 const aiPercent=body.aiRatePercent===undefined?Number(((await billingSettings(service.db))?.ai_rate_bp??1000)/100):Number(body.aiRatePercent);
 if(!Number.isFinite(aiPercent)||aiPercent<0||aiPercent>30||Math.round(aiPercent*10)!==aiPercent*10)throw new DomainError('Комиссия за режим «ИИ»: от 0 до 30%, с шагом 0,1.');
 const aiRate=Math.round(aiPercent*100),rate=Math.round(percent*100),minFee=number(body.minFee??0,'Минимум за бронь',0,1000000),maxFee=number(body.maxFee??0,'Максимум за бронь',0,10000000);
 if(maxFee>0&&maxFee<minFee)throw new DomainError('Максимум за бронь не может быть меньше минимума.');
 const free=number(body.freeBookings??0,'Бесплатные брони',0,1000),version=number(body.expectedVersion,'Версия условий',1,10000000),at=epoch();
 const before=await billingSettings(service.db);if(!before)throw new DomainError('Настройки оплаты не найдены. Примените обновление базы.',503);
 // An already running start date is kept as is; only a new or rescheduled start must lie ahead.
 let startsAt=0;
 if(body.enabled){startsAt=number(body.startsAt,'Дата начала',0,4102444800);const running=before.enabled===1&&before.starts_at<=at&&startsAt===before.starts_at;if(!running&&startsAt<at-60)throw new DomainError('Дата начала платы не может быть в прошлом.');}
 const changed=body.enabled&&(!before.enabled||before.starts_at!==startsAt||before.rate_bp!==rate||before.ai_rate_bp!==aiRate||before.min_fee!==minFee||before.max_fee!==maxFee||before.free_bookings!==free);
 const event=uuid(),statements=[
  q(service.db,"UPDATE platform_billing SET enabled=?,starts_at=?,rate_bp=?,ai_rate_bp=?,min_fee=?,max_fee=?,free_bookings=?,version=version+1,updated_by=?,updated_at=? WHERE id='global' AND version=?",body.enabled?1:0,startsAt,rate,aiRate,minFee,maxFee,free,service.userId,at,version),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',event,service.userId,'platform-billing',JSON.stringify({action:'billing.settings_changed',enabled:body.enabled,startsAt,ratePercent:percent,aiRatePercent:aiPercent,minFee,maxFee,freeBookings:free,previousVersion:version}),at),
 ];
 let notified=0;
 if(changed){
  const fees=[minFee?`не меньше ${minFee} ₸`:'',maxFee?`не больше ${maxFee} ₸`:''].filter(Boolean).join(' и ');
  const text=`С ${dateText(Math.max(startsAt,at))} сервис берёт комиссию ${String(percent).replace('.',',')}% с брони, подтверждённой через приложение${fees?` (${fees})`:''}${aiPercent!==percent?`; для квартир в режиме «ИИ», где AI администратор ведёт гостей и уборку за вас, ${String(aiPercent).replace('.',',')}%`:''}.${free?` Первые брони бесплатно: ${free}.`:''} Отменённые брони не оплачиваются.`;
  for(const o of await owners(service.db)){statements.push(q(service.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',uuid(),o.id,text,'owner:billing:'+(version+1),0,at,event));notified++;}
 }
 const results=await service.db.batch(statements);
 if(!results[0].meta.changes)throw new DomainError('Условия уже изменились. Обновите страницу.',409);
 return {message:!body.enabled?'Плата выключена. Сервис продолжает считать прогноз дохода.':notified?`Условия сохранены. Владельцы получили уведомление: ${notified}.`:'Условия сохранены.',version:version+1};
}

export async function recordBalanceEntry(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите, что деньги фактически получены или бонус согласован.');
 const kind=['topup','bonus','adjustment'].includes(body.kind)?body.kind:null;if(!kind)throw new DomainError('Выберите вид операции.');
 const ownerId=required(body.ownerId,'Владелец',100),key=required(body.requestKey,'Ключ операции',120),note=required(body.note,'Комментарий',300);
 const amount=number(body.amount,'Сумма',-10000000,10000000);
 if(!amount||(kind!=='adjustment'&&amount<0))throw new DomainError(kind==='adjustment'?'Сумма корректировки не может быть нулевой.':'Сумма должна быть больше нуля.');
 const owner=await one(service.db,'SELECT o.id,o.name FROM profiles o WHERE o.id=? AND EXISTS(SELECT 1 FROM properties p WHERE p.owner_id=o.id AND p.demo_owner IS NULL)',ownerId);
 if(!owner)throw new DomainError('Владелец не найден.',404);
 const at=epoch(),words={topup:'Пополнение баланса',bonus:'Бонус от сервиса',adjustment:'Корректировка баланса'}[kind as 'topup'];
 const results=await service.db.batch([
  q(service.db,'INSERT OR IGNORE INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES (?,?,?,?,?,?,?,?)',uuid(),ownerId,kind,amount,note,service.userId,key,at),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),service.userId,'owner-balance:'+ownerId,JSON.stringify({action:'billing.balance_entry',kind,amount}),at),
  q(service.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),ownerId,`${words}: ${amount>0?'+':''}${new Intl.NumberFormat('ru-RU').format(amount)} ₸. ${note}`,'owner:balance:'+key,0,at,key,at),
 ]);
 if(!results[0].meta.changes)throw new DomainError('Эта операция уже записана.',409);
 return {message:`${words} записано для «${owner.name}».`};
}
