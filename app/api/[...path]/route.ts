import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { RentalService } from '../../../lib/service';
import { DomainError } from '../../../lib/domain';
import {isPlatformAdmin} from '../../../lib/account';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function handle(request:Request, context:{params:Promise<{path:string[]}>}) {
  try {
    const route=(await context.params).path;
    if(!env.DB) return json({error:'База данных ещё не подключена.'},503);
    const user=await getChatGPTUser();
    if(!user) return json({error:'Войдите, чтобы сохранить данные.',signIn:'/signin-with-chatgpt?return_to=/'},401);
    const service=new RentalService(env.DB,user.userId);
    if(request.method==='GET'&&route.length===1&&route[0]==='access')return json({profile:await service.profile(),user:{id:user.userId,name:user.fullName||''}});
    const activeRole=request.headers.get('X-Workspace-Role');
    if(request.method==='GET'&&route.length===2&&route[0]==='media'){await service.authorizeWorkspace(activeRole,'media');return json(await service.readMedia(route[1]));}
    if(request.method==='GET'&&route.length===1&&route[0]==='account'){await service.authorizeWorkspace(activeRole,'account');return json({...await service.accountState(),platformAdmin:isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),modelConfigured:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)});}
    if(request.method==='GET'&&route.join('/')==='admin/users'){await service.authorizeWorkspace(activeRole,'admin/users');const url=new URL(request.url);return json(await service.listUsers(isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),{role:url.searchParams.get('role'),search:url.searchParams.get('search'),page:url.searchParams.get('page')||0}));}
    if(request.method==='GET'&&route[0]==='state') { const state=await service.roleState(activeRole);return json({...state,integrations:{...state.integrations,ai:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)},user:{id:user.userId,name:user.fullName||''}}); }
    if(request.method==='GET'&&route.length===1&&route[0]==='catalog'){await service.authorizeWorkspace(activeRole,'quote');return json(await service.publicCatalog());}
    if(request.method!=='POST') return json({error:'Маршрут не найден.'},404);
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return json({error:'Источник запроса не разрешён.'},403);
    if(!request.headers.get('content-type')?.includes('application/json')) return json({error:'Ожидается JSON.'},415);
    const maxBody=route.length===1&&route[0]==='media'?510000:20000;
    if(Number(request.headers.get('content-length')||0)>maxBody) return json({error:'Слишком большой запрос.'},413);
    const raw=await request.text(); if(raw.length>maxBody) return json({error:'Слишком большой запрос.'},413);
    const body=JSON.parse(raw||'{}');
    if(!(route.length===1&&route[0]==='profile'))await service.authorizeWorkspace(activeRole,route.join('/'),body);
    if(route[0]==='chat')body.role=activeRole;
    if(route.length===1) {
      switch(route[0]) {
        case 'assistant-settings':return json(await service.saveAssistantSettings(activeRole,body));
        case 'approvals':return json(await service.decideApproval(activeRole,body));
        case 'account':return json(await service.saveAccountSettings(body));
        case 'quote':return json(await service.bookingQuote(body));
        case 'profile':return json(await service.saveProfile(body));
        case 'media':return json(await service.uploadMedia(body));
        case 'listings':return json(await service.saveListing(null,body));
        case 'properties':return json(await service.createProperty(body));
        case 'bookings':return json(await service.createBooking(body));
        case 'jobs':return json(await service.createJob(body));
        case 'chat':return json(await service.chat(body,{OPENAI_API_KEY:env.OPENAI_API_KEY,OPENAI_MODEL:env.OPENAI_MODEL}));
        case 'demo':return json(await service.demo());
        case 'maintenance':return json(await service.maintenance());
        case 'notifications':await service.query('UPDATE notifications SET read=1 WHERE user_id=?',user.userId).run();return json({message:'Уведомления прочитаны.'});
      }
    }
    if(route.length===2&&route[0]==='profile'&&route[1]==='edit')return json(await service.editProfile(body));
    if(route.length===2&&route[0]==='media'&&body.action==='remove')return json(await service.deleteMedia(route[1]));
    if(route.length===2&&route[0]==='listings')return json(await service.saveListing(route[1],body));
    if(route.length===2 && route[0]==='bookings') return json(await service.bookingAction(route[1],body));
    if(route.length===2 && route[0]==='jobs') return json(await service.jobAction(route[1],body));
    if(route[0]==='bookings'&&route.length===3&&route[2]==='change-quote')return json(await service.bookingChangeQuote(route[1],activeRole,body));
    if(route[0]==='bookings'&&route.length===3&&route[2]==='changes')return json(await service.proposeBookingChange(route[1],activeRole,body));
    if(route[0]==='bookings'&&route.length===4&&route[2]==='changes')return json(await service.decideBookingChange(route[1],route[3],activeRole,body));
    if(route.length===3&&route[0]==='properties'&&route[2]==='policy')return json(await service.savePolicy(route[1],body));
    if(route.length===3&&route[0]==='properties'&&route[2]==='readiness')return json(await service.readinessAction(route[1],body));
    return json({error:'Маршрут не найден.'},404);
  } catch(error:any) {
    if(error instanceof DomainError) return json({error:error.message},error.status);
    if(error instanceof SyntaxError) return json({error:'Некорректный запрос.'},400);
    const msg=String(error?.message||error);
    if(/checkout_required|property_not_vacant/.test(msg))return json({error:'Сначала подтвердите выезд гостя и освобождение квартиры.'},409);
    if(/property_cleaning_busy/.test(msg))return json({error:'В этой квартире уже выполняется или проверяется другая уборка.'},409);
    if(/booking_overlap/.test(msg)) return json({error:'Этот интервал уже занят, включая время уборки. Выберите другое время.'},409);
    if(/cleaner_overlap/.test(msg)) return json({error:'У исполнителя уже есть задание в это время.'},409);
    if(/UNIQUE/.test(msg)) return json({error:'Запись уже существует. Обновите страницу.'},409);
    console.error('AI Arenda API:', msg.replace(/\b[\w.+-]+@[\w.-]+\.[\w]+\b/g,'[email]'));
    return json({error:'Не удалось выполнить действие. Данные не подтверждены. Попробуйте ещё раз.'},500);
  }
}
export const GET=handle;
export const POST=handle;
