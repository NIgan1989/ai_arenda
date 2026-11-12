import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator,AppState,BackHandler,KeyboardAvoidingView,Platform,Pressable,ScrollView,StatusBar,Text,TextInput,View } from 'react-native';
import { SafeAreaProvider,SafeAreaView } from 'react-native-safe-area-context';
import {NativeChats,type NativeChatInitial} from './src/NativeChats';
import {StayRequest,CleaningRequest} from './src/StayRequest';
import {RecordHead,RecordJourney,RecordFacts,RecordActions,recordStyles} from './src/RecordCard';
import {useProcessLinks} from './src/use-process-links';
import {resolveProcessLink} from './src/deep-links';
import { API_URL,ApiError,StaleSessionError,getSessionGeneration,isOffline,onServerReach,request,restoreLastRole,restoreSession,saveLastRole,saveSession,setWorkspaceRole } from './src/api';
import { baseQuestions,cleanerQuestions,date,empty,labels,money,parseDate,propertyQuestions,uid,type Flow,type Message,type Question,type Role,type Row } from './src/model';
import { C,s } from './src/styles';
import {ActivityClockProvider,ActivityTimer} from './src/ActivityTimer';
import {ApprovalCard,ApprovalInbox} from './src/ApprovalCard';
import {PropertyControl,readinessLabels} from './src/PropertyControl';
import {BookingChanges} from './src/BookingChanges';
import {StayReview} from './src/StayReview';
import {WorkspaceNavigation,WorkspaceMenuButton} from './src/WorkspaceNavigation';
import {PropertyListing} from './src/PropertyListing';
import {PropertyEdit} from './src/PropertyEdit';
import {PropertyQuick} from './src/PropertyQuick';
import {CleanerCard} from './src/ProfileEditor';
import {AccountControl} from './src/AccountControl';
import {RentalCalendar} from './src/RentalCalendar';
import {RoleEntry,roleNames,rolePages,intentRole} from './src/RoleEntry';
import {MapHome,type MapStay} from './src/MapHome';
import {stayISO} from './src/ai-request';
import {OfflineNotice} from './src/OfflineNotice';
import {EntrySplash} from './src/EntrySplash';
import {LoadingBar} from './src/LoadingBar';
import {PageTransition} from './src/PageTransition';
import {entryReady,markGesture} from './src/loading';

