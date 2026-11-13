import {DomainError,required,number,type Role} from './domain';
import type {RentalService} from './service';
import {q,one,rows,uuid,epoch,hash,type Row} from './operation-core';
import {jpegInput} from './listings';
import {answerGuest,AI_KEY} from './guest-answers';
import {makeStayOffer} from './stay-offers';
import {reliabilityFor,reliabilityShort} from './reliability';
type Member={id:string;role:Role;name?:string};
export async function discussionContext(service:RentalService,role:Role,body:Row){
 await service.authorizeWorkspace(role,'operations');
 let kind=body.kind,id=required(body.entityId,'Бронь или уборка',100),channel=body.channel||(role==='cleaner'||kind==='job'?'cleaning':'stay');
 if(channel==='shared'||(role==='guest'&&(kind!=='booking'||channel!=='stay'))||(role==='cleaner'&&channel!=='cleaning'))throw new DomainError('Обсуждение недоступно.',403);
 if(!['stay','cleaning'].includes(channel)||!['booking','job'].includes(kind))throw new DomainError('Выберите вид обсуждения.');
 let booking:Row|null=null,job:Row|null=null;
 if(kind==='job'){job=await one(service.db,'SELECT j.*,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?',id);if(!job)throw new DomainError('Обсуждение недоступно.',403);if(channel!=='cleaning'){if(!job.booking_id)throw new DomainError('У этой уборки нет связанной брони.',409);id=job.booking_id;kind='booking';}}
 if(kind==='booking'){booking=await one(service.db,'SELECT b.*,p.owner_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?',id);if(!booking)throw new DomainError('Обсуждение недоступно.',403);job=await one(service.db,"SELECT * FROM cleaning_jobs WHERE booking_id=? AND status<>'cancelled' ORDER BY created_at DESC,id DESC LIMIT 1",id);if(channel==='cleaning'){if(!job)throw new DomainError('Уборка ещё не создана.',409);id=job.id;kind='job';}}
 const entity=kind==='job'?job!:booking!,members:Member[]=[{id:entity.owner_id,role:'owner'}];
 if(channel==='stay')members.push({id:booking!.guest_id,role:'guest'});
 if(channel==='cleaning'){if(job?.assigned_to)members.push({id:job.assigned_to,role:'cleaner'});else if(channel==='cleaning')throw new DomainError('Чат уборки станет доступен после назначения исполнителя.',409);}
 if(!members.some(m=>m.id===service.userId&&m.role===role))throw new DomainError('Вы не участвуете в этом обсуждении в текущей роли.',403);
 for(const m of members){m.name=(await one(service.db,'SELECT name FROM profiles WHERE id=?',m.id))?.name||'Участник';}
 const signature=members.map(m=>m.role+':'+m.id).sort().join('|'),membershipKey=await hash(signature);
 // Rechecked inside the message INSERT: a reassignment between requests cannot add a message to an old group.
 const clauses=kind==='job'?['EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.id=? AND j.owner_id=? AND j.assigned_to=?)']:['EXISTS(SELECT 1 FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND p.owner_id=? AND b.guest_id=?)'];
 const gateArgs:any[]=kind==='job'?[id,entity.owner_id,job?.assigned_to]:[id,booking!.owner_id,booking!.guest_id];
 return {kind,id,channel,members,membershipKey,title:entity.title||booking?.title,gate:clauses.join(' AND '),gateArgs};
}
export async function discussionCandidates(service:RentalService,role:Role){
 await service.authorizeWorkspace(role,'operations');
 const bookings=role==='cleaner'?[]:await rows(service.db,`SELECT b.id,'booking' kind,p.title,b.start,b.end,b.status FROM bookings b JOIN properties p ON p.id=b.property_id WHERE ${role==='owner'?'p.owner_id':'b.guest_id'}=? ORDER BY b.created_at DESC LIMIT 100`,service.userId);
 const jobs=role==='guest'?[]:await rows(service.db,`SELECT j.id,'job' kind,p.title,j.start,j.end,j.status FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE ${role==='owner'?'j.owner_id':'j.assigned_to'}=? ORDER BY j.created_at DESC LIMIT 100`,service.userId);
 return {items:[...bookings,...jobs],note:'Выберите конкретную бронь или уборку. Переписка открывается только её участникам.'};
}
export async function openDiscussion(service:RentalService,role:Role,body:Row){
 const c=await discussionContext(service,role,body),id=uuid();
 await q(service.db,'INSERT OR IGNORE INTO discussion_rooms VALUES (?,?,?,?,?,?,?,?)',id,c.kind,c.id,c.channel,c.membershipKey,JSON.stringify(c.members),c.title,epoch()).run();
 const room=await one(service.db,'SELECT id FROM discussion_rooms WHERE entity_kind=? AND entity_id=? AND channel=? AND membership_key=?',c.kind,c.id,c.channel,c.membershipKey);return {roomId:room!.id};
}
export async function authorisedRoom(service:RentalService,role:Role,body:Row){
 await service.authorizeWorkspace(role,'operations');const room=await one(service.db,'SELECT * FROM discussion_rooms WHERE id=?',required(body.roomId,'Чат',100));
 if(!room||room.channel==='shared'||!JSON.parse(room.members).some((m:Member)=>m.id===service.userId&&m.role===role))throw new DomainError('Чат недоступен.',403);
 const context=await discussionContext(service,role,{kind:room.entity_kind,entityId:room.entity_id,channel:room.channel});return {room,context};
}
async function currentMembers(service:RentalService,room:Row,context:Row){
 const members:Row[]=[];
 for(const old of JSON.parse(room.members)){
  if(!context.members.some((m:Member)=>m.id===old.id&&m.role===old.role)){members.push({id:old.id,role:old.role,name:old.name||'Участник',avatar_id:null});continue;}
  const p=await one(service.db,"SELECT p.name,p.city,d.avatar_id,COALESCE(x.bio,'') bio,COALESCE(x.languages,'') languages,COALESCE(x.avatar_visibility,'participants') avatar_visibility FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id LEFT JOIN profile_preferences x ON x.user_id=p.id WHERE p.id=?",old.id);
  members.push({id:old.id,role:old.role,name:p?.name||old.name||'Участник',city:p?.city||'',bio:p?.bio||'',languages:p?.languages||'',avatar_id:p?.avatar_visibility==='self'&&old.id!==service.userId?null:p?.avatar_id||null});
 }
 return members;
}
export async function discussionAvatar(service:RentalService,role:Role,body:Row){
 const {room,context}=await authorisedRoom(service,role,body),person=required(body.userId,'Собеседник',100);
 if(!JSON.parse(room.members).some((m:Member)=>m.id===person)||!context.members.some((m:Member)=>m.id===person))throw new DomainError('Аватар недоступен.',404);
 const photo=await one(service.db,"SELECT m.data FROM profile_details d JOIN media m ON m.id=d.avatar_id AND m.user_id=d.user_id AND m.kind='avatar' LEFT JOIN profile_preferences x ON x.user_id=d.user_id WHERE d.user_id=? AND (d.user_id=? OR COALESCE(x.avatar_visibility,'participants')='participants')",person,service.userId);
 if(!photo)throw new DomainError('Аватар недоступен.',404);return photo;
}
export async function readDiscussion(service:RentalService,role:Role,body:Row){
 const {room,context}=await authorisedRoom(service,role,body),before=body.before?number(body.before,'Номер сообщения',1,Number.MAX_SAFE_INTEGER):Number.MAX_SAFE_INTEGER;
 const messages=await rows(service.db,"SELECT m.seq,m.sender_id,m.sender_role,m.body,m.created_at,m.reply_to,(m.photo_data<>'') photo,(m.sender_role='owner' AND m.request_key LIKE 'ai:%') by_ai,r.body reply_body FROM discussion_messages m LEFT JOIN discussion_messages r ON r.seq=m.reply_to AND r.room_id=m.room_id WHERE m.room_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 100",room.id,before);messages.reverse();
 const older=messages.length?!!await one(service.db,'SELECT seq FROM discussion_messages WHERE room_id=? AND seq<? LIMIT 1',room.id,messages[0].seq):false;
 if(!body.before&&body.markRead!==false){const seq=messages.at(-1)?.seq||0;await q(service.db,'INSERT INTO discussion_visits(room_id,user_id,role,last_seq,seen_at) VALUES (?,?,?,?,?) ON CONFLICT(room_id,user_id,role) DO UPDATE SET last_seq=MAX(last_seq,excluded.last_seq),seen_at=excluded.seen_at',room.id,service.userId,role,seq,epoch()).run();await q(service.db,"UPDATE notifications SET read=1 WHERE user_id=? AND substr(dedupe,1,length(?))=? AND CAST(substr(dedupe,length(?)+1) AS INTEGER)<=?",service.userId,role+':discussion:'+room.id+':',role+':discussion:'+room.id+':',role+':discussion:'+room.id+':',seq).run();}
 const viewer=await one(service.db,'SELECT show_presence,show_receipts FROM profile_preferences WHERE user_id=?',service.userId);
 const rawVisits=await rows(service.db,'SELECT v.user_id,v.role,v.last_seq,v.seen_at,v.typing_until,COALESCE(x.show_presence,1) show_presence,COALESCE(x.show_receipts,1) show_receipts FROM discussion_visits v LEFT JOIN profile_preferences x ON x.user_id=v.user_id WHERE v.room_id=?',room.id);
 const visits=rawVisits.map(v=>({user_id:v.user_id,role:v.role,last_seq:v.show_receipts&&(viewer?.show_receipts??1)?v.last_seq:0,seen_at:v.show_presence&&(viewer?.show_presence??1)?v.seen_at:0,typing_until:v.show_presence&&(viewer?.show_presence??1)?v.typing_until:0}));
 const sendBlocked=!!await one(service.db,'SELECT room_id FROM discussion_blocks WHERE room_id=?',room.id),archived=room.membership_key!==context.membershipKey,members=await currentMembers(service,room,context);
 for(const m of members){if(m.id===service.userId&&m.role===role)continue;try{const r=(await reliabilityFor(service.db,m.role,[m.id])).get(m.id);if(r)m.rating=reliabilityShort(r);}catch{}}
 const subject=await discussionSubject(service,context);
 return {room:{id:room.id,sendBlocked,title:room.title,channel:room.channel,members,archived},subject,call:archived?{phone:null,note:'Чат в архиве.'}:await discussionCall(service,role,context,subject,sendBlocked),messages,visits,hasOlder:older,userId:service.userId};
}
export async function sendDiscussionMessage(service:RentalService,role:Role,body:Row){
 const {room,context}=await authorisedRoom(service,role,body);if(room.membership_key!==context.membershipKey)throw new DomainError('Состав участников изменился. Откройте актуальное обсуждение.',409);
 if(await one(service.db,'SELECT room_id FROM discussion_blocks WHERE room_id=?',room.id))throw new DomainError('Переписка заблокирована участником. История и действия по процессу доступны.',403);
 const photo=body.photo?jpegInput(body.photo,'property').data:'',reply=body.replyTo?number(body.replyTo,'Ответ на сообщение',1,Number.MAX_SAFE_INTEGER):null;
 if(reply&&!await one(service.db,'SELECT seq FROM discussion_messages WHERE room_id=? AND seq=?',room.id,reply))throw new DomainError('Исходное сообщение недоступно.',403);
 const text=required(body.text||(photo?'Фотография':''),'Сообщение',4000),key=required(body.requestKey,'Ключ сообщения',100);if(key.startsWith(AI_KEY))throw new DomainError('Некорректный ключ сообщения.');const previous=await one(service.db,'SELECT seq,body,photo_data,reply_to FROM discussion_messages WHERE room_id=? AND sender_id=? AND sender_role=? AND request_key=?',room.id,service.userId,role,key);
 const same=(m:Row)=>m.body===text&&m.photo_data===photo&&m.reply_to===reply;
 if(previous){if(!same(previous))throw new DomainError('Этот ключ использован для другого сообщения.',409);return {sent:true,seq:previous.seq};}
 const message=await q(service.db,`INSERT OR IGNORE INTO discussion_messages(room_id,sender_id,sender_role,body,request_key,created_at,photo_data,reply_to) SELECT ?,?,?,?,?,?,?,? WHERE ${context.gate} AND NOT EXISTS(SELECT 1 FROM discussion_blocks WHERE room_id=?) AND (SELECT COUNT(*) FROM discussion_messages WHERE sender_id=? AND created_at>?)<30 RETURNING seq`,room.id,service.userId,role,text,key,epoch(),photo,reply,...context.gateArgs,room.id,service.userId,epoch()-60).first<Row>();
 if(!message){const replay=await one(service.db,'SELECT seq,body,photo_data,reply_to FROM discussion_messages WHERE room_id=? AND sender_id=? AND sender_role=? AND request_key=?',room.id,service.userId,role,key);if(replay&&same(replay))return {sent:true,seq:replay.seq};throw new DomainError('Сообщение не отправлено: изменился состав участников или достигнут лимит. Обновите чат.',409);}
 // Under autopilot the AI administrator answers the guest for the owner. A failed answer never fails the guest's message.
 if(role==='guest'&&room.channel==='stay'){try{await answerGuest(service.db,room.id,message.seq,(bookingId,kind,wanted)=>makeStayOffer(service,bookingId,kind,undefined,wanted));}catch(error){console.error('AI administrator: guest answer failed',error);}}
 return {sent:true,seq:message.seq};
}

