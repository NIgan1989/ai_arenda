import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,one,rows,q,type Row} from './operation-core';
import {geoDistance} from './map-location';
import {kindCategory,checkinMethods} from './listings';
import {GUARANTEE_WAIT} from './guarantee-text';
export {GUARANTEE_WAIT,GUARANTEE_REASONS,guaranteeReason,type GuaranteeReason} from './guarantee-text';

// «Гарантия заселения» (concept 2026-11-27, migration 0107). The guest at the door taps «Не получается заселиться»
// and names what happened. The owner hears it at once («Меня не заселили», lib/account-restrictions.ts). If ten minutes
// later nobody has let the guest in, the guest sees up to three free places nearby that are no dearer and confirm a
// booking at once. Picking one books it and cancels the first booking by the owner's terms: a full refund the owner
// makes, as the refund mark and reminders already ask (lib/service.ts cancel).
const NEAR=5000,SHOWN=3,MIN_LEFT=3600;
// SQL: the guest of this booking may leave it by the owner's terms (one ? for now): they said they were not let in,
// the ten minutes passed and nobody marked them inside since.
export const notLetInWaitedSql=(booking:string)=>`EXISTS(SELECT 1 FROM checkin_guarantees g JOIN booking_terms gt ON gt.booking_id=g.booking_id WHERE g.booking_id=${booking} AND g.reported_at+${GUARANTEE_WAIT}<=? AND gt.actual_checkin IS NULL AND gt.checkin_reported_at IS NULL)`;

async function reported(s:RentalService,bookingId:string){
 const b=await one(s.db,`SELECT b.id,b.property_id,b.guest_id,b.start,b."end",b.guests,b.amount,b.status,p.owner_id,p.title,p.city,
   (SELECT json_extract(details,'$.type') FROM property_details WHERE property_id=p.id) type,
   t.billing_mode,t.actual_checkin,t.checkin_reported_at,g.reason,g.reported_at,g.replaced_by,g.replaced_at
  FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN booking_terms t ON t.booking_id=b.id LEFT JOIN checkin_guarantees g ON g.booking_id=b.id
  WHERE b.id=? AND b.guest_id=?`,bookingId,s.userId);
 if(!b)throw new DomainError('Бронь не найдена.',404);
 return b;
}
const metres=(m:number)=>m<1000?Math.max(100,Math.round(m/100)*100):Math.round(m/100)*100;

// The places that take the guest instead: the same city and kind of stay, free from now to the end of the booking,
// no dearer than it, of another owner, ready now and confirming by themselves. The nearest first, within 5 km.
export async function guaranteeOptions(s:RentalService,b:Row,at=epoch()){
 if(kindCategory(b.type||'apartment')!=='stay')return [];
 const start=Math.max(Number(b.start),Math.ceil(at/60)*60),end=Number(b.end);
 if(end-start<MIN_LEFT)return [];
 const mode=b.billing_mode==='hourly'?'hourly':b.billing_mode==='nightly'?'night':'daily',iso=(v:number)=>new Date(v*1000).toISOString();
 const found=(await s.publicSearch({city:String(b.city||''),start:iso(start),end:iso(end),guests:String(b.guests||1),mode,category:'stay',limit:'60'},{matching:true})).properties;
 const fit=found.filter((p:Row)=>p.id!==b.property_id&&!p.test_preview&&Number(p.estimate?.amount)>0&&Number(p.estimate.amount)<=Number(b.amount));
 if(!fit.length)return [];
 const ids=fit.map((p:Row)=>p.id),marks=ids.map(()=>'?').join(',');
 const [owners,instant,points]=await Promise.all([
  rows(s.db,`SELECT id,owner_id FROM properties WHERE id IN (${marks})`,...ids),
  rows(s.db,`SELECT property_id,version FROM property_policies WHERE auto_confirm=1 AND (mandate_until=0 OR mandate_until>?) AND property_id IN (${marks})`,at,...ids),
  rows(s.db,`SELECT l.property_id,l.longitude,l.latitude FROM property_locations l JOIN properties p ON p.id=l.property_id WHERE l.address_fingerprint=p.city||'|'||p.district||'|'||p.address AND l.property_id IN (?,${marks})`,b.property_id,...ids),
 ]);
 const ownerOf=new Map(owners.map(o=>[o.id,o.owner_id])),version=new Map(instant.map(v=>[v.property_id,Number(v.version)]));
 const at0=points.find(l=>l.property_id===b.property_id),pointOf=new Map(points.map(l=>[l.property_id,[Number(l.longitude),Number(l.latitude)] as [number,number]]));
 return fit.filter((p:Row)=>ownerOf.get(p.id)&&ownerOf.get(p.id)!==b.owner_id&&version.has(p.id))
  .map((p:Row)=>{const there=pointOf.get(p.id),distance=at0&&there?geoDistance([Number(at0.longitude),Number(at0.latitude)],there):null;return {p,distance};})
  .filter(x=>x.distance===null||x.distance<=NEAR)
  .sort((a,b)=>(a.distance??NEAR+1)-(b.distance??NEAR+1)||a.p.estimate.amount-b.p.estimate.amount||String(a.p.id).localeCompare(String(b.p.id)))
  .slice(0,SHOWN)
  .map(({p,distance})=>({propertyId:String(p.id),title:String(p.title),district:String(p.district||''),type:String(p.details?.type||'apartment'),photo:(Array.isArray(p.photos)?p.photos[0]:null)||null,
   amount:Number(p.estimate.amount),billingMode:String(p.estimate.billingMode),policyVersion:version.get(p.id)!,start,end,distance:distance===null?null:metres(distance),
   checkin:checkinMethods[String(p.details?.checkinMethod||'')]||''}));
}

