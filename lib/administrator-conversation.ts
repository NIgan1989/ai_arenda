import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {listCommands} from './administrator-commands';
import {aiDataPermission} from './ai-data-permission';
export async function administratorConversation(service:RentalService,role:Role,before?:unknown){
 await service.authorizeWorkspace(role,'operations');let cursor:Record<string,any>|null=null;
 if(before){cursor=await service.one('SELECT id,created_at FROM messages WHERE id=? AND user_id=? AND scope=?',required(before,'Сообщение',100),service.userId,role);if(!cursor)throw new DomainError('История недоступна.',404);}
 const messages=await service.all(`SELECT id,sender,body,created_at FROM messages WHERE user_id=? AND scope=? ${cursor?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 101`,service.userId,role,...(cursor?[cursor.created_at,cursor.created_at,cursor.id]:[]));const hasOlder=messages.length>100;if(hasOlder)messages.pop();messages.reverse();
 const results=messages.length?await service.all('SELECT r.message_id,r.result FROM administrator_search_results r JOIN messages m ON m.id=r.message_id WHERE m.user_id=? AND m.scope=? AND m.id IN ('+messages.map(()=>'?').join(',')+')',service.userId,role,...messages.map(m=>m.id)):[];
 return {userId:service.userId,messages:messages.map(m=>({...m,created_at:m.created_at>1e12?m.created_at/1000:m.created_at,...(results.some(r=>r.message_id===m.id)?{search:JSON.parse(results.find(r=>r.message_id===m.id)!.result)}:{})})),hasOlder,commands:await listCommands(service,role),permission:await aiDataPermission(service)};
}
