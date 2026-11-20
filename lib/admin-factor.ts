import {DomainError} from './domain';
import {isPlatformAdmin} from './account';
import {digest} from './native-auth';
import {epoch,uuid,q,one,type Row} from './operation-core';

// The platform administrator's second factor. A password alone does not open the management of the service:
// each sign-in session also needs a six-digit code that goes to the administrator's own Telegram chat with the bot.
// A confirmed session manages the service for ADMIN_SESSION; then the code is asked again. Every confirmed
// entrance and every series of wrong codes reaches the administrator in Telegram.
//
// The code never goes into `notifications` (the app shows that list), only straight to Telegram. On the test stand
// (TEST_DATA_ONLY=1) it is also returned in the answer, because the stand has no Telegram. ADMIN_SECOND_FACTOR=off
// in the server settings turns the factor off, for the case when the administrator lost access to Telegram.
export type AdminFactorConfig={PLATFORM_ADMIN_IDS?:string;TELEGRAM_BOT_TOKEN?:string;TEST_DATA_ONLY?:string;ADMIN_SECOND_FACTOR?:string};
export const ADMIN_SESSION=8*3600;
const CODE_LIFETIME=600,RESEND_AFTER=60,TRIES=5;
const time=(at:number)=>new Date(at*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const off=(config:AdminFactorConfig)=>String(config.ADMIN_SECOND_FACTOR||'').toLowerCase()==='off';
const codeHash=(code:string,session:string)=>digest('admin-factor:'+session+':'+code);
const sixDigits=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');

async function telegramChats(db:D1Database,userId:string){
 return (await db.prepare("SELECT DISTINCT address FROM delivery_channels WHERE user_id=? AND channel='telegram' AND enabled=1 AND verified_at IS NOT NULL").bind(userId).all<{address:string}>()).results.map(r=>r.address).filter(Boolean);
}
async function telegramSend(token:string,chat:string,text:string){
 try{const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text}),redirect:'manual',signal:AbortSignal.timeout(8000)});return r.ok;}
 catch{console.error('Administrator code Telegram send failed');return false;}
}
// A notice to the administrator: the `admin:` prefix sends it to Telegram (migration 0044, notification_outbox_admin).
const notice=(db:D1Database,user:string,body:string,tag:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,'admin:'+tag+':'+user+':'+at,at);

/** True when this session may manage the service: a platform administrator who typed the code in this session. */
export async function adminFactorPassed(db:D1Database,userId:string,session:string,config:AdminFactorConfig){
 if(!isPlatformAdmin(userId,config.PLATFORM_ADMIN_IDS))return false;
 if(off(config))return true;
 if(!/^[a-f0-9]{64}$/.test(session))return false;
 const row=await one(db,'SELECT verified_at,expires_at FROM admin_factor WHERE session_hash=? AND user_id=?',session,userId);
 return !!row?.verified_at&&Number(row.expires_at)>epoch();
}

export async function adminFactorState(db:D1Database,userId:string,session:string,config:AdminFactorConfig){
 const admin=isPlatformAdmin(userId,config.PLATFORM_ADMIN_IDS);
 if(!admin)return {admin:false,required:false,verified:false};
 const row=/^[a-f0-9]{64}$/.test(session)?await one(db,'SELECT verified_at,expires_at,code_hash,code_sent_at FROM admin_factor WHERE session_hash=? AND user_id=?',session,userId):null,at=epoch();
 const verified=off(config)||(!!row?.verified_at&&Number(row.expires_at)>at);
 return {admin:true,required:!off(config),verified,until:verified&&row?Number(row.expires_at):null,codeSent:!!row?.code_hash&&Number(row.code_sent_at)+CODE_LIFETIME>at,telegram:(await telegramChats(db,userId)).length>0};
}

