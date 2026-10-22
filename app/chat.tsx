'use client';

import {useState,useEffect,useRef,type FormEvent} from 'react';
import {Sparkles,ArrowUp,ArrowUpRight,Check,LoaderCircle,MapPin,Clock3,ShieldCheck,Home,Brush,CalendarDays,RotateCcw,LayoutList,ChevronRight,AlertCircle,Users} from 'lucide-react';
import {WorkspaceNavigation} from '../components/workspace-navigation';
import {AccountControl} from '../components/account-control';
import {RentalCalendar} from '../components/rental-calendar';
import {BookingChanges} from '../components/booking-changes';
import {BookingRequest} from '../components/booking-request';
import {PropertyControl,readinessLabels} from '../components/property-control';
import {AssistantControl} from '../components/assistant-control';
import {roleNames,rolePages,intentRole} from '../lib/access';
import './chat.css';

type Row=Record<string,any>;
type Role='guest'|'owner'|'cleaner';
type Message={id:string;sender:'user'|'assistant';text:string;block?:string;payload?:Row;done?:boolean};
type Question={key:string;text:string;label:string;min?:number;max?:number};
type Flow={kind:'profile'|'property';role:Role;after:string;answers:Row;questions:Question[];index:number};
const empty={properties:[],ownProperties:[],bookings:[],jobs:[],applications:[],notifications:[],messages:[],profile:null,user:null};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const localDate=(hours:number)=>new Date(Date.now()+(hours+5)*3600000).toISOString().slice(0,16);
const labels:Row={requested:'Ожидает подтверждения',confirmed:'Подтверждена',cancelled:'Отменено',expired:'Срок истёк',open:'Можно откликнуться',assigned:'Исполнитель назначен',in_progress:'В работе',submitted:'На проверке',completed:'Завершено',pending:'Отклик отправлен',accepted:'Вы назначены',rejected:'Выбран другой исполнитель'};
const propertyQuestions:Question[]=[
  {key:'title',text:'Как назовём квартиру? Например: «Светлая студия у набережной».',label:'Название'},
  {key:'city',text:'В каком городе находится квартира?',label:'Город'},
  {key:'district',text:'В каком районе? Это поможет гостям найти подходящий вариант.',label:'Район'},
  {key:'address',text:'Напишите точный адрес: улицу, дом и квартиру. Его получат только подтверждённый гость и назначенный исполнитель.',label:'Адрес'},
  {key:'price',text:'Сколько стоит проживание за сутки? Напишите сумму в тенге.',label:'Цена за сутки',min:100,max:10000000},
  {key:'rooms',text:'Сколько в квартире комнат?',label:'Комнаты',min:1,max:20},
  {key:'capacity',text:'Сколько гостей можно разместить?',label:'Гости',min:1,max:50},
  {key:'cleaningMinutes',text:'Сколько минут нужно на уборку между гостями? Обычно 60–90 минут.',label:'Уборка, минут',min:30,max:1440},
  {key:'description',text:'Расскажите об удобствах и правилах: что есть в квартире, когда можно заехать, что важно знать гостю.',label:'Описание и правила'},
];

