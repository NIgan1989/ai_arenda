import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator,AppState,KeyboardAvoidingView,Platform,Pressable,ScrollView,StatusBar,Text,TextInput,View } from 'react-native';
import { SafeAreaProvider,SafeAreaView } from 'react-native-safe-area-context';
import { ApiError,request,restoreSession,saveSession,setWorkspaceRole } from './src/api';
import { baseQuestions,cleanerQuestions,date,empty,labels,money,parseDate,propertyQuestions,uid,type Flow,type Message,type Question,type Role,type Row } from './src/model';
import { C,s } from './src/styles';
import {ActivityClockProvider,ActivityTimer} from './src/ActivityTimer';
import {ApprovalCard,ApprovalInbox} from './src/ApprovalCard';
import {PropertyControl,readinessLabels} from './src/PropertyControl';
import {BookingChanges} from './src/BookingChanges';
import {WorkspaceNavigation,WorkspaceMenuButton} from './src/WorkspaceNavigation';
import {AccountControl} from './src/AccountControl';
import {RentalCalendar} from './src/RentalCalendar';
import {AssistantControl} from './src/AssistantControl';
import {RoleEntry,roleNames,rolePages,intentRole} from './src/RoleEntry';

function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  const [focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={({pressed})=>[s.button,secondary&&s.secondary,focused&&s.focusRing,(disabled||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
}
function BookingReview({flow,busy,done,result,onConfirm,onEdit}:{flow:Flow;busy:boolean;done?:boolean;result?:string;onConfirm:(quote:Row)=>void;onEdit:()=>void}){
  const [quote,setQuote]=useState<Row|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[attempt,setAttempt]=useState(0);
  const [accepted,setAccepted]=useState(false);
  useEffect(()=>{let active=true;if(done)return;setAccepted(false);setChecking(true);setError('');request('/api/quote',{...flow.answers,...flow.extra}).then(value=>{if(active)setQuote(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[flow,attempt,done]);
  if(done)return <View style={s.card}><Text style={s.badge}>{result||'Сохранено'}</Text><Text style={s.meta}>{result==='Изменено'?'Этот расчёт закрыт. Продолжите ввод в разговоре.':'Заявка и её статус доступны в «Мои брони».'}</Text></View>;
  return <View style={s.card}><Text style={s.eyebrow}>ПРОВЕРКА ЗАЯВКИ</Text><Text accessibilityRole="header" style={s.cardTitle}>{quote?.title||'Проживание'}</Text>
    {checking&&<View style={s.progressRow}><ActivityIndicator color={C.green}/><Text style={s.meta}>Проверяю стоимость и свободный интервал…</Text></View>}
    {!!error&&<><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Проверить ещё раз" secondary disabled={busy||checking} onPress={()=>setAttempt(v=>v+1)}/></>}
    {quote&&!error&&!checking&&<><View style={s.keyval}><Text style={s.key}>Заезд</Text><Text style={s.value}>{date(quote.start)}</Text></View><View style={s.keyval}><Text style={s.key}>Выезд</Text><Text style={s.value}>{date(quote.end)}</Text></View><View style={s.keyval}><Text style={s.key}>Гостей</Text><Text style={s.value}>{quote.guests}</Text></View><Text style={s.meta}>{quote.periods} × {money(quote.price)} · {quote.unitLabel}</Text><View style={s.quoteTotal}><Text style={s.key}>Стоимость проживания</Text><Text style={s.price}>{money(quote.amount)}</Text></View><Text style={s.meta}>После выезда — {quote.cleaningMinutes} мин. на подготовку квартиры. Депозит: {money(quote.policy.deposit)}. {quote.policy.house_rules}</Text><Text style={s.meta}>Интервал ещё не зарезервирован. Отправка заявки не списывает деньги. {quote.policy.auto_confirm?'Бронь подтверждается автоматически по правилам владельца.':'После отправки у владельца будет 30 минут на решение.'}</Text><Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} disabled={busy} onPress={()=>setAccepted(v=>!v)} style={s.keyval}><Text style={s.text}>Согласен с датами, тарифом, депозитом и правилами: {accepted?'да':'нет'}</Text></Pressable><Button title="Отправить заявку" disabled={busy||!accepted} onPress={()=>onConfirm(quote)}/></>}
    <Button title="Изменить даты и гостей" secondary disabled={busy||checking} onPress={onEdit}/>
  </View>;
}
function Auth({onSubmit,busy}:{onSubmit:(mode:string,login:string,password:string)=>Promise<void>;busy:boolean}){
  const [mode,setMode]=useState('register'),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  return <View style={s.card}>
    <Text style={s.cardTitle}>{mode==='register'?'Сохраним ваши заявки':'С возвращением'}</Text>
    <Text style={s.meta}>Один аккаунт для жилья и работы. В пилотной версии — вход по логину и паролю, без проверки телефона.</Text>
    <Text style={s.fieldLabel}>Логин</Text>
    <TextInput accessibilityLabel="Логин" style={s.field} placeholder="Логин латиницей" placeholderTextColor={C.muted} value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={40} editable={!busy}/>
    <Text style={s.fieldLabel}>Пароль</Text><TextInput accessibilityLabel="Пароль" style={s.field} placeholder="Пароль, от 10 символов" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode==='register'?'new-password':'current-password'} maxLength={128} editable={!busy}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button title={mode==='register'?'Создать аккаунт':'Войти'} disabled={busy} onPress={()=>{setError('');onSubmit(mode,login,password).then(()=>setPassword('')).catch(e=>setError(e.message));}}/>
    <Button secondary title={mode==='register'?'Уже есть аккаунт':'Создать новый аккаунт'} disabled={busy} onPress={()=>{setError('');setPassword('');setMode(mode==='register'?'login':'register');}}/>
  </View>;
}

function Chat(){
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[flow,setFlow]=useState<Flow|null>(null),[actor,setActor]=useState<Role>('guest');
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[online,setOnline]=useState(false),[historyReady,setHistoryReady]=useState(false),[saveError,setSaveError]=useState(false);
  const scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null),locked=useRef(false),session=useRef(false),pending=useRef(''),seen=useRef(new Set<string>());
  const [navigationMenu,setNavigationMenu]=useState(false);
  const [selectedRole,setSelectedRole]=useState<Role|null>(null),[pageId,setPageId]=useState('overview');
  const activeRoleRef=useRef<Role|null>(null),scrollMessage=useRef<string|null>(null);
  const userId=data.user?.id;
  const say=(text:string,block?:string,payload?:Row)=>{const id=uid();scrollMessage.current=id;setMessages(prev=>[...prev,{id,sender:'assistant' as const,text,block,payload}].slice(-120));};
  const finish=(id:string,result='Сохранено')=>setMessages(prev=>prev.map(m=>m.id===id?{...m,done:true,result}:m));
  async function load(){
    const active=activeRoleRef.current;
    try{const state=await request(active?'/api/state':'/api/access');if(activeRoleRef.current===active)setData(active?state:{...empty,...state});setOnline(true);return state;}
    catch(error){if(active&&error instanceof ApiError&&error.status===403){setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);setData({...empty,...await request('/api/access')});}throw error;}
  }
  async function hydrate(role:Role){
    setWorkspaceRole(role);activeRoleRef.current=role;
    const [state,history]=await Promise.all([request('/api/state'),request('/api/conversation')]);
    setData(state);setMessages(history.messages||[]);setFlow(history.flow||null);setActor(role);setSelectedRole(role);setPageId('overview');setSaveError(false);setOnline(true);setHistoryReady(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));return state;
  }
  async function chooseRole(role:Role){if(locked.current)return;locked.current=true;setBusy(true);try{await hydrate(role);}catch(e){setWorkspaceRole(null);activeRoleRef.current=null;throw e;}finally{locked.current=false;setBusy(false);}}
  function switchRole(){if(locked.current)return;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);setInput('');setData({...empty,user:data.user,profile:data.profile});}
  async function handleError(error:any){
    if(error instanceof ApiError&&error.status===401&&session.current){
      await saveSession(null);session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setData(empty);setMessages([]);setFlow(null);say('Сессия закончилась. Войдите снова.','auth',{intent:pending.current||'properties'});
    }else {setOnline(error instanceof ApiError);say(error.message);}
  }
  useEffect(()=>{let active=true;(async()=>{
    try{setWorkspaceRole(null);const token=await restoreSession();if(!active)return;session.current=!!token;if(token)await load();else setOnline(true);}
    catch(e){if(active)await handleError(e);}
    finally{if(active)setReady(true);}
  })();return()=>{active=false;};},[]);
  useEffect(()=>{
    if(!userId||!historyReady||!selectedRole)return;
    const timer=setTimeout(()=>{request('/api/conversation',{messages,flow,actor},'PUT').then(()=>setSaveError(false)).catch(()=>setSaveError(true));},500);
    return()=>clearTimeout(timer);
  },[messages,flow,actor,userId,historyReady,selectedRole]);
  useEffect(()=>{
    if(!userId||!selectedRole)return;
    async function refresh(){if(AppState.currentState!=='active'||locked.current)return;try{const state=await load();
      const fresh=state.notifications.filter((n:Row)=>!seen.current.has(n.id));state.notifications.forEach((n:Row)=>seen.current.add(n.id));
      if(fresh.length)say('Появились новые события. Напишите «Что нового», чтобы посмотреть.');
    }catch{setOnline(false);}}
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
  function run(intent:string,state=data){
    const required=intentRole(intent);if(required&&required!==selectedRole){say('Эта задача относится к другой роли. Нажмите «Сменить роль».');return;}
    if(intent==='properties'){setActor('guest');catalog(state);return;}
    if(intent==='workspace'){if(!state.user){ensure(actor,intent,state);return;}say('Ближайшие события и задачи по вашим данным.','workspace',{role:actor});return;}
    if(intent==='property'){
      if(!ensure('owner',intent,state))return;
      const answers:Row={city:state.profile.city};say('Добавим квартиру. Перед публикацией вы проверите все сведения.');
      beginFlow('property',propertyQuestions.filter(q=>!answers[q.key]),answers,'properties','own-properties','owner');return;
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
      say('Уточним время проживания в «'+property.title+'». Все даты — по времени Казахстана (UTC+5).');
      beginFlow('booking',[{key:'billingMode',text:'Какой тариф выбираете? По ночам заезд и выезд строго в часы, указанные владельцем.',label:'Тариф',choices:[{label:'Сутки',value:'daily'},...(property.policy?.hourly_price?[{label:'Почасово',value:'hourly'}]:[]),...(property.policy?.nightly_price?[{label:'По ночам',value:'nightly'}]:[])]},{key:'start',text:'Когда заедете? Напишите дату и время: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Заезд',date:true},{key:'end',text:'Когда выезжаете? Такой же формат: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Выезд',date:true},{key:'guests',text:'Сколько будет гостей?',label:'Гостей',min:1,max:property.capacity}],{},'bookings','bookings','guest',{propertyId:property.id,requestKey:uid()});return;
    }
    if(intent.startsWith('job:')){
      if(!ensure('owner',intent,state))return;const id=intent.slice(4);if(!state.ownProperties.some((p:Row)=>p.id===id)){say('Квартира недоступна.');return;}
      beginFlow('job',[{key:'start',text:'Когда нужно начать уборку? ДД.ММ.ГГГГ ЧЧ:ММ, время Казахстана (UTC+5).',label:'Начало',date:true},{key:'end',text:'К какому времени нужно закончить? ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Окончание',date:true},{key:'fee',text:'Какое вознаграждение за уборку, в тенге?',label:'Вознаграждение, ₸',min:100,max:1000000},{key:'description',text:'Что нужно сделать? Есть ли бельё и средства на объекте?',label:'Условия'}],{},'jobs','owner-jobs','owner',{propertyId:id});return;
    }
    if(intent==='bookings'||intent==='owner-bookings'){
      const role=intent==='owner-bookings'?'owner':'guest';if(!ensure(role,intent,state))return;setActor(role);
      const items=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===state.user.id:b.guest_id===state.user.id);
      say(items.length?'Ваши бронирования. Время Казахстана (UTC+5).':'У вас пока нет бронирований.','bookings',{ids:items.map((b:Row)=>b.id),role});return;
    }
    if(intent==='demo'){if(!state.user){ensure('guest',intent,state);return;}say('Добавлю две учебные квартиры и уборку. Их увидите только вы. Реальных заездов и выплат по ним нет.','confirm',{path:'demo',body:{},after:selectedRole==='owner'?'own-properties':selectedRole==='cleaner'?'jobs':'properties',title:'Добавить учебные данные'});return;}
    if(intent==='notifications'){if(!state.user){ensure('guest',intent,state);return;}say(state.notifications.length?'Последние события:':'Пока новых событий нет.','notifications');return;}
  }
  async function perform(path:string,body:Row,id:string,after?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/'+path,body,undefined,id+':'+path+':'+(body.action||'save')+(body.expectedVersion!==undefined?':v'+body.expectedVersion:''));finish(id);say(result.message||'Сохранено.');
      try{const state=await load();if(after)run(after,state);}catch(e){await handleError(e);}
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  async function authenticate(mode:string,login:string,password:string,id:string,intent:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/auth/'+mode,{login,password});await saveSession(result.token);session.current=true;
      setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);await load();
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
      const state=session.current?await load():data;
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
      if(/помощь|что.*уме|о сервисе|как.*работ/i.test(text)){say('Помогу снять квартиру, подключить жильё и организовать уборку. Напишите, что нужно сделать. В этой первой версии я веду диалог по сценариям. Свободный ИИ, фото, мессенджеры и автоматические платежи ещё не подключены. Важные действия подтверждаете вы.','help');return;}
      if(/снять|квартир|жиль|аренд/i.test(text)){if(!state.user){run('properties',state);return;}setActor('guest');catalog(state,'guest',text);return;}
      say('Уточните вашу задачу: хотите снять квартиру, сдавать жильё или работать на уборке?','help');
    }catch(e){await handleError(e);}finally{locked.current=false;setBusy(false);composer.current?.focus();}
  }
  function confirm(path:string,body:Row,title:string,after?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);say('Подтвердите действие: '+title.toLowerCase()+'.','confirm',{path,body:{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},title,subject:item?.title,dates:item?date(item.start)+' → '+date(item.end):'',amount:item?.amount??item?.fee,after});}
  function review(m:Message){
    const f=m.payload!.flow as Flow;
    if(f.kind==='booking')return <BookingReview flow={f} busy={busy} done={m.done} result={m.result} onConfirm={quote=>perform(f.endpoint,{...f.answers,...f.extra,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:true},m.id,f.after)} onEdit={()=>{finish(m.id,'Изменено');const next={...f,index:0};setFlow(next);say(next.questions[0].text);}}/>;
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
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <View style={s.card}><Text style={s.eyebrow}>ПЛАН АССИСТЕНТА</Text><Text style={s.cardTitle}>{brief.summary}</Text>{brief.tasks.map((task:Row)=><View key={task.id} style={s.event}><Text style={s.eventTitle}>{task.title}</Text><Text style={s.meta}>{task.reason}</Text><Button title="Открыть задачу" secondary disabled={busy} onPress={()=>openAssistantTask(task)}/></View>)}<Text style={s.meta}>Фоновая доставка сообщений и действия свободной модели пока не подключены.</Text></View>;}
  function approval(id:string){const card=(data.approvals||[]).find((c:Row)=>c.id===id);return card?<ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>:<Text style={s.meta}>Согласование закрыто или срок истёк. Проверьте статус задачи.</Text>;}
  function block(m:Message){
    const payload=m.payload||{};
    if(m.block==='approval')return approval(payload.id);
    if(m.block==='assistant-brief')return renderAssistantBrief();
    if(m.block==='property-settings'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return property?<PropertyControl key={property.id+':'+property.policy.version} property={property} busy={busy} onSave={body=>perform('properties/'+property.id+'/policy',body,m.id)} onReadiness={body=>perform('properties/'+property.id+'/readiness',body,m.id)}/>:null;}
    if(m.block==='workspace'){
      const target=payload.role||actor,workspace=data.workspaces?.[target];
      if(!workspace)return <View style={s.card}><Text style={s.meta}>Обновите данные, чтобы увидеть ближайшие события.</Text><Button title="Обновить" secondary disabled={busy} onPress={()=>send('Ближайшие события')}/></View>;
      return <View style={s.card}><Text style={s.eyebrow}>БЛИЖАЙШЕЕ</Text><Text accessibilityRole="header" style={s.cardTitle}>{target==='owner'?'Квартиры и заезды':target==='cleaner'?'Ваши задания':'Ваши поездки'}</Text>{data.bookings.filter((b:Row)=>b.status==='confirmed'&&b.terms?.actual_checkin&&!b.terms?.actual_checkout).map((b:Row)=><View key={b.id}><Text style={s.eventTitle}>{b.title}</Text><ActivityTimer kind="booking" item={b}/><Button title="Открыть проживание" secondary disabled={busy} onPress={()=>say('Данные проживания.','bookings',{ids:[b.id],role:target})}/></View>)}{data.jobs.filter((j:Row)=>['in_progress','submitted'].includes(j.status)).map((j:Row)=><View key={j.id}><Text style={s.eventTitle}>{j.title}</Text><ActivityTimer kind="job" item={j}/><Button title="Открыть уборку" secondary disabled={busy} onPress={()=>say('Данные уборки.','jobs',{ids:[j.id],role:target})}/></View>)}<View style={s.metrics}>{[{n:target==='cleaner'?workspace.activeJobs:workspace.activeBookings,label:target==='cleaner'?'заданий':'активных броней'},{n:workspace.attention.length,label:'требуют внимания'},{n:workspace.unread,label:'новых событий'}].map(({n,label})=><View key={label} style={s.metric}><Text style={s.metricNumber}>{n}</Text><Text style={s.metricLabel}>{label}</Text></View>)}</View>
        {[['Требует внимания',workspace.attention],['По расписанию',workspace.upcoming]].map(([label,events]:any)=>events.length>0&&<View key={label} style={s.eventGroup}><Text style={s.meta}>{label}</Text>{events.slice(0,5).map((event:Row)=><View key={event.id} style={[s.event,event.urgent&&s.urgentEvent]}><Text style={s.eventTitle}>{event.title}</Text><Text style={s.meta}>{event.detail}{'\n'}{date(event.at)}</Text><Button title="Открыть" secondary disabled={busy} onPress={()=>say('Текущий статус и доступные действия.',event.kind==='job'?'jobs':'bookings',{ids:[event.entityId],role:target})}/></View>)}</View>)}
        {!workspace.attention.length&&!workspace.upcoming.length&&<Text style={s.meta}>Ближайших событий пока нет. Новые брони и задания появятся здесь.</Text>}<Text style={s.meta}>Обновлено: {date(workspace.generatedAt)}</Text>
      </View>;
    }
    if(m.block==='auth')return session.current?<Text style={s.meta}>Вход выполнен.</Text>:<Auth key={m.id} busy={busy} onSubmit={(mode,login,password)=>authenticate(mode,login,password,m.id,payload.intent)}/>;
    if(m.block==='review')return review(m);
    if(m.block==='confirm')return <View style={s.card}><Text accessibilityRole="header" style={s.cardTitle}>{payload.title}</Text><Text style={s.text}>{payload.subject||'Подтверждение действия'}</Text><Text style={s.meta}>{payload.dates}{payload.amount!==undefined?' · '+money(payload.amount):''}</Text><Button title={m.done?(m.result||'Действие закрыто'):payload.title} disabled={busy||m.done} onPress={()=>perform(payload.path,payload.body,m.id,payload.after)}/>{!m.done&&<Button title="Отменить" secondary disabled={busy} onPress={()=>finish(m.id,'Отменено')}/>}</View>;
    if(m.block==='help')return <View style={s.suggestions}>{['Хочу снять квартиру','Хочу сдать квартиру','Хочу работать на уборке','Мои брони','Что нового'].map(t=><Button key={t} title={t} secondary disabled={busy} onPress={()=>send(t)}/>)}</View>;
    if(m.block==='properties')return <View>{payload.ids.map((id:string)=>{
      const p=[...data.properties,...data.ownProperties].find((p:Row)=>p.id===id);if(!p)return null;
      return <View style={s.card} key={id}>{!!p.demo_owner&&<Text style={s.badge}>Учебный объект</Text>}<Text style={s.cardTitle}>{p.title}</Text><Text style={s.meta}>{p.city} · {p.district} · {p.rooms} комн. · до {p.capacity} гостей</Text><Text style={s.text}>{p.description}</Text><Text style={s.price}>{money(p.price)} <Text style={s.meta}>/ сутки</Text></Text>
        {payload.mode==='owner'?<><Button title="Тарифы и готовность" secondary disabled={busy} onPress={()=>say('Правила и готовность квартиры.','property-settings',{id})}/><Button title="Заявки гостей" secondary disabled={busy} onPress={()=>send('Заявки гостей')}/><Button title="Уборки по квартирам" secondary disabled={busy} onPress={()=>send('Уборки по квартирам')}/></>:<Button title={payload.mode==='job'?'Выбрать квартиру':'Хочу здесь остановиться'} disabled={busy} onPress={()=>run((payload.mode==='job'?'job:':'book:')+id)}/>}
      </View>;
    })}{!payload.ids.length&&<Button title={payload.mode==='guest'?'Посмотреть учебный пример':'Добавить квартиру'} secondary disabled={busy} onPress={()=>send(payload.mode==='guest'?'Покажи учебный пример':'Хочу сдать квартиру')}/>}</View>;
    if(m.block==='bookings')return <View>{payload.ids.map((id:string)=>{
      const b=data.bookings.find((b:Row)=>b.id===id);if(!b)return null;const owner=b.owner_id===userId&&payload.role==='owner';
      return <View style={s.card} key={id}><Text style={s.badge}>{labels[b.status]||b.status}</Text><Text style={s.cardTitle}>{b.title}</Text><Text style={s.meta}>{date(b.start)} → {date(b.end)}</Text><Text style={s.price}>{money(b.amount)}</Text><Text style={s.meta}>{b.payment_status==='owner_verified'?'Владелец проверил оплату':'Оплата не подтверждена'}{b.address?'\n'+b.address:''}{b.owner_contact?'\nКонтакт: '+b.owner_contact:''}{owner&&b.guest_name?'\nГость: '+b.guest_name+' · '+b.guest_contact:''}</Text>
        <ActivityTimer kind="booking" item={b}/><BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={payload.role} busy={busy} onReview={id=>say('Предложение новых условий.','approval',{id:'change:'+id})} onQuote={body=>request('/api/bookings/'+id+'/change-quote',body)} onPropose={body=>perform('bookings/'+id+'/changes',body,uid())} onDecide={(changeId,action)=>perform('bookings/'+id+'/changes/'+changeId,{action},uid())}/>{owner&&b.status==='requested'&&<Button title="Рассмотреть заявку" disabled={busy} onPress={()=>say('Запрос гостя на согласование.','approval',{id:'booking:'+id})}/>}
        {b.terms&&<Text style={s.meta}>Депозит: {money(b.terms.deposit)} · {b.terms.deposit_status==='owner_verified'?'подтверждён владельцем':b.terms.deposit?'ожидается':'не требуется'}{b.readiness?'\n'+readinessLabels[b.readiness]:''}</Text>}
        {owner&&b.status==='confirmed'&&b.terms?.deposit_status==='pending'&&<Button title="Подтвердить получение депозита" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'deposit_received'},'Подтверждаю фактическое получение депозита; банковская операция не выполняется','owner-bookings')}/>}
        {owner&&b.status==='confirmed'&&b.start<=data.serverTime&&!b.terms?.actual_checkin&&<Button title="Подтвердить заселение" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'checkin'},'Подтверждаю фактическое заселение гостя','owner-bookings')}/>}
        {owner&&b.status==='confirmed'&&b.start<=data.serverTime&&<Button title="Подтвердить освобождение квартиры" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'checkout'},'Подтверждаю, что гость выехал и квартира освобождена','owner-bookings')}/>}
        {!owner&&b.status==='confirmed'&&b.start<=data.serverTime&&!b.terms?.checkout_reported_at&&<Button title="Я выехал" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'report_checkout'},'Сообщить владельцу о выезде; освобождение квартиры потребует проверки')}/>}
        {owner&&b.status==='confirmed'&&b.payment_status!=='owner_verified'&&<Button title="Я проверил поступление оплаты" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'paid',expectedAmount:b.amount},'Отметить оплату после проверки в банке')}/>}
        {['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&<Button title="Отменить бронь" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'cancel'},'Отменить бронирование. Возврат денег согласуется отдельно')}/>}
        {b.status==='confirmed'&&<Button title="Сообщить о проблеме" secondary disabled={busy} onPress={()=>beginFlow('issue',[{key:'issue',text:'Что произошло? Сообщение получит другая сторона бронирования.',label:'Проблема'}],{},'bookings/'+id,'bookings',actor,{action:'issue'})}/>}
      </View>;
    })}</View>;
    if(m.block==='jobs')return <View>{payload.ids.map((id:string)=>{
      const j=data.jobs.find((j:Row)=>j.id===id);if(!j)return null;const owner=j.owner_id===userId&&payload.role==='owner',assigned=j.assigned_to===userId&&!owner;
      const applied=data.applications.some((a:Row)=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
      return <View style={s.card} key={id}><Text style={s.badge}>{labels[j.status]||j.status}</Text><Text style={s.cardTitle}>{j.title}</Text><Text style={s.meta}>{j.city} · {j.district}{'\n'}{date(j.start)} → {date(j.end)}</Text><Text style={s.text}>{j.description}</Text><Text style={s.price}>{money(j.fee)}</Text><ActivityTimer kind="job" item={j}/>{!!j.address&&<Text style={s.meta}>{j.address}{j.owner_contact?'\n'+j.owner_contact:''}</Text>}
        {!owner&&j.status==='open'&&<Button title={applied?'Отклик отправлен':'Откликнуться'} disabled={busy||applied} onPress={()=>perform('jobs/'+id,{action:'apply'},m.id)}/>}
        {owner&&j.status==='open'&&data.applications.filter((a:Row)=>a.job_id===id&&a.status==='pending').map((a:Row)=><View key={a.id} style={s.card}><Text style={s.cardTitle}>{a.name}</Text><Text style={s.meta}>{a.districts}{'\n'}{a.experience}{'\n'}{a.availability}</Text><Button title="Рассмотреть отклик" disabled={busy} onPress={()=>say('Отклик исполнителя.','approval',{id:'application:'+a.id})}/></View>)}
        {assigned&&j.status==='assigned'&&!j.checkout_confirmed&&<Text style={s.meta}>Ожидаем подтверждения выезда гостя.</Text>}{assigned&&j.status==='assigned'&&<Button title="Начать уборку" disabled={busy||!j.checkout_confirmed} onPress={()=>confirm('jobs/'+id,{action:'start'},'Отметить начало работы','my-jobs')}/>}
        {assigned&&j.status==='in_progress'&&<Button title="Подготовить отчёт" disabled={busy} onPress={()=>say('Проверьте каждый пункт. Отчёт уйдёт владельцу после вашего подтверждения.','report',{id})}/>}
        {!!j.report&&<Text style={s.text}>{j.report}</Text>}
        {owner&&j.status==='submitted'&&<Button title="Рассмотреть отчёт" disabled={busy} onPress={()=>say('Отчёт на приёмке.','approval',{id:'report:'+id})}/>}
      </View>;
    })}{payload.role==='owner'&&<Button title="Создать уборку" secondary disabled={busy} onPress={()=>send('Создать уборку')}/>}</View>;
    if(m.block==='report')return <Report busy={busy||!!m.done} onSubmit={(body:Row)=>perform('jobs/'+payload.id,{action:'submit',...body},m.id,'my-jobs')}/>;
    if(m.block==='notifications')return <View>{data.notifications.slice(0,20).map((n:Row)=><View style={s.card} key={n.id}><Text style={s.text}>{n.body}</Text><Text style={s.meta}>{date(n.created_at)}</Text></View>)}</View>;
    return null;
  }
  const pages=selectedRole?rolePages[selectedRole]:[];
  const page=pages.find(p=>p.id===pageId);
  const nextTask=data.assistantBrief?.automatic?data.assistantBrief.prompts[0]:null;
  const ids=pageId==='catalog'?data.properties.map((p:Row)=>p.id):pageId==='properties'?data.ownProperties.map((p:Row)=>p.id):pageId==='bookings'?data.bookings.map((b:Row)=>b.id):(pageId==='assignments'?data.jobs.filter((j:Row)=>j.assigned_to===userId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===userId)):data.jobs).map((j:Row)=>j.id);
  const primary:Message={id:'page-'+pageId,sender:'assistant',text:'',block:pageId==='overview'?'workspace':pageId==='properties'||pageId==='catalog'?'properties':pageId==='bookings'?'bookings':['cleaning','jobs','assignments'].includes(pageId)?'jobs':undefined,payload:{ids,role:selectedRole,mode:selectedRole==='owner'?'owner':'guest'}};
  if(!selectedRole)return <RoleEntry ready={ready} profile={data.profile} user={data.user} busy={busy} auth={<Auth busy={busy} onSubmit={(mode,login,password)=>authenticate(mode,login,password,'entry','workspace')}/>} onChoose={chooseRole} onSave={async(body,role)=>{await request('/api/profile',body);await chooseRole(role);}} onLogout={()=>send('Выйти')}/>;
  return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/><KeyboardAvoidingView style={s.shell} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={s.header}><View style={s.logo}><Text style={s.logoText}>а</Text></View><View style={{flex:1}}><Text style={s.brand}>AI Аренда</Text><Text style={s.subtitle}>{roleNames[selectedRole]}</Text></View><View accessibilityLabel={online?'Есть связь с сервером':'Нет связи с сервером'} style={s.connection}><View style={[s.status,{backgroundColor:online?C.green:'#98672F'}]}/></View><WorkspaceMenuButton open={navigationMenu} busy={busy||!!flow} onPress={()=>setNavigationMenu(v=>!v)}/></View>
    <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={s.transcript} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>{if(messages[messages.length-1]?.sender==='user'||busy)scroll.current?.scrollToEnd({animated:true});}}>
      <Text accessibilityRole="header" style={s.pageTitle}>{page?.title}</Text>
      {pageId==='overview'&&(data.approvals||[]).some((c:Row)=>c.canDecide)&&<Button title={'Согласования · '+data.approvals.filter((c:Row)=>c.canDecide).length} disabled={busy} onPress={()=>{setPageId('assistant');scroll.current?.scrollTo({y:0,animated:false});}}/>}
      {pageId==='overview'&&nextTask&&<Pressable accessibilityRole="button" accessibilityLabel={'Ассистент рекомендует: '+nextTask.title} disabled={busy} onPress={()=>openAssistantTask(nextTask)} style={[s.recommendation,nextTask.priority===3&&s.urgentRecommendation]}><Text style={s.recommendationLabel}>Ассистент рекомендует</Text><Text style={s.eventTitle}>{nextTask.title}</Text></Pressable>}
      {pageId==='properties'&&<Button title="Добавить квартиру" disabled={busy} onPress={()=>run('property')}/>}
      {pageId==='settings'&&data.assistantSettings?<AssistantControl key={selectedRole+':'+data.assistantSettings.version} settings={data.assistantSettings} busy={busy} onSave={body=>perform('assistant-settings',body,'assistant-settings:'+selectedRole+':v'+data.assistantSettings.version)}/>:pageId==='account'?<AccountControl key={selectedRole} onEdit={()=>run('profile')}/>:pageId==='calendar'?<RentalCalendar data={data} role={selectedRole} busy={busy} onOpen={(kind,id)=>say('Текущий статус и доступные действия.',kind==='job'?'jobs':'bookings',{ids:[id],role:selectedRole})}/>:pageId==='assistant'?<><ApprovalInbox cards={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>{renderAssistantBrief()}</>:primary.block&&block(primary)}
      {!messages.length&&<Text style={s.lead}>Ассистент работает с задачами роли «{roleNames[selectedRole]}». Выберите действие или напишите сообщение.</Text>}
      {messages.map((m,index)=><View key={m.id} onLayout={event=>{if(index===messages.length-1&&m.sender==='assistant'&&m.id===scrollMessage.current)scroll.current?.scrollTo({y:Math.max(0,event.nativeEvent.layout.y-12),animated:false});}} style={[s.message,m.sender==='user'?s.user:s.assistant]}>{m.sender==='assistant'&&<Text style={s.sender}>AI АРЕНДА</Text>}<Text selectable style={s.text}>{m.text}</Text>{m.sender==='assistant'&&block(m)}</View>)}
      {busy&&<ActivityIndicator accessibilityLabel="Ожидаем ответ сервера" color={C.green} style={{alignSelf:'flex-start',marginBottom:20}}/>}
      {saveError&&<Text accessibilityRole="alert" style={s.error}>История ещё не сохранена. Проверьте связь; заявки хранятся на сервере.</Text>}
    </ScrollView>
    <View style={s.composerWrap}>{flow?.questions[flow.index].choices&&<View style={s.buttonRow}>{flow.questions[flow.index].choices!.map(choice=><Button key={choice.value} title={choice.label} secondary disabled={busy} onPress={()=>send(choice.label)}/>)}</View>}{!!flow&&<View style={s.flowProgress}><Text style={s.flowLabel}>Вопрос {flow.index+1} из {flow.questions.length}</Text><View style={s.buttonRow}>{flow.index>0&&<Button title="Назад" secondary disabled={busy} onPress={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}/>}<Button title="Стоп" secondary disabled={busy} onPress={()=>send('Стоп')}/></View></View>}<View style={s.composer}><TextInput ref={composer} accessibilityLabel="Сообщение ассистенту" placeholder={flow?'Ваш ответ…':'Напишите, чем помочь…'} placeholderTextColor={C.muted} value={input} onChangeText={setInput} style={s.input} maxLength={2500} multiline submitBehavior="submit" onSubmitEditing={()=>send()} editable={ready&&!busy}/><Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" accessibilityState={{disabled:!ready||busy||!input.trim()}} disabled={!ready||busy||!input.trim()} onPress={()=>send()} style={[s.send,(!input.trim()||busy)&&s.disabled]}><Text style={s.sendText}>{busy?'Ждите':'Отправить'}</Text></Pressable></View><Text style={s.footnote}>AI Аренда · пилотная версия</Text></View>
  <WorkspaceNavigation role={selectedRole} pageId={pageId} busy={busy||!!flow} onSelect={id=>{scrollMessage.current=null;setPageId(id);scroll.current?.scrollTo({y:0,animated:false});}} more={navigationMenu} setMore={setNavigationMenu} onSwitchRole={switchRole}/></KeyboardAvoidingView></SafeAreaView></ActivityClockProvider>;
}
function Report({busy,onSubmit}:{busy:boolean;onSubmit:(body:Row)=>void}){
  const [checks,setChecks]=useState([false,false,false,false]),[report,setReport]=useState('');
  return <View style={s.card}>{['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Квартира проверена перед заездом'].map((label,i)=><Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked:checks[i],disabled:busy}} disabled={busy} onPress={()=>setChecks(prev=>prev.map((v,k)=>k===i?!v:v))} style={s.keyval}><Text style={s.text}>{checks[i]?'☑':'☐'}  {label}</Text></Pressable>)}<TextInput accessibilityLabel="Текст отчёта" style={s.field} placeholder="Что сделано, есть ли замечания?" placeholderTextColor={C.muted} multiline value={report} onChangeText={setReport} maxLength={1500} editable={!busy}/><Button title="Отправить отчёт владельцу" disabled={busy||checks.some(v=>!v)||!report.trim()} onPress={()=>onSubmit({checklist:checks,report})}/></View>;
}
export default function App(){return <SafeAreaProvider><Chat/></SafeAreaProvider>;}
