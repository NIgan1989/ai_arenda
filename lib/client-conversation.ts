import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
function validFlow(flow:any,role:Role){
 if(flow===null||flow===undefined)return true;
 const object=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
 return object(flow)&&flow.role===role&&typeof flow.kind==='string'&&flow.kind.length<=40&&typeof flow.after==='string'&&flow.after.length<=100&&typeof flow.endpoint==='string'&&/^(?:profile|properties|jobs|bookings(?:\/[A-Za-z0-9_-]{1,100})?)$/.test(flow.endpoint)&&object(flow.answers)&&(!flow.extra||object(flow.extra))&&Array.isArray(flow.questions)&&flow.questions.length>0&&flow.questions.length<=20&&Number.isInteger(flow.index)&&flow.index>=0&&flow.index<flow.questions.length&&flow.questions.every((q:any)=>object(q)&&typeof q.key==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(q.key)&&!['__proto__','constructor','prototype'].includes(q.key)&&typeof q.text==='string'&&q.text.length<=2000&&typeof q.label==='string'&&q.label.length<=200&&(!q.choices||Array.isArray(q.choices)&&q.choices.length<=20&&q.choices.every((c:any)=>object(c)&&typeof c.value==='string'&&c.value.length<=200&&typeof c.label==='string'&&c.label.length<=200)));
}
export async function clientConversation(s:RentalService,role:Role,body?:Record<string,any>){
 await s.authorizeWorkspace(role,'conversation');
 if(!body){const row=await s.one('SELECT body FROM client_conversations WHERE user_id=? AND role=?',s.userId,role);if(!row)return {messages:[],flow:null,actor:role};const value=JSON.parse(row.body);return validFlow(value.flow,role)?value:{...value,flow:null,draftInvalid:true};}
 if(!Array.isArray(body.messages)||body.messages.length>150||body.messages.some((m:any)=>!m||typeof m.id!=='string'||m.id.length>120||!['assistant','user'].includes(m.sender)||typeof m.text!=='string'||m.text.length>10000))throw new DomainError('Некорректная история.');
 if(body.flow&&body.flow.role!==role)throw new DomainError('Сценарий относится к другой роли.',403);
 if(!validFlow(body.flow,role))throw new DomainError('Сохранённый ввод не прошёл проверку. Откройте форму заново.');
 const value=JSON.stringify({messages:body.messages,flow:body.flow||null,actor:role});
 if(value.length>200000)throw new DomainError('История слишком большая.',413);
 await s.query('INSERT INTO client_conversations VALUES (?,?,?,?) ON CONFLICT(user_id,role) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at',s.userId,role,value,Math.floor(Date.now()/1000)).run();
 return {saved:true};
}
