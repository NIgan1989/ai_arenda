'use client';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';

import {useState,useEffect,useRef,type FormEvent} from 'react';
import {MessagesSquare,Ellipsis,CircleHelp,Sparkles,ArrowUp,ArrowUpRight,Check,LoaderCircle,MapPin,Clock3,ShieldCheck,Home,Brush,CalendarDays,RotateCcw,LayoutList,ChevronRight,AlertCircle,Users,WifiOff} from 'lucide-react';
import {ActivityClockProvider,ActivityTimer} from '../components/activity-clock';
import {ApprovalCard,ApprovalInbox,DecisionPrompt} from '../components/approval-card';
import {WorkspaceNavigation} from '../components/workspace-navigation';
import {PropertyListing,PropertyEditor} from '../components/property-listing';
import {CleanerCard} from '../components/profile-editor';
import {AccountControl} from '../components/account-control';
import {RentalCalendar} from '../components/rental-calendar';
import {BookingChanges} from '../components/booking-changes';
import {BookingRequest} from '../components/booking-request';
import {PropertyControl,readinessLabels} from '../components/property-control';
import {AdministratorPanel,AdministratorSettlement} from '../components/administrator-panel';
import {OperationsHub} from '../components/operations-hub';
import {AdministratorCommands} from '../components/administrator-commands';
import {useQueryClient,isCancelledError} from '@tanstack/react-query';
import {RecordCollection} from '../components/patterns/record-collection';
import {processStatus} from '../lib/process-status';
import {MapWorkspace} from '../components/map-workspace';
import {PropertyQuick} from '../components/property-quick';
import {TaskSheet} from '../components/task-sheet';
import {CatalogPage} from '../components/catalog-page';
import {PageSkeleton} from '../components/patterns/page-skeleton';
import {AdministratorOrb} from '../components/administrator-orb';
import {AdministratorConversation} from '../components/administrator-conversation';
import {ChatInbox} from '../components/chat-inbox';
import {ProcessDiscussion} from '../components/process-discussion';
import {discussionIntent} from '../lib/discussion-intent';
import {JobOperations} from '../components/job-operations';
import {CleaningReport} from '../components/cleaning-report';
import {rolePages,intentRole} from '../lib/access';
import {Brand} from '../components/brand';
import {takeAiAsk} from '../lib/ai-line';
import {defaultStay} from '../lib/map-search-request';
import {WorkspaceOverview} from '../components/workspace-overview';
import './chat.css';
import './warm-theme.css';
import '../components/administrator.css';
import '../components/operations.css';

