// The map's view of the AI administrator's own work: its recent notices to this person, turned into marks on the
// bookings, cleanings and objects they are about (lib/ai-move-marks.ts). Only the person's own notices are read,
// so nothing about other people leaks. An answer to a guest is shown on the object, a cleaning the autopilot took on its job.
import {rows,epoch,type Row} from './operation-core';
import {aiMarkOf,aiNoteOf,AI_WINDOW,type AiMark,type AiNote} from './ai-move-marks';
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

// The journal of the AI's work for this person in this role: the newest first, a short line and the object it was about.
// Read from the person's own notices only; nothing is stored twice.
export const JOURNAL_DAYS=14,JOURNAL_LIMIT=30;
export type JournalEntry={at:number;text:string;title:string};
export async function aiJournal(db:D1Database,userId:string,role:Role,now=epoch()):Promise<JournalEntry[]>{
 const notices=await rows(db,'SELECT dedupe,body,created_at FROM notifications WHERE user_id=? AND created_at>? AND dedupe LIKE ? ORDER BY created_at DESC,id LIMIT 200',userId,now-JOURNAL_DAYS*86400,role+':%');
 const notes=notices.map((n:Row)=>aiNoteOf(n.dedupe,Number(n.created_at),n.body)).filter((n):n is AiNote=>!!n).slice(0,JOURNAL_LIMIT);
 const titles=new Map<string,string>(),out:JournalEntry[]=[];
 for(const n of notes){
  const key=n.kind+':'+n.id;
  if(n.kind&&!titles.has(key)){
   const sql=n.kind==='booking'?'SELECT p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?':n.kind==='job'?'SELECT p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?':n.kind==='matching-offer'?'SELECT p.title FROM matching_offers o JOIN properties p ON p.id=o.property_id WHERE o.id=?':n.kind==='cleaning-offer'?'SELECT p.title FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id JOIN properties p ON p.id=j.property_id WHERE o.id=?':'SELECT title FROM properties WHERE id=?';
   titles.set(key,String((await rows(db,sql,n.id))[0]?.title||''));
  }
  out.push({at:n.at,text:n.text,title:n.kind?titles.get(key)||'':''});
 }
 return out;
}
