import {one,rows,type Row} from './operation-core';

// Under autopilot the AI administrator checks a submitted cleaning report before the owner accepts it.
// It checks what the service can verify without guessing: that there are photos before and after,
// that they were taken during this cleaning, that no damage photos or open problems are attached,
// and that the cleaner's report does not mention a problem. It does not judge the picture itself:
// a report with any finding is left to the owner.
export const OWNER_REVIEW_SECONDS=3600;
const problemWords=/слом|разбит|поврежд|пятн|протек|протечк|течёт|течет|не работает|нет воды|нет света|запах|плесен|клоп|таракан|пропал|украд|не хватает|не успел|не успела|не убра|не помы/i;

export async function reviewCleaning(db:D1Database,job:Row){
 const findings:string[]=[];
 const photos=await rows(db,"SELECT phase,COUNT(*) n,MIN(created_at) first FROM job_evidence WHERE job_id=? AND mime='image/jpeg' GROUP BY phase",job.id);
 const count=(phase:string)=>Number(photos.find(p=>p.phase===phase)?.n||0);
 if(count('before')<1)findings.push('нет фото «до»');
 if(count('after')<2)findings.push('меньше двух фото «после»');
 if(count('damage')>0)findings.push('приложены фото повреждений');
 // Work may start an hour before the slot, so earlier photos belong to something else.
 if(photos.some(p=>p.first<job.start-3600))findings.push('часть фото сделана до начала уборки');
 if(await one(db,"SELECT id FROM administrator_issues WHERE entity_kind='job' AND entity_id=? AND status='open'",job.id))findings.push('по уборке открыто обращение');
 const mention=String(job.report||'').match(problemWords);
 if(mention)findings.push('в отчёте упомянута проблема («'+mention[0]+'…»)');
 return {ok:!findings.length,findings,after:count('after'),before:count('before')};
}
