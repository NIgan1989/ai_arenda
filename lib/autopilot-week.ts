// «Неделя автопилота»: what the AI did for the owner in the last seven days, in the numbers an owner pays the plan for
// (2026-11-19). Three of them: cleanings the AI assigned by itself, the times the owner still had to decide,
// and the arrivals whose home was ready in time. Under them each object, and the late ones by name.
// Pure, no server imports: the app imports the types, lib/autopilot-week-db.ts loads the rows.
// Covered by tests/autopilot-week.test.mjs.

export const WEEK=7*86400;
const ZONE=5*3600,DAY=86400;
// A cleaning counts for an arrival when it starts at most this long before it: an older one was for another stay.
const CLEANING_REACH=3*DAY;

export type WeekInput={
 // The days counted: [from, to).
 from:number;to:number;
 places:{id:string;title:string}[];
 // Stays of the owner's objects that begin in the week (confirmed or completed).
 arrivals:{id:string;property_id:string;start:number}[];
 // Cleanings of the owner's objects around the week, not cancelled.
 jobs:{id:string;property_id:string;start:number;submitted_at?:number|null;completed_at?:number|null}[];
 // The audit lines of the week about the owner's bookings and cleanings: who did what.
 audits:{entity_id:string;actor_id:string;action:string;property_id:string}[];
 // Cleanings a regular performer took at once (the owner chose them in advance): the AI offered, nobody asked the owner.
 regular:{id:string;property_id:string}[];
 // The AI's own steps written in the journal this week.
 steps:number;
 // until: the end of the paid or free period, or for a plan awaiting payment the day it pauses.
 plan:{status:string;until:number;price:number;units:number}|null;
};
export type WeekLate={propertyId:string;title:string;start:number;readyAt:number|null;minutes:number|null};
export type WeekPlace={id:string;title:string;arrivals:number;onTime:number;assigned:number;confirmed:number;decisions:number};
export type AutopilotWeek={
 from:number;to:number;label:string;
 assigned:number;confirmed:number;decisions:number;steps:number;
 arrivals:number;onTime:number;late:WeekLate[];
 places:WeekPlace[];
 plan:{status:string;until:number;price:number;units:number}|null;
 summary:string;
};

// The action of an audit line: a plain word for the owner's own step, JSON for a step made on their behalf.
function actionOf(raw:string):{action:string;onBehalf:boolean}{
 if(raw.startsWith('{')){try{const v=JSON.parse(raw);return {action:String(v?.action||''),onBehalf:!!v?.onBehalfOf};}catch{return {action:'',onBehalf:false};}}
 return {action:raw,onBehalf:false};
}
const AI_ACTORS=new Set(['system:rental-policy']);
const dayStart=(t:number)=>Math.floor((t+ZONE)/DAY)*DAY-ZONE;
/** The seven local days counted: today and the six before it, or (ended) the seven days that ended last midnight,
 *  which on a Monday is the whole past week. */
export function weekWindow(now:number,ended=false){const end=dayStart(now)+(ended?0:DAY);return {from:end-WEEK,to:ended?end:now+1};}
const dateOf=(t:number)=>new Date((t+ZONE)*1000);
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
/** «13–19 ноября», «28 октября – 3 ноября». */
export function weekLabel(from:number,to:number){
 const a=dateOf(from),b=dateOf(to-1);
 return a.getUTCMonth()===b.getUTCMonth()?a.getUTCDate()+'–'+b.getUTCDate()+' '+MONTHS[b.getUTCMonth()]:a.getUTCDate()+' '+MONTHS[a.getUTCMonth()]+' – '+b.getUTCDate()+' '+MONTHS[b.getUTCMonth()];
}
export const plural=(n:number,one:string,few:string,many:string)=>{const m10=n%10,m100=n%100;return m10===1&&m100!==11?one:m10>=2&&m10<=4&&(m100<12||m100>14)?few:many;};

