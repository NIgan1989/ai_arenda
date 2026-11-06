import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {authorisedRoom} from './process-discussions';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {moderateContent} from './content-moderation';
import {accountDeletionState,accountDeletionAction} from './account-deletion';
export async function safetyState(s:RentalService,role:Role,admin=false){
 await s.authorizeWorkspace(role,'account');
 const deletionDetails=await accountDeletionState(s,role,admin);
 return {userId:s.userId,deletionDetails,blocks:await rows(s.db,'SELECT room_id FROM discussion_blocks WHERE blocker_id=? AND blocker_role=?',s.userId,role),deletion:await one(s.db,'SELECT id,requested_at,status FROM deletion_requests WHERE user_id=?',s.userId),reports:await rows(s.db,'SELECT id,target_kind,status,created_at,resolution FROM content_reports WHERE user_id=? AND role=? ORDER BY created_at DESC LIMIT 50',s.userId,role),...(admin?{queue:await rows(s.db,"SELECT * FROM content_reports WHERE status<>'resolved' ORDER BY created_at LIMIT 100"),deletions:await rows(s.db,"SELECT id,user_id,requested_at,status FROM deletion_requests WHERE status='requested' ORDER BY requested_at LIMIT 100")}:{})};
}
export async function safetyAction(s:RentalService,role:Role,action:string,b:Row,admin=false){
 await s.authorizeWorkspace(role,'account');
 if(action==='account-deletion')return accountDeletionAction(s,role,b,admin);
 if(['inspect','moderate'].includes(action))return moderateContent(s,role,action,b,admin);
 if(action==='deletion'){
  if(b.confirmed!==true||!['request','cancel'].includes(b.action))throw new DomainError('Подтвердите действие с запросом удаления.');
  const old=await one(s.db,'SELECT * FROM deletion_requests WHERE user_id=?',s.userId);
  if(b.action==='cancel'){await q(s.db,"UPDATE deletion_requests SET status='cancelled' WHERE user_id=?",s.userId).run();return {message:'Запрос удаления отозван.'};}
  if(old?.status==='requested')return {id:old.id,message:'Запрос уже зарегистрирован. Данные ещё не удалены.'};
  const id=old?.id||uuid();await q(s.db,"INSERT INTO deletion_requests VALUES (?,?,?,'requested','') ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,requested_at=excluded.requested_at,status='requested'",s.userId,id,epoch()).run();
  await s.audit(s.userId,'account.deletion_requested').run();
  return {id,message:'Запрос удаления зарегистрирован. Он требует обработки оператором; данные пока не удалены. Номер обращения: '+id};
 }
 if(action==='review'){
  if(!admin)throw new DomainError('Нет полномочий оператора.',403);
  if(!['reviewing','resolved'].includes(b.status))throw new DomainError('Выберите статус.');
  const note=required(b.resolution,'Результат рассмотрения',1000);
  const r=await q(s.db,'UPDATE content_reports SET status=?,resolution=? WHERE id=?',b.status,note,required(b.id,'Жалоба',100)).run();if(!r.meta.changes)throw new DomainError('Жалоба не найдена.',404);
  await s.audit(b.id,'content.report_reviewed').run();return {message:'Результат рассмотрения сохранён.'};
 }
 if(action==='block'){
  const {room}=await authorisedRoom(s,role,b);
  if(typeof b.blocked!=='boolean')throw new DomainError('Выберите действие.');
  if(b.blocked)await q(s.db,'INSERT OR IGNORE INTO discussion_blocks VALUES (?,?,?,?)',room.id,s.userId,role,epoch()).run();
  else await q(s.db,'DELETE FROM discussion_blocks WHERE room_id=? AND blocker_id=? AND blocker_role=?',room.id,s.userId,role).run();
  return {message:b.blocked?'Новые сообщения в этом чате заблокированы. История и действия по процессу сохранены.':'Ваша блокировка чата снята.'};
 }
 if(action!=='report')throw new DomainError('Раздел не найден.',404);
 const kind=b.kind,target=required(b.targetId,'Сообщение',100),reason=required(b.reason,'Причина жалобы',1000);let roomId='';
 if(kind==='ai'){
  if(!await one(s.db,"SELECT id FROM messages WHERE id=? AND user_id=? AND scope=? AND sender='assistant'",target,s.userId,role))throw new DomainError('Ответ недоступен.',403);
 }else if(kind==='message'){
  const {room}=await authorisedRoom(s,role,b);roomId=room.id;
  if(!await one(s.db,'SELECT seq FROM discussion_messages WHERE seq=? AND room_id=?',target,roomId))throw new DomainError('Сообщение недоступно.',403);
 }else throw new DomainError('Выберите тип сообщения.');
 const previous=await one(s.db,'SELECT id FROM content_reports WHERE user_id=? AND role=? AND target_kind=? AND target_id=? AND room_id=?',s.userId,role,kind,target,roomId);if(previous)return {id:previous.id,message:'Жалоба уже зарегистрирована.'};
 const count=await one(s.db,'SELECT COUNT(*) n FROM content_reports WHERE user_id=? AND created_at>?',s.userId,epoch()-3600);if(count!.n>=20)throw new DomainError('Слишком много жалоб. Повторите позже.',429);
 const id=uuid();await q(s.db,'INSERT OR IGNORE INTO content_reports(id,user_id,role,target_kind,target_id,room_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?)',id,s.userId,role,kind,target,roomId,reason,epoch()).run();return {message:'Жалоба зарегистрирована. Оператор сможет рассмотреть её в очереди безопасности.'};
}
