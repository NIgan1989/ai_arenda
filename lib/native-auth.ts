import {DomainError} from './domain';
import {boundedRequestText} from './request-body';

export const sessionCookie='arenda_session';
const lifetime=30*86400;
const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=(size=32)=>hex(crypto.getRandomValues(new Uint8Array(size)));
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const now=()=>Math.floor(Date.now()/1000);

export function normalizePhone(value:unknown){
 const raw=String(value??'').trim();
 if(!/^[+\d\s()-]{10,30}$/.test(raw))throw new DomainError('Укажите номер телефона с кодом страны, например +7 777 123 45 67.');
 let digits=raw.replace(/\D/g,'');
 if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
 if(!/^[1-9]\d{9,14}$/.test(digits))throw new DomainError('Проверьте номер и код страны.');
 return '+'+digits;
}
function passwordInput(value:unknown){
 if(typeof value!=='string'||value.length<10||value.length>128)throw new DomainError('Пароль должен содержать от 10 до 128 символов.');
 return value;
}
async function derive(password:string,salt:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 // Workerd caps each PBKDF2 operation at 100,000 iterations.
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-512'},key,512));
}
async function hashPassword(password:string){const salt=random(16);return `pbkdf2-sha512$100000$${salt}$${await derive(password,salt)}`;}
function equal(a:string,b:string){let result=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)result|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return result===0;}
export async function verifyPassword(password:string,stored:string){const [, ,salt,expected]=stored.split('$');return equal(await derive(password,salt),expected);}
const recoveryCode=()=>random(24).match(/.{1,8}/g)!.join('-');
const recoveryDigest=(code:unknown)=>digest(String(code??'').trim().toLowerCase().replace(/[\s-]/g,''));
const query=(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
// Every native account has a base guest profile. Login also upgrades old accounts,
// preserving their names, contacts, cities and additional roles.
function guestProfile(db:D1Database,id:string,name:string,phone:string,city='Павлодар'){
 return query(db,`INSERT INTO profiles(id,name,contact,city,roles,districts,experience,availability,created_at) VALUES (?,?,?,?,'["guest"]','','','',?) ON CONFLICT(id) DO UPDATE SET roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(profiles.roles) WHERE value='guest') THEN profiles.roles ELSE json_insert(profiles.roles,'$[#]','guest') END`,id,name,phone,city,now());
}

function cookieToken(cookie:string|null){return cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);}
function bearerToken(authorization:string|null){return authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];}
export async function requestSessionIdentity(request:Request){const kind=request.headers.has('authorization')?'mobile':'web',token=kind==='mobile'?bearerToken(request.headers.get('authorization')):cookieToken(request.headers.get('cookie'));return token&&/^[a-f0-9]{64}$/.test(token)?{kind,hash:await digest(token)}:null;}
export async function sessionUser(db:D1Database,cookie:string|null,authorization?:string|null){
 const mobile=authorization!==undefined&&authorization!==null;
 const token=mobile?bearerToken(authorization):cookieToken(cookie);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const user=await query(db,`SELECT a.id,a.name,a.phone FROM ${mobile?'auth_mobile_sessions':'auth_sessions'} s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.expires_at>?`,await digest(token),now()).first<{id:string;name:string;phone:string}>();
 return user?{userId:user.id,fullName:user.name,phone:user.phone}:null;
}
function cookie(value:string,request:Request,age=lifetime){return `${sessionCookie}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function expireSessionCookie(request:Request){return cookie('',request,0);}
function response(data:unknown,setCookie?:string,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}});}
async function limit(db:D1Database,key:string,max:number){
 const time=now();
 const value=await query(db,`INSERT INTO auth_attempt_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,key,time+900,time,time).first<{attempts:number}>();
 if(!value||value.attempts>max)throw new DomainError('Слишком много попыток. Попробуйте через 15 минут.',429);
}

