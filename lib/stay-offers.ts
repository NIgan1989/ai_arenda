import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';

// Late checkout and early check-in. The guest asks in the booking chat; the AI administrator checks
// the calendar and the cleaning around the stay, prices the extra hours at the flat's current tariff
// and answers with one button. The button goes through the usual change of the stay: within the owner's
// rules (mode «ИИ» with automatic extension) it applies at once, otherwise the owner confirms it.

export const STAY_OFFER_TTL=1800,LATE_MAX_HOURS=3,EARLY_MAX_HOURS=3;
const HOUR=3600,ceilHour=(t:number)=>Math.ceil(t/HOUR)*HOUR;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const clock=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
const iso=(t:number)=>new Date(t*1000).toISOString();
const plural=(n:number)=>n===1?'час':n<5?'часа':'часов';

// Asking to come earlier or to stay longer.
export const wantsEarly=(text:string)=>/раньше|пораньше|ранн\S* заезд|заехать раньше|заселиться раньше/i.test(text);

// Pure: how many whole hours fit after the checkout (or before the check-in) without touching
// another stay, a cleaning or an external block. The cleaning after this stay moves with it.
export function freeHours(kind:'late'|'early',stay:{start:number;end:number},busy:[number,number][],cleaningMinutes:number,t:number,max:number){
 if(kind==='late'){
  if(stay.end<=t)return 0;
  const next=Math.min(...busy.filter(([s])=>s>=stay.end).map(([s])=>s),Infinity);
  return Math.max(0,Math.min(max,Math.floor((next-cleaningMinutes*60-stay.end)/HOUR)));
 }
 const prev=Math.max(...busy.filter(([,e])=>e<=stay.start).map(([,e])=>e),0);
 const from=Math.max(prev,ceilHour(t+1800));
 return Math.max(0,Math.min(max,Math.floor((stay.start-from)/HOUR)));
}

async function busyAround(db:D1Database,b:Row,t:number):Promise<[number,number][]>{
 const from=b.start-24*HOUR,to=b.end+24*HOUR;
 const list=await rows(db,`SELECT start,occupied_until e FROM bookings WHERE property_id=? AND id<>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>? AND start<?
  UNION ALL SELECT start,end e FROM cleaning_jobs WHERE property_id=? AND (booking_id IS NULL OR booking_id<>?) AND status IN ('open','assigned','in_progress','submitted') AND end>? AND start<?
  UNION ALL SELECT x.start,x.end+? e FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=? AND s.enabled=1 AND x.end>? AND x.start<?`,
  b.property_id,b.id,t,from,to,b.property_id,b.id,from,to,b.cleaning_minutes*60,b.property_id,from,to);
 return list.map(r=>[Number(r.start),Number(r.e)] as [number,number]);
}

// How many hours the guest named: «на 2 часа», «на пару часов», «на часик». Null when not said.
export function wantedHours(text:string){
 const m=text.match(/на\s+(\d{1,2})\s*(?:ч|час)/i);if(m)return Math.max(1,Number(m[1]));
 if(/пар[уы] час/i.test(text))return 2;
 if(/на\s+(?:один\s+|одн[уо]\s+)?час(?:ик|ок)?(?![а-яё])/i.test(text))return 1;
 return null;
}

// Makes the offer for a guest's stay. Null when nothing fits; the reason goes to the chat answer.
export async function makeStayOffer(s:RentalService,bookingId:string,kind:'late'|'early',t=epoch(),wanted:number|null=null):Promise<{offer:Row|null;reason:string}>{
 const b=await one(s.db,"SELECT b.*,p.owner_id,p.cleaning_minutes,p.title,t.billing_mode,t.actual_checkin,t.actual_checkout,t.checkout_reported_at FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND b.guest_id=?",bookingId,s.userId);
 if(!b||b.status!=='confirmed'||b.actual_checkout||b.checkout_reported_at)return {offer:null,reason:'closed'};
 if(kind==='early'&&(b.actual_checkin||b.start<=t+HOUR))return {offer:null,reason:'started'};
 // A daily stay is priced by whole days: a few extra hours are agreed with the owner.
 if(!['hourly','nightly'].includes(b.billing_mode))return {offer:null,reason:'daily'};
 const policy=await one(s.db,'SELECT hourly_price,auto_extension,max_extension_hours FROM property_policies WHERE property_id=?',b.property_id);
 if(!policy?.hourly_price)return {offer:null,reason:'no_hourly'};
 let hours=freeHours(kind,{start:Number(b.start),end:Number(b.end)},await busyAround(s.db,b,t),b.cleaning_minutes,t,Math.min(wanted||Infinity,kind==='late'?LATE_MAX_HOURS:EARLY_MAX_HOURS));
 if(!hours)return {offer:null,reason:'busy'};
 // The longest stretch the owner's rules accept, down to one hour. One that applies at once under the
 // owner's automatic extension wins over a longer one that needs the owner.
 let best:{start:number;end:number;hours:number;quote:Row}|null=null;
 for(;hours>=1;hours--){
  const start=kind==='early'?b.start-hours*HOUR:b.start,end=kind==='late'?b.end+hours*HOUR:b.end;
  let quote:Row;
  try{quote=await s.bookingChangeQuote(bookingId,'guest',{start:iso(start),end:iso(end),billingMode:b.billing_mode});}
  catch(error){if(error instanceof DomainError)continue;throw error;}
  if(quote.automatic){best={start,end,hours,quote};break;}
  if(!best)best={start,end,hours,quote};
  if(!(policy.auto_extension&&kind==='late'))break;
 }
 if(best){
  const {start,end,quote}=best,id=uuid(),extra=quote.amount-b.amount;hours=best.hours;
  await s.db.batch([
   q(s.db,"UPDATE stay_offers SET status='expired',decided_at=? WHERE booking_id=? AND status='suggested'",t,bookingId),
   q(s.db,'INSERT INTO stay_offers(id,booking_id,guest_id,owner_id,kind,start,end,hours,amount,extra,billing_mode,base_version,policy_version,automatic,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,bookingId,s.userId,b.owner_id,kind,start,end,hours,quote.amount,extra,b.billing_mode,quote.baseVersion,quote.policyVersion,quote.automatic?1:0,t,t+STAY_OFFER_TTL),
   q(s.db,'INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,0,?)',uuid(),s.userId,stayOfferText({kind,start,end,hours,extra,automatic:quote.automatic}),'guest:stay:'+id,t),
   q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),'system:stay-offers',bookingId,JSON.stringify({action:'stay.offered',offerId:id,kind,hours,amount:quote.amount,extra,onBehalfOf:b.owner_id}),t)
  ]);
  return {offer:await one(s.db,'SELECT * FROM stay_offers WHERE id=?',id),reason:''};
 }
 return {offer:null,reason:'rules'};
}

