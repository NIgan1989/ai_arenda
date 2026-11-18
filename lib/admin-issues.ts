import {epoch,uuid,q,one,rows,type OperationConfig,type Row} from './operation-core';
import {askModelJSON,modelReady} from './ai-json';
import {redactAIText,type AIConfig} from './ai';
import {kindLabel} from './listings';
import {similarFree,similarText} from './stay-watch';

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
const RANK:Record<Priority,number>={normal:1,high:2,urgent:3};

// With a model the AI reads the issue in the reporter's own words: it can only raise what the word rules found
// (a missed «ребёнку плохо» becomes urgent, a calm «не работает» never goes below the rules), it gives the
// reporter one practical next step, and it picks one ready action from a short list the service checks itself.
export type IssueAction='none'|'call_admin'|'offer_similar';
export type IssueTriage={kind:IssueKind;priority:Priority;advice:string;action:IssueAction};
const triageSchema={type:'object',properties:{
 kind:{type:'string',enum:['access','safety','condition','money','other']},
 priority:{type:'string',enum:['normal','high','urgent']},
 advice:{type:'string',description:'Один практичный следующий шаг для автора обращения, 1–2 предложения.'},
 action:{type:'string',enum:['none','call_admin','offer_similar']}
},required:['kind','priority','advice','action'],additionalProperties:false};
const triageInstructions=`Ты ИИ-администратор сервиса аренды жилья, бань и залов на часы и сутки в Казахстане. Участник нажал «Есть проблема». Разбери обращение.
kind: access — не может попасть внутрь (ключи, код, дверь, никто не встречает); safety — угроза жизни, здоровью или имуществу (пожар, газ, потоп, драка, кому-то плохо); condition — состояние жилья (грязно, сломано, нет воды, света, тепла); money — оплата, депозит, возврат; other — остальное.
priority: urgent — нужно решить в течение 30 минут (нельзя попасть внутрь, опасность, гость на улице ночью); high — в течение 3 часов; normal — в течение суток.
advice: один практичный шаг для автора прямо сейчас, без обещаний денег и возвратов. При опасности первым делом — позвонить 112. Не называй адреса, коды и контакты.
action: call_admin — нужен администратор сервиса сразу (опасность, конфликт, угрозы, деньги спорные); offer_similar — гость не может или не должен оставаться в этом жилье (не попасть внутрь, жить нельзя), ему стоит показать похожие свободные варианты; none — достаточно второй стороны.
Пиши по-русски коротко.`;
export async function modelTriage(db:D1Database,config:AIConfig,issue:Row):Promise<IssueTriage|null>{
 if(!modelReady(config))return null;
 const entity=issue.entity_kind==='booking'?await one(db,'SELECT start,end,status FROM bookings WHERE id=?',issue.entity_id):await one(db,'SELECT start,end,status FROM cleaning_jobs WHERE id=?',issue.entity_id);
 const details=await one(db,'SELECT details FROM property_details WHERE property_id=?',issue.property_id);
 let type='';try{type=JSON.parse(details?.details||'{}').type||'';}catch{/* Unknown kind. */}
 const when=(t:unknown)=>typeof t==='number'?new Date(t*1000).toISOString():null;
 const facts={author:issue.opened_role,otherSide:issue.other_role,about:issue.entity_kind==='booking'?'бронь':'уборка',place:kindLabel(type),start:when(entity?.start),end:when(entity?.end),status:entity?.status||'',now:new Date().toISOString(),timeZone:'Asia/Almaty'};
 const parsed=await askModelJSON(db,issue.opened_by,config,{name:'issue_triage',instructions:triageInstructions+'\n\nФакты:\n'+JSON.stringify(facts),input:[{role:'user',content:redactAIText(String(issue.description||'').slice(-1500))}],schema:triageSchema,maxTokens:300});
 if(!parsed||!(parsed.kind in KIND_LABEL)||!(parsed.priority in RANK)||!['none','call_admin','offer_similar'].includes(parsed.action))return null;
 return {kind:parsed.kind,priority:parsed.priority,advice:redactAIText(typeof parsed.advice==='string'?parsed.advice.replace(/\s+/g,' ').trim().slice(0,400):''),action:parsed.action};
}
/** The rules are the floor: the model may raise the priority or name a theme the rules missed, never lower them. */
export function mergeTriage(rules:{kind:IssueKind;priority:Priority},model:IssueTriage|null):IssueTriage{
 if(!model)return {...rules,advice:'',action:'none'};
 return {kind:rules.kind!=='other'?rules.kind:model.kind,priority:RANK[model.priority]>RANK[rules.priority]?model.priority:rules.priority,advice:model.advice,action:model.action};
}
const PRIORITY_LABEL:Record<Priority,string>={urgent:'срочно',high:'повышенная',normal:'обычная'};
const minutes=(s:number)=>s<3600?Math.round(s/60)+' мин':Math.round(s/3600)+' ч';
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);