export type AdminLoginConfig={ADMIN_LOGIN_EMAIL?:string;ADMIN_LOGIN_PHONE?:string;TELEGRAM_BOT_TOKEN?:string;SMS_GATEWAY_URL?:string;SMS_GATEWAY_TOKEN?:string;PLATFORM_ADMIN_IDS?:string;
 // Tests replace the outside world; the service sends through Telegram, SMS or the administrator.
 sendResetCode?:(account:{id:string;name:string;phone:string},code:string)=>Promise<boolean>};
const RESET_LIFETIME=1800;
const resetText=(code:string)=>'Код для смены пароля AiQonaq: '+code+'. Действует 30 минут. Никому его не сообщайте. Если вы не просили смену пароля, просто ничего не делайте.';
async function telegramSend(token:string,chatId:string,text:string){
 try{const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text}),redirect:'manual',signal:AbortSignal.timeout(8000)});return r.ok;}
 catch{console.error('Password reset Telegram send failed');return false;}
}
const chatsOf=async(db:D1Database,ids:string[])=>ids.length?(await query(db,`SELECT DISTINCT address FROM delivery_channels WHERE channel='telegram' AND verified_at IS NOT NULL AND user_id IN (${ids.map(()=>'?').join(',')})`,...ids).all<{address:string}>()).results.map(r=>r.address):[];
// The code goes to the person first: their own Telegram chat with the bot, then SMS when a provider is connected.
// Without either, the platform administrator gets it with the instruction to call the number and dictate it only to its owner.
async function sendResetCode(db:D1Database,config:AdminLoginConfig,account:{id:string;name:string;phone:string},code:string){
 if(config.sendResetCode)return config.sendResetCode(account,code);
 const bot=config.TELEGRAM_BOT_TOKEN;let sent=false;
 if(bot)for(const chat of await chatsOf(db,[account.id]))sent=await telegramSend(bot,chat,resetText(code))||sent;
 if(sent)return true;
 if(config.SMS_GATEWAY_URL&&config.SMS_GATEWAY_TOKEN&&/^https:\/\//.test(config.SMS_GATEWAY_URL)){
  try{const r=await fetch(config.SMS_GATEWAY_URL,{method:'POST',headers:{Authorization:'Bearer '+config.SMS_GATEWAY_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({id:'reset:'+account.id+':'+now(),to:account.phone,text:resetText(code),category:'verification'}),redirect:'manual',signal:AbortSignal.timeout(15000)});if(r.ok)return true;}
  catch{console.error('Password reset SMS failed');}
 }
 const admins=String(config.PLATFORM_ADMIN_IDS||'').split(',').map(v=>v.trim()).filter(Boolean);
 if(bot)for(const chat of await chatsOf(db,admins))sent=await telegramSend(bot,chat,'🔑 Восстановление доступа\n'+account.name+', '+account.phone+' забыл(а) пароль.\n\nПозвоните на этот номер и убедитесь, что говорите с владельцем аккаунта. Только тогда продиктуйте код: '+code+'\nКод действует 30 минут.')||sent;
 return sent;
}
export async function authRequest(db:D1Database,request:Request,action:string,client:'web'|'mobile'='web',config:AdminLoginConfig={}){
 if(request.method!=='POST')return response({error:'Используйте POST.'},undefined,405);
 const origin=request.headers.get('origin');
 if((client==='web'?origin!==new URL(request.url).origin:!!origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new DomainError('Источник запроса не разрешён.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Ожидается JSON.',415);
 const raw=await boundedRequestText(request,4096);
 const body=JSON.parse(raw||'{}');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DomainError('Некорректный запрос.');
 if(action==='logout'){
  const token=client==='mobile'?bearerToken(request.headers.get('authorization')):cookieToken(request.headers.get('cookie'));
  if(token)await query(db,`DELETE FROM ${client==='mobile'?'auth_mobile_sessions':'auth_sessions'} WHERE hash=?`,await digest(token)).run();
  return response({message:'Вы вышли из аккаунта.'},client==='web'?cookie('',request,0):undefined);
 }
 if(!['register','login','recover','reset-request','reset'].includes(action))return response({error:'Маршрут не найден.'},undefined,404);
 const ip=request.headers.get('cf-connecting-ip')||'local';
 await limit(db,'ip:'+await digest(ip),60);
 const identifier=String(body.phone??'').trim(),emailLogin=action==='login'&&identifier.includes('@');
 // An optional operator email is a server-configured login alias, never an admin grant.
 const phone=emailLogin?(config.ADMIN_LOGIN_EMAIL?.trim().toLowerCase()===identifier.toLowerCase()&&config.ADMIN_LOGIN_PHONE?normalizePhone(config.ADMIN_LOGIN_PHONE):null):normalizePhone(identifier);
 if(action==='reset-request'){
  await limit(db,'reset-request:phone:'+await digest(phone!),3);
  const account=await query(db,'SELECT id,name,phone FROM auth_accounts WHERE phone=?',phone).first<{id:string;name:string;phone:string}>();
  // The answer is the same for any number, so nobody learns from it who has an account.
  const answer={message:'Если этот номер зарегистрирован, код уже в пути: он придёт в Telegram от бота AiQonaq или вам позвонит администратор сервиса и продиктует его.',expiresIn:RESET_LIFETIME};
  if(!account)return response(answer);
  const current=await query(db,'SELECT sent_at FROM auth_reset_codes WHERE user_id=?',account.id).first<{sent_at:number}>();
  if(current&&current.sent_at>now()-60)throw new DomainError('Код уже отправлен. Новый можно запросить через минуту.',429);
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'),salt=random(8);
  await query(db,'INSERT INTO auth_reset_codes(user_id,code_hash,attempts,sent_at,expires_at) VALUES (?,?,0,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,sent_at=excluded.sent_at,expires_at=excluded.expires_at',account.id,salt+':'+await digest(salt+':'+code),now(),now()+RESET_LIFETIME).run();
  if(!await sendResetCode(db,config,account,code)){
   await query(db,'DELETE FROM auth_reset_codes WHERE user_id=?',account.id).run();
   throw new DomainError('Сейчас не получилось отправить код. Попробуйте через несколько минут или войдите с резервным кодом.',503);
  }
  return response(answer);
 }
 const password=passwordInput(body.password);
 await limit(db,action+':phone:'+await digest(phone||identifier.toLowerCase()),action==='register'?5:10);
 await query(db,'DELETE FROM auth_attempt_limits WHERE expires_at<?',now()-86400).run();
 await query(db,'DELETE FROM auth_sessions WHERE expires_at<?',now()).run();
 await query(db,'DELETE FROM auth_mobile_sessions WHERE expires_at<?',now()).run();
 const sessions=client==='mobile'?'auth_mobile_sessions':'auth_sessions';
 if(action==='register'){
  const name=String(body.name??'').trim();if(name.length<2||name.length>100)throw new DomainError('Укажите имя: от 2 до 100 символов.');
  const city=String(body.city||'Павлодар').trim();if(!city||city.length>80)throw new DomainError('Проверьте город.');
  const id=crypto.randomUUID(),code=recoveryCode(),token=random();
  try{await db.batch([query(db,'INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',id,phone,name,await hashPassword(password),await recoveryDigest(code),now()),guestProfile(db,id,name,phone!,city),query(db,`INSERT INTO ${sessions} VALUES (?,?,1,?)`,await digest(token),id,now()+lifetime)]);}
  catch(error){if(/UNIQUE/.test(String(error)))throw new DomainError('Не удалось зарегистрировать номер. Попробуйте войти или восстановить доступ.',409);throw error;}
  return response({message:'Аккаунт создан.',recoveryCode:code,...(client==='mobile'?{token,user:{id,name,phone}}:{})},client==='web'?cookie(token,request):undefined,201);
 }
 const account=await query(db,'SELECT * FROM auth_accounts WHERE phone=?',phone||'').first<{id:string;name:string;phone:string;password_hash:string;recovery_hash:string;credential_version:number}>();
 if(action==='recover'){
  const codeHash=await recoveryDigest(body.recoveryCode);
  if(!account||!equal(codeHash,account.recovery_hash))throw new DomainError('Номер или резервный код не подходят.',401);
  const code=recoveryCode();
  const updated=await query(db,'UPDATE auth_accounts SET password_hash=?,recovery_hash=?,credential_version=credential_version+1 WHERE id=? AND recovery_hash=? AND credential_version=?',await hashPassword(password),await recoveryDigest(code),account.id,codeHash,account.credential_version).run();
  if(updated.meta.changes!==1)throw new DomainError('Код уже использован. Повторите вход.',409);
  await query(db,'DELETE FROM auth_sessions WHERE user_id=? AND credential_version<=?',account.id,account.credential_version).run();
  await query(db,'DELETE FROM auth_mobile_sessions WHERE user_id=? AND credential_version<=?',account.id,account.credential_version).run();
  return response({message:'Пароль изменён. Войдите с новым паролем.',recoveryCode:code},client==='web'?cookie('',request,0):undefined);
 }
 if(action==='reset'){
  const code=String(body.code??'').replace(/\D/g,'');
  if(code.length!==6)throw new DomainError('Введите шесть цифр кода.');
  const row=account?await query(db,'SELECT * FROM auth_reset_codes WHERE user_id=?',account.id).first<{code_hash:string;attempts:number;expires_at:number}>():null;
  if(!account||!row||row.expires_at<=now()||row.attempts>=5)throw new DomainError('Код истёк или не запрашивался. Запросите новый.',409);
  const [salt,expected]=row.code_hash.split(':');
  if(!equal(await digest(salt+':'+code),expected)){
   await query(db,'UPDATE auth_reset_codes SET attempts=attempts+1 WHERE user_id=? AND code_hash=?',account.id,row.code_hash).run();
   throw new DomainError(row.attempts>=4?'Код больше не действует. Запросите новый.':'Код не подходит. Проверьте цифры.',401);
  }
  const used=await query(db,'DELETE FROM auth_reset_codes WHERE user_id=? AND code_hash=?',account.id,row.code_hash).run();
  if(used.meta.changes!==1)throw new DomainError('Код уже использован. Запросите новый.',409);
  const version=account.credential_version+1,token=random();
  const updated=await query(db,'UPDATE auth_accounts SET password_hash=?,credential_version=? WHERE id=? AND credential_version=?',await hashPassword(password),version,account.id,account.credential_version).run();
  if(updated.meta.changes!==1)throw new DomainError('Пароль только что изменили. Запросите новый код.',409);
  // Every old session ends; this device is signed in with the new password straight away.
  await query(db,'DELETE FROM auth_sessions WHERE user_id=? AND credential_version<?',account.id,version).run();
  await query(db,'DELETE FROM auth_mobile_sessions WHERE user_id=? AND credential_version<?',account.id,version).run();
  await db.batch([guestProfile(db,account.id,account.name,account.phone),query(db,`INSERT INTO ${sessions} VALUES (?,?,?,?)`,await digest(token),account.id,version,now()+lifetime)]);
  return response({message:'Пароль изменён. Вы вошли.',...(client==='mobile'?{token,user:{id:account.id,name:account.name,phone:account.phone}}:{})},client==='web'?cookie(token,request):undefined);
 }
 // Perform the expensive derivation for absent accounts too.
 const valid=await verifyPassword(password,account?.password_hash||'pbkdf2-sha512$100000$00000000000000000000000000000000$'+ '0'.repeat(128));
 if(!account||!valid)throw new DomainError('Номер или пароль не подходят.',401);
 const token=random();
 await db.batch([guestProfile(db,account.id,account.name,account.phone),query(db,`INSERT INTO ${sessions} VALUES (?,?,?,?)`,await digest(token),account.id,account.credential_version,now()+lifetime)]);
 return response({message:'Вы вошли.',...(client==='mobile'?{token,user:{id:account.id,name:account.name,phone:account.phone}}:{})},client==='web'?cookie(token,request):undefined);
}
