import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {verifyPassword,digest} from './native-auth';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {accountDeletionColumns,accountDeletionFenceSql} from './account-deletion-inventory';

// Every table is classified. A schema extension requires reviewing this inventory;
// unknown tables/ownership columns never trigger a best-effort destructive cleanup.
const knownTables=new Set(('stay_reviews platform_billing platform_commissions owner_balance_entries matching_preferences matching_requests matching_offers push_subscriptions push_deliveries access_receipts account_preferences administrator_commands administrator_issues administrator_runs administrator_search_results administrator_tasks ai_budget_preferences ai_data_permission_events ai_data_permissions ai_usage_reservations applications assistant_preferences audit_events auth_accounts auth_attempt_limits auth_mobile_sessions auth_sessions background_jobs booking_changes booking_terms bookings calendar_exports calendar_previews calendar_sources cleaning_jobs cleaning_offers client_conversations content_reports deletion_requests delivery_channels delivery_events delivery_links delivery_outbox discussion_blocks discussion_messages discussion_rooms discussion_visits evidence_video_chunks external_blocks finance_backfill_receipts finance_entries job_evidence journey_sessions media messages moderated_content moderation_access_events notifications operation_receipts operation_rules operator_history operator_tickets participant_reviews payment_intents phone_verifications pilot_policy profile_details profile_preferences profiles properties property_access property_details property_import_links property_imports property_locations property_operations property_policies provider_events review_property_bindings worker_dispatch account_erasure_receipts account_erasure_fences account_deletion_reviews accounts sessions conversations workspace_conversations command_receipts rental_migrations d1_migrations _cf_METADATA').split(' '));
const ownership:Record<string,string>={stay_reviews:'guest_id owner_id',platform_billing:'updated_by',platform_commissions:'owner_id',owner_balance_entries:'owner_id actor_id',matching_preferences:'owner_id',matching_requests:'guest_id',matching_offers:'owner_id',push_subscriptions:'user_id',access_receipts:'user_id',account_preferences:'user_id',administrator_commands:'user_id',administrator_issues:'owner_id opened_by other_user',administrator_tasks:'owner_id user_id',ai_budget_preferences:'user_id',ai_data_permission_events:'user_id',ai_data_permissions:'user_id',ai_usage_reservations:'user_id',applications:'user_id',assistant_preferences:'user_id',audit_events:'actor_id',auth_mobile_sessions:'user_id',auth_sessions:'user_id',bookings:'guest_id',calendar_exports:'owner_id',calendar_previews:'user_id',calendar_sources:'owner_id',cleaning_jobs:'owner_id assigned_to',cleaning_offers:'worker_id',client_conversations:'user_id',content_reports:'user_id',deletion_requests:'user_id',delivery_channels:'user_id',delivery_links:'user_id',delivery_outbox:'user_id',discussion_blocks:'blocker_id',discussion_messages:'sender_id',discussion_rooms:'members',discussion_visits:'user_id',finance_entries:'owner_id actor_id',job_evidence:'user_id',journey_sessions:'sender_id owner_id',media:'user_id',messages:'user_id',moderation_access_events:'actor_id',notifications:'user_id',operation_receipts:'user_id',operator_history:'actor_id',operator_tickets:'assigned_to',participant_reviews:'user_id reviewer_id',payment_intents:'user_id',phone_verifications:'user_id',pilot_policy:'updated_by',profile_details:'user_id',profile_preferences:'user_id',properties:'owner_id demo_owner',property_import_links:'owner_id',property_imports:'owner_id',worker_dispatch:'user_id',account_deletion_reviews:'operator_id',sessions:'user_id',conversations:'user_id',workspace_conversations:'user_id',command_receipts:'user_id',account_erasure_fences:'user_id'};
const schemaQuery="SELECT name,sql,type FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name";
function tableColumns(sql:string){
 const begin=sql.indexOf('('),end=sql.lastIndexOf(')');if(begin<0||end<=begin)return null;
 const definitions:string[]=[];let depth=0,quote='',start=begin+1;
 for(let i=start;i<end;i++){const c=sql[i];if(quote){if(c===quote){if(sql[i+1]===quote)i++;else quote='';}continue;}if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='['){quote=']';continue;}if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){definitions.push(sql.slice(start,i).trim());start=i+1;}}
 definitions.push(sql.slice(start,end).trim());
 const columns:string[]=[];for(const definition of definitions){if(/^(?:PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b/i.test(definition))continue;const match=definition.match(/^[`"\[]?([A-Za-z_][A-Za-z_0-9]*)[`"\]]?\s/);if(!match)return null;columns.push(match[1]);}
 return columns.sort().join(',');
}
async function inventory(s:RentalService){
 const schema=await rows(s.db,schemaQuery),tables=schema.filter(row=>row.type==='table');let safe=true;
 for(const [name,sql] of Object.entries(accountDeletionFenceSql)){const trigger=schema.find(row=>row.type==='trigger'&&row.name===name);if(!trigger||String(trigger.sql).replace(/\s+/g,' ').trim().replace(/;$/,'')!==sql)safe=false;}
 for(const table of tables){
  if(!knownTables.has(table.name)){safe=false;continue;}
  const expected=accountDeletionColumns[table.name];
  if(expected&&tableColumns(String(table.sql))!==expected.split(',').sort().join(','))safe=false;
  const allowed=(ownership[table.name]||'').split(' '),actual=[...new Set(String(table.sql).match(/\b(?:user_id|owner_id|guest_id|worker_id|actor_id|sender_id|reviewer_id|assigned_to|opened_by|other_user|updated_by|demo_owner|members|blocker_id|operator_id)\b/g)||[])];
  if(actual.some(column=>!allowed.includes(column)))safe=false;
 }
 return {safe,tables:new Set(tables.map(t=>t.name)),signature:schema.map(t=>t.name+'\n'+t.sql).join('\n')};
}
type Check={code:string;label:string;sql:string;args:(user:string)=>unknown[]};
const checks:Check[]=[
 {code:'properties',label:'Объекты владельца и учебные объекты требуют отдельной обработки.',sql:'SELECT 1 FROM properties WHERE owner_id=? OR demo_owner=?',args:u=>[u,u]},
 {code:'bookings',label:'История бронирований требует проверки процессов и оснований хранения.',sql:'SELECT 1 FROM bookings WHERE guest_id=? UNION ALL SELECT 1 FROM stay_reviews WHERE guest_id=? OR owner_id=?',args:u=>[u,u,u]},
 {code:'jobs',label:'История работ владельца или исполнителя требует отдельной обработки.',sql:'SELECT 1 FROM cleaning_jobs WHERE owner_id=? OR assigned_to=?',args:u=>[u,u]},
 {code:'applications',label:'Сохранены отклики или предложения работ.',sql:'SELECT 1 FROM applications WHERE user_id=? UNION ALL SELECT 1 FROM cleaning_offers WHERE worker_id=?',args:u=>[u,u]},
 {code:'finance',label:'Сохранены финансовые записи или платёжные обращения. Сроки их хранения определяются отдельно.',sql:'SELECT 1 FROM finance_entries WHERE owner_id=? OR actor_id=? UNION ALL SELECT 1 FROM payment_intents WHERE user_id=? UNION ALL SELECT 1 FROM operation_receipts WHERE user_id=? UNION ALL SELECT 1 FROM platform_commissions WHERE owner_id=? UNION ALL SELECT 1 FROM owner_balance_entries WHERE owner_id=? OR actor_id=? UNION ALL SELECT 1 FROM platform_billing WHERE updated_by=?',args:u=>[u,u,u,u,u,u,u,u]},
 {code:'discussions',label:'Есть переписка участников процесса; требуется решение по её хранению.',sql:"SELECT 1 FROM discussion_rooms r,json_each(r.members) m WHERE json_extract(m.value,'$.id')=? UNION ALL SELECT 1 FROM discussion_messages WHERE sender_id=? UNION ALL SELECT 1 FROM discussion_visits WHERE user_id=? UNION ALL SELECT 1 FROM discussion_blocks WHERE blocker_id=?",args:u=>[u,u,u,u]},
 {code:'reports',label:'Сохранены жалобы или материалы рассмотрения.',sql:"SELECT 1 FROM content_reports WHERE user_id=? OR (target_kind='ai' AND target_id IN (SELECT id FROM messages WHERE user_id=?)) OR (target_kind='message' AND target_id IN (SELECT CAST(seq AS TEXT) FROM discussion_messages WHERE sender_id=?)) UNION ALL SELECT 1 FROM moderated_content WHERE kind='ai' AND target_id IN (SELECT id FROM messages WHERE user_id=?) UNION ALL SELECT 1 FROM moderation_access_events WHERE actor_id=?",args:u=>[u,u,u,u,u]},
 {code:'evidence',label:'Сохранены материалы уборки, включая возможные внешние файлы.',sql:'SELECT 1 FROM job_evidence WHERE user_id=?',args:u=>[u]},
 {code:'verification',label:'Сохранены подтверждения участника, телефона или действия оператора.',sql:'SELECT 1 FROM participant_reviews WHERE user_id=? OR reviewer_id=? UNION ALL SELECT 1 FROM phone_verifications WHERE user_id=? UNION ALL SELECT 1 FROM operator_history WHERE actor_id=? UNION ALL SELECT 1 FROM operator_tickets WHERE assigned_to=? UNION ALL SELECT 1 FROM pilot_policy WHERE updated_by=? UNION ALL SELECT 1 FROM account_deletion_reviews WHERE operator_id=?',args:u=>[u,u,u,u,u,u,u]},
 {code:'calendar',label:'Есть внешние календарные связи или привязки импорта.',sql:'SELECT 1 FROM calendar_sources WHERE owner_id=? UNION ALL SELECT 1 FROM calendar_exports WHERE owner_id=? UNION ALL SELECT 1 FROM property_import_links WHERE owner_id=?',args:u=>[u,u,u]},
 {code:'external_delivery',label:'Есть внешняя доставка или подтверждённые каналы. Данные у получателей обрабатываются отдельно.',sql:"SELECT 1 FROM delivery_outbox WHERE user_id=? AND (status='sending' OR attempts>0 OR provider_reference<>'' OR sent_at IS NOT NULL) UNION ALL SELECT 1 FROM delivery_channels WHERE user_id=? AND verified_at IS NOT NULL UNION ALL SELECT 1 FROM delivery_links WHERE user_id=? AND used_at IS NOT NULL UNION ALL SELECT 1 FROM delivery_events WHERE outbox_id IN (SELECT id FROM delivery_outbox WHERE user_id=?)",args:u=>[u,u,u,u]},
 {code:'model_usage',label:'Есть учёт расходов внешнего AI; требуется решение по сохранению служебных записей.',sql:'SELECT 1 FROM ai_usage_reservations WHERE user_id=?',args:u=>[u]},
 {code:'journeys',label:'Сохранены сеансы положения или выдачи доступа к объекту.',sql:'SELECT 1 FROM journey_sessions WHERE sender_id=? OR owner_id=? UNION ALL SELECT 1 FROM access_receipts WHERE user_id=?',args:u=>[u,u,u]},
 {code:'workflow',label:'Сохранены связанные задачи, обращения или фоновое выполнение.',sql:"SELECT 1 FROM administrator_tasks WHERE user_id=? OR owner_id=? UNION ALL SELECT 1 FROM administrator_issues WHERE owner_id=? OR opened_by=? OR other_user=? UNION ALL SELECT 1 FROM background_jobs WHERE scope=? OR (json_valid(payload) AND EXISTS(SELECT 1 FROM json_tree(payload) WHERE type='text' AND atom=?))",args:u=>[u,u,u,u,u,u,u]},
 {code:'operator_hold',label:'Оператор указал, что запрос требует дополнительных действий.',sql:"SELECT 1 FROM account_deletion_reviews r JOIN deletion_requests d ON d.id=r.request_id WHERE d.user_id=? AND r.id=(SELECT id FROM account_deletion_reviews WHERE request_id=d.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AND r.status='needs_action'",args:u=>[u]},
];
const scopeMessage='Удаление затрагивает рабочую базу сервиса. Сохраняются квитанция и техническая метка с прежним непрозрачным идентификатором аккаунта, без имени, телефона и свободного текста: метка не даёт восстановить удалённые данные запоздалым запросом. Уже выполнявшиеся внешние обращения, резервные копии и данные у внешних получателей не удаляются этим действием; их обработка требует отдельного порядка.';
// Workerd/D1 caps compound SELECT terms below desktop SQLite defaults. These
// internal, static branches must stay independent in both reads and the atomic
// erasure guard: SUM(counts) and AND NOT EXISTS have the same UNION ALL semantics.
const checkBranches=(check:Check)=>check.sql.split(' UNION ALL ');
async function preflight(s:RentalService,user:string,protectedAccount=false){
 const schema=await inventory(s),blockers:Row[]=[];
 if(!schema.safe)blockers.push({code:'schema_review',count:1,label:'Схема данных изменилась. Нужна проверка состава удаляемых данных оператором.'});
 if(protectedAccount)blockers.push({code:'platform_operator',count:1,label:'Для аккаунта оператора сначала передайте полномочия и проверьте его служебные записи.'});
 const counts=await one(s.db,'SELECT '+checks.map(c=>'('+checkBranches(c).map(sql=>`(SELECT COUNT(*) FROM (${sql}))`).join('+')+') AS '+c.code).join(','),...checks.flatMap(c=>c.args(user)));
 for(const check of checks)if(counts?.[check.code])blockers.push({code:check.code,count:Number(counts[check.code]),label:check.label});
 const account=await one(s.db,'SELECT id FROM auth_accounts WHERE id=?',user);if(!account)blockers.push({code:'shared_auth_required',count:1,label:'Автоматическое удаление доступно аккаунту общего сервера с номером телефона. Старый тестовый аккаунт обрабатывает оператор.'});
 return {schema,blockers,canEraseActiveDatabase:blockers.length===0};
}
export async function accountDeletionState(s:RentalService,role:Role,protectedAccount=false){
 await s.authorizeWorkspace(role,'account');
 const request=await one(s.db,'SELECT id,status,requested_at FROM deletion_requests WHERE user_id=?',s.userId),check=await preflight(s,s.userId,protectedAccount),review=request?await one(s.db,'SELECT status,note,created_at FROM account_deletion_reviews WHERE request_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',request.id):null;
 return {request,review,canEraseActiveDatabase:check.canEraseActiveDatabase,blockers:check.blockers,scope:'active_database_only',scopeMessage,requiresPassword:true};
}
async function revokeSessions(s:RentalService){const schema=await inventory(s);await s.db.batch([q(s.db,'DELETE FROM auth_sessions WHERE user_id=?',s.userId),q(s.db,'DELETE FROM auth_mobile_sessions WHERE user_id=?',s.userId),...(schema.tables.has('sessions')?[q(s.db,'DELETE FROM sessions WHERE user_id=?',s.userId)]:[])]);}
export async function accountDeletionAction(s:RentalService,role:Role,b:Row,admin=false){
 await s.authorizeWorkspace(role,'account');
 if(b.action==='revoke-sessions'){
  if(b.confirmed!==true)throw new DomainError('Подтвердите выход на всех устройствах.');await revokeSessions(s);return {message:'Вход завершён на всех устройствах. Запрос удаления и данные пока сохранены.',signOut:true};
 }
 if(b.action==='review'){
  if(!admin)throw new DomainError('Нет полномочий оператора.',403);
  const request=await one(s.db,"SELECT * FROM deletion_requests WHERE id=? AND status='requested'",required(b.requestId,'Запрос удаления',100));if(!request)throw new DomainError('Запрос недоступен.',404);
  if(!['reviewing','needs_action'].includes(b.status))throw new DomainError('Выберите статус рассмотрения.');
  const note=required(b.note,'Ответ заявителю',1500);
  await q(s.db,'INSERT INTO account_deletion_reviews VALUES (?,?,?,?,?,?)',uuid(),request.id,s.userId,b.status,note,epoch()).run();
  const check=await preflight(s,request.user_id);
  return {message:'Результат проверки сохранён. Удаление данных этим действием не выполнялось.',blockers:check.blockers,canEraseActiveDatabase:check.canEraseActiveDatabase};
 }
 if(b.action!=='erase')throw new DomainError('Действие удаления недоступно.',404);
 if(b.confirmed!==true||b.confirmation!=='УДАЛИТЬ АККАУНТ')throw new DomainError('Подтвердите необратимое удаление аккаунта из рабочей базы.');
 const requestId=required(b.requestId,'Запрос удаления',100),request=await one(s.db,"SELECT id FROM deletion_requests WHERE user_id=? AND id=? AND status='requested'",s.userId,requestId);
 if(!request)throw new DomainError('Сначала зарегистрируйте актуальный запрос удаления.',409);
 const check=await preflight(s,s.userId,admin);if(!check.canEraseActiveDatabase)throw new DomainError('Автоматическое удаление остановлено: есть связанные записи или требуется проверка оператора. Откройте список причин.',409);
 if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)throw new DomainError('Для удаления введите действующий пароль.');
 const time=epoch(),attempt=await q(s.db,`INSERT INTO auth_attempt_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,'erasure:user:'+s.userId,time+900,time,time).first<Row>();if(!attempt||attempt.attempts>5)throw new DomainError('Слишком много проверок пароля. Повторите через 15 минут.',429);
 const account=await one(s.db,'SELECT id,phone,password_hash,credential_version FROM auth_accounts WHERE id=?',s.userId);
 if(!account||!/^pbkdf2-sha512\$100000\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(account.password_hash)||!await verifyPassword(b.password,account.password_hash))throw new DomainError('Пароль не подходит.',401);
 const receiptId=uuid(),operation=uuid(),gate='EXISTS(SELECT 1 FROM account_erasure_receipts WHERE request_id=? AND operation_key=?)',gateArgs=[requestId,operation],schemaSignature="COALESCE((SELECT group_concat(name||char(10)||sql,char(10)) FROM ("+schemaQuery+")), '')=?";
 const statements=[q(s.db,`INSERT INTO account_erasure_receipts SELECT ?,?,?,'active_database_only',? WHERE EXISTS(SELECT 1 FROM deletion_requests WHERE user_id=? AND id=? AND status='requested') AND EXISTS(SELECT 1 FROM auth_accounts WHERE id=? AND password_hash=? AND credential_version=?) AND ${schemaSignature} AND ${checks.flatMap(c=>checkBranches(c).map(sql=>'NOT EXISTS('+sql+')')).join(' AND ')}`,receiptId,requestId,operation,time,s.userId,requestId,s.userId,account.password_hash,account.credential_version,check.schema.signature,...checks.flatMap(c=>c.args(s.userId)))];
 statements.push(q(s.db,`INSERT INTO account_erasure_fences SELECT ?,? WHERE ${gate}`,s.userId,time,...gateArgs));
 // Only data owned by an unused account is removed. Every statement shares the
 // receipt nonce, so a race adding a transaction makes the entire cleanup a no-op.
 for(const [table,column] of [['matching_offers','owner_id'],['matching_requests','guest_id'],['matching_preferences','owner_id']])statements.push(q(s.db,`DELETE FROM ${table} WHERE ${column}=? AND ${gate}`,s.userId,...gateArgs));
 const ownTables=['auth_sessions','auth_mobile_sessions','client_conversations','profile_details','profile_preferences','media','account_preferences','assistant_preferences','worker_dispatch','ai_budget_preferences','ai_data_permissions','ai_data_permission_events','administrator_commands','calendar_previews','delivery_links','delivery_channels','delivery_outbox','notifications','property_imports'];
 // Search metadata has a FK to messages; remove it before the assistant history.
 statements.push(q(s.db,`DELETE FROM administrator_search_results WHERE message_id IN (SELECT id FROM messages WHERE user_id=?) AND ${gate}`,s.userId,...gateArgs));
 for(const table of ownTables)statements.push(q(s.db,`DELETE FROM ${table} WHERE ${table==='property_imports'?'owner_id':'user_id'}=? AND ${gate}`,s.userId,...gateArgs));
 statements.push(q(s.db,`DELETE FROM messages WHERE user_id=? AND ${gate}`,s.userId,...gateArgs),q(s.db,`DELETE FROM audit_events WHERE (actor_id=? OR entity_id=?) AND ${gate}`,s.userId,s.userId,...gateArgs),q(s.db,`DELETE FROM administrator_runs WHERE id=? AND ${gate}`,'owner:'+s.userId,...gateArgs));
 for(const table of ['conversations','workspace_conversations','sessions','command_receipts'])if(check.schema.tables.has(table))statements.push(q(s.db,`DELETE FROM ${table} WHERE user_id=? AND ${gate}`,s.userId,...gateArgs));
 if(check.schema.tables.has('accounts'))statements.push(q(s.db,`DELETE FROM accounts WHERE id=? AND ${gate}`,s.userId,...gateArgs));
 const phoneHash=await digest(account.phone);statements.push(q(s.db,`DELETE FROM auth_attempt_limits WHERE key IN (?,?,?,?,?,?) AND ${gate}`,'login:phone:'+phoneHash,'register:phone:'+phoneHash,'recover:phone:'+phoneHash,'ai:user:'+s.userId,'route:user:'+s.userId,'erasure:user:'+s.userId,...gateArgs));
 statements.push(q(s.db,`DELETE FROM account_deletion_reviews WHERE request_id=? AND ${gate}`,requestId,...gateArgs),q(s.db,`DELETE FROM deletion_requests WHERE user_id=? AND ${gate}`,s.userId,...gateArgs),q(s.db,`DELETE FROM auth_accounts WHERE id=? AND ${gate}`,s.userId,...gateArgs),q(s.db,`DELETE FROM profiles WHERE id=? AND ${gate}`,s.userId,...gateArgs));
 let result:D1Result[];try{result=await s.db.batch(statements);}catch{throw new DomainError('Удаление не выполнено: связанные данные изменились. Данные сохранены, требуется повторная проверка оператора.',409);}
 if(!result[0].meta.changes)throw new DomainError('Удаление не выполнено: запрос, пароль или связанные данные изменились. Выполните проверку ещё раз.',409);
 return {erased:true,signOut:true,receipt:{id:receiptId,requestId,erasedAt:time,scope:'active_database_only'},message:'Аккаунт и данные неиспользованного профиля удалены из рабочей базы. Все сеансы завершены. '+scopeMessage};
}
