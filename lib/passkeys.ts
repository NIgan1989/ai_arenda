import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse} from '@simplewebauthn/server';
import {DomainError} from './domain';
import {boundedRequestText} from './request-body';
import {SESSION_LIFETIME,digest,limit,openMobileSession,requestSessionIdentity,verifyPassword} from './native-auth';
import {androidCertificates} from './app-links';

// Sign-in with Face ID or a fingerprint in the phone app (passkeys, WebAuthn). The phone keeps the private key in iCloud
// Keychain or Google Password Manager and asks for the face or the finger before it signs; the server keeps only the
// public key (table auth_passkeys) and checks each signature. Nothing to remember and nothing to steal from the server.
// The phone binds every key to one domain, PASSKEY_RP_ID; the app proves it belongs to that domain with the files
// /.well-known/apple-app-site-association and /.well-known/assetlinks.json (lib/app-links.ts).
export type PasskeyConfig={PASSKEY_RP_ID?:string;PASSKEY_ORIGINS?:string;ANDROID_CERT_SHA256?:string};
// The address the phone app talks to (mobile/eas.json, EXPO_PUBLIC_API_URL). A key made for it works only there, so a
// future domain of the service gets its own keys: people turn Face ID on again once.
export const PASSKEY_RP_ID='ai-arenda.ai-arenda-kz.workers.dev';
const CHALLENGE_LIFETIME=300,FRESH_SIGN_IN=900,MAX_KEYS=10;
const now=()=>Math.floor(Date.now()/1000);
const encoder=new TextEncoder();
const base64url=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromBase64url=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const query=(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);

// Who may ask for a signature: the app on iPhone signs as https://<domain>, the app on Android as the hash of its signing
// certificate. PASSKEY_ORIGINS adds a web page for the test stand only.
export function passkeySetup(config:PasskeyConfig={}){
 const rpID=(config.PASSKEY_RP_ID||PASSKEY_RP_ID).trim();
 const android=androidCertificates(config).map(fp=>'android:apk-key-hash:'+base64url(Uint8Array.from(fp.split(':'),h=>parseInt(h,16))));
 return {rpID,origins:['https://'+rpID,...android,...(config.PASSKEY_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean)]};
}

type Stored={id:string;user_id:string;public_key:string;counter:number;transports:string};
type Account={id:string;name:string;phone:string;password_hash:string;credential_version:number;expires_at:number;hash:string};
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function credentialResponse(value:unknown){
 const r=value as {id?:unknown;rawId?:unknown;type?:unknown;response?:unknown}|null;
 if(!r||typeof r!=='object'||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{16,1023}$/.test(r.id)||r.type!=='public-key'||!r.response||typeof r.response!=='object')throw new DomainError('Телефон прислал неполный ответ. Попробуйте ещё раз.');
 return value as any;
}
async function challengeFor(db:D1Database,purpose:'login'|'register',id:unknown,userId:string|null=null){
 const row=typeof id==='string'&&id.length<=64?await query(db,'DELETE FROM auth_passkey_challenges WHERE id=? AND purpose=? AND expires_at>? RETURNING challenge,user_id',id,purpose,now()).first<{challenge:string;user_id:string|null}>():null;
 if(!row||(row.user_id??null)!==userId)throw new DomainError('Время ответа вышло. Попробуйте ещё раз.',409);
 return row.challenge;
}
async function saveChallenge(db:D1Database,purpose:'login'|'register',challenge:string,userId:string|null=null){
 const id=crypto.randomUUID();
 await query(db,'INSERT INTO auth_passkey_challenges(id,user_id,purpose,challenge,expires_at) VALUES (?,?,?,?,?)',id,userId,purpose,challenge,now()+CHALLENGE_LIFETIME).run();
 return id;
}
async function keysOf(db:D1Database,userId:string){
 const rows=await query(db,'SELECT id,device,backed_up,created_at,last_used_at,transports FROM auth_passkeys WHERE user_id=? ORDER BY created_at DESC',userId).all<{id:string;device:string;backed_up:number;created_at:number;last_used_at:number;transports:string}>();
 return (rows.results||[]).map(r=>({id:r.id,device:r.device,synced:!!r.backed_up,createdAt:r.created_at,lastUsedAt:r.last_used_at,transports:r.transports}));
}
async function signedIn(db:D1Database,request:Request){
 const identity=await requestSessionIdentity(request);
 if(!identity||identity.kind!=='mobile')return null;
 return await query(db,'SELECT a.id,a.name,a.phone,a.password_hash,a.credential_version,s.expires_at,s.hash FROM auth_mobile_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.expires_at>?',identity.hash,now()).first<Account>();
}