export function stayOfferText(o:Row){
 const what=o.kind==='late'?'Можно остаться до '+clock(o.end)+' (ещё '+o.hours+' '+plural(o.hours)+')':'Можно заехать с '+clock(o.start)+' (на '+o.hours+' '+plural(o.hours)+' раньше)';
 return what+', доплата '+money(o.extra)+'. '+(o.automatic?'Нажмите кнопку, и я сразу оформлю.':'Нажмите кнопку, и я отправлю запрос владельцу на подтверждение.');
}

// The chat answer for «можно продлить?» / «можно заехать раньше?».
export function stayOfferAnswer(result:{offer:Row|null;reason:string},kind:'late'|'early'){
 if(result.offer)return stayOfferText(result.offer)+' Кнопка в уведомлении и на карте, предложение действует 30 минут.';
 const word=kind==='late'?'Продлить':'Заехать раньше';
 if(result.reason==='busy')return word+' сейчас не получится: '+(kind==='late'?'после вас':'до вас')+' в жилье другой гость или уборка.';
 if(result.reason==='daily'||result.reason==='no_hourly')return word+' на несколько часов можно по договорённости с владельцем: нажмите «Изменить даты или продлить» в карточке брони, я покажу сумму.';
 if(result.reason==='started')return 'Заезд уже скоро или вы заселились: время заезда больше не меняется.';
 return word+' сейчас не получится по правилам жилья. Если нужно, напишите владельцу.';
}

export async function guestStayOffers(db:D1Database,guestId:string,t=epoch()){
 await q(db,"UPDATE stay_offers SET status='expired',decided_at=? WHERE guest_id=? AND status='suggested' AND expires_at<=?",t,guestId,t).run();
 return rows(db,"SELECT o.*,p.title FROM stay_offers o JOIN bookings b ON b.id=o.booking_id JOIN properties p ON p.id=b.property_id WHERE o.guest_id=? AND o.status='suggested' AND o.expires_at>? ORDER BY o.created_at DESC LIMIT 3",guestId,t);
}

export async function decideStayOffer(s:RentalService,offerId:string,accept:boolean){
 const t=epoch(),id=required(offerId,'Предложение',100);
 const o=await one(s.db,'SELECT * FROM stay_offers WHERE id=? AND guest_id=?',id,s.userId);
 if(!o)throw new DomainError('Предложение недоступно.',404);
 if(o.status!=='suggested'||o.expires_at<=t)throw new DomainError('Предложение уже неактуально. Спросите ещё раз в чате брони.',409);
 if(!accept){
  const r=await q(s.db,"UPDATE stay_offers SET status='declined',decided_at=? WHERE id=? AND status='suggested'",t,id).run();
  if(!r.meta.changes)throw new DomainError('Предложение уже изменилось.',409);
  return {message:'Хорошо, время остаётся прежним.'};
 }
 const result=await s.proposeBookingChange(o.booking_id,'guest',{start:iso(o.start),end:iso(o.end),billingMode:o.billing_mode,requestKey:'stay-offer:'+id,expectedAmount:o.amount,baseVersion:o.base_version,policyVersion:o.policy_version,acceptTerms:true,
  reason:(o.kind==='late'?'Поздний выезд до ':'Ранний заезд с ')+clock(o.kind==='late'?o.end:o.start)+', предложение AI администратора'});
 await q(s.db,"UPDATE stay_offers SET status='accepted',decided_at=?,change_id=? WHERE id=? AND status='suggested'",t,result.id,id).run();
 const applied=await one(s.db,"SELECT 1 FROM booking_changes WHERE id=? AND status='accepted'",result.id);
 return {message:applied?(o.kind==='late'?'Готово: выезд до '+clock(o.end)+'. Доплата '+money(o.extra)+'.':'Готово: заезд с '+clock(o.start)+'. Доплата '+money(o.extra)+'.'):'Запрос отправлен владельцу. Как только он подтвердит, время изменится.'};
}
