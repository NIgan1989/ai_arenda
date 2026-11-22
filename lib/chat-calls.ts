import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {q,one,rows,uuid,epoch,type Row} from './operation-core';
import {authorisedRoom,discussionSubject,appCallAllowed,realtimeReady} from './process-discussions';

// A voice call inside the app (2026-11-22): the two participants of a chat talk without seeing each other's number.
// The voice goes through Cloudflare Realtime (an SFU): each side opens one Realtime session, publishes its microphone
// as the track «voice» and then receives the other side's track. The API token stays on the server; the app only
// sends and gets SDP through these routes, and only for a call it takes part in.
// Without the incoming push yet, a call rings while the other person has the app open (it asks every few seconds);
// the server itself ends a ring nobody took once a minute (sweepCalls), writes «Пропущенный звонок» into the chat and
// leaves a notice. A call counts from the moment the voice is connected on both sides (each side reports it), and a
// call answered but never heard ends as «Связь не установлена» (audit 2026-11-22).
export const RING_S=45,ALIVE_S=25,AUDIO_S=30;
export const NO_AUDIO='Связь не установлена';
const LIVE=['ringing','active'];
type Side='caller'|'callee';
type Config=Row&{REALTIME_APP_ID?:string;REALTIME_APP_TOKEN?:string;realtimeFetch?:typeof fetch};

