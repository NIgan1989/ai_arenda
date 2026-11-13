'use client';
import {useEffect,useRef,useState} from 'react';
import {LayoutDashboard,Users,House,ShieldCheck,MessagesSquare,SlidersHorizontal,Activity,Flag,ArrowUpRight,RefreshCw,LogOut,Menu,X,ChevronRight,CheckCircle2,AlertCircle,MapPin,Camera,CalendarDays,Brush,Search,MoreHorizontal,Wallet,type LucideIcon} from 'lucide-react';
import {Brand} from './brand';
import {AdminActivityMap} from './admin-activity-map';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger,SheetClose} from './ui/sheet';
import {AdminIssues} from './admin-issues';
import {AdminReports} from './admin-reports';
import {AdminPolicy} from './admin-policy';
import {AdminRevenue} from './admin-revenue';
import {AdminReviews} from './admin-reviews';
import {AccountSafety} from './safety-controls';
import {logout} from './auth-form';
import {roleNames} from '../lib/access';
import {adminSection,adminSectionPath,type AdminSection} from '../lib/admin-navigation';
import '../app/chat.css';
import '../app/warm-theme.css';
import './platform-admin.css';
type Row=Record<string,any>;
type Section={id:AdminSection;label:string;hint:string;Icon:LucideIcon;group:'service'|'control';count?:string};
const sections:Section[]=[
 {id:'overview',label:'Обзор',hint:'Главное по сервису и задачи, которым нужно внимание.',Icon:LayoutDashboard,group:'service'},
 {id:'users',label:'Пользователи',hint:'Аккаунты, подключённые роли и участие в работе сервиса.',Icon:Users,group:'service'},
 {id:'properties',label:'Недвижимость',hint:'Объявления владельцев, готовность карточек и публикация.',Icon:House,group:'service'},
 {id:'reviews',label:'Проверки',hint:'ИИ проверяет жильё и исполнителей сам, спорное отдаёт вам.',Icon:ShieldCheck,group:'service',count:'reviews'},
 {id:'operator',label:'Обращения',hint:'ИИ ведёт обращения сам, вам приходит только срочное и просроченное.',Icon:MessagesSquare,group:'service',count:'issues'},
 {id:'moderation',label:'Жалобы и безопасность',hint:'ИИ скрывает явные нарушения сам, остальные жалобы решаете вы.',Icon:Flag,group:'control',count:'reports'},
 {id:'policy',label:'Правила допуска',hint:'Какие проверки нужны до показа жилья и назначения исполнителя.',Icon:SlidersHorizontal,group:'control'},
 {id:'revenue',label:'Доход',hint:'Комиссия с владельцев: бесплатный период, прогноз, условия и балансы.',Icon:Wallet,group:'control'},
 {id:'health',label:'Состояние сервиса',hint:'Фоновые проверки, резервные копии и подключения.',Icon:Activity,group:'control'},
];
const labels:Row={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель',pending:'На проверке',approved:'Одобрено',rejected:'Отклонено'};
const jobKinds:Row={owner:'Контроль объектов','finance-history':'История расчётов',calendar:'Календари',discovery:'Поиск задач',delivery:'Доставка уведомлений',backup:'Резервная копия','local-backup':'Локальная резервная копия'};
const jobStates:Row={pending:'В очереди',running:'Выполняется',done:'Завершено',dead:'Требует разбора'};
const integrations:Row={push:'Push-уведомления',telegram:'Telegram',sms:'SMS',whatsapp:'WhatsApp',payments:'Платёжный шлюз'};
const when=(time:number)=>time?new Date(time*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Пока нет данных';
const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(value||0)+' ₸';
async function adminAPI(path:string,body?:Row){
 const r=await fetch('/api/admin/'+path,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const result=await r.json() as Row;
 if(r.status===401){window.location.assign('/signin?next='+encodeURIComponent(window.location.pathname+window.location.search));throw Error('Войдите в аккаунт администратора.');}
 if(!r.ok)throw Error(result.error||'Не удалось выполнить действие.');return result;
}
function AdminNavigation({active,counts,onSelect,disabled=false}:{active:AdminSection;counts:Row;onSelect:(id:AdminSection)=>void;disabled?:boolean}){
 return <nav className="admin-nav" aria-label="Разделы управления">{(['service','control'] as const).map(group=><div className="admin-nav-group" key={group}><span className="admin-nav-caption">{group==='service'?'Сервис':'Контроль и настройки'}</span>{sections.filter(s=>s.group===group).map(({id,label,Icon,count})=><button key={id} type="button" disabled={disabled} aria-current={active===id?'page':undefined} onClick={()=>onSelect(id)}><Icon size={18}/><span>{label}</span>{count&&counts[count]>0&&<b>{counts[count]}</b>}</button>)}</div>)}</nav>;
}
function AdminOverview({data,onSelect}:{data:Row;onSelect:(id:AdminSection)=>void}){
 const c=data.counts,working=data.runtime.ok,StatusIcon=working?CheckCircle2:AlertCircle;
 const queues=[{id:'reviews' as const,label:'Проверки участников',note:c.reviews?'ИИ просит вашего решения':'ИИ проверяет заявки сам',count:c.reviews,Icon:ShieldCheck},{id:'operator' as const,label:'Обращения',note:c.issues?'Срочные и просроченные ждут вас':'ИИ следит за обращениями сам',count:c.issues,Icon:MessagesSquare},{id:'moderation' as const,label:'Жалобы',note:c.reports?'Материалы требуют рассмотрения':'Новых жалоб пока нет',count:c.reports,Icon:Flag}];
 return <><section className={'admin-service-banner '+(working?'is-healthy':'needs-attention')}><span className="admin-service-icon"><StatusIcon size={24}/></span><div><h2>{working?'Сервис работает':'Нужно проверить состояние'}</h2><p>{working?'Сервер и фоновые проверки доступны.':'Посмотрите фоновые задачи и последние резервные копии.'}</p><small>Проверка: {when(data.runtime.serverTime)}</small></div><button type="button" onClick={()=>onSelect('health')} aria-label="Открыть состояние сервиса"><ArrowUpRight size={20}/></button></section>
 <div className="admin-metrics" aria-label="Показатели сервиса">{([{key:'users',label:'Пользователи',Icon:Users},{key:'properties',label:'Объекты',Icon:House},{key:'bookings',label:'Активные брони',Icon:CalendarDays},{key:'jobs',label:'Уборки в работе',Icon:Brush}]).map(({key,label,Icon})=><section className="admin-metric" key={key}><div><span>{label}</span><Icon size={17}/></div><strong>{c[key]}</strong>{key==='properties'&&<small>{c.published} в каталоге</small>}</section>)}</div>
 <AdminActivityMap onProperties={()=>onSelect('properties')} onIssues={()=>onSelect('operator')}/><div className="admin-overview-grid"><section className="admin-surface admin-work-queue"><div className="admin-section-heading"><div><h2>Рабочая очередь</h2><p>Проверки и вопросы участников</p></div><span className="admin-pill">{c.reviews+c.issues+c.reports} новых</span></div>{queues.map(({id,label,note,count,Icon})=><button className="admin-queue-row" key={id} type="button" onClick={()=>onSelect(id)}><span className={'admin-queue-icon '+(count?'has-work':'')}><Icon size={20}/></span><span><strong>{label}</strong><small>{note}</small></span>{count>0?<b>{count}</b>:<CheckCircle2 size={17} className="admin-quiet-check"/>}<ChevronRight size={17}/></button>)}</section>
 <section className="admin-surface admin-listing-quality"><div className="admin-section-heading"><div><h2>Карточки недвижимости</h2><p>Что поможет гостям выбрать жильё</p></div><House size={20}/></div><div className="admin-quality-row"><Camera size={18}/><span>Без фотографий</span><b>{c.withoutPhotos||0}</b></div><div className="admin-quality-row"><MapPin size={18}/><span>Без точки на карте</span><b>{c.unmapped||0}</b></div><p className="admin-quality-note">Показаны опубликованные объекты. Уточнить сведения можно у их владельцев.</p><Button variant="outline" onClick={()=>onSelect('properties')}>Открыть объекты<ArrowUpRight size={16}/></Button></section></div></>;
}
export function PlatformAdmin({name}:{name:string}){
 const [tab,setTab]=useState<AdminSection>('overview'),[menuOpen,setMenuOpen]=useState(false),[data,setData]=useState<Row|null>(null),[summary,setSummary]=useState<Row|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[updatedAt,setUpdatedAt]=useState(0);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0),sequence=useRef(0);
 const section=sections.find(s=>s.id===tab)!;
 function select(id:AdminSection){setMenuOpen(false);setTab(id);const path=adminSectionPath(id);if(window.location.pathname+window.location.search!==path)window.history.pushState(null,'',path);window.scrollTo({top:0,behavior:'instant'});}
 useEffect(()=>{const read=()=>setTab(adminSection(new URLSearchParams(window.location.search).get('section')));read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
 async function refresh(target=tab,p=page,query=search,role=filter){
  const request=++sequence.current;setLoading(true);setError('');
  const path=target==='operator'||target==='policy'?'governance':target==='moderation'?'reports':target==='revenue'?'billing':target;
  try{const value=await adminAPI(path+(['users','properties'].includes(target)?'?'+new URLSearchParams({search:query,role,page:String(p)}):''));if(request===sequence.current){setData({...value,_adminSection:target});setPage(p);setUpdatedAt(Math.floor(Date.now()/1000));if(path==='overview')setSummary(value);}}catch(e:any){if(request===sequence.current)setError(e.message);}finally{if(request===sequence.current)setLoading(false);}
 }
 useEffect(()=>{setData(null);setSearch('');setFilter('');setPage(0);setNotice('');void refresh(tab,0,'','');return()=>{sequence.current++;};},[tab]);
 async function save(path:string,body:Row){setBusy(true);setError('');setNotice('');try{const result=await adminAPI(path,body);setNotice(result.message||'Сохранено.');await refresh();return result;}catch(e:any){setError(e.message);return undefined;}finally{setBusy(false);}}
 const counts=summary?.counts||{},current=data?._adminSection===tab;
 const navigation=<AdminNavigation active={tab} counts={counts} onSelect={select} disabled={busy}/>;
 const accountFooter=<div className="admin-sidebar-footer"><a href="/workspace/guest/map"><ArrowUpRight size={17}/><span>Открыть сервис</span></a><div className="admin-current-user"><span className="admin-avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()}</span><span><strong>{name}</strong><small>Администратор</small></span><button type="button" aria-label="Выйти из аккаунта" onClick={()=>logout().catch(e=>setError(e.message))}><LogOut size={18}/></button></div></div>;
 return <div className="platform-admin-shell"><a className="admin-skip-link" href="#admin-main">К содержимому</a><aside className="platform-admin-sidebar"><Brand subtitle="Управление сервисом"/>{navigation}{accountFooter}</aside>
 <header className="admin-mobile-header"><a className="admin-mobile-brand" href="/admin"><img src="/brand-mark.png" width={30} height={30} alt=""/><span>Управление сервисом</span></a><Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Открыть меню управления"><Menu size={21}/></Button></SheetTrigger><SheetContent side="left" className="admin-navigation-sheet" showCloseButton={false}><SheetHeader><SheetTitle>Управление сервисом</SheetTitle><SheetDescription>Все разделы управляющего кабинета</SheetDescription></SheetHeader><SheetClose asChild><Button variant="ghost" size="icon" className="admin-sheet-close" aria-label="Закрыть меню управления"><X size={20}/></Button></SheetClose>{navigation}{accountFooter}</SheetContent></Sheet></header>
 <main id="admin-main" className="platform-admin-main" tabIndex={-1}><header className="admin-page-header"><div><span className="admin-page-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>{tab==='overview'?'Управление сервисом':section.label}</h1><p>{section.hint}</p></div><div className="admin-refresh"><Button variant="outline" disabled={busy||loading} onClick={()=>refresh()} aria-label="Обновить данные"><RefreshCw size={16} className={loading?'is-spinning':''}/><span>Обновить</span></Button>{updatedAt>0&&<small>Обновлено в {new Date(updatedAt*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'})}</small>}</div></header>
 {error&&<div className="admin-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><Button variant="outline" onClick={()=>refresh()} disabled={loading}>Повторить</Button></div>}{notice&&<p className="admin-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
 {(['users','properties'].includes(tab))&&<form className="admin-search admin-surface" onSubmit={e=>{e.preventDefault();refresh(tab,0);}}><label><span>{tab==='users'?'Поиск пользователей':'Поиск недвижимости'}</span><span className="admin-search-input"><Search size={17}/><Input value={search} onChange={e=>setSearch(e.target.value)} maxLength={100} placeholder={tab==='users'?'Имя или контакт':'Название, город или владелец'}/></span></label>{tab==='users'&&<label><span>Роль</span><NativeSelect value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Все роли</option>{Object.entries(roleNames).map(([id,label])=><option value={id} key={id}>{label}</option>)}</NativeSelect></label>}<Button disabled={loading}>Найти</Button></form>}
 <div className="admin-page-content" aria-busy={loading}>
 {(!current&&loading)?<div className="admin-loading" role="status"><span className="sr-only">Загружаю данные сервиса…</span><div/><div/><div/></div>:current&&data&&<>
 {tab==='overview'&&<AdminOverview data={data} onSelect={select}/>}
 {['users','properties'].includes(tab)&&<><div className="admin-results-label"><span>{tab==='users'?'Пользователей':'Объектов'} найдено: <strong>{data.total}</strong></span><small>Страница {page+1} из {Math.max(1,Math.ceil(data.total/data.limit))}</small></div><div className="admin-records">{tab==='users'?data.users.map((u:Row)=><article className="admin-surface admin-user-record" key={u.id}><span className="admin-avatar" aria-hidden="true">{u.name.slice(0,1).toUpperCase()}</span><div className="admin-record-copy"><h2>{u.name}</h2><p>{u.city||'Город не указан'}</p><div className="admin-role-chips">{u.roles.map((r:string)=><span key={r}>{labels[r]||r}</span>)}</div><details><summary>Контакты и участие<ChevronRight size={14}/></summary><p>{u.contact||'Контакт не указан'}</p><small>Объекты: {u.property_count} · брони: {u.booking_count} · уборки: {u.assignment_count}</small></details></div></article>):data.items.map((p:Row)=><article className="admin-surface admin-property-record" key={p.id}><div className="admin-record-heading"><span className={'admin-pill '+(p.published?'positive':'')}>{p.published?'Опубликовано':'Черновик'}</span><strong>{money(p.price)}<small> / сутки</small></strong></div><h2>{p.title}</h2><p>{p.city} · {p.district}</p><p className="admin-owner-name">{p.owner_name||'Владелец не указан'}</p><div className="admin-property-checks"><span className={p.photos?'complete':'incomplete'}><Camera size={15}/>{p.photos?`Фото: ${p.photos}`:'Нет фотографий'}</span><span className={p.has_location?'complete':'incomplete'}><MapPin size={15}/>{p.has_location?'Точка указана':'Нет точки на карте'}</span></div><small className="admin-property-review"><ShieldCheck size={14}/>{p.review_status?labels[p.review_status]:'Проверка не проведена'}</small></article>)}</div>{data.total===0&&<EmptyState Icon={Search} title="Ничего не найдено" note="Измените запрос или выберите другую роль."/>}<div className="admin-pagination"><Button variant="outline" disabled={loading||page===0} onClick={()=>refresh(tab,page-1)}>Назад</Button><span>{page+1} / {Math.max(1,Math.ceil(data.total/data.limit))}</span><Button variant="outline" disabled={loading||(page+1)*data.limit>=data.total} onClick={()=>refresh(tab,page+1)}>Дальше</Button></div></>}
 {tab==='reviews'&&<AdminReviews data={data} busy={busy} save={save}/>}
 {tab==='operator'&&<AdminIssues state={data} busy={busy} save={save}/>}
 {tab==='policy'&&<AdminPolicy state={data} busy={busy} save={save}/>}
 {tab==='moderation'&&<><AdminReports data={data} busy={busy} save={save}/><details className="reviews-rules"><summary>Удаление аккаунтов и ваши сеансы<ChevronRight size={16}/></summary><div className="admin-safety-extra"><AccountSafety role="guest" admin/></div></details></>}
 {tab==='revenue'&&<AdminRevenue data={data} busy={busy} save={save}/>}
 {tab==='health'&&<AdminHealth data={data} busy={busy} save={save}/>}
 </>}
 </div></main>
 <nav className="admin-bottom-nav" aria-label="Быстрые разделы управления">{sections.filter(s=>['overview','reviews','operator'].includes(s.id)).map(({id,label,Icon})=><button type="button" key={id} aria-current={tab===id?'page':undefined} disabled={busy} onClick={()=>select(id)}><Icon size={21}/><span>{label}</span></button>)}<button type="button" aria-label="Все разделы управления" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><MoreHorizontal size={23}/><span>Ещё</span></button></nav></div>;
}
function EmptyState({Icon,title,note}:{Icon:LucideIcon;title:string;note:string}){return <section className="admin-surface admin-empty"><span><Icon size={27}/></span><h2>{title}</h2><p>{note}</p></section>;}
function AdminHealth({data,busy,save}:{data:Row;busy:boolean;save:(path:string,body:Row)=>Promise<Row|undefined>}){
 return <div className="admin-health-grid"><section className="admin-surface"><div className="admin-section-heading"><h2>Работа сервиса</h2><span className={'admin-pill '+(data.runtime.ok?'positive':'')}>{data.runtime.ok?'В порядке':'Требует внимания'}</span></div><dl className="admin-facts"><div><dt>База данных</dt><dd>{data.runtime.checks.database.ready?'Доступна':'Недоступна'}</dd></div><div><dt>Фоновый контроль</dt><dd>{data.runtime.checks.scheduler?.fresh?'Работает':'Нет свежей проверки'}</dd></div><div><dt>Резервная копия</dt><dd>{when(data.queue.backups?.reduce((max:number,b:Row)=>Math.max(max,b.last_completed||0),0))}</dd></div><div><dt>OpenAI</dt><dd>{data.runtime.checks.configuration.modelConfigured?'Настроен':'Не настроен'}</dd></div><div><dt>Учёт стоимости ИИ</dt><dd>{data.aiBudget.pricingConfigured?'Настроен':'Не настроен'}</dd></div></dl><p className="admin-muted">Состояние этого сервера. Облачное размещение и восстановление из внешних копий проверяются отдельно.</p></section><section className="admin-surface"><h2>Подключения</h2><dl className="admin-facts">{Object.entries(integrations).map(([key,label])=><div key={key}><dt>{String(label)}</dt><dd className={data.integrations[key]?'complete':'admin-muted'}>{data.integrations[key]?'Подключено':'Не подключено'}</dd></div>)}</dl></section><section className="admin-surface admin-health-jobs"><h2>Фоновые задачи</h2>{data.queue.jobs.length===0?<p className="admin-muted">Задач пока нет.</p>:data.queue.jobs.map((j:Row)=><div className="admin-job" key={j.id}><span><strong>{jobKinds[j.kind]||'Фоновая задача'}</strong><small>Успешный запуск: {when(j.last_completed)}</small></span><span className={'admin-pill '+(j.status==='dead'?'warning':'')}>{jobStates[j.status]||j.status}</span>{j.status==='dead'&&<Button variant="outline" disabled={busy} onClick={()=>save('background/retry',{id:j.id})}>Повторить</Button>}</div>)}</section></div>;
}