function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  const [focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={(e:any)=>{if(Platform.OS!=='web'||e?.target?.matches?.(':focus-visible'))setFocused(true);}} onBlur={()=>setFocused(false)} style={({pressed})=>[s.button,secondary&&s.secondary,focused&&s.focusRing,(disabled||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
}
function BookingReview({flow,busy,done,result,onConfirm,onEdit}:{flow:Flow;busy:boolean;done?:boolean;result?:string;onConfirm:(quote:Row)=>void;onEdit:()=>void}){
  const [quote,setQuote]=useState<Row|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[attempt,setAttempt]=useState(0);
  const [accepted,setAccepted]=useState(false);
  useEffect(()=>{let active=true;if(done)return;setAccepted(false);setChecking(true);setError('');request('/api/quote',{...flow.answers,...flow.extra}).then(value=>{if(active)setQuote(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[flow,attempt,done]);
  if(done)return <View style={s.card}><Text style={s.badge}>{result||'Сохранено'}</Text><Text style={s.meta}>{result==='Изменено'?'Этот расчёт закрыт. Продолжите ввод в разговоре.':'Заявка и её статус доступны в «Мои брони».'}</Text></View>;
  return <View style={s.card}><Text style={s.eyebrow}>ПРОВЕРКА ЗАЯВКИ</Text><Text accessibilityRole="header" style={s.cardTitle}>{quote?.title||'Проживание'}</Text>
    {checking&&<View style={s.progressRow}><ActivityIndicator color={C.accent}/><Text style={s.meta}>Проверяю стоимость и свободный интервал…</Text></View>}
    {!!error&&<><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Проверить ещё раз" secondary disabled={busy||checking} onPress={()=>setAttempt(v=>v+1)}/></>}
    {quote&&!error&&!checking&&<><View style={s.keyval}><Text style={s.key}>Заезд</Text><Text style={s.value}>{date(quote.start)}</Text></View><View style={s.keyval}><Text style={s.key}>Выезд</Text><Text style={s.value}>{date(quote.end)}</Text></View><View style={s.keyval}><Text style={s.key}>Гостей</Text><Text style={s.value}>{quote.guests}</Text></View><Text style={s.meta}>{quote.periods} × {money(quote.price)} · {quote.unitLabel}</Text><View style={s.quoteTotal}><Text style={s.key}>Стоимость проживания</Text><Text style={s.price}>{money(quote.amount)}</Text></View><Text style={s.meta}>После выезда — {quote.cleaningMinutes} мин. на подготовку квартиры. Депозит: {money(quote.policy.deposit)}. {quote.policy.house_rules}</Text><Text style={s.meta}>Интервал ещё не зарезервирован. Отправка заявки не списывает деньги. {quote.policy.auto_confirm?'Бронь подтверждается автоматически по правилам владельца.':'После отправки у владельца будет 30 минут на решение.'}</Text><Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} disabled={busy} onPress={()=>setAccepted(v=>!v)} style={s.keyval}><Text style={s.text}>Согласен с датами, тарифом, депозитом и правилами: {accepted?'да':'нет'}</Text></Pressable><Button title="Отправить заявку" disabled={busy||!accepted} onPress={()=>onConfirm(quote)}/></>}
    <Button title="Изменить даты и гостей" secondary disabled={busy||checking} onPress={onEdit}/>
  </View>;
}
function Auth({onSubmit,busy}:{onSubmit:(mode:string,phone:string,password:string,name?:string,city?:string,recovery?:string)=>Promise<void>;busy:boolean}){
  const [mode,setMode]=useState('login'),[phone,setPhone]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[city,setCity]=useState('Павлодар'),[recovery,setRecovery]=useState(''),[error,setError]=useState('');
  return <View style={s.card}>
    <Text style={s.cardTitle}>{mode==='register'?'Один аккаунт для всех устройств':mode==='recover'?'Восстановить доступ':'С возвращением'}</Text>
    <Text style={s.meta}>Номер телефона и пароль те же, что на сайте. Брони и чаты общие.</Text>
    {mode==='register'&&<><Text style={s.fieldLabel}>Имя</Text><TextInput accessibilityLabel="Имя" style={s.field} value={name} onChangeText={setName} maxLength={100} editable={!busy}/><Text style={s.fieldLabel}>Город</Text><TextInput accessibilityLabel="Город" style={s.field} value={city} onChangeText={setCity} maxLength={80} editable={!busy}/></>}
    <Text style={s.fieldLabel}>Номер телефона</Text><TextInput accessibilityLabel="Номер телефона" style={s.field} placeholder="+7 777 123 45 67" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={30} editable={!busy}/>
    {mode==='recover'&&<><Text style={s.fieldLabel}>Резервный код</Text><TextInput accessibilityLabel="Резервный код" style={s.field} value={recovery} onChangeText={setRecovery} maxLength={80} autoCapitalize="none" autoCorrect={false} editable={!busy}/><Text style={s.meta}>Восстановление завершит прежние сеансы на всех устройствах.</Text></>}
    <Text style={s.fieldLabel}>{mode==='recover'?'Новый пароль':'Пароль'}</Text><TextInput accessibilityLabel="Пароль" style={s.field} placeholder="От 10 символов" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode==='register'?'new-password':'current-password'} maxLength={128} editable={!busy}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button title={mode==='register'?'Создать аккаунт':mode==='recover'?'Обновить пароль':'Войти'} disabled={busy} onPress={()=>{setError('');onSubmit(mode,phone,password,name,city,recovery).then(()=>setPassword('')).catch(e=>setError(isOffline(e)?'':e.message));}}/>
    <Button secondary title="Восстановить доступ по резервному коду" disabled={busy} onPress={()=>{setError('');setPassword('');setRecovery('');setMode('recover');}}/>
    <Button secondary title={mode==='register'?'Уже есть аккаунт':'Создать новый аккаунт'} disabled={busy} onPress={()=>{setError('');setPassword('');setMode(mode==='register'?'login':'register');}}/>
  </View>;
}

function Chat(){
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[flow,setFlow]=useState<Flow|null>(null),[actor,setActor]=useState<Role>('guest');
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[online,setOnline]=useState(false),[historyReady,setHistoryReady]=useState(false),[saveError,setSaveError]=useState(false);
  const scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null),locked=useRef(false),session=useRef(false),pending=useRef(''),seen=useRef(new Set<string>());
  const [navigationMenu,setNavigationMenu]=useState(false),[recoveryCode,setRecoveryCode]=useState(''),[linkError,setLinkError]=useState('');
  const [retrying,setRetrying]=useState(false),[opening,setOpening]=useState(false);
  const [selectedRole,setSelectedRole]=useState<Role|null>(null),[pageId,setPageId]=useState('map'),[chatsActive,setChatsActive]=useState(false),[chatInitial,setChatInitial]=useState<NativeChatInitial|null>(null),[erasureResult,setErasureResult]=useState<Row|null>(null);
  // A long page is shown a dozen records at a time (the catalogue holds hundreds of flats); the catalogue starts with the person's own city.
  const [listed,setListed]=useState({page:'',count:12}),[allCities,setAllCities]=useState(false);
  const activeRoleRef=useRef<Role|null>(null),scrollMessage=useRef<string|null>(null);
  const userId=data.user?.id;
  const say=(text:string,block?:string,payload?:Row)=>{const id=uid();scrollMessage.current=id;setMessages(prev=>[...prev,{id,sender:'assistant' as const,text,block,payload}].slice(-120));};
  const processLinks=useProcessLinks({apiUrl:API_URL,ready,accountId:userId||null,blocked:busy||!!flow||!!recoveryCode||chatsActive,onError:message=>setLinkError(message),onOpen:async(link,guard)=>{
    if(locked.current||!session.current||!guard.isCurrent())return;
    setLinkError('');locked.current=true;setBusy(true);
    try{
      const [state,history]=await Promise.all([request('/api/state',undefined,undefined,undefined,link.role),request('/api/conversation',undefined,undefined,undefined,link.role)]);
      if(!session.current||!guard.isCurrent())return;
      const view=resolveProcessLink(link,state,guard.accountId);
      setWorkspaceRole(link.role);activeRoleRef.current=link.role;setData(state);setMessages(history.messages||[]);setFlow(history.flow||null);setActor(link.role);setSelectedRole(link.role);setPageId(history.flow?'overview':view.section);setHistoryReady(true);setOnline(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));
      if(history.flow)setLinkError('В этой роли сохранён незавершённый ввод. Завершите или отмените его, затем откройте ссылку повторно.');else if(view.block)say('Открыто по ссылке.',view.block,view.payload);
    }finally{locked.current=false;setBusy(false);}
  }});
  const finish=(id:string,result='Сохранено')=>setMessages(prev=>prev.map(m=>m.id===id?{...m,done:true,result}:m));
  async function signedOut(result?:Row){
    try{await saveSession(null);await saveLastRole(null,null);}finally{session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setData(empty);setMessages([]);setFlow(null);setInput('');setChatInitial(null);setChatsActive(false);setRecoveryCode('');if(result?.receipt)setErasureResult(result);}
  }
  async function load(){
    const active=activeRoleRef.current,generation=getSessionGeneration();
    try{const state=await request(active?'/api/state':'/api/access');if(activeRoleRef.current!==active||generation!==getSessionGeneration())return;setData(active?state:{...empty,...state});setOnline(true);return state;}
    catch(error){if(error instanceof StaleSessionError||generation!==getSessionGeneration()||activeRoleRef.current!==active)return;if(active&&error instanceof ApiError&&error.status===403){setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);const access=await request('/api/access');if(generation===getSessionGeneration()&&activeRoleRef.current===null)setData({...empty,...access});}throw error;}
  }
  async function hydrate(role:Role){
    const generation=getSessionGeneration();setHistoryReady(false);setWorkspaceRole(role);activeRoleRef.current=role;
    const [state,history]=await Promise.all([request('/api/state',undefined,undefined,undefined,role),request('/api/conversation',undefined,undefined,undefined,role)]);
    if(generation!==getSessionGeneration()||activeRoleRef.current!==role)throw new StaleSessionError();
    setData(state);setMessages(history.messages||[]);setFlow(history.flow||null);setActor(role);setSelectedRole(role);setPageId(history.flow?'overview':'map');if(history.draftInvalid)setLinkError('Сохранённый ввод не удалось открыть. Начните форму заново; заявки сохранены на сервере.');setSaveError(false);setOnline(true);setHistoryReady(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));void saveLastRole(state.user?.id||null,role);return state;
  }
  // The map opens first: the role used last on this device, or the only role the account has. The role chooser stays behind «Сменить роль».
  async function openLastRole(state?:Row){
    const id=state?.user?.id;if(!id)return;
    let roles:Role[]=[];try{roles=JSON.parse(state.profile?.roles||'[]');}catch{}
    const saved=await restoreLastRole(id),role=roles.find(r=>r===saved)||(roles.length===1?roles[0]:null);
    if(!role)return;
    try{await hydrate(role);}catch(e){setWorkspaceRole(null);activeRoleRef.current=null;if(e instanceof ApiError&&e.status===401)throw e;}
  }
  async function chooseRole(role:Role){if(locked.current)return;locked.current=true;setBusy(true);try{await hydrate(role);}catch(e){setWorkspaceRole(null);activeRoleRef.current=null;throw e;}finally{locked.current=false;setBusy(false);}}
  function switchRole(){if(locked.current)return;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);setInput('');setData({...empty,user:data.user,profile:data.profile});}
  async function handleError(error:any){
    if(error instanceof StaleSessionError)return;
    if(error instanceof ApiError&&error.status===401&&session.current){
      try{await signedOut();}catch{}setLinkError('Сессия закончилась. Войдите снова.');
    }else {setOnline(error instanceof ApiError);if(!isOffline(error))say(error.message);}
  }
  // The offline line's «Повторить»: one more attempt to reach the server; the line stays until an answer arrives.
  async function retry(){if(retrying||locked.current)return;setRetrying(true);try{await load();}catch(error){if(error instanceof ApiError&&error.status===401)await handleError(error);}finally{setRetrying(false);}}
  const offline=ready&&!online?<OfflineNotice busy={retrying} onRetry={()=>void retry()}/>:null;
  useEffect(()=>{let active=true;(async()=>{
    try{setWorkspaceRole(null);const token=await restoreSession();if(!active)return;session.current=!!token;if(token)await openLastRole(await load());else setOnline(true);}
    catch(e){if(active)await handleError(e);}
    finally{if(active)setReady(true);}
  })();return()=>{active=false;};},[]);
  // The entry splash opens once the first data is in, so the first screen appears complete.
  useEffect(()=>{if(ready)entryReady();},[ready]);
  // Every answer or silence of the server updates the one "Нет связи" line.
  useEffect(()=>{onServerReach(setOnline);return()=>onServerReach(null);},[]);
  // Android's back button returns to the map from any other page before it leaves the app. An open chat and the map's sheet handle it first.
  useEffect(()=>{
    if(Platform.OS!=='android'||!selectedRole||pageId==='map'||flow)return;
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{setPageId('map');return true;});
    return()=>back.remove();
  },[selectedRole,pageId,!!flow]);
  useEffect(()=>{
    if(!userId||!historyReady||!selectedRole||busy||locked.current||activeRoleRef.current!==selectedRole)return;
    const role=selectedRole,generation=getSessionGeneration();
    const current=()=>generation===getSessionGeneration()&&session.current&&activeRoleRef.current===role;
    const timer=setTimeout(()=>{if(!current()||locked.current)return;request('/api/conversation',{messages,flow,actor},'PUT',undefined,role).then(()=>{if(current())setSaveError(false);}).catch(error=>{if(current()&&!(error instanceof StaleSessionError))setSaveError(true);});},500);
    return()=>clearTimeout(timer);
  },[messages,flow,actor,userId,historyReady,selectedRole,busy]);
  useEffect(()=>{
    if(!userId||!selectedRole)return;
    async function refresh(){if(AppState.currentState!=='active'||locked.current)return;try{const state=await load();if(!state)return;
      const fresh=state.notifications.filter((n:Row)=>!seen.current.has(n.id));state.notifications.forEach((n:Row)=>seen.current.add(n.id));
      if(fresh.length)say('Появились новые события. Напишите «Что нового», чтобы посмотреть.');
    }catch(error){if(error instanceof ApiError&&error.status===401)await handleError(error);else setOnline(false);}}
    const timer=setInterval(refresh,15000),subscription=AppState.addEventListener('change',status=>{if(status==='active')refresh();});
    return()=>{clearInterval(timer);subscription.remove();};
  },[userId,selectedRole]);
  function beginFlow(kind:string,questions:Question[],answers:Row,endpoint:string,after:string,role:Role,extra:Row={}){
    setActor(role);const next={kind,questions,index:0,answers,endpoint,after,role,extra};
    if(questions.length){setFlow(next);say(questions[0].text);}else say('Проверьте сведения перед сохранением.','review',{flow:next});
  }
  function ensure(role:Role,after:string,state=data,edit=false){
    if(role!==selectedRole){say('Эта задача относится к другой роли. Нажмите «Сменить роль».');return false;}
    if(!state.user){pending.current=after;say('Чтобы сохранять заявки и продолжать разговор с другого устройства, войдите или создайте аккаунт.','auth',{intent:after});return false;}
    const p=state.profile||{},roles=p.roles?JSON.parse(p.roles):[];
    if(!edit&&roles.includes(role))return true;
    const answers={...p,roles:[...new Set([...roles,role])]};
    const questions=[...baseQuestions,...(role==='cleaner'?cleanerQuestions:[])].filter(q=>edit||!answers[q.key]);
    say(role==='cleaner'?'Подготовим анкету исполнителя. Назначение на уборку подтверждает заказчик.':'Познакомимся. Я задам несколько коротких вопросов.');
    beginFlow('profile',questions,answers,'profile',after,role);return false;
  }
  function catalog(state:Row,mode='guest',query=''){
    if((mode==='guest'?'guest':'owner')!==selectedRole){say('Для этой страницы нужно переключить роль.');return;}
    let items=mode==='guest'?state.properties:state.ownProperties;
    const budget=query.match(/до\s*(\d[\d ]*)\s*(тыс)?/i);let max=budget?Number(budget[1].replace(/ /g,''))*(budget[2]?1000:1):0;
    const people=/двоих/.test(query)?2:Number(query.match(/(\d+)\s*(гост|человек)/i)?.[1]||0);
    const city=items.find((p:Row)=>query.toLowerCase().includes(p.city.toLowerCase()))?.city||state.profile?.city;
    if(mode==='guest')items=items.filter((p:Row)=>(!max||p.price<=max)&&(!people||p.capacity>=people)&&(!city||p.city.toLowerCase()===city.toLowerCase()));
    say(items.length?(mode==='job'?'Для какой квартиры нужна уборка?':mode==='owner'?'Ваши квартиры.':'Посмотрим, что вам подойдёт.'):(mode==='guest'?'В этом городе пока нет предложений. Можем посмотреть учебный пример.':'Сначала добавим вашу квартиру.'),'properties',{ids:items.map((p:Row)=>p.id),mode});
  }
  // The four answers a booking needs. The map's results already carry all of them; the chat asks for them one by one.
  const bookingQuestions=(property:Row):Question[]=>[{key:'billingMode',text:'Какой тариф выбираете? По ночам заезд и выезд строго в часы, указанные владельцем.',label:'Тариф',choices:[{label:'Сутки',value:'daily'},...(property.policy?.hourly_price?[{label:'Почасово',value:'hourly'}]:[]),...(property.policy?.nightly_price?[{label:'По ночам',value:'nightly'}]:[])]},{key:'start',text:'Когда заедете? Напишите дату и время: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Заезд',date:true},{key:'end',text:'Когда выезжаете? Такой же формат: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Выезд',date:true},{key:'guests',text:'Сколько будет гостей?',label:'Гостей',min:1,max:property.capacity}];
  function run(intent:string,state=data){
    const required=intentRole(intent);if(required&&required!==selectedRole){say('Эта задача относится к другой роли. Нажмите «Сменить роль».');return;}
    if(intent==='properties'){setActor('guest');catalog(state);return;}
    if(intent==='workspace'){if(!state.user){ensure(actor,intent,state);return;}say('Ближайшие события и задачи по вашим данным.','workspace',{role:actor});return;}
    if(intent==='property'){
      if(!ensure('owner',intent,state))return;
      say('Расскажите о квартире одним сообщением, остальное заполню сам.','property-quick',{});return;
    }
    if(intent==='own-properties'){if(ensure('owner',intent,state)){setActor('owner');catalog(state,'owner');}return;}
    if(intent==='cleaner-profile'){if(ensure('cleaner','jobs',state)){setActor('cleaner');say('Анкета уже сохранена. Посмотрим доступные уборки.');run('jobs',state);}return;}
    if(intent==='profile'){ensure(actor,'profile-done',state,true);return;}
    if(intent==='profile-done'){say('Профиль сохранён. Чем займёмся дальше?');return;}
    if(intent==='jobs'||intent==='my-jobs'||intent==='owner-jobs'){
      const role=intent==='owner-jobs'?'owner':'cleaner';if(!ensure(role,intent,state))return;setActor(role);
      const items=state.jobs.filter((j:Row)=>role==='owner'?j.owner_id===state.user.id:intent==='my-jobs'?j.assigned_to===state.user.id||state.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===state.user.id):j.status==='open'&&j.end>Date.now()/1000&&(!state.profile?.city||j.city.toLowerCase()===state.profile.city.toLowerCase()));
      say(items.length?(intent==='jobs'?'Вот доступные уборки. Адрес появится после назначения.':'Вот ваши задания и их текущий статус.'):'Сейчас заданий по этому запросу нет.','jobs',{ids:items.map((j:Row)=>j.id),role});return;
    }
    if(intent==='job'){
      if(!ensure('owner',intent,state))return;setActor('owner');catalog(state,'job');return;
    }
    if(intent.startsWith('book:')){
      if(!ensure('guest',intent,state))return;const property=state.properties.find((p:Row)=>p.id===intent.slice(5));
      if(!property){say('Квартира больше недоступна. Обновите предложения.');return;}
      say('Выберите время проживания в «'+property.title+'».','stay-form',{propertyId:property.id,requestKey:uid()});return;
    }
    if(intent.startsWith('job:')){
      if(!ensure('owner',intent,state))return;const id=intent.slice(4);if(!state.ownProperties.some((p:Row)=>p.id===id)){say('Квартира недоступна.');return;}
      say('Когда и что нужно убрать?','job-form',{propertyId:id});return;
    }
    if(intent==='bookings'||intent==='owner-bookings'){
      const role=intent==='owner-bookings'?'owner':'guest';if(!ensure(role,intent,state))return;setActor(role);
      const items=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===state.user.id:b.guest_id===state.user.id);
      say(items.length?'Ваши бронирования. Время Казахстана.':'У вас пока нет бронирований.','bookings',{ids:items.map((b:Row)=>b.id),role});return;
    }
    if(intent==='demo'){if(!state.user){ensure('guest',intent,state);return;}say('Добавлю две учебные квартиры и уборку. Их увидите только вы. Реальных заездов и выплат по ним нет.','confirm',{path:'demo',body:{},after:selectedRole==='owner'?'own-properties':selectedRole==='cleaner'?'jobs':'properties',title:'Добавить учебные данные'});return;}
    if(intent==='notifications'){if(!state.user){ensure('guest',intent,state);return;}say(state.notifications.length?'Последние события:':'Пока новых событий нет.','notifications');return;}
  }
  async function perform(path:string,body:Row,id:string,after?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/'+path,body,undefined,id+':'+path+':'+(body.action||'save')+(body.expectedVersion!==undefined?':v'+body.expectedVersion:''));finish(id);say(result.message||'Сохранено.');
      try{const state=await load();if(after&&state)run(after,state);}catch(e){await handleError(e);}
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  async function authenticate(mode:string,phone:string,password:string,id:string,intent:string,name?:string,city?:string,recovery?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/auth/'+mode,{phone,password,...(mode==='register'?{name,city}:mode==='recover'?{recoveryCode:recovery}:{})});if(result.recoveryCode)setRecoveryCode(result.recoveryCode);if(mode==='recover'){await saveSession(null);session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setData(empty);setMessages([]);setFlow(null);return;}if(typeof result.token!=='string')throw Error('Сервер не подтвердил вход.');await saveSession(result.token);session.current=true;
      setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);
      // While the last role is opening the chooser is not shown, so the map is the first thing seen after «Войти».
      setOpening(true);try{await openLastRole(await load());}finally{setOpening(false);}
    }finally{locked.current=false;setBusy(false);}
  }
  async function send(value=input){
    const text=value.trim();if(!text||locked.current||!ready)return;setInput('');setMessages(prev=>[...prev,{id:uid(),sender:'user' as const,text}].slice(-120));
    if(/^(стоп|отмена|начать сначала)$/i.test(text)){setFlow(null);say('Остановили ввод. Чем помочь дальше?');return;}
    if(flow){
      const q=flow.questions[flow.index];let answer:any=text;
      try{
        if(q.choices){const choice=q.choices.find(c=>c.value===text||c.label.toLowerCase()===text.toLowerCase());if(!choice)throw new Error('Выберите один из показанных тарифов.');answer=choice.value;}
        else if(q.date)answer=parseDate(text);
        else if(q.min!==undefined){answer=Number(text.replace(/\s/g,'').replace(/(?:₸|тенге|минут[аы]?)$/i,''));if(!Number.isInteger(answer)||answer<q.min||answer>(q.max||Infinity))throw new Error(`Напишите целое число от ${q.min} до ${q.max}.`);}
        else if(text.length>(q.key==='description'?2000:q.key==='experience'?1000:q.key==='name'?100:q.key==='contact'?120:q.key==='city'?80:300))throw new Error('Ответ слишком длинный. Напишите короче.');
        const answers={...flow.answers,[q.key]:answer};
        if(q.key==='end'&&Date.parse(answer)<=Date.parse(answers.start))throw new Error('Окончание должно быть позже начала. Укажите другую дату.');
        if(q.key==='start'&&Date.parse(answer)<Date.now()-60000)throw new Error('Начало должно быть в будущем. Укажите другую дату.');
        const next={...flow,answers,index:flow.index+1};
        if(next.index<next.questions.length){setFlow(next);say(next.questions[next.index].text);}
        else{setFlow(null);say('Всё собрали. Проверьте сведения перед подтверждением.','review',{flow:next});}
      }catch(e:any){say(e.message);}return;
    }
    locked.current=true;setBusy(true);
    try{
      if(/^выйти/i.test(text)){
        let revoked=true;try{if(session.current)await request('/auth/logout',{});}catch{revoked=false;}
        await saveSession(null);session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setData(empty);setMessages([]);setFlow(null);setActor('guest');setHistoryReady(false);say(revoked?'Вы вышли из аккаунта.':'Вы вышли на этом устройстве. Для завершения серверной сессии не хватило связи.');return;
      }
      const state=session.current?await load():data;if(!state)return;
      if(/демо|учебн|пример/i.test(text)){run('demo',state);return;}
      if(/сдать|сдаю|сдавать|добав.*кварт|подключ.*кварт/i.test(text)){run('property',state);return;}
      if(/изменить.*(?:профил|анкет)/i.test(text)){run('profile',state);return;}
      if(/хочу работ|ищу работ|стать.*исполн|работать на убор/i.test(text)){run('cleaner-profile',state);return;}
      if(/нужна убор|создать убор|заказать убор|найти.*(?:уборщ|исполнител)/i.test(text)){run('job',state);return;}
      if(/мои квартир/i.test(text)){run('own-properties',state);return;}
      if(/уборк.*квартир|уборк.*моих|уборки владельца/i.test(text)){run('owner-jobs',state);return;}
      if(/мои (?:задан|отклик|уборк)|назначени/i.test(text)){run('my-jobs',state);return;}
      if(/найти убор|показать убор|доступн.*убор/i.test(text)){run('jobs',state);return;}
      if(/заявки гост|брони владельца/i.test(text)){run('owner-bookings',state);return;}
      if(/мои брон|мои заяв|заезд/i.test(text)){run('bookings',state);return;}
      if(/обзор|ближайш|что.*сегодня|что.*внимани/i.test(text)){run('workspace',state);return;}
      if(/что нового|уведомлен/i.test(text)){run('notifications',state);return;}
      if(/обновить/i.test(text)){say('Данные обновлены.','workspace',{role:actor});return;}
      if(/помощь|что.*уме|о сервисе|как.*работ/i.test(text)){say('Помогу снять квартиру, подключить жильё и организовать уборку. Напишите, что нужно сделать. AI администратор доступен в разделе «Чаты». Там сохраняются вопросы и ответы. Внешняя доставка и банковские платежи зависят от подключений сервиса. Важные действия подтверждаете вы.','help');return;}
      if(/снять|квартир|жиль|аренд/i.test(text)){if(!state.user){run('properties',state);return;}setActor('guest');catalog(state,'guest',text);return;}
      say('Уточните вашу задачу: хотите снять квартиру, сдавать жильё или работать на уборке?','help');
    }catch(e){await handleError(e);}finally{locked.current=false;setBusy(false);composer.current?.focus();}
  }
  function confirm(path:string,body:Row,title:string,after?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);say('Подтвердите действие: '+title.toLowerCase()+'.','confirm',{path,body:{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},title,subject:item?.title,dates:item?date(item.start)+' → '+date(item.end):'',amount:item?.amount??item?.fee,after});}
  function review(m:Message){
    const f=m.payload!.flow as Flow;
    if(f.kind==='booking')return <><BookingReview flow={f} busy={busy} done={m.done} result={m.result} onConfirm={quote=>perform(f.endpoint,{...f.answers,...f.extra,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:true},m.id,f.after)} onEdit={()=>{finish(m.id,'Изменено');const next={...f,index:0};setFlow(next);say(next.questions[0].text);}}/>{!!m.payload!.back&&!m.done&&<Button title="Назад к вариантам" secondary disabled={busy} onPress={backToMap}/>}</>;
    const questions=f.kind==='profile'?[...baseQuestions,...cleanerQuestions]:f.kind==='property'?propertyQuestions:f.questions;
    return <View style={s.card}><Text style={s.cardTitle}>{({profile:'Ваш профиль',property:'Ваша квартира',job:'Уборка',report:'Отчёт',confirm:'Подтверждение'} as Row)[f.kind]||'Проверьте сведения'}</Text>
      {questions.filter(q=>f.answers[q.key]!==undefined).map(q=><View key={q.key} style={s.keyval}><Text style={s.key}>{q.label}</Text><Text style={s.value}>{q.date?date(Date.parse(f.answers[q.key])/1000):String(f.answers[q.key])}</Text></View>)}
      <Button title={m.done?(m.result||'Сохранено'):f.kind==='property'?'Опубликовать квартиру':'Подтвердить'} disabled={busy||m.done} onPress={()=>perform(f.endpoint,{...f.answers,...f.extra},m.id,f.after)}/>
      {!m.done&&<Button title="Отменить" secondary disabled={busy} onPress={()=>{finish(m.id,'Отменено');say('Действие отменено. Данные не отправлены.');}}/>}
    </View>;
  }
  function openAssistantTask(task:Row){
    if(task.kind==='setup'){run(task.intent);return;}
    if(task.kind==='property'){say(task.reason,'property-settings',{id:task.entityId});return;}
    say(task.reason,task.kind==='job'?'jobs':'bookings',{ids:[task.entityId],role:selectedRole});
  }
  // Actions of the map's bottom sheet that continue on another page.
  // stay: the time and guests of the search the flat was found by, so the flat's own page books the same stay.
  function openMapIntent(intent:string,stay?:MapStay){
    scrollMessage.current=null;
    if(intent==='add-property'){setPageId('properties');run('property');return;}
    if(!intent.startsWith('property:'))return;
    const id=intent.slice(9);
    if(!data.properties.some((p:Row)=>p.id===id)){setPageId('catalog');return;}
    setPageId('overview');say('Квартира, выбранная на карте.','properties',{ids:[id],mode:'guest',back:true,...(stay?{stay}:{})});
  }
  // «Забронировать» in the map's results: the dates and guests are chosen there, so the guest goes straight to the check of the request.
  function bookFromMap(found:Row,stay:MapStay){
    scrollMessage.current=null;setPageId('overview');
    if(!ensure('guest','bookings'))return;
    const property=data.properties.find((p:Row)=>p.id===found.id)||found,questions=bookingQuestions(property);
    // A stay kept from an earlier visit may already be behind: the dates are asked again instead of sending the past.
    if(Date.parse(stayISO(stay).start)<Date.now()){run('book:'+property.id);return;}
    const next:Flow={kind:'booking',questions,index:questions.length,answers:{billingMode:stay.mode,...stayISO(stay),guests:stay.guests},endpoint:'bookings',after:'bookings',role:'guest',extra:{propertyId:property.id,requestKey:uid()}};
    setActor('guest');say('Проверьте бронь: «'+property.title+'».','review',{flow:next,back:true});
  }
  // From a flat or a booking check opened on the map: back to the map, where the list of found flats is kept.
  const backToMap=()=>{scrollMessage.current=null;setPageId('map');};
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <View style={s.card}><Text style={s.eyebrow}>ПЛАН АССИСТЕНТА</Text><Text style={s.cardTitle}>{brief.summary}</Text>{brief.tasks.map((task:Row)=><View key={task.id} style={s.event}><Text style={s.eventTitle}>{task.title}</Text><Text style={s.meta}>{task.reason}</Text><Button title="Открыть задачу" secondary disabled={busy} onPress={()=>openAssistantTask(task)}/></View>)}<Text style={s.meta}>Сроки и согласования проверяются сервером. Внешние каналы подключаются отдельно.</Text></View>;}
  function approval(id:string){const card=(data.approvals||[]).find((c:Row)=>c.id===id);return card?<ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>:<Text style={s.meta}>Согласование закрыто или срок истёк. Проверьте статус задачи.</Text>;}
  function block(m:Message){
    const payload=m.payload||{};
    if(m.block==='approval')return approval(payload.id);
    if(m.block==='assistant-brief')return renderAssistantBrief();
    if(m.block==='property-settings'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return property?<PropertyControl key={property.id+':'+property.policy.version} property={property} busy={busy} onSave={body=>perform('properties/'+property.id+'/policy',body,m.id)} onReadiness={body=>perform('properties/'+property.id+'/readiness',body,m.id)}/>:null;}
    if(m.block==='workspace'){
      const target=payload.role||actor,workspace=data.workspaces?.[target];
      if(!workspace)return <View style={s.card}><Text style={s.meta}>Обновите данные, чтобы увидеть ближайшие события.</Text><Button title="Обновить" secondary disabled={busy} onPress={()=>send('Ближайшие события')}/></View>;
      return <View style={s.card}><Text style={s.eyebrow}>БЛИЖАЙШЕЕ</Text><Text accessibilityRole="header" style={s.cardTitle}>{target==='owner'?'Квартиры и заезды':target==='cleaner'?'Ваши задания':'Ваши поездки'}</Text>{data.bookings.filter((b:Row)=>b.status==='confirmed'&&b.terms?.actual_checkin&&!b.terms?.actual_checkout).map((b:Row)=><View key={b.id}><Text style={s.eventTitle}>{b.title}</Text><Button title={target==='owner'?'Обсудить с гостем':'Обсудить с владельцем'} disabled={busy||!!flow} onPress={()=>{setChatInitial({kind:'booking',entityId:b.id,channel:'stay'});setPageId('chats');}}/><ActivityTimer kind="booking" item={b}/><Button title="Открыть проживание" secondary disabled={busy} onPress={()=>say('Данные проживания.','bookings',{ids:[b.id],role:target})}/></View>)}{data.jobs.filter((j:Row)=>['in_progress','submitted'].includes(j.status)).map((j:Row)=><View key={j.id}><Text style={s.eventTitle}>{j.title}</Text>{(target==='owner'&&j.assigned_to||j.assigned_to===userId)&&<Button title={target==='owner'?'Обсудить с исполнителем':'Обсудить с владельцем'} disabled={busy||!!flow} onPress={()=>{setChatInitial({kind:'job',entityId:j.id,channel:'cleaning'});setPageId('chats');}}/>}<ActivityTimer kind="job" item={j}/>{selectedRole==='owner'&&j.worker&&<CleanerCard worker={j.worker}/>}<Button title="Открыть уборку" secondary disabled={busy} onPress={()=>say('Данные уборки.','jobs',{ids:[j.id],role:target})}/></View>)}<View style={s.metrics}>{[{n:target==='cleaner'?workspace.activeJobs:workspace.activeBookings,label:target==='cleaner'?'заданий':'активных броней'},{n:workspace.attention.length,label:'требуют внимания'},{n:workspace.unread,label:'новых событий'}].map(({n,label})=><View key={label} style={s.metric}><Text style={s.metricNumber}>{n}</Text><Text style={s.metricLabel}>{label}</Text></View>)}</View>
        {[['Требует внимания',workspace.attention],['По расписанию',workspace.upcoming]].map(([label,events]:any)=>events.length>0&&<View key={label} style={s.eventGroup}><Text style={s.meta}>{label}</Text>{events.slice(0,5).map((event:Row)=><View key={event.id} style={[s.event,event.urgent&&s.urgentEvent]}><Text style={s.eventTitle}>{event.title}</Text><Text style={s.meta}>{event.detail}{'\n'}{date(event.at)}</Text><Button title="Открыть" secondary disabled={busy} onPress={()=>say('Текущий статус и доступные действия.',event.kind==='job'?'jobs':'bookings',{ids:[event.entityId],role:target})}/></View>)}</View>)}
        {!workspace.attention.length&&!workspace.upcoming.length&&<Text style={s.meta}>Ближайших событий пока нет. Новые брони и задания появятся здесь.</Text>}<Text style={s.meta}>Обновлено: {date(workspace.generatedAt)}</Text>
      </View>;
    }
    if(m.block==='auth')return session.current?<Text style={s.meta}>Вход выполнен.</Text>:<Auth key={m.id} busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,m.id,payload.intent,name,city,recovery)}/>;
    if(m.block==='review')return review(m);
    if(m.block==='stay-form'){const property=data.properties.find((p:Row)=>p.id===payload.propertyId);return property?<StayRequest property={property} busy={busy} done={m.done} result={m.result} onQuote={body=>request('/api/quote',body)} onConfirm={body=>perform('bookings',{...body,requestKey:payload.requestKey},m.id,'bookings')}/>:<Text style={s.meta}>Квартира больше недоступна.</Text>;}
    if(m.block==='job-form'){const property=data.ownProperties.find((p:Row)=>p.id===payload.propertyId);return property?<CleaningRequest property={property} busy={busy} done={m.done} result={m.result} onSubmit={body=>perform('jobs',body,m.id,'owner-jobs')}/>:<Text style={s.meta}>Квартира недоступна.</Text>;}
    if(m.block==='confirm')return <View style={s.card}><Text accessibilityRole="header" style={s.cardTitle}>{payload.title}</Text><Text style={s.text}>{payload.subject||'Подтверждение действия'}</Text><Text style={s.meta}>{payload.dates}{payload.amount!==undefined?' · '+money(payload.amount):''}</Text><Button title={m.done?(m.result||'Действие закрыто'):payload.title} disabled={busy||m.done} onPress={()=>perform(payload.path,payload.body,m.id,payload.after)}/>{!m.done&&<Button title="Отменить" secondary disabled={busy} onPress={()=>finish(m.id,'Отменено')}/>}</View>;
    if(m.block==='help')return <View style={s.suggestions}>{['Хочу снять квартиру','Хочу сдать квартиру','Хочу работать на уборке','Мои брони','Что нового'].map(t=><Button key={t} title={t} secondary disabled={busy} onPress={()=>send(t)}/>)}</View>;
    if(m.block==='property-quick')return m.done?<Text style={s.meta}>{m.result||'Готово'}</Text>:<PropertyQuick city={data.profile?.city||'Павлодар'} onSave={body=>request('/api/listings',body)} onGuestMode={body=>request('/api/operations/matching/preference',body,undefined,undefined,'owner')} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onPlace={body=>request('/api/operations/map/place',body,undefined,undefined,'owner')} onClose={()=>finish(m.id,'Добавление отменено')} onMap={async()=>{finish(m.id,'Квартира добавлена');await load();setPageId('map');}} onDone={async saved=>{finish(m.id,'Квартира добавлена');const state=await load();say(saved.message);catalog(state,'owner');}}/>;
    if(m.block==='property-editor'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return m.done||!property?<Text style={s.meta}>{m.result||'Форма закрыта'}</Text>:<PropertyEdit key={property.id} property={property} onClose={()=>{finish(m.id,'Изменения сохранены');void load().then(state=>{if(state)catalog(state,'owner');});}} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onRemove={async()=>{const r=await request('/api/listings/'+property.id+'/remove',{},undefined,undefined,'owner');finish(m.id,r?.message||'Квартира удалена');const state=await load();if(state)catalog(state,'owner');}} onSave={async body=>{await request('/api/listings/'+property.id,body);const state=await load();return state?.ownProperties?.find((p:Row)=>p.id===property.id);}}/>;}
    if(m.block==='properties')return <View>{!!payload.back&&<Button title="Назад к карте" secondary disabled={busy} onPress={backToMap}/>}{payload.ids.map((id:string)=>{const p=[...data.properties,...data.ownProperties].find((p:Row)=>p.id===id);if(!p)return null;const stay:MapStay|undefined=payload.mode==='guest'?payload.stay:undefined;return <PropertyListing key={id} property={p} owner={payload.mode==='owner'} chooseTitle={stay?'Забронировать':payload.mode==='job'?'Убрать здесь':undefined} onChoose={()=>stay?bookFromMap(p,stay):run((payload.mode==='owner'||payload.mode==='job'?'job:':'book:')+id)} onEdit={()=>say('','property-editor',{id})} onSettings={()=>say('Полномочия и готовность квартиры.','property-settings',{id})}/>;})}{!payload.ids.length&&<Button title={payload.mode==='guest'?'Посмотреть учебный пример':'Добавить квартиру'} secondary disabled={busy} onPress={()=>send(payload.mode==='guest'?'Покажи учебный пример':'Хочу сдать квартиру')}/>}</View>;
    if(m.block==='bookings')return <View>{payload.ids.map((id:string)=>{
      const b=data.bookings.find((b:Row)=>b.id===id);if(!b)return null;const owner=b.owner_id===userId&&payload.role==='owner';
      const confirmed=b.status==='confirmed',started=b.start<=data.serverTime,left=b.amount-(b.terms?.paid_amount||0),guests=Number(b.guests)||1,tens=guests%100,units=guests%10;
      return <View style={recordStyles.card} key={id}><RecordHead kind="booking" item={b} role={payload.role} userId={userId||''}/><RecordJourney kind="booking" item={b}/>
        <RecordFacts rows={[['Гости',guests+' '+(tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей')],owner&&b.guest_name&&['Гость',b.guest_name+(b.guest_contact?' · '+b.guest_contact:'')],b.terms&&['Оплачено',money(b.terms.paid_amount||0)+(left>0?' · остаток '+money(left):'')],b.terms&&['Депозит',b.terms.deposit?money(b.terms.deposit)+' · '+(b.terms.deposit_status==='owner_verified'?'подтверждён владельцем':'ожидается'):'не требуется'],b.readiness&&['Квартира',readinessLabels[b.readiness]],b.address&&['Адрес',b.address+(b.owner_contact?' · '+b.owner_contact:''),true]]}/>
        <ActivityTimer kind="booking" item={b}/>
        <RecordActions busy={busy} actions={[
          owner&&b.status==='requested'&&{title:'Рассмотреть заявку',kind:'main',onPress:()=>say('Запрос гостя на согласование.','approval',{id:'booking:'+id})},
          owner&&confirmed&&started&&!b.terms?.actual_checkin&&{title:'Подтвердить заселение',kind:'main',onPress:()=>confirm('bookings/'+id,{action:'checkin'},'Подтверждаю фактическое заселение гостя','owner-bookings')},
          owner&&confirmed&&b.terms?.deposit_status==='pending'&&{title:'Подтвердить депозит',kind:'main',onPress:()=>confirm('bookings/'+id,{action:'deposit_received'},'Подтверждаю фактическое получение депозита; банковская операция не выполняется','owner-bookings')},
          owner&&confirmed&&b.payment_status!=='owner_verified'&&{title:'Отметить оплату',kind:'main',onPress:()=>confirm('bookings/'+id,{action:'paid',expectedAmount:b.amount},'Отметить оплату после проверки в банке')},
          owner&&confirmed&&started&&{title:'Подтвердить выезд',kind:'main',onPress:()=>confirm('bookings/'+id,{action:'checkout'},'Подтверждаю, что гость выехал и квартира освобождена','owner-bookings')},
          !owner&&confirmed&&started&&!b.terms?.checkout_reported_at&&{title:'Сообщить о выезде',kind:'main',onPress:()=>confirm('bookings/'+id,{action:'report_checkout'},'Сообщить владельцу о выезде; освобождение квартиры потребует проверки')},
          {title:'Открыть чат',kind:'side',onPress:()=>{setChatInitial({kind:'booking',entityId:id,channel:'stay'});setPageId('chats');}},
          confirmed&&{title:'Есть проблема',kind:'side',onPress:()=>beginFlow('issue',[{key:'issue',text:'Что произошло? Сообщение получит другая сторона бронирования.',label:'Проблема'}],{},'bookings/'+id,'bookings',actor,{action:'issue'})},
          ['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&{title:'Отменить бронь',kind:'danger',onPress:()=>confirm('bookings/'+id,{action:'cancel'},'Отменить бронирование. Возврат денег согласуется отдельно')},
        ]}/>
        <BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={payload.role} busy={busy} onReview={id=>say('Предложение новых условий.','approval',{id:'change:'+id})} onQuote={body=>request('/api/bookings/'+id+'/change-quote',body)} onPropose={body=>perform('bookings/'+id+'/changes',body,uid())} onDecide={(changeId,action)=>perform('bookings/'+id+'/changes/'+changeId,{action},uid())}/>
        {payload.role==='guest'&&b.status==='completed'&&!b.review_rating&&<StayReview busy={busy} onSubmit={(rating,text)=>perform('operations/review',{bookingId:id,rating,text},uid())}/>}
      </View>;
    })}</View>;
    if(m.block==='jobs')return <View>{payload.ids.map((id:string)=>{
      const j=data.jobs.find((j:Row)=>j.id===id);if(!j)return null;const owner=j.owner_id===userId&&payload.role==='owner',assigned=j.assigned_to===userId&&!owner;
      const applied=data.applications.some((a:Row)=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
      const application=data.applications.find((a:Row)=>a.job_id===id&&a.user_id===userId);
      return <View style={recordStyles.card} key={id}><RecordHead kind="job" item={j} role={payload.role} userId={userId||''} application={application}/><RecordJourney kind="job" item={j}/>
        <RecordFacts rows={[j.description&&['Что сделать',j.description],j.address&&['Адрес',j.address+(j.owner_contact?' · '+j.owner_contact:''),true],j.report&&['Отчёт',j.report]]}/>
        <ActivityTimer kind="job" item={j}/>
        {assigned&&j.status==='assigned'&&!j.checkout_confirmed&&<Text style={s.meta}>Ожидаем подтверждения выезда гостя.</Text>}
        <RecordActions busy={busy} actions={[
          !owner&&j.status==='open'&&{title:applied?'Отклик отправлен':'Откликнуться',kind:'main',disabled:applied,onPress:()=>perform('jobs/'+id,{action:'apply'},m.id)},
          assigned&&j.status==='assigned'&&{title:'Начать уборку',kind:'main',disabled:!j.checkout_confirmed,onPress:()=>confirm('jobs/'+id,{action:'start'},'Отметить начало работы','my-jobs')},
          assigned&&j.status==='in_progress'&&{title:'Подготовить отчёт',kind:'main',onPress:()=>say('Проверьте каждый пункт. Отчёт уйдёт владельцу после вашего подтверждения.','report',{id})},
          owner&&j.status==='submitted'&&{title:'Рассмотреть отчёт',kind:'main',onPress:()=>say('Отчёт на приёмке.','approval',{id:'report:'+id})},
          (owner||assigned)&&{title:'Открыть чат',kind:'side',onPress:()=>{setChatInitial({kind:'job',entityId:id,channel:'cleaning'});setPageId('chats');}},
        ]}/>
        {owner&&j.status==='open'&&data.applications.filter((a:Row)=>a.job_id===id&&a.status==='pending').map((a:Row)=><View key={a.id} style={s.card}><CleanerCard worker={a.worker||a}/><Button title="Рассмотреть отклик" disabled={busy} onPress={()=>say('Отклик исполнителя.','approval',{id:'application:'+a.id})}/></View>)}
      </View>;
    })}{payload.role==='owner'&&<Button title="Создать уборку" secondary disabled={busy} onPress={()=>send('Создать уборку')}/>}</View>;
    if(m.block==='report')return <Report busy={busy||!!m.done} onSubmit={(body:Row)=>perform('jobs/'+payload.id,{action:'submit',...body},m.id,'my-jobs')}/>;
    if(m.block==='notifications')return <View>{data.notifications.slice(0,20).map((n:Row)=><View style={s.card} key={n.id}><Text style={s.text}>{n.body}</Text><Text style={s.meta}>{date(n.created_at)}</Text></View>)}</View>;
    return null;
  }
  const pages=selectedRole?rolePages[selectedRole]:[];
  const page=pages.find(p=>p.id===pageId);
  const nextTask=data.assistantBrief?.automatic?data.assistantBrief.prompts[0]:null;
  const homeCity=String(data.profile?.city||''),cityFlats=pageId==='catalog'&&homeCity?data.properties.filter((p:Row)=>p.city===homeCity):[],byCity=cityFlats.length>0&&!allCities;
  const allIds:string[]=pageId==='catalog'?(byCity?cityFlats:data.properties).map((p:Row)=>p.id):pageId==='properties'?data.ownProperties.map((p:Row)=>p.id):pageId==='bookings'?data.bookings.map((b:Row)=>b.id):(pageId==='assignments'?data.jobs.filter((j:Row)=>j.assigned_to===userId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===userId)):data.jobs).map((j:Row)=>j.id);
  const ids=allIds.slice(0,listed.page===pageId?listed.count:12),hidden=allIds.length-ids.length;
  const primary:Message={id:'page-'+pageId,sender:'assistant',text:'',block:pageId==='overview'?'workspace':pageId==='properties'||pageId==='catalog'?'properties':pageId==='bookings'?'bookings':['cleaning','jobs','assignments'].includes(pageId)?'jobs':undefined,payload:{ids,role:selectedRole,mode:selectedRole==='owner'?'owner':'guest'}};
  if(erasureResult)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.transcript}><View style={s.card}><Text style={s.cardTitle}>Результат удаления</Text><Text style={s.text}>{erasureResult.message}</Text><Text selectable style={s.meta}>Квитанция: {erasureResult.receipt.id}</Text><Button title="Продолжить" onPress={()=>setErasureResult(null)}/></View></ScrollView></SafeAreaView>;
  if(recoveryCode)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.transcript}><View style={s.card}><Text style={s.cardTitle}>Сохраните резервный код</Text><Text style={s.text}>Он понадобится для восстановления доступа к общему аккаунту. Код показывается один раз и не сохраняется в переписке.</Text><Text selectable style={s.value}>{recoveryCode}</Text><Button title="Код сохранён — продолжить" onPress={()=>setRecoveryCode('')}/></View></ScrollView></SafeAreaView>;
  if(!selectedRole)return <RoleEntry banner={offline} notice={linkError} ready={ready&&!opening} profile={data.profile} user={data.user} busy={busy} auth={<Auth busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,'entry','workspace',name,city,recovery)}/>} onChoose={chooseRole} onSave={async(body,role)=>{await request('/api/profile',body);await chooseRole(role);}} onLogout={()=>send('Выйти')}/>;
  return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/><KeyboardAvoidingView style={s.shell} behavior={pageId==='chats'?undefined:'padding'}>
    {!chatsActive&&!(pageId==='map'&&!flow)&&<View style={s.header}><View style={{flex:1}}><Text accessibilityRole="header" numberOfLines={1} style={s.headerTitle}>{page?.title||'AI Аренда'}</Text><Text numberOfLines={1} style={s.subtitle}>{roleNames[selectedRole]}</Text></View>{!flow&&<Pressable accessibilityRole="button" accessibilityLabel="Открыть AI администратора" disabled={busy} onPress={()=>{setInput('');setPageId('chats');setChatInitial({administrator:true});}} style={({pressed})=>[s.headerAI,pressed&&s.disabled]}><Text style={s.headerAIText}>AI</Text></Pressable>}<WorkspaceMenuButton open={navigationMenu} busy={busy||!!flow} onPress={()=>setNavigationMenu(v=>!v)}/></View>}
    {offline}{!!linkError&&<Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}{processLinks.pending&&chatsActive&&<Text style={s.meta}>Ссылка откроется после закрытия диалога.</Text>}<PageTransition page={pageId}>{pageId==='map'&&!flow?<MapHome key={userId+':'+selectedRole} role={selectedRole} accountId={userId} data={data} menu={<WorkspaceMenuButton avatar avatarId={data.profile?.avatar_id} open={navigationMenu} busy={busy} onPress={()=>setNavigationMenu(v=>!v)}/>} onChanged={async()=>{await load();}} onOpenPage={id=>{scrollMessage.current=null;setPageId(id);}} onOpenProcess={(kind,id)=>{setPageId('overview');say('Текущий статус и доступные действия.',kind==='job'?'jobs':'bookings',{ids:[id],role:selectedRole});}} onAsk={text=>{setInput('');setChatInitial({administrator:true,text,key:uid(),fromMap:true});setPageId('chats');}} onIntent={openMapIntent} onBook={bookFromMap}/>:pageId==='chats'?<NativeChats key={userId+':'+selectedRole} accountId={userId} role={selectedRole} onChanged={load} initial={chatInitial} onInitialConsumed={()=>setChatInitial(null)} onConversationChange={setChatsActive} onAuthError={handleError} onReturnToMap={()=>setPageId('map')}/>:<><ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={s.transcript} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>{if(messages[messages.length-1]?.sender==='user'||busy)scroll.current?.scrollToEnd({animated:true});}}>
      {pageId==='overview'&&<ApprovalInbox cards={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>}
      {pageId==='overview'&&(data.approvals||[]).some((c:Row)=>c.canDecide)&&<Button title={'Согласования · '+data.approvals.filter((c:Row)=>c.canDecide).length} disabled={busy||!!flow} onPress={()=>{setPageId('chats');setChatInitial({administrator:true});}}/>}
      {pageId==='overview'&&nextTask&&<Pressable accessibilityRole="button" accessibilityLabel={'Ассистент рекомендует: '+nextTask.title} disabled={busy} onPress={()=>openAssistantTask(nextTask)} style={[s.recommendation,nextTask.priority===3&&s.urgentRecommendation]}><Text style={s.recommendationLabel}>Ассистент рекомендует</Text><Text style={s.eventTitle}>{nextTask.title}</Text></Pressable>}
      {pageId==='properties'&&<Button title="Добавить квартиру" disabled={busy} onPress={()=>run('property')}/>}
      {pageId==='account'?<AccountControl role={selectedRole} onChanged={load} onSignedOut={signedOut} key={selectedRole} onEdit={()=>run('profile')} onSwitchRole={switchRole} onLogout={()=>send('Выйти')}/>:pageId==='calendar'?<RentalCalendar data={data} role={selectedRole} busy={busy} onOpen={(kind,id)=>say('Текущий статус и доступные действия.',kind==='job'?'jobs':'bookings',{ids:[id],role:selectedRole})}/>:<>{pageId==='catalog'&&cityFlats.length>0&&cityFlats.length<data.properties.length&&<View style={s.listScope}><Text style={[s.meta,{flex:1}]}>{byCity?homeCity+' · '+allIds.length:'Все города · '+allIds.length}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setAllCities(!allCities);setListed({page:pageId,count:12});}} style={({pressed})=>[s.listScopeLink,pressed&&s.disabled]}><Text style={s.listScopeText}>{byCity?'Показать все города':'Только '+homeCity}</Text></Pressable></View>}{primary.block&&block(primary)}{!!primary.block&&pageId!=='overview'&&hidden>0&&<Button title={'Показать ещё '+Math.min(12,hidden)} secondary disabled={busy} onPress={()=>setListed({page:pageId,count:ids.length+12})}/>}</>}
      {messages.map((m,index)=><View key={m.id} onLayout={event=>{if(index===messages.length-1&&m.sender==='assistant'&&m.id===scrollMessage.current)scroll.current?.scrollTo({y:Math.max(0,event.nativeEvent.layout.y-12),animated:false});}} style={[s.message,m.sender==='user'?s.user:s.assistant]}>{m.sender==='assistant'&&<Text style={s.sender}>AI АРЕНДА</Text>}<Text selectable style={s.text}>{m.text}</Text>{m.sender==='assistant'&&block(m)}</View>)}
      {busy&&<ActivityIndicator accessibilityLabel="Ожидаем ответ сервера" color={C.accent} style={{alignSelf:'flex-start',marginBottom:20}}/>}
      {saveError&&<Text accessibilityRole="alert" style={s.error}>История ещё не сохранена. Проверьте связь; заявки хранятся на сервере.</Text>}
    </ScrollView>
    {flow?<View style={s.composerWrap}>{flow?.questions[flow.index].choices&&<View style={s.buttonRow}>{flow.questions[flow.index].choices!.map(choice=><Button key={choice.value} title={choice.label} secondary disabled={busy} onPress={()=>send(choice.label)}/>)}</View>}{!!flow&&<View style={s.flowProgress}><Text style={s.flowLabel}>Вопрос {flow.index+1} из {flow.questions.length}</Text><View style={s.buttonRow}>{flow.index>0&&<Button title="Назад" secondary disabled={busy} onPress={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}/>}<Button title="Стоп" secondary disabled={busy} onPress={()=>send('Стоп')}/></View></View>}<View style={s.composer}><TextInput ref={composer} accessibilityLabel="Ваш ответ" placeholder="Ваш ответ…" placeholderTextColor={C.muted} value={input} onChangeText={setInput} style={s.input} maxLength={2500} multiline submitBehavior="submit" onSubmitEditing={()=>send()} editable={ready&&!busy}/><Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" accessibilityState={{disabled:!ready||busy||!input.trim()}} disabled={!ready||busy||!input.trim()} onPress={()=>send()} style={[s.send,(!input.trim()||busy)&&s.disabled]}><Text style={s.sendText}>{busy?'Ждите':'Отправить'}</Text></Pressable></View><Text style={s.footnote}>Данные формы отправятся после проверки и подтверждения.</Text></View>:null}</>}</PageTransition>
  {!chatsActive&&<WorkspaceNavigation avatarId={data.profile?.avatar_id} name={data.profile?.name} role={selectedRole} pageId={pageId} busy={busy||!!flow} onSelect={id=>{scrollMessage.current=null;setPageId(id);scroll.current?.scrollTo({y:0,animated:false});}} more={navigationMenu} setMore={setNavigationMenu} onSwitchRole={switchRole}/>}</KeyboardAvoidingView></SafeAreaView></ActivityClockProvider>;
}
function Report({busy,onSubmit}:{busy:boolean;onSubmit:(body:Row)=>void}){
  const [checks,setChecks]=useState([false,false,false,false]),[report,setReport]=useState('');
  return <View style={s.card}>{['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Квартира проверена перед заездом'].map((label,i)=><Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked:checks[i],disabled:busy}} disabled={busy} onPress={()=>setChecks(prev=>prev.map((v,k)=>k===i?!v:v))} style={s.keyval}><Text style={s.text}>{checks[i]?'☑':'☐'}  {label}</Text></Pressable>)}<TextInput accessibilityLabel="Текст отчёта" style={s.field} placeholder="Что сделано, есть ли замечания?" placeholderTextColor={C.muted} multiline value={report} onChangeText={setReport} maxLength={1500} editable={!busy}/><Button title="Отправить отчёт владельцу" disabled={busy||checks.some(v=>!v)||!report.trim()} onPress={()=>onSubmit({checklist:checks,report})}/></View>;
}
// Every tap is noted, so a request that follows it lights the loading line (background refreshes do not).
export default function App(){return <SafeAreaProvider><View style={{flex:1}} onStartShouldSetResponderCapture={markGesture}><Chat/><LoadingBar/><EntrySplash/></View></SafeAreaProvider>;}
