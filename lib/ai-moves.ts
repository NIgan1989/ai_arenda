// The map's view of the AI administrator's own work: its recent notices to this person, turned into marks on the
// bookings, cleanings and objects they are about (lib/ai-move-marks.ts). Only the person's own notices are read,
// so nothing about other people leaks. An answer to a guest is shown on the object, a cleaning the autopilot took on its job.
import {rows,epoch,type Row} from './operation-core';
import {aiMarkOf,AI_WINDOW,type AiMark} from './ai-move-marks';
import type {Role} from './domain';

export async function recentAiMarks(db:D1Database,userId:string,role:Role,now=epoch()):Promise<AiMark[]>{
 const notices=await rows(db,'SELECT dedupe,body,created_at FROM notifications WHERE user_id=? AND created_at>? AND dedupe LIKE ? ORDER BY created_at DESC LIMIT 60',userId,now-AI_WINDOW,role+':%');
 const marks=notices.map((n:Row)=>aiMarkOf(n.dedupe,Number(n.created_at),n.body)).filter((m):m is AiMark=>!!m);
 const out:AiMark[]=[];
 for(const m of marks){
  if(m.kind==='matching-offer'){const o=(await rows(db,'SELECT property_id FROM matching_offers WHERE id=? AND owner_id=?',m.id,userId))[0];if(o)out.push({...m,kind:'property',id:String(o.property_id),propertyId:String(o.property_id)});continue;}
  if(m.kind==='cleaning-offer'){const o=(await rows(db,'SELECT o.job_id,j.property_id FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id WHERE o.id=? AND o.worker_id=?',m.id,userId))[0];if(o)out.push({...m,kind:'job',id:String(o.job_id),propertyId:String(o.property_id)});continue;}
  const at=(await rows(db,m.kind==='booking'?'SELECT property_id FROM bookings WHERE id=?':'SELECT property_id FROM cleaning_jobs WHERE id=?',m.id))[0];
  if(at)out.push({...m,propertyId:String(at.property_id)});
 }
 return out;
}
