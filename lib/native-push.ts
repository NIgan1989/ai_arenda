import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,hash,type OperationConfig,type Row} from './operation-core';
import {encryptInstructions,decryptInstructions} from './participant-security';
import {quietNow} from './administrator';
import {silentNotice} from './notice-feed';
import {staleAction,urgentNotice} from './notice-stale';
import {defaultAssistantSettings} from './assistant';
import {pushTarget} from './web-push';
import {plainNotice} from './delivery';
import {isLang,tIn,type Lang} from './i18n';

// Push to the phone app (audit «Доставка срочных уведомлений», point 4). The app gives its Expo push token; the
// server keeps it encrypted, bound to the app's signed-in session and role, and sends through the Expo push service.
// Expo hands the message to Firebase (Android) and Apple (iPhone): what is left is to put their keys into EAS.
// The same rules as the browser push (lib/web-push.ts): silent and stale notices are not sent, quiet hours wait
// unless the notice is urgent and the person allowed it, and the tap opens the card the notice is about.
export const EXPO_PUSH_URL='https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL='https://exp.host/--/api/v2/push/getReceipts';
export function nativePushConfigured(config:OperationConfig){return !!config.ACCESS_ENCRYPTION_KEY;}
const tokenPattern=/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;
const checkToken=(value:unknown)=>{const token=String(value||'');if(!tokenPattern.test(token))throw new DomainError('Неверный токен уведомлений устройства.');return token;};
export function validateNativeToken(input:Row){
 const token=checkToken(input?.token),platform=input?.platform;
 if(platform!=='ios'&&platform!=='android')throw new DomainError('Уведомления в приложении работают на Android и iPhone.');
 return {token,platform:platform as 'ios'|'android'};
}
const liveSession='SELECT 1 FROM auth_mobile_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.expires_at>?';
async function activeSession(service:RentalService,sessionHash:string){
 if(!sessionHash||!await one(service.db,liveSession,sessionHash,service.userId,epoch()))throw new DomainError('Войдите заново для настройки уведомлений.',401);
}
export async function nativePushState(service:RentalService,role:Role,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 const device=await one(service.db,'SELECT platform FROM native_push_devices WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role);
 return {configured:nativePushConfigured(config),enabled:!!device};
}
export async function manageNativePush(service:RentalService,role:Role,body:Row,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 if(body.action==='remove'){
  await q(service.db,'DELETE FROM native_push_devices WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role).run();return {message:'Уведомления для этой роли отключены на телефоне.'};
 }
 if(!nativePushConfigured(config))throw new DomainError('Push-уведомления ещё не настроены на сервере.',503);
 if(body.action==='register'){
  const device=validateNativeToken(body),tokenHash=await hash(device.token),existing=await one(service.db,'SELECT user_id,session_hash FROM native_push_devices WHERE token_hash=? AND role=?',tokenHash,role);
  // The same phone, signed in to another account: the token moves to the account that is signed in now.
  if(existing&&existing.user_id!==service.userId)await q(service.db,'DELETE FROM native_push_devices WHERE token_hash=? AND role=? AND user_id<>?',tokenHash,role,service.userId).run();
  const count=await one(service.db,'SELECT COUNT(*) n FROM native_push_devices WHERE user_id=?',service.userId);if(count&&count.n>=12&&!existing)throw new DomainError('Отключите уведомления на одном из других устройств.',409);
  const ciphertext=await encryptInstructions(JSON.stringify({token:device.token}),config),at=epoch();
  // INSERT SELECT closes the race with sign-out while the token was being encrypted.
  await service.db.batch([
   q(service.db,'DELETE FROM native_push_devices WHERE user_id=? AND session_hash=? AND role=? AND token_hash<>?',service.userId,sessionHash,role,tokenHash),
   q(service.db,`INSERT INTO native_push_devices(id,user_id,session_hash,role,platform,token_hash,ciphertext,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(${liveSession}) ON CONFLICT(token_hash,role) DO UPDATE SET session_hash=excluded.session_hash,platform=excluded.platform,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at WHERE native_push_devices.user_id=excluded.user_id`,uuid(),service.userId,sessionHash,role,device.platform,tokenHash,ciphertext,at,at,sessionHash,service.userId,at)
  ]);
  await activeSession(service,sessionHash);return {message:'Уведомления для этой роли включены на телефоне.'};
 }
 if(body.action==='test'){
  const at=epoch(),id=uuid();
  const result=await service.db.batch([
   q(service.db,'UPDATE native_push_devices SET last_test_at=? WHERE user_id=? AND session_hash=? AND role=? AND last_test_at<?',at,service.userId,sessionHash,role,at-60),
   q(service.db,"INSERT INTO native_push_deliveries(id,device_id,available_at,created_at) SELECT ?,id,?,? FROM native_push_devices WHERE user_id=? AND session_hash=? AND role=? AND changes()>0",id,at,at,service.userId,sessionHash,role)
  ]);
  if(!result[1].meta.changes)throw new DomainError('Включите уведомления. Повторная проверка доступна через минуту.',429);
  return {message:'Проверка отправлена. Обычно уведомление приходит за минуту.'};
 }
 throw new DomainError('Неизвестное действие.');
}
const langOf=(item:Row):Lang=>isLang(item.lang)?item.lang:'ru';
const ROLE_TITLES:Record<string,string>={guest:'Для гостя',owner:'Для владельца',cleaner:'Для исполнителя'};
const clip=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
// The message as Expo takes it. On the lock screen it says what happened in the person's language, with words a
// participant wrote (a chat message, a reason) left in the app, the same as Telegram (lib/delivery.ts).
export function nativeMessage(item:Row,token:string,target:{url:string;title:string}|null,urgent:boolean,test=false):Row{
 const l=langOf(item),role=String(item.role);
 if(test)return {to:token,title:'AiQonaq',body:tIn(l,'Уведомления на этом телефоне работают.'),data:{url:'/workspace/'+role+'/map',role},sound:'default',priority:'default',channelId:'default',ttl:300};
 const ru=target?.title||'AiQonaq · '+(ROLE_TITLES[role]||'событие');
 const title=ru.split(' · ').map((part,i)=>i===0||ru.startsWith('AiQonaq ·')?tIn(l,part):part).join(' · ');
 const url=target?.url||'/workspace/'+role+'/map';
 return {to:token,title:clip(title,120),body:clip(plainNotice(item),300),data:{url,role,notice:String(item.notification_id||'')},sound:'default',priority:urgent?'high':'default',channelId:urgent?'urgent':'default',ttl:urgent?900:3600,...(urgent?{interruptionLevel:'time-sensitive'}:{})};
}
const settle=(db:D1Database,id:string,token:string,status:string,error:string,later=0)=>q(db,`UPDATE native_push_deliveries SET status=?,available_at=CASE WHEN ?>0 THEN ? ELSE available_at END,lease_until=0,last_error=? WHERE id=? AND lease_token=?`,status,later,later,error,id,token).run();
export async function deliverNativePush(db:D1Database,config:OperationConfig,limit=12,transport:typeof fetch=fetch){
 if(!nativePushConfigured(config))return {configured:false,sent:0,failed:0};
 const now=epoch();
 // A signed-out or expired app session cannot keep its token, even when nothing is due.
 await q(db,'DELETE FROM native_push_devices WHERE NOT EXISTS(SELECT 1 FROM auth_mobile_sessions a JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE a.hash=native_push_devices.session_hash AND a.user_id=native_push_devices.user_id AND a.expires_at>?)',now).run();
 await q(db,"DELETE FROM native_push_deliveries WHERE status='sent' AND sent_at<?",now-7*86400).run();
 const headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json',...(config.EXPO_ACCESS_TOKEN?{Authorization:'Bearer '+config.EXPO_ACCESS_TOKEN}:{})};
 await checkReceipts(db,headers,transport).catch(()=>undefined);
 const due=await rows(db,`SELECT d.*,n.dedupe,n.body,v.ciphertext,v.user_id,v.role,p.settings,ul.lang FROM native_push_deliveries d JOIN native_push_devices v ON v.id=d.device_id LEFT JOIN notifications n ON n.id=d.notification_id LEFT JOIN assistant_preferences p ON p.user_id=v.user_id AND p.role=v.role LEFT JOIN user_language ul ON ul.user_id=v.user_id WHERE (d.status='pending' AND d.available_at<=?) OR (d.status='sending' AND d.lease_until<=?) ORDER BY d.created_at LIMIT ?`,now,now,Math.min(30,Math.max(1,limit)));
 let sent=0,failed=0;const deadline=Date.now()+19000;
 const drop=(id:string,why:string)=>q(db,"UPDATE native_push_deliveries SET status='dead',last_error=?,lease_until=0 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<=?))",why,id,epoch()).run();
 for(const item of due){if(Date.now()>deadline)break;
  if(item.notification_id&&silentNotice(item.dedupe,item.body)){await drop(item.id,'silent');continue;}
  if(item.notification_id&&await staleAction(db,item.dedupe,epoch(),item.body)){await drop(item.id,'stale');continue;}
  let settings=defaultAssistantSettings;try{settings={...settings,...JSON.parse(item.settings||'{}')};}catch{/* defaults */}
  const urgent=!!item.notification_id&&urgentNotice(item.dedupe,item.body);
  if(item.notification_id&&quietNow(settings,epoch())&&!(settings.urgentInQuiet&&urgent)){await q(db,"UPDATE native_push_deliveries SET available_at=?,status='pending',lease_until=0 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<=?))",epoch()+300,item.id,epoch()).run();continue;}
  const token=uuid(),claim=await q(db,"UPDATE native_push_deliveries SET status='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='sending' AND lease_until<=?)) RETURNING attempts",token,epoch()+90,item.id,epoch(),epoch()).first<Row>();if(!claim)continue;
  try{
   const device={token:checkToken(JSON.parse(await decryptInstructions(item.ciphertext,config)).token)};
   // Ownership, role and session are checked again right before the message leaves.
   if(!await one(db,'SELECT 1 FROM native_push_devices v JOIN profiles p ON p.id=v.user_id JOIN auth_mobile_sessions a ON a.hash=v.session_hash AND a.user_id=v.user_id JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE v.id=? AND v.ciphertext=? AND a.expires_at>? AND EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value=v.role)',item.device_id,item.ciphertext,epoch())){await q(db,'DELETE FROM native_push_devices WHERE id=? AND ciphertext=?',item.device_id,item.ciphertext).run();continue;}
   const target=item.notification_id?await pushTarget(db,item.user_id,item.role,String(item.dedupe||'')).catch(()=>null):null;
   const response=await transport(EXPO_PUSH_URL,{method:'POST',headers,body:JSON.stringify([nativeMessage(item,device.token,target,urgent,!item.notification_id)]),redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(response.status===429||response.status>=500){await response.body?.cancel();throw new Error(response.status===429?'rate_limit':'provider_unavailable');}
   const answer=await response.json().catch(()=>null) as Row|null,ticket=Array.isArray(answer?.data)?answer!.data[0]:answer?.data;
   if(!response.ok||!ticket)throw new Error('provider_rejected');
   if(ticket.status==='ok'){await q(db,"UPDATE native_push_deliveries SET status='sent',sent_at=?,lease_until=0,last_error='',ticket=? WHERE id=? AND lease_token=?",epoch(),String(ticket.id||'').slice(0,100),item.id,token).run();sent++;continue;}
   const why=String(ticket.details?.error||'');
   if(why==='DeviceNotRegistered'){await q(db,'DELETE FROM native_push_devices WHERE id=?',item.device_id).run();continue;}
   throw new Error(why==='MessageRateExceeded'?'rate_limit':why==='InvalidCredentials'?'credentials_missing':'provider_rejected');
  }catch(error){
   const code=['rate_limit','provider_unavailable','provider_rejected','credentials_missing'].includes((error as Error).message)?(error as Error).message:'push_failed';
   // Without the Firebase or Apple key in EAS a message cannot go anywhere: it is not retried.
   await settle(db,item.id,token,claim.attempts>=5||code==='provider_rejected'||code==='credentials_missing'?'dead':'pending',code,epoch()+Math.min(3600,30*2**Math.min(claim.attempts,6)));failed++;
  }
 }
 return {configured:true,sent,failed};
}
// Expo answers at once with a ticket; whether Apple or Firebase took the message comes later as a receipt.
// A phone where the app was removed answers DeviceNotRegistered there: its token is forgotten.
async function checkReceipts(db:D1Database,headers:Record<string,string>,transport:typeof fetch){
 const now=epoch(),sent=await rows(db,"SELECT id,device_id,ticket FROM native_push_deliveries WHERE status='sent' AND ticket<>'' AND sent_at<=? AND sent_at>? ORDER BY sent_at LIMIT 100",now-900,now-86400);
 if(!sent.length)return;
 const response=await transport(EXPO_RECEIPTS_URL,{method:'POST',headers,body:JSON.stringify({ids:sent.map(r=>r.ticket)}),redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();return;}
 const receipts=((await response.json().catch(()=>null)) as Row|null)?.data||{};
 for(const row of sent){
  const receipt=receipts[row.ticket];
  if(receipt?.status==='error'){
   const why=String(receipt.details?.error||'provider_rejected');
   if(why==='DeviceNotRegistered')await q(db,'DELETE FROM native_push_devices WHERE id=?',row.device_id).run();
   else await q(db,"UPDATE native_push_deliveries SET last_error=?,ticket='' WHERE id=?",why==='InvalidCredentials'?'credentials_missing':why.slice(0,60),row.id).run();
  }else if(receipt)await q(db,"UPDATE native_push_deliveries SET ticket='' WHERE id=?",row.id).run();
 }
}
