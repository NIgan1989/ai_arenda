import {DomainError,required,number} from './domain';
import {RentalService} from './service';
import {staffPlace} from './staff';
import {isAuto} from './listings';
import {leadOf,pickRoom,roomsOf} from './room-units';
import {venueHours,fitsHours} from './venue-hours';
import {defaultPolicy,prepSeconds} from './rental-policy';
import {freeStarts,servicesOf} from './venue-services';
import {bayPlan,nextAverage,waitMinutes,MAX_WAITING,STALE_SECONDS,SELF_STALE_SECONDS,type BayLoad} from './bay-plan';
import {closeNoShow} from './stay-watch';
import {q,one,rows,epoch,uuid,type Row} from './operation-core';

// «Посты» of a car place (lib/bay-plan.ts): the boxes of one card, marked by the person on shift or by the owner.
// A tap is a fact about the place, written as it is: it never books, cancels or charges anyone by itself. A box of the
// bookings also passes the fact to its booking («машина на месте», «машина уехала»), and the booking's own rules follow.

const CLOSED=['maintenance','blocked'];
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const dayOf=(at:number)=>Math.floor((at+18000)/86400)*86400-18000;
const detailsOf=(raw:unknown):Row=>{try{return JSON.parse(String(raw||'{}'))||{};}catch{return {};}};