export function buildAutopilotWeek(i:WeekInput):AutopilotWeek{
 const {from,to}=i;
 const place=new Map<string,WeekPlace>(i.places.map(p=>[p.id,{id:p.id,title:p.title,arrivals:0,onTime:0,assigned:0,confirmed:0,decisions:0}]));
 const bump=(id:string|undefined,key:'assigned'|'confirmed'|'decisions')=>{const p=id?place.get(id):undefined;if(p)p[key]++;};
 const assignedJobs=new Set<string>(),confirmedBookings=new Set<string>(),decided=new Set<string>();
 for(const a of i.audits){
  const {action,onBehalf}=actionOf(a.action),ai=onBehalf&&AI_ACTORS.has(a.actor_id);
  // A no-show only takes the assignment off (the job opens again): the replacement counts when someone is assigned.
  if(action==='job.assigned'){
   if(ai){if(!assignedJobs.has(a.entity_id)){assignedJobs.add(a.entity_id);bump(a.property_id,'assigned');}}
   else if(!a.actor_id.startsWith('system:')&&!decided.has('job:'+a.entity_id)){decided.add('job:'+a.entity_id);bump(a.property_id,'decisions');}
  }else if(action==='booking.confirmed'||action==='booking.rejected'){
   if(ai&&action==='booking.confirmed'){if(!confirmedBookings.has(a.entity_id)){confirmedBookings.add(a.entity_id);bump(a.property_id,'confirmed');}}
   else if(!a.actor_id.startsWith('system:')&&!decided.has('booking:'+a.entity_id)){decided.add('booking:'+a.entity_id);bump(a.property_id,'decisions');}
  }
 }
 for(const r of i.regular)if(!assignedJobs.has(r.id)){assignedJobs.add(r.id);bump(r.property_id,'assigned');}
 // Ready in time: the last cleaning of the object before the arrival was finished (the report sent) by its start.
 // An arrival with no cleaning before it (own staff, the first guest) says nothing about the autopilot and is left out.
 let arrivals=0,onTime=0;const late:WeekLate[]=[];
 for(const b of [...i.arrivals].sort((x,y)=>x.start-y.start)){
  if(b.start<from||b.start>=to)continue;
  const job=i.jobs.filter(j=>j.property_id===b.property_id&&j.start<=b.start&&j.start>=b.start-CLEANING_REACH).sort((x,y)=>y.start-x.start)[0];
  if(!job)continue;
  const ready=Number(job.submitted_at||job.completed_at||0)||null,p=place.get(b.property_id);
  arrivals++;if(p)p.arrivals++;
  if(ready!==null&&ready<=b.start){onTime++;if(p)p.onTime++;}
  else late.push({propertyId:b.property_id,title:p?.title||'',start:b.start,readyAt:ready,minutes:ready===null?null:Math.round((ready-b.start)/60)});
 }
 const assigned=assignedJobs.size,confirmed=confirmedBookings.size,decisions=decided.size;
 const places=[...place.values()].filter(p=>p.arrivals||p.assigned||p.confirmed||p.decisions).sort((a,b)=>b.arrivals+b.assigned-(a.arrivals+a.assigned));
 const plan=i.plan?{...i.plan}:null;
 return {from,to,label:weekLabel(from,to),assigned,confirmed,decisions,steps:i.steps,arrivals,onTime,late,places,plan,summary:weekSummary({assigned,confirmed,decisions,arrivals,onTime})};
}

/** One line for Telegram and the notices: the three numbers in words. */
export function weekSummary(w:{assigned:number;confirmed:number;decisions:number;arrivals:number;onTime:number}){
 const parts=[
  'ИИ назначил '+w.assigned+' '+plural(w.assigned,'уборку','уборки','уборок'),
  ...(w.confirmed?['подтвердил '+w.confirmed+' '+plural(w.confirmed,'бронь','брони','броней')]:[]),
  w.arrivals?'к '+w.onTime+' из '+w.arrivals+' '+plural(w.arrivals,'заезда','заездов','заездов')+' объект был готов вовремя':'заездов после уборки не было',
  w.decisions?'ваше решение понадобилось '+w.decisions+' '+plural(w.decisions,'раз','раза','раз'):'ваше решение не понадобилось ни разу'
 ];
 return 'Неделя на автопилоте: '+parts.join(', ')+'.';
}
