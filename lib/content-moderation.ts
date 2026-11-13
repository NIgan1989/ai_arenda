import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {q,one,epoch,uuid,type Row} from './operation-core';

// The report identifies one message. Operator access never opens the whole room.
export async function moderateContent(s:RentalService,role:Role,action:string,b:Row,admin=false,system=false){
 // system: the AI administrator's own pass over open reports, which has no workspace profile.
 if(!system)await s.authorizeWorkspace(role,'account');if(!admin)throw new DomainError('Нет полномочий оператора.',403);
 const report=await one(s.db,'SELECT * FROM content_reports WHERE id=?',required(b.reportId,'Жалоба',100)),reason=required(b.reason,'Основание действия оператора',1000);
 if(!report)throw new DomainError('Жалоба недоступна.',404);
 const kind=report.target_kind,target=report.target_id,room=report.room_id;
 const archived=await one(s.db,'SELECT * FROM moderated_content WHERE kind=? AND target_id=? AND room_id=?',kind,target,room);
 const message=kind==='ai'?await one(s.db,"SELECT body,'' photo_data FROM messages WHERE id=? AND user_id=? AND scope=? AND sender='assistant'",target,report.user_id,report.role):await one(s.db,'SELECT body,photo_data FROM discussion_messages WHERE seq=? AND room_id=?',target,room);
 if(!message)throw new DomainError('Материал недоступен.',404);
 if(action==='inspect'){
  await q(s.db,'INSERT INTO moderation_access_events VALUES (?,?,?,?,?,?)',uuid(),s.userId,report.id,b.includePhoto===true?'inspect_photo':'inspect',reason,epoch()).run();
  return {material:{kind,body:archived?.original_body??message.body,hasPhoto:!!(archived?.original_photo_data||message.photo_data),...(b.includePhoto===true?{photo:archived?.original_photo_data||message.photo_data}:{}),hidden:!!archived?.hidden,version:archived?.version||0}};
 }
 if(action!=='moderate'||!['hide','restore'].includes(b.decision)||!Number.isInteger(b.expectedVersion)||b.expectedVersion<0)throw new DomainError('Выберите действие с актуальным материалом.');
 if((archived?.version||0)!==b.expectedVersion)throw new DomainError('Материал уже изменён. Проверьте его повторно.',409);
 if(b.decision==='restore'&&!archived?.hidden)throw new DomainError('Материал не скрыт.',409);
 const search=kind==='ai'?await one(s.db,'SELECT result FROM administrator_search_results WHERE message_id=?',target):null;
 const op=uuid(),version=b.expectedVersion+1,hidden=b.decision==='hide'?1:0,time=epoch(),original=archived?.original_body??message.body,photo=archived?.original_photo_data??message.photo_data,originalSearch=archived?.original_search_result??search?.result??null;
 const gate='EXISTS(SELECT 1 FROM moderated_content WHERE kind=? AND target_id=? AND room_id=? AND operation_key=?)',args=[kind,target,room,op];
 const statements=[q(s.db,`INSERT INTO moderated_content SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM moderated_content WHERE kind=? AND target_id=? AND room_id=? AND version=?) ON CONFLICT(kind,target_id,room_id) DO UPDATE SET hidden=excluded.hidden,version=excluded.version,operation_key=excluded.operation_key,updated_at=excluded.updated_at WHERE moderated_content.version=?`,kind,target,room,original,photo,originalSearch,hidden,version,op,time,b.expectedVersion,kind,target,room,b.expectedVersion,b.expectedVersion)];
 // INSERT has ten columns; all target writes are tied to a fresh operation nonce.
 if(kind==='ai'){
  statements.push(q(s.db,`UPDATE messages SET body=? WHERE id=? AND user_id=? AND scope=? AND ${gate}`,hidden?'Ответ скрыт после рассмотрения жалобы.':original,target,report.user_id,report.role,...args));
  if(hidden)statements.push(q(s.db,`DELETE FROM administrator_search_results WHERE message_id=? AND ${gate}`,target,...args));
  else if(originalSearch)statements.push(q(s.db,`INSERT INTO administrator_search_results SELECT ?,? WHERE ${gate} ON CONFLICT(message_id) DO UPDATE SET result=excluded.result`,target,originalSearch,...args));
 }else statements.push(q(s.db,`UPDATE discussion_messages SET body=?,photo_data=? WHERE seq=? AND room_id=? AND ${gate}`,hidden?'Сообщение скрыто после рассмотрения жалобы.':original,hidden?'':photo,target,room,...args));
 statements.push(q(s.db,`INSERT INTO moderation_access_events SELECT ?,?,?,?,?,? WHERE ${gate}`,uuid(),s.userId,report.id,b.decision,reason,time,...args));
 statements.push(q(s.db,`UPDATE content_reports SET status='reviewing',resolution=? WHERE id=? AND ${gate}`,hidden?'Материал скрыт на время рассмотрения.':'Отображение материала восстановлено.',report.id,...args));
 const [changed]=await s.db.batch(statements);if(!changed.meta.changes)throw new DomainError('Материал уже изменён. Проверьте его повторно.',409);
 return {hidden:!!hidden,version,message:hidden?'Материал скрыт во всех представлениях. История процесса и расчёты сохранены.':'Материал восстановлен.'};
}