export async function discussionPhoto(service:RentalService,role:Role,body:Row){
 const {room}=await authorisedRoom(service,role,body),message=await one(service.db,"SELECT photo_data FROM discussion_messages WHERE room_id=? AND seq=? AND photo_data<>''",room.id,number(body.seq,'Фотография',1,Number.MAX_SAFE_INTEGER));
 if(!message)throw new DomainError('Фотография недоступна.',404);return {data:message.photo_data};
}
export async function discussionTyping(service:RentalService,role:Role,body:Row){
 const {room,context}=await authorisedRoom(service,role,body);if(room.membership_key!==context.membershipKey)throw new DomainError('Обсуждение закрыто.',409);
 const pref=await one(service.db,'SELECT show_presence FROM profile_preferences WHERE user_id=?',service.userId);
 await q(service.db,'INSERT INTO discussion_visits(room_id,user_id,role,typing_until) VALUES (?,?,?,?) ON CONFLICT(room_id,user_id,role) DO UPDATE SET typing_until=excluded.typing_until',room.id,service.userId,role,body.typing===true&&(pref?.show_presence??1)?epoch()+6:0).run();return {ok:true};
}
export async function discussionInbox(service:RentalService,role:Role){
 await service.authorizeWorkspace(role,'operations');
 const rooms=await rows(service.db,"SELECT r.id FROM discussion_rooms r WHERE r.channel<>'shared' AND EXISTS(SELECT 1 FROM json_each(r.members) m WHERE json_extract(m.value,'$.id')=? AND json_extract(m.value,'$.role')=?) ORDER BY COALESCE((SELECT MAX(created_at) FROM discussion_messages WHERE room_id=r.id),r.created_at) DESC LIMIT 100",service.userId,role),items:Row[]=[];
 for(const r of rooms){try{const {room,context}=await authorisedRoom(service,role,{roomId:r.id});const latest=await one(service.db,"SELECT seq,body,created_at,(photo_data<>'') photo FROM discussion_messages WHERE room_id=? ORDER BY seq DESC LIMIT 1",r.id),unread=await one(service.db,'SELECT COUNT(*) n FROM discussion_messages WHERE room_id=? AND sender_id<>? AND seq>COALESCE((SELECT last_seq FROM discussion_visits WHERE room_id=? AND user_id=? AND role=?),0)',r.id,service.userId,r.id,service.userId,role);items.push({id:r.id,title:room.title,kind:room.entity_kind,entityId:room.entity_id,channel:room.channel,members:await currentMembers(service,room,context),archived:room.membership_key!==context.membershipKey,latest,unread:unread?.n||0});}catch(e){if(!(e instanceof DomainError)||![403,409].includes(e.status))throw e;}}
 return {userId:service.userId,rooms:items,unread:items.reduce((sum,r)=>sum+r.unread,0),...(await discussionCandidates(service,role))};
}

