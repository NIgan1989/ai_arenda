import {epoch,uuid,q,rows} from './operation-core';
import {isBath} from './listings';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// «Затопить к 19:00». A bath is heated before the guests come, so the owner is reminded prep_minutes before a
// confirmed stay starts (property_policies.prep_minutes, 0 = no reminder). Said once for each start time: a stay
// moved to another hour is reminded again. A home of another kind with prep_minutes set is told to get ready.
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
export function prepText(b:{title:string;type?:string;start:number;end:number;guests:number}){
 const hours=Math.max(1,Math.round((b.end-b.start)/3600));
 return '«'+b.title+'»: '+(isBath(b.type)?'затопите':'подготовьте')+' к '+clock(b.start)+'. Гостей: '+b.guests+', на '+hours+' ч.';
}
export async function sweepPrep(db:D1Database,at=epoch()){
 const due=await rows(db,`SELECT b.id,b.start,b.end,b.guests,p.owner_id,p.title,(SELECT details FROM property_details WHERE property_id=p.id) details
  FROM bookings b JOIN properties p ON p.id=b.property_id JOIN property_policies pp ON pp.property_id=p.id
  WHERE b.status='confirmed' AND pp.prep_minutes>0 AND b.start>? AND b.start-pp.prep_minutes*60<=?`,at,at);
 let reminded=0;
 for(const b of due as Row[]){
  let type='';try{type=JSON.parse(b.details||'{}').type||'';}catch{/* a broken card is reminded as a home */}
  const done=await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),b.owner_id,prepText({...b,type} as any),'owner:prep:'+b.id+':'+b.start,at).run(); // eslint-disable-line @typescript-eslint/no-explicit-any
  if(done.meta?.changes)reminded++;
 }
 return {reminded};
}
