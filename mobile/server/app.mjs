import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RentalService } from './generated/service.js';
import { Database } from './database.mjs';
import { interval } from './generated/domain.js';
const derive=promisify(scrypt), now=()=>Math.floor(Date.now()/1000);
const hash=value=>createHash('sha256').update(value).digest('hex');
class HttpError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function createApp({filename=':memory:',origins=['http://localhost:8081','http://127.0.0.1:8081'],maintenance=true}={}) {
  const db=new Database(filename), attempts=new Map(); let queue=Promise.resolve();
  const serial=task=>{const run=queue.then(task);queue=run.catch(()=>{});return run;};
  async function body(req) {
    if(!['POST','PUT'].includes(req.method)) return {};
    if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError('Нужен JSON.',415);
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>262144)throw new HttpError('Слишком большой запрос.',413);chunks.push(chunk);}
    try {const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data;}
    catch {throw new HttpError('Некорректный запрос.');}
  }
  async function authenticate(req) {
    const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const session=bearer&&db.raw.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(bearer),now());
    if(!session)throw new HttpError('Войдите в аккаунт, чтобы продолжить.',401);
    return {id:session.user_id,token:bearer};
  }
  async function route(req,path,input) {
    if(path==='/health'&&req.method==='GET')return {ok:true,mode:'pilot',ai:false,payments:false};
    if(['/auth/register','/auth/login'].includes(path)&&req.method==='POST') {
      const login=typeof input.login==='string'?input.login.trim().toLowerCase():'';
      const password=typeof input.password==='string'?input.password:'';
      if(!/^[a-z0-9._-]{3,40}$/.test(login)||password.length<10||password.length>128)throw new HttpError('Логин: 3–40 латинских символов. Пароль: 10–128 символов.');
      const key=req.socket.remoteAddress||'local';
      for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);
      const limit=attempts.get(key)||{count:0,until:Date.now()+600000};
      if(limit.count>=30)throw new HttpError('Слишком много попыток. Попробуйте через 10 минут.',429);
      limit.count++;attempts.set(key,limit);
      let account=db.raw.prepare('SELECT * FROM accounts WHERE login=?').get(login);
      if(path==='/auth/register') {
        if(account)throw new HttpError('Логин занят. Выберите другой или войдите.',409);
        const salt=randomBytes(16).toString('hex'), key=await derive(password,salt,64);
        account={id:randomUUID(),login,password:salt+':'+key.toString('hex')};
        db.raw.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(account.id,login,account.password,now());
      } else {
        // Derive even for an unknown account, so lookup timing does not reveal it.
        const [salt,expected]=(account?.password||('00'.repeat(16)+':'+ '00'.repeat(64))).split(':');
        const actual=await derive(password,salt,64);
        if(!account||!timingSafeEqual(actual,Buffer.from(expected,'hex')))throw new HttpError('Логин или пароль неверны.',401);
      }
      const token=randomBytes(32).toString('base64url');
      db.raw.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),account.id,now()+7*86400);
      return {token,user:{id:account.id,login:account.login},message:'Вы вошли. Продолжим.'};
    }
    const user=await authenticate(req), service=new RentalService(db,user.id);
    if(path==='/auth/logout'&&req.method==='POST'){db.raw.prepare('DELETE FROM sessions WHERE hash=?').run(hash(user.token));return {message:'Вы вышли из аккаунта.'};}
    if(path==='/api/state'&&req.method==='GET')return {...await service.state(),user:{id:user.id,login:db.raw.prepare('SELECT login FROM accounts WHERE id=?').get(user.id).login}};
    if(path==='/api/conversation'&&req.method==='GET')return JSON.parse(db.raw.prepare('SELECT body FROM conversations WHERE user_id=?').get(user.id)?.body||'{"messages":[],"flow":null,"actor":"guest"}');
    if(path==='/api/conversation'&&req.method==='PUT'){
      if(!Array.isArray(input.messages)||input.messages.length>150||input.messages.some(m=>!m||typeof m.id!=='string'||!['assistant','user'].includes(m.sender)||typeof m.text!=='string'))throw new HttpError('Некорректная история.');
      const body=JSON.stringify({messages:input.messages,flow:input.flow||null,actor:['owner','guest','cleaner'].includes(input.actor)?input.actor:'guest'});
      db.raw.prepare('INSERT INTO conversations VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(user.id,body,now());
      return {ok:true};
    }
    if(req.method!=='POST')throw new HttpError('Не найдено.',404);
    if(path==='/api/profile')return service.saveProfile(input);
    if(path==='/api/properties')return service.createProperty(input);
    if(path==='/api/bookings')return service.createBooking(input);
    if(path==='/api/jobs'){
      await service.requireRole('owner');
      if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',String(input.propertyId||''),user.id))throw new HttpError('Выберите свою квартиру.',403);
      const {start,end}=interval(input.start,input.end);
      const occupied=db.raw.prepare(`SELECT id FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?`).get(String(input.propertyId||''),now(),end,start);
      const cleaning=db.raw.prepare(`SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?`).get(String(input.propertyId||''),end,start);
      if(occupied||cleaning)throw new HttpError('У квартиры уже есть бронь или уборка на это время.',409);
      return service.createJob(input);
    }
    if(path==='/api/demo')return service.demo();
    if(path==='/api/chat')return service.chat(input);
    const action=path.match(/^\/api\/(bookings|jobs)\/([a-zA-Z0-9-]+)$/);
    if(action)return action[1]==='bookings'?service.bookingAction(action[2],input):service.jobAction(action[2],input);
    throw new HttpError('Не найдено.',404);
  }
  async function execute(req,path,input){
    const key=req.headers['idempotency-key'];
    if(!key||req.method!=='POST'||!path.startsWith('/api/'))return route(req,path,input);
    if(typeof key!=='string'||key.length>200||key.length<8)throw new HttpError('Некорректный ключ действия.');
    const user=await authenticate(req),digest=hash(path+'\n'+JSON.stringify(input));
    const existing=db.raw.prepare('SELECT digest,result FROM command_receipts WHERE user_id=? AND key=?').get(user.id,key);
    if(existing){if(existing.digest!==digest)throw new HttpError('Этот ключ уже использован с другими данными. Обновите карточку.',409);return JSON.parse(existing.result);}
    db.raw.exec('BEGIN IMMEDIATE');db.transactionDepth++;
    try{
      const result=await route(req,path,input);
      db.raw.prepare('INSERT INTO command_receipts VALUES (?,?,?,?)').run(user.id,key,digest,JSON.stringify(result));
      db.raw.exec('COMMIT');return result;
    }catch(error){db.raw.exec('ROLLBACK');throw error;}
    finally{db.transactionDepth--;}
  }
  const server=createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin&&origins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key'});
    const reply=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
    try {
      if(origin&&!origins.includes(origin))throw new HttpError('Источник не разрешён.',403);
      if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
      const input=await body(req), path=new URL(req.url,'http://localhost').pathname;
      reply(200,await serial(()=>execute(req,path,input)));
    }catch(error){
      const overlap=/booking_overlap|cleaner_overlap/.test(error.message);
      const status=overlap?409:Number(error.status)||500;
      reply(status,{error:overlap?'Время уже занято. Выберите другой интервал.':status>=500?'Сервер не подтвердил действие. Попробуйте позже.':error.message});
      if(status>=500)console.error('Request failed:',error.name,error.code||'internal');
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const timer=maintenance?setInterval(()=>serial(async()=>{
    db.raw.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
    await new RentalService(db,'system').maintenance();
  }).catch(e=>console.error('Maintenance failed:',e.name)),60000):null;
  timer?.unref();
  return {server,db,async close(){if(timer)clearInterval(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await queue;db.close();}};
}