type Row=Record<string,any>;
type Role='guest'|'owner'|'cleaner';
type Message={id:string;sender:'user'|'assistant';text:string;block?:string;payload?:Row;done?:boolean;outcome?:string};
type Question={key:string;text:string;label:string;min?:number;max?:number};
type Flow={kind:'profile'|'property';role:Role;after:string;answers:Row;questions:Question[];index:number};
const empty={properties:[],ownProperties:[],bookings:[],jobs:[],applications:[],notifications:[],messages:[],profile:null,user:null};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).replace(' в ',', ');
// A record opened on its own (direct) is shown as it is now, not as it was when it was opened.
const current=(p:Row,source:Row[]):Row[]=>p.direct?p.items.map((item:Row)=>source.find((v:Row)=>v.id===item.id)||item):p.items;
const guestCount=(n:number)=>{const tens=n%100,units=n%10;return n+' '+(tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей');};
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

export default function Chat({workspaceRole,section,accountId}:{workspaceRole:Role;section:string;accountId:string}){
  const queryClient=useQueryClient();
  const accountActionPending=useRef(false),accountClosed=useRef(false),[closedResult,setClosedResult]=useState<Row|null>(null);
  const [mapActionOpen,setMapActionOpen]=useState(false),[administratorNotice,setAdministratorNotice]=useState<{text:string;error:boolean}|null>(null);
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState('');
  const role=workspaceRole;
  const entryHandled=useRef(false),pendingBooking=useRef<{property:Row;initial?:Row}|null>(null);
  const [flow,setFlow]=useState<Flow|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const [online,setOnline]=useState(false),[reconnecting,setReconnecting]=useState(false),leaving=useRef(false);
  const [administratorSearchRequest,setAdministratorSearchRequest]=useState(0);
  const [discussion,setDiscussion]=useState<Row|null>(null);
  const [administratorOpen,setAdministratorOpen]=useState(false),[administratorRequest,setAdministratorRequest]=useState<{id:string;text:string}|null>(null);
  const openAdministrator=(request?:string)=>{const from=document.activeElement;if(from instanceof HTMLElement&&from!==document.body)administratorOpener.current=from;setAdministratorRequest(typeof request==='string'&&request.trim()?{id:crypto.randomUUID(),text:request}:null);setDiscussion(null);setMapActionOpen(false);setAdministratorOpen(true);};
  // Focus returns to what opened the administrator: the AI line on the map, the round button on other pages.
  const closeAdministrator=()=>{setAdministratorSearchRequest(0);setAdministratorOpen(false);requestAnimationFrame(()=>{const from=administratorOpener.current,touch=window.matchMedia('(pointer: coarse)').matches;administratorOpener.current=null;const target=from?.isConnected?(touch&&from.matches('input,textarea')?from.closest<HTMLElement>('form[tabindex]')||from:from):assistantTrigger.current||document.querySelector<HTMLElement>('.map-home-ai-form');target?.focus({preventScroll:true});});};
  useEffect(()=>{const open=()=>openAdministrator();window.addEventListener('administrator-open',open);return()=>window.removeEventListener('administrator-open',open);},[]);
  useEffect(()=>setDiscussion(null),[role]);
  const assistantTrigger=useRef<HTMLButtonElement>(null),administratorOpener=useRef<HTMLElement|null>(null);
  const transcript=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),messageCounter=useRef(0),lock=useRef(false);
  useEffect(()=>{const pending=(event:Event)=>{accountActionPending.current=(event as CustomEvent<boolean>).detail===true;if(!accountClosed.current)lock.current=accountActionPending.current;};window.addEventListener('rental-account-action-pending',pending);return()=>window.removeEventListener('rental-account-action-pending',pending);},[]);
  useEffect(()=>{const close=(event:Event)=>{const result=(event as CustomEvent<Row>).detail;if(!result?.signOut)return;accountClosed.current=true;lock.current=true;void queryClient.cancelQueries().catch(()=>{});queryClient.clear();setData(empty);setMessages([]);setFlow(null);setInput('');setDiscussion(null);setAdministratorOpen(false);setMapActionOpen(false);setClosedResult(result);if(!result.receipt)window.location.replace('/signin');};window.addEventListener('rental-account-signed-out',close);return()=>window.removeEventListener('rental-account-signed-out',close);},[queryClient]);
  const user=data.user,profile=data.profile,myId=user?.id;
  const showDiscussion=(context:Row)=>{setAdministratorOpen(false);setMapActionOpen(false);window.dispatchEvent(new Event('process-discussion-open'));setDiscussion(context);};
  const say=(text:string,block?:string,payload?:Row)=>{if(['map','chats'].includes(section))setMapActionOpen(true);const id='message-'+Date.now()+'-'+(++messageCounter.current);setMessages(v=>[...v,{id,sender:'assistant',text,block,payload}]);return id;};
  const finish=(id:string,outcome='Сохранено')=>setMessages(v=>v.map(m=>m.id===id?{...m,done:true,outcome}:m));
  async function load(){
    if(accountClosed.current)return empty;
    const includeCatalog=!(workspaceRole==='guest'&&['catalog','map'].includes(section)&&!new URLSearchParams(window.location.search).has('book'));
    const body=await queryClient.fetchQuery({queryKey:['workspace',accountId,workspaceRole,includeCatalog],staleTime:0,queryFn:async({signal})=>{const response=await fetch('/api/state'+(!includeCatalog?'?catalog=0':''),{signal,cache:'no-store',headers:{'X-Workspace-Role':workspaceRole}});const value=await response.json() as Row;if(accountClosed.current||accountActionPending.current)return empty;if(response.status===401||response.status===403){leaving.current=true;queryClient.clear();window.location.replace('/signin?next='+encodeURIComponent(window.location.pathname+window.location.search));throw Error('Войдите для продолжения.');}if(!response.ok)throw Error(value.error||'Не удалось получить данные.');return value;}});
    if(accountClosed.current||accountActionPending.current)return empty;setData(body);setOnline(true);return body;
  }
  // The notice appears only when the server could not be reached; a cancelled request or a sign-in redirect is not a lost connection.
  function connectionLost(error:unknown){if(isCancelledError(error)||leaving.current||accountClosed.current)return;setOnline(false);}
  async function reconnect(){if(reconnecting)return;setReconnecting(true);try{await load();}catch(error){connectionLost(error);}finally{setReconnecting(false);}}
  useEffect(()=>{load().then(state=>{if(section==='assistant'&&state.messages?.length)setMessages(state.messages.filter((m:Row)=>['user','assistant'].includes(m.sender)).slice(-50).map((m:Row)=>({id:m.id,sender:m.sender,text:m.body})));}).catch(connectionLost).finally(()=>setReady(true));},[]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!lock.current)load().catch(connectionLost);};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[]);
  useEffect(()=>{const el=transcript.current;if(!el||!messages.length)return;const last=el.querySelector<HTMLElement>('.chat-message:last-child');const top=last&&last.offsetHeight>el.clientHeight-32?last.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop-12:el.scrollHeight;el.scrollTo({top:Math.max(0,top),behavior:'instant'});},[messages.length,flow,busy]);
  useEffect(()=>{if(composer.current){composer.current.style.height='auto';composer.current.style.height=Math.min(composer.current.scrollHeight,140)+'px';}},[input]);
  async function post(path:string,body:Row={}){
    await queryClient.cancelQueries({queryKey:['workspace',accountId,workspaceRole]});
    const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':workspaceRole},body:JSON.stringify(body)});
    const result=await response.json() as Row;if(!response.ok)throw new Error(result.error||'Изменение не подтверждено.');await queryClient.invalidateQueries({queryKey:['workspace',accountId,workspaceRole]});await queryClient.invalidateQueries({queryKey:['catalog',accountId,workspaceRole]});await queryClient.invalidateQueries({queryKey:['map-workspace',accountId,workspaceRole]});return result;
  }
  async function perform(path:string,body:Row,messageId?:string,after?:(state:Row,result:Row)=>void,propagateError=false){
    if(lock.current)return;lock.current=true;setBusy(true);
    try{const result=await post(path,body);if(messageId)finish(messageId);const state=await load();say(result.message||'Готово.');after?.(state,result);}
    catch(e:any){if(propagateError)throw e;say(e.message+' Обновите данные перед повторной попыткой.');}
    finally{lock.current=false;setBusy(false);composer.current?.focus();}
  }
  async function administratorAction(path:string,body:Row={}){if(lock.current)return;lock.current=true;setBusy(true);setAdministratorNotice(null);try{const result=await post(path,body);await load();setAdministratorNotice({text:result.message||'Данные обновлены.',error:false});}catch(e:any){setAdministratorNotice({text:e.message,error:true});}finally{lock.current=false;setBusy(false);}}
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
    say('Расскажите о квартире одним сообщением, остальное заполню сам.','property-quick',{});
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
    if(intent.startsWith('book:')){const p=state.properties.find((p:Row)=>p.id===intent.slice(5))||(pendingBooking.current?.property.id===intent.slice(5)?pendingBooking.current.property:undefined);if(p)chooseProperty(p,state,pendingBooking.current?.initial);else say('Квартира больше недоступна. Обновите предложения.');return;}
    if(intent==='property'){startProperty(state);return;}
    if(intent==='cleaner-profile'){if(beginProfile('cleaner','jobs',state))say('Ваша анкета уже сохранена. Могу показать доступные уборки.','choices',{items:[['Показать уборки','Найти уборку'],['Изменить анкету','Изменить анкету']]});return;}
    if(intent==='properties'){setMessages([]);setAdministratorSearchRequest(v=>v+1);openAdministrator();return;}
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
  useEffect(()=>{
    if(!ready||!user||entryHandled.current)return;entryHandled.current=true;
    const params=new URLSearchParams(window.location.search);
    // A question left for the AI administrator by another page of this tab (see leaveAiAsk in lib/ai-line.ts) is taken once and sent.
    // Nothing in the address can make a signed-in person write to the administrator.
    if(section==='chats'){const ask=takeAiAsk(role);if(ask){openAdministrator(ask);return;}}
    if(role==='owner'&&section==='properties'&&params.get('new')==='1'){startProperty(data);return;}
    if(role==='guest'&&['catalog','map'].includes(section)&&params.get('book')){
      const property=data.properties.find((p:Row)=>p.id===params.get('book'));
      if(!property){say('Это объявление больше недоступно. Запустите новый подбор на карте.');return;}
      const valid=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value:undefined;
      const count=Number(params.get('guests'));
      const hourly=params.get('mode')==='hourly'&&property.policy?.hourly_price>0;
      if(params.get('mode')==='hourly'&&!hourly)say('Почасовой тариф у этой квартиры больше не доступен. Проверьте актуальные условия перед заявкой.');
      // A link without dates opens the form the same way the map does: from 14:00 today until 12:00 tomorrow, or the nearest three hours.
      const from=valid(params.get('start')),to=valid(params.get('end')),stay=from&&to?{start:from,end:to}:defaultStay(hourly?'hourly':'daily');
      say('Продолжим оформление выбранного жилья. Проверьте даты и итоговую стоимость.','booking-form',{property,requestKey:crypto.randomUUID(),initial:{start:stay.start,end:stay.end,guests:Number.isInteger(count)&&count>=1&&count<=50?count:1,mode:hourly?'hourly':'daily'}});
      // The form is open: the link leaves the address, so a reload does not open it again.
      for(const key of ['book','start','end','guests','mode'])params.delete(key);
      window.history.replaceState(window.history.state,'',window.location.pathname+(params.toString()?'?'+params.toString():'')+window.location.hash);
    }
  },[ready,user?.id]);
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
    if(data.integrations?.ai){openAdministrator(text);return;}
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
  function chooseProperty(p:Row,state=data,initial?:Row){pendingBooking.current={property:p,initial};setMessages([]);if(!beginProfile('guest','book:'+p.id,state))return;say('Уточним время проживания в «'+p.title+'».','booking-form',{property:p,initial,requestKey:crypto.randomUUID()});}
  async function formSubmit(event:FormEvent<HTMLFormElement>,m:Message,path:string,extra:Row={}){
    event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Row;
    if(values.start)values.start+='+05:00';if(values.end)values.end+='+05:00';
    await perform(path,{...values,...extra},m.id);
  }
  const button=(label:string,fn:()=>void,secondary=false,accessibleName?:string)=><Button disabled={busy||!ready} aria-label={accessibleName} className={secondary?'inline-button secondary':'inline-button'} onClick={fn}>{label}{!secondary&&<ArrowUpRight size={14}/>}</Button>;
  function openEvent(event:Row,target:Role){
    const items=(event.kind==='job'?data.jobs:data.bookings).filter((item:Row)=>item.id===event.entityId);
    say(event.kind==='job'?'Задание и его текущий статус.':'Бронирование и доступные действия.',event.kind==='job'?'jobs':'bookings',{items,actor:target,applications:data.applications});
  }
  function renderWorkspace(target:Role){
    const workspace=data.workspaces?.[target];
    if(!workspace)return <div className="inline-card"><p>Обновите данные, чтобы увидеть ближайшие события.</p>{button('Обновить',()=>send('Ближайшие события'))}</div>;
    return <WorkspaceOverview data={data} role={target} busy={busy} onIntent={intent=>runIntent(intent)} onEvent={event=>openEvent(event,target)}/>;
  }

  function bookingControls(b:Row,owner:boolean){
    if(b.status!=='confirmed')return null;
    const confirm=(action:string,text:string)=>say(text,'booking-action',{id:b.id,action,version:b.terms?.version});
    return <div className="inline-actions">{owner&&b.terms?.deposit_status==='pending'&&button('Подтвердить депозит',()=>confirm('deposit_received','Подтвердите, что вы проверили фактическое поступление депозита '+money(b.terms.deposit)+'.'),true)}{owner&&b.start<=data.serverTime&&!b.terms?.actual_checkin&&button('Подтвердить заселение',()=>confirm('checkin','Подтвердите фактическое заселение гостя. Квартира должна быть готова, оплата и депозит проверены.'))}{owner&&b.terms?.checkout_reported_at&&button('Рассмотреть выезд',()=>say('Гость сообщил о выезде.','approval',{id:'checkout:'+b.id}))}{owner&&!b.terms?.checkout_reported_at&&b.start<=data.serverTime&&button('Подтвердить выезд',()=>confirm('checkout','Подтвердите, что гость выехал и квартира освобождена. После этого она будет ожидать уборки.'),true)}{!owner&&b.start<=data.serverTime&&!b.terms?.checkout_reported_at&&button('Сообщить о выезде',()=>confirm('report_checkout','Подтвердите, что вы выехали. Освобождение квартиры проверит владелец.'),true)}</div>;
  }
  function openAssistantTask(task:Row){
    if(task.kind==='setup'){runIntent(task.intent);return;}
    setMessages([]);
    if(task.kind==='property'){const p=data.ownProperties.find((p:Row)=>p.id===task.entityId);if(p)say(task.reason,'property-settings',{id:p.id});return;}
    const source=task.kind==='job'?data.jobs:data.bookings,items=source.filter((item:Row)=>item.id===task.entityId);
    if(items.length)say(task.reason,task.kind==='job'?'jobs':'bookings',{items,actor:role,applications:data.applications});
  }
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <section className="inline-card assistant-brief" aria-label="Ближайшие действия"><div className="card-eyebrow"><Sparkles size={17}/>Ближайшие действия</div><h2>{brief.summary}</h2>{brief.tasks.map((task:Row)=><button key={task.id} disabled={busy} className={'assistant-task '+(task.priority===3?'urgent':'')} onClick={()=>{setAdministratorOpen(false);openAssistantTask(task);}}><span><strong>{task.title}</strong><small>{task.reason}</small></span><ChevronRight size={18}/></button>)}<p>Выберите задачу — открою доступные действия. Push-уведомления можно включить в профиле на этом устройстве.</p></section>;}
  function renderApproval(id:string){const card=(data.approvals||[]).find((c:Row)=>c.id===id);return card?<ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={body=>perform('approvals',body)}/>:<p className="done">Согласование закрыто или срок ответа истёк. Актуальный результат смотрите в карточке задачи.</p>;}
  function renderBlock(m:Message){
    const p={...(m.payload||{})};if(m.block==='properties'&&(p.actor||role)==='owner')p.own=true;
    if(m.block==='administrator-settlement')return <AdministratorSettlement task={p} data={data} busy={busy} onConfirm={(path,body)=>perform(path,body,m.id)}/>;
    if(['properties','bookings','jobs'].includes(m.block||'')){
      const source=m.block==='properties'?(p.own?data.ownProperties:data.properties):m.block==='bookings'?data.bookings:data.jobs;
      p.items=(p.items||[]).map((item:Row)=>source.find((current:Row)=>current.id===item.id)).filter(Boolean);p.applications=data.applications;
    }
    if(m.block==='notifications')p.items=data.notifications;
    if(m.block==='approval')return renderApproval(p.id);
    if(m.block==='assistant-brief')return renderAssistantBrief();
    if(m.done)return <div className="done"><Check size={14}/>{m.outcome||'Сохранено'}</div>;
    if(m.block==='booking-action'){const b=data.bookings.find((b:Row)=>b.id===p.id);return <DecisionPrompt title={p.action==='checkin'?'Подтвердить заселение':p.action==='deposit_received'?'Подтвердить депозит':p.action==='report_checkout'?'Сообщить о выезде':'Подтвердить освобождение'} subject={b?.title||'Бронирование'} busy={busy} acceptLabel="Подтверждаю" onAccept={()=>perform('bookings/'+p.id,{action:p.action,expectedVersion:p.version},m.id)} onDismiss={()=>finish(m.id,'Действие не выполнено')}><dl><div><dt>Заезд</dt><dd>{b&&date(b.start)}</dd></div><div><dt>Выезд</dt><dd>{b&&date(b.end)}</dd></div><div><dt>Депозит</dt><dd>{money(b?.terms?.deposit||0)}</dd></div></dl></DecisionPrompt>;}
    if(m.block==='property-quick')return <PropertyQuick city={profile?.city||'Павлодар'} role={role} api={async(path,body)=>body?post(path,body):fetch('/api/'+path,{headers:{'X-Workspace-Role':role}}).then(r=>r.json())} onSave={body=>post('listings',body)} onGuestMode={body=>post('operations/matching/preference',body)} onClose={()=>finish(m.id,'Добавление отменено')} onMap={id=>{try{sessionStorage.setItem('owner-map-pick',id);}catch{}finish(m.id,'Квартира добавлена');if(section==='map'){setMapActionOpen(false);window.dispatchEvent(new Event('owner-map-pick'));}else window.location.href='/workspace/owner/map';}} onDone={async saved=>{finish(m.id,'Квартира добавлена');const state=await load();say(saved.message);listProperties(state,true);}}/>;
    if(m.block==='property-editor'){const property=p.id?data.ownProperties.find((v:Row)=>v.id===p.id):undefined;return <PropertyEditor property={property} city={profile?.city||'Павлодар'} role={role} api={async(path,body)=>body?post(path,body):fetch('/api/'+path,{headers:{'X-Workspace-Role':role}}).then(r=>r.json())} onClose={()=>finish(m.id,'Форма закрыта')} onSave={async body=>{const result=await post('listings'+(p.id?'/'+p.id:''),body);const state=await load();finish(m.id);say(result.message);listProperties(state,true);}}/>;}
    if(m.block==='property-settings'){const property=data.ownProperties.find((item:Row)=>item.id===p.id);return property?<PropertyControl key={property.id+':'+property.policy.version} property={property} busy={busy} onSave={body=>perform('properties/'+property.id+'/policy',body)} onReadiness={body=>perform('properties/'+property.id+'/readiness',body)}/>:<p>Квартира больше недоступна.</p>;}
    if(m.block==='signin')return <a className="inline-button" href="/" target="_top">Войти и продолжить<ArrowUpRight size={14}/></a>;
    if(m.block==='ai-reply'){
      const target=({bookings:'bookings',overview:'map',workspace:'map',profile:'account',properties:role==='owner'?'properties':'catalog',jobs:role==='owner'?'cleaning':'jobs'} as Row)[p.action];
      const page=rolePages[role].find(v=>v.id===target);
      return <><div className="ai-reply-meta"><small>{p.mode==='model'?'AI администратор':'Ответ по правилам сервиса'}</small>{page&&<a className="inline-button secondary" href={'/workspace/'+role+'/'+page.id}>{page.title}<ArrowUpRight size={14}/></a>}</div>{section!=='assistant'&&<AdministratorCommands commands={(p.commands||[]).map((c:Row)=>(data.commands||[]).find((v:Row)=>v.id===c.id)||c)} serverTime={data.serverTime} busy={busy} onDecide={body=>perform('operations/commands',body)}/>}</>;
    }
    if(m.block==='choices')return <div className="inline-actions">{p.items.map(([label,text]:string[])=><button key={label} disabled={busy} onClick={()=>send(text)}>{label}<ArrowUpRight size={13}/></button>)}</div>;
    if(m.block==='demo')return button('Добавить учебный пример',()=>{if(!user){signin('properties');return;}perform('demo',{},m.id,(state)=>role==='owner'?listProperties(state,true):role==='cleaner'?listJobs(state,'cleaner'):listProperties(state));});
    if(m.block==='profile-review')return <div className="inline-card"><dl>{['name','contact','city',...(p.target==='cleaner'?['districts','experience','availability']:[])].map(key=><div key={key}><dt>{({name:'Имя',contact:'Контакт',city:'Город',districts:'Районы',experience:'Опыт',availability:'График'} as Row)[key]}</dt><dd>{p.answers[key]}</dd></div>)}</dl>{p.target==='cleaner'&&<small>Это анкета для откликов. Назначение на уборку подтверждает заказчик.</small>}<div className="inline-actions">{button('Всё верно, сохранить',()=>perform('profile',p.answers,m.id,state=>runIntent(p.after,state,p.target)))}{button('Заполнить заново',()=>{finish(m.id);beginProfile(p.target,p.after,{...data,profile:null});},true)}</div></div>;
    if(m.block==='property-review')return <div className="inline-card"><h3><Home size={17}/>{p.answers.title}</h3><dl>{propertyQuestions.filter(q=>q.key!=='title').map(q=><div key={q.key}><dt>{q.label}</dt><dd>{q.key==='price'?money(p.answers[q.key]):p.answers[q.key]}</dd></div>)}</dl><small><ShieldCheck size={13}/>Точный адрес скрыт от общего каталога.</small><div className="inline-actions">{button('Опубликовать квартиру',()=>perform('properties',p.answers,m.id))}{button('Заполнить заново',()=>{finish(m.id);startProperty();},true)}</div></div>;
    if(m.block==='properties')return <>{p.items.length>0&&<RecordCollection properties={[...data.ownProperties,...data.properties]} items={current(p,[...data.ownProperties,...data.properties])} direct={p.direct===true} kind="property" role={p.actor||role} userId={myId} applications={p.applications||data.applications}>{(item:Row)=><PropertyListing key={item.id} property={item} role={role} onChoose={()=>p.own?runIntent('job'):chooseProperty(item)} onEdit={()=>say('Изменения сохранятся после отправки формы.','property-editor',{id:item.id})} onSettings={()=>say('Правила и готовность квартиры.','property-settings',{id:item.id})}/>}</RecordCollection>}{!p.items.length&&<div className="inline-card"><h3>{p.own?'Добавьте первую квартиру':'Предложений пока нет'}</h3><p>{p.own?'Фотографии, удобства и понятные условия помогут гостям выбрать квартиру.':'Попробуйте вернуться позже или посмотрите учебный пример.'}</p>{button(p.own?'Добавить квартиру':'Показать пример',()=>send(p.own?'Хочу сдать квартиру':'Покажи учебный пример'))}</div>}</>;
    if(m.block==='booking-form')return <BookingRequest testMode={data.testMode===true} initial={p.initial} property={data.properties.find((item:Row)=>item.id===p.property.id)||p.property} requestKey={p.requestKey} disabled={busy} onQuote={body=>post('quote',body)} onConfirm={body=>perform('bookings',body,m.id,state=>runIntent('bookings',state),true)}/>;
    if(m.block==='workspace')return renderWorkspace(p.actor||role);
    if(m.block==='job-form')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,'jobs')}><label>Какая квартира?<NativeSelect name="propertyId" required>{p.properties.map((x:Row)=><option key={x.id} value={x.id}>{x.title}</option>)}</NativeSelect></label><div className="input-row"><label>Начало<Input name="start" type="datetime-local" required defaultValue={localDate(24)}/></label><label>Окончание<Input name="end" type="datetime-local" required defaultValue={localDate(26)}/></label></div><label>Вознаграждение, ₸<Input name="fee" type="number" min={100} max={1000000} defaultValue={4000} required/></label><label>Что нужно сделать?<Textarea name="description" required maxLength={2000} placeholder="Состав работ, средства, бельё и другие условия"/></label><small>Время Казахстана. Исполнители увидят район и условия, точный адрес — после назначения.</small><Button className="inline-button" disabled={busy}>Опубликовать задание<ArrowUpRight size={14}/></Button></form>;
    if(m.block==='confirm-booking')return renderApproval('booking:'+p.id);
    if(m.block==='bookings')return <><RecordCollection properties={[...data.ownProperties,...data.properties]} items={current(p,data.bookings)} direct={p.direct===true} kind="booking" role={p.actor||role} userId={myId} applications={p.applications||data.applications}>{(b:Row)=><div key={b.id} className="inline-card"><div className="card-meta"><CalendarDays size={13}/><span className={"status-chip status-"+b.status}>{labels[b.status]}</span>{b.demo_owner&&<span className="tag">Учебная</span>}</div><h2>{b.title}</h2><p>{date(b.start)} → {date(b.end)}</p><small>{guestCount(b.guests)} · {money(b.amount)} · {b.payment_status==='owner_verified'?'Оплата отмечена владельцем':'Оплата не подтверждена'}</small><details className="record-extra"><summary>Условия и расчёты</summary>{b.terms&&<small>Депозит: {money(b.terms.deposit)} · {b.terms.deposit_status==='owner_verified'?'подтверждён владельцем':b.terms.deposit?'ожидается':'не требуется'}{b.readiness?' · '+readinessLabels[b.readiness]:''}</small>}{b.terms&&<small>Подтверждённая оплата: {money(b.terms.paid_amount||0)} · остаток: {money(Math.max(0,b.amount-(b.terms.paid_amount||0)))}</small>}<BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={p.actor} busy={busy} onReview={id=>say('Предложение новых условий.','approval',{id:'change:'+id})} onQuote={body=>post('bookings/'+b.id+'/change-quote',body)} onPropose={body=>perform('bookings/'+b.id+'/changes',body)} onDecide={(id,action)=>perform('bookings/'+b.id+'/changes/'+id,{action})}/>{b.address&&<p className="private"><ShieldCheck size={13}/>{b.address}{b.owner_contact?' · '+b.owner_contact:''}</p>}</details><ActivityTimer kind="booking" item={b}/>{bookingControls(b,p.actor==='owner')}<div className="inline-actions">{p.actor==='owner'&&b.status==='requested'&&button('Рассмотреть заявку',()=>say('Запрос гостя на согласование.','approval',{id:'booking:'+b.id}))}{p.actor==='owner'&&b.status==='confirmed'&&b.payment_status!=='owner_verified'&&button('Отметить оплату',()=>say('Вы проверили фактическое поступление '+money(b.amount)+'? Эта отметка не выполняет банковскую операцию.','payment',{id:b.id,amount:b.amount,version:b.terms?.version}),true)}{['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&button('Отменить',()=>say('Отменить бронь «'+b.title+'»? Возврат оплаты, если потребуется, согласуется отдельно.','cancel',{id:b.id,version:b.terms?.version}),true)}{button('Открыть чат',()=>showDiscussion({kind:'booking',entityId:b.id}),true)}{button('Есть проблема',()=>say('Опишите ситуацию. Обращение будет сохранено у другого участника брони.','issue',{id:b.id,kind:'booking'}),true)}</div></div>}</RecordCollection>{!p.items.length&&button(role==='owner'?'Мои квартиры':'Подобрать квартиру',()=>runIntent(role==='owner'?'own-properties':'properties'))}</>;
    if(m.block==='payment')return <DecisionPrompt title="Проверка оплаты" subject={data.bookings.find((b:Row)=>b.id===p.id)?.title||'Бронирование'} busy={busy} acceptLabel="Поступление проверено" onAccept={()=>perform('bookings/'+p.id,{action:'paid',expectedAmount:p.amount,expectedVersion:p.version},m.id)} onDismiss={()=>finish(m.id,'Действие не выполнено')}><p>Подтверждаемая сумма: <strong>{money(p.amount)}</strong>. Проверьте фактическое поступление в банке.</p></DecisionPrompt>;
    if(m.block==='cancel')return <DecisionPrompt title="Отмена бронирования" subject={data.bookings.find((b:Row)=>b.id===p.id)?.title||'Бронирование'} busy={busy} acceptLabel="Отменить бронь" onAccept={()=>perform('bookings/'+p.id,{action:'cancel',expectedVersion:p.version},m.id)} onDismiss={()=>finish(m.id,'Бронь сохранена')}><p>Отмена не возвращает деньги автоматически. Возврат согласуется отдельно.</p></DecisionPrompt>;
    if(m.block==='jobs')return <><RecordCollection properties={[...data.ownProperties,...data.properties]} items={current(p,data.jobs)} direct={p.direct===true} kind="job" role={p.actor||role} userId={myId} applications={p.applications||data.applications}>{(j:Row)=>{const owner=p.actor==='owner',assigned=role==='cleaner'&&j.assigned_to===myId,apps=(p.applications||[]).filter((a:Row)=>a.job_id===j.id),applied=apps.find((a:Row)=>a.user_id===myId);return <div className="inline-card cleaning-job-card" key={j.id}>{(owner||assigned)&&<JobOperations job={j} role={role} onChanged={load}/>}<div className="card-meta"><Brush size={13}/><span className={"status-chip status-"+j.status}>{processStatus('job',j,role,myId||'',applied).label}</span>{j.demo_owner&&<span className="tag">Учебное</span>}</div><h2>{j.title}</h2><p>{j.city}, {j.district} · {date(j.start)} — {date(j.end)}</p><strong>{money(j.fee)}<small> за выполнение</small></strong><details className="job-card-details"><summary>Задачи, адрес и отчёт</summary><p>{j.description}</p>{j.address&&<p className="private"><ShieldCheck size={13}/>{j.address}{j.owner_contact?' · '+j.owner_contact:''}</p>}{j.report&&<p className="report">Отчёт: {j.report}</p>}</details><ActivityTimer kind="job" item={j} compact/>{owner&&j.worker&&<CleanerCard worker={j.worker} role={role}/>}{owner&&j.status==='open'&&apps.filter((a:Row)=>a.status==='pending').map((a:Row)=><div className="applicant" key={a.id}><CleanerCard worker={a.worker||a} role={role}/>{button('Рассмотреть отклик',()=>say('Отклик исполнителя.','approval',{id:'application:'+a.id}))}</div>)}<div className="inline-actions">{!owner&&j.status==='open'&&(!applied||applied.status==='rejected')&&button('Откликнуться',()=>{if(beginProfile('cleaner','jobs'))perform('jobs/'+j.id,{action:'apply'},m.id);})}{!owner&&applied&&!assigned&&<small>{labels[applied.status]}</small>}{assigned&&j.status==='assigned'&&(j.checkout_confirmed?button('Начать уборку',()=>perform('jobs/'+j.id,{action:'start'},m.id)):<small>Ожидаем подтверждения выезда гостя.</small>)}{assigned&&j.status==='in_progress'&&button('Отправить отчёт',()=>say('Проверьте результат и опишите выполненную работу.','report',{id:j.id}))}{owner&&j.status==='submitted'&&button('Рассмотреть отчёт',()=>say('Отчёт об уборке на приёмке.','approval',{id:'report:'+j.id}))}{(owner||assigned)&&button('Открыть чат',()=>showDiscussion({kind:'job',entityId:j.id}),true)}{(owner||assigned)&&button('Есть проблема',()=>say('Что произошло? Сохраню обращение для другого участника задания.','issue',{id:j.id,kind:'job'}),true)}</div></div>;}}</RecordCollection>{!p.direct&&<div className="inline-actions">{p.actor==='owner'?(section==='cleaning'?null:button('Создать уборку',()=>runIntent('job'),true)):<>{button('Мои отклики и работа',()=>runIntent('my-jobs'),true)}{button('Заполнить анкету',()=>runIntent('cleaner-profile'),true)}</>}</div>}</>;
    if(m.block==='report')return <CleaningReport job={data.jobs.find((j:Row)=>j.id===p.id)} role={role} busy={busy} onChanged={load} onSubmit={body=>perform('jobs/'+p.id,{...body,action:'submit'},m.id,undefined,true)}/>;
    if(m.block==='issue')return <form className="inline-card inline-form" onSubmit={e=>formSubmit(e,m,(p.kind==='job'?'jobs/':'bookings/')+p.id,{action:'issue'})}><label>Что произошло?<Textarea name="issue" required maxLength={1500} placeholder="Опишите ситуацию"/></label><small>Для срочной помощи свяжитесь с ответственным по контакту в подтверждённой брони или назначенном задании.</small><Button className="inline-button" disabled={busy}>Передать обращение<ArrowUpRight size={14}/></Button></form>;
    if(m.block==='notifications')return <div className="inline-list">{p.items.map((n:Row)=><div className="inline-card" key={n.id}><p>{n.body}</p><small>{date(n.created_at)}</small>{n.dedupe?.startsWith(role+':discussion:')&&<Button className="inline-button secondary" onClick={()=>setDiscussion({roomId:n.dedupe.split(':')[2]})}>Открыть обсуждение</Button>}</div>)}</div>;
    return null;
  }
  const page=rolePages[role].find(p=>p.id===section)!;
  const primary:Message={id:'page-'+section,sender:'assistant',text:'',block:section==='overview'?'workspace':section==='catalog'||section==='properties'?'properties':section==='bookings'?'bookings':section==='cleaning'||section==='jobs'||section==='assignments'?'jobs':undefined,payload:{actor:role,own:role==='owner',items:section==='catalog'?data.properties:section==='properties'?data.ownProperties:section==='bookings'?data.bookings:section==='assignments'?data.jobs.filter((j:Row)=>j.assigned_to===myId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===myId)):data.jobs,applications:data.applications}};
  const nextTask=data.assistantBrief?.automatic?data.assistantBrief.prompts[0]:null;
  const processRecommendations=(data.administrator?.tasks||[]) as Row[];
  const recommendationCount=processRecommendations.length+(data.assistantBrief?.tasks||[]).filter((task:Row)=>!processRecommendations.some(p=>p.entity_kind===task.kind&&p.entity_id===task.entityId)).length+(data.approvals||[]).filter((v:Row)=>v.canDecide).length+(data.commands||[]).filter((v:Row)=>['draft','running','failed'].includes(v.status)).length;
  const urgentRecommendation=(data.assistantBrief?.tasks||[]).some((v:Row)=>v.priority===3)||(data.administrator?.tasks||[]).some((v:Row)=>v.priority===3);
  const flowComposer=flow?<div className="task-response"><div className="flow-progress"><span>Вопрос {flow.index+1} из {flow.questions.length} · {flow.questions[flow.index].label}</span><div>{flow.index>0&&<button type="button" disabled={busy} onClick={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}>Назад</button>}<button type="button" disabled={busy} onClick={()=>{setFlow(null);setMapActionOpen(false);}}>Остановить ввод</button></div></div><form onSubmit={e=>{e.preventDefault();void send();}}><textarea ref={composer} value={input} onChange={e=>setInput(e.target.value)} aria-label="Ответ на вопрос формы" rows={1} maxLength={2500} disabled={busy||!ready} placeholder="Ваш ответ…"/><button type="submit" disabled={busy||!ready||!input.trim()} aria-label="Продолжить заполнение"><ArrowUp size={21}/></button></form></div>:null;
  const showSearchOnMap=(filters:Record<string,string>)=>{setAdministratorSearchRequest(0);setMessages([]);setAdministratorOpen(false);setMapActionOpen(false);if(section==='map')window.dispatchEvent(new CustomEvent('rental-map-search',{detail:filters}));else window.location.assign('/workspace/guest/map?'+new URLSearchParams({...filters,mapSearch:'1'}));};
  const leaveAdministrator=(action:()=>void)=>{setAdministratorOpen(false);action();};
  const administratorSupport=ready?<>{administratorNotice&&<p className={administratorNotice.error?'form-error':'administrator-outcome'} role={administratorNotice.error?'alert':'status'}>{administratorNotice.text}</p>}<ApprovalInbox cards={data.approvals||[]} busy={busy} onDecide={body=>administratorAction('approvals',body)}/>{renderAssistantBrief()}<details className="administrator-controls"><summary>Проверки и обращения</summary><AdministratorPanel data={data} role={role} busy={busy} onCheck={()=>administratorAction('administrator/check',{})} onTask={task=>leaveAdministrator(()=>openAssistantTask(task))} onResolve={body=>administratorAction('administrator/issues',body)} onSettlement={task=>leaveAdministrator(()=>say('Зафиксируйте расчёт после фактического перевода.','administrator-settlement',task))}/></details></>:null;
  if(closedResult)return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24}}><section className="inline-card" style={{maxWidth:620}}><h1>{closedResult.receipt?'Результат удаления':'Выход выполнен'}</h1><p>{closedResult.message}</p>{closedResult.receipt&&<p>Квитанция: <strong>{closedResult.receipt.id}</strong></p>}<Button onClick={()=>window.location.replace('/signin')}>Перейти к входу</Button></section></main>;
  return <ActivityClockProvider serverTime={data.serverTime}><div className="chat-app workspace-shell release-workspace" data-section={section}><WorkspaceNavigation platformAdmin={data.platformAdmin===true} accountId={accountId} avatarId={profile?.avatar_id} avatarName={profile?.name} role={role} section={section} connected={JSON.parse(profile?.roles||'[]')}/><div className="workspace-content"><header className="chat-header"><a className="workspace-back" href={'/workspace/'+role+'/map'}><ChevronRight size={18}/>{role==='guest'?'Поиск':'Карта'}</a></header>
    {ready&&!online&&<div className="connection-notice" role="status"><WifiOff size={18} aria-hidden="true"/><span>Нет связи. Проверьте интернет.</span><button type="button" onClick={()=>void reconnect()} disabled={reconnecting} aria-busy={reconnecting}>{reconnecting?'Проверяю…':'Повторить'}</button></div>}

    <main className="chat-main"><div className={'chat-transcript '+(!messages.length?'is-empty':'')} ref={transcript}>
      <div className="role-page-heading"><div><h1>{section==='overview'?(role==='owner'?'Аренда без лишних забот':role==='cleaner'?'Забота о доме — ваша работа':'Жильё для ваших планов'):page.title}</h1></div>{section==='properties'&&data.ownProperties.length>0&&button('Добавить квартиру',()=>runIntent('property'))}{section==='cleaning'&&button('Создать уборку',()=>runIntent('job'))}</div>
      {section==='overview'&&(data.approvals||[]).some((c:Row)=>c.canDecide)&&<a className="approval-entry" href={'/workspace/'+role+'/chats'}><MessagesSquare size={18}/><span>Ждут вашего решения<strong>Согласования: {data.approvals.filter((c:Row)=>c.canDecide).length}</strong></span><ChevronRight size={18}/></a>}

      {!ready||(!online&&!data.user&&section!=='map')?<PageSkeleton/>:section==='map'?<MapWorkspace onAsk={openAdministrator} accountId={accountId} role={role} data={data} onChoose={(p,initial)=>chooseProperty(p,data,initial)} onDiscussion={showDiscussion} onCreate={()=>runIntent('property')} onProcess={(kind,id)=>{setMessages([]);say('',kind==='property'?'properties':kind==='job'?'jobs':'bookings',{items:(kind==='property'?data.ownProperties:kind==='job'?data.jobs:data.bookings).filter((v:Row)=>v.id===id),actor:role,applications:data.applications,direct:true});}}/>:section==='catalog'?<CatalogPage accountId={myId} city={profile?.city} onChoose={(p,initial)=>chooseProperty(p,data,initial)}/>:section==='operations'?<OperationsHub role={role} data={data} onChanged={load}/>:section==='account'?<AccountControl onAdministrator={()=>openAdministrator()} onChanged={load} role={role} onEdit={()=>runIntent('profile',data,role)}/>:section==='calendar'?<RentalCalendar data={data} role={role} busy={busy} onOpen={(kind,id)=>say('Что с этим сейчас и что можно сделать.',kind==='job'?'jobs':'bookings',{items:(kind==='job'?data.jobs:data.bookings).filter((v:Row)=>v.id===id),actor:role,applications:data.applications,direct:true})}/>:section==='chats'?<div className={'workspace-chats-layout'+(administratorOpen?' has-administrator':'')}><ChatInbox accountId={accountId} role={role} selectedRoomId={discussion?.roomId} onOpen={showDiscussion} administratorSelected={administratorOpen} onAdministrator={openAdministrator} administratorHint={nextTask?.title}/>{administratorOpen?<AdministratorConversation key={role} accountId={accountId} role={role} hint={nextTask?.title} onClose={closeAdministrator} onChanged={load} searchRequest={administratorSearchRequest} searchCity={profile?.city} onMapSearch={showSearchOnMap} initialRequest={administratorRequest} onRequestConsumed={()=>setAdministratorRequest(null)}>{administratorSupport}</AdministratorConversation>:discussion?<ProcessDiscussion key={role+JSON.stringify(discussion)} embedded role={role} initial={discussion} onClose={()=>setDiscussion(null)}/>:<section className="chat-no-selection"><MessagesSquare size={36}/><h2>Выберите диалог</h2><p>Личные обсуждения и помощь администратора.</p></section>}</div>:primary.block&&renderBlock(primary)}

      {['map','chats'].includes(section)?<TaskSheet open={mapActionOpen&&messages.length>0} onOpenChange={setMapActionOpen} footer={flowComposer}>{!messages.length?null:<div className="chat-messages" aria-live="polite" aria-relevant="additions">{messages.map(m=><div key={m.id} className={'chat-message '+m.sender+(m.block?' has-block':'')+(m.text?'':' is-plain')}>{m.sender==='assistant'&&!!m.text&&<div className="assistant-mark" aria-hidden="true"><Sparkles size={18}/></div>}<div className="message-content">{!!m.text&&<p>{m.text}</p>}{m.block&&renderBlock(m)}</div></div>)}{busy&&<div className="chat-message assistant" role="status"><div className="assistant-mark"><Sparkles size={18}/></div><div className="thinking"><LoaderCircle size={16}/>Проверяю данные…</div></div>}</div>}</TaskSheet>:(!messages.length?null:<div className="chat-messages" aria-live="polite" aria-relevant="additions">{messages.map(m=><div key={m.id} className={'chat-message '+m.sender+(m.block?' has-block':'')}>{m.sender==='assistant'&&<div className="assistant-mark" aria-hidden="true"><Sparkles size={18}/></div>}<div className="message-content"><p>{m.text}</p>{m.block&&renderBlock(m)}</div></div>)}{busy&&<div className="chat-message assistant" role="status"><div className="assistant-mark"><Sparkles size={18}/></div><div className="thinking"><LoaderCircle size={16}/>Проверяю данные…</div></div>}</div>)}
    </div>{!['map','chats'].includes(section)&&flowComposer}{!['map','chats'].includes(section)&&!administratorOpen&&!discussion&&<AdministratorOrb buttonRef={assistantTrigger} busy={busy} count={recommendationCount} urgent={urgentRecommendation} hint={nextTask?.title} onOpen={openAdministrator}/>} </main>{administratorOpen&&section!=='chats'&&<AdministratorConversation key={role} floating accountId={accountId} role={role} hint={nextTask?.title} onClose={closeAdministrator} onChanged={load} searchRequest={administratorSearchRequest} searchCity={profile?.city} onMapSearch={showSearchOnMap} initialRequest={administratorRequest} onRequestConsumed={()=>setAdministratorRequest(null)}>{administratorSupport}</AdministratorConversation>} {discussion&&section!=='chats'&&<ProcessDiscussion key={role} role={role} initial={discussion} onClose={()=>setDiscussion(null)}/>}</div></div></ActivityClockProvider>;
}
