import type {Row} from './operation-core';
import {tooSoon} from './rental-policy';

// «Готово к 18:00»: what the guest's map says about each home at the time of arrival, and how it changes when the guest
// moves that time. The search answers for the asked time; the same answer carries, for every home, a short code for each
// step of the arrival strip, so the phone moves the time without asking the server again.
//   r: free for the whole stay and ready by the arrival: nothing to clean, or a cleaner has taken the cleaning before it;
//   c: free for the whole stay, but the cleaning after the last guest is not confirmed yet («Уточняем готовность»);
//   -: not free at this arrival (another stay, a cleaning, a block of another site, or not made ready in time).
export const ARRIVAL_STEP=1800,ARRIVAL_BACK=4,ARRIVAL_AHEAD=8;
// A cleaning someone has taken: an open job (nobody has taken it) is not a confirmation.
const TAKEN=['assigned','in_progress','submitted','completed'];
export type Busy={property_id:string;kind:'stay'|'job'|'external';start:number;end:number;until:number;status?:string};

// The arrival times of the strip: half-hour steps around the asked arrival (or around the first one, `around`, so the
// strip stands still while the guest moves along it). Never in the past.
export function arrivalSteps(start:number,around:number|null,now:number){
 const base=around!==null&&Math.abs(around-start)<=12*3600&&(start-around)%ARRIVAL_STEP===0?around:start;
 const steps:number[]=[];
 for(let k=-ARRIVAL_BACK;k<=ARRIVAL_AHEAD;k++){const t=base+k*ARRIVAL_STEP;if(t>=now-60)steps.push(t);}
 if(!steps.includes(start))steps.push(start);
 return steps.sort((a,b)=>a-b);
}
// The same test the search makes for one time (lib/service.ts publicSearch): every stay, cleaning and block keeps the
// home's cleaning time free before it; a stay that starts within the hour needs a home that is ready now; a place that is
// made ready before the guests (a bath is heated) is not offered sooner than that takes.
export function fitsAt(p:Row,busy:Busy[],t:number,length:number,now:number,ready=false){
 const c=(Number(p.cleaning_minutes)||0)*60;
 if(busy.some(b=>b.start<t+length+c&&b.until>t))return false;
 if(t<=now+60&&p.display_status?.code!=='ready')return false;
 return ready||!tooSoon(p.policy||{},t,now);
}
// Ready by the arrival: nothing happens before it and the home is ready now, or the last guest before it leaves and a
// cleaner has taken the cleaning that ends before the arrival. A home with its own staff counts the same way: without a
// taken cleaning it is «уточняем», never a guess.
export function readyAt(p:Row,busy:Busy[],t:number,now:number){
 const before=busy.filter(b=>b.kind!=='job'&&b.until>now&&b.start<t);
 if(!before.length&&p.display_status?.code==='ready')return true;
 const left=before.length?Math.max(...before.map(b=>b.end)):-Infinity;
 // Without a guest before the arrival a finished cleaning says nothing new: the home would be marked ready then.
 return busy.some(b=>b.kind==='job'&&TAKEN.includes(String(b.status))&&(before.length||b.status!=='completed')&&b.end<=t&&b.start>=left-1800);
}
export function arrivalCodes(p:Row,busy:Busy[],steps:number[],length:number,now:number,ready=false){
 return steps.map(t=>!fitsAt(p,busy,t,length,now,ready)?'-':readyAt(p,busy,t,now)?'r':'c').join('');
}
// What the search fetches once for the whole strip: stays (a booking keeps its home till its end plus the cleaning),
// cleanings and the blocks of other sites, from now to the end of the last step's stay.
export async function busyAround(db:D1Database,from:number,to:number,now:number):Promise<Busy[]>{
 const all=async(sql:string,...v:unknown[])=>((await db.prepare(sql).bind(...v).all()).results||[]) as Row[];
 const [stays,jobs,external]=await Promise.all([
  all("SELECT b.property_id,b.start,b.end,b.occupied_until until FROM bookings b JOIN properties p ON p.id=b.property_id WHERE (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?)) AND b.start<?+p.cleaning_minutes*60 AND b.occupied_until>?",now,to,Math.min(from,now)),
  all("SELECT j.property_id,j.start,j.end,j.status FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status IN ('open','assigned','in_progress','submitted','completed') AND j.start<?+p.cleaning_minutes*60 AND j.end>?",to,Math.min(from,now)-6*3600),
  all('SELECT x.property_id,x.start,x.end FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id JOIN properties p ON p.id=x.property_id WHERE s.enabled=1 AND x.start<?+p.cleaning_minutes*60 AND x.end>?',to,Math.min(from,now)),
 ]);
 // A finished cleaning no longer holds the home; it only says the home was made ready.
 return [...stays.map(b=>({property_id:String(b.property_id),kind:'stay' as const,start:Number(b.start),end:Number(b.end),until:Number(b.until)})),
  ...jobs.map(j=>({property_id:String(j.property_id),kind:'job' as const,start:Number(j.start),end:Number(j.end),until:j.status==='completed'?Number(j.start):Number(j.end),status:String(j.status)})),
  ...external.map(x=>({property_id:String(x.property_id),kind:'external' as const,start:Number(x.start),end:Number(x.end),until:Number(x.end)}))];
}