// What the guest's card shows after «Не получается заселиться»: waiting for the owner, the places to move to, inside, or moved.
export async function guaranteeState(s:RentalService,bookingId:string){
 const b=await reported(s,bookingId),at=epoch();
 if(!b.reported_at)return {reported:false};
 const reportedAt=Number(b.reported_at),waitUntil=reportedAt+GUARANTEE_WAIT;
 const answer=await one(s.db,"SELECT MIN(m.created_at) at FROM discussion_messages m JOIN discussion_rooms r ON r.id=m.room_id WHERE r.entity_kind='booking' AND r.entity_id=? AND m.sender_role='owner' AND m.created_at>=?",b.id,reportedAt);
 const moved=b.replaced_by?await one(s.db,'SELECT b.id,b.start,b."end",b.amount,b.status,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?',b.replaced_by):null;
 const inside=!!b.actual_checkin||!!b.checkin_reported_at;
 const step=moved?'moved':inside?'inside':b.status!=='confirmed'?'closed':at<waitUntil?'waiting':'options';
 return {reported:true,reason:String(b.reason),reportedAt,waitUntil,now:at,ownerAnsweredAt:answer?.at==null?null:Number(answer.at),step,
  amount:Number(b.amount),moved:moved?{bookingId:String(moved.id),title:String(moved.title),start:Number(moved.start),end:Number(moved.end),amount:Number(moved.amount)}:null,
  options:step==='options'?await guaranteeOptions(s,b,at):[]};
}

// The guest picks a place: it is booked and confirmed by its owner's own rules, then the first booking is cancelled
// by the owner's terms. A place that would not confirm at once is let go, and the first booking stays as it was.
export async function switchStay(s:RentalService,body:Row){
 const bookingId=String(body.bookingId||''),propertyId=String(body.propertyId||''),at=epoch();
 const b=await reported(s,bookingId);
 if(!b.reported_at)throw new DomainError('Сначала нажмите «Не получается заселиться».',409);
 if(b.replaced_by)throw new DomainError('Замена уже выбрана. Она в ваших бронях.',409);
 if(b.status!=='confirmed'||b.actual_checkin||b.checkin_reported_at)throw new DomainError('Эта бронь уже закрыта или вы заселились.',409);
 if(at<Number(b.reported_at)+GUARANTEE_WAIT)throw new DomainError('Владелец ещё может ответить. Варианты появятся через 10 минут после вашего сообщения.',409);
 const option=(await guaranteeOptions(s,b,at)).find(o=>o.propertyId===propertyId);
 if(!option)throw new DomainError('Это жильё уже заняли. Выберите другой вариант.',409);
 if(body.shownAmount!==undefined&&option.amount>Number(body.shownAmount))throw new DomainError('Цена изменилась. Посмотрите варианты ещё раз.',409);
 const iso=(v:number)=>new Date(v*1000).toISOString();
 const made=await s.createBooking({propertyId,start:iso(option.start),end:iso(option.end),guests:b.guests,billingMode:option.billingMode,expectedAmount:option.amount,expectedPolicyVersion:option.policyVersion,acceptTerms:true,requestKey:'guarantee:'+b.id+':'+propertyId},{replacing:b.id});
 const fresh=await one(s.db,'SELECT status FROM bookings WHERE id=?',made.id);
 if(fresh?.status!=='confirmed'){
  if(fresh?.status==='requested')await s.bookingAction(made.id,{action:'cancel'}).catch(()=>undefined);
  throw new DomainError('Это жильё не смогло подтвердить бронь сразу. Выберите другой вариант.',409);
 }
 const mark=await q(s.db,'UPDATE checkin_guarantees SET replaced_by=?,replaced_at=? WHERE booking_id=? AND replaced_by IS NULL',made.id,at,b.id).run();
 if(!mark.meta.changes){await s.bookingAction(made.id,{action:'cancel'}).catch(()=>undefined);throw new DomainError('Замена уже выбрана. Она в ваших бронях.',409);}
 try{
  const cancelled=await s.bookingAction(b.id,{action:'cancel'});
  const refund=Number(cancelled?.cancel?.refund)||0,money=(n:number)=>n.toLocaleString('ru-RU').replace(/ | /g,' ')+' ₸';
  return {bookingId:made.id,message:refund?'Бронь в «'+option.title+'» подтверждена. Первая бронь отменена, владелец вернёт вам '+money(refund)+'.':'Бронь в «'+option.title+'» подтверждена. Первая бронь отменена.'};
 }catch(error){
  // The owner let the guest in a moment before: the first booking stands, the new one is let go.
  await q(s.db,'UPDATE checkin_guarantees SET replaced_by=NULL,replaced_at=NULL WHERE booking_id=? AND replaced_by=?',b.id,made.id).run();
  await s.bookingAction(made.id,{action:'cancel'}).catch(()=>undefined);
  throw error;
 }
}