function ready(config:Config){if(!realtimeReady(config))throw new DomainError('Звонки в приложении ещё не подключены.',503);}
async function sfu(config:Config,path:string,method:'POST'|'PUT',body?:unknown){
 const go=config.realtimeFetch||fetch;
 const r=await go(`https://rtc.live.cloudflare.com/v1/apps/${config.REALTIME_APP_ID}/${path}`,{method,headers:{Authorization:'Bearer '+config.REALTIME_APP_TOKEN,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const v=(await r.json().catch(()=>({}))) as Row;
 if(!r.ok||v.errorCode||(Array.isArray(v.tracks)&&v.tracks.some((t:Row)=>t.errorCode)))throw new DomainError('Звонок не соединился. Попробуйте ещё раз.',502);
 return v;
}
const sdpInput=(v:unknown)=>{if(typeof v!=='string'||!v.startsWith('v=0')||v.length>30000)throw new DomainError('Звонок не соединился. Попробуйте ещё раз.');return v;};
const sideOf=(c:Row,s:RentalService,role:Role):Side|null=>c.caller_id===s.userId&&c.caller_role===role?'caller':c.callee_id===s.userId&&c.callee_role===role?'callee':null;
const twoDigits=(n:number)=>String(n).padStart(2,'0');
// The moment both sides hear each other: the later of the two reports, or 0 while one side has no voice yet.
const heard=(c:Row)=>c.caller_audio&&c.callee_audio?Math.max(c.caller_audio,c.callee_audio):0;

// The same rule for a call already going on as for a new one (appCallAllowed): a cancelled booking, a finished
// cleaning, a blocked chat or a replaced performer ends it, and both sides see why.
async function permitted(db:D1Database,c:Row,t:number){
 const room=await one(db,'SELECT entity_kind,entity_id FROM discussion_rooms WHERE id=?',c.room_id);if(!room)return {ok:false,note:'Звонок недоступен.'};
 const job=room.entity_kind==='job',r=job?await one(db,'SELECT start,end,status,assigned_to FROM cleaning_jobs WHERE id=?',room.entity_id):await one(db,'SELECT start,end,status FROM bookings WHERE id=?',room.entity_id);
 if(job&&r&&[[c.caller_id,c.caller_role],[c.callee_id,c.callee_role]].some(([id,role])=>role==='cleaner'&&id!==r.assigned_to))return {ok:false,note:'Исполнитель сменился.'};
 const blocked=!!await one(db,'SELECT room_id FROM discussion_blocks WHERE room_id=?',c.room_id);
 return appCallAllowed(r?{kind:room.entity_kind,...r}:null,blocked,t);
}
// Ends a call that is over by time or by its deal and writes one line about it into the chat, like a messenger does.
async function settle(db:D1Database,c:Row,t=epoch()):Promise<Row>{
 if(!LIVE.includes(c.status))return c;
 const allowed=await permitted(db,c,t);if(!allowed.ok)return finish(db,c,c.status==='active'?'ended':'cancelled',t,allowed.note);
 if(c.status==='ringing'&&t-c.created_at>RING_S)return finish(db,c,'missed',t);
 if(c.status==='active'&&!heard(c)&&t-c.answered_at>AUDIO_S)return finish(db,c,'ended',t,NO_AUDIO);
 if(c.status==='active'&&t-Math.min(c.caller_seen,c.callee_seen||c.answered_at)>ALIVE_S)return finish(db,c,'ended',t);
 return c;
}
async function finish(db:D1Database,c:Row,status:string,t=epoch(),reason=''):Promise<Row>{
 const from=heard(c),silent=status==='ended'&&!from;if(silent&&!reason)reason=NO_AUDIO;
 const r=await q(db,`UPDATE chat_calls SET status=?,ended_at=?,end_reason=? WHERE id=? AND status IN ('ringing','active')`,status,t,reason,c.id).run();
 if(r.meta.changes){
  const ms=status==='ended'&&from?Math.max(0,t-from)*1000:0;
  const body=ms?'Звонок · '+Math.floor(ms/60000)+':'+twoDigits(Math.floor(ms/1000)%60):silent?NO_AUDIO:status==='declined'?'Звонок отклонён':status==='cancelled'?'Звонок отменён':status==='missed'?'Пропущенный звонок':'Звонок';
  await q(db,'INSERT OR IGNORE INTO discussion_messages(room_id,sender_id,sender_role,body,request_key,created_at,audio_ms) VALUES (?,?,?,?,?,?,?)',c.room_id,c.caller_id,c.caller_role,body,'call:'+c.id,t,ms).run();
  if(status==='missed')await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),c.callee_id,'Пропущенный звонок в чате. Откройте «Чаты», чтобы перезвонить или написать.',c.callee_role+':missed-call:'+c.id,t).run();
 }
 return {...c,...(await one(db,'SELECT status,ended_at,end_reason FROM chat_calls WHERE id=?',c.id))};
}
// Once a minute (lib/background.ts): calls nobody is asking about any more are ended by the server itself.
export async function sweepCalls(db:D1Database,t=epoch()){
 let ended=0;
 for(const c of await rows(db,`SELECT * FROM chat_calls WHERE status IN ('ringing','active') ORDER BY created_at LIMIT 50`)){if(!LIVE.includes((await settle(db,c,t)).status))ended++;}
 return ended;
}
async function view(s:RentalService,c:Row,side:Side){
 const otherId=side==='caller'?c.callee_id:c.caller_id,name=(await one(s.db,'SELECT name FROM profiles WHERE id=?',otherId))?.name||'Собеседник';
 return {id:c.id,roomId:c.room_id,status:c.status,side,role:side==='caller'?c.caller_role:c.callee_role,name,createdAt:c.created_at,answeredAt:c.answered_at||null,connected:!!heard(c),reason:c.end_reason||'',ready:{me:!!c[side+'_session'],other:!!c[(side==='caller'?'callee':'caller')+'_session']}};
}
async function mine(s:RentalService,role:Role,body:Row){
 await s.authorizeWorkspace(role,'operations');
 const c=await one(s.db,'SELECT * FROM chat_calls WHERE id=?',required(body.callId,'Звонок',100));
 const side=c&&sideOf(c,s,role);if(!c||!side)throw new DomainError('Звонок недоступен.',404);
 return {c:await settle(s.db,c),side};
}

export async function startCall(s:RentalService,role:Role,body:Row,config:Config={}){
 ready(config);
 const {room,context}=await authorisedRoom(s,role,body);
 if(room.membership_key!==context.membershipKey)throw new DomainError('Состав участников изменился. Откройте актуальный чат.',409);
 const blocked=!!await one(s.db,'SELECT room_id FROM discussion_blocks WHERE room_id=?',room.id);
 const allowed=appCallAllowed(await discussionSubject(s,context),blocked);if(!allowed.ok)throw new DomainError(allowed.note,409);
 const other=(context.members as Row[]).find(m=>!(m.id===s.userId&&m.role===role));if(!other)throw new DomainError('Собеседника нет.',409);
 const t=epoch();
 for(const old of await rows(s.db,`SELECT * FROM chat_calls WHERE room_id=? AND status IN ('ringing','active')`,room.id)){
  const c=await settle(s.db,old,t),side=sideOf(c,s,role);
  if(LIVE.includes(c.status)&&side)return {call:await view(s,c,side)};// the same call, already going on
 }
 const id=uuid();
 await q(s.db,`INSERT INTO chat_calls(id,room_id,caller_id,caller_role,callee_id,callee_role,status,caller_seen,created_at) SELECT ?,?,?,?,?,?,'ringing',?,? WHERE NOT EXISTS(SELECT 1 FROM chat_calls WHERE room_id=? AND status IN ('ringing','active'))`,id,room.id,s.userId,role,other.id,other.role,t,t,room.id).run();
 const c=await one(s.db,'SELECT * FROM chat_calls WHERE id=?',id);if(!c)throw new DomainError('В этом чате уже идёт звонок.',409);
 return {call:await view(s,c,'caller')};
}
// Asked every few seconds while the app is open: a call that rings for this person in any of their roles.
export async function incomingCall(s:RentalService){
 const t=epoch();
 for(const old of await rows(s.db,`SELECT * FROM chat_calls WHERE callee_id=? AND status='ringing' ORDER BY created_at DESC LIMIT 3`,s.userId)){
  const c=await settle(s.db,old,t);if(c.status==='ringing')return {call:await view(s,c,'callee')};
 }
 return {call:null};
}
// Asked every 1.5 seconds during the call; audio:true says this side hears the other one (its voice is connected).
export async function callState(s:RentalService,role:Role,body:Row){
 const {c,side}=await mine(s,role,body);if(!LIVE.includes(c.status))return {call:await view(s,c,side)};
 const t=epoch();await q(s.db,`UPDATE chat_calls SET ${side}_seen=?,${side}_audio=CASE WHEN ?=1 AND status='active' AND ${side}_audio=0 THEN ? ELSE ${side}_audio END WHERE id=?`,t,body.audio===true?1:0,t,c.id).run();
 return {call:await view(s,(await one(s.db,'SELECT * FROM chat_calls WHERE id=?',c.id))!,side)};
}
export async function answerCall(s:RentalService,role:Role,body:Row){
 const {c,side}=await mine(s,role,body);if(side!=='callee')throw new DomainError('Ответить может только тот, кому звонят.',403);
 const t=epoch(),r=await q(s.db,`UPDATE chat_calls SET status='active',answered_at=?,callee_seen=?,caller_seen=MAX(caller_seen,?) WHERE id=? AND status='ringing'`,t,t,t,c.id).run();
 if(!r.meta.changes)throw new DomainError(c.status==='active'?'Звонок уже принят.':c.end_reason&&c.end_reason!==NO_AUDIO?c.end_reason:'Звонок уже закончился.',409);
 return {call:await view(s,(await one(s.db,'SELECT * FROM chat_calls WHERE id=?',c.id))!,side)};
}
export async function endCall(s:RentalService,role:Role,body:Row){
 const {c,side}=await mine(s,role,body);
 const status=c.status==='active'?'ended':side==='callee'?'declined':'cancelled';
 const done=LIVE.includes(c.status)?await finish(s.db,c,status):c;
 return {call:await view(s,done,side)};
}
// Publishes this side's microphone: a new Realtime session with the app's SDP offer; returns the SFU answer.
export async function publishCall(s:RentalService,role:Role,body:Row,config:Config={}){
 ready(config);const {c,side}=await mine(s,role,body);
 if(!(c.status==='active'||(c.status==='ringing'&&side==='caller')))throw new DomainError('Звонок уже закончился.',409);
 const mid=required(body.mid,'Звонок',16),sdp=sdpInput(body.sdp);
 const session=await sfu(config,'sessions/new','POST');if(typeof session.sessionId!=='string')throw new DomainError('Звонок не соединился. Попробуйте ещё раз.',502);
 const pushed=await sfu(config,`sessions/${session.sessionId}/tracks/new`,'POST',{sessionDescription:{type:'offer',sdp},tracks:[{location:'local',mid,trackName:'voice'}]});
 await q(s.db,`UPDATE chat_calls SET ${side}_session=?,${side}_seen=? WHERE id=?`,session.sessionId,epoch(),c.id).run();
 return {sdp:pushed.sessionDescription?.sdp,type:pushed.sessionDescription?.type||'answer'};
}
// Receives the other side's «voice» on this side's session; the SFU sends an offer the app answers in renegotiate.
export async function subscribeCall(s:RentalService,role:Role,body:Row,config:Config={}){
 ready(config);const {c,side}=await mine(s,role,body),other=side==='caller'?'callee':'caller';
 if(c.status!=='active'||!c[side+'_session']||!c[other+'_session'])throw new DomainError('Собеседник ещё подключается.',409);
 const pulled=await sfu(config,`sessions/${c[side+'_session']}/tracks/new`,'POST',{tracks:[{location:'remote',sessionId:c[other+'_session'],trackName:'voice'}]});
 return {sdp:pulled.sessionDescription?.sdp||null,type:pulled.sessionDescription?.type||'offer',renegotiate:!!pulled.requiresImmediateRenegotiation};
}
export async function renegotiateCall(s:RentalService,role:Role,body:Row,config:Config={}){
 ready(config);const {c,side}=await mine(s,role,body);
 if(c.status!=='active'||!c[side+'_session'])throw new DomainError('Звонок уже закончился.',409);
 await sfu(config,`sessions/${c[side+'_session']}/renegotiate`,'PUT',{sessionDescription:{type:'answer',sdp:sdpInput(body.sdp)}});
 return {ok:true};
}
