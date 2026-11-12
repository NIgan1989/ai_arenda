import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
export {windowRevision} from './approvals';

// «Окна» between stays. A guest leaves at noon and the next one arrives at eight: six hours of an
// empty, cleaned flat. The AI administrator notices such a gap and suggests letting it by the hour
// at a discount. Nothing is offered to guests until the owner presses the button. An open window
// only lowers the hourly price for stays that fit entirely inside it; every other check stays.

export const WINDOW_LOOKAHEAD=36*3600,WINDOW_MAX_GAP=16*3600,WINDOW_MAX_HOURS=12,WINDOW_PAUSE=20*3600;
const HOUR=3600,ceilHour=(t:number)=>Math.ceil(t/HOUR)*HOUR,floorHour=(t:number)=>Math.floor(t/HOUR)*HOUR;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const round100=(n:number)=>Math.max(100,Math.round(n/100)*100);

// The sooner the window, the bigger the discount: an empty hour cannot be sold later.
export const windowPercent=(startsIn:number)=>startsIn<=6*HOUR?20:15;

// Pure: the first sellable gap between busy intervals, from `from` up to `from+lookahead`.
// A gap counts only when it is short (a whole free day is not a «window») and fits the minimum
// hourly stay plus the cleaning after it.
export function findWindow(busy:[number,number][],from:number,cleaningMinutes:number,minHours:number,lookahead=WINDOW_LOOKAHEAD):{start:number;end:number}|null{
 const sorted=[...busy].filter(([s,e])=>e>from&&e>s).sort((a,b)=>a[0]-b[0]);
 let free=from;
 for(const [s,e] of sorted){
  if(s>free&&s<=from+lookahead+WINDOW_MAX_GAP&&s-free<=WINDOW_MAX_GAP){
   const start=ceilHour(Math.max(free,from+HOUR)),end=Math.min(floorHour(s-cleaningMinutes*60),start+WINDOW_MAX_HOURS*HOUR);
   if(start<from+lookahead&&end-start>=minHours*HOUR)return {start,end};
  }
  free=Math.max(free,e);
 }
 return null;
}

export function windowPrice(hourly:number,percent:number,minimumRate=0){return Math.max(minimumRate,round100(hourly*(1-percent/100)));}

async function busyIntervals(db:D1Database,propertyId:string,cleaningMinutes:number,from:number,to:number):Promise<[number,number][]>{
 const list=await rows(db,`SELECT start,occupied_until e FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>? AND start<?
  UNION ALL SELECT start,end e FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND end>? AND start<?
  UNION ALL SELECT x.start,x.end+? e FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=? AND s.enabled=1 AND x.end>? AND x.start<?`,
  propertyId,from,from,to,propertyId,from,to,cleaningMinutes*60,propertyId,from,to);
 return list.map(r=>[Number(r.start),Number(r.e)] as [number,number]);
}

const expireSql="UPDATE calendar_windows SET status='expired',decided_at=? WHERE ((status='suggested' AND start<=?) OR (status='open' AND end<=?))";

// Runs with the AI administrator's regular check of an owner. Returns how many windows were suggested.
export async function offerCalendarWindows(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireSql+' AND owner_id=?',t,t+1800,t,ownerId).run();
 const flats=await rows(db,`SELECT p.id,p.title,p.cleaning_minutes,pp.hourly_price,pp.min_hours,pp.minimum_rate FROM properties p JOIN property_policies pp ON pp.property_id=p.id
  WHERE p.owner_id=? AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND pp.hourly_price>0`,ownerId);
 let offered=0;
 for(const p of flats){
  // One question at a time, and not more often than once in 20 hours for a flat.
  if(await one(db,"SELECT 1 FROM calendar_windows WHERE property_id=? AND ((status IN ('suggested','open') AND end>?) OR created_at>?)",p.id,t,t-WINDOW_PAUSE))continue;
  const gap=findWindow(await busyIntervals(db,p.id,p.cleaning_minutes,t,t+WINDOW_LOOKAHEAD+WINDOW_MAX_GAP),t,p.cleaning_minutes,p.min_hours);
  if(!gap)continue;
  let percent=windowPercent(gap.start-t);const hourlyTo=windowPrice(p.hourly_price,percent,p.minimum_rate);
  percent=Math.round((1-hourlyTo/p.hourly_price)*100);if(percent<5)continue;
  const hours=(gap.end-gap.start)/HOUR,id=uuid(),when=new Date(gap.start*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',weekday:'short',hour:'2-digit',minute:'2-digit'}),till=new Date(gap.end*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
  const body='Окно в календаре · «'+p.title+'» свободна '+when+'–'+till+' ('+hours+' ч) между бронями. Предлагаю сдать почасово со скидкой '+percent+'%: '+money(hourlyTo)+' за час вместо '+money(p.hourly_price)+'. Без вашего согласия гостям ничего не покажем.';
  const r=await db.batch([
   q(db,"INSERT INTO calendar_windows(id,property_id,owner_id,start,end,percent,hourly_from,hourly_to,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM calendar_windows WHERE property_id=? AND ((status IN ('suggested','open') AND end>?) OR created_at>?)) ON CONFLICT(property_id,start) DO NOTHING",
    id,p.id,ownerId,gap.start,gap.end,percent,p.hourly_price,hourlyTo,t,p.id,t,t-WINDOW_PAUSE),
   q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM calendar_windows WHERE id=?)',uuid(),ownerId,body,'owner:window:'+id,t,id),
   q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM calendar_windows WHERE id=?)',uuid(),'system:calendar-windows',p.id,JSON.stringify({action:'window.suggested',windowId:id,start:gap.start,end:gap.end,percent,onBehalfOf:ownerId}),t,id)
  ]);
  offered+=Number(r[0].meta.changes>0);
 }
 return offered;
}

