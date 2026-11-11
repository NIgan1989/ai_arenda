import {generateRequestDetails} from 'web-push';
import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,hash,type OperationConfig,type Row} from './operation-core';
import {encryptInstructions,decryptInstructions} from './participant-security';
import {quietNow} from './administrator';
import {defaultAssistantSettings} from './assistant';

export function pushConfigured(config:OperationConfig){return !!(config.VAPID_PUBLIC_KEY&&config.VAPID_PRIVATE_KEY&&config.VAPID_SUBJECT&&config.ACCESS_ENCRYPTION_KEY);}
export function validatePushSubscription(input:Row){
 let url:URL;try{url=new URL(input?.endpoint);}catch{throw new DomainError('Неверный адрес push-подписки.');}
 const host=url.hostname,allowed=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.href.length>2048||!allowed)throw new DomainError('Сервис push-доставки не поддерживается.');
 const keys=input.keys||{},valid=(s:unknown,size:number)=>typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&Buffer.from(s,'base64url').length===size;
 if(!valid(keys.p256dh,65)||Buffer.from(keys.p256dh,'base64url')[0]!==4||!valid(keys.auth,16))throw new DomainError('Неверные ключи push-подписки.');
 return {endpoint:url.href,keys:{p256dh:keys.p256dh as string,auth:keys.auth as string}};
}
async function activeSession(service:RentalService,sessionHash:string){
 if(!sessionHash||!await one(service.db,'SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.expires_at>?',sessionHash,service.userId,epoch()))throw new DomainError('Войдите заново для настройки уведомлений.',401);
}
export async function webPushState(service:RentalService,role:Role,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 const subscription=await one(service.db,'SELECT id FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role);
 return {configured:pushConfigured(config),publicKey:config.VAPID_PUBLIC_KEY||'',enabled:!!subscription};
}
export async function manageWebPush(service:RentalService,role:Role,body:Row,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 if(body.action==='remove'){
  await q(service.db,'DELETE FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role).run();return {message:'Уведомления этого кабинета отключены на устройстве.'};
 }
 if(!pushConfigured(config))throw new DomainError('Push-уведомления ещё не настроены на сервере.',503);
 if(body.action==='subscribe'){
  const subscription=validatePushSubscription(body.subscription),endpointHash=await hash(subscription.endpoint),existing=await one(service.db,'SELECT user_id FROM push_subscriptions WHERE endpoint_hash=? AND role=?',endpointHash,role);
  if(existing&&existing.user_id!==service.userId)throw new DomainError('Пересоздайте подписку в настройках браузера.',409);
  const count=await one(service.db,'SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?',service.userId);if(count&&count.n>=12&&!existing)throw new DomainError('Отключите уведомления на одном из других устройств.',409);
  const ciphertext=await encryptInstructions(JSON.stringify(subscription),config),at=epoch();
  // INSERT SELECT closes the logout/recovery race while encryption was in progress.
  await service.db.batch([
   q(service.db,'DELETE FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role),
   q(service.db,`INSERT INTO push_subscriptions(id,user_id,session_hash,role,endpoint_hash,ciphertext,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.expires_at>?) ON CONFLICT(endpoint_hash,role) DO UPDATE SET session_hash=excluded.session_hash,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at WHERE push_subscriptions.user_id=excluded.user_id`,uuid(),service.userId,sessionHash,role,endpointHash,ciphertext,at,at,sessionHash,service.userId,at)
  ]);
  await activeSession(service,sessionHash);return {message:'Уведомления включены для этого кабинета на устройстве.'};
 }
 if(body.action==='test'){
  const at=epoch(),id=uuid();
  const result=await service.db.batch([
   q(service.db,'UPDATE push_subscriptions SET last_test_at=? WHERE user_id=? AND session_hash=? AND role=? AND last_test_at<?',at,service.userId,sessionHash,role,at-60),
   q(service.db,"INSERT INTO push_deliveries(id,subscription_id,available_at,created_at) SELECT ?,id,?,? FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=? AND changes()>0",id,at,at,service.userId,sessionHash,role)
  ]);
  if(!result[1].meta.changes)throw new DomainError('Включите уведомления. Повторная проверка доступна через минуту.',429);
  return {message:'Проверка поставлена в очередь. Обычно доставка занимает до минуты; браузер должен разрешать уведомления.'};
 }
 throw new DomainError('Неизвестное действие.');
}
export function pushPayload(role:Role,test=false){return JSON.stringify({title:'AI Аренда',body:test?'Уведомления на этом устройстве работают.':'В вашем кабинете есть новое событие. Откройте приложение, чтобы узнать подробности.',url:'/workspace/'+role+'/assistant'});}
export async function deliverWebPush(db:D1Database,config:OperationConfig,limit=12,transport:typeof fetch=fetch){
 if(!pushConfigured(config))return {configured:false,sent:0,failed:0};
 const now=epoch();
 // Expired/revoked sessions cannot retain an endpoint, even if no deliveries are due.
 await q(db,'DELETE FROM push_subscriptions WHERE NOT EXISTS(SELECT 1 FROM auth_sessions a JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE a.hash=push_subscriptions.session_hash AND a.user_id=push_subscriptions.user_id AND a.expires_at>?)',now).run();
 await q(db,"DELETE FROM push_deliveries WHERE status='sent' AND sent_at<?",now-7*86400).run();
 const due=await rows(db,`SELECT d.*,s.ciphertext,s.user_id,s.role,s.session_hash,p.settings FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id LEFT JOIN assistant_preferences p ON p.user_id=s.user_id AND p.role=s.role WHERE (d.status='pending' AND d.available_at<=?) OR (d.status='sending' AND d.lease_until<=?) ORDER BY d.created_at LIMIT ?`,now,now,Math.min(30,Math.max(1,limit)));
 let sent=0,failed=0;
 for(const item of due){
  let settings=defaultAssistantSettings;try{settings={...settings,...JSON.parse(item.settings||'{}')};}catch{}
  if(item.notification_id&&quietNow(settings,epoch())){await q(db,"UPDATE push_deliveries SET available_at=?,status='pending',lease_until=0 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<=?))",epoch()+300,item.id,epoch()).run();continue;}
  const token=uuid(),claim=await q(db,"UPDATE push_deliveries SET status='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='sending' AND lease_until<=?)) RETURNING attempts",token,epoch()+90,item.id,epoch(),epoch()).first<Row>();if(!claim)continue;
  try{
   const sub=validatePushSubscription(JSON.parse(await decryptInstructions(item.ciphertext,config)));
   // Recheck current ownership, role and session immediately before external delivery.
   if(!await one(db,`SELECT 1 FROM push_subscriptions s JOIN profiles p ON p.id=s.user_id JOIN auth_sessions a ON a.hash=s.session_hash AND a.user_id=s.user_id JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE s.id=? AND s.ciphertext=? AND a.expires_at>? AND EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value=s.role)`,item.subscription_id,item.ciphertext,epoch())){await q(db,'DELETE FROM push_subscriptions WHERE id=? AND ciphertext=?',item.subscription_id,item.ciphertext).run();continue;}
   const request=generateRequestDetails(sub,pushPayload(item.role,!item.notification_id),{TTL:300,urgency:'normal',vapidDetails:{subject:config.VAPID_SUBJECT!,publicKey:config.VAPID_PUBLIC_KEY!,privateKey:config.VAPID_PRIVATE_KEY!}});
   const response=await transport(request.endpoint,{method:'POST',headers:request.headers as Record<string,string>,body:new Uint8Array(request.body!) as BodyInit,redirect:'error',signal:AbortSignal.timeout(10000)});
   await response.body?.cancel();
   if(response.status===404||response.status===410){await q(db,'DELETE FROM push_subscriptions WHERE id=?',item.subscription_id).run();continue;}
   if(!response.ok){const error=new Error(response.status===429?'rate_limit':response.status>=500?'provider_unavailable':'provider_rejected');throw error;}
   await q(db,"UPDATE push_deliveries SET status='sent',sent_at=?,lease_until=0,last_error='' WHERE id=? AND lease_token=?",epoch(),item.id,token).run();sent++;
  }catch(error){const code=['rate_limit','provider_unavailable','provider_rejected'].includes((error as Error).message)?(error as Error).message:'push_failed';await q(db,"UPDATE push_deliveries SET status=?,available_at=?,lease_until=0,last_error=? WHERE id=? AND lease_token=?",claim.attempts>=5||code==='provider_rejected'?'dead':'pending',epoch()+Math.min(3600,30*2**Math.min(claim.attempts,6)),code,item.id,token).run();failed++;}
 }
 return {configured:true,sent,failed};
}
