import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {underAutopilot} from './autopilot';
import {stayedSql} from './stay-result';
import {availableSql,cleanerPayouts} from './regular-cleaner';

// Platform revenue model: the owner pays a commission for every booking confirmed
// through the service. While billing is off (or before its start date) every
// confirmation still records a shadow commission, which is the revenue forecast.
// A cancelled booking never costs the owner anything: balances count only
// commissions whose booking is still confirmed or completed.

export type BillingSettings={enabled:number;starts_at:number;rate_bp:number;ai_rate_bp:number;cleaning_rate_bp:number;pair_rate_bp:number;pair_month_cap:number;min_fee:number;max_fee:number;free_bookings:number;free_days?:number;version:number;updated_at:number};
const live="(SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')";

export function commissionFor(amount:number,s:Pick<BillingSettings,'rate_bp'|'min_fee'|'max_fee'>){
 let fee=Math.floor((amount*s.rate_bp+5000)/10000);
 if(s.max_fee>0)fee=Math.min(fee,s.max_fee);
 fee=Math.max(fee,s.min_fee);
 return Math.max(0,Math.min(fee,amount));
}
// A banquet hall or a café (2026-11-22): no percent of the event. A fixed sum for a calendar month by capacity,
// written by sweepHallMonths for a month that had a booking through the app (the first such month is free).
export type HallTariff={hall_small_upto:number;hall_mid_upto:number;hall_fee_small:number;hall_fee_mid:number;hall_fee_large:number};
export const hallMonthFee=(capacity:number,s:HallTariff)=>capacity<=s.hall_small_upto?s.hall_fee_small:capacity<=s.hall_mid_upto?s.hall_fee_mid:s.hall_fee_large;
const HALL_TYPES="('banquet','cafe')";
/** The month before `at` (Asia/Qyzylorda): its start, its end and its name 'YYYY-MM'. */
export function previousMonth(at:number){
 const local=new Date((at+18000)*1000),y=local.getUTCFullYear(),m=local.getUTCMonth();
 const end=Date.UTC(y,m,1)/1000-18000,start=Date.UTC(y,m-1,1)/1000-18000,d=new Date((start+18000)*1000);
 return {start,end,name:d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')};
}
/** Writes the month of every hall that had a booking through the app last month. Safe to run again: one row a month. */
export async function sweepHallMonths(db:D1Database,at=epoch()){
 // A month counts the events that took place in it (lib/stay-result.ts), by the start of the event.
 const month=previousMonth(at),held=stayedSql('c.booking_id'),startOf='(SELECT start FROM bookings WHERE id=c.booking_id)';
 const halls=await rows(db,`SELECT p.id,p.owner_id,p.title,p.capacity,s.hall_small_upto,s.hall_mid_upto,s.hall_fee_small,s.hall_fee_mid,s.hall_fee_large,
   CASE WHEN s.enabled=1 AND s.starts_at<? THEN 1 ELSE 0 END active,
   (SELECT COUNT(*) FROM platform_commissions c WHERE c.property_id=p.id AND ${startOf}>=? AND ${startOf}<? AND ${held}) bookings,
   (SELECT MAX(c.capacity) FROM platform_commissions c WHERE c.property_id=p.id AND ${startOf}>=? AND ${startOf}<? AND ${held}) month_capacity,
   EXISTS(SELECT 1 FROM platform_commissions c WHERE c.property_id=p.id AND ${startOf}<? AND ${held}) before
  FROM properties p JOIN property_details d ON d.property_id=p.id JOIN platform_billing s ON s.id='global'
  WHERE p.demo_owner IS NULL AND json_extract(d.details,'$.type') IN ${HALL_TYPES}
   AND NOT EXISTS(SELECT 1 FROM service_fees f WHERE f.kind='hall_month' AND f.ref_id=p.id||':'||?)`,month.end,month.start,month.end,month.start,month.end,month.start,month.name);
 let written=0;
 for(const h of halls){
  if(!Number(h.bookings))continue;
  // The capacity the hall had when this month's bookings were confirmed, not a later edit of the card (audit 2026-11-22).
  const fee=hallMonthFee(Number(h.month_capacity??h.capacity)||0,h as unknown as HallTariff),mode=!h.active?'shadow':h.before?'charged':'free';
  const r=await q(db,"INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at) VALUES (?,?,'owner','hall_month',?,?,?,?,?)",uuid(),h.owner_id,h.id+':'+month.name,h.id,fee,mode,month.end).run();
  if(!r.meta.changes)continue;written++;
  if(mode!=='shadow')await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),h.owner_id,
   mode==='free'?`«${h.title}»: первый месяц с бронями через приложение бесплатный (броней: ${h.bookings}).`:`«${h.title}»: за месяц броней через приложение ${h.bookings}, плата за месяц ${new Intl.NumberFormat('ru-RU').format(fee)} ₸. Спишется в понедельник вместе с остальными услугами.`,
   'owner:hall-month:'+h.id+':'+month.name,at).run();
 }
 return written;
}

