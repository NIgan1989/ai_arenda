'use client';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {useState,type FormEvent} from 'react';
import {Activity,ArrowUpRight,CheckCircle2,Clock3,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';

type Row=Record<string,any>;
const roles:Row={owner:'Владелец',guest:'Гость',cleaner:'Исполнитель'};
const time=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export function AdministratorPanel({data,role,busy,onCheck,onTask,onResolve,onSettlement}:{data:Row;role:string;busy:boolean;onCheck:()=>void;onTask:(task:Row)=>void;onResolve:(body:Row)=>void;onSettlement:(item:Row)=>void}){
 const [filter,setFilter]=useState('all'),admin=data.administrator;
 if(!admin)return null;
 const mine=(task:Row)=>task.user_id===data.user?.id&&task.role===role;
 const tasks=admin.tasks.filter((task:Row)=>filter==='mine'?mine(task):filter==='urgent'?task.priority===3:true);
 const activeBookings=(data.bookings||[]).filter((b:Row)=>['requested','confirmed'].includes(b.status));
 const chains=(data.bookings||[]).filter((b:Row)=>['requested','confirmed'].includes(b.status)||b.status==='completed'&&admin.tasks.some((task:Row)=>task.entity_id===b.id||(data.jobs||[]).some((j:Row)=>j.id===task.entity_id&&j.booking_id===b.id)));
 const activeJobs=(data.jobs||[]).filter((j:Row)=>role==='owner'||j.assigned_to===data.user?.id).filter((j:Row)=>['open','assigned','in_progress','submitted'].includes(j.status));
 return <section className="administrator-panel" aria-label="AI администратор">
  <div className="administrator-intro"><div><span className="card-eyebrow"><ShieldCheck size={18}/>AI администратор</span><h2>Каждый шаг — под контролем</h2><p>{role==='owner'?'Заявки гостей, подготовка жилья и работа исполнителей собраны в одну цепочку.':'Здесь ваши ближайшие действия и ответы, которых ждут другие участники.'}</p></div><Button className="inline-button" disabled={busy} onClick={onCheck}><RefreshCw size={16}/>Проверить цепочки</Button></div>
  <div className={'administrator-health '+(admin.backgroundAlive?'healthy':'')} role="status"><Activity size={17}/><span>{admin.backgroundAlive?'Фоновый контроль работает':'Фоновый контроль не подтверждён — задачи обновляются при обращении к сервису'}{admin.checkedAt&&<small>Последняя проверка: {time(admin.checkedAt)}</small>}{admin.backgroundError&&<small>Последняя фоновая проверка завершилась с ошибкой. Требуется проверка сервера.</small>}</span></div>
  <div className="administrator-stats"><div><strong>{activeBookings.length}</strong><span>активных броней</span></div><div><strong>{activeJobs.length}</strong><span>уборок в процессе</span></div><div><strong>{admin.total}</strong><span>шагов на контроле</span></div><div className={admin.urgent?'has-alert':''}><strong>{admin.urgent}</strong><span>требуют внимания</span></div></div>
  <div className="administrator-filters" aria-label="Фильтр задач">{[['all',role==='owner'?'Все участники':'Все задачи'],['mine','Мои действия'],['urgent','Срочное']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  <div className="administrator-tasks">{tasks.length?tasks.map((task:Row)=>{
   const financial=['deposit-return','refund','settlement'].includes(task.stage),canAct=mine(task);
   return <article className={'administrator-task '+(task.priority===3?'urgent':'')} key={task.id}><div className="administrator-task-icon">{task.priority===3?<TriangleAlert size={19}/>:<Clock3 size={19}/>}</div><div><span className="administrator-responsible">{roles[task.role]}{canAct?' · ваше действие':''}</span><h3>{task.title}</h3><p>{task.reason}</p><small>Срок: {time(task.deadline)}{task.priority===3?' · требует внимания':''}</small></div>{task.entity_kind!=='issue'&&<button className="administrator-open" disabled={busy} onClick={()=>financial&&canAct?onSettlement(task):onTask({...task,kind:task.entity_kind,entityId:task.entity_id})} aria-label={'Открыть: '+task.title}>{financial&&canAct?'Отметить расчёт':'Открыть'}<ArrowUpRight size={16}/></button>}</article>;
  }):<p className="administrator-empty"><CheckCircle2 size={20}/>{filter==='all'?'Действий, требующих внимания, сейчас нет. Контроль продолжается.':'В этом фильтре задач нет.'}</p>}</div>
  {admin.total>admin.tasks.length&&<p>Показаны первые {admin.tasks.length} задач из {admin.total}. Сначала идут срочные.</p>}
  <div className="administrator-chains"><h3>Цепочки проживания</h3>{chains.slice(0,20).map((b:Row)=>{
   const job=(data.jobs||[]).find((j:Row)=>j.booking_id===b.id&&j.status!=='cancelled');
   const steps=[['Заявка',['confirmed','completed'].includes(b.status)],['Оплата',b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending'],['Заезд',!!b.terms?.actual_checkin],['Выезд',!!b.terms?.actual_checkout],['Уборка',job?.status==='completed'],['Расчёт',!!job?.settled_at&&(!b.terms?.deposit||!!b.terms?.deposit_returned_at)]] as [string,boolean][];
   return <div className="administrator-chain" key={b.id}><strong>{b.title}</strong><ol>{steps.map(([label,done])=><li className={done?'done':''} key={label}>{done?<CheckCircle2 size={14}/>:<span className="chain-dot"/>}{label}</li>)}</ol></div>;
  })}{!chains.length&&<p>Новые брони появятся здесь вместе со связанными этапами.</p>}{chains.length>20&&<p>Показаны 20 цепочек из {chains.length}. Полный список доступен в бронированиях.</p>}</div>
  {!!admin.issues.length&&<div className="administrator-issues"><h3>Обращения участников</h3>{admin.issues.map((issue:Row)=><Issue key={issue.id+':'+issue.version} issue={issue} canResolve={issue.status==='open'&&(role==='owner'&&issue.owner_id===data.user?.id||issue.other_user===data.user?.id&&issue.other_role===role)} busy={busy} onResolve={onResolve}/>)}</div>}
  <p className="administrator-boundary">Напоминания сохраняются внутри сервиса. Автоматические подтверждения и назначения выполняются по полномочиям владельца в правилах жилья. Факты оплаты, выезда и качества работы подтверждают участники.</p>
 </section>;
}
function Issue({issue,canResolve,busy,onResolve}:{issue:Row;canResolve:boolean;busy:boolean;onResolve:(body:Row)=>void}){
 const [expanded,setExpanded]=useState(false);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);onResolve({id:issue.id,expectedVersion:issue.version,resolution:f.get('resolution')});}
 return <article className="inline-card"><div className="card-eyebrow">{issue.status==='open'?'Открыто':'Решение записано'} · {roles[issue.opened_role]} · {time(issue.created_at)}</div><p>{issue.description}</p>{issue.resolution&&<p><strong>Решение:</strong> {issue.resolution}</p>}{canResolve&&(!expanded?<Button className="inline-button" disabled={busy} onClick={()=>setExpanded(true)}>Записать решение</Button>:<form className="inline-form" onSubmit={submit}><label>Что сделано для решения<Textarea name="resolution" required maxLength={1500} disabled={busy}/></label><Button className="inline-button" disabled={busy}>Сохранить решение и уведомить участника</Button></form>)}</article>;
}
export function AdministratorSettlement({task,data,busy,onConfirm}:{task:Row;data:Row;busy:boolean;onConfirm:(path:string,body:Row)=>void}){
 const job=task.stage==='settlement',item=(job?data.jobs:data.bookings).find((item:Row)=>item.id===task.entity_id);
 if(!item)return <p>Запись уже изменилась. Обновите данные.</p>;
 const action=job?'record_job_payment':task.stage==='deposit-return'?'record_deposit_return':'record_refund';
 const amount=job?Math.max(0,item.fee-(item.settlement_paid||0)):task.stage==='deposit-return'?(item.terms?.deposit_balance??item.terms?.deposit):item.terms?.paid_amount;
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);onConfirm((job?'jobs/':'bookings/')+item.id,{action,expectedVersion:job?item.version:item.terms?.version,note:f.get('note'),confirmed:f.get('confirmed')==='on'});}
 return <form className="inline-card inline-form" onSubmit={submit}><h3>{task.title}</h3><p>{item.title} · {new Intl.NumberFormat('ru-RU').format(amount||0)} ₸</p><p>Отметка относится к оставшейся сумме расчёта. Частичную операцию можно записать в журнале расчётов; спор сначала разберите в обращении.</p><label>Основание отметки<Textarea name="note" required maxLength={1000} disabled={busy}/></label><label className="check-label"><input type="checkbox" name="confirmed" required disabled={busy}/>Я выполнил перевод вне сервиса и проверил сумму. Подтверждаю фактический расчёт.</label><Button className="inline-button" disabled={busy}>Зафиксировать выполненный расчёт</Button></form>;
}
