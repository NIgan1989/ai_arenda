import {DomainError} from './domain';
import {moderateContent} from './content-moderation';
import {hasContacts} from './admin-autocheck';
import type {RentalService} from './service';
import {epoch,q,one,rows,type Row} from './operation-core';

// Reports on chat messages. A message with a phone, a link, a request to pay around the service or
// obscene words breaks the rules on its face: the AI administrator hides it at once (the original stays
// archived, the administrator can restore it) and leaves the rest for the administrator.
const OBSCENE=/ху[йеёяи]|пизд|бляд|ебан|ебат|ёбан|уеб|мудак|мудил|залуп|сука|суки|гандон|шлюх/i;
export function obviousViolation(text:string):string|null{
 if(OBSCENE.test(text))return 'нецензурная брань';
 if(hasContacts(text))return 'контакты или оплата мимо сервиса';
 return null;
}
export async function sweepReports(db:D1Database){
 const open=await rows(db,"SELECT r.* FROM content_reports r WHERE r.status='open' AND NOT EXISTS(SELECT 1 FROM moderation_access_events e WHERE e.id='ai-check:'||r.id) ORDER BY r.created_at LIMIT 30");
 const result={hidden:0,left:0};
 for(const report of open){
  const message=report.target_kind==='ai'?await one(db,"SELECT body FROM messages WHERE id=? AND user_id=? AND scope=? AND sender='assistant'",report.target_id,report.user_id,report.role):await one(db,'SELECT body FROM discussion_messages WHERE seq=? AND room_id=?',report.target_id,report.room_id);
  const reason=message?obviousViolation(String(message.body||'')):null;
  if(reason){
   try{await moderateContent({db,userId:'ai-administrator'} as unknown as RentalService,'guest','moderate',{reportId:report.id,decision:'hide',expectedVersion:0,reason:'ИИ-администратор: '+reason} as Row,true,true);await q(db,"UPDATE content_reports SET status='resolved',resolution=? WHERE id=?",'Скрыто ИИ-администратором: '+reason+'. Администратор может восстановить.',report.id).run();result.hidden++;}
   catch(e){if(!(e instanceof DomainError))throw e;}
  }else result.left++;
  await q(db,'INSERT OR IGNORE INTO moderation_access_events(id,actor_id,report_id,action,reason,created_at) VALUES (?,?,?,?,?,?)','ai-check:'+report.id,'ai-administrator',report.id,'ai_checked',reason||'Нарушение не очевидно, решает администратор',epoch()).run();
 }
 return result;
}