// Statement for the booking-confirmation batch. The amount is computed in SQL from the
// settings row read in the same batch, so a concurrent settings change cannot split it.
// The hybrid tariff (2026-11-20): every booking pays the base rate; the AI is paid apart, per booking
// (accrueAiBookingFee). An owner on «Всё включено» pays no commission at all: the row is written with 0 ₸.
export const allInclusiveSql=(user:string,role:'owner'|'cleaner')=>`EXISTS(SELECT 1 FROM autopilot_plans ap WHERE ap.user_id=${user} AND ap.role='${role}' AND ap.tier='all' AND ap.status IN ('trial','active','grace'))`;
// «14 дней бесплатно» (2026-11-22): free_days calendar days from the owner's first listing, or from the start of
// billing if that is later, a stay confirmed through the service costs nothing (mode 'free'). The cleaning trigger
// (migration 0095) applies the same days to «Мой дом» and, from the first charged cleaning, to the performer.
export const freshSql=(owner:string,at:string)=>`(SELECT CASE WHEN MAX(s2.starts_at,COALESCE((SELECT MIN(created_at) FROM properties WHERE owner_id=${owner} AND demo_owner IS NULL),0))+s2.free_days*86400>${at} THEN 1 ELSE 0 END FROM platform_billing s2 WHERE s2.id='global')`;
export function accrueCommission(db:D1Database,bookingId:string,auditId:string,at:number){
 // A hall pays by the month (sweepHallMonths), so its booking is written with 0 ₸: it still counts for the month.
 const fee="CASE WHEN x.included=1 OR x.hall=1 THEN 0 ELSE MIN(x.amount,MAX(x.min_fee,CASE WHEN x.max_fee>0 THEN MIN(x.max_fee,(x.amount*x.rate+5000)/10000) ELSE (x.amount*x.rate+5000)/10000 END)) END";
 const used=`(SELECT COUNT(*) FROM platform_commissions c WHERE c.owner_id=x.owner_id AND c.mode IN ('free','charged') AND ${live})`;
 // A banquet hall or a café pays by the month, not by the booking (migration 0086).
 const hall="COALESCE((SELECT json_extract(d.details,'$.type') FROM property_details d WHERE d.property_id=b.property_id),'') IN ('banquet','cafe')";
 return q(db,`INSERT OR IGNORE INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed,capacity)
  SELECT x.id,x.owner_id,x.property_id,x.amount,x.rate,${fee},CASE WHEN x.enabled=1 AND x.starts_at<=? THEN CASE WHEN ${used}<x.free_bookings OR x.fresh=1 THEN 'free' ELSE 'charged' END ELSE 'shadow' END,x.version,?,x.managed,x.capacity
  FROM (SELECT z.*,CASE WHEN ${allInclusiveSql('z.owner_id','owner')} THEN 1 ELSE 0 END included,CASE WHEN ${allInclusiveSql('z.owner_id','owner')} THEN 0 ELSE z.rate_bp END rate FROM (SELECT b.id,p.owner_id,b.property_id,b.amount,p.capacity,s.min_fee,s.max_fee,s.enabled,s.starts_at,s.free_bookings,s.version,${freshSql('p.owner_id','?')} fresh,CASE WHEN ${hall} THEN 0 ELSE s.rate_bp END rate_bp,CASE WHEN ${hall} THEN 1 ELSE 0 END hall,s.ai_rate_bp,CASE WHEN ${underAutopilot('b.property_id')} THEN 1 ELSE 0 END managed
   FROM bookings b JOIN properties p ON p.id=b.property_id JOIN platform_billing s ON s.id='global'
   WHERE b.id=? AND b.status='confirmed' AND p.demo_owner IS NULL AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)) z) x`,at,at,at,at,bookingId,auditId);
}

/** A change of the stay the guest and the owner agreed (decideBookingChange): the commission follows the new price, at the
 *  rate kept in its row and the current limits. Debts are summed on the fly (lib/service-dues.ts), so a week already
 *  paid shows the difference as the next charge or an overpayment. A hall (rate 0) stays 0 ₸. Written only when `gate`
 *  holds, in the same batch as the new price; the audit row keeps both sums. */
