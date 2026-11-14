// The map's view of the AI administrator's own work: its recent notices to this person, turned into marks on the
// bookings, cleanings and objects they are about (lib/ai-move-marks.ts). Only the person's own notices are read,
// so nothing about other people leaks. An answer to a guest is shown on the object, a cleaning the autopilot took on its job.
import {rows,epoch,type Row} from './operation-core';
import {aiMarkOf,aiNoteOf,journalKey,AI_WINDOW,type AiMark,type AiNote,type JournalLine,type JournalOpen} from './ai-move-marks';
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

// The journal of the AI's work for this person in this role: the newest first, a short line, the home it was about
// and what the line opens (the booking, the cleaning, the home or the chat). Read from the person's own notices only.
export const JOURNAL_DAYS=14,JOURNAL_LIMIT=30;
export type JournalEntry=JournalLine;
const HOME:Record<string,string>={
 booking:"SELECT p.title,'booking' kind,b.id,b.start FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?",
 job:"SELECT p.title,'job' kind,j.id,j.start,(SELECT name FROM profiles WHERE id=j.assigned_to) who FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?",
 property:"SELECT title,'property' kind,id FROM properties WHERE id=?",
 'matching-offer':"SELECT p.title,'property' kind,p.id FROM matching_offers o JOIN properties p ON p.id=o.property_id WHERE o.id=?",
 'cleaning-offer':"SELECT p.title,'job' kind,j.id,j.start FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id JOIN properties p ON p.id=j.property_id WHERE o.id=?",
 application:"SELECT p.title,'job' kind,j.id,j.start,(SELECT name FROM profiles WHERE id=a.user_id) who FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN properties p ON p.id=j.property_id WHERE a.id=?",
 price:"SELECT p.title,'property' kind,p.id FROM price_suggestions x JOIN properties p ON p.id=x.property_id WHERE x.id=?",
 window:"SELECT p.title,'property' kind,p.id FROM calendar_windows x JOIN properties p ON p.id=x.property_id WHERE x.id=?",
 forecast:"SELECT p.title,'property' kind,p.id FROM load_forecasts x JOIN properties p ON p.id=x.property_id WHERE x.id=?",
 stay:"SELECT p.title,'booking' kind,b.id,b.start FROM stay_offers x JOIN bookings b ON b.id=x.booking_id JOIN properties p ON p.id=b.property_id WHERE x.id=?",
 // The chat of a booking or of a cleaning: the line opens the chat itself.
 room:"SELECT COALESCE((SELECT p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE r.entity_kind='booking' AND b.id=r.entity_id),(SELECT p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE r.entity_kind='job' AND j.id=r.entity_id),'') title,'room' kind,r.id FROM discussion_rooms r WHERE r.id=?"
};
export async function aiJournal(db:D1Database,userId:string,role:Role,now=epoch()):Promise<JournalEntry[]>{
 const notices=await rows(db,'SELECT dedupe,body,created_at FROM notifications WHERE user_id=? AND created_at>? AND dedupe LIKE ? ORDER BY created_at DESC,id LIMIT 200',userId,now-JOURNAL_DAYS*86400,role+':%');
 const notes=notices.map((n:Row)=>aiNoteOf(n.dedupe,Number(n.created_at),n.body)).filter((n):n is AiNote=>!!n);
 const found=new Map<string,{title:string;open?:JournalOpen;who?:string;start?:number}>(),out:JournalEntry[]=[],seen=new Set<string>();
 for(const n of notes){
  if(out.length>=JOURNAL_LIMIT)break;
  const key=n.kind+':'+n.id;
  if(n.kind&&!found.has(key)){
   const hit=(await rows(db,HOME[n.kind],n.id))[0];
   found.set(key,hit?{title:String(hit.title||''),open:{kind:hit.kind,id:String(hit.id)},...(role==='owner'&&hit.who?{who:String(hit.who)}:{}),...(Number(hit.start)>0?{start:Number(hit.start)}:{})}:{title:''});
  }
  const about=n.kind?found.get(key):undefined;
  const line:JournalEntry={at:n.at,text:n.text,title:about?.title||'',...(about?.open?{open:about.open}:{}),...(about?.who?{who:about.who}:{}),...(about?.start?{start:about.start}:{})},k=journalKey(line);
  if(seen.has(k))continue;
  seen.add(k);out.push(line);
 }
 return out;
}
