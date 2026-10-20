import React,{useEffect,useRef,useState} from 'react';
import { ActivityIndicator,AppState,KeyboardAvoidingView,Platform,Pressable,ScrollView,StatusBar,Text,TextInput,View } from 'react-native';
import { SafeAreaProvider,SafeAreaView } from 'react-native-safe-area-context';
import { ApiError,request,restoreSession,saveSession } from './src/api';
import { baseQuestions,cleanerQuestions,date,empty,labels,money,parseDate,propertyQuestions,uid,type Flow,type Message,type Question,type Role,type Row } from './src/model';
import { C,s } from './src/styles';

function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,secondary&&s.secondary,(disabled||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
}
function Auth({onSubmit,busy}:{onSubmit:(mode:string,login:string,password:string)=>Promise<void>;busy:boolean}){
  const [mode,setMode]=useState('register'),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  return <View style={s.card}>
    <Text style={s.cardTitle}>{mode==='register'?'Сохраним ваши заявки':'С возвращением'}</Text>
    <Text style={s.meta}>Один аккаунт для жилья и работы. В пилотной версии — вход по логину и паролю, без проверки телефона.</Text>
    <TextInput accessibilityLabel="Логин" style={s.field} placeholder="Логин латиницей" placeholderTextColor={C.muted} value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={40} editable={!busy}/>
    <TextInput accessibilityLabel="Пароль" style={s.field} placeholder="Пароль, от 10 символов" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode==='register'?'new-password':'current-password'} maxLength={128} editable={!busy}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button title={mode==='register'?'Создать аккаунт':'Войти'} disabled={busy} onPress={()=>{setError('');onSubmit(mode,login,password).then(()=>setPassword('')).catch(e=>setError(e.message));}}/>
    <Button secondary title={mode==='register'?'Уже есть аккаунт':'Создать новый аккаунт'} disabled={busy} onPress={()=>{setError('');setPassword('');setMode(mode==='register'?'login':'register');}}/>
  </View>;
}