export async function sweepIssues(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={triaged:0,reminded:0,escalated:0},list=admins(config);
 // 1. New issues: a ticket with the AI's priority and answer time, and a history line both sides can read.
 // An issue added to later (version above 1, «Есть проблема» pressed again) is triaged again: a new urgent detail
 // raises the priority and calls the admin, a calmer one never lowers what is already set.
 const fresh=await rows(db,"SELECT i.*,p.title FROM administrator_issues i JOIN properties p ON p.id=i.property_id WHERE i.status<>'resolved' AND NOT EXISTS(SELECT 1 FROM operator_history h WHERE h.id=CASE WHEN i.version>1 THEN 'ai-triage:'||i.id||':'||i.version ELSE 'ai-triage:'||i.id END) ORDER BY i.created_at LIMIT 30");
 for(const issue of fresh){
  const added=issue.version>1,triage=mergeTriage(classifyIssue(issue.description),await modelTriage(db,config as AIConfig,issue).catch(()=>null)),{kind,priority}=triage,deadline=(added?at:issue.created_at)+ANSWER_WITHIN[priority],rank=RANK[priority];
  const body='ИИ-администратор: '+(added?'обращение дополнено, ':'')+'тема «'+KIND_LABEL[kind]+'», срочность: '+PRIORITY_LABEL[priority]+'. Ответ нужен в течение '+minutes(ANSWER_WITHIN[priority])+'.'+(triage.advice?' Совет: '+triage.advice:'');
  const callAdmin=priority==='urgent'||triage.action==='call_admin',stamp=issue.id+':'+issue.version;
  // Somewhere else to stay: only for a guest's booking, only free places on the same dates; nothing is cancelled.
  let similar='';
  if(triage.action==='offer_similar'&&issue.opened_role==='guest'&&issue.entity_kind==='booking'&&kind!=='money')similar=similarText(await similarFree(db,issue.entity_id).catch(()=>[]));
  await db.batch([
   q(db,"INSERT OR IGNORE INTO operator_tickets(issue_id,status,priority,deadline,created_at,updated_at) VALUES (?,'open',?,?,?,?)",issue.id,priority,deadline,issue.created_at,at),
   q(db,"UPDATE operator_tickets SET priority=?,deadline=?,version=version+1,updated_at=? WHERE issue_id=? AND status<>'resolved' AND assigned_to IS NULL AND (?=0 OR (CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 ELSE 1 END)<?)",priority,deadline,at,issue.id,added?1:0,rank),
   q(db,"INSERT OR IGNORE INTO operator_history(id,issue_id,actor_id,actor_role,action,body,visibility,created_at) VALUES (?,?,'ai-administrator','system','triage',?,'participants',?)",added?'ai-triage:'+issue.id+':'+issue.version:'ai-triage:'+issue.id,issue.id,body,at),
   ...(callAdmin?list.map(admin=>notice(db,admin,(priority==='urgent'?'Срочное обращение':'ИИ просит посмотреть обращение')+' по «'+(issue.title||'жильё')+'»: '+KIND_LABEL[kind]+'. Ответ нужен в течение '+minutes(ANSWER_WITHIN[priority])+'. Админка → Обращения.','admin:issue-urgent:'+issue.id+':'+admin,at)):[]),
   ...(triage.advice||similar?[notice(db,issue.opened_by,'ИИ-администратор по «'+(issue.title||'жильё')+'»: '+(triage.advice||'обращение передано второй стороне.')+similar,issue.opened_role+':issue-advice:'+stamp,at)]:[])
  ]);
  result.triaged++;if(callAdmin)result.escalated++;
 }
 // 2. Half the answer time passed: one reminder to the side that has to answer.
 const halfway=await rows(db,"SELECT i.id,i.other_user,i.other_role,p.title,t.deadline,t.created_at FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id JOIN properties p ON p.id=i.property_id WHERE t.status<>'resolved' AND i.status<>'resolved' AND t.created_at+(t.deadline-t.created_at)/2<=? AND t.deadline>? LIMIT 50",at,at);
 for(const t of halfway){const r=await notice(db,t.other_user,'Напоминание: по «'+(t.title||'жильё')+'» ждут вашего ответа на обращение. Осталось '+minutes(t.deadline-at)+'.',t.other_role+':issue-remind:'+t.id,at).run();if(r.meta.changes)result.reminded++;}
 // 3. Nobody resolved it in time: now it is the platform administrator's.
 const late=await rows(db,"SELECT i.id,i.description,p.title FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id JOIN properties p ON p.id=i.property_id WHERE t.status<>'resolved' AND i.status<>'resolved' AND t.deadline<=? AND t.assigned_to IS NULL LIMIT 50",at);
 for(const t of late)for(const admin of list){const r=await notice(db,admin,'Обращение по «'+(t.title||'жильё')+'» не решено в срок ('+KIND_LABEL[classifyIssue(t.description).kind]+'). Админка → Обращения.','admin:issue-overdue:'+t.id+':'+admin,at).run();if(r.meta.changes)result.escalated++;}
 return result;
}