export async function adminFactorAction(db:D1Database,userId:string,session:string,body:Row,config:AdminFactorConfig){
 if(!isPlatformAdmin(userId,config.PLATFORM_ADMIN_IDS))throw new DomainError('Управление сервисом доступно только администратору платформы.',403);
 if(!/^[a-f0-9]{64}$/.test(session))throw new DomainError('Войдите заново.',401);
 const at=epoch(),action=String(body.action||'');
 if(action==='send'){
  const row=await one(db,'SELECT code_sent_at,verified_at,expires_at FROM admin_factor WHERE session_hash=?',session);
  if(row&&Number(row.code_sent_at||0)+RESEND_AFTER>at)throw new DomainError('Код уже отправлен. Новый можно запросить через минуту.',429);
  const test=config.TEST_DATA_ONLY==='1',chats=await telegramChats(db,userId);
  if(!test&&(!config.TELEGRAM_BOT_TOKEN||!chats.length))throw new DomainError('Код приходит только в Telegram. Подключите его: Аккаунт, «Telegram», и попробуйте снова.',409);
  const code=sixDigits(),hash=await codeHash(code,session);
  // A new code keeps a session that is still confirmed; it only replaces the code.
  await q(db,'INSERT INTO admin_factor(session_hash,user_id,code_hash,code_sent_at,attempts,expires_at,created_at) VALUES (?,?,?,?,0,?,?) ON CONFLICT(session_hash) DO UPDATE SET code_hash=excluded.code_hash,code_sent_at=excluded.code_sent_at,attempts=0,expires_at=MAX(admin_factor.expires_at,excluded.expires_at)',session,userId,hash,at,at+CODE_LIFETIME,at).run();
  let sent=false;
  if(config.TELEGRAM_BOT_TOKEN)for(const chat of chats)sent=await telegramSend(config.TELEGRAM_BOT_TOKEN,chat,'🔐 Код для входа в управление AiQonaq: '+code+'\nДействует 10 минут. Никому его не сообщайте. Если вы не входили, смените пароль.')||sent;
  if(!sent&&!test)throw new DomainError('Telegram не принял сообщение. Попробуйте через минуту.',502);
  return {message:sent?'Код отправлен в Telegram.':'Учебный стенд: Telegram не подключён, код показан здесь.',...(test?{testCode:code}:{})};
 }
 if(action==='verify'){
  const code=String(body.code??'').replace(/\D/g,'');
  if(code.length!==6)throw new DomainError('Введите шесть цифр кода.');
  const row=await one(db,'SELECT code_hash,code_sent_at,attempts FROM admin_factor WHERE session_hash=? AND user_id=?',session,userId);
  if(!row?.code_hash||Number(row.code_sent_at)+CODE_LIFETIME<=at)throw new DomainError('Код устарел. Запросите новый.',410);
  if(row.code_hash!==await codeHash(code,session)){
   const r=await one(db,'UPDATE admin_factor SET attempts=attempts+1,code_hash=CASE WHEN attempts+1>=? THEN NULL ELSE code_hash END WHERE session_hash=? RETURNING attempts',TRIES,session);
   if(Number(r?.attempts)>=TRIES){await notice(db,userId,`Пять неверных кодов входа в управление сервисом, ${time(at)}. Если это были не вы, смените пароль и завершите сеансы в «Безопасности».`,'factor-failed',at).run();throw new DomainError('Слишком много неверных кодов. Запросите новый.',429);}
   throw new DomainError('Код не подходит.',403);
  }
  const until=at+ADMIN_SESSION;
  await db.batch([
   q(db,'UPDATE admin_factor SET code_hash=NULL,attempts=0,verified_at=?,expires_at=? WHERE session_hash=?',at,until,session),
   q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),userId,'admin-factor:'+userId,JSON.stringify({action:'admin.factor_verified',until}),at),
   notice(db,userId,`Вход в управление сервисом подтверждён, ${time(at)}. Если это были не вы, смените пароль и завершите сеансы в «Безопасности».`,'factor-ok',at),
  ]);
  return {message:'Вход подтверждён до '+time(until)+'.',verified:true,until};
 }
 if(action==='leave'){await q(db,'DELETE FROM admin_factor WHERE session_hash=?',session).run();return {message:'Управление закрыто.',verified:false};}
 throw new DomainError('Неизвестное действие.');
}

export async function sweepAdminFactor(db:D1Database,at=epoch()){await q(db,'DELETE FROM admin_factor WHERE expires_at<=?',at).run();}