export default function Chat({workspaceRole,section}:{workspaceRole:Role;section:string}){
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState('');
  const role=workspaceRole;
  const [flow,setFlow]=useState<Flow|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const [online,setOnline]=useState(false);
  const transcript=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),messageCounter=useRef(0),lock=useRef(false);
  const user=data.user,profile=data.profile,myId=user?.id;
  const say=(text:string,block?:string,payload?:Row)=>{const id='message-'+Date.now()+'-'+(++messageCounter.current);setMessages(v=>[...v,{id,sender:'assistant',text,block,payload}]);return id;};
  const finish=(id:string)=>setMessages(v=>v.map(m=>m.id===id?{...m,done:true}:m));
  async function load(){
    const response=await fetch('/api/state',{cache:'no-store',headers:{'X-Workspace-Role':workspaceRole}});const body=await response.json() as Row;
    if(response.status===401||response.status===403){window.location.replace('/');throw new Error('Выберите роль для продолжения.');}
    if(!response.ok)throw new Error(body.error||'Не удалось получить данные.');
    setData(body);setOnline(true);return body;
  }
  useEffect(()=>{load().catch(()=>{setOnline(false);say('Сейчас нет связи с сервером. Можно попробовать подключиться ещё раз.','retry');}).finally(()=>setReady(true));},[]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!lock.current)load().catch(()=>setOnline(false));};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>{const el=transcript.current;if(!el)return;const last=el.querySelector<HTMLElement>('.chat-message:last-child');const top=last&&last.offsetHeight>el.clientHeight-32?last.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop-12:el.scrollHeight;el.scrollTo({top:Math.max(0,top),behavior:'instant'});},[messages.length,flow,busy]);
  useEffect(()=>{if(composer.current){composer.current.style.height='auto';composer.current.style.height=Math.min(composer.current.scrollHeight,140)+'px';}},[input]);
  async function post(path:string,body:Row={}){
    const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':workspaceRole},body:JSON.stringify(body)});
    const result=await response.json() as Row;if(!response.ok)throw new Error(result.error||'Изменение не подтверждено.');return result;
  }
  async function perform(path:string,body:Row,messageId?:string,after?:(state:Row,result:Row)=>void){
    if(lock.current)return;lock.current=true;setBusy(true);
    try{const result=await post(path,body);if(messageId)finish(messageId);const state=await load();say(result.message||'Готово.');after?.(state,result);}
    catch(e:any){say(e.message+' Обновите данные перед повторной попыткой.');}
    finally{lock.current=false;setBusy(false);composer.current?.focus();}
  }
  function signin(intent:string){sessionStorage.setItem('ai-arenda-next-intent',intent);say('Чтобы сохранять ваши квартиры, брони и задания, сначала нужно войти. После входа продолжим здесь.','signin',{intent});}
  function beginProfile(target:Role,after:string,state=data,edit=false){
    if(target!==workspaceRole){say('Эта задача относится к другой роли. Переключите роль через экран входа.');return false;}
    if(!state.user){signin(after);return false;}
    const p=state.profile||{};
    if(!edit&&p.roles&&JSON.parse(p.roles).includes(target))return true;
    const answers:Row={...p,roles:[...new Set([...(p.roles?JSON.parse(p.roles):[]),target])]};
    const questions:Question[]=[{key:'name',text:'Как к вам обращаться?',label:'Имя'},{key:'contact',text:'Как с вами связаться? Напишите телефон или имя пользователя в мессенджере. Контакт не публикуется в общем каталоге.',label:'Контакт'},{key:'city',text:'В каком городе вы планируете пользоваться сервисом?',label:'Город'}];
    if(target==='cleaner')questions.push({key:'districts',text:'В каких районах вам удобно брать уборки?',label:'Районы'},{key:'experience',text:'Расскажите немного об опыте: какие уборки вы выполняете и что умеете?',label:'Опыт'},{key:'availability',text:'В какие дни и часы вы готовы работать?',label:'График'});
    const needed=questions.filter(q=>edit||!String(answers[q.key]||'').trim());

    if(!needed.length){say('Проверьте сведения. Подключу нужную возможность после вашего подтверждения.','profile-review',{answers,target,after});return false;}
    say(target==='cleaner'?'Познакомимся и подготовим вашу анкету. Я задам несколько коротких вопросов.':'Познакомимся. Я задам несколько коротких вопросов, а затем продолжим вашу задачу.');
    setFlow({kind:'profile',role:target,after,answers,questions:needed,index:0});say(needed[0].text);return false;
  }
  function startProperty(state=data){
    if(!beginProfile('owner','property',state))return;
    const answers:Row={};if(state.profile?.city)answers.city=state.profile.city;
    const questions=propertyQuestions.filter(q=>!answers[q.key]);
    say('Добавим квартиру прямо здесь. Сначала соберём сведения, затем я покажу их вам перед публикацией.');
    setFlow({kind:'property',role:'owner',after:'property',answers,questions,index:0});say(questions[0].text);
  }
  function listProperties(state=data,own=false,query=''){
    if((own?'owner':'guest')!==workspaceRole){say('Для этой страницы нужно переключить роль.');return;}
    const budgetMatch=query.match(/(?:до|бюджет)\s*(\d[\d\s]*)(?:тыс|000|₸|тенге)?/i);
    let budget=budgetMatch?Number(budgetMatch[1].replace(/\s/g,'')):null;
    if(budget&&budget<1000&&/тыс/i.test(query))budget*=1000;
    const people=/на двоих|для двоих/i.test(query)?2:Number(query.match(/(\d+)\s*(?:гост|человек)/i)?.[1]||0);
    const city=state.properties.find((p:Row)=>query.toLowerCase().includes(p.city.toLowerCase()))?.city;
    const properties=(own?state.ownProperties:state.properties).filter((p:Row)=>(!budget||p.price<=budget)&&(!people||p.capacity>=people)&&(!city||p.city===city));
    say(properties.length?(own?'Вот ваши квартиры. Можно посмотреть заявки или создать уборку.':'Вот предложения'+(city?' в городе '+city:'')+'. Выберите подходящее — я уточню время и проверю возможность бронирования.'):(own?'У вас пока нет добавленных квартир. Можем подключить первую.':'Подходящих квартир пока нет. Можно изменить запрос или посмотреть учебный пример.'),'properties',{items:properties,own,budget,people});
  }
  function listBookings(state=data,actor=role){
    if(actor!==workspaceRole){say('Для этих бронирований нужно переключить роль.');return;}
    const items=state.bookings.filter((b:Row)=>actor==='owner'?b.owner_id===state.user?.id:b.guest_id===state.user?.id);
    say(items.length?'Вот ваши бронирования. Все даты указаны по времени Павлодара.':'У вас пока нет бронирований. Когда появится заявка, её можно будет проверить прямо в разговоре.','bookings',{items,actor});
  }
  function listJobs(state=data,actor=role,mine=false){
    if(actor!==workspaceRole){say('Для этих заданий нужно переключить роль.');return;}
    const items=state.jobs.filter((j:Row)=>actor==='owner'?j.owner_id===state.user?.id:mine?j.assigned_to===state.user?.id||state.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===state.user?.id):j.status==='open'&&j.end>Date.now()/1000);
    say(items.length?(actor==='owner'?'Вот уборки по вашим квартирам. Здесь можно посмотреть отклики и принять работу.':mine?'Вот ваши отклики и назначения.':'Вот доступные уборки. В карточках — время, район и условия. Адрес появится после назначения.'):(actor==='owner'?'Пока нет заданий. Можем опубликовать уборку по вашей квартире.':mine?'У вас пока нет откликов и назначений.':'Сейчас подходящих открытых уборок нет. Можно подготовить анкету и вернуться к поиску позже.'),'jobs',{items,actor,applications:state.applications});
  }
  function runIntent(intent:string,state=data,target=role){
    const requiredRole=intent==='bookings'&&target==='owner'?'owner':intentRole(intent);
    if(requiredRole&&requiredRole!==workspaceRole){say('Эта задача относится к другой роли. Нажмите «Сменить роль».');return;}
    if(intent==='owner-bookings'){intent='bookings';target='owner';}
    if(intent.startsWith('book:')){const p=state.properties.find((p:Row)=>p.id===intent.slice(5));if(p)chooseProperty(p,state);else say('Квартира больше недоступна. Обновите предложения.');return;}
    if(intent==='property'){startProperty(state);return;}
    if(intent==='cleaner-profile'){if(beginProfile('cleaner','jobs',state))say('Ваша анкета уже сохранена. Могу показать доступные уборки.','choices',{items:[['Показать уборки','Найти уборку'],['Изменить анкету','Изменить анкету']]});return;}
    if(intent==='properties'){listProperties(state);return;}
    if(intent==='workspace'){if(!state.user){signin('workspace');return;}say('Вот ближайшие события и задачи по вашим данным.','workspace',{actor:target});return;}
    if(intent==='own-properties'){if(!beginProfile('owner','own-properties',state))return;listProperties(state,true);return;}
    if(intent==='jobs'){if(!state.user){signin('jobs');return;}listJobs(state,'cleaner');return;}
    if(intent==='my-jobs'){if(!state.user){signin('my-jobs');return;}listJobs(state,'cleaner',true);return;}
    if(intent==='owner-jobs'){if(!beginProfile('owner','owner-jobs',state))return;listJobs(state,'owner');return;}
    if(intent==='bookings'){if(!state.user){signin('bookings');return;}listBookings(state,target);return;}
    if(intent==='job'){if(!beginProfile('owner','job',state))return;if(!state.ownProperties.length){say('Для задания нужна квартира. Давайте сначала добавим её.','choices',{items:[['Добавить квартиру','Хочу сдать квартиру']]});return;}say('Уточним время и условия уборки. Эти сведения увидят исполнители.','job-form',{properties:state.ownProperties});return;}
    if(intent==='profile'){if(!state.user){signin('profile');return;}beginProfile(target,'profile-done',state,true);return;}
    if(intent==='profile-done'){say('Профиль обновлён. Чем займёмся дальше?');return;}
  }
  useEffect(()=>{if(!ready||!data.user)return;const pending=sessionStorage.getItem('ai-arenda-next-intent');if(pending){sessionStorage.removeItem('ai-arenda-next-intent');runIntent(pending,data);}},[ready,data.user?.id]);
  async function send(value=input){
    const text=value.trim();if(!text||lock.current||!ready)return;setInput('');setMessages(v=>[...v,{id:'user-'+Date.now()+'-'+(++messageCounter.current),sender:'user',text}]);
    if(/^(стоп|отмена|отменить ввод|начать сначала)$/i.test(text)){setFlow(null);say('Хорошо, остановимся. Что хотите сделать дальше?');return;}
    if(flow){
      const q=flow.questions[flow.index];let answer:any=text;
      if(q.min!==undefined){answer=Number(text.replace(/\s/g,'').replace(/(?:₸|тенге|минут[аы]?|комнат[аы]?|гост[ьяей]+)\.?$/i,''));if(!Number.isInteger(answer)||answer<q.min||answer>(q.max||Infinity)){say(`Напишите целое число от ${q.min} до ${q.max}.`);return;}}
      else if(text.length>(q.key==='description'?2500:q.key==='experience'?1000:q.key==='name'?100:q.key==='city'?80:q.key==='contact'?120:300)){say('Ответ получился слишком длинным. Напишите, пожалуйста, короче.');return;}
      const answers={...flow.answers,[q.key]:answer}, next=flow.index+1;
      if(next<flow.questions.length){setFlow({...flow,answers,index:next});say(flow.questions[next].text);}
      else{setFlow(null);say(flow.kind==='property'?'Всё собрали. Проверьте сведения перед публикацией.':'Проверьте, правильно ли я вас понял.',flow.kind==='property'?'property-review':'profile-review',{answers,target:flow.role,after:flow.after});}
      return;
    }
    if(/сда(?:ть|вать|ю)|добав.*кварт|подключ.*кварт/i.test(text)){runIntent('property');return;}
    if(/изменить анкет|изменить профил/i.test(text)){runIntent('profile',data,/анкет/i.test(text)?'cleaner':role);return;}
    if(/хочу работ|ищу работ|работать на убор|стать.*исполн|заполн.*анкет/i.test(text)){runIntent('cleaner-profile');return;}
    if(/нужна убор|создать.*убор|заказать.*убор|найти.*(?:уборщ|исполнител)/i.test(text)){runIntent('job');return;}
    if(/мои квартир|мо[иё] жиль/i.test(text)){runIntent('own-properties');return;}
    if(/мои (?:отклик|задан|уборк)|назначени/i.test(text)){runIntent('my-jobs');return;}
    if(/уборк.*моих|мои.*исполнител/i.test(text)){runIntent('owner-jobs');return;}
    if(/найти убор|показать убор|доступн.*убор|свободн.*убор/i.test(text)){runIntent('jobs');return;}
    if(/заявки гост/i.test(text)){runIntent('bookings',data,'owner');return;}
    if(/мои брон|заезд|показать брони/i.test(text)){runIntent('bookings');return;}
    if(/обзор|ближайш|что.*сегодня|что.*внимани/i.test(text)){try{const state=await load();runIntent('workspace',state);}catch(e:any){say(e.message);}return;}
    if(/уведомлен|что нового/i.test(text)){if(!user){signin('workspace');return;}try{const state=await load();say(state.notifications.length?'Вот последние события.':'Пока новых событий нет.','notifications',{items:state.notifications});}catch(e:any){say(e.message);}return;}
    if(/демо|учебн|пример/i.test(text)){say('Могу добавить две учебные квартиры и уборку. Они будут видны только вам; реальное заселение и выплаты по ним невозможны.','demo');return;}
    if(/что.*уме|как.*работ|о сервисе|помощь/i.test(text)){say('Я помогаю снять жильё, подключить квартиры и найти работу по уборке. Всё делаем в этом разговоре: я уточняю сведения, а вы подтверждаете важные действия.\n\nСейчас доступны базовые сценарии. Свободная языковая модель, мессенджеры и автоматические платежи ещё не подключены.','choices',{items:role==='owner'?[['Добавить квартиру','Хочу сдать квартиру'],['Уборки','Создать уборку']]:role==='cleaner'?[['Найти задания','Найти уборку'],['Мои задания','Мои задания']]:[['Найти квартиру','Хочу снять квартиру'],['Мои брони','Мои брони']]});return;}
    if(/(?:квартир|жиль|снять|аренд|посут)/i.test(text)){listProperties(data,false,text);return;}
    say('Помогу. Расскажите, пожалуйста, о вашей задаче: хотите снять жильё, сдавать квартиру или работать на уборке?','choices',{items:role==='owner'?[['Мои квартиры','Мои квартиры']]:role==='cleaner'?[['Мои задания','Мои задания']]:[['Найти квартиру','Хочу снять квартиру']]});
  }
  function chooseProperty(p:Row,state=data){if(!beginProfile('guest','book:'+p.id,state))return;say('Уточним время проживания в «'+p.title+'».','booking-form',{property:p,requestKey:crypto.randomUUID()});}
  async function formSubmit(event:FormEvent<HTMLFormElement>,m:Message,path:string,extra:Row={}){
    event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Row;
    if(values.start)values.start+='+05:00';if(values.end)values.end+='+05:00';
    await perform(path,{...values,...extra},m.id);
  }
  const button=(label:string,fn:()=>void,secondary=false)=><button disabled={busy||!ready} className={secondary?'inline-button secondary':'inline-button'} onClick={fn}>{label}{!secondary&&<ArrowUpRight size={14}/>}</button>;
  function openEvent(event:Row,target:Role){
    const items=(event.kind==='job'?data.jobs:data.bookings).filter((item:Row)=>item.id===event.entityId);
    say(event.kind==='job'?'Задание и его текущий статус.':'Бронирование и доступные действия.',event.kind==='job'?'jobs':'bookings',{items,actor:target,applications:data.applications});
  }
  function renderWorkspace(target:Role){
    const workspace=data.workspaces?.[target];
    if(!workspace)return <div className="inline-card"><p>Обновите данные, чтобы увидеть ближайшие события.</p>{button('Обновить',()=>send('Ближайшие события'))}</div>;
    return <section className="inline-card operations-card" aria-label="Ближайшие события"><div className="card-eyebrow"><LayoutList size={16}/>Ближайшее</div><h3>{target==='owner'?'Квартиры и подготовка заездов':target==='cleaner'?'Ваши задания по уборке':'Ваши поездки'}</h3>
      <div className="operation-counts"><div><strong>{target==='cleaner'?workspace.activeJobs:workspace.activeBookings}</strong><span>{target==='cleaner'?'заданий':'активных броней'}</span></div><div><strong>{workspace.attention.length}</strong><span>требуют внимания</span></div><div><strong>{workspace.unread}</strong><span>новых событий</span></div></div>
      {[['Требует внимания',workspace.attention],['По расписанию',workspace.upcoming]].map(([title,events]:any)=>events.length>0&&<div className="operation-group" key={title}><h4>{title}</h4>{events.slice(0,5).map((event:Row)=><button className={'operation-event '+(event.urgent?'urgent':'')} disabled={busy} key={event.id} onClick={()=>openEvent(event,target)}><span className="event-icon">{event.urgent?<AlertCircle size={19}/>:event.kind==='job'?<Brush size={19}/>:<CalendarDays size={19}/>}</span><span><strong>{event.title}</strong><span>{event.detail}</span><small>{date(event.at)}</small></span><ChevronRight size={17}/></button>)}</div>)}
      {!workspace.attention.length&&!workspace.upcoming.length&&<p className="workspace-empty">Ближайших событий пока нет. {target==='owner'?'Можно подключить квартиру или создать уборку.':target==='cleaner'?'Посмотрите доступные уборки.':'Расскажите, где и когда хотите остановиться.'}</p>}
      <div className="inline-actions">{button(target==='owner'?'Мои квартиры':target==='cleaner'?'Найти уборку':'Найти квартиру',()=>runIntent(target==='owner'?'own-properties':target==='cleaner'?'jobs':'properties'),true)}{button('Все события',()=>send('Что нового'),true)}</div><small className="updated-at">Обновлено: {date(workspace.generatedAt)}</small>
    </section>;
  }
  function bookingControls(b:Row,owner:boolean){
    if(b.status!=='confirmed')return null;
    const confirm=(action:string,text:string)=>say(text,'booking-action',{id:b.id,action});
    return <div className="inline-actions">{owner&&b.terms?.deposit_status==='pending'&&button('Подтвердить депозит',()=>confirm('deposit_received','Подтвердите, что вы проверили фактическое поступление депозита '+money(b.terms.deposit)+'.'),true)}{owner&&b.start<=data.serverTime&&!b.terms?.actual_checkin&&button('Подтвердить заселение',()=>confirm('checkin','Подтвердите фактическое заселение гостя. Квартира должна быть готова, оплата и депозит проверены.'))}{owner&&b.start<=data.serverTime&&button('Подтвердить выезд',()=>confirm('checkout','Подтвердите, что гость выехал и квартира освобождена. После этого она будет ожидать уборки.'),true)}{!owner&&b.start<=data.serverTime&&!b.terms?.checkout_reported_at&&button('Сообщить о выезде',()=>confirm('report_checkout','Подтвердите, что вы выехали. Освобождение квартиры проверит владелец.'),true)}</div>;
  }
  function openAssistantTask(task:Row){
    if(task.kind==='setup'){runIntent(task.intent);return;}
    if(task.kind==='property'){const p=data.ownProperties.find((p:Row)=>p.id===task.entityId);if(p)say(task.reason,'property-settings',{id:p.id});return;}
    const source=task.kind==='job'?data.jobs:data.bookings,items=source.filter((item:Row)=>item.id===task.entityId);
    if(items.length)say(task.reason,task.kind==='job'?'jobs':'bookings',{items,actor:role,applications:data.applications});
  }
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <section className="inline-card assistant-brief" aria-label="План ассистента"><div className="card-eyebrow"><Sparkles size={17}/>План ассистента</div><h3>{brief.summary}</h3>{brief.tasks.map((task:Row)=><button key={task.id} disabled={busy} className={'assistant-task '+(task.priority===3?'urgent':'')} onClick={()=>openAssistantTask(task)}><span><strong>{task.title}</strong><small>{task.reason}</small></span><ChevronRight size={18}/></button>)}<p>Действия выполняются через проверяемые операции платформы. Фоновая доставка сообщений пока не подключена.</p></section>;}
  useEffect(()=>{
    const brief=data.assistantBrief,settings=data.assistantSettings;
    if(!ready||busy||flow||section==='settings'||!brief?.automatic||!brief.signature||!myId)return;
    const key='rental-assistant:'+myId+':'+role,last=Number(sessionStorage.getItem(key+':time')||0),signature=sessionStorage.getItem(key+':signature');
    if(signature===brief.signature&&Date.now()-last<settings.repeatMinutes*60000)return;
    sessionStorage.setItem(key+':time',String(Date.now()));sessionStorage.setItem(key+':signature',brief.signature);
    say('Предлагаю начать с задачи: '+brief.prompts[0].title.toLowerCase()+'.',section==='assistant'?undefined:'assistant-brief');
  },[ready,data.assistantBrief?.signature,data.assistantBrief?.automatic,busy,flow,section]);
  function renderBlock(m:Message){
    const p={...(m.payload||{})};
    if(['properties','bookings','jobs'].includes(m.block||'')){
      const source=m.block==='properties'?(p.own?data.ownProperties:data.properties):m.block==='bookings'?data.bookings:data.jobs;
      p.items=(p.items||[]).map((item:Row)=>source.find((current:Row)=>current.id===item.id)).filter(Boolean);p.applications=data.applications;
    }
    if(m.block==='notifications')p.items=data.notifications;
    if(m.block==='assistant-brief')return renderAssistantBrief();
    if(m.done)return <div className="done"><Check size={14}/>Сохранено</div>;
    if(m.block==='booking-action')return button('Подтверждаю',()=>perform('bookings/'+p.id,{action:p.action},m.id));
    if(m.block==='property-settings'){const property=data.ownProperties.find((item:Row)=>item.id===p.id);return property?<PropertyControl key={property.id+':'+property.policy.version} property={property} busy={busy} onSave={body=>perform('properties/'+property.id+'/policy',body)} onReadiness={body=>perform('properties/'+property.id+'/readiness',body)}/>:<p>Квартира больше недоступна.</p>;}
    if(m.block==='signin')return <a className="inline-button" href="/signin-with-chatgpt?return_to=/" target="_top">Войти и продолжить<ArrowUpRight size={14}/></a>;
    if(m.block==='retry')return button('Подключиться снова',async()=>{try{await load();finish(m.id);say('Связь восстановлена. Продолжим.');}catch{say('Пока не удалось подключиться. Попробуйте чуть позже.');}});
    if(m.block==='choices')return <div className="inline-actions">{p.items.map(([label,text]:string[])=><button key={label} disabled={busy} onClick={()=>send(text)}>{label}<ArrowUpRight size={13}/></button>)}</div>;
    if(m.block==='demo')return button('Добавить учебный пример',()=>{if(!user){signin('properties');return;}perform('demo',{},m.id,(state)=>role==='owner'?listProperties(state,true):role==='cleaner'?listJobs(state,'cleaner'):listProperties(state));});
    if(m.block==='profile-review')return <div className="inline-card"><dl>{['name','contact','city',...(p.target==='cleaner'?['districts','experience','availability']:[])].map(key=><div key={key}><dt>{({name:'Имя',contact:'Контакт',city:'Город',districts:'Районы',experience:'Опыт',availability:'График'} as Row)[key]}</dt><dd>{p.answers[key]}</dd></div>)}</dl>{p.target==='cleaner'&&<small>Это анкета для откликов. Назначение на уборку подтверждает заказчик.</small>}<div className="inline-actions">{button('Всё верно, сохранить',()=>perform('profile',p.answers,m.id,state=>runIntent(p.after,state,p.target)))}{button('Заполнить заново',()=>{finish(m.id);beginProfile(p.target,p.after,{...data,profile:null});},true)}</div></div>;
    if(m.block==='property-review')return <div className="inline-card"><h3><Home size={17}/>{p.answers.title}</h3><dl>{propertyQuestions.filter(q=>q.key!=='title').map(q=><div key={q.key}><dt>{q.label}</dt><dd>{q.key==='price'?money(p.answers[q.key]):p.answers[q.key]}</dd></div>)}</dl><small><ShieldCheck size={13}/>Точный адрес скрыт от общего каталога.</small><div className="inline-actions">{button('Опубликовать квартиру',()=>perform('properties',p.answers,m.id))}{button('Заполнить заново',()=>{finish(m.id);startProperty();},true)}</div></div>;
    if(m.block==='properties')return <div className="inline-list">{p.items.map((item:Row)=><div className="inline-card" key={item.id}><div className="card-meta"><MapPin size={13}/>{item.city}, {item.district}{item.demo_owner&&<span className="tag">Учебная</span>}</div><h3>{item.title}</h3><p>{item.description}</p><small>{item.rooms} комн. · до {item.capacity} гостей · уборка {item.cleaning_minutes} мин.</small><div className="card-bottom"><strong>{money(item.price)}<small> / сутки</small></strong>{button(p.own?'Создать уборку':'Выбрать',()=>p.own?runIntent('job'):chooseProperty(item))}{p.own&&button('Тарифы и готовность',()=>say('Правила и готовность квартиры.','property-settings',{id:item.id}),true)}</div></div>)}{!p.items.length&&<div className="inline-actions">{button(p.own?'Добавить квартиру':'Показать пример',()=>send(p.own?'Хочу сдать квартиру':'Покажи учебный пример'))}</div>}{p.own&&p.items.length>0&&<div className="inline-actions">{button('Заявки гостей',()=>runIntent('bookings',data,'owner'),true)}{button('Уборки по квартирам',()=>runIntent('owner-jobs'),true)}</div>}</div>;
    if(m.block==='booking-form')return <BookingRequest property={data.properties.find((item:Row)=>item.id===p.property.id)||p.property} requestKey={p.requestKey} disabled={busy} onQuote={body=>post('quote',body)} onConfirm={body=>perform('bookings',body,m.id,state=>runIntent('bookings',state))}/>;
    if(m.block==='workspace')return renderWorkspace(p.actor||role);
    if(m.block==='job-form')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,'jobs')}><label>Какая квартира?<select name="propertyId" required>{p.properties.map((x:Row)=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label><div className="input-row"><label>Начало<input name="start" type="datetime-local" required defaultValue={localDate(24)}/></label><label>Окончание<input name="end" type="datetime-local" required defaultValue={localDate(26)}/></label></div><label>Вознаграждение, ₸<input name="fee" type="number" min={100} max={1000000} defaultValue={4000} required/></label><label>Что нужно сделать?<textarea name="description" required maxLength={2000} placeholder="Состав работ, средства, бельё и другие условия"/></label><small>Время Павлодара, UTC+5. Исполнители увидят район и условия, точный адрес — после назначения.</small><button className="inline-button" disabled={busy}>Опубликовать задание<ArrowUpRight size={14}/></button></form>;
    if(m.block==='confirm-booking')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,'bookings/'+p.id,{action:'confirm'})}><label>Стоимость уборки после выезда, ₸<input name="cleaningFee" type="number" min={0} max={1000000} defaultValue={4000}/></label><small>При сумме больше нуля задание на уборку создастся автоматически. Подтверждение брони не подтверждает поступление оплаты.</small><button className="inline-button" disabled={busy}>Подтвердить бронь<Check size={14}/></button></form>;
    if(m.block==='bookings')return <div className="inline-list">{p.items.map((b:Row)=><div key={b.id} className="inline-card"><div className="card-meta"><CalendarDays size={13}/>{labels[b.status]}{b.demo_owner&&<span className="tag">Учебная</span>}</div><h3>{b.title}</h3><p>{date(b.start)} → {date(b.end)}</p><small>{b.guests} гостей · {money(b.amount)} · {b.payment_status==='owner_verified'?'Оплата отмечена владельцем':'Оплата не подтверждена'}</small>{b.terms&&<small>Депозит: {money(b.terms.deposit)} · {b.terms.deposit_status==='owner_verified'?'подтверждён владельцем':b.terms.deposit?'ожидается':'не требуется'}{b.readiness?' · '+readinessLabels[b.readiness]:''}</small>}{bookingControls(b,p.actor==='owner')}{b.terms&&<small>Подтверждённая оплата: {money(b.terms.paid_amount||0)} · остаток: {money(Math.max(0,b.amount-(b.terms.paid_amount||0)))}</small>}<BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={p.actor} busy={busy} onQuote={body=>post('bookings/'+b.id+'/change-quote',body)} onPropose={body=>perform('bookings/'+b.id+'/changes',body)} onDecide={(id,action)=>perform('bookings/'+b.id+'/changes/'+id,{action})}/>{b.address&&<p className="private"><ShieldCheck size={13}/>{b.address}{b.owner_contact?' · '+b.owner_contact:''}</p>}<div className="inline-actions">{p.actor==='owner'&&b.status==='requested'&&button('Подтвердить',()=>say('Подтвердим заявку на «'+b.title+'»?','confirm-booking',b))}{p.actor==='owner'&&b.status==='confirmed'&&b.payment_status!=='owner_verified'&&button('Отметить оплату',()=>say('Вы проверили фактическое поступление '+money(b.amount)+'? Эта отметка не выполняет банковскую операцию.','payment',{id:b.id,amount:b.amount}),true)}{['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&button('Отменить',()=>say('Отменить бронь «'+b.title+'»? Возврат оплаты, если потребуется, согласуется отдельно.','cancel',{id:b.id}),true)}{button('Сообщить о проблеме',()=>say('Опишите ситуацию. Обращение будет сохранено у другого участника брони.','issue',{id:b.id,kind:'booking'}),true)}</div></div>)}{!p.items.length&&button(role==='owner'?'Мои квартиры':'Подобрать квартиру',()=>runIntent(role==='owner'?'own-properties':'properties'))}</div>;
    if(m.block==='payment')return button('Да, поступление проверено',()=>perform('bookings/'+p.id,{action:'paid',expectedAmount:p.amount},m.id));
    if(m.block==='cancel')return button('Подтвердить отмену',()=>perform('bookings/'+p.id,{action:'cancel'},m.id));
    if(m.block==='jobs')return <div className="inline-list">{p.items.map((j:Row)=>{const owner=p.actor==='owner',assigned=j.assigned_to===myId,apps=(p.applications||[]).filter((a:Row)=>a.job_id===j.id),applied=apps.find((a:Row)=>a.user_id===myId);return <div className="inline-card" key={j.id}><div className="card-meta"><Brush size={13}/>{labels[j.status]}{j.demo_owner&&<span className="tag">Учебное</span>}</div><h3>{j.title}</h3><p>{j.city}, {j.district} · {date(j.start)} — {date(j.end)}</p><p>{j.description}</p><strong>{money(j.fee)}<small> за выполнение</small></strong>{j.address&&<p className="private"><ShieldCheck size={13}/>{j.address}{j.owner_contact?' · '+j.owner_contact:''}</p>}{j.report&&<p className="report">Отчёт: {j.report}</p>}{owner&&j.status==='open'&&apps.filter((a:Row)=>a.status==='pending').map((a:Row)=><div className="applicant" key={a.id}><b>{a.name}</b><small>{a.experience} · {a.availability}</small>{button('Назначить исполнителя',()=>perform('jobs/'+j.id,{action:'assign',applicationId:a.id},m.id))}</div>)}<div className="inline-actions">{!owner&&j.status==='open'&&(!applied||applied.status==='rejected')&&button('Откликнуться',()=>{if(beginProfile('cleaner','jobs'))perform('jobs/'+j.id,{action:'apply'},m.id);})}{applied&&!assigned&&<small>{labels[applied.status]}</small>}{assigned&&j.status==='assigned'&&(j.checkout_confirmed?button('Начать уборку',()=>perform('jobs/'+j.id,{action:'start'},m.id)):<small>Ожидаем подтверждения выезда гостя.</small>)}{assigned&&j.status==='in_progress'&&button('Отправить отчёт',()=>say('Проверьте результат и опишите выполненную работу.','report',{id:j.id}))}{owner&&j.status==='submitted'&&button('Принять работу',()=>perform('jobs/'+j.id,{action:'approve'},m.id))}{(owner||assigned)&&button('Есть проблема',()=>say('Что произошло? Сохраню обращение для другого участника задания.','issue',{id:j.id,kind:'job'}),true)}</div></div>;})}<div className="inline-actions">{p.actor==='owner'?button('Создать уборку',()=>runIntent('job'),true):<>{button('Мои отклики и работа',()=>runIntent('my-jobs'),true)}{button('Заполнить анкету',()=>runIntent('cleaner-profile'),true)}</>}</div></div>;
    if(m.block==='report')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,'jobs/'+p.id,{action:'submit',checklist:[true,true,true,true]})}>{['Кухня и санузел убраны','Бельё заменено','Мусор вынесен, поверхности чистые','Вода и электроприборы проверены'].map(text=><label key={text} className="check-label"><input type="checkbox" required/>{text}</label>)}<label>Отчёт<textarea name="report" required maxLength={1500} placeholder="Что сделано? Есть ли замечания?"/></label><small>Приёмку выполняет заказчик. Загрузка фотографий и выплаты пока не подключены.</small><button className="inline-button" disabled={busy}>Отправить на проверку<ArrowUpRight size={14}/></button></form>;
    if(m.block==='issue')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,(p.kind==='job'?'jobs/':'bookings/')+p.id,{action:'issue'})}><label>Что произошло?<textarea name="issue" required maxLength={1500} placeholder="Опишите ситуацию"/></label><small>Для срочной помощи свяжитесь с ответственным по контакту в подтверждённой брони или назначенном задании.</small><button className="inline-button" disabled={busy}>Передать обращение<ArrowUpRight size={14}/></button></form>;
    if(m.block==='notifications')return <div className="inline-list">{p.items.map((n:Row)=><div className="inline-card" key={n.id}><p>{n.body}</p><small>{date(n.created_at)}</small></div>)}</div>;
    return null;
  }
  const page=rolePages[role].find(p=>p.id===section)!;
  const primary:Message={id:'page-'+section,sender:'assistant',text:'',block:section==='overview'?'workspace':section==='catalog'||section==='properties'?'properties':section==='bookings'?'bookings':section==='cleaning'||section==='jobs'||section==='assignments'?'jobs':undefined,payload:{actor:role,own:role==='owner',items:section==='catalog'?data.properties:section==='properties'?data.ownProperties:section==='bookings'?data.bookings:section==='assignments'?data.jobs.filter((j:Row)=>j.assigned_to===myId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===myId)):data.jobs,applications:data.applications}};
  return <div className="chat-app workspace-shell"><WorkspaceNavigation role={role} section={section}/><div className="workspace-content"><header className="chat-header"><button className="chat-logo" onClick={()=>composer.current?.focus()} aria-label="AI Аренда — перейти к вводу сообщения"><span><Sparkles size={22} strokeWidth={1.7}/></span><span className="brand-copy">AI Аренда<small>{roleNames[role]} · своё рабочее пространство</small></span></button><div className="header-actions"><a className="about-button" href="/">Сменить роль</a><span className={'connection-status '+(!online?'offline':'')} role="status"><i/>{!ready?'Подключаюсь':online?'Есть связь':'Нет связи'}</span><button className="about-button" disabled={busy||!!flow} onClick={()=>send('Как всё работает?')}>Помощь<ArrowUpRight size={15}/></button></div></header>

    <main className="chat-main"><div className={'chat-transcript '+(!messages.length?'is-empty':'')} ref={transcript}>
      <div className="role-page-heading"><span className="welcome-eyebrow">{roleNames[role]}</span><h1>{page.title}</h1>{section==='properties'&&button('Добавить квартиру',()=>runIntent('property'))}{section==='cleaning'&&button('Создать уборку',()=>runIntent('job'))}</div>
      {!ready?<p role="status">Загружаю страницы вашей роли…</p>:section==='settings'&&data.assistantSettings?<AssistantControl key={role+':'+data.assistantSettings?.version} settings={data.assistantSettings} busy={busy} modelConfigured={!!data.integrations?.ai} onSave={body=>perform('assistant-settings',body)}/>:section==='account'?<AccountControl role={role} onEdit={()=>runIntent('profile',data,role)}/>:section==='calendar'?<RentalCalendar data={data} role={role} busy={busy} onOpen={(kind,id)=>say('Текущий статус и доступные действия.',kind==='job'?'jobs':'bookings',{items:(kind==='job'?data.jobs:data.bookings).filter((v:Row)=>v.id===id),actor:role,applications:data.applications})}/>:section==='assistant'?renderAssistantBrief():primary.block&&renderBlock(primary)}
      {!messages.length?<div className="role-assistant-intro"><Sparkles size={20}/><p>{section==='assistant'?'Ассистент работает с задачами вашей роли. Напишите, чем помочь.':'Ассистент поможет с действиями на этой странице. Выберите действие или напишите сообщение.'}</p></div>:<div className="chat-messages" aria-live="polite" aria-relevant="additions">{messages.map(m=><div key={m.id} className={'chat-message '+m.sender}>{m.sender==='assistant'&&<div className="assistant-mark" aria-hidden="true"><Sparkles size={18}/></div>}<div className="message-content"><p>{m.text}</p>{m.block&&renderBlock(m)}</div></div>)}{busy&&<div className="chat-message assistant" role="status"><div className="assistant-mark"><Sparkles size={18}/></div><div className="thinking"><LoaderCircle size={16}/>Проверяю данные…</div></div>}</div>}
    </div><div className="chat-bottom">{flow&&<div className="flow-progress"><span>Вопрос {flow.index+1} из {flow.questions.length} · {flow.questions[flow.index].label}</span><div>{flow.index>0&&<button disabled={busy} onClick={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}>Назад</button>}<button disabled={busy} onClick={()=>{setFlow(null);say('Ввод остановлен. Можем начать другую задачу.');}}>Остановить</button></div></div>}<form className="chat-composer" onSubmit={e=>{e.preventDefault();send();}}><textarea ref={composer} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} rows={1} maxLength={2500} disabled={busy||!ready} placeholder={flow?'Напишите ваш ответ…':role==='owner'?'Например: создать уборку…':role==='cleaner'?'Например: найти уборку…':'Например: нужна квартира для двоих…'} aria-label="Сообщение AI Аренде"/><button className="chat-send" disabled={busy||!ready||!input.trim()} aria-label="Отправить сообщение">{busy?<LoaderCircle size={21}/>:<ArrowUp size={23}/>}</button></form><div className="chat-footnote"><span>AI Аренда · пилотная версия</span><span>Enter — отправить · Shift+Enter — новая строка</span></div></div></main></div></div>;
}