function Chat(){
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[flow,setFlow]=useState<Flow|null>(null),[actor,setActor]=useState<Role>('guest');
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[online,setOnline]=useState(false),[historyReady,setHistoryReady]=useState(false),[saveError,setSaveError]=useState(false);
  const scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null),locked=useRef(false),session=useRef(false),pending=useRef(''),seen=useRef(new Set<string>());
  const userId=data.user?.id;
  const say=(text:string,block?:string,payload?:Row)=>setMessages(prev=>[...prev,{id:uid(),sender:'assistant' as const,text,block,payload}].slice(-120));
  const finish=(id:string)=>setMessages(prev=>prev.map(m=>m.id===id?{...m,done:true}:m));
  async function load(){const state=await request('/api/state');setData(state);setOnline(true);return state;}
  async function hydrate(){
    const [state,history]=await Promise.all([request('/api/state'),request('/api/conversation')]);
    setData(state);setMessages(history.messages||[]);setFlow(history.flow||null);setActor(history.actor||'guest');setOnline(true);setHistoryReady(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));return state;
  }
  async function handleError(error:any){
    if(error instanceof ApiError&&error.status===401&&session.current){
      await saveSession(null);session.current=false;setHistoryReady(false);setData(empty);setMessages([]);setFlow(null);say('Сессия закончилась. Войдите снова.','auth',{intent:pending.current||'properties'});
    }else {setOnline(error instanceof ApiError);say(error.message);}
  }
  useEffect(()=>{let active=true;(async()=>{
    try{const token=await restoreSession();if(!active)return;session.current=!!token;if(token)await hydrate();else{await request('/health');if(active)setOnline(true);}}
    catch(e){if(active)await handleError(e);}
    finally{if(active)setReady(true);}
  })();return()=>{active=false;};},[]);
  useEffect(()=>{
    if(!userId||!historyReady)return;
    const timer=setTimeout(()=>{request('/api/conversation',{messages,flow,actor},'PUT').then(()=>setSaveError(false)).catch(()=>setSaveError(true));},500);
    return()=>clearTimeout(timer);
  },[messages,flow,actor,userId,historyReady]);
  useEffect(()=>{
    if(!userId)return;
    async function refresh(){if(AppState.currentState!=='active'||locked.current)return;try{const state=await load();
      const fresh=state.notifications.filter((n:Row)=>!seen.current.has(n.id));state.notifications.forEach((n:Row)=>seen.current.add(n.id));
      if(fresh.length)say('Появились новые события. Напишите «Что нового», чтобы посмотреть.');
    }catch{setOnline(false);}}
    const timer=setInterval(refresh,15000),subscription=AppState.addEventListener('change',status=>{if(status==='active')refresh();});
    return()=>{clearInterval(timer);subscription.remove();};
  },[userId]);
  function beginFlow(kind:string,questions:Question[],answers:Row,endpoint:string,after:string,role:Role,extra:Row={}){
    setActor(role);const next={kind,questions,index:0,answers,endpoint,after,role,extra};
    if(questions.length){setFlow(next);say(questions[0].text);}else say('Проверьте сведения перед сохранением.','review',{flow:next});
  }
  function ensure(role:Role,after:string,state=data,edit=false){
    if(!state.user){pending.current=after;say('Чтобы сохранять заявки и продолжать разговор с другого устройства, войдите или создайте аккаунт.','auth',{intent:after});return false;}
    const p=state.profile||{},roles=p.roles?JSON.parse(p.roles):[];
    if(!edit&&roles.includes(role))return true;
    const answers={...p,roles:[...new Set([...roles,role])]};
    const questions=[...baseQuestions,...(role==='cleaner'?cleanerQuestions:[])].filter(q=>edit||!answers[q.key]);
    say(role==='cleaner'?'Подготовим анкету исполнителя. Назначение на уборку подтверждает заказчик.':'Познакомимся. Я задам несколько коротких вопросов.');
    beginFlow('profile',questions,answers,'profile',after,role);return false;
  }
  function catalog(state:Row,mode='guest',query=''){
    let items=mode==='guest'?state.properties:state.ownProperties;
    const budget=query.match(/до\s*(\d[\d ]*)\s*(тыс)?/i);let max=budget?Number(budget[1].replace(/ /g,''))*(budget[2]?1000:1):0;
    const people=/двоих/.test(query)?2:Number(query.match(/(\d+)\s*(гост|человек)/i)?.[1]||0);
    const city=items.find((p:Row)=>query.toLowerCase().includes(p.city.toLowerCase()))?.city||state.profile?.city;
    if(mode==='guest')items=items.filter((p:Row)=>(!max||p.price<=max)&&(!people||p.capacity>=people)&&(!city||p.city.toLowerCase()===city.toLowerCase()));
    say(items.length?(mode==='job'?'Для какой квартиры нужна уборка?':mode==='owner'?'Ваши квартиры.':'Посмотрим, что вам подойдёт.'):(mode==='guest'?'В этом городе пока нет предложений. Можем посмотреть учебный пример.':'Сначала добавим вашу квартиру.'),'properties',{ids:items.map((p:Row)=>p.id),mode});
  }
  function run(intent:string,state=data){
    if(intent==='properties'){setActor('guest');if(!state.user){ensure('guest',intent,state);return;}catalog(state);return;}
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
      beginFlow('booking',[{key:'start',text:'Когда заедете? Напишите дату и время: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Заезд',date:true},{key:'end',text:'Когда выезжаете? Такой же формат: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Выезд',date:true},{key:'guests',text:'Сколько будет гостей?',label:'Гостей',min:1,max:property.capacity}],{},'bookings','bookings','guest',{propertyId:property.id,requestKey:uid()});return;
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
    if(intent==='demo'){if(!state.user){ensure('guest',intent,state);return;}say('Добавлю две учебные квартиры и уборку. Их увидите только вы. Реальных заездов и выплат по ним нет.','confirm',{path:'demo',body:{},after:'properties',title:'Добавить учебные данные'});return;}
    if(intent==='notifications'){if(!state.user){ensure('guest',intent,state);return;}say(state.notifications.length?'Последние события:':'Пока новых событий нет.','notifications');return;}
  }
  async function perform(path:string,body:Row,id:string,after?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/'+path,body,undefined,id+':'+path+':'+(body.action||'save'));finish(id);say(result.message||'Сохранено.');
      try{const state=await load();if(after)run(after,state);}catch(e){await handleError(e);}
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  async function authenticate(mode:string,login:string,password:string,id:string,intent:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/auth/'+mode,{login,password});await saveSession(result.token);session.current=true;
      const state=await hydrate();say('Вы вошли. Продолжим.');run(intent,state);
    }finally{locked.current=false;setBusy(false);}
  }
  async function send(value=input){
    const text=value.trim();if(!text||locked.current||!ready)return;setInput('');setMessages(prev=>[...prev,{id:uid(),sender:'user' as const,text}].slice(-120));
    if(/^(стоп|отмена|начать сначала)$/i.test(text)){setFlow(null);say('Остановили ввод. Чем помочь дальше?');return;}
    if(flow){
      const q=flow.questions[flow.index];let answer:any=text;
      try{
        if(q.date)answer=parseDate(text);
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
        await saveSession(null);session.current=false;setData(empty);setMessages([]);setFlow(null);setActor('guest');setHistoryReady(false);say(revoked?'Вы вышли из аккаунта.':'Вы вышли на этом устройстве. Для завершения серверной сессии не хватило связи.');return;
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
      if(/что нового|уведомлен|обновить/i.test(text)){run('notifications',state);return;}
      if(/помощь|что.*уме|о сервисе|как.*работ/i.test(text)){say('Помогу снять квартиру, подключить жильё и организовать уборку. Напишите, что нужно сделать. В этой первой версии я веду диалог по сценариям. Свободный ИИ, фото, мессенджеры и автоматические платежи ещё не подключены. Важные действия подтверждаете вы.','help');return;}
      if(/снять|квартир|жиль|аренд/i.test(text)){if(!state.user){run('properties',state);return;}setActor('guest');catalog(state,'guest',text);return;}
      say('Уточните вашу задачу: хотите снять квартиру, сдавать жильё или работать на уборке?','help');
    }catch(e){await handleError(e);}finally{locked.current=false;setBusy(false);composer.current?.focus();}
  }
  function confirm(path:string,body:Row,title:string,after?:string){say('Подтвердите действие: '+title.toLowerCase()+'.','confirm',{path,body,title,after});}
  function review(m:Message){
    const f=m.payload!.flow as Flow;
    const questions=f.kind==='profile'?[...baseQuestions,...cleanerQuestions]:f.kind==='property'?propertyQuestions:f.questions;
    const p=f.extra?.propertyId&&data.properties.find((v:Row)=>v.id===f.extra?.propertyId);
    const amount=f.kind==='booking'&&p?Math.ceil((Date.parse(f.answers.end)-Date.parse(f.answers.start))/86400000)*p.price:null;
    return <View style={s.card}><Text style={s.cardTitle}>{({profile:'Ваш профиль',property:'Ваша квартира',booking:p?.title||'Заявка на проживание',job:'Уборка',report:'Отчёт',confirm:'Подтверждение'} as Row)[f.kind]||'Проверьте сведения'}</Text>
      {questions.filter(q=>f.answers[q.key]!==undefined).map(q=><View key={q.key} style={s.keyval}><Text style={s.key}>{q.label}</Text><Text style={s.value}>{q.date?date(Date.parse(f.answers[q.key])/1000):String(f.answers[q.key])}</Text></View>)}
      {amount!==null&&<><Text style={s.price}>{money(amount)}</Text><Text style={s.meta}>Каждые начатые 24 часа. Отправка заявки не списывает деньги. Владелец должен подтвердить её за 30 минут.</Text></>}
      <Button title={m.done?'Сохранено':f.kind==='booking'?'Отправить заявку':f.kind==='property'?'Опубликовать квартиру':'Подтвердить'} disabled={busy||m.done} onPress={()=>perform(f.endpoint,{...f.answers,...f.extra},m.id,f.after)}/>
      {!m.done&&<Button title="Отменить" secondary disabled={busy} onPress={()=>{finish(m.id);say('Действие отменено. Данные не отправлены.');}}/>}
    </View>;
  }
  function block(m:Message){
    const payload=m.payload||{};
    if(m.block==='auth')return session.current?<Text style={s.meta}>Вход выполнен.</Text>:<Auth key={m.id} busy={busy} onSubmit={(mode,login,password)=>authenticate(mode,login,password,m.id,payload.intent)}/>;
    if(m.block==='review')return review(m);
    if(m.block==='confirm')return <View style={s.card}><Button title={m.done?'Действие закрыто':payload.title} disabled={busy||m.done} onPress={()=>perform(payload.path,payload.body,m.id,payload.after)}/>{!m.done&&<Button title="Отменить" secondary disabled={busy} onPress={()=>finish(m.id)}/>}</View>;
    if(m.block==='help')return <View style={s.suggestions}>{['Хочу снять квартиру','Хочу сдать квартиру','Хочу работать на уборке','Мои брони','Что нового'].map(t=><Button key={t} title={t} secondary disabled={busy} onPress={()=>send(t)}/>)}</View>;
    if(m.block==='properties')return <View>{payload.ids.map((id:string)=>{
      const p=[...data.properties,...data.ownProperties].find((p:Row)=>p.id===id);if(!p)return null;
      return <View style={s.card} key={id}>{!!p.demo_owner&&<Text style={s.badge}>Учебный объект</Text>}<Text style={s.cardTitle}>{p.title}</Text><Text style={s.meta}>{p.city} · {p.district} · {p.rooms} комн. · до {p.capacity} гостей</Text><Text style={s.text}>{p.description}</Text><Text style={s.price}>{money(p.price)} <Text style={s.meta}>/ сутки</Text></Text>
        {payload.mode==='owner'?<><Button title="Заявки гостей" secondary disabled={busy} onPress={()=>send('Заявки гостей')}/><Button title="Уборки по квартирам" secondary disabled={busy} onPress={()=>send('Уборки по квартирам')}/></>:<Button title={payload.mode==='job'?'Выбрать квартиру':'Хочу здесь остановиться'} disabled={busy} onPress={()=>run((payload.mode==='job'?'job:':'book:')+id)}/>}
      </View>;
    })}{!payload.ids.length&&<Button title={payload.mode==='guest'?'Посмотреть учебный пример':'Добавить квартиру'} secondary disabled={busy} onPress={()=>send(payload.mode==='guest'?'Покажи учебный пример':'Хочу сдать квартиру')}/>}</View>;
    if(m.block==='bookings')return <View>{payload.ids.map((id:string)=>{
      const b=data.bookings.find((b:Row)=>b.id===id);if(!b)return null;const owner=b.owner_id===userId&&payload.role==='owner';
      return <View style={s.card} key={id}><Text style={s.badge}>{labels[b.status]||b.status}</Text><Text style={s.cardTitle}>{b.title}</Text><Text style={s.meta}>{date(b.start)} → {date(b.end)}</Text><Text style={s.price}>{money(b.amount)}</Text><Text style={s.meta}>{b.payment_status==='owner_verified'?'Владелец проверил оплату':'Оплата не подтверждена'}{b.address?'\n'+b.address:''}{b.owner_contact?'\nКонтакт: '+b.owner_contact:''}{owner&&b.guest_name?'\nГость: '+b.guest_name+' · '+b.guest_contact:''}</Text>
        {owner&&b.status==='requested'&&<Button title="Подтвердить и запланировать уборку" disabled={busy} onPress={()=>beginFlow('confirm',[{key:'cleaningFee',text:'Сколько заплатим за уборку после выезда, в тенге? «0» — подтвердить без задания на уборку.',label:'Уборка, ₸',min:0,max:1000000}],{},'bookings/'+id,'owner-bookings','owner',{action:'confirm'})}/>}
        {owner&&b.status==='confirmed'&&b.payment_status!=='owner_verified'&&<Button title="Я проверил поступление оплаты" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'paid'},'Отметить оплату после проверки в банке')}/>}
        {['requested','confirmed'].includes(b.status)&&<Button title="Отменить бронь" secondary disabled={busy} onPress={()=>confirm('bookings/'+id,{action:'cancel'},'Отменить бронирование. Возврат денег согласуется отдельно')}/>}
        {b.status==='confirmed'&&<Button title="Сообщить о проблеме" secondary disabled={busy} onPress={()=>beginFlow('issue',[{key:'issue',text:'Что произошло? Сообщение получит другая сторона бронирования.',label:'Проблема'}],{},'bookings/'+id,'bookings',actor,{action:'issue'})}/>}
      </View>;
    })}</View>;
    if(m.block==='jobs')return <View>{payload.ids.map((id:string)=>{
      const j=data.jobs.find((j:Row)=>j.id===id);if(!j)return null;const owner=j.owner_id===userId&&payload.role==='owner',assigned=j.assigned_to===userId&&!owner;
      const applied=data.applications.some((a:Row)=>a.job_id===id&&a.user_id===userId);
      return <View style={s.card} key={id}><Text style={s.badge}>{labels[j.status]||j.status}</Text><Text style={s.cardTitle}>{j.title}</Text><Text style={s.meta}>{j.city} · {j.district}\n{date(j.start)} → {date(j.end)}</Text><Text style={s.text}>{j.description}</Text><Text style={s.price}>{money(j.fee)}</Text>{!!j.address&&<Text style={s.meta}>{j.address}{j.owner_contact?'\n'+j.owner_contact:''}</Text>}
        {!owner&&j.status==='open'&&<Button title={applied?'Отклик отправлен':'Откликнуться'} disabled={busy||applied} onPress={()=>perform('jobs/'+id,{action:'apply'},m.id)}/>}
        {owner&&j.status==='open'&&data.applications.filter((a:Row)=>a.job_id===id&&a.status==='pending').map((a:Row)=><View key={a.id} style={s.card}><Text style={s.cardTitle}>{a.name}</Text><Text style={s.meta}>{a.districts}\n{a.experience}\n{a.availability}</Text><Button title="Назначить исполнителя" disabled={busy} onPress={()=>confirm('jobs/'+id,{action:'assign',applicationId:a.id},'Назначить '+a.name,'owner-jobs')}/></View>)}
        {assigned&&j.status==='assigned'&&<Button title="Начать уборку" disabled={busy} onPress={()=>confirm('jobs/'+id,{action:'start'},'Отметить начало работы','my-jobs')}/>}
        {assigned&&j.status==='in_progress'&&<Button title="Подготовить отчёт" disabled={busy} onPress={()=>say('Проверьте каждый пункт. Отчёт уйдёт владельцу после вашего подтверждения.','report',{id})}/>}
        {!!j.report&&<Text style={s.text}>{j.report}</Text>}
        {owner&&j.status==='submitted'&&<Button title="Принять работу" disabled={busy} onPress={()=>confirm('jobs/'+id,{action:'approve'},'Принять уборку. Выплата согласуется отдельно','owner-jobs')}/>}
      </View>;
    })}{payload.role==='owner'&&<Button title="Создать уборку" secondary disabled={busy} onPress={()=>send('Создать уборку')}/>}</View>;
    if(m.block==='report')return <Report busy={busy||!!m.done} onSubmit={(body:Row)=>perform('jobs/'+payload.id,{action:'submit',...body},m.id,'my-jobs')}/>;
    if(m.block==='notifications')return <View>{data.notifications.slice(0,20).map((n:Row)=><View style={s.card} key={n.id}><Text style={s.text}>{n.body}</Text><Text style={s.meta}>{date(n.created_at)}</Text></View>)}</View>;
    return null;
  }
  return <SafeAreaView style={s.screen} edges={['top','bottom']}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/><KeyboardAvoidingView style={s.shell} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={s.header}><View style={s.logo}><Text style={s.logoText}>а</Text></View><View><Text style={s.brand}>AI Аренда</Text><Text style={s.subtitle}>Жильё и заботы — в одном разговоре</Text></View><View accessibilityLabel={online?'Есть связь с сервером':'Нет связи с сервером'} style={[s.status,{backgroundColor:online?'#85A481':'#B7B7AC'}]}/></View>
    <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={s.transcript} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>{if(messages.length)scroll.current?.scrollToEnd({animated:true});}}>
      {!messages.length&&<View style={s.welcome}><Text style={s.hero}>Здравствуйте.{ '\n' }Чем помочь?</Text><Text style={s.lead}>Помогу с жильём и уборкой.</Text><View style={s.suggestions}>{['Хочу снять квартиру','Хочу сдать квартиру','Хочу работать на уборке'].map(t=><Pressable accessibilityRole="button" disabled={!ready||busy} key={t} style={s.chip} onPress={()=>send(t)}><Text style={s.chipText}>{t}  ↗</Text></Pressable>)}</View></View>}
      {messages.map(m=><View key={m.id} style={[s.message,m.sender==='user'?s.user:s.assistant]}>{m.sender==='assistant'&&<Text style={s.sender}>AI АРЕНДА</Text>}<Text selectable style={s.text}>{m.text}</Text>{m.sender==='assistant'&&block(m)}</View>)}
      {busy&&<ActivityIndicator accessibilityLabel="Ожидаем ответ сервера" color={C.green} style={{alignSelf:'flex-start',marginBottom:20}}/>}
      {saveError&&<Text accessibilityRole="alert" style={s.error}>История ещё не сохранена. Проверьте связь; заявки хранятся на сервере.</Text>}
    </ScrollView>
    <View style={s.composerWrap}>{!!flow&&<Text style={s.saved}>Вопрос {flow.index+1} из {flow.questions.length} · «Стоп» — прервать</Text>}<View style={s.composer}><TextInput ref={composer} accessibilityLabel="Сообщение ассистенту" placeholder={flow?'Ваш ответ…':'Напишите, чем помочь…'} placeholderTextColor="#929C91" value={input} onChangeText={setInput} style={s.input} maxLength={2500} multiline submitBehavior="submit" onSubmitEditing={()=>send()} editable={ready&&!busy}/><Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" disabled={!ready||busy||!input.trim()} onPress={()=>send()} style={[s.send,(!input.trim()||busy)&&s.disabled]}><Text style={s.sendText}>↑</Text></Pressable></View><Text style={s.footnote}>Пилотная версия · важные действия — после подтверждения</Text></View>
  </KeyboardAvoidingView></SafeAreaView>;
}
function Report({busy,onSubmit}:{busy:boolean;onSubmit:(body:Row)=>void}){
  const [checks,setChecks]=useState([false,false,false,false]),[report,setReport]=useState('');
  return <View style={s.card}>{['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Квартира проверена перед заездом'].map((label,i)=><Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked:checks[i],disabled:busy}} disabled={busy} onPress={()=>setChecks(prev=>prev.map((v,k)=>k===i?!v:v))} style={s.keyval}><Text style={s.text}>{checks[i]?'☑':'☐'}  {label}</Text></Pressable>)}<TextInput accessibilityLabel="Текст отчёта" style={s.field} placeholder="Что сделано, есть ли замечания?" placeholderTextColor={C.muted} multiline value={report} onChangeText={setReport} maxLength={1500} editable={!busy}/><Button title="Отправить отчёт владельцу" disabled={busy||checks.some(v=>!v)||!report.trim()} onPress={()=>onSubmit({checklist:checks,report})}/></View>;
}
export default function App(){return <SafeAreaProvider><Chat/></SafeAreaProvider>;}
