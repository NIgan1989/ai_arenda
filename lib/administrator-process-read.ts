import type {Role} from './domain';
import type {RentalService} from './service';
import {processStatus} from './process-status';
export function processReadIntent(text:string){return /мои|моих|актуал|статус|сейчас|что.*вниман/iu.test(text)&&/брон|заяв|уборк|задан|объект|квартир|процесс/iu.test(text)&&!/создай|подтверди|оплати|отмен|продли|передай|отправь|сделай/iu.test(text);}
export async function readAdministratorProcesses(s:RentalService,role:Role){
 const state=await s.roleState(role,{catalog:false});
 const bookings=state.bookings||[],jobs=role==='cleaner'?(state.jobs||[]).filter((j:any)=>j.assigned_to===s.userId):role==='owner'?state.jobs||[]:[];
 const activeBookings=bookings.filter((b:any)=>['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkout),activeJobs=jobs.filter((j:any)=>['open','assigned','in_progress','submitted'].includes(j.status));
 const tasks=(state.administrator?.tasks||[]).filter((t:any)=>t.status==='open').sort((a:any,b:any)=>b.priority-a.priority||a.deadline-b.deadline);
 const roleName={owner:'владелец',guest:'гость',cleaner:'исполнитель'}[role],lines=[`Актуальная проверка · ${roleName}.`,...(role==='owner'?[`Ваших объектов: ${state.ownProperties?.length||0}.`]:[]),`Незавершённых броней: ${activeBookings.length}. Заданий: ${activeJobs.length}.`];
 if(tasks.length)lines.push('Требуют внимания: '+tasks.length+'.',...tasks.slice(0,6).map((t:any)=>t.title+' · '+t.reason));
 const items=[...activeBookings.map((b:any)=>({item:b,kind:'booking'})),...activeJobs.map((j:any)=>({item:j,kind:'job'}))].sort((a,b)=>a.item.start-b.item.start);
 for(const {item,kind} of items.slice(0,6))lines.push(item.title+' · '+processStatus(kind,item,role,s.userId).label+(kind==='booking'?' · оплата '+(item.payment_status==='owner_verified'?'подтверждена владельцем':'не подтверждена'):'')+' · '+new Date(item.start*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}));
 if(!items.length&&!tasks.length)lines.push('Незавершённых процессов в этой роли нет.');
 lines.push('Данные проверены сейчас. Оплата, прибытие и приёмка подтверждаются отдельно в карточках процессов.');
 return {text:lines.join('\n')};
}