export async function passkeyRequest(db:D1Database,request:Request,action:string,config:PasskeyConfig={}){
 if(request.method!=='POST')return reply({error:'Используйте POST.'},405);
 // The phone app sends no Origin; a web page of another site never gets here.
 const origin=request.headers.get('origin');
 if((!!origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new DomainError('Источник запроса не разрешён.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Ожидается JSON.',415);
 let body:any;
 try{body=JSON.parse(await boundedRequestText(request,16384)||'{}');}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('Некорректный запрос.');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DomainError('Некорректный запрос.');
 await limit(db,'passkey:ip:'+await digest(request.headers.get('cf-connecting-ip')||'local'),60);
 await query(db,'DELETE FROM auth_passkey_challenges WHERE expires_at<=?',now()).run();
 const {rpID,origins}=passkeySetup(config);

 if(action==='passkey-login-options'){
  // No number is asked: the phone itself offers the keys it holds for this domain.
  const options=await generateAuthenticationOptions({rpID,userVerification:'required',timeout:120000});
  return reply({challengeId:await saveChallenge(db,'login',options.challenge),options});
 }
 if(action==='passkey-login'){
  const expectedChallenge=await challengeFor(db,'login',body.challengeId),response=credentialResponse(body.response);
  const stored=await query(db,'SELECT p.id,p.user_id,p.public_key,p.counter,p.transports,a.name,a.phone,a.credential_version FROM auth_passkeys p JOIN auth_accounts a ON a.id=p.user_id WHERE p.id=?',response.id).first<Stored&{name:string;phone:string;credential_version:number}>();
  // A key the server no longer knows (turned off, or removed by a password reset): the app forgets it and asks for the password.
  if(!stored)throw new DomainError('Этот вход без пароля выключен. Войдите по паролю.',404);
  const handle=response.response?.userHandle;
  if(handle&&handle!==base64url(encoder.encode(stored.user_id)))throw new DomainError('Не удалось войти без пароля. Войдите по паролю.',401);
  let verified=false,counter=stored.counter;
  try{
   const result=await verifyAuthenticationResponse({response,expectedChallenge,expectedOrigin:origins,expectedRPID:rpID,requireUserVerification:true,credential:{id:stored.id,publicKey:fromBase64url(stored.public_key),counter:stored.counter,transports:(stored.transports?stored.transports.split(','):[]) as any}});
   verified=result.verified;counter=result.authenticationInfo.newCounter;
  }catch{verified=false;}
  if(!verified)throw new DomainError('Не удалось войти без пароля. Войдите по паролю.',401);
  // The counter moves only forward; two sign-ins with one signature cannot both pass.
  const used=await query(db,'UPDATE auth_passkeys SET counter=?,last_used_at=? WHERE id=? AND counter=?',counter,now(),stored.id,stored.counter).run();
  if(used.meta.changes!==1)throw new DomainError('Не удалось войти без пароля. Попробуйте ещё раз.',409);
  const token=await openMobileSession(db,{id:stored.user_id,name:stored.name,phone:stored.phone,credential_version:stored.credential_version});
  return reply({message:'Вы вошли.',token,user:{id:stored.user_id,name:stored.name,phone:stored.phone}});
 }

 const account=await signedIn(db,request);
 if(!account)throw new DomainError('Войдите, чтобы настроить вход без пароля.',401);
 if(action==='passkey-list')return reply({passkeys:await keysOf(db,account.id)});
 if(action==='passkey-remove'){
  if(typeof body.id!=='string'||body.id.length>1023)throw new DomainError('Некорректный запрос.');
  await query(db,'DELETE FROM auth_passkeys WHERE id=? AND user_id=?',body.id,account.id).run();
  return reply({message:'Вход без пароля выключен.',passkeys:await keysOf(db,account.id)});
 }
 if(action==='passkey-register-options'){
  // A key opens the account long after this session ends, so it is added right after a sign-in or with the password.
  if(account.expires_at-SESSION_LIFETIME<now()-FRESH_SIGN_IN){
   if(typeof body.password!=='string'||!body.password)throw new DomainError('Введите пароль, чтобы включить вход без пароля.',403);
   await limit(db,'passkey-password:'+account.id,10);
   if(body.password.length>128||!await verifyPassword(body.password,account.password_hash))throw new DomainError('Пароль не подходит.',401);
  }
  const keys=await keysOf(db,account.id);
  if(keys.length>=MAX_KEYS)throw new DomainError('Уже включено на десяти устройствах. Выключите одно в «Вход и устройства».',409);
  const options=await generateRegistrationOptions({rpName:'AiQonaq',rpID,userName:account.phone,userDisplayName:account.name,userID:encoder.encode(account.id),attestationType:'none',timeout:120000,
   excludeCredentials:keys.map(k=>({id:k.id,transports:k.transports?k.transports.split(','):undefined})),
   authenticatorSelection:{residentKey:'required',requireResidentKey:true,userVerification:'required'},preferredAuthenticatorType:'localDevice'});
  return reply({challengeId:await saveChallenge(db,'register',options.challenge,account.id),options});
 }
 if(action==='passkey-register'){
  const expectedChallenge=await challengeFor(db,'register',body.challengeId,account.id),response=credentialResponse(body.response);
  let info;
  try{const result=await verifyRegistrationResponse({response,expectedChallenge,expectedOrigin:origins,expectedRPID:rpID,requireUserVerification:true});info=result.verified?result.registrationInfo:null;}catch{info=null;}
  if(!info)throw new DomainError('Телефон не подтвердил ключ. Попробуйте ещё раз.',400);
  const device=String(body.device??'').replace(/[^\p{L}\p{N} .,()-]/gu,'').trim().slice(0,60);
  // The key is kept only while this session is still the account's own: a password reset that ran meanwhile changed the
  // credential version and removed the keys, so a key checked against the old session is not added after it.
  const saved=await query(db,'INSERT INTO auth_passkeys(id,user_id,public_key,counter,transports,device,backed_up,created_at,last_used_at) SELECT ?,?,?,?,?,?,?,?,0 WHERE EXISTS(SELECT 1 FROM auth_mobile_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.credential_version=? AND s.expires_at>?) ON CONFLICT(id) DO NOTHING',info.credential.id,account.id,base64url(info.credential.publicKey),info.credential.counter,(info.credential.transports||[]).join(','),device,info.credentialBackedUp?1:0,now(),account.hash,account.id,account.credential_version,now()).run();
  if(saved.meta.changes!==1){
   if(!await signedIn(db,request))throw new DomainError('Войдите, чтобы настроить вход без пароля.',401);
   throw new DomainError('Этот ключ уже добавлен.',409);
  }
  return reply({message:'Вход без пароля включён.',passkeys:await keysOf(db,account.id)},201);
 }
 return reply({error:'Маршрут не найден.'},404);
}
