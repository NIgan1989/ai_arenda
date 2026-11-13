import {DomainError,required,number,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,hash,type Row,type OperationConfig} from './operation-core';
import {requestParticipantReview} from './participant-security';

export async function readPilotPolicy(db:D1Database){return (await one(db,"SELECT require_owner_review,require_cleaner_review,require_phone,ai_review,version,updated_at FROM pilot_policy WHERE id='global'"))!;}
export async function pilotPolicy(service:RentalService){return readPilotPolicy(service.db);}
function latestReviewSql(role:'owner'|'cleaner'){
 return `SELECT status,valid_until FROM participant_reviews WHERE user_id=? AND role='${role}' AND ${role==='owner'?'property_id=?':'property_id IS NULL'} ORDER BY COALESCE(reviewed_at,created_at) DESC,created_at DESC,rowid DESC LIMIT 1`;
}
async function reviewed(service:RentalService,userId:string,role:'owner'|'cleaner',propertyId?:string){
 if(role==='owner')return !!(await one(service.db,'SELECT owner_reviewed FROM pilot_property_admissions WHERE id=? AND owner_id=?',propertyId,userId))?.owner_reviewed;
 const review=await one(service.db,latestReviewSql('cleaner'),userId);
 return !!review&&review.status==='approved'&&(!review.valid_until||review.valid_until>epoch());
}
// Where a cleaner stands with the platform check that assignment needs. Owners see it on the response row, the cleaner
// sees it on their own card, so neither of them learns about the check from a refused «Назначить».
export type CleanerAdmission='not_required'|'approved'|'pending'|'rejected'|'expired'|'none';
export async function cleanerAdmission(db:D1Database,userId:string):Promise<CleanerAdmission>{
 const policy=await one(db,"SELECT require_cleaner_review FROM pilot_policy WHERE id='global'");
 if(!policy?.require_cleaner_review)return 'not_required';
 const review=await one(db,latestReviewSql('cleaner'),userId);
 if(!review)return 'none';
 if(review.status==='approved')return !review.valid_until||review.valid_until>epoch()?'approved':'expired';
 return review.status==='rejected'?'rejected':'pending';
}
// A response is the moment the check becomes needed, so the request goes to the platform administrators by itself.
export async function requestCleanerAdmission(service:RentalService,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string},jobId:string){
 if((await one(service.db,'SELECT p.demo_owner FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?',jobId))?.demo_owner)return 'not_required' as CleanerAdmission;
 let admission=await cleanerAdmission(service.db,service.userId);
 if(admission==='none'||admission==='expired'){await requestParticipantReview(service,'cleaner',{reference:'Отклик на уборку: проверьте анкету исполнителя.'},config);admission=await cleanerAdmission(service.db,service.userId);}
 return admission;
}
async function verifiedPhone(service:RentalService,userId:string){
 const verification=await one(service.db,'SELECT phone FROM phone_verifications WHERE user_id=? AND verified_at IS NOT NULL',userId);
 if(!verification)return false;
 // Phone verification belongs to the web login identity, never an editable profile contact.
 try{const account=await one(service.db,'SELECT phone FROM auth_accounts WHERE id=?',userId);return !!account&&account.phone===verification.phone;}catch{return false;}
}
export async function assertPilotAllowed(service:RentalService,capability:'publish'|'booking'|'assignment',propertyId?:string,workerId?:string){
 if(!['publish','booking','assignment'].includes(capability))throw new DomainError('Неизвестный вид допуска.');
 const property=propertyId?await one(service.db,'SELECT id,owner_id,demo_owner FROM properties WHERE id=?',propertyId):null;
 if(!property)throw new DomainError('Квартира недоступна.',403);
 if(capability==='publish'&&property.owner_id!==service.userId)throw new DomainError('Квартира недоступна.',403);
 if(property.demo_owner){if(property.demo_owner!==service.userId&&capability!=='assignment')throw new DomainError('Учебная квартира недоступна.',403);return;}
 const policy=await pilotPolicy(service);
 if(['publish','booking'].includes(capability)&&policy.require_owner_review&&!await reviewed(service,property.owner_id,'owner',property.id))throw new DomainError('Публикация и новые брони доступны после действующей проверки владельца и этого объекта.',409);
 if(capability==='assignment'){
  const worker=workerId?await one(service.db,"SELECT id FROM profiles WHERE id=? AND EXISTS(SELECT 1 FROM json_each(roles) WHERE value='cleaner')",workerId):null;
  if(!worker)throw new DomainError('Исполнитель недоступен.',403);
  if(policy.require_cleaner_review&&!await reviewed(service,worker.id,'cleaner'))throw new DomainError('Назначение доступно после действующей проверки исполнителя.',409);
  if(policy.require_phone&&!await verifiedPhone(service,worker.id))throw new DomainError('Исполнителю нужно подтвердить номер телефона аккаунта.',409);
 }else if(policy.require_phone){
  if(!await verifiedPhone(service,property.owner_id))throw new DomainError('Владельцу нужно подтвердить номер телефона аккаунта.',409);
  if(capability==='booking'&&service.userId!==property.owner_id&&!await verifiedPhone(service,service.userId))throw new DomainError('Для новой брони подтвердите номер телефона аккаунта.',409);
 }
}
// Trusted SQL fragment for catalogue queries; caller supplies a static table alias.
export function pilotPropertyVisibleSql(alias='p'){
 if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias))throw new Error('Invalid table alias');
 return `(${alias}.demo_owner IS NOT NULL OR ((COALESCE((SELECT require_owner_review FROM pilot_policy WHERE id='global'),0)=0 OR EXISTS(SELECT 1 FROM pilot_property_admissions a WHERE a.id=${alias}.id AND a.owner_reviewed=1)) AND (COALESCE((SELECT require_phone FROM pilot_policy WHERE id='global'),0)=0 OR EXISTS(SELECT 1 FROM pilot_property_admissions a WHERE a.id=${alias}.id AND a.owner_phone_verified=1))))`;
}
export async function savePilotPolicy(service:RentalService,body:Row,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Правила допуска меняет администратор платформы.',403);
 if(body.confirmed!==true)throw new DomainError('Подтвердите правила допуска и их влияние на новые операции.');
 for(const field of ['requireOwnerReview','requireCleanerReview','requirePhone'])if(typeof body[field]!=='boolean')throw new DomainError('Проверьте правила допуска.');
 if(body.aiReview!==undefined&&typeof body.aiReview!=='boolean')throw new DomainError('Проверьте правила допуска.');
 const version=number(body.expectedVersion,'Версия правил',1,10000000),event=uuid(),at=epoch(),aiReview=body.aiReview===undefined?null:body.aiReview?1:0;
 const results=await service.db.batch([
  q(service.db,"UPDATE pilot_policy SET require_owner_review=?,require_cleaner_review=?,require_phone=?,ai_review=COALESCE(?,ai_review),version=version+1,updated_by=?,updated_at=? WHERE id='global' AND version=?",body.requireOwnerReview?1:0,body.requireCleanerReview?1:0,body.requirePhone?1:0,aiReview,service.userId,at,version),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',event,service.userId,'pilot-policy',JSON.stringify({action:'pilot.policy_changed',requireOwnerReview:body.requireOwnerReview,requireCleanerReview:body.requireCleanerReview,requirePhone:body.requirePhone,aiReview:body.aiReview,previousVersion:version}),at)
 ]);
 if(!results[0].meta.changes)throw new DomainError('Правила уже изменились. Обновите страницу.',409);
 return {message:'Правила допуска сохранены. Фактические оплаты, выезды и результаты работ не изменены.',version:version+1};
}
const scope=(role:Role,platformAdmin:boolean)=>platformAdmin?'1=1':role==='owner'?"i.owner_id=? AND EXISTS(SELECT 1 FROM properties p WHERE p.id=i.property_id AND p.owner_id=?)":role==='guest'?"i.entity_kind='booking' AND EXISTS(SELECT 1 FROM bookings b WHERE b.id=i.entity_id AND b.guest_id=?)":"i.entity_kind='job' AND EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.id=i.entity_id) AND ((i.opened_by=? AND i.opened_role='cleaner') OR (i.other_user=? AND i.other_role='cleaner'))";
const scopeArgs=(service:RentalService,role:Role,platformAdmin:boolean)=>platformAdmin?[]:role==='guest'?[service.userId]:[service.userId,service.userId];
async function syncTickets(service:RentalService,role:Role,platformAdmin:boolean){
 const where=scope(role,platformAdmin),args=scopeArgs(service,role,platformAdmin),at=epoch();
 await service.db.batch([
  q(service.db,`INSERT OR IGNORE INTO operator_tickets(issue_id,status,deadline,created_at,updated_at,resolved_at) SELECT i.id,CASE WHEN i.status='resolved' THEN 'resolved' ELSE 'open' END,i.created_at+3600,i.created_at,?,i.resolved_at FROM administrator_issues i WHERE ${where}`,at,...args),
  q(service.db,`UPDATE operator_tickets SET status='resolved',resolved_at=(SELECT resolved_at FROM administrator_issues WHERE id=issue_id),version=version+1,updated_at=? WHERE status<>'resolved' AND issue_id IN (SELECT i.id FROM administrator_issues i WHERE i.status='resolved' AND (${where}))`,at,...args),
  q(service.db,`INSERT OR IGNORE INTO operator_history(id,issue_id,actor_id,actor_role,action,body,created_at) SELECT 'source:'||i.id||':'||i.version,i.id,'system','system','source_resolved',i.resolution,COALESCE(i.resolved_at,?) FROM administrator_issues i JOIN operator_tickets t ON t.issue_id=i.id WHERE i.status='resolved' AND (${where}) AND NOT EXISTS(SELECT 1 FROM operator_history h WHERE h.issue_id=i.id AND h.action='resolve' AND h.created_at=i.resolved_at AND h.body=i.resolution)`,at,...args)
 ]);
}
export async function governanceState(service:RentalService,role:Role,platformAdmin=false){
 await syncTickets(service,role,platformAdmin);
 const where=scope(role,platformAdmin),args=scopeArgs(service,role,platformAdmin);
 const tickets=await rows(service.db,`SELECT t.*,i.owner_id,i.property_id,i.entity_kind,i.entity_id,i.description,i.resolution,i.opened_role,p.title property_title,CASE WHEN t.assigned_to IS NULL THEN '' ELSE 'Назначен оператор' END assignee_label FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id JOIN properties p ON p.id=i.property_id WHERE ${where} ORDER BY t.status='resolved',CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,t.deadline,t.issue_id LIMIT 100`,...args);
 const histories=tickets.length?await rows(service.db,`SELECT h.* FROM operator_history h JOIN administrator_issues i ON i.id=h.issue_id WHERE (${where}) AND (?=1 OR h.visibility='participants') ORDER BY h.created_at,h.rowid LIMIT 1000`,...args,platformAdmin?1:0):[];
 const admissions=role==='owner'?await rows(service.db,'SELECT p.id,p.title,p.published,p.demo_owner,a.owner_reviewed,a.owner_phone_verified FROM properties p JOIN pilot_property_admissions a ON a.id=p.id WHERE p.owner_id=? ORDER BY p.created_at DESC LIMIT 100',service.userId):role==='cleaner'?[{id:service.userId,cleaner_reviewed:await reviewed(service,service.userId,'cleaner'),phone_verified:await verifiedPhone(service,service.userId)}]:[{id:service.userId,phone_verified:await verifiedPhone(service,service.userId)}];
 return {policy:await pilotPolicy(service),admissions,platformAdmin,currentUserId:service.userId,tickets:tickets.map(ticket=>({...ticket,overdue:ticket.status!=='resolved'&&ticket.deadline<epoch(),history:histories.filter(item=>item.issue_id===ticket.issue_id)})),note:'Оператор фиксирует разбор обращения. Закрытие обращения не подтверждает перевод денег, освобождение квартиры или качество работы.'};
}
export async function updateOperatorTicket(service:RentalService,role:Role,body:Row,platformAdmin=false){
 const issueId=required(body.issueId,'Обращение',100),action=required(body.action,'Действие',30),version=number(body.expectedVersion,'Версия обращения',1,10000000);
 if(!['claim','takeover','release','triage','note','resolve','reopen'].includes(action))throw new DomainError('Неизвестное действие оператора.');
 const key=body.requestKey?required(body.requestKey,'Ключ операции',120):issueId+':'+version+':'+action;
 const digest=await hash(JSON.stringify({role,issueId,action,version,body})),receipt=await one(service.db,"SELECT payload_hash,result FROM operation_receipts WHERE user_id=? AND kind='operator_ticket' AND request_key=?",service.userId,key);
 if(receipt){if(receipt.payload_hash!==digest)throw new DomainError('Ключ обращения уже использован с другими условиями.',409);return JSON.parse(receipt.result);}
 await syncTickets(service,role,platformAdmin);
 const issue=await one(service.db,`SELECT i.*,t.status ticket_status,t.version ticket_version,t.assigned_to,t.priority,t.deadline FROM administrator_issues i JOIN operator_tickets t ON t.issue_id=i.id WHERE i.id=? AND (${scope(role,platformAdmin)})`,issueId,...scopeArgs(service,role,platformAdmin));
 if(!issue)throw new DomainError('Обращение недоступно в вашей роли.',403);
 if(issue.ticket_version!==version)throw new DomainError('Обращение уже изменилось. Обновите страницу.',409);
 if(action!=='note'&&!platformAdmin)throw new DomainError('Рабочую очередь меняет назначенный администратор платформы.',403);
 if(['resolve','reopen','release'].includes(action)&&issue.assigned_to!==service.userId)throw new DomainError('Сначала возьмите обращение в работу.',409);
 if(action==='claim'&&issue.assigned_to&&issue.assigned_to!==service.userId)throw new DomainError('Обращение уже взял другой оператор.',409);
 if(issue.ticket_status==='resolved'&&!['note','reopen','takeover'].includes(action))throw new DomainError('Обращение закрыто. Для продолжения откройте его заново.',409);
 if(action==='reopen'&&issue.ticket_status!=='resolved')throw new DomainError('Обращение уже открыто.',409);
 if(action==='resolve'&&body.confirmed!==true)throw new DomainError('Подтвердите фактический разбор обращения.');
 if(action==='takeover'&&body.confirmed!==true)throw new DomainError('Подтвердите передачу ответственности на себя.');
 const at=epoch(),eventId=uuid(),note=['note','resolve','reopen','triage','takeover'].includes(action)?required(body.note,'Комментарий или основание решения',1500):action==='claim'?'Оператор взял обращение в работу.':'Оператор освободил обращение для следующего ответственного.';
 const visibility=body.visibility==='operators'?'operators':'participants';if(visibility==='operators'&&!platformAdmin)throw new DomainError('Внутренние заметки доступны только оператору.',403);
 let status=issue.ticket_status,assignee=issue.assigned_to,priority=issue.priority,deadline=issue.deadline,resolved=issue.resolved_at;
 if(action==='claim'){status='in_progress';assignee=service.userId;}
 if(action==='takeover'){status=issue.ticket_status==='resolved'?'resolved':'in_progress';assignee=service.userId;}
 if(action==='release'){status='open';assignee=null;}
 if(action==='resolve'){status='resolved';resolved=at;}
 if(action==='reopen'){status='in_progress';resolved=null;}
 if(action==='triage'){
  if(!['normal','high','urgent'].includes(body.priority))throw new DomainError('Выберите приоритет.');priority=body.priority;
  const parsed=typeof body.deadline==='number'?body.deadline:Math.floor(Date.parse(String(body.deadline))/1000);
  deadline=number(parsed,'Срок ответа',at+60,at+90*86400);
 }
 const result={message:action==='resolve'?'Разбор обращения закрыт. Фактические расчёты и готовность квартиры отмечаются отдельно.':action==='note'?'Комментарий сохранён.':'Состояние обращения сохранено.',issueId,version:version+1};
 const statements=[
  q(service.db,'UPDATE operator_tickets SET status=?,assigned_to=?,priority=?,deadline=?,resolved_at=?,updated_at=?,version=version+1 WHERE issue_id=? AND version=? AND EXISTS(SELECT 1 FROM administrator_issues WHERE id=? AND version=?)',status,assignee,priority,deadline,resolved,at,issueId,version,issueId,issue.version),
  q(service.db,'INSERT INTO operator_history SELECT ?,?,?,?,?,?,?,? WHERE changes()>0',eventId,issueId,service.userId,platformAdmin?'platform_admin':role,action,note,action==='resolve'||action==='reopen'?'participants':visibility,at)
 ];
 if(action==='resolve'||action==='reopen')statements.push(q(service.db,"UPDATE administrator_issues SET status=?,resolution=?,resolved_at=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM operator_history WHERE id=?)",action==='resolve'?'resolved':'open',action==='resolve'?note:'',resolved,issueId,issue.version,eventId));
 statements.push(q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operator_history WHERE id=?)',uuid(),service.userId,issueId,JSON.stringify({action:'operator.'+action,eventId}),at,eventId));
 if(visibility==='participants'||action==='resolve'||action==='reopen'){
  const recipients=new Map([[issue.owner_id+':owner',{id:issue.owner_id,role:'owner'}],[issue.opened_by+':'+issue.opened_role,{id:issue.opened_by,role:issue.opened_role}],[issue.other_user+':'+issue.other_role,{id:issue.other_user,role:issue.other_role}]]);
  for(const recipient of recipients.values())if(recipient.id&&recipient.id!==service.userId)statements.push(q(service.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operator_history WHERE id=?)',uuid(),recipient.id,action==='resolve'?'Оператор записал решение по вашему обращению. Откройте историю разбора.':'По вашему обращению появилась новая запись. Откройте историю разбора.',recipient.role+':operator:'+eventId,0,at,eventId));
 }
 statements.push(q(service.db,"INSERT INTO operation_receipts SELECT ?,'operator_ticket',?,?,?,? WHERE EXISTS(SELECT 1 FROM operator_history WHERE id=?)",service.userId,key,digest,JSON.stringify(result),at,eventId));
 const results=await service.db.batch(statements);if(!results[0].meta.changes)throw new DomainError('Обращение уже изменилось. Обновите страницу.',409);
 return result;
}