export function recalcCommission(db:D1Database,bookingId:string,amount:number,changeId:string,actor:string,at:number){
 const limit=(c:string)=>`(SELECT ${c} FROM platform_billing WHERE id='global')`;
 const n='CAST(?1 AS INTEGER)',fee=`CASE WHEN rate_bp=0 THEN 0 ELSE MIN(${n},MAX(${limit('min_fee')},CASE WHEN ${limit('max_fee')}>0 THEN MIN(${limit('max_fee')},(${n}*rate_bp+5000)/10000) ELSE (${n}*rate_bp+5000)/10000 END)) END`;
 // The same gate as the new price: the change was accepted and the terms are still the ones it was made on.
 const gate="EXISTS(SELECT 1 FROM booking_changes c JOIN booking_terms t ON t.booking_id=c.booking_id WHERE c.id=?3 AND c.status='accepted' AND t.version=c.base_version)";
 return [
  q(db,`INSERT INTO audit_events SELECT ?4,?5,?2,json_object('action','billing.commission_recalculated','from',amount,'to',${fee},'bookingAmount',?1),?6 FROM platform_commissions WHERE booking_id=?2 AND booking_amount<>CAST(?1 AS INTEGER) AND ${gate}`,amount,bookingId,changeId,uuid(),actor,at),
  q(db,`UPDATE platform_commissions SET booking_amount=CAST(?1 AS INTEGER),amount=${fee} WHERE booking_id=?2 AND booking_amount<>CAST(?1 AS INTEGER) AND ${gate}`,amount,bookingId,changeId),
 ];
}

// «Автопилот» paid for the result: a booking confirmed while its object is under the AI costs the owner
// ai_booking_fee, at most ai_month_cap a month for one object (bookings cancelled later do not count: lib/service-fees.ts
// reads only live ones). Nothing under «Всё включено». Money is taken only while plan_charge is on; until then the
// row is a forecast (shadow). Written in the same batch as the confirmation, from the settings read in it.
export function accrueAiBookingFee(db:D1Database,bookingId:string,auditId:string,at:number){
 const month="CAST(strftime('%s',date(?,'unixepoch','+5 hours','start of month')) AS INTEGER)-18000";
 const used=`COALESCE((SELECT SUM(f.amount) FROM service_fees f WHERE f.kind='ai_booking' AND f.property_id=x.property_id AND f.mode=x.mode AND f.created_at>=${month} AND (SELECT status FROM bookings WHERE id=f.ref_id) IN ('confirmed','completed')),0)`;
 return q(db,`INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at)
  SELECT ?,x.owner_id,'owner','ai_booking',x.id,x.property_id,CASE WHEN x.cap>0 THEN MIN(x.fee,MAX(0,x.cap-${used})) ELSE x.fee END,x.mode,?
  FROM (SELECT b.id,p.owner_id,b.property_id,s.ai_booking_fee fee,s.ai_month_cap cap,CASE WHEN s.plan_charge=1 THEN 'charged' ELSE 'shadow' END mode
   FROM bookings b JOIN properties p ON p.id=b.property_id JOIN platform_billing s ON s.id='global'
   WHERE b.id=? AND b.status='confirmed' AND p.demo_owner IS NULL AND s.ai_booking_fee>0 AND ${underAutopilot('b.property_id')}
    AND NOT ${allInclusiveSql('p.owner_id','owner')} AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)) x`,uuid(),at,at,bookingId,at,auditId);
}

export async function billingSettings(db:D1Database){
 return (await one(db,"SELECT enabled,starts_at,rate_bp,ai_rate_bp,cleaning_rate_bp,pair_rate_bp,pair_month_cap,min_fee,max_fee,free_bookings,free_days,version,updated_at FROM platform_billing WHERE id='global'")) as BillingSettings|null;
}
export function billingPhase(s:BillingSettings|null,at=epoch()){return !s||!s.enabled?'off':s.starts_at>at?'scheduled':'active';}

// Free balance: top-ups minus booking and cleaning commissions and cleaning reserves.
const balanceSql=availableSql('o.id');

