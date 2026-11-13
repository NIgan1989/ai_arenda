import { waitUntil, env as workerEnv } from 'cloudflare:workers';
import {isolateTestConfig} from '../../../lib/test-environment';
import { getAppUser } from '../../session';
import {authRequest,expireSessionCookie,requestSessionIdentity} from '../../../lib/native-auth';
import {webPushState,manageWebPush,deliverWebPush} from '../../../lib/web-push';
import { RentalService } from '../../../lib/service';
import { DomainError } from '../../../lib/domain';
import {isPlatformAdmin} from '../../../lib/account';
import {reserveAIRequest} from '../../../lib/ai';
import {checkAdministratorForUser,runAdministrator} from '../../../lib/administrator-runtime';
import {administratorRunnerAuthorized} from '../../../lib/administrator-auth';
import {runOperationalTick} from '../../../lib/background';
import {readOperations,writeOperations,publicOperationsRequest} from '../../../lib/operations-api';
import {previewMatches,matchingState} from '../../../lib/smart-matching';
import {listCommands,prepareAdministratorCommand} from '../../../lib/administrator-commands';
import {parseRole} from '../../../lib/access';
import {boundedRequestText} from '../../../lib/request-body';
import {buildRuntimeHealth} from '../../../lib/runtime-health';
import {clientConversation} from '../../../lib/client-conversation';
import {accountSessions} from '../../../lib/account-sessions';
import {readPlatformAdmin,writePlatformAdmin} from '../../../lib/platform-admin';
import {requestCleanerAdmission} from '../../../lib/pilot-governance';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function handle(request:Request, context:{params:Promise<{path:string[]}>}) {
  const env=isolateTestConfig(workerEnv);
  try {
    const route=(await context.params).path;
    if(!env.DB) return json({error:'База данных ещё не подключена.'},503);
    const publicResult=await publicOperationsRequest(env.DB,request,route,env);if(publicResult)return publicResult;
    if(route.join('/')==='internal/matching-advance'){
      if(!await administratorRunnerAuthorized(request,env.ADMINISTRATOR_RUNNER_SECRET))return json({error:'Нет доступа.'},403);
      const input=JSON.parse(await boundedRequestText(request,500));if(typeof input.id!=='string'||input.id.length>100)return json({error:'Неверный запрос.'},400);
      const entry=await env.DB.prepare('SELECT guest_id FROM matching_requests WHERE id=?').bind(input.id).first<{guest_id:string}>();if(!entry)return json({advanced:false});
      const result=await matchingState(new RentalService(env.DB,entry.guest_id),input.id);if(result.dispatchChanged)waitUntil(deliverWebPush(env.DB,env,3));return json({advanced:true,status:result.status});
    }
    if(route.join('/')==='internal/health'){
      if(!await administratorRunnerAuthorized(request,env.ADMINISTRATOR_RUNNER_SECRET,'GET'))return json({error:'Нет доступа.'},403);
      const health=await buildRuntimeHealth(env.DB,env);return json(health,health.ok?200:503);
    }
    if(route.join('/')==='internal/administrator-run'){
      if(!await administratorRunnerAuthorized(request,env.ADMINISTRATOR_RUNNER_SECRET))return json({error:'Нет доступа.'},403);
      return json(await runOperationalTick(env.DB,env));
    }
    if(route.join('/')==='internal/backup-status'){
      if(!await administratorRunnerAuthorized(request,env.ADMINISTRATOR_RUNNER_SECRET))return json({error:'Нет доступа.'},403);
      const body=JSON.parse(await boundedRequestText(request,1000)),at=Math.floor(Number(body.completedAt));if(!Number.isFinite(at)||at>Date.now()/1000+60||at<Date.now()/1000-172800)return json({error:'Некорректное время резервной копии.'},400);
      await env.DB.prepare("INSERT INTO background_jobs(id,kind,scope,status,available_at,last_completed,updated_at) VALUES ('local-backup','local-backup','system','done',?,?,?) ON CONFLICT(id) DO UPDATE SET status='done',last_completed=excluded.last_completed,updated_at=excluded.updated_at,last_error=''").bind(at,at,Math.floor(Date.now()/1000)).run();return json({recorded:true});
    }
    if(request.method==='GET'&&route.join('/')==='public/catalog')return json(await new RentalService(env.DB,'').publicSearch(Object.fromEntries(new URL(request.url).searchParams),{syntheticPreview:env.TEST_DATA_ONLY==='1'}));
    if(request.method==='GET'&&route.join('/')==='public/matching'){const input=new URL(request.url).searchParams.get('q')||'{}';if(input.length>2500)return json({error:'Слишком длинные условия поиска.'},400);let filters;try{filters=JSON.parse(input);}catch{return json({error:'Проверьте формат условий поиска.'},400);}return json(await previewMatches(new RentalService(env.DB,''),filters));}
    if(request.method==='GET'&&route.length===3&&route[0]==='public'&&route[1]==='media')return json(await new RentalService(env.DB,'').publicMedia(route[2],env.BUCKET));
    if(route.length===2&&route[0]==='auth')return await authRequest(env.DB,request,route[1],'web',env);
    if(route.length===3&&route[0]==='mobile'&&route[1]==='auth')return await authRequest(env.DB,request,route[2],'mobile',env);
    const user=await getAppUser(request);
    if(!user) return json({error:'Войдите, чтобы сохранить данные.',signIn:'/'},401);
    const service=new RentalService(env.DB,user.userId);
    if(request.method==='GET'&&route.length===1&&route[0]==='access')return json({profile:await service.profile(),platformAdmin:isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),user:{id:user.userId,name:user.fullName||'',phone:user.phone}});
    if(request.method==='GET'&&route[0]==='admin')return json(await readPlatformAdmin(service,route.slice(1).join('/'),Object.fromEntries(new URL(request.url).searchParams),env));
    const activeRole=request.headers.get('X-Workspace-Role');
    if(request.method==='GET'&&route.join('/')==='push'){const identity=await requestSessionIdentity(request);return json(await webPushState(service,parseRole(activeRole),env,identity?.kind==='web'?identity.hash:''));}
    if(request.method==='GET'&&route.join('/')==='sessions'){await service.authorizeWorkspace(activeRole,'account');return json(await accountSessions(service,request));}
    if(request.method==='GET'&&route.join('/')==='conversation')return json(await clientConversation(service,parseRole(activeRole)));
    if(request.method==='GET'&&route[0]==='operations')return json(await readOperations(service,parseRole(activeRole),route.slice(1),env,isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS)));
    if(request.method==='GET'&&route.length===2&&route[0]==='media'){const mediaRole=await service.authorizeWorkspace(activeRole,'media');return json(await service.readMedia(route[1],mediaRole,env.BUCKET));}
    if(request.method==='GET'&&route.length===1&&route[0]==='account'){await service.authorizeWorkspace(activeRole,'account');return json({...await service.accountState(),platformAdmin:isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),modelConfigured:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)});}
    if(request.method==='GET'&&route.join('/')==='admin/users'){await service.authorizeWorkspace(activeRole,'admin/users');const url=new URL(request.url);return json(await service.listUsers(isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),{role:url.searchParams.get('role'),search:url.searchParams.get('search'),page:url.searchParams.get('page')||0}));}
    if(request.method==='GET'&&route[0]==='state') { const role=await service.authorizeWorkspace(activeRole,'state');try{await checkAdministratorForUser(env.DB,user.userId,role);}catch{console.error('AI administrator: workflow check failed');}const state=await service.roleState(role,{catalog:new URL(request.url).searchParams.get('catalog')!=='0'});return json({...state,platformAdmin:isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS),testMode:env.TEST_DATA_ONLY==='1',commands:await listCommands(service,role),integrations:{...state.integrations,ai:!!(env.OPENAI_API_KEY&&env.OPENAI_MODEL)},user:{id:user.userId,name:user.fullName||''}}); }
    if(request.method==='GET'&&route.length===1&&route[0]==='catalog'){await service.authorizeWorkspace(activeRole,'quote');return json(await service.publicCatalog());}
    if(request.method!=='POST'&&!(request.method==='PUT'&&route.join('/')==='conversation')) return json({error:'Маршрут не найден.'},404);
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site') return json({error:'Источник запроса не разрешён.'},403);
    if(!request.headers.get('content-type')?.includes('application/json')) return json({error:'Ожидается JSON.'},415);
    const maxBody=route.join('/')==='conversation'?200000:route.join('/')==='operations/evidence'?11500000:route[0]==='operations'&&['discussion/send','evidence','calendar/import','calendar/source','calendar/preview','import/preview'].includes(route.slice(1).join('/'))?700000:route.length===1&&route[0]==='media'?510000:20000;
    if(Number(request.headers.get('content-length')||0)>maxBody) return json({error:'Слишком большой запрос.'},413);
    const raw=await boundedRequestText(request,maxBody);
    const body=JSON.parse(raw||'{}');
    if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Ожидается объект JSON.'},400);
    const requestKey=request.headers.get('Idempotency-Key');if(requestKey){if(requestKey.length>120||body.requestKey&&body.requestKey!==requestKey)return json({error:'Проверьте ключ операции.'},400);body.requestKey=requestKey;}
    if(route[0]==='admin')return json(await writePlatformAdmin(service,route.slice(1).join('/'),body,env));
    if(route.join('/')==='push'){const identity=await requestSessionIdentity(request);return json(await manageWebPush(service,parseRole(activeRole),body,env,identity?.kind==='web'?identity.hash:''));}
    if(request.method==='POST'&&route.join('/')==='sessions'){await service.authorizeWorkspace(activeRole,'account');return json(await accountSessions(service,request,body));}
    if(request.method==='PUT'&&route.join('/')==='conversation')return json(await clientConversation(service,parseRole(activeRole),body));
    if(route[0]==='operations'){const result=await writeOperations(service,parseRole(activeRole),route.slice(1),body,env,isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS)),response=json(result);if(route[1]==='matching'&&(['begin','respond','book'].includes(route[2])||(result as Record<string,any>).dispatchChanged===true))waitUntil(deliverWebPush(env.DB,env,3).catch(()=>({configured:true,sent:0,failed:1})));if((result as Record<string,any>)?.signOut)response.headers.set('Set-Cookie',expireSessionCookie(request));return response;}
    if(route.length===2&&route[0]==='onboarding'){
      if(!['guest','owner','cleaner'].includes(route[1]))return json({error:'Такой профиль недоступен.'},400);
      if(!await service.profile())await service.saveProfile({name:user.fullName||'Гость',contact:user.phone,city:body.city||'Павлодар',roles:['guest']});
      return json(await service.connectRole(route[1],body));
    }
    if(!(route.length===1&&route[0]==='profile'))await service.authorizeWorkspace(activeRole,route.join('/'),body);
    if(route[0]==='chat')body.role=activeRole;
    if(route.join('/')==='administrator/check'){await checkAdministratorForUser(env.DB,user.userId,await service.authorizeWorkspace(activeRole,'administrator/check'));return json({message:'Цепочки действий проверены. Если проверка уже выполняется, её результат появится после обновления.'});}
    if(route.join('/')==='administrator/issues')return json(await service.resolveAdministratorIssue(activeRole,body));
    if(route.length===1) {
      switch(route[0]) {
        case 'assistant-settings':return json(await service.saveAssistantSettings(activeRole,body));
        case 'approvals':return json(await service.decideApproval(activeRole,body));
        case 'account':return json(await service.saveAccountSettings(body));
        case 'quote':return json(await service.bookingQuote(body));
        case 'profile':return json(await service.saveProfile(body));
        case 'media':return json(await service.uploadMedia(body,env.BUCKET));
        case 'listings':return json(await service.saveListing(null,body));
        case 'properties':return json(await service.createProperty(body));
        case 'bookings':return json(await service.createBooking(body));
        case 'jobs':return json(await service.createJob(body));
        case 'chat':{if(env.OPENAI_API_KEY&&env.OPENAI_MODEL)await reserveAIRequest(env.DB,user.userId);const turn=crypto.randomUUID();return json(await service.chat(body,env,(args,callId)=>prepareAdministratorCommand(service,parseRole(activeRole),args,turn+':'+callId.slice(0,60))));}
        case 'demo':return json(await service.demo());
        case 'maintenance':return json(await service.maintenance());
        case 'notifications':await service.query('UPDATE notifications SET read=1 WHERE user_id=?',user.userId).run();return json({message:'Уведомления прочитаны.'});
      }
    }
    if(route.length===2&&route[0]==='profile'&&route[1]==='edit')return json(await service.editProfile(body));
    if(route.length===2&&route[0]==='media'&&body.action==='remove')return json(await service.deleteMedia(route[1],env.BUCKET));
    if(route.length===3&&route[0]==='listings'&&route[2]==='remove')return json(await service.removeProperty(route[1]));
    if(route.length===2&&route[0]==='listings')return json(await service.saveListing(route[1],body));
    if(route.length===2 && route[0]==='bookings') return json(await service.bookingAction(route[1],body));
    if(route.length===2 && route[0]==='jobs'){const result=await service.jobAction(route[1],body);if(body.action!=='apply')return json(result);
      // The response itself sends the cleaner's profile to the platform check that assignment needs, and says so.
      const admission=await requestCleanerAdmission(service,env,route[1]);
      return json({...result,admission,message:admission==='approved'||admission==='not_required'?'Отклик отправлен. Когда владелец назначит вас, здесь появятся адрес и кнопка «Начать уборку».':admission==='rejected'?'Отклик отправлен, но анкета не прошла проверку платформы. Владелец не сможет назначить вас, пока проверка не пройдена.':'Отклик отправлен. Анкету проверит администратор платформы, после этого владелец сможет вас назначить.'});}
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
    if(/property_archived/.test(msg))return json({error:'Квартира удалена владельцем: показать или забронировать её нельзя.'},409);
    if(/account_erased/.test(msg))return json({error:'Аккаунт удалён. Обновите вход.'},410);
    if(/checkout_required|property_not_vacant/.test(msg))return json({error:'Сначала подтвердите выезд гостя и освобождение квартиры.'},409);
    if(/property_cleaning_busy/.test(msg))return json({error:'В этой квартире уже выполняется или проверяется другая уборка.'},409);
    if(/booking_overlap|external_calendar_overlap/.test(msg)) return json({error:'Этот интервал уже занят, включая время уборки и внешние календари. Выберите другое время.'},409);
    if(/external_calendar_stale/.test(msg))return json({error:'Актуальность внешнего календаря не подтверждена. Обновите источник перед новым бронированием.'},409);
    if(/pilot_owner_review_required|pilot_cleaner_review_required|pilot_phone_required|pilot_review_stale/.test(msg))return json({error:'Операция ожидает проверки участника или телефона. Откройте «Управление → Допуск».'},409);
    if(/cleaner_overlap/.test(msg)) return json({error:'У исполнителя уже есть задание в это время.'},409);
    if(/UNIQUE/.test(msg)) return json({error:'Запись уже существует. Обновите страницу.'},409);
    console.error('AI Arenda API:', msg.replace(/\b[\w.+-]+@[\w.-]+\.[\w]+\b/g,'[email]'));
    return json({error:'Не удалось выполнить действие. Данные не подтверждены. Попробуйте ещё раз.'},500);
  }
}
export const GET=handle;
export async function POST(request:Request,context:{params:Promise<{path:string[]}>}){
 const env=isolateTestConfig(workerEnv);
 const response=await handle(request,context);
 // Domain actions take effect first; the coordinator then advances affected workspaces.
 if(response.ok&&env.DB&&request.headers.has('X-Workspace-Role')){
  try{const user=await getAppUser(request);if(user){const role=await new RentalService(env.DB,user.userId).authorizeWorkspace(request.headers.get('X-Workspace-Role'),'state');await checkAdministratorForUser(env.DB,user.userId,role);}}catch{console.error('AI administrator: post-action check failed');}
 }
 return response;
}
export const PUT=handle;
