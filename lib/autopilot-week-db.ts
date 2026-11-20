import {rows,one} from './operation-core';
import {aiNoteOf} from './ai-move-marks';
import {underAutopilot} from './autopilot';
import {buildAutopilotWeek,weekWindow} from './autopilot-week';

// Loads the owner's own rows of the last seven days for «Неделя автопилота» (lib/autopilot-week.ts) and counts.
// Only the owner's objects (not «Мой дом», not demo ones), only their own notices and the audit of their own things.
// ended: the seven days that ended last midnight (the Monday notice); otherwise today and the six days before it.
export async function autopilotWeek(db:D1Database,owner:string,now=Math.floor(Date.now()/1000),ended=false){
 const {from,to}=weekWindow(now,ended),own="p.owner_id=? AND p.demo_owner IS NULL AND COALESCE((SELECT json_extract(details,'$.type') FROM property_details WHERE property_id=p.id),'')<>'home'";
 const [places,arrivals,jobs,jobAudits,bookingAudits,notices,plan,settings]=await Promise.all([
  rows(db,`SELECT p.id,p.title FROM properties p WHERE ${own}`,owner),
  rows(db,`SELECT b.id,b.property_id,b.start FROM bookings b JOIN properties p ON p.id=b.property_id WHERE ${own} AND b.status IN ('confirmed','completed') AND b.start>=? AND b.start<? LIMIT 2000`,owner,from,to),
  rows(db,`SELECT j.id,j.property_id,j.start,j.submitted_at,j.completed_at FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE ${own} AND j.status<>'cancelled' AND j.start>=? AND j.start<? LIMIT 2000`,owner,from-3*86400,to),
  rows(db,`SELECT a.entity_id,a.actor_id,a.action,j.property_id FROM audit_events a JOIN cleaning_jobs j ON j.id=a.entity_id JOIN properties p ON p.id=j.property_id WHERE ${own} AND a.created_at>=? AND a.created_at<? AND (a.action='job.assigned' OR a.action LIKE '{%job.assigned%') LIMIT 2000`,owner,from,to),
  rows(db,`SELECT a.entity_id,a.actor_id,a.action,b.property_id FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE ${own} AND a.created_at>=? AND a.created_at<? AND (a.action IN ('booking.confirmed','booking.rejected') OR a.action LIKE '{%booking.confirmed%') LIMIT 2000`,owner,from,to),
  rows(db,"SELECT dedupe,body,created_at FROM notifications WHERE user_id=? AND created_at>=? AND created_at<? AND dedupe LIKE 'owner:%' AND dedupe NOT LIKE 'owner:autopilot-week:%' LIMIT 2000",owner,from,to),
  one(db,"SELECT status,period_end,grace_until,tier FROM autopilot_plans WHERE user_id=? AND role='owner'",owner),
  one(db,"SELECT plan_owner_price,ai_booking_fee,ai_month_cap FROM platform_billing WHERE id='global'"),
 ]);
 // A regular performer's «yes» is an assignment the owner set up in advance: its notice names the cleaning,
 // and the object of a cleaning outside the window is found here.
 const regularIds=[...new Set(notices.filter(n=>String(n.dedupe).startsWith('owner:regular-assigned:')).map(n=>String(n.dedupe).split(':')[2]).filter(Boolean))].slice(0,200);
 const regular=regularIds.length?(await rows(db,`SELECT j.id,j.property_id FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE ${own} AND j.id IN (${regularIds.map(()=>'?').join(',')})`,owner,...regularIds)).map(j=>({id:String(j.id),property_id:String(j.property_id)})):[];
 const steps=notices.filter(n=>aiNoteOf(n.dedupe,Number(n.created_at),n.body)).length;
 const live=plan&&['trial','active','grace'].includes(String(plan.status));
 const units=live?Number((await one(db,`SELECT COUNT(*) n FROM properties p WHERE p.owner_id=? AND p.archived_at IS NULL AND ${underAutopilot('p.id')}`,owner,now))?.n||0):0;
 return buildAutopilotWeek({
  from,to,steps,regular,
  places:places.map(p=>({id:String(p.id),title:String(p.title||'')})),
  arrivals:arrivals.map(b=>({id:String(b.id),property_id:String(b.property_id),start:Number(b.start)})),
  jobs:jobs.map(j=>({id:String(j.id),property_id:String(j.property_id),start:Number(j.start),submitted_at:j.submitted_at==null?null:Number(j.submitted_at),completed_at:j.completed_at==null?null:Number(j.completed_at)})),
  audits:[...jobAudits,...bookingAudits].map(a=>({entity_id:String(a.entity_id),actor_id:String(a.actor_id),action:String(a.action),property_id:String(a.property_id)})),
  plan:plan?{status:String(plan.status),until:Number(plan.status==='grace'&&plan.grace_until?plan.grace_until:plan.period_end),price:Number(plan.tier==='all'?settings?.plan_owner_price??9900:settings?.ai_booking_fee??490),units,tier:plan.tier==='all'?'all':'pay',cap:Number(settings?.ai_month_cap??4900)}:null,
 });
}