// Everyone who can owe the service: an owner with a real listing, or a performer with a fee for a cleaning.
const ownerFilter="(EXISTS(SELECT 1 FROM properties p WHERE p.owner_id=o.id AND p.demo_owner IS NULL) OR EXISTS(SELECT 1 FROM service_fees f WHERE f.user_id=o.id AND f.role='cleaner'))";
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
 const [last30,allTime,monthly,owners,topups,ai,history,debtors,cleaners]=await Promise.all([
  totals(month),totals(0),
  rows(db,`SELECT strftime('%Y-%m',c.created_at+18000,'unixepoch') month,COUNT(*) bookings,SUM(c.booking_amount) turnover,SUM(c.amount) projected,SUM(CASE WHEN c.mode='charged' THEN c.amount ELSE 0 END) charged FROM platform_commissions c WHERE c.created_at>=? AND ${live} GROUP BY month ORDER BY month DESC`,at-183*86400),
  billingOwners(service,{}),
  rows(db,'SELECT e.id,e.kind,e.amount,e.note,e.test,e.created_at,o.name owner_name FROM owner_balance_entries e LEFT JOIN profiles o ON o.id=e.owner_id ORDER BY e.created_at DESC,e.id LIMIT 20'),
  one(db,'SELECT COALESCE(SUM(charged_cost_micros),0) micros,COUNT(*) requests FROM ai_usage_reservations WHERE created_at>=?',month),
  rows(db,"SELECT action,created_at at FROM audit_events WHERE entity_id='platform-billing' ORDER BY created_at DESC,rowid DESC LIMIT 10"),
  one(db,`SELECT COUNT(*) count FROM profiles o WHERE ${ownerFilter} AND ${balanceSql}<0`),
  cleanerPayouts(db),
 ]);
 return {
  settings,phase:billingPhase(settings,at),serverTime:at,
  last30,allTime,monthly,
  owners:owners.owners,ownersTotal:owners.total,ownersLimit:owners.limit,
  debtors:debtors?.count||0,
  cleaners,
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
 // ai_rate_bp is kept for the history only: since the hybrid tariff the AI is paid per booking (accrueAiBookingFee).
 const aiPercent=body.aiRatePercent===undefined?Number(((await billingSettings(service.db))?.ai_rate_bp??1000)/100):Number(body.aiRatePercent);
 if(!Number.isFinite(aiPercent)||aiPercent<0||aiPercent>30||Math.round(aiPercent*10)!==aiPercent*10)throw new DomainError('Комиссия за режим «ИИ»: от 0 до 30%, с шагом 0,1.');
 // Cleaning commissions: every finished cleaning and the lower rate with a monthly cap for a regular pair.
 const prev=await billingSettings(service.db);
 const pct=(v:any,fallback:number,label:string)=>{const n=v===undefined?fallback/100:Number(v);if(!Number.isFinite(n)||n<0||n>30||Math.round(n*10)!==n*10)throw new DomainError(label+': от 0 до 30%, с шагом 0,1.');return Math.round(n*100);};
 const cleaningRate=pct(body.cleaningRatePercent,prev?.cleaning_rate_bp??1000,'Комиссия за уборку'),pairRate=pct(body.pairRatePercent,prev?.pair_rate_bp??500,'Комиссия для постоянной пары');
 const pairCap=body.pairMonthCap===undefined?(prev?.pair_month_cap??2000):number(body.pairMonthCap,'Потолок в месяц для пары',0,10000000);
 if(pairRate>cleaningRate)throw new DomainError('Комиссия для постоянной пары не может быть выше обычной.');
 const aiRate=Math.round(aiPercent*100),rate=Math.round(percent*100),minFee=number(body.minFee??0,'Минимум за бронь',0,1000000),maxFee=number(body.maxFee??0,'Максимум за бронь',0,10000000);
 if(maxFee>0&&maxFee<minFee)throw new DomainError('Максимум за бронь не может быть меньше минимума.');
 const free=number(body.freeBookings??0,'Бесплатные брони',0,1000),version=number(body.expectedVersion,'Версия условий',1,10000000),at=epoch();
 const before=await billingSettings(service.db);if(!before)throw new DomainError('Настройки оплаты не найдены. Примените обновление базы.',503);
 // An already running start date is kept as is; only a new or rescheduled start must lie ahead.
 let startsAt=0;
 if(body.enabled){startsAt=number(body.startsAt,'Дата начала',0,4102444800);const running=before.enabled===1&&before.starts_at<=at&&startsAt===before.starts_at;if(!running&&startsAt<at-60)throw new DomainError('Дата начала платы не может быть в прошлом.');}
 const changed=body.enabled&&(!before.enabled||before.starts_at!==startsAt||before.rate_bp!==rate||before.ai_rate_bp!==aiRate||before.min_fee!==minFee||before.max_fee!==maxFee||before.free_bookings!==free||before.cleaning_rate_bp!==cleaningRate||before.pair_rate_bp!==pairRate||before.pair_month_cap!==pairCap);
 const event=uuid(),statements=[
  q(service.db,"UPDATE platform_billing SET enabled=?,starts_at=?,rate_bp=?,ai_rate_bp=?,cleaning_rate_bp=?,pair_rate_bp=?,pair_month_cap=?,min_fee=?,max_fee=?,free_bookings=?,version=version+1,updated_by=?,updated_at=? WHERE id='global' AND version=?",body.enabled?1:0,startsAt,rate,aiRate,cleaningRate,pairRate,pairCap,minFee,maxFee,free,service.userId,at,version),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',event,service.userId,'platform-billing',JSON.stringify({action:'billing.settings_changed',enabled:body.enabled,startsAt,ratePercent:percent,aiRatePercent:aiPercent,cleaningRatePercent:cleaningRate/100,pairRatePercent:pairRate/100,pairMonthCap:pairCap,minFee,maxFee,freeBookings:free,previousVersion:version}),at),
 ];
 let notified=0;
 if(changed){
  const fees=[minFee?`не меньше ${minFee} ₸`:'',maxFee?`не больше ${maxFee} ₸`:''].filter(Boolean).join(' и ');
  const text=`С ${dateText(Math.max(startsAt,at))} сервис берёт комиссию ${String(percent).replace('.',',')}% с брони, подтверждённой через приложение${fees?` (${fees})`:''}.${free?` Первые брони бесплатно: ${free}.`:''}${Number(before.free_days)>0?` Первые ${before.free_days} дней с первого объявления бесплатно.`:''} Отменённые брони не оплачиваются.${cleaningRate>0?` За принятую уборку ${String(cleaningRate/100).replace('.',',')}%, для постоянного исполнителя ${String(pairRate/100).replace('.',',')}%${pairCap>0?` и не больше ${pairCap} ₸ в месяц`:''}.`:''}`;
  for(const o of await owners(service.db)){statements.push(q(service.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',uuid(),o.id,text,'owner:billing:'+(version+1),0,at,event));notified++;}
 }
 const results=await service.db.batch(statements);
 if(!results[0].meta.changes)throw new DomainError('Условия уже изменились. Обновите страницу.',409);
 return {message:!body.enabled?'Плата выключена. Сервис продолжает считать прогноз дохода.':notified?`Условия сохранены. Владельцы получили уведомление: ${notified}.`:'Условия сохранены.',version:version+1};
}

export async function recordBalanceEntry(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите, что деньги фактически получены или бонус согласован.');
 const kind=['topup','bonus','adjustment'].includes(body.kind)?body.kind:null;if(!kind)throw new DomainError('Выберите вид операции.');
 const ownerId=required(body.ownerId??body.userId,'Участник',100),key=required(body.requestKey,'Ключ операции',120),note=required(body.note,'Комментарий',300);
 const amount=number(body.amount,'Сумма',-10000000,10000000);
 if(!amount||(kind!=='adjustment'&&amount<0))throw new DomainError(kind==='adjustment'?'Сумма корректировки не может быть нулевой.':'Сумма должна быть больше нуля.');
 // An owner or a performer (audit «Оплата услуг», point 2): a payment confirmed outside the card closes the debt of either.
 const owner=await one(service.db,`SELECT o.id,o.name FROM profiles o WHERE o.id=? AND ${ownerFilter}`,ownerId);
 if(!owner)throw new DomainError('Участник не найден: оплату можно внести владельцу с объявлением или исполнителю с начислениями.',404);
 const at=epoch(),words={topup:'Оплата услуг сервиса',bonus:'Бонус от сервиса',adjustment:'Корректировка учёта'}[kind as 'topup'];
 const results=await service.db.batch([
  q(service.db,'INSERT OR IGNORE INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES (?,?,?,?,?,?,?,?)',uuid(),ownerId,kind,amount,note,service.userId,key,at),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),service.userId,'owner-balance:'+ownerId,JSON.stringify({action:'billing.balance_entry',kind,amount}),at),
  q(service.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owner_balance_entries WHERE request_key=? AND created_at=?)',uuid(),ownerId,`${words}: ${amount>0?'+':''}${new Intl.NumberFormat('ru-RU').format(amount)} ₸. ${note}`,'owner:balance:'+key,0,at,key,at),
 ]);
 if(!results[0].meta.changes)throw new DomainError('Эта операция уже записана.',409);
 return {message:`${words} записано для «${owner.name}».`};
}