export async function ownerWindows(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireSql+' AND owner_id=?',t,t+1800,t,ownerId).run();
 return rows(db,"SELECT w.*,p.title,pp.min_hours FROM calendar_windows w JOIN properties p ON p.id=w.property_id LEFT JOIN property_policies pp ON pp.property_id=w.property_id WHERE w.owner_id=? AND w.status IN ('suggested','open') AND w.end>? ORDER BY w.start LIMIT 10",ownerId,t);
}

export async function decideCalendarWindow(s:RentalService,windowId:string,accept:boolean){
 const t=epoch(),id=required(windowId,'Окно',100);
 const w=await one(s.db,'SELECT w.*,p.title FROM calendar_windows w JOIN properties p ON p.id=w.property_id WHERE w.id=? AND w.owner_id=?',id,s.userId);
 if(!w)throw new DomainError('Окно недоступно.',404);
 if(w.status!=='suggested'||w.start<=t+1800)throw new DomainError('Окно уже неактуально: время прошло или решение принято.',409);
 const status=accept?'open':'declined';
 const r=await s.db.batch([
  q(s.db,"UPDATE calendar_windows SET status=?,decided_at=? WHERE id=? AND status='suggested'",status,t,id),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),s.userId,w.property_id,JSON.stringify({action:accept?'window.opened':'window.declined',windowId:id}),t)
 ]);
 if(!r[0].meta.changes)throw new DomainError('Окно уже изменилось. Обновите экран.',409);
 const till=new Date(w.end*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
 return {message:accept?'Окно открыто: до '+till+' гости видят «'+w.title+'» почасово за '+money(w.hourly_to)+' в час.':'Хорошо, окно не открываем.'};
}

// The owner's current minimum rate always wins over the price stored when the window was opened.
const windowCols='w.property_id,w.id,w.percent,w.start,w.end,MAX(w.hourly_to,COALESCE(pp.minimum_rate,0)) hourly_to FROM calendar_windows w LEFT JOIN property_policies pp ON pp.property_id=w.property_id';
// The hourly price inside an open window. Null when the stay does not fit one.
export async function openWindowFor(db:D1Database,propertyId:string,start:number,end:number){
 return one(db,"SELECT "+windowCols+" WHERE w.property_id=? AND w.status='open' AND w.start<=? AND w.end>=? ORDER BY hourly_to LIMIT 1",propertyId,start,end);
}
// Open windows for the catalog: with a range, those the stay fits in; without one, those not over yet.
export async function openWindowsFor(db:D1Database,start:number|null,end:number|null,t=epoch()){
 const list=start!==null&&end!==null?await rows(db,"SELECT "+windowCols+" WHERE w.status='open' AND w.start<=? AND w.end>=? ORDER BY hourly_to DESC",start,end)
  :await rows(db,"SELECT "+windowCols+" WHERE w.status='open' AND w.end>? ORDER BY w.start DESC",t+3600);
 return new Map(list.map(w=>[w.property_id,w]));
}
// Applies an open window to an hourly quote. The stored price never raises the current tariff.
export function windowQuote<T extends {billingMode:string;periods:number;price:number;amount:number}>(pricing:T,hourly:number,w:Row|null|undefined){
 if(!w||pricing.billingMode!=='hourly'||!(w.hourly_to<hourly))return {...pricing,window:null};
 return {...pricing,price:w.hourly_to,amount:pricing.periods*w.hourly_to,window:{percent:Math.round((1-w.hourly_to/hourly)*100),start:w.start,end:w.end,regular:hourly}};
}