/** The boxes of a card and its rules: the card (lead) first. */
async function card(db:D1Database,propertyId:string){
 const lead=await leadOf(db,propertyId),ids=await roomsOf(db,lead);
 const p=await one(db,'SELECT p.id,p.title,p.owner_id,p.cleaning_minutes,(SELECT details FROM property_details WHERE property_id=p.id) details FROM properties p WHERE p.id=?',lead);
 if(!p)throw new DomainError('Объект недоступен.',404);
 const details=detailsOf(p.details),policy={...defaultPolicy,...await one(db,'SELECT * FROM property_policies WHERE property_id=?',lead)};
 return {lead,ids,p,details,policy,plan:bayPlan(details,ids.length),hours:venueHours(String(details.type||''),policy.venue_hours)};
}
/** What holds a box over [from, to): bookings with their time after, cleanings and calendar blocks. */
export async function busyIntervals(db:D1Database,id:string,from:number,to:number,at:number,except=''):Promise<[number,number][]>{
 return [...await rows(db,"SELECT start,occupied_until e FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>? AND id<>?",id,at,to,from,except),
  ...await rows(db,"SELECT start,end e FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",id,to,from),
  ...await rows(db,'SELECT x.start,x.end e FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=? AND s.enabled=1 AND x.start<? AND x.end>?',id,to,from)].map(r=>[Number(r.start),Number(r.e)] as [number,number]);
}
/** The free starts of a day for a service of `minutes` over the boxes that take bookings, a box under repair skipped. */
export async function bookingStarts(db:D1Database,c:Awaited<ReturnType<typeof card>>,minutes:number,day:number,at:number,except=''){
 const ids=c.ids.slice(0,c.plan.booked);if(!ids.length)return [];
 const earliest=Math.max(at,at+prepSeconds(c.policy));
 const states=new Map((await rows(db,'SELECT property_id,readiness FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids))).map(r=>[String(r.property_id),String(r.readiness)]));
 const free=new Set<number>();
 for(const id of ids){const state=states.get(id);if(state&&CLOSED.includes(state))continue;
  for(const start of freeStarts({day,minutes,cleanMinutes:Number(c.p.cleaning_minutes)||0,busy:await busyIntervals(db,id,day,day+2*86400,at,except),earliest:state&&state!=='ready'?Math.max(earliest,at+61):earliest,fits:(a,b)=>!c.hours||fitsHours(c.hours,a,b)}))free.add(start);}
 return [...free].sort((a,b)=>a-b);
}
export const cardOf=card;

/** The load of a car place now, as the guest sees it (lib/bay-plan.ts bayLines). */
export async function bayLoad(db:D1Database,propertyId:string,at=epoch()):Promise<BayLoad>{
 const c=await card(db,propertyId),{ids,plan}=c,queueIds=ids.slice(plan.booked);
 const [states,live]=await Promise.all([
  rows(db,'SELECT property_id,readiness FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)),
  rows(db,'SELECT * FROM bay_live WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids))]);
 const state=new Map(states.map(r=>[String(r.property_id),String(r.readiness)])),mark=new Map(live.map(r=>[String(r.property_id),r]));
 const open=queueIds.filter(id=>!CLOSED.includes(state.get(id)||'')),busy=(id:string)=>!!mark.get(id)?.busy_since||state.get(id)==='occupied';
 const head=mark.get(c.lead),free=open.filter(id=>!busy(id)).length,waiting=Number(head?.waiting)||0;
 const shortest=Math.min(...servicesOf(c.details).map(s=>s.minutes),Infinity),avg=Number(head?.avg_minutes)||(Number.isFinite(shortest)?shortest:30);
 const working=!c.hours||fitsHours(c.hours,at,at+60),fresh=!!head?.marked_at&&at-Number(head.marked_at)<=(plan.selfService?SELF_STALE_SECONDS:STALE_SECONDS);
 const next=plan.booked>0&&working?(await bookingStarts(db,c,Number.isFinite(shortest)?shortest:30,dayOf(at),at)).find(s=>s<dayOf(at)+86400)??null:null;
 // «Показывать загрузку» off: the queue is only named, nothing about it is claimed.
 return {total:ids.length,booked:plan.booked,queue:queueIds.length,open:open.length,free,waiting,waitMinutes:waitMinutes(free,waiting,open.length,avg),next,known:plan.showLoad&&fresh,stale:plan.showLoad&&working&&queueIds.length>0&&!fresh,selfService:plan.selfService,working,shown:plan.showLoad};
}
/** The load of each car place among `items`, its own card only (a box of a card is not a place of its own). */
export async function baysFor(db:D1Database,items:Row[]):Promise<Map<string,BayLoad>>{
 const auto=items.filter(p=>isAuto(p.details?.type));if(!auto.length)return new Map();
 const copies=new Set((await rows(db,'SELECT property_id FROM room_units WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(auto.map(p=>p.id)))).map(r=>String(r.property_id)));
 const out=new Map<string,BayLoad>(),at=epoch();
 for(const p of auto)if(!copies.has(p.id))out.set(p.id,await bayLoad(db,p.id,at));
 return out;
}

// ---------- «Посты»: the screen of the person on shift and of the owner ----------

/** The boxes of the card with their state and today's booking, for the one who marks them. */
export async function bayPosts(db:D1Database,propertyId:string,at=epoch()){
 const c=await card(db,propertyId),{ids,plan}=c;
 const [states,live]=await Promise.all([
  rows(db,'SELECT property_id,readiness FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)),
  rows(db,'SELECT * FROM bay_live WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids))]);
 const state=new Map(states.map(r=>[String(r.property_id),String(r.readiness)])),mark=new Map(live.map(r=>[String(r.property_id),r]));
 const bays:Row[]=[];
 for(const [i,id] of ids.entries()){
  const booking=i<plan.booked?await one(db,`SELECT b.id,b.start,b.end,b.status,t.service,t.actual_checkin,t.checkin_reported_at,(SELECT name FROM profiles WHERE id=b.guest_id) guest_name FROM bookings b JOIN booking_terms t ON t.booking_id=b.id
   WHERE b.property_id=? AND b.status='confirmed' AND t.actual_checkout IS NULL AND t.checkout_reported_at IS NULL AND b.end>? AND b.start<? ORDER BY b.start LIMIT 1`,id,at-3600,dayOf(at)+86400):null;
  const arrived=!!(booking?.actual_checkin||booking?.checkin_reported_at),readiness=state.get(id)||'ready';
  bays.push({id,n:i+1,mode:i<plan.booked?'booking':'queue',closed:CLOSED.includes(readiness),busySince:Number(mark.get(id)?.busy_since)||(readiness==='occupied'?Number(booking?.actual_checkin)||at:null),
   booking:booking?{id:booking.id,start:booking.start,end:booking.end,service:booking.service||'',guestName:String(booking.guest_name||'Гость').split(' ')[0],arrived,late:!arrived&&at>=Number(booking.start)+plan.lateMinutes*60}:null});
 }
 // Requests waiting for the owner's answer (instant off): the admin confirms one or names another time.
 const requests=(await rows(db,`SELECT b.id,b.start,b.end,t.service,(SELECT name FROM profiles WHERE id=b.guest_id) guest_name FROM bookings b JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.property_id IN (SELECT value FROM json_each(?)) AND b.status='requested' AND b.expires_at>? ORDER BY b.start LIMIT 20`,JSON.stringify(ids),at)).map(r=>({id:r.id,start:r.start,end:r.end,service:r.service||'',guestName:String(r.guest_name||'Гость').split(' ')[0]}));
 return {id:c.lead,title:c.p.title,lateMinutes:plan.lateMinutes,instant:plan.instant,showLoad:plan.showLoad,requests,selfService:plan.selfService,load:await bayLoad(db,c.lead,at),waiting:Number(mark.get(c.lead)?.waiting)||0,markedAt:Number(mark.get(c.lead)?.marked_at)||null,bays};
}
const touch=(db:D1Database,lead:string,at:number)=>q(db,'INSERT INTO bay_live(property_id,marked_at) VALUES (?,?) ON CONFLICT(property_id) DO UPDATE SET marked_at=excluded.marked_at',lead,at);
const tell=(db:D1Database,userId:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),userId,body,dedupe,at);

/** «Посты» of one card: the owner's and the person on shift's (staffPlace checks who asks). */
export async function postsOf(s:RentalService,body:Row){
 const p=await staffPlace(s,required(body.propertyId,'Объект',100));
 if(!isAuto(p.type))throw new DomainError('Посты есть только у автомоек и автосервисов.',409);
 return {place:await bayPosts(s.db,p.id)};
}
/** «Машина заехала» / «Бокс свободен» on one box. */
export async function bayMark(s:RentalService,body:Row){
 const bay=required(body.propertyId,'Бокс',100),action=String(body.action||'');
 if(action!=='in'&&action!=='out')throw new DomainError('Отметка недоступна.');
 const p=await staffPlace(s,bay),at=epoch(),c=await card(s.db,bay),i=c.ids.indexOf(bay);
 if(i<0)throw new DomainError('Бокс не найден.',404);
 const row=await one(s.db,'SELECT * FROM bay_live WHERE property_id=?',bay),head=await one(s.db,'SELECT * FROM bay_live WHERE property_id=?',c.lead);
 const booking=i<c.plan.booked?await one(s.db,"SELECT b.id,b.start,b.end,t.actual_checkin,t.checkin_reported_at FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status='confirmed' AND t.actual_checkout IS NULL AND t.checkout_reported_at IS NULL AND b.start-900<=? AND b.end+3600>? ORDER BY b.start LIMIT 1",bay,at,at):null;
 const owner=p.mine?s:new RentalService(s.db,p.owner_id);let message='';
 if(action==='in'){
  if(row?.busy_since)return {place:await bayPosts(s.db,c.lead,at),message:'Бокс уже занят.'};
  await s.db.batch([q(s.db,'INSERT INTO bay_live(property_id,busy_since) VALUES (?,?) ON CONFLICT(property_id) DO UPDATE SET busy_since=excluded.busy_since',bay,at),
   // A car from the queue took the box: one fewer waits.
   ...(i>=c.plan.booked&&Number(head?.waiting)>0?[q(s.db,'UPDATE bay_live SET waiting=MAX(0,waiting-1) WHERE property_id=?',c.lead)]:[]),touch(s.db,c.lead,at)]);
  message='Бокс '+(i+1)+' занят.';
  if(booking&&!booking.actual_checkin&&!booking.checkin_reported_at){
   // The booked car is here: the fact goes to the booking; the check-in itself follows the booking's rules (payment).
   await q(s.db,'UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=? AND checkin_reported_at IS NULL',at,booking.id).run();
   try{await owner.bookingAction(booking.id,{action:'checkin'});message+=' Машина по записи на месте.';}
   catch(error){if(!(error instanceof DomainError))throw error;message+=' Машина по записи на месте. Оплату по записи владелец отмечает в брони.';}
  }
 }else{
  const minutes=row?.busy_since?Math.round((at-Number(row.busy_since))/60):0,avg=nextAverage(Number(head?.avg_minutes)||null,minutes);
  await s.db.batch([q(s.db,'INSERT INTO bay_live(property_id,busy_since) VALUES (?,NULL) ON CONFLICT(property_id) DO UPDATE SET busy_since=NULL',bay),
   q(s.db,'INSERT INTO bay_live(property_id,avg_minutes) VALUES (?,?) ON CONFLICT(property_id) DO UPDATE SET avg_minutes=excluded.avg_minutes',c.lead,avg),touch(s.db,c.lead,at)]);
  message='Бокс '+(i+1)+' свободен.';
  if(booking&&(booking.actual_checkin||booking.checkin_reported_at)){
   await q(s.db,'UPDATE booking_terms SET checkout_reported_at=? WHERE booking_id=? AND checkout_reported_at IS NULL AND actual_checkout IS NULL',at,booking.id).run();
   if(booking.actual_checkin){try{await owner.bookingAction(booking.id,{action:'checkout'});await owner.readinessAction(bay,{readiness:'ready',inspected:true,note:'Сотрудник отметил: бокс свободен.'});}catch(error){if(!(error instanceof DomainError))throw error;}}
  }
 }
 return {place:await bayPosts(s.db,c.lead,at),message};
}
/** «Ждут ±»: the cars waiting at the place now. */
export async function bayWaiting(s:RentalService,body:Row){
 const p=await staffPlace(s,required(body.propertyId,'Объект',100)),c=await card(s.db,p.id),at=epoch(),delta=number(body.delta,'Изменение',-MAX_WAITING,MAX_WAITING);
 await s.db.batch([q(s.db,`INSERT INTO bay_live(property_id,waiting,marked_at) VALUES (?,MAX(0,MIN(${MAX_WAITING},?)),?) ON CONFLICT(property_id) DO UPDATE SET waiting=MAX(0,MIN(${MAX_WAITING},bay_live.waiting+?)),marked_at=excluded.marked_at`,c.lead,delta,at,delta)]);
 return {place:await bayPosts(s.db,c.lead,at)};
}
/** «Не приехал»: the booked car did not come within the place's wait; the box goes to the queue until the next booking. */
export async function bayNoShow(s:RentalService,body:Row){
 const bookingId=required(body.bookingId,'Запись',100),b=await one(s.db,"SELECT b.id,b.property_id,b.start FROM bookings b WHERE b.id=?",bookingId);
 if(!b)throw new DomainError('Запись не найдена.',404);
 const p=await staffPlace(s,b.property_id),c=await card(s.db,b.property_id),at=epoch();
 if(at<Number(b.start)+c.plan.lateMinutes*60)throw new DomainError('Отметить «Не приехал» можно через '+c.plan.lateMinutes+' минут после начала записи.',409);
 if(!await closeNoShow(s.db,bookingId,at,s.userId))throw new DomainError('Эту запись уже нельзя отметить: машина приехала или запись закрыта.',409);
 if(!p.mine)await tell(s.db,p.owner_id,'«'+c.p.title+'»: сотрудник отметил, что машина по записи не приехала. Бокс ушёл в живую очередь.','bays:no-show:'+bookingId,at).run();
 return {place:await bayPosts(s.db,c.lead,at),message:'Отмечено: не приехал. Бокс в живой очереди до следующей записи.'};
}
/** A request at a car place (instant off): the times it may take instead, the same length, over the boxes by booking. */
async function requestOf(s:RentalService,bookingId:string){
 const b=await one(s.db,"SELECT b.id,b.property_id,b.guest_id,b.start,b.end,b.status,b.expires_at,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?",bookingId);
 if(!b)throw new DomainError('Заявка не найдена.',404);
 const p=await staffPlace(s,b.property_id);
 // Only a car place's requests are answered here: elsewhere confirming a booking stays the owner's own decision.
 if(!isAuto(p.type))throw new DomainError('Заявки здесь есть только у автомоек и автосервисов.',409);
 if(b.status!=='requested'||Number(b.expires_at)<=epoch())throw new DomainError('Заявка уже рассмотрена или срок ответа истёк.',409);
 return {b,p,c:await card(s.db,b.property_id)};
}
export async function requestTimes(s:RentalService,body:Row){
 const {b,c}=await requestOf(s,required(body.bookingId,'Заявка',100)),at=epoch(),minutes=Math.round((Number(b.end)-Number(b.start))/60);
 const day=Number.isFinite(Number(body.day))&&body.day!==undefined?dayOf(Number(body.day)):dayOf(Math.max(at,Number(b.start)));
 return {bookingId:b.id,day,starts:(await bookingStarts(s.db,c,minutes,day,at,b.id)).filter(t=>t<day+86400)};
}
/** «Подтвердить» or «Другое время» on a request: the owner's decision, made by the owner or the person on shift. */
export async function answerRequest(s:RentalService,body:Row){
 const {b,p,c}=await requestOf(s,required(body.bookingId,'Заявка',100)),at=epoch(),owner=p.mine?s:new RentalService(s.db,p.owner_id);
 const policy=await one(s.db,'SELECT cleaning_fee FROM property_policies WHERE property_id=?',c.lead);
 let message='Запись подтверждена.';
 if(body.action==='move'){
  const start=number(body.start,'Время',at,at+400*86400),length=Number(b.end)-Number(b.start),until=start+length+(Number(c.p.cleaning_minutes)||0)*60;
  if(!(await bookingStarts(s.db,c,Math.round(length/60),dayOf(start),at,b.id)).includes(start))throw new DomainError('Это время уже занято. Выберите другое.',409);
  // The first box «по записи» free at the new time takes the car; the request keeps its price (a service costs the same).
    // When only the request's own box is free (it was held by the request itself), the request keeps it.
  const room=await pickRoom(s.db,b.property_id,start,until,c.plan.booked);
  const moved=await q(s.db,"UPDATE bookings SET property_id=?,start=?,end=?,occupied_until=? WHERE id=? AND status='requested'",room,start,start+length,until,b.id).run();
  if(!moved.meta?.changes)throw new DomainError('Заявка уже рассмотрена.',409);
  await q(s.db,'UPDATE booking_terms SET original_end=? WHERE booking_id=?',start+length,b.id).run();
  message='Гостю назначено время '+clock(start)+'.';
  await tell(s.db,b.guest_id,'«'+b.title+'»: вам назначили время '+clock(start)+'. Приезжайте к этому времени.','bays:moved:'+b.id+':'+start,at).run();
 }else if(body.action!=='confirm')throw new DomainError('Выберите: подтвердить или назначить другое время.');
 await owner.bookingAction(b.id,{action:'confirm',cleaningFee:Number(policy?.cleaning_fee)||0});
 return {place:await bayPosts(s.db,c.lead,at),message};
}
/** The autopilot of a car place, every sweep while it is open (lib/background.ts):
 *  - a new request (booking «Заявкой») goes to the person on shift: confirm it or name another time before it expires;
 *  - a booked car late by the place's wait: «Машина по записи на 10:00 приехала?», so «Не приехал» is a tap away;
 *  - with «Показывать загрузку» on: the place when nobody tapped for half an hour, and a box busy for long
 *    («Бокс 2 всё ещё занят?»). A self-service wash is asked only once an operator has started marking it.
 *  Each ask at most once in 30 minutes; it goes to the people on shift, or to the owner when nobody is named. */
export async function bayReminders(db:D1Database,at=epoch()){
 const leads=await rows(db,`SELECT p.id property_id,p.owner_id,p.title,(SELECT marked_at FROM bay_live WHERE property_id=p.id) marked_at FROM properties p
  WHERE p.published=1 AND p.archived_at IS NULL AND COALESCE(json_extract((SELECT details FROM property_details WHERE property_id=p.id),'$.type'),'') IN ('carwash','tires','carservice','detailing')
  AND NOT EXISTS(SELECT 1 FROM room_units u WHERE u.property_id=p.id)`);
 let sent=0;const slot=Math.floor(at/1800);
 for(const l of leads){
  const posts=await bayPosts(db,l.property_id,at),load=posts.load;
  if(!load.working)continue;
  const staff=(await rows(db,'SELECT staff_id FROM property_staff WHERE property_id=?',l.property_id)).map(r=>String(r.staff_id)),to=staff.length?staff:[l.owner_id];
  const asks:[string,string,string[]][]=[];
  // The owner is told of a request by the booking itself; the people on shift are told here.
  if(staff.length)for(const r of posts.requests)asks.push(['«'+l.title+'»: заявка на '+clock(Number(r.start))+'. Подтвердите её или назначьте другое время в «Постах».','bays:request:'+r.id,staff]);
  for(const b of posts.bays)if(b.booking?.late&&!b.busySince&&!b.closed)asks.push(['«'+l.title+'»: машина по записи на '+clock(Number(b.booking.start))+' приехала? Нажмите «Машина заехала» или «Не приехал» в «Постах».','bays:late:'+b.booking.id,to]);
  if(posts.showLoad&&(!posts.selfService||l.marked_at)){
   const avg=Math.max(20,Number((await one(db,'SELECT avg_minutes FROM bay_live WHERE property_id=?',l.property_id))?.avg_minutes)||30);
   if(load.stale)asks.push(['«'+l.title+'»: как сейчас боксы? Отметьте в «Постах», иначе гости видят «Загрузка не обновлялась».','bays:ask:'+l.property_id+':'+slot,to]);
   else for(const b of posts.bays)if(b.busySince&&!b.closed&&at-Number(b.busySince)>avg*1.5*60)asks.push(['«'+l.title+'»: бокс '+b.n+' всё ещё занят? Если машина уехала, нажмите «Бокс свободен» в «Постах».','bays:ask:'+b.id+':'+slot,to]);
  }
  for(const [text,key,users] of asks)for(const user of users){const r=await tell(db,user,text,key+':'+user,at).run();if(r.meta?.changes)sent++;}
 }
 return sent;
}
