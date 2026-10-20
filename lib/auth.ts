import {scrypt} from 'node:crypto';
import {DomainError,required,roles,type Role} from './domain';
const enc=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b)).map(n=>n.toString(16).padStart(2,'0')).join('');
export const SESSION_COOKIE='arenda_session';
const lifetime=30*86400;
const now=()=>Math.floor(Date.now()/1000);
export const tokenHash=async(token:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(token)));
async function passwordHash(password:string,salt:string){
 const result=await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
 return 'scrypt-v1$'+hex(result);
}
function same(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function email(value:unknown){const s=required(value,'Email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new DomainError('Укажите корректный email.');return s;}
function password(value:unknown){if(typeof value!=='string'||value.length<10||value.length>128)throw new DomainError('Пароль должен содержать от 10 до 128 символов.');return value;}
export function cookieToken(request:Request){return (request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1)||'';}
export function sessionCookie(token:string,request:Request,clear=false){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:lifetime}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function sessionUser(db:D1Database,request:Request){const token=cookieToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;const user=await db.prepare('SELECT a.id,a.email,p.name FROM sessions s JOIN accounts a ON a.id=s.user_id LEFT JOIN profiles p ON p.id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await tokenHash(token),now()).first<{id:string;email:string;name:string}>();return user?{userId:user.id,email:user.email,fullName:user.name}:null;}
export async function logout(db:D1Database,request:Request){const token=cookieToken(request);if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(token)).run();}
export async function authenticate(db:D1Database,body:Record<string,any>,register:boolean,ip:string){
 const login=email(body.email),pass=password(body.password),t=now();
 const key=await tokenHash(login+'|'+ip),ipKey=await tokenHash('ip|'+ip);
 // Atomic database counters limit concurrent credential attempts before hashing.
 for(const limitKey of [ipKey,key]){
  await db.prepare('INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(limitKey,t+900,t,t,t+900).run();
  const limit=await db.prepare('SELECT attempts FROM auth_limits WHERE key=?').bind(limitKey).first<{attempts:number}>();
  if((limit?.attempts||0)>(limitKey===ipKey?60:10))throw new DomainError('Слишком много попыток. Повторите через 15 минут.',429);
 }
 let user=await db.prepare('SELECT * FROM accounts WHERE email=?').bind(login).first<Record<string,any>>();
 if(register){
  if(user)throw new DomainError('Не удалось зарегистрировать этот email. Попробуйте войти в аккаунт.',409);
  const role=body.role as Role;if(!roles.includes(role))throw new DomainError('Выберите роль.');
  const name=required(body.name,'Имя',100),contact=required(body.contact,'Контакт',120),city=required(body.city,'Город',80);
  const districts=role==='cleaner'?required(body.districts,'Районы',300):'',experience=role==='cleaner'?required(body.experience,'Опыт',1000):'',availability=role==='cleaner'?required(body.availability,'График',300):'';
  const uid='acct_'+crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(24))),hash=await passwordHash(pass,salt);
  await db.batch([
   db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?)').bind(uid,login,hash,salt,t),
   db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?)').bind(uid,name,contact,city,JSON.stringify([role]),districts,experience,availability,t),
   db.prepare('INSERT INTO account_settings(user_id,active_role) VALUES (?,?)').bind(uid,role),
   db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),uid,uid,'account.registered',t)
  ]);user={id:uid};
 }else{
  const actual=await passwordHash(pass,user?.salt||'00'.repeat(24));
  if(!user||!same(actual,user.password_hash))throw new DomainError('Неверный email или пароль.',401);
 }
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 await db.batch([db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await tokenHash(token),user!.id,t+lifetime),db.prepare('DELETE FROM auth_limits WHERE key=?').bind(key)]);
 return {token,userId:user!.id};
}
