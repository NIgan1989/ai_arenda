import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';

// «Есть проблема» without the administrator in the loop. The other side already hears about an issue
// when it is opened; the AI administrator sorts it by what it is about, sets how fast it needs an answer,
// reminds the other side once when half of that time has passed, and calls the platform administrator
// only for an urgent issue (access to the flat, safety) or one nobody resolved in time.

export type IssueKind='access'|'safety'|'condition'|'money'|'other';
export type Priority='normal'|'high'|'urgent';
const RULES:[IssueKind,RegExp][]=[
 ['safety',/пожар|дым|газ|затоп|протек|протечк|потоп|угрож|драк|полици|скор(ая|ую)|опасн|искрит|замыкан|пьян/i],
 ['access',/ключ|код|двер|замок|домофон|не могу (попасть|зайти|войти)|не открыва|не пуска|не заселил|заселить|закрыт/i],
 ['money',/деньг|оплат|возврат|депозит|залог|списал|перевод|предоплат|доплат|штраф/i],
 ['condition',/грязн|не убран|мусор|клоп|таракан|нет (воды|света|горяч|отоплен|интернет)|не работает|сломан|слома|шум|холодно|запах|wi-?fi|вай-?фай|бель[её]|полотенц/i]
];
export const KIND_LABEL:Record<IssueKind,string>={access:'доступ в жильё',safety:'безопасность',condition:'состояние жилья',money:'деньги',other:'другое'};
const PRIORITY:Record<IssueKind,Priority>={access:'urgent',safety:'urgent',condition:'high',money:'high',other:'normal'};
export const ANSWER_WITHIN:Record<Priority,number>={urgent:30*60,high:3*3600,normal:24*3600};
export function classifyIssue(text:string):{kind:IssueKind;priority:Priority}{
 const kind=RULES.find(([,re])=>re.test(text))?.[0]||'other';
 return {kind,priority:PRIORITY[kind]};
}
const PRIORITY_LABEL:Record<Priority,string>={urgent:'срочно',high:'повышенная',normal:'обычная'};
const minutes=(s:number)=>s<3600?Math.round(s/60)+' мин':Math.round(s/3600)+' ч';
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);

export async function sweepIssues(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={triaged:0,reminded:0,escalated:0},list=admins(config);
 // 1. New issues: a ticket with the AI's priority and answer time, and a history line both sides can read.
 const fresh=await rows(db,"SELECT i.*,p.title FROM administrator_issues i JOIN properties p ON p.id=i.property_id WHERE i.status<>'resolved' AND NOT EXISTS(SELECT 1 FROM operator_history h WHERE h.id='ai-triage:'||i.id) ORDER BY i.created_at LIMIT 30");
 for(const issue of fresh){
  const {kind,priority}=classifyIssue(issue.description),deadline=issue.created_at+ANSWER_WITHIN[priority];
  const body='ИИ-администратор: тема «'+KIND_LABEL[kind]+'», срочность: '+PRIORITY_LABEL[priority]+'. Ответ нужен в течение '+minutes(ANSWER_WITHIN[priority])+'.';
  await db.batch([
   q(db,"INSERT OR IGNORE INTO operator_tickets(issue_id,status,priority,deadline,created_at,updated_at) VALUES (?,'open',?,?,?,?)",issue.id,priority,deadline,issue.created_at,at),
   q(db,"UPDATE operator_tickets SET priority=?,deadline=?,version=version+1,updated_at=? WHERE issue_id=? AND status<>'resolved' AND assigned_to IS NULL",priority,deadline,at,issue.id),
   q(db,"INSERT OR IGNORE INTO operator_history(id,issue_id,actor_id,actor_role,action,body,visibility,created_at) VALUES (?,?,'ai-administrator','system','triage',?,'participants',?)",'ai-triage:'+issue.id,issue.id,body,at),
   ...(priority==='urgent'?list.map(admin=>notice(db,admin,'Срочное обращение по «'+(issue.title||'жильё')+'»: '+KIND_LABEL[kind]+'. Ответ нужен в течение 30 мин. Админка → Обращения.','admin:issue-urgent:'+issue.id+':'+admin,at)):[])
  ]);
  result.triaged++;if(priority==='urgent')result.escalated++;
 }
 // 2. Half the answer time passed: one reminder to the side that has to answer.
 const halfway=await rows(db,"SELECT i.id,i.other_user,i.other_role,p.title,t.deadline,t.created_at FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id JOIN properties p ON p.id=i.property_id WHERE t.status<>'resolved' AND i.status<>'resolved' AND t.created_at+(t.deadline-t.created_at)/2<=? AND t.deadline>? LIMIT 50",at,at);
 for(const t of halfway){const r=await notice(db,t.other_user,'Напоминание: по «'+(t.title||'жильё')+'» ждут вашего ответа на обращение. Осталось '+minutes(t.deadline-at)+'.',t.other_role+':issue-remind:'+t.id,at).run();if(r.meta.changes)result.reminded++;}
 // 3. Nobody resolved it in time: now it is the platform administrator's.
 const late=await rows(db,"SELECT i.id,i.description,p.title FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id JOIN properties p ON p.id=i.property_id WHERE t.status<>'resolved' AND i.status<>'resolved' AND t.deadline<=? AND t.assigned_to IS NULL LIMIT 50",at);
 for(const t of late)for(const admin of list){const r=await notice(db,admin,'Обращение по «'+(t.title||'жильё')+'» не решено в срок ('+KIND_LABEL[classifyIssue(t.description).kind]+'). Админка → Обращения.','admin:issue-overdue:'+t.id+':'+admin,at).run();if(r.meta.changes)result.escalated++;}
 return result;
}