// The order the chat is about: shown pinned at the top of the chat, and a tap opens it.
async function discussionSubject(service:RentalService,context:Row){
 const r=context.kind==='job'?await one(service.db,'SELECT id,start,end,status,fee FROM cleaning_jobs WHERE id=?',context.id):await one(service.db,'SELECT id,start,end,status FROM bookings WHERE id=?',context.id);
 return r?{kind:context.kind,id:r.id,title:context.title,status:r.status,start:r.start,end:r.end,...(r.fee!=null?{fee:r.fee}:{})}:null;
}
// A call to the other participant. The number opens only while the deal already goes through the service:
// a confirmed stay up to a day after check-out, or a cleaning with an assigned performer, so a call does not
// replace the booking or the payment through the service.
const CALL_JOB=['assigned','in_progress','submitted'];
export function callAllowed(subject:Row|null,blocked:boolean,t=epoch()){
 if(blocked)return {ok:false,note:'Переписка заблокирована.'};
 if(!subject)return {ok:false,note:'Звонок недоступен.'};
 if(subject.kind==='booking')return subject.status==='confirmed'&&t<subject.end+86400?{ok:true,note:''}:{ok:false,note:subject.status==='requested'?'Позвонить можно после подтверждения брони.':'Бронь уже не действует.'};
 return CALL_JOB.includes(subject.status)?{ok:true,note:''}:{ok:false,note:subject.status==='completed'?'Уборка завершена.':'Позвонить можно, когда исполнитель назначен.'};
}
async function discussionCall(service:RentalService,role:Role,context:Row,subject:Row|null,blocked:boolean){
 const allowed=callAllowed(subject,blocked);if(!allowed.ok)return {phone:null,note:allowed.note};
 const other=(context.members as Member[]).find(m=>!(m.id===service.userId&&m.role===role));if(!other)return {phone:null,note:'Собеседника нет.'};
 const row=await one(service.db,'SELECT phone FROM auth_accounts WHERE id=?',other.id);
 return row?.phone?{phone:String(row.phone),note:''}:{phone:null,note:'Собеседник не указал телефон.'};
}
