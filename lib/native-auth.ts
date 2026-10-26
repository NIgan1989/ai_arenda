import {DomainError} from './domain';

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
async function verifyPassword(password:string,stored:string){const [, ,salt,expected]=stored.split('$');return equal(await derive(password,salt),expected);}
const recoveryCode=()=>random(24).match(/.{1,8}/g)!.join('-');
const recoveryDigest=(code:unknown)=>digest(String(code??'').trim().toLowerCase().replace(/[\s-]/g,''));
const query=(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
// Every native account has a base guest profile. Login also upgrades old accounts,
// preserving their names, contacts, cities and additional roles.
function guestProfile(db:D1Database,id:string,name:string,phone:string,city='Павлодар'){
 return query(db,`INSERT INTO profiles(id,name,contact,city,roles,districts,experience,availability,created_at) VALUES (?,?,?,?,'["guest"]','','','',?) ON CONFLICT(id) DO UPDATE SET roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(profiles.roles) WHERE value='guest') THEN profiles.roles ELSE json_insert(profiles.roles,'$[#]','guest') END`,id,name,phone,city,now());
}

export async function sessionUser(db:D1Database,cookie:string|null){
 const token=cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const user=await query(db,`SELECT a.id,a.name,a.phone FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.expires_at>?`,await digest(token),now()).first<{id:string;name:string;phone:string}>();
 return user?{userId:user.id,fullName:user.name,phone:user.phone}:null;
}
function cookie(value:string,request:Request,age=lifetime){return `${sessionCookie}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function response(data:unknown,setCookie?:string,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}});}
async function limit(db:D1Database,key:string,max:number){
 const time=now();
 const value=await query(db,`INSERT INTO auth_attempt_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,key,time+900,time,time).first<{attempts:number}>();
 if(!value||value.attempts>max)throw new DomainError('Слишком много попыток. Попробуйте через 15 минут.',429);
}

export async function authRequest(db:D1Database,request:Request,action:string){
 if(request.method!=='POST')return response({error:'Используйте POST.'},undefined,405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new DomainError('Источник запроса не разрешён.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Ожидается JSON.',415);
 const raw=await request.text();if(raw.length>4096)throw new DomainError('Слишком большой запрос.',413);
 const body=JSON.parse(raw||'{}');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DomainError('Некорректный запрос.');
 if(action==='logout'){
  const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
  if(token)await query(db,'DELETE FROM auth_sessions WHERE hash=?',await digest(token)).run();
  return response({message:'Вы вышли из аккаунта.'},cookie('',request,0));
 }
 if(!['register','login','recover'].includes(action))return response({error:'Маршрут не найден.'},undefined,404);
 const ip=request.headers.get('cf-connecting-ip')||'local';
 await limit(db,'ip:'+await digest(ip),60);
 const phone=normalizePhone(body.phone),password=passwordInput(body.password);
 await limit(db,action+':phone:'+await digest(phone),action==='register'?5:10);
 await query(db,'DELETE FROM auth_attempt_limits WHERE expires_at<?',now()-86400).run();
 await query(db,'DELETE FROM auth_sessions WHERE expires_at<?',now()).run();
 if(action==='register'){
  const name=String(body.name??'').trim();if(name.length<2||name.length>100)throw new DomainError('Укажите имя: от 2 до 100 символов.');
  const city=String(body.city||'Павлодар').trim();if(!city||city.length>80)throw new DomainError('Проверьте город.');
  const id=crypto.randomUUID(),code=recoveryCode(),token=random();
  try{await db.batch([query(db,'INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',id,phone,name,await hashPassword(password),await recoveryDigest(code),now()),guestProfile(db,id,name,phone,city),query(db,'INSERT INTO auth_sessions VALUES (?,?,1,?)',await digest(token),id,now()+lifetime)]);}
  catch(error){if(/UNIQUE/.test(String(error)))throw new DomainError('Не удалось зарегистрировать номер. Попробуйте войти или восстановить доступ.',409);throw error;}
  return response({message:'Аккаунт создан.',recoveryCode:code},cookie(token,request),201);
 }
 const account=await query(db,'SELECT * FROM auth_accounts WHERE phone=?',phone).first<{id:string;name:string;password_hash:string;recovery_hash:string;credential_version:number}>();
 if(action==='recover'){
  const codeHash=await recoveryDigest(body.recoveryCode);
  if(!account||!equal(codeHash,account.recovery_hash))throw new DomainError('Номер или резервный код не подходят.',401);
  const code=recoveryCode();
  const updated=await query(db,'UPDATE auth_accounts SET password_hash=?,recovery_hash=?,credential_version=credential_version+1 WHERE id=? AND recovery_hash=? AND credential_version=?',await hashPassword(password),await recoveryDigest(code),account.id,codeHash,account.credential_version).run();
  if(updated.meta.changes!==1)throw new DomainError('Код уже использован. Повторите вход.',409);
  await query(db,'DELETE FROM auth_sessions WHERE user_id=?',account.id).run();
  return response({message:'Пароль изменён. Войдите с новым паролем.',recoveryCode:code},cookie('',request,0));
 }
 // Perform the expensive derivation for absent accounts too.
 const valid=await verifyPassword(password,account?.password_hash||'pbkdf2-sha512$100000$00000000000000000000000000000000$'+ '0'.repeat(128));
 if(!account||!valid)throw new DomainError('Номер или пароль не подходят.',401);
 const token=random();
 await db.batch([guestProfile(db,account.id,account.name,phone),query(db,'INSERT INTO auth_sessions VALUES (?,?,?,?)',await digest(token),account.id,account.credential_version,now()+lifetime)]);
 return response({message:'Вы вошли.'},cookie(token,request));
}
