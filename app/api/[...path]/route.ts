import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { RentalService } from '../../../lib/service';
import {authenticate,sessionUser,sessionCookie,logout} from '../../../lib/auth';
import {runOperations} from '../../../lib/operations';
import { DomainError } from '../../../lib/domain';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function handle(request:Request, context:{params:Promise<{path:string[]}>}) {
  try {
    if(!env.DB) return json({error:'База данных ещё не подключена.'},503);
    const route=(await context.params).path;
    if(route.join('/')==='system/tick'){
      if(request.method!=='POST'||!env.OPERATIONS_TOKEN||request.headers.get('x-operations-token')!==env.OPERATIONS_TOKEN)return json({error:'Доступ запрещён.'},403);
      return json(await runOperations(env.DB));
    }
    if(request.method!=='GET'){
      const origin=request.headers.get('origin');
      if(origin&&origin!==new URL(request.url).origin)return json({error:'Источник запроса не разрешён.'},403);
      if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Источник запроса не разрешён.'},403);
    }
    if(route[0]==='auth'&&request.method==='POST'){
      if(route[1]==='logout'){await logout(env.DB,request);return new Response(JSON.stringify({message:'Вы вышли из аккаунта.'}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':sessionCookie('',request,true)}});}
      if(!['login','register'].includes(route[1]))return json({error:'Маршрут не найден.'},404);
      if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Ожидается JSON.'},415);
      const raw=await request.text();if(raw.length>10000)return json({error:'Слишком большой запрос.'},413);
      const auth=await authenticate(env.DB,JSON.parse(raw),route[1]==='register',request.headers.get('cf-connecting-ip')||'local');
      return new Response(JSON.stringify({message:route[1]==='register'?'Аккаунт создан.':'Вход выполнен.'}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':sessionCookie(auth.token,request)}});
    }
    const native=await sessionUser(env.DB,request),platform=native?null:await getChatGPTUser();
    const user=native||(platform?.userId!=='local_seedy'?platform:null);
    if(!user)return json({error:'Войдите в свой аккаунт.'},401);
    const service=new RentalService(env.DB,user.userId);
    if(request.method==='GET'&&route[0]==='state') { const state=await service.state();return json({...state,integrations:{...state.integrations,ai:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)},user:{id:user.userId,name:user.fullName||'',email:user.email}}); }
    if(request.method!=='POST') return json({error:'Маршрут не найден.'},404);
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return json({error:'Источник запроса не разрешён.'},403);
    if(!request.headers.get('content-type')?.includes('application/json')) return json({error:'Ожидается JSON.'},415);
    if(Number(request.headers.get('content-length')||0)>20000) return json({error:'Слишком большой запрос.'},413);
    const raw=await request.text(); if(raw.length>20000) return json({error:'Слишком большой запрос.'},413);
    const body=JSON.parse(raw||'{}');
    if(route.length===1) {
      switch(route[0]) {
        case 'settings':return json(await service.saveSettings(body));
        case 'profile':return json(await service.saveProfile(body));
        case 'properties':return json(await service.createProperty(body));
        case 'bookings':return json(await service.createBooking(body));
        case 'jobs':return json(await service.createJob(body));
        case 'chat':return json(await service.chat(body,{OPENAI_API_KEY:env.OPENAI_API_KEY,OPENAI_MODEL:env.OPENAI_MODEL}));
        case 'demo':return json(await service.demo());
        case 'maintenance':return json(await service.maintenance());
        case 'notifications':await service.query('UPDATE notifications SET read=1 WHERE user_id=?',user.userId).run();return json({message:'Уведомления прочитаны.'});
      }
    }
    if(route.length===2 && route[0]==='properties') return json(await service.updateProperty(route[1],body));
    if(route.length===2 && route[0]==='bookings') return json(await service.bookingAction(route[1],body));
    if(route.length===2 && route[0]==='jobs') return json(await service.jobAction(route[1],body));
    return json({error:'Маршрут не найден.'},404);
  } catch(error:any) {
    if(error instanceof DomainError) return json({error:error.message},error.status);
    if(error instanceof SyntaxError) return json({error:'Некорректный запрос.'},400);
    const msg=String(error?.message||error);
    if(/booking_overlap/.test(msg)) return json({error:'Этот интервал уже занят, включая время уборки. Выберите другое время.'},409);
    if(/cleaner_overlap/.test(msg)) return json({error:'У исполнителя уже есть задание в это время.'},409);
    if(/UNIQUE/.test(msg)) return json({error:'Запись уже существует. Обновите страницу.'},409);
    console.error('AI Arenda API:', msg.replace(/\b[\w.+-]+@[\w.-]+\.[\w]+\b/g,'[email]'));
    return json({error:'Не удалось выполнить действие. Данные не подтверждены. Попробуйте ещё раз.'},500);
  }
}
export const GET=handle;
export const POST=handle;
