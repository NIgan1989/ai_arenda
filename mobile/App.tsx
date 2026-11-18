import React,{Fragment,useEffect,useRef,useState} from 'react';
import {Thinking} from './src/Thinking';
import {cancelVoice} from './src/useVoice';
import {SwipeConfirm} from './src/SwipeConfirm';
import {JobPhotos,JobRating,DamageClaim} from './src/JobPhotos';
import {groupRecords,recordGroupLabels,recordGroup} from '../lib/record-groups';
import {bookingTab,bookingTabs,ownerRequestTab,ownerRequestTabs} from '../lib/booking-filters';
import {pruneHistory,splitAt} from '../lib/conversation-history';
import {OverviewBoard,HistoryFold} from './src/OverviewBoard';
import {ownerJobTab,ownerJobTabs,cleanerJobTab,cleanerJobTabs,tabCounts,firstTab} from '../lib/job-filters';
import {ListTabs} from './src/ListTabs';
import {checkinOpen,checkinOpensLabel} from '../lib/checkin-window';
import {lateOpen,lateNote,lateLabel} from '../lib/late-arrival';
// The stay as «Задерживаюсь на час» reads it (lib/late-arrival.ts).
const lateStay=(b:Record<string,any>)=>({start:b.start,end:b.end,arrival_eta:b.terms?.arrival_eta,late_count:b.terms?.late_count});
import { AppState,BackHandler,KeyboardAvoidingView,Linking,Platform,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import { SafeAreaProvider,SafeAreaView } from 'react-native-safe-area-context';
import {NativeChats,type NativeChatInitial} from './src/NativeChats';
import {StayRequest,CleaningRequest,HomeCleaningOrder} from './src/StayRequest';
import {HOME_TYPE,HOME_DAMAGE_WINDOW,homeCancel,homeCancelLine,homeChecklist,homeOrderOf} from '../lib/home-cleaning';
import {targetPin,type MapTarget} from './src/map-memory';
import {DealCard,RecordFacts} from './src/RecordCard';
import {bookingThread,cleaningThread,jobThread} from '../lib/process-threads';
import {guestLine} from '../lib/guest-line';
import {wordsOf} from '../lib/stay-words';
import {useProcessLinks} from './src/use-process-links';
import {resolveProcessLink} from './src/deep-links';
import { API_URL,ApiError,StaleSessionError,getSessionGeneration,isOffline,onServerReach,request,restoreLastRole,restoreSession,saveLastRole,saveSession,setWorkspaceRole } from './src/api';
import { baseQuestions,cleanerQuestions,date,empty,labels,money,parseDate,propertyQuestions,uid,type Flow,type Message,type Question,type Role,type Row } from './src/model';
import { C,s } from './src/styles';
import {ActivityClockProvider,ActivityTimer} from './src/ActivityTimer';
import {ApprovalCard} from './src/ApprovalCard';
import {PropertyControl,upcomingStays,readinessLabels} from './src/PropertyControl';
import {BookingChanges} from './src/BookingChanges';
import {StayReview} from './src/StayReview';
import {StayHandover,CheckinPhotos,StayEvidence,handoverLine} from './src/StayHandover';
import {handoverState} from '../lib/stay-handover-text';
import {WorkspaceMenuButton,MapChatsButton,SignInButton} from './src/WorkspaceNavigation';
import {sheetName} from '../lib/sheet-title';
import {OwnProperties} from './src/OwnProperties';
import {PropertyListing} from './src/PropertyListing';
// The line above a place opened from the map, in the words of its kind.
const placeSaid=(type?:string)=>type==='banya'?'Баня, выбранная на карте.':type==='sauna'?'Сауна, выбранная на карте.':type==='banquet'?'Зал, выбранный на карте.':type==='cafe'?'Кафе, выбранное на карте.':'Жильё, выбранное на карте.';
import {PropertyEdit} from './src/PropertyEdit';
import {PropertyQuick} from './src/PropertyQuick';
import {CleanerCard} from './src/ProfileEditor';
import {AccountControl} from './src/AccountControl';
import {NoticeToast} from './src/Notices';
import {freshEvents,noticeOpen} from '../lib/notice-feed';
import {RentalCalendar} from './src/RentalCalendar';
import {RoleEntry,roleNames,rolePages,intentRole} from './src/RoleEntry';
import {useFavorites} from './src/Favorites';
import {MapHome,type MapStay} from './src/MapHome';
import {stayISO,occasionTitle} from './src/ai-request';
import {banquetWhen} from '../lib/map-search-request';
import {OfflineNotice} from './src/OfflineNotice';
import {EntrySplash,EntryStatusBar} from './src/EntrySplash';
import {LoadingBar} from './src/LoadingBar';
import {ApplicantPick,CleanerNextBox,WorkerRow,applicantStyles} from './src/ApplicantPick';
import {JobPlace} from './src/JobPlace';
import {OwnerResponses} from './src/OwnerResponses';
import {autopilotPick,ownerResponses} from '../lib/now-card';
import {OverdueHelp} from './src/OverdueHelp';
import {isUnclaimed} from '../lib/overdue-text';
import {CheckinGuide} from './src/CheckinGuide';
import {PageTransition} from './src/PageTransition';
import {background,entryReady,markGesture} from './src/loading';
import {getHere,startHere} from './src/here';
import {nearestCity} from './src/here-rules';
import {refundLeft} from '../lib/cancellation';

// What cancelling costs, in the words of the confirmation: the server counts it by the guest offer (lib/cancellation.ts).
function cancelLine(c:Row|null|undefined,owner:boolean,paid:number){
 if(!c||(!paid&&!c.deposit))return 'Оплаты не было, возвращать нечего';
 const deposit=c.deposit?'. Депозит '+money(c.deposit)+' возвращается полностью':'';
 if(c.withheld)return owner?'У вас остаётся '+money(c.withheld)+(c.refund?', гостю нужно вернуть '+money(c.refund):'')+deposit:'Бесплатная отмена уже закончилась: владельцу остаётся '+money(c.withheld)+', вам вернут '+money(c.refund)+deposit;
 return (owner?'Гостю нужно вернуть всю оплату: ':'Вам вернут всю оплату: ')+money(c.refund)+deposit;
}

function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  const [focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={(e:any)=>{if(Platform.OS!=='web'||e?.target?.matches?.(':focus-visible'))setFocused(true);}} onBlur={()=>setFocused(false)} style={({pressed})=>[s.button,secondary&&s.secondary,focused&&s.focusRing,(disabled||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
}
function BookingReview({flow,busy,done,result,onConfirm,onEdit}:{flow:Flow;busy:boolean;done?:boolean;result?:string;onConfirm:(quote:Row)=>void;onEdit:()=>void}){
  const [quote,setQuote]=useState<Row|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[attempt,setAttempt]=useState(0);
  const [more,setMore]=useState(false);
  useEffect(()=>{let active=true;if(done)return;setChecking(true);setError('');request('/api/quote',{...flow.answers,...flow.extra}).then(value=>{if(active)setQuote(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[flow,attempt,done]);
  if(done)return <View style={s.card}><Text style={s.badge}>{result||'Сохранено'}</Text><Text style={s.meta}>{result==='Изменено'?'Этот расчёт закрыт. Продолжите ввод в разговоре.':'Заявка и её статус доступны в «Мои брони».'}</Text></View>;
  // A tap and a swipe to a booking: «Забронировать» on the map, then this one swipe. The sum, the dates and what happens next are
  // on the card; the calculation and the rules of the home open by «Правила и расчёт». The swipe itself is the consent.
  // A home that confirms by itself still leaves a risky request to its owner (lib/service.ts risk.held), so «сразу» is not promised.
  const guests=Number(quote?.guests)||1,tens=guests%100,units=guests%10,auto=!!quote?.policy?.auto_confirm,deposit=Number(quote?.policy?.deposit)||0;
  const hall=['banquet','cafe'].includes(quote?.kind),bath=hall||['banya','sauna'].includes(quote?.kind),extra=Number(quote?.extraGuests)||0;
  // A banquet hall: the slot of the day, what it is for, the price per guest and the least order.
  const perGuest=Number(quote?.policy?.extra_guest_price)||0,least=Number(quote?.policy?.included_guests)||0,occasion=hall?occasionTitle(String(flow.answers.occasion||'')):'';
  const guestWord=tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей';
  return <View style={s.card}><Text accessibilityRole="header" style={s.cardTitle}>{quote?.title||'Проживание'}</Text>
    {checking&&<View style={s.progressRow}><Thinking size="sm"/><Text style={s.meta}>Проверяю стоимость и свободный интервал…</Text></View>}
    {!!error&&<><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Проверить ещё раз" secondary disabled={busy||checking} onPress={()=>setAttempt(v=>v+1)}/></>}
    {quote&&!error&&!checking&&<>
      <Text style={s.text}>{hall?[occasion&&occasion!=='Другое'?occasion:'',banquetWhen(new Date((Number(quote.start)+18000)*1000).toISOString().slice(0,16)),guests+' '+guestWord].filter(Boolean).join(' · '):date(quote.start)+' → '+date(quote.end)+' · '+guests+' '+guestWord}</Text>
      <View style={s.quoteTotal}><Text style={s.key}>{bath?'Стоимость':'Стоимость проживания'}</Text><Text style={s.price}>{money(quote.amount)}</Text></View>
      <Text style={s.meta}>{deposit?'Депозит '+money(deposit)+(hall?' вернётся после мероприятия. ':bath?' вернётся после ухода. ':' вернётся после выезда. '):''}{auto?'Обычно бронь подтверждается сразу, иначе владелец ответит за 15 минут.':'Владелец ответит за 15 минут.'} Сейчас деньги не списываются.</Text>
      {hall&&perGuest>0&&<Text style={s.meta}>{money(perGuest)} за гостя × {Math.max(guests,least)}.{guests<least?' Наименьший заказ зала: '+least+' гостей.':''} При отмене вся оплата возвращается: заведение может заявить только расходы на ваш заказ, подтверждённые документами.</Text>}
      {bath&&!hall&&extra>0&&<Text style={s.meta}>В цене гостей: {guests-extra}. Доплата за ещё {extra}: {money(Number(quote.guestSurcharge)*Number(quote.periods))}.</Text>}
      {more&&<>{!hall&&<Text style={s.meta}>{quote.periods} × {money(quote.price)} · {quote.unitLabel}. {bath?'После вас':'После выезда'} {quote.cleaningMinutes} мин. на {bath?'уборку':'подготовку жилья'}.</Text>}{!!quote.policy.house_rules&&<Text style={s.meta}>{quote.policy.house_rules}</Text>}</>}
      <SwipeConfirm label={auto?'Проведите: забронировать за '+money(quote.amount):'Проведите: отправить заявку владельцу'} disabled={busy} onConfirm={()=>onConfirm(quote)}/>
      <Text style={s.meta}>Проводя, вы соглашаетесь с {hall?'датой, ценой на гостя':'датами, тарифом'}, депозитом и правилами {hall?'зала':bath?'объекта':'жилья'}.</Text>
    </>}
    <View style={s.buttonRow}>{quote&&!error&&!checking&&<Button title={more?'Свернуть':'Правила и расчёт'} secondary disabled={busy} onPress={()=>setMore(v=>!v)}/>}<Button title={hall?'Изменить':'Изменить даты'} secondary disabled={busy||checking} onPress={onEdit}/></View>
  </View>;
}
function Auth({onSubmit,busy,titled=true}:{titled?:boolean;onSubmit:(mode:string,phone:string,password:string,name?:string,city?:string,recovery?:string)=>Promise<void>;busy:boolean}){
  const [mode,setMode]=useState('login'),[phone,setPhone]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[city,setCity]=useState(''),[recovery,setRecovery]=useState(''),[error,setError]=useState('');
  // «Забыли пароль?»: first the number, then the code that came in Telegram or that the administrator dictated, and a new password.
  const [codeSent,setCodeSent]=useState(''),[sending,setSending]=useState(false);
  const [accepted,setAccepted]=useState(false);const legal=(path:string)=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>setError('Не удалось открыть документ.'));
  const go=(next:string)=>{setError('');setPassword('');setRecovery('');setCodeSent('');setMode(next);};
  const askCode=async()=>{if(sending)return;setError('');setSending(true);try{const r=await request('/auth/reset-request',{phone});setRecovery('');setCodeSent(String(r.message||'Код отправлен.'));}catch(e){setError(isOffline(e)?'Нет связи. Проверьте интернет и повторите.':(e as Error).message);}finally{setSending(false);}};
  const forgot=mode==='forgot',waiting=forgot&&!codeSent,locked=busy||sending;
  const title=mode==='register'?'Один аккаунт для всех устройств':forgot?'Новый пароль':mode==='recover'?'Вход по резервному коду':'С возвращением';
  return <View style={s.card}>
    {(titled||mode!=='login')&&<Text style={s.cardTitle}>{title}</Text>}
    <Text style={s.meta}>{forgot?(codeSent||'Укажите номер, на который зарегистрирован аккаунт. Мы пришлём код для смены пароля.'):'Номер телефона и пароль те же, что на сайте. Брони и чаты общие.'}</Text>
    {mode==='register'&&<><Text style={s.fieldLabel}>Имя</Text><TextInput accessibilityLabel="Имя" style={s.field} value={name} onChangeText={setName} maxLength={100} editable={!locked}/><Text style={s.fieldLabel}>Город</Text><TextInput accessibilityLabel="Город" style={s.field} value={city} onChangeText={setCity} maxLength={80} editable={!locked} placeholder="Например, Алматы" placeholderTextColor={C.muted}/></>}
    <Text style={s.fieldLabel}>Номер телефона</Text><TextInput accessibilityLabel="Номер телефона" style={s.field} placeholder="+7 777 123 45 67" placeholderTextColor={C.muted} value={phone} onChangeText={v=>{setPhone(v);if(codeSent)setCodeSent('');}} keyboardType="phone-pad" autoComplete="tel" maxLength={30} editable={!locked}/>
    {forgot&&!!codeSent&&<><Text style={s.fieldLabel}>Код из сообщения</Text><TextInput accessibilityLabel="Код из сообщения" style={s.field} placeholder="6 цифр" placeholderTextColor={C.muted} value={recovery} onChangeText={v=>setRecovery(v.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!locked}/></>}
    {mode==='recover'&&<><Text style={s.fieldLabel}>Резервный код</Text><TextInput accessibilityLabel="Резервный код" style={s.field} value={recovery} onChangeText={setRecovery} maxLength={80} autoCapitalize="none" autoCorrect={false} editable={!locked}/><Text style={s.meta}>Код выдавали при регистрации. Смена пароля завершит прежние сеансы на всех устройствах.</Text></>}
    {!waiting&&<><Text style={s.fieldLabel}>{forgot||mode==='recover'?'Новый пароль':'Пароль'}</Text><TextInput accessibilityLabel="Пароль" style={s.field} placeholder="От 10 символов" placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode==='login'?'current-password':'new-password'} maxLength={128} editable={!locked}/></>}
    {mode==='register'&&<><Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} disabled={locked} onPress={()=>setAccepted(v=>!v)} style={s.keyval}><Text style={[s.text,{flex:1}]}>{accepted?'☑':'☐'} Принимаю Пользовательское соглашение и даю согласие на обработку персональных данных</Text></Pressable><View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}><Text accessibilityRole="link" style={[s.meta,{textDecorationLine:'underline',minHeight:44,paddingVertical:12}]} onPress={()=>legal('/terms')}>Соглашение</Text><Text accessibilityRole="link" style={[s.meta,{textDecorationLine:'underline',minHeight:44,paddingVertical:12}]} onPress={()=>legal('/privacy/consent')}>Согласие на обработку</Text></View></>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {waiting?<Button title={sending?'Отправляю…':'Получить код'} disabled={locked||!phone.trim()} onPress={askCode}/>
    :<Button title={mode==='register'?'Создать аккаунт':forgot?'Сменить пароль и войти':mode==='recover'?'Обновить пароль':'Войти'} disabled={locked||mode==='register'&&!accepted||forgot&&recovery.length!==6} onPress={()=>{setError('');onSubmit(forgot?'reset':mode,phone,password,name,city,recovery).then(()=>setPassword('')).catch(e=>setError(isOffline(e)?'Нет связи. Проверьте интернет и повторите.':e.message));}}/>}
    {forgot&&!!codeSent&&<Button secondary title={sending?'Отправляю…':'Прислать код ещё раз'} disabled={locked} onPress={askCode}/>}
    {mode==='login'&&<Button secondary title="Забыли пароль?" disabled={locked} onPress={()=>go('forgot')}/>}
    {forgot&&<Button secondary title="У меня есть резервный код" disabled={locked} onPress={()=>go('recover')}/>}
    {mode==='login'||mode==='register'?<Button secondary title={mode==='register'?'Уже есть аккаунт':'Создать новый аккаунт'} disabled={locked} onPress={()=>go(mode==='register'?'login':'register')}/>
    :<Button secondary title="Назад ко входу" disabled={locked} onPress={()=>go('login')}/>}
  </View>;
}

function Chat(){
  // Where the person is starts being known at launch, before sign-in, if they allowed it before (no prompt here).
  useEffect(()=>{startHere();},[]);
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[flow,setFlow]=useState<Flow|null>(null),[actor,setActor]=useState<Role>('guest');
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[online,setOnline]=useState(false),[historyReady,setHistoryReady]=useState(false),[saveError,setSaveError]=useState(false);
  const scrollY=useRef(0),scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null),locked=useRef(false),session=useRef(false),pending=useRef(''),seen=useRef(new Set<string>());
  const [recoveryCode,setRecoveryCode]=useState(''),[linkError,setLinkError]=useState('');
  // «Сдавать жильё» / «Работать на уборках» in the menu: the role entry opens straight on that role's short form.
  const [joinRole,setJoinRole]=useState<Role|null>(null);
  const [retrying,setRetrying]=useState(false),[opening,setOpening]=useState(false);
  // Without an account the map, the search and the cards are open (the visitor map below). signIn: the sign-in screen is
  // shown, with why it was asked for; afterSignIn: what the person was doing, done for them once they are in.
  const [signIn,setSignIn]=useState<string|null>(null);
  const afterSignIn=useRef<{kind:'book';property:Row;stay:MapStay}|{kind:'open';intent:string;stay?:MapStay}|{kind:'ask';text:string}|null>(null);
  const [selectedRole,setSelectedRole]=useState<Role|null>(null),[pageId,setPageId]=useState('map'),[chatsActive,setChatsActive]=useState(false),[chatInitial,setChatInitial]=useState<NativeChatInitial|null>(null),[mapTarget,setMapTarget]=useState<MapTarget|null>(null),[mapSeq,setMapSeq]=useState(0),[erasureResult,setErasureResult]=useState<Row|null>(null);
  // A long page is shown a dozen records at a time (the catalogue holds hundreds of flats); the catalogue starts with the person's own city.
  const [listed,setListed]=useState({page:'',count:12}),[allCities,setAllCities]=useState(false);
  // The tab a list page is on, by page («Мои брони», «Уборки», «Мои задания»); until chosen, the first that is not empty.
  const [tabPick,setTabPick]=useState<Record<string,string>>({});
  const activeRoleRef=useRef<Role|null>(null),scrollMessage=useRef<string|null>(null);
  // The last message said before «Моё жильё» opened (see ownPage below).
  const beforeOwn=useRef('');
  // What was said before a page opened is not that page's (since 2026-11-18): the last message before it opened, and the last one
  // of the conversation as it came from the server (a role switch or a link replaces the messages, so the first may be gone).
  const pageMark=useRef({page:'map',start:'',last:''}),historyEnd=useRef('');
  useEffect(()=>{if(pageId!=='properties')beforeOwn.current=messages[messages.length-1]?.id||'';},[pageId,messages]);
  const userId=data.user?.id;
  const messageY=useRef<Record<string,number>>({});
  // «Есть проблема» pressed again: the open question is shown again instead of a second one; an issue already sent
  // for this booking or cleaning gets an addition, not a twin.
  function raiseIssue(kind:'job'|'booking',entityId:string,role:Role){
    const endpoint=(kind==='job'?'jobs/':'bookings/')+entityId;
    if(flow?.kind==='issue'&&flow.endpoint===endpoint){const q=[...messages].reverse().find(m=>m.sender==='assistant'&&m.text===flow.questions[0]?.text);if(q&&messageY.current[q.id]!==undefined)scroll.current?.scrollTo({y:Math.max(0,messageY.current[q.id]-12),animated:true});return;}
    const open=(data.administrator?.issues||[]).find((i:Row)=>i.status==='open'&&i.entity_kind===kind&&i.entity_id===entityId&&i.opened_by===userId);
    const text=open?'Обращение уже открыто: «'+String(open.description).slice(0,200)+'». ИИ-администратор следит за ответом. Что добавить?':kind==='job'?'Что произошло? Сообщение получит другой участник задания.':'Что произошло? Сообщение получит другая сторона бронирования.';
    beginFlow('issue',[{key:'issue',text,label:open?'Дополнение':'Проблема'}],{},endpoint,kind==='job'?(role==='owner'?'owner-jobs':'my-jobs'):'bookings',role,{action:'issue'});
  }
  // A booking, a cleaning or a task opened from the map, the calendar or a link: the sheet shows that one card and what
  // was done from it, not the whole overview. `after` is the last message before it was opened.
  const [deal,setDeal]=useState<{kind:'booking'|'job'|'review';id:string;after:string}|null>(null),dealRef=useRef('');
  // How tall the open card of a deal is: the map puts the pin of that deal above it (MapHome cover). Opening a deal
  // forgets the height of the sheet that was open before, so the map waits for this card to be measured.
  const [dealCover,setDealCover]=useState(0);
  // A new event of this role, said over the map until it is read or eight seconds pass; `more` came with it. What the
  // AI did alone is not said: it is in the journal. menuStart: the menu opens on its notices when the event has no card.
  const [toast,setToast]=useState<{notice:Row;more:number}|null>(null),[menuStart,setMenuStart]=useState<'notices'|undefined>();
  useEffect(()=>{if(pageId!=='account')setMenuStart(undefined);},[pageId]);
  useEffect(()=>{setToast(null);setTabPick({});},[userId,selectedRole]);
  useEffect(()=>{if(pageId!=='overview')setDeal(null);},[pageId]);
  useEffect(()=>{dealRef.current=deal&&pageId==='overview'?deal.kind:'';},[deal,pageId]);
  const say=(text:string,block?:string,payload?:Row)=>{const id=uid();scrollMessage.current=id;setMessages(prev=>[...prev,{id,sender:'assistant' as const,text,block,payload}].slice(-120));};
  const processLinks=useProcessLinks({apiUrl:API_URL,ready,accountId:userId||null,blocked:busy||!!flow||!!recoveryCode||chatsActive,onError:message=>setLinkError(message),onOpen:async(link,guard)=>{
    if(locked.current||!session.current||!guard.isCurrent())return;
    setLinkError('');locked.current=true;setBusy(true);
    try{
      const [state,history]=await Promise.all([request('/api/state',undefined,undefined,undefined,link.role),request('/api/conversation',undefined,undefined,undefined,link.role)]);
      if(!session.current||!guard.isCurrent())return;
      const view=resolveProcessLink(link,state,guard.accountId);
      setWorkspaceRole(link.role);activeRoleRef.current=link.role;setData(state);historyEnd.current=pruneHistory(history.messages||[]).at(-1)?.id||'';setMessages(pruneHistory(history.messages||[]));setFlow(history.flow||null);setActor(link.role);setSelectedRole(link.role);setPageId(history.flow?'overview':view.section);setHistoryReady(true);setOnline(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));
      if(history.flow)setLinkError('В этой роли сохранён незавершённый ввод. Завершите или отмените его, затем откройте ссылку повторно.');else if(view.block)say('Открыто по ссылке.',view.block,view.payload);
    }finally{locked.current=false;setBusy(false);}
  }});
  const finish=(id:string,result='Сохранено')=>setMessages(prev=>prev.map(m=>m.id===id?{...m,done:true,result}:m));
  async function signedOut(result?:Row){
    try{await saveSession(null);await saveLastRole(null,null);}finally{session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setData(empty);setMessages([]);setFlow(null);setInput('');setChatInitial(null);setChatsActive(false);setRecoveryCode('');if(result?.receipt)setErasureResult(result);}
  }
  // «Избранное» on a home's card; the map's panel keeps its own copy, both follow the state.
  const favorites=useFavorites(data,()=>load());
  async function load(){
    const active=activeRoleRef.current,generation=getSessionGeneration();
    try{const state=await request(active?'/api/state':'/api/access');if(activeRoleRef.current!==active||generation!==getSessionGeneration())return;setData(active?state:{...empty,...state});setOnline(true);return state;}
    catch(error){if(error instanceof StaleSessionError||generation!==getSessionGeneration()||activeRoleRef.current!==active)return;if(active&&error instanceof ApiError&&error.status===403){setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);const access=await request('/api/access');if(generation===getSessionGeneration()&&activeRoleRef.current===null)setData({...empty,...access});}throw error;}
  }
  async function hydrate(role:Role){
    const generation=getSessionGeneration();setHistoryReady(false);setWorkspaceRole(role);activeRoleRef.current=role;
    const [state,history]=await Promise.all([request('/api/state',undefined,undefined,undefined,role),request('/api/conversation',undefined,undefined,undefined,role)]);
    if(generation!==getSessionGeneration()||activeRoleRef.current!==role)throw new StaleSessionError();
    setData(state);historyEnd.current=pruneHistory(history.messages||[]).at(-1)?.id||'';setMessages(pruneHistory(history.messages||[]));setFlow(history.flow||null);setActor(role);setSelectedRole(role);setPageId(history.flow?'overview':'map');if(history.draftInvalid)setLinkError('Сохранённый ввод не удалось открыть. Начните форму заново; заявки сохранены на сервере.');setSaveError(false);setOnline(true);(state.notifications||[]).forEach((n:Row)=>seen.current.add(n.id));setHistoryReady(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));void saveLastRole(state.user?.id||null,role);return state;
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
  // An account is in: the sign-in screen is not needed any more; what the visitor was doing goes on as the guest.
  useEffect(()=>{if(data.user)setSignIn(null);},[!!data.user]);
  useEffect(()=>{
    const next=afterSignIn.current;if(!next||selectedRole!=='guest'||!historyReady)return;afterSignIn.current=null;
    if(next.kind==='book')bookFromMap(next.property,next.stay);
    else if(next.kind==='open')openMapIntent(next.intent,next.stay);
    else{setChatInitial({administrator:true,text:next.text,key:uid(),fromMap:true});setPageId('chats');}
  },[selectedRole,historyReady]);
  const askSignIn=(reason:string,then:typeof afterSignIn.current)=>{afterSignIn.current=then;setSignIn(reason);};
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
    async function refresh(){if(AppState.currentState!=='active'||locked.current)return;try{const state=await background(load);if(!state)return;
      const fresh=freshEvents(state.notifications as Row[],seen.current,selectedRole!);state.notifications.forEach((n:Row)=>seen.current.add(n.id));
      if(fresh.length)setToast({notice:fresh[0],more:fresh.length-1});
    }catch(error){if(error instanceof ApiError&&error.status===401)await handleError(error);else setOnline(false);}}
    const timer=setInterval(refresh,15000),subscription=AppState.addEventListener('change',status=>{if(status==='active')refresh();});
    return()=>{clearInterval(timer);subscription.remove();};
  },[userId,selectedRole]);
  // Unread messages on the chats button of the map, as on the site. Asked for while the map is in front; opening the chats reads them.
  const [unread,setUnread]=useState(0);
  useEffect(()=>{
    if(!userId||!selectedRole){setUnread(0);return;}
    if(pageId==='chats'){setUnread(0);return;}
    let live=true;
    const ask=async()=>{if(AppState.currentState!=='active')return;try{const inbox=await background(()=>request('/api/operations/discussion/inbox',undefined,undefined,undefined,selectedRole));if(live)setUnread(Number(inbox?.unread)||0);}catch{/* The button stays without a counter. */}};
    void ask();const timer=setInterval(ask,20000);
    return()=>{live=false;clearInterval(timer);};
  },[userId,selectedRole,pageId]);
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
    say(items.length?(mode==='job'?'Для какого жилья нужна уборка?':mode==='owner'?'Ваши объекты.':'Посмотрим, что вам подойдёт.'):(mode==='guest'?'В этом городе пока нет предложений. Можем посмотреть учебный пример.':'Сначала добавим ваше жильё.'),'properties',{ids:items.map((p:Row)=>p.id),mode});
  }
  // The four answers a booking needs. The map's results already carry all of them; the chat asks for them one by one.
  const bookingQuestions=(property:Row):Question[]=>[{key:'billingMode',text:'Какой тариф выбираете? По ночам заезд и выезд строго в часы, указанные владельцем.',label:'Тариф',choices:[{label:'Сутки',value:'daily'},...(property.policy?.hourly_price?[{label:'Почасово',value:'hourly'}]:[]),...(property.policy?.nightly_price?[{label:'По ночам',value:'nightly'}]:[])]},{key:'start',text:'Когда заедете? Напишите дату и время: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Заезд',date:true},{key:'end',text:'Когда выезжаете? Такой же формат: ДД.ММ.ГГГГ ЧЧ:ММ.',label:'Выезд',date:true},{key:'guests',text:'Сколько будет гостей?',label:'Гостей',min:1,max:property.capacity}];
  function run(intent:string,state=data){
    const required=intentRole(intent);if(required&&required!==selectedRole){say('Эта задача относится к другой роли. Нажмите «Сменить роль».');return;}
    if(intent==='properties'){setActor('guest');catalog(state);return;}
    if(intent==='workspace'){if(!state.user){ensure(actor,intent,state);return;}say('Ближайшие события и задачи по вашим данным.','workspace',{role:actor});return;}
    if(intent==='property'){
      if(!ensure('owner',intent,state))return;
      say('Расскажите об объекте одним сообщением, остальное заполню сам.','property-quick',{});return;
    }
    if(intent==='own-properties'){if(ensure('owner',intent,state)){setActor('owner');catalog(state,'owner');}return;}
    if(intent==='cleaner-profile'){if(ensure('cleaner','jobs',state)){setActor('cleaner');say('Анкета уже сохранена. Посмотрим доступные уборки.');run('jobs',state);}return;}
    if(intent==='profile'){ensure(actor,'profile-done',state,true);return;}
    if(intent==='profile-done'){say('Профиль сохранён. Чем займёмся дальше?');return;}
    if(intent==='jobs'||intent==='my-jobs'||intent==='owner-jobs'){
      const role=intent==='owner-jobs'?'owner':'cleaner';if(!ensure(role,intent,state))return;setActor(role);
      // A list that has its own page opens that page instead of repeating the same cards under the current one.
      const listPage=rolePages[role].find(p=>p.intent===intent);if(listPage&&selectedRole===role){setPageId(listPage.id);return;}
      const items=state.jobs.filter((j:Row)=>role==='owner'?j.owner_id===state.user.id:intent==='my-jobs'?j.assigned_to===state.user.id||state.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===state.user.id):j.status==='open'&&j.end>Date.now()/1000&&(!state.profile?.city||j.city.toLowerCase()===state.profile.city.toLowerCase()));
      say(items.length?(intent==='jobs'?'Вот доступные уборки. Адрес появится после назначения.':'Вот ваши задания и их текущий статус.'):'Сейчас заданий по этому запросу нет.','jobs',{ids:items.map((j:Row)=>j.id),role});return;
    }
    // Уборка на дом: её заказывает гость или владелец, роль владельца подключается самим заказом.
    if(intent==='home-cleaning'||intent.startsWith('home-cleaning:')){
      if(!state.user){pending.current=intent;say('Чтобы заказать уборку, войдите или создайте аккаунт.','auth',{intent});return;}
      if(selectedRole==='cleaner'){say('Уборку на дом заказывают в роли гостя или владельца. Нажмите «Сменить роль».');return;}
      say('Закажем уборку вашего дома.','home-order',{propertyId:intent.slice(14)||undefined,requestKey:uid()});return;
    }
    if(intent==='job'){
      if(!ensure('owner',intent,state))return;setActor('owner');catalog(state,'job');return;
    }
    if(intent.startsWith('book:')){
      if(!ensure('guest',intent,state))return;const property=state.properties.find((p:Row)=>p.id===intent.slice(5));
      if(!property){say('Жильё больше недоступно. Обновите предложения.');return;}
      say('Выберите время проживания в «'+property.title+'».','stay-form',{propertyId:property.id,requestKey:uid()});return;
    }
    if(intent.startsWith('job:')){
      if(!ensure('owner',intent,state))return;const id=intent.slice(4);if(!state.ownProperties.some((p:Row)=>p.id===id)){say('Жильё недоступно.');return;}
      if(state.ownProperties.find((p:Row)=>p.id===id)?.details?.type===HOME_TYPE){say('Закажем уборку вашего дома.','home-order',{propertyId:id,requestKey:uid()});return;}
      say('Когда и что нужно убрать?','job-form',{propertyId:id});return;
    }
    if(intent==='bookings'||intent==='owner-bookings'){
      const role=intent==='owner-bookings'?'owner':'guest';if(!ensure(role,intent,state))return;setActor(role);
      const items=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===state.user.id:b.guest_id===state.user.id);
      say(items.length?'Ваши бронирования. Время Казахстана.':'У вас пока нет бронирований.','bookings',{ids:items.map((b:Row)=>b.id),role});return;
    }
    if(intent==='demo'){if(!state.user){ensure('guest',intent,state);return;}say('Добавлю две учебных объекта и уборку. Их увидите только вы. Реальных заездов и выплат по ним нет.','confirm',{path:'demo',body:{},after:selectedRole==='owner'?'own-properties':selectedRole==='cleaner'?'jobs':'properties',title:'Добавить учебные данные'});return;}
    if(intent==='notifications'){if(!state.user){ensure('guest',intent,state);return;}say(state.notifications.length?'Последние события:':'Пока новых событий нет.','notifications');return;}
  }
  // Заказ уборки на дом. Ведётся он в кабинете владельца («Мой дом»): гостя переводим туда и открываем заказ.
  async function orderHome(body:Row,id:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/home-cleaning',body,undefined,id+':home-cleaning');finish(id,result.message||'Заказ принят');
      if(activeRoleRef.current!=='owner')await hydrate('owner');else await load();
      say(result.message||'Заказ принят. Ищем исполнителя.');
      if(result?.id)openDeal('job',result.id);
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  async function perform(path:string,body:Row,id:string,after?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/'+path,body,undefined,id+':'+path+':'+(body.action||'save')+(body.expectedVersion!==undefined?':v'+body.expectedVersion:''));finish(id);
      // A tip that is done in the listing editor opens it on the right step.
      if(result?.edit?.propertyId){await load();setPageId('overview');say('','property-editor',{id:result.edit.propertyId,step:result.edit.step});return;}
      say(result.message||'Сохранено.');
      try{const state=await load();
        // The booking just sent from its check opens as its card: the state, what happens next and the payment when it is due.
        if(dealRef.current==='review'&&path==='bookings'&&result?.id&&state){setDeal(d=>d&&d.kind==='review'?{kind:'booking',id:result.id,after:id}:d);scroll.current?.scrollTo({y:0,animated:false});}
        else if(after&&state&&!dealRef.current)run(after,state);
        // The cleaning is paid: the last thing left to the customer is the rating, so it is asked right away.
        const paid=body.action==='record_job_payment'&&state?(state.jobs||[]).find((j:Row)=>j.id===path.split('/')[1]):null;
        if(paid&&paid.status==='completed'&&paid.assigned_to&&paid.assigned_to!==paid.owner_id&&!paid.rating)say('Оцените работу исполнителя.','rate',{id:paid.id});
        // A good rating of a home cleaning: the customer may keep this performer, so the next orders go to them first.
        const rated=body.action==='rate'&&Number(body.rating)>=4&&state?(state.jobs||[]).find((j:Row)=>j.id===path.split('/')[1]):null,ratedHome=rated?(state!.ownProperties||[]).find((p:Row)=>p.id===rated.property_id):null;
        if(rated&&ratedHome&&ratedHome.details?.type===HOME_TYPE&&!ratedHome.regular_cleaner_name&&rated.assigned_to)say('Понравилась работа? Закрепите исполнителя за домом: следующие заказы сначала придут к нему.','confirm',{path:'operations/regular/pin',body:{propertyId:rated.property_id,cleanerId:rated.assigned_to},title:'Закрепить исполнителя',subject:rated.worker?.name||ratedHome.title,note:'Его «да» сразу назначает его на уборку. Открепить можно в карточке дома.',dates:''});
      }catch(e){await handleError(e);}
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  // A city left empty at sign-up is the one the phone sees the person in; the server takes its own default otherwise.
  const cityHere=()=>{const fix=getHere().fix;return fix?nearestCity(fix.point)||'':'';};
  async function authenticate(mode:string,phone:string,password:string,id:string,intent:string,name?:string,city?:string,recovery?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/auth/'+mode,{phone,password,...(mode==='register'?{name,city:city?.trim()||cityHere()}:mode==='recover'?{recoveryCode:recovery}:mode==='reset'?{code:recovery}:{})});if(result.recoveryCode)setRecoveryCode(result.recoveryCode);if(mode==='recover'){await saveSession(null);session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setData(empty);setMessages([]);setFlow(null);return;}if(typeof result.token!=='string')throw Error('Сервер не подтвердил вход.');await saveSession(result.token);session.current=true;
      setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);
      // While the last role is opening the chooser is not shown, so the map is the first thing seen after «Войти».
      // Signed in to book or to see something from the visitor map: the guest's pages open, and that goes on there.
      setOpening(true);try{const state=await load();if(afterSignIn.current&&state?.user)await hydrate('guest');else await openLastRole(state);}finally{setOpening(false);}
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
      if(selectedRole==='guest'&&/нужна убор|заказать убор|уборк\S* (?:на дом|дома|квартир)|убрать(?:ся)? (?:в |у меня|дом|квартир)/i.test(text)){run('home-cleaning',state);return;}
      if(/нужна убор|создать убор|заказать убор|найти.*(?:уборщ|исполнител)/i.test(text)){run('job',state);return;}
      if(/мои квартир|мо[иё] жиль|мои объект/i.test(text)){run('own-properties',state);return;}
      if(/уборк.*(?:квартир|жиль|объект)|уборк.*моих|уборки владельца/i.test(text)){run('owner-jobs',state);return;}
      if(/мои (?:задан|отклик|уборк)|назначени/i.test(text)){run('my-jobs',state);return;}
      if(/найти убор|показать убор|доступн.*убор/i.test(text)){run('jobs',state);return;}
      if(/заявки гост|брони владельца/i.test(text)){run('owner-bookings',state);return;}
      if(/мои брон|мои заяв|заезд/i.test(text)){run('bookings',state);return;}
      if(/обзор|ближайш|что.*сегодня|что.*внимани/i.test(text)){run('workspace',state);return;}
      if(/что нового|уведомлен/i.test(text)){run('notifications',state);return;}
      if(/обновить/i.test(text)){say('Данные обновлены.','workspace',{role:actor});return;}
      if(/помощь|что.*уме|о сервисе|как.*работ/i.test(text)){say('Помогу снять жильё, подключить жильё и организовать уборку. Напишите, что нужно сделать. ИИ-администратор доступен в разделе «Чаты». Там сохраняются вопросы и ответы. Внешняя доставка и банковские платежи зависят от подключений сервиса. Важные действия подтверждаете вы.','help');return;}
      if(/снять|квартир|жиль|хостел|гостиниц|аренд/i.test(text)){if(!state.user){run('properties',state);return;}setActor('guest');catalog(state,'guest',text);return;}
      say('Уточните вашу задачу: хотите снять жильё, сдавать жильё или работать на уборке?','help');
    }catch(e){await handleError(e);}finally{locked.current=false;setBusy(false);composer.current?.focus();}
  }
  // A swipe is the confirmation itself: the same request as the «Подтвердите действие» card sends, without that card.
  function swiped(path:string,body:Row,after?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);void perform(path,{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},uid(),after);}
  function confirm(path:string,body:Row,title:string,after?:string,note?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);say('Подтвердите действие: '+title.toLowerCase()+'.','confirm',{path,body:{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},title,note,subject:item?.title,dates:item?date(item.start)+' → '+date(item.end):'',amount:item?.amount??item?.fee,after});}
  function review(m:Message){
    const f=m.payload!.flow as Flow;
    if(f.kind==='booking')return <><BookingReview flow={f} busy={busy} done={m.done} result={m.result} onConfirm={quote=>perform(f.endpoint,{...f.answers,...f.extra,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:true},m.id,f.after)} onEdit={()=>{finish(m.id,'Изменено');const next={...f,index:0};setFlow(next);say(next.questions[0].text);}}/>{!!m.payload!.back&&!m.done&&!dealOpen&&<Button title="Назад к вариантам" secondary disabled={busy} onPress={backToMap}/>}</>;
    const questions=f.kind==='profile'?[...baseQuestions,...cleanerQuestions]:f.kind==='property'?propertyQuestions:f.questions;
    return <View style={s.card}><Text style={s.cardTitle}>{({profile:'Ваш профиль',property:'Ваше жильё',job:'Уборка',report:'Отчёт',confirm:'Подтверждение'} as Row)[f.kind]||'Проверьте сведения'}</Text>
      {questions.filter(q=>f.answers[q.key]!==undefined).map(q=><View key={q.key} style={s.keyval}><Text style={s.key}>{q.label}</Text><Text style={s.value}>{q.date?date(Date.parse(f.answers[q.key])/1000):String(f.answers[q.key])}</Text></View>)}
      <Button title={m.done?(m.result||'Сохранено'):f.kind==='property'?'Опубликовать жильё':'Подтвердить'} disabled={busy||m.done} onPress={()=>perform(f.endpoint,{...f.answers,...f.extra},m.id,f.after)}/>
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
    if(intent==='job'){setPageId('overview');run('job');return;}
    if(intent==='home-cleaning'||intent.startsWith('home-cleaning:')){setPageId('overview');run(intent);return;}
    if(!intent.startsWith('property:'))return;
    const id=intent.slice(9);
    if(!data.properties.some((p:Row)=>p.id===id)){setPageId('catalog');return;}
    setPageId('overview');say(placeSaid(data.properties.find((p:Row)=>p.id===id)?.details?.type),'properties',{ids:[id],mode:'guest',back:true,...(stay?{stay}:{})});
  }
  // «Забронировать» in the map's results: the dates and guests are chosen there, so the guest goes straight to the check of the request.
  function bookFromMap(found:Row,stay:MapStay){
    scrollMessage.current=null;setPageId('overview');
    if(!ensure('guest','bookings'))return;
    const property=data.properties.find((p:Row)=>p.id===found.id)||found,questions=bookingQuestions(property);
    // A stay kept from an earlier visit may already be behind: the dates are asked again instead of sending the past.
    if(Date.parse(stayISO(stay).start)<Date.now()){run('book:'+property.id);return;}
    const next:Flow={kind:'booking',questions,index:questions.length,answers:{billingMode:stay.mode,...stayISO(stay),guests:stay.guests,...(stay.occasion?{occasion:stay.occasion}:{})},endpoint:'bookings',after:'bookings',role:'guest',extra:{propertyId:property.id,requestKey:uid()}};
    // The check of the booking is a sheet of its own: one card, the map behind it, nothing of the earlier talk.
    setDealCover(0);setDeal({kind:'review',id:property.id,after:messages.length?messages[messages.length-1].id:''});
    setActor('guest');say('','review',{flow:next,back:true});
  }
  // From a flat or a booking check opened on the map: back to the map, where the list of found flats is kept.
  // Brings a block that has just opened inside a card (changing the dates of a booking) into view: a tall block from its
  // top, a short one just enough to show it whole.
  const reveal=(node:View)=>node.measureInWindow((_x,y,_w,h)=>(scroll.current as unknown as View|null)?.measureInWindow((_sx,sy,_sw,sh)=>{
    const above=sy-y,below=y+h-(sy+sh),target=h>sh-24||above>0?scrollY.current+y-sy-12:below>0?scrollY.current+below+16:null;
    if(target!==null)scroll.current?.scrollTo({y:Math.max(0,target),animated:true});}));
  const backToMap=()=>{scrollMessage.current=null;setPageId('map');};
  const openDeal=(kind:'booking'|'job',id:string)=>{scrollMessage.current=null;setDealCover(0);setDeal({kind,id,after:messages.length?messages[messages.length-1].id:''});setPageId('overview');scroll.current?.scrollTo({y:0,animated:false});};
  const openPage=(id:string)=>{scrollMessage.current=null;setPageId(id);};
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <View style={s.card}><Text style={s.eyebrow}>ПЛАН АССИСТЕНТА</Text><Text style={s.cardTitle}>{brief.summary}</Text>{brief.tasks.map((task:Row)=><View key={task.id} style={s.event}><Text style={s.eventTitle}>{task.title}</Text><Text style={s.meta}>{task.reason}</Text><Button title="Открыть задачу" secondary disabled={busy} onPress={()=>openAssistantTask(task)}/></View>)}<Text style={s.meta}>Сроки и согласования проверяются сервером. Внешние каналы подключаются отдельно.</Text></View>;}
  function approval(id:string){const card=(data.approvals||[]).find((c:Row)=>c.id===id);const reportOf=card?.kind==='report'&&card.canDecide?card.entityId:'';
   // The acceptance of a cleaning: the performer's photos are looked at before the decision, and damage is reported from here.
   return card?<Fragment key={card.id+card.revision}>{!!reportOf&&<View style={{gap:8,marginTop:8,marginBottom:8}}><JobPhotos jobId={reportOf} phase="before" role="owner" readOnly title="До уборки"/><JobPhotos jobId={reportOf} phase="after" role="owner" readOnly title="После уборки"/></View>}<ApprovalCard card={card} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>{!!reportOf&&<View style={{marginTop:8}}><Button title="Сообщить об ущербе" secondary disabled={busy} onPress={()=>say('Сфотографируйте повреждение и опишите, что случилось.','damage',{id:reportOf})}/></View>}</Fragment>:<Text style={s.meta}>Согласование закрыто или срок истёк. Проверьте статус задачи.</Text>;}
  // «На карте» on a booking, a cleaning, an object or a chat: the home map opens on its pin (MapHome, map-memory.ts).
  // The map stays mounted under the sheets, so a new target starts it afresh (mapSeq): it aims once, when it opens.
  // A line of the AI journal opens what it is about, if this person still has it: the card of the booking or of the
  // cleaning (with «На карте» on it), the home on the map, the chat.
  const openEntry=(open:{kind:'booking'|'job'|'property'|'room';id:string})=>{
   if(open.kind==='room')return()=>{setChatInitial({roomId:open.id});setPageId('chats');};
   if(open.kind==='property')return onMap('property',open.id);
   const list:Row[]=open.kind==='job'?data.jobs:data.bookings;
   return list.some(r=>r.id===open.id)?()=>openDeal(open.kind as 'booking'|'job',open.id):undefined;
  };
  const onMap=(kind:MapTarget['kind'],id:string)=>selectedRole&&targetPin(selectedRole,{kind,id},data)?()=>{setMapTarget({kind,id});setMapSeq(v=>v+1);setChatsActive(false);scrollMessage.current=null;setPageId('map');}:undefined;
  function block(m:Message){
    const payload=m.payload||{};
    if(m.block==='approval')return approval(payload.id);
    if(m.block==='assistant-brief')return renderAssistantBrief();
    if(m.block==='property-settings'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return property?<PropertyControl key={property.id+':'+property.policy.version} property={property} busy={busy} onSave={body=>perform('properties/'+property.id+'/policy',body,m.id)} upcoming={upcomingStays(data.bookings,property.id,data.serverTime||Date.now()/1000)} onReadiness={body=>perform('properties/'+property.id+'/readiness',body,m.id)}/>:null;}
    if(m.block==='workspace'){
      const target=payload.role||actor,workspace=data.workspaces?.[target];
      if(!workspace)return <View style={s.card}><Text style={s.meta}>Обновите данные, чтобы увидеть ближайшие события.</Text><Button title="Обновить" secondary disabled={busy} onPress={()=>send('Ближайшие события')}/></View>;
      return <OverviewBoard workspace={workspace} approvals={data.approvals||[]} data={data} now={data.serverTime||Math.floor(Date.now()/1000)} busy={busy} onDecide={body=>perform('approvals',body,uid())} onOpen={(kind,id)=>openDeal(kind,id)}/>;
    }
    if(m.block==='auth')return session.current?<Text style={s.meta}>Вход выполнен.</Text>:<Auth key={m.id} busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,m.id,payload.intent,name,city,recovery)}/>;
    if(m.block==='review')return review(m);
    if(m.block==='stay-form'){const property=data.properties.find((p:Row)=>p.id===payload.propertyId);return property?<StayRequest property={property} busy={busy} done={m.done} result={m.result} onQuote={body=>request('/api/quote',body)} onConfirm={body=>perform('bookings',{...body,requestKey:payload.requestKey},m.id,'bookings')}/>:<Text style={s.meta}>Жильё больше недоступно.</Text>;}
    if(m.block==='job-form'){const property=data.ownProperties.find((p:Row)=>p.id===payload.propertyId);return property?<CleaningRequest property={property} busy={busy} done={m.done} result={m.result} onSubmit={body=>perform('jobs',body,m.id,'owner-jobs')}/>:<Text style={s.meta}>Жильё недоступно.</Text>;}
    if(m.block==='home-order')return <HomeCleaningOrder places={(data as Row).homePlaces||[]} deals={(data as Row).homeDeals||[]} city={data.profile?.city||'Павлодар'} propertyId={payload.propertyId} busy={busy} done={m.done} result={m.result} onSubmit={body=>orderHome({...body,requestKey:payload.requestKey},m.id)}/>;
    if(m.block==='confirm')return <View style={s.card}><Text accessibilityRole="header" style={s.cardTitle}>{payload.title}</Text><Text style={s.text}>{payload.subject||'Подтверждение действия'}</Text>{!!payload.note&&<Text style={s.text}>{payload.note}</Text>}<Text style={s.meta}>{payload.dates}{payload.amount!==undefined?' · '+money(payload.amount):''}</Text>{m.done?<Button title={m.result||'Действие закрыто'} disabled onPress={()=>{}}/>:<SwipeConfirm label={'Проведите: '+String(payload.title||'подтвердить').charAt(0).toLowerCase()+String(payload.title||'подтвердить').slice(1)} disabled={busy} onConfirm={()=>perform(payload.path,payload.body,m.id,payload.after)}/>}{!m.done&&<Button title={payload.body?.action==='cancel'?'Не отменять':'Отменить'} secondary disabled={busy} onPress={()=>finish(m.id,'Отменено')}/>}</View>;
    if(m.block==='help')return <View style={s.suggestions}>{['Хочу снять жильё','Хочу сдать жильё','Хочу работать на уборке','Мои брони','Что нового'].map(t=><Button key={t} title={t} secondary disabled={busy} onPress={()=>send(t)}/>)}</View>;
    if(m.block==='property-quick')return m.done?<Text style={s.meta}>{m.result||'Готово'}</Text>:<PropertyQuick city={data.profile?.city||'Павлодар'} onSave={body=>request('/api/listings',body)} onGuestMode={body=>request('/api/operations/matching/preference',body,undefined,undefined,'owner')} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onPlace={body=>request('/api/operations/map/place',body,undefined,undefined,'owner')} onClose={()=>finish(m.id,'Добавление отменено')} onMap={async()=>{finish(m.id,'Жильё добавлено');await load();setPageId('map');}} onDone={async saved=>{finish(m.id,'Жильё добавлено');const state=await load();say(saved.message);catalog(state,'owner');}}/>;
    if(m.block==='property-editor'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return m.done||!property?<Text style={s.meta}>{m.result||'Форма закрыта'}</Text>:<PropertyEdit key={property.id} property={property} step={payload.step} onOpenHall={async id=>{finish(m.id,'Изменения сохранены');await load();say('','property-editor',{id});}} call={(path,body)=>request('/api/operations/'+path,body,undefined,undefined,'owner')} onClose={()=>{finish(m.id,'Изменения сохранены');void load().then(state=>{if(state)catalog(state,'owner');});}} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onRemove={async()=>{const r=await request('/api/listings/'+property.id+'/remove',{},undefined,undefined,'owner');finish(m.id,r?.message||'Жильё удалено');const state=await load();if(state)catalog(state,'owner');}} onSave={async body=>{await request('/api/listings/'+property.id,body);const state=await load();return state?.ownProperties?.find((p:Row)=>p.id===property.id);}}/>;}
    // The owner's own objects are short cards («Моё жильё»); the page's own list carries «Добавить жильё» on top.
    if(m.block==='properties'&&payload.mode==='owner')return <OwnProperties properties={payload.ids.map((id:string)=>data.ownProperties.find((p:Row)=>p.id===id)).filter(Boolean)} bookings={data.bookings} busy={busy} onAdd={m.id==='page-properties'?()=>run('property'):undefined} onEdit={id=>say('','property-editor',{id})} onSettings={id=>say('Правила и готовность жилья.','property-settings',{id})} onCleaning={id=>run('job:'+id)} onMap={id=>onMap('property',id)}/>;
    if(m.block==='properties')return <View>{!!payload.back&&<Button title="Назад к карте" secondary disabled={busy} onPress={backToMap}/>}{payload.ids.map((id:string)=>{const p=[...data.properties,...data.ownProperties].find((p:Row)=>p.id===id);if(!p)return null;const stay:MapStay|undefined=payload.mode==='guest'?payload.stay:undefined;return <PropertyListing key={id} property={p} owner={payload.mode==='owner'} chooseTitle={stay?'Забронировать':payload.mode==='job'?'Убрать здесь':undefined} onChoose={()=>stay?bookFromMap(p,stay):run((payload.mode==='owner'||payload.mode==='job'?'job:':'book:')+id)} onEdit={()=>say('','property-editor',{id})} onSettings={()=>say('Полномочия и готовность жилья.','property-settings',{id})} onMap={onMap('property',id)} {...(payload.mode==='guest'&&selectedRole==='guest'&&!p.demo_owner?{favorite:favorites.mine.favorites.includes(id),onFavorite:()=>void favorites.toggle(id).then(text=>{if(text)say(text);})}:{})}/>;})}{!payload.ids.length&&<Button title={payload.mode==='guest'?'Посмотреть учебный пример':'Добавить жильё'} secondary disabled={busy} onPress={()=>send(payload.mode==='guest'?'Покажи учебный пример':'Хочу сдать жильё')}/>}</View>;
    if(m.block==='bookings')return <View>{payload.role==='owner'&&m.id==='page-bookings'&&tabNow==='new'&&<OwnerResponses autopilot={(job,apps)=>autopilotPick(data,job,apps,data.serverTime||Date.now()/1000)} rows={ownerResponses(data,userId||'',data.serverTime||Date.now()/1000)} approvals={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())} onOpen={id=>openDeal('job',id)}/>}{payload.role==='owner'&&m.id==='page-bookings'&&tabNow==='new'&&payload.ids.length>0&&ownerResponses(data,userId||'',data.serverTime||Date.now()/1000).length>0&&<Text accessibilityRole="header" style={s.groupTitle}>Заявки гостей</Text>}{(m.id==='page-bookings'&&tabNow==='archive'?byMonth:byTime)(payload.ids,data.bookings).map(({id,title}:{id:string;title:string})=>{
      const b=data.bookings.find((b:Row)=>b.id===id);if(!b)return null;const owner=b.owner_id===userId&&payload.role==='owner';
      const confirmed=b.status==='confirmed',started=b.start<=data.serverTime,left=Math.max(0,b.amount-(b.terms?.paid_amount||0)),depositDue=b.terms?.deposit>0&&b.terms?.deposit_status==='pending'?Number(b.terms.deposit):0,due=left+depositDue,guests=Number(b.guests)||1,tens=guests%100,units=guests%10;
      const clock=data.serverTime||Date.now()/1000,inside=!!b.terms?.actual_checkin&&!b.terms?.actual_checkout,guideNow=!owner&&confirmed&&!b.terms?.actual_checkout,guideFirst=guideNow&&b.payment_status==='owner_verified'&&!b.terms?.actual_checkin,asked=(b.changes||[]).some((c:Row)=>c.status==='pending');
      // «Как гость оставил жильё?» after checkout; the guest's own photos of the home while staying (lib/stay-handover.ts).
      const handed=handoverState(b as Parameters<typeof handoverState>[0],clock),shooting=!owner&&confirmed&&!!(b.terms?.actual_checkin||b.terms?.checkin_reported_at)&&!b.terms?.actual_checkout;
      const changes=<BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={payload.role} busy={busy} onReview={id=>say('Предложение новых условий.','approval',{id:'change:'+id})} onQuote={body=>request('/api/bookings/'+id+'/change-quote',body)} onPropose={body=>perform('bookings/'+id+'/changes',body,uid())} onDecide={(changeId,action)=>perform('bookings/'+id+'/changes/'+changeId,{action},uid())} onReveal={reveal}/>;
      return <Fragment key={id}>{!!title&&!(m.id==='page-bookings'&&['done','cancelled'].includes(tabNow))&&<Text accessibilityRole="header" style={s.groupTitle}>{title}</Text>}<DealCard kind="booking" compact={m.id==='page-bookings'} startOpen={recordGroup(b,clock)==='now'} item={b} role={payload.role} userId={userId||''} thread={owner?bookingThread(b,data,clock):null} line={owner?null:guestLine(b,clock,data.paymentMode)} busy={busy} onMap={onMap('booking',id)}
        always={<>{!owner&&confirmed&&data.paymentMode==='test'&&due>0&&<Text style={s.meta}>{left>0&&depositDue?wordsOf(b).stay+' '+money(left)+' и депозит '+money(depositDue)+', он вернётся '+wordsOf(b).afterLeave+'. ':depositDue?'Депозит вернётся '+wordsOf(b).afterLeave+'. ':''}Оплата тестовая: банк ещё не подключён, деньги не списываются.</Text>}{guideFirst&&<CheckinGuide key={'guide:'+id} bookingId={id} venue={wordsOf(b).arrive!=='Заезд'}/>}{inside&&<ActivityTimer kind="booking" item={b}/>}{asked&&changes}{owner&&handed==='ask'&&<StayHandover key={'handover:'+id} bookingId={id} kind={b.property_type} cleanerPhotos={Number(b.cleaner_photos)||0} cleanerDamage={Number(b.cleaner_damage)||0} checkinPhotos={Number(b.checkin_photos)||0} busy={busy} onSubmit={body=>perform('operations/handover',{bookingId:id,...body},uid())}/>}{(handed==='done'||handed==='silent')&&<Text style={s.meta}>{handoverLine(b.handover,handed==='silent',!owner,b.property_type)}</Text>}{shooting&&!Number(b.checkin_photos)&&<CheckinPhotos key={'checkin-photos:'+id} bookingId={id} count={0} venue={wordsOf(b).arrive!=='Заезд'}/>}{payload.role==='guest'&&b.status==='completed'&&!b.review_rating&&<StayReview busy={busy} onSubmit={(rating,text)=>perform('operations/review',{bookingId:id,rating,text},uid())}/>}</>}
        details={<><RecordFacts rows={[['Гости',guests+' '+(tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей')],owner&&b.guest_name&&['Гость',b.guest_name+(b.guest_contact?' · '+b.guest_contact:'')],b.terms&&['Оплачено',money(b.terms.paid_amount||0)+(left>0?' · остаток '+money(left):'')],b.terms&&['Депозит',b.terms.deposit?money(b.terms.deposit)+' · '+(b.terms.deposit_status==='owner_verified'?'подтверждён владельцем':'ожидается'):'не требуется'],b.readiness&&['requested','confirmed'].includes(b.status)&&[wordsOf(b).arrive==='Заезд'?'Жильё':'Объект',wordsOf(b).arrive==='Заезд'?readinessLabels[b.readiness]:({ready:'Готово к приходу гостей',occupied:'Гости на месте',blocked:'Брони закрыты'} as Row)[b.readiness]||readinessLabels[b.readiness]],b.address&&['Адрес',b.address+(b.owner_contact?' · '+b.owner_contact:''),true]]}/>{guideNow&&!guideFirst&&<CheckinGuide key={'guide:'+id} bookingId={id} venue={wordsOf(b).arrive!=='Заезд'}/>}{shooting&&!!Number(b.checkin_photos)&&<CheckinPhotos key={'checkin-photos:'+id} bookingId={id} count={Number(b.checkin_photos)} venue={wordsOf(b).arrive!=='Заезд'}/>}{b.status==='completed'&&!(owner&&handed==='ask')&&(!!Number(b.checkin_photos)||!!Number(b.handover_photos))&&<StayEvidence key={'evidence:'+id} bookingId={id} kind={b.property_type} role={owner?'owner':'guest'} checkin={!!Number(b.checkin_photos)} handover={!!Number(b.handover_photos)}/>}{!inside&&<ActivityTimer kind="booking" item={b}/>}</>}
        extra={asked?null:changes}
        actions={[
          owner&&b.status==='requested'&&{title:'Рассмотреть заявку',kind:'main',onPress:()=>say('Запрос гостя на согласование.','approval',{id:'booking:'+id})},
          // In the order the booking allows them: the check-in is confirmed only after the payment and the deposit, and the first one is the big button.
          owner&&confirmed&&b.payment_status!=='owner_verified'&&{title:'Отметить оплату',kind:data.paymentMode==='off'?'main':'side',swipe:'Проведите: оплата получена',onSwipe:()=>swiped('bookings/'+id,{action:'paid',expectedAmount:b.amount}),onPress:()=>confirm('bookings/'+id,{action:'paid',expectedAmount:b.amount},'Отметить оплату после проверки в банке')},
          owner&&confirmed&&b.terms?.deposit_status==='pending'&&{title:'Подтвердить депозит',kind:'main',swipe:'Проведите: депозит получен',onSwipe:()=>swiped('bookings/'+id,{action:'deposit_received'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'deposit_received'},'Подтверждаю фактическое получение депозита; банковская операция не выполняется','owner-bookings')},
          // The flat is not marked ready and no executor cleaning is on the way (a new flat, own staff): one tap, no form.
          owner&&confirmed&&!b.terms?.actual_checkin&&['inspection','awaiting_cleaning'].includes(b.readiness)&&!data.jobs.some((j:Row)=>j.property_id===b.property_id&&['open','assigned','in_progress','submitted'].includes(j.status))&&{title:wordsOf(b).ready,kind:'main',swipe:'Проведите: '+wordsOf(b).readyLow,onSwipe:()=>swiped('properties/'+b.property_id+'/readiness',{readiness:'ready',inspected:true},'owner-bookings'),onPress:()=>confirm('properties/'+b.property_id+'/readiness',{readiness:'ready',inspected:true},'Подтверждаю: '+wordsOf(b).readyLow,'owner-bookings')},
          // Cleaned early: the next guest may come in now, at no extra cost (lib/arrival-shift.ts).
          owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.early_checkin_at&&!checkinOpen(b.start,clock)&&b.start-clock<=12*3600&&b.readiness==='ready'&&b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending'&&{title:'Можно заселиться раньше',kind:'side',onPress:()=>confirm('bookings/'+id,{action:'early_checkin'},'Пустить гостя раньше',undefined,'Гость получит сообщение, что может '+(wordsOf(b).arriveAcc==='заселение'?'заселиться':'прийти')+' уже сейчас, без доплаты.')},
          // The cleaning runs late: ask the guest to come later. The guest accepts or declines; until then the old time holds.
          ...[30,60].map(min=>owner&&confirmed&&!b.terms?.actual_checkin&&b.start>clock&&b.start-clock<=86400&&!asked&&{title:'Сдвинуть '+wordsOf(b).arriveLow+' на '+(min===60?'1 ч':min+' мин'),kind:'side' as const,onPress:()=>confirm('bookings/'+id,{action:'shift_arrival',minutes:min},'Попросить гостя '+(wordsOf(b).arriveAcc==='заселение'?'заехать':'прийти')+' на '+(min===60?'1 ч':min+' мин')+' позже',undefined,'Гость получит предложение и ответит в карточке брони. Пока он не согласился, действует прежнее время.')}),
          owner&&confirmed&&checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)&&!b.terms?.actual_checkin&&{title:'Подтвердить '+wordsOf(b).arriveAcc,kind:b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending'?'main':'side',swipe:'Проведите: '+wordsOf(b).guestIn.toLowerCase(),onSwipe:()=>swiped('bookings/'+id,{action:'checkin'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'checkin'},'Подтверждаю: '+wordsOf(b).guestIn.toLowerCase(),'owner-bookings')},
          owner&&confirmed&&started&&{title:'Подтвердить '+wordsOf(b).leaveLow,kind:'main',swipe:'Проведите: '+wordsOf(b).swipeGuestOut,onSwipe:()=>swiped('bookings/'+id,{action:'checkout'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'checkout'},'Подтверждаю: '+wordsOf(b).swipeGuestOut+', объект свободен','owner-bookings')},
          // One payment in one tap: the stay and the refundable deposit together (operations/payment-test, kind 'all'). What the sum is made of is said above the button.
          !owner&&confirmed&&data.paymentMode==='test'&&due>0&&{title:'Оплатить '+money(due),kind:'main',swipe:'Проведите: оплатить '+money(due),onPress:()=>perform('operations/payment-test',{bookingId:id,kind:'all'},uid())},
          !owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.checkin_reported_at&&b.end>data.serverTime&&{title:wordsOf(b).iAmIn,kind:'main',swipe:'Проведите: '+wordsOf(b).swipeIn,onSwipe:()=>swiped('bookings/'+id,{action:'report_checkin'}),onPress:()=>confirm('bookings/'+id,{action:'report_checkin'},'Сообщить: '+wordsOf(b).swipeIn+'; владелец подтвердит после проверки оплаты и депозита'),...(checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)?{}:{disabled:true,note:'Кнопка станет активной за 15 минут до '+wordsOf(b).arriveGen+': '+checkinOpensLabel(b.start,data.serverTime,b.terms?.early_checkin_at)+'.'})},
          !owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.checkin_reported_at&&lateOpen(lateStay(b),data.serverTime)&&{title:lateLabel(lateStay(b)),kind:'main',swipe:'Проведите: '+lateLabel(lateStay(b)).toLowerCase(),onSwipe:()=>swiped('bookings/'+id,{action:'report_late'}),onPress:()=>confirm('bookings/'+id,{action:'report_late'},'Предупредить владельца, что вы приедете на час позже; бронь сохранится'),...(lateNote(lateStay(b),data.serverTime)?{note:lateNote(lateStay(b),data.serverTime)}:{})},
          !owner&&confirmed&&started&&!b.terms?.checkout_reported_at&&{title:'Сообщить '+wordsOf(b).ofLeave,kind:'main',swipe:'Проведите: '+wordsOf(b).swipeOut,onSwipe:()=>swiped('bookings/'+id,{action:'report_checkout'}),onPress:()=>confirm('bookings/'+id,{action:'report_checkout'},'Сообщить '+wordsOf(b).ofLeave+'? Владелец или ИИ-администратор подтвердит.')},
          {title:'Открыть чат',kind:'side',onPress:()=>{setChatInitial({kind:'booking',entityId:id,channel:'stay'});setPageId('chats');}},
          (confirmed||b.status==='completed'&&(owner||!!b.terms?.deposit_kept||b.handover?.verdict==='issues'))&&{title:'Есть проблема',kind:'side',onPress:()=>raiseIssue('booking',id,actor)},
          ['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&{title:'Отменить бронь',kind:'danger',onPress:()=>confirm('bookings/'+id,{action:'cancel'},'Отменить бронь',undefined,cancelLine(b.cancel_terms,owner,b.terms?.paid_amount||0)+'.')},
          // Money after the stay or a cancellation: the owner marks each transfer in one tap, the amount is on the button.
          owner&&['cancelled','expired'].includes(b.status)&&refundLeft(b)>0&&{title:'Вернул гостю '+money(refundLeft(b)),kind:'main',swipe:'Проведите: вернул гостю '+money(refundLeft(b)),onSwipe:()=>swiped('bookings/'+id,{action:'record_refund',confirmed:true},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'record_refund',confirmed:true},'Вернул гостю '+money(refundLeft(b)),'owner-bookings','Подтверждаю, что уже перевёл гостю эту сумму за отменённую бронь.')},
          owner&&['completed','cancelled','expired'].includes(b.status)&&b.terms?.deposit_status==='owner_verified'&&b.terms?.deposit_balance>0&&{title:'Вернул депозит '+money(b.terms.deposit_balance),kind:handed==='ask'?'side':'main',swipe:'Проведите: вернул депозит '+money(b.terms.deposit_balance),onSwipe:()=>swiped('bookings/'+id,{action:'record_deposit_return',confirmed:true},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'record_deposit_return',confirmed:true},'Вернул депозит '+money(b.terms.deposit_balance),'owner-bookings','Подтверждаю, что уже перевёл гостю депозит.')},
          // Damage after the stay: the owner keeps a part of the deposit once, with a reason the guest sees.
          owner&&b.status==='completed'&&b.terms?.deposit_status==='owner_verified'&&b.terms?.deposit_balance>0&&!b.terms?.deposit_kept&&{title:'Удержать часть депозита',kind:'side',onPress:()=>beginFlow('keep-deposit',[{key:'amount',text:'Какую сумму удержать из депозита '+money(b.terms.deposit_balance)+'? Гость увидит сумму и причину.',label:'Удержать, ₸',min:1,max:b.terms.deposit_balance},{key:'reason',text:'За что удерживаете? Напишите коротко, что повреждено или пропало.',label:'Причина'}],{},'bookings/'+id,'owner-bookings','owner',{action:'keep_deposit'})},
        ]}/>


      </Fragment>;
    })}</View>;
    if(m.block==='jobs')return <View>{byTime(payload.ids,data.jobs).map(({id,title}:{id:string;title:string})=>{
      const j=data.jobs.find((j:Row)=>j.id===id);if(!j)return null;const owner=j.owner_id===userId&&payload.role==='owner',assigned=j.assigned_to===userId&&!owner;
      const applied=data.applications.some((a:Row)=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
      const application=data.applications.find((a:Row)=>a.job_id===id&&a.user_id===userId);
      const home=j.booking_id===null&&!!homeOrderOf(j.description),hired=!!j.assigned_to&&j.assigned_to!==j.owner_id,lateDue=j.status==='cancelled'&&j.cancel_fee>0?Math.max(0,j.cancel_fee-(j.settlement_paid||0)):0,stars=(n:number)=>'★'.repeat(n)+'☆'.repeat(5-n);
      const clock=data.serverTime||Date.now()/1000,running=j.status==='in_progress',reported=['submitted','completed'].includes(j.status),canClaim=owner&&hired&&(j.status==='submitted'||j.status==='completed'&&(j.completed_at||0)>=clock-HOME_DAMAGE_WINDOW),thread=owner?cleaningThread(j,data,clock):assigned?jobThread(j,data,clock):null;
      const nextBox=<CleanerNextBox job={j} application={application} admission={application?.admission??data.profile?.admission} userId={userId||''} busy={busy} onRequestReview={()=>perform('operations/reviews/request',{reference:'Отклик на уборку: проверьте анкету исполнителя.'},uid())}/>;
      return <Fragment key={id}>{!!title&&!(m.id!=='page-jobs'&&m.id.startsWith('page-')&&!firstTabNow)&&<Text accessibilityRole="header" style={s.groupTitle}>{title}</Text>}<DealCard kind="job" compact={m.id.startsWith('page-')} startOpen={recordGroup(j,clock)==='now'} item={j} role={payload.role} userId={userId||''} application={application} thread={thread} busy={busy} onMap={onMap('job',id)}
        always={<>{owner&&j.status==='open'&&!isUnclaimed(j,Date.now()/1000)&&<ApplicantPick applications={data.applications.filter((a:Row)=>a.job_id===id&&a.status==='pending')} approvals={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>}{running&&<ActivityTimer kind="job" item={j}/>}{(owner||assigned)&&<OverdueHelp job={j} role={owner?'owner':'cleaner'} busy={busy} onAction={body=>perform('jobs/'+id,body,uid(),owner?'owner-jobs':'my-jobs')}/>}{!owner&&!thread&&nextBox}</>}
        details={<>{!owner&&<JobPlace job={j}/>}{assigned&&['assigned','in_progress'].includes(j.status)&&<CheckinGuide key={'access:'+id} bookingId={id} role="cleaner"/>}{owner&&!!j.worker&&<View style={applicantStyles.assigned}><WorkerRow worker={j.worker} label="Исполнитель"/></View>}<RecordFacts rows={[owner&&j.description&&['Что сделать',j.description],j.address&&['Адрес',j.address+(j.owner_contact?' · '+j.owner_contact:''),true],j.report&&['Отчёт',j.report],j.status==='cancelled'&&j.cancel_fee>0&&['За позднюю отмену',money(j.cancel_fee)+(lateDue?'':' · оплачено')],!!j.rating&&[owner?'Ваша оценка':'Оценка заказчика',stars(j.rating)+(j.rating_note?' «'+j.rating_note+'»':'')]]}/>{(owner||assigned)&&hired&&reported&&<>{owner&&<><JobPhotos jobId={id} phase="before" role="owner" readOnly title="До уборки"/><JobPhotos jobId={id} phase="after" role="owner" readOnly title="После уборки"/></>}<JobPhotos key={'damage:'+j.version} jobId={id} phase="damage" role={owner?'owner':'cleaner'} readOnly title="Фото повреждений"/></>}{!running&&<ActivityTimer kind="job" item={j}/>}{!owner&&!!thread&&nextBox}</>}
        actions={[
          owner&&j.status==='completed'&&!!j.assigned_to&&j.fee>(j.settlement_paid||0)&&{title:'Оплатил уборку '+money(j.fee-(j.settlement_paid||0)),kind:'main',swipe:'Проведите: оплатил уборку '+money(j.fee-(j.settlement_paid||0)),onSwipe:()=>swiped('jobs/'+id,{action:'record_job_payment',confirmed:true},'owner-jobs'),onPress:()=>confirm('jobs/'+id,{action:'record_job_payment',confirmed:true},'Оплатил уборку '+money(j.fee-(j.settlement_paid||0)),'owner-jobs','Подтверждаю, что уже перевёл исполнителю эту сумму.')},




          // A home order cancelled after the free term: the customer owes the performer a part of the sum.
          owner&&lateDue>0&&{title:'Оплатил за отмену '+money(lateDue),kind:'main',swipe:'Проведите: оплатил за отмену '+money(lateDue),onSwipe:()=>swiped('jobs/'+id,{action:'record_job_payment',confirmed:true},'owner-jobs'),onPress:()=>confirm('jobs/'+id,{action:'record_job_payment',confirmed:true},'Оплатил за отмену '+money(lateDue),'owner-jobs','Подтверждаю, что уже перевёл исполнителю эту сумму.')},
          assigned&&lateDue>0&&{title:'Не получил оплату',kind:'side',onPress:()=>confirm('jobs/'+id,{action:'issue',issue:'Исполнитель не получил '+money(lateDue)+' за позднюю отмену уборки.'},'Сообщить, что оплата за отмену не пришла','my-jobs','Заказчик и администратор сервиса получат сообщение.')},
          // After the acceptance: the rating first once the work is paid, the complaint about damage for two days.
          owner&&j.status==='completed'&&hired&&!j.rating&&{title:'Оценить исполнителя',kind:j.fee>(j.settlement_paid||0)?'side':'main',onPress:()=>say('Оцените работу исполнителя.','rate',{id})},
          canClaim&&{title:'Сообщить об ущербе',kind:'side',onPress:()=>say('Сфотографируйте повреждение и опишите, что случилось.','damage',{id})},
          // The customer changes their mind: the terms are said before the confirmation (free term, then a part of the sum).
          owner&&home&&['open','assigned'].includes(j.status)&&{title:'Отменить уборку',kind:'danger',onPress:()=>{const terms=homeCancel(j,clock);confirm('jobs/'+id,{action:'cancel',expectedFee:terms.fee},'Отменить уборку','owner-jobs',homeCancelLine(terms,'до '+date(terms.freeUntil)));}},
          // Accepted and still not paid by the owner: one tap opens an issue the service administrator sees too.
          assigned&&j.status==='completed'&&!j.settled_at&&!j.guarantee&&j.fee>(j.settlement_paid||0)&&{title:'Не получил оплату',kind:'side',onPress:()=>confirm('jobs/'+id,{action:'issue',issue:'Исполнитель не получил оплату '+money(j.fee-(j.settlement_paid||0))+' за уборку.'},'Сообщить, что оплата за уборку не пришла','my-jobs','Владелец и администратор сервиса получат сообщение.')},
          !owner&&j.status==='open'&&!applied&&{title:'Откликнуться',kind:'main',swipe:'Проведите: беру эту уборку',onPress:()=>perform('jobs/'+id,{action:'apply'},m.id)},
          !owner&&j.status==='open'&&application?.status==='pending'&&{title:'Отозвать отклик',kind:'side',onPress:()=>confirm('jobs/'+id,{action:'withdraw'},'Отозвать отклик на эту уборку','jobs')},
          // The guest left without a word: the cleaner at the door says so, and the owner (or the autopilot) confirms the checkout.
          assigned&&j.status==='assigned'&&!!j.booking_id&&!j.checkout_confirmed&&clock>=j.start-1800&&{title:'Гостя нет, жильё свободно',kind:'main',swipe:'Проведите: гостя нет, жильё свободно',onSwipe:()=>swiped('jobs/'+id,{action:'vacant'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'vacant'},'Сообщить владельцу, что гость ушёл и жильё свободно','my-jobs')},
          // A cleaning without a booking: the customer is at home and waits, so the performer says «Выезжаю» and «Я на месте».
          assigned&&j.status==='assigned'&&j.booking_id===null&&!j.arrived_at&&clock>=j.start-3600&&{title:'Я на месте',kind:'main',swipe:'Проведите: я на месте',onSwipe:()=>swiped('jobs/'+id,{action:'arrived'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'arrived'},'Сообщить заказчику, что вы на месте','my-jobs')},
          assigned&&j.status==='assigned'&&j.booking_id===null&&!j.arrived_at&&!j.on_way_at&&clock>=j.start-3*3600&&{title:'Выезжаю',kind:clock>=j.start-3600?'side':'main',onPress:()=>swiped('jobs/'+id,{action:'on_way'},'my-jobs')},
          assigned&&j.status==='assigned'&&(j.booking_id!==null||!!j.arrived_at||clock<j.start-3600)&&{title:'Начать уборку',kind:'main',disabled:!j.checkout_confirmed,swipe:'Проведите: начинаю уборку',onSwipe:()=>swiped('jobs/'+id,{action:'start'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'start'},'Отметить начало работы','my-jobs')},
          assigned&&j.status==='assigned'&&clock>=j.start-3*3600&&clock<=j.start+2700&&{title:'Опаздываю',kind:'side',onPress:()=>confirm('jobs/'+id,{action:'late'},'Предупредить владельца: вы начнёте на полчаса позже, время уборки сдвинется','my-jobs')},
          // Cannot come after all: said in advance, the cleaning goes back to the search and the owner hears at once.
          assigned&&j.status==='assigned'&&{title:'Отказаться от задания',kind:'danger',onPress:()=>confirm('jobs/'+id,{action:'release'},'Отказаться от задания','my-jobs','Уборка вернётся в поиск, владелец сразу узнает.')},
          assigned&&j.status==='in_progress'&&{title:'Подготовить отчёт',kind:'main',onPress:()=>say('Проверьте каждый пункт. Отчёт уйдёт '+(home?'заказчику':'владельцу')+' после вашего подтверждения.','report',{id})},
          owner&&j.status==='submitted'&&{title:'Рассмотреть отчёт',kind:'main',onPress:()=>say('Отчёт на приёмке.','approval',{id:'report:'+id})},
          (owner&&!!j.assigned_to||assigned)&&{title:'Открыть чат',kind:'side',onPress:()=>{setChatInitial({kind:'job',entityId:id,channel:'cleaning'});setPageId('chats');}},
          (owner&&!!j.assigned_to||assigned)&&{title:'Есть проблема',kind:'side',onPress:()=>raiseIssue('job',id,owner?'owner':'cleaner')},
        ]}/>
      </Fragment>;
    })}{payload.role==='owner'&&m.id!=='deal'&&<Button title="Создать уборку" secondary disabled={busy} onPress={()=>send('Создать уборку')}/>}</View>;
    if(m.block==='rate')return m.done?null:<JobRating busy={busy} onSubmit={(rating,note)=>perform('jobs/'+payload.id,{action:'rate',rating,note},m.id,'owner-jobs')}/>;
    if(m.block==='damage')return m.done?null:<DamageClaim jobId={payload.id} busy={busy} onSubmit={text=>perform('jobs/'+payload.id,{action:'damage',text},m.id,'owner-jobs')}/>;
    if(m.block==='report')return <Report items={reportItems(data.jobs.find((j:Row)=>j.id===payload.id))} jobId={payload.id} photos={!!data.jobs.find((j:Row)=>j.id===payload.id)?.photos_required} busy={busy||!!m.done} onSubmit={(body:Row)=>perform('jobs/'+payload.id,{action:'submit',...body},m.id,'my-jobs')}/>;
    if(m.block==='notifications')return <View>{data.notifications.slice(0,20).map((n:Row)=><View style={s.card} key={n.id}><Text style={s.text}>{n.body}</Text><Text style={s.meta}>{date(n.created_at)}</Text></View>)}</View>;
    return null;
  }
  const pages=selectedRole?rolePages[selectedRole]:[];
  const dealOpen=pageId==='overview'&&!!deal&&!flow;
  // A deal's sheet shows what was said after it opened; the check of a booking shows its own card (the last one still open) and what follows.
  const reviewAt=dealOpen&&deal!.kind==='review'?messages.map(m=>m.block==='review'&&!m.done).lastIndexOf(true):-1;
  // «Моё жильё» shows only what was said after it opened, without the lists of objects said in the chat; while an object is
  // being changed or added, the form alone is the sheet, and the list comes back with the changes once it closes (a closed form is not shown again).
  const ownPage=pageId==='properties'&&selectedRole==='owner',ownSaid=ownPage?messages.slice(messages.findIndex(m=>m.id===beforeOwn.current)+1).filter(m=>m.block!=='properties'&&!((m.block==='property-editor'||m.block==='property-quick')&&m.done)):[];
  const ownForm=ownSaid.some(m=>m.block==='property-editor'||m.block==='property-quick');
  if(pageMark.current.page!==pageId){pageMark.current.start=pageMark.current.last;pageMark.current.page=pageId;}
  pageMark.current.last=messages[messages.length-1]?.id||'';
  // A form being filled keeps all it said; otherwise a page shows what was said since it opened, and «Сводка» folds the rest into «История».
  const pageStart=messages.some(m=>m.id===pageMark.current.start)?pageMark.current.start:flow?'':historyEnd.current,pageSaid=splitAt(messages,pageStart);
  const shown=ownPage?ownSaid:reviewAt>=0?messages.slice(reviewAt):dealOpen&&deal!.after?messages.slice(messages.findIndex(m=>m.id===deal!.after)+1):pageSaid.after;
  const earlier=pageId==='overview'&&!dealOpen&&!flow?pageSaid.before:[];
  const page=pages.find(p=>p.id===pageId);
  // Anything but the map itself is a sheet over it; a form being filled is one too.
  const sheetOpen=pageId!=='map'||!!flow;
  // Dictation belongs to the visible map: a page over it must not get a late search.
  useEffect(()=>{if(sheetOpen)cancelVoice();},[sheetOpen]);
  const nextTask=data.assistantBrief?.automatic?data.assistantBrief.prompts[0]:null;
  const homeCity=String(data.profile?.city||''),cityFlats=pageId==='catalog'&&homeCity?data.properties.filter((p:Row)=>p.city===homeCity):[],byCity=cityFlats.length>0&&!allCities;
  // Tabs of the list pages (lib/booking-filters.ts, lib/job-filters.ts): which tabs the page has, and the tab of each item on it.
  const pageTabs:{tabs:{id:string;label:string}[];of:(item:Row)=>string;items:Row[];label:string}|null=pageId==='bookings'&&selectedRole==='owner'?{tabs:ownerRequestTabs,of:b=>ownerRequestTab(b,userId||'',data.serverTime||Date.now()/1000),items:data.bookings,label:'Заявки'}
   :pageId==='bookings'?{tabs:bookingTabs,of:b=>bookingTab(b,selectedRole||'',userId||''),items:data.bookings,label:'Брони'}
   :pageId==='cleaning'&&selectedRole==='owner'?{tabs:ownerJobTabs,of:ownerJobTab,items:data.jobs,label:'Уборки'}
   :pageId==='assignments'?{tabs:cleanerJobTabs,of:j=>cleanerJobTab(j,userId||'',data.applications.find((a:Row)=>a.job_id===j.id&&a.user_id===userId)),items:data.jobs.filter((j:Row)=>j.assigned_to===userId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===userId)),label:'Задания'}:null;
  // The owner's «Новые» also count the cleaners' responses shown above the guests' requests.
  const responses=pageId==='bookings'&&selectedRole==='owner'?ownerResponses(data,userId||'',data.serverTime||Date.now()/1000).reduce((n,r)=>n+r.count,0):0;
  const tabCount:Record<string,number>=pageTabs?{...tabCounts(pageTabs.tabs,pageTabs.items,pageTabs.of),...(responses?{new:tabCounts(pageTabs.tabs,pageTabs.items,pageTabs.of).new+responses}:{})}:{},tabNow=pageTabs?(tabPick[pageId]&&pageTabs.tabs.some(t=>t.id===tabPick[pageId])?tabPick[pageId]:firstTab(pageTabs.tabs,tabCount)):'',firstTabNow=pageTabs?.tabs[0]?.id===tabNow;
  const allIds:string[]=pageId==='catalog'?(byCity?cityFlats:data.properties).map((p:Row)=>p.id):pageId==='properties'?data.ownProperties.map((p:Row)=>p.id):pageTabs?pageTabs.items.filter((item:Row)=>pageTabs.of(item)===tabNow).sort((x:Row,y:Row)=>tabNow==='archive'?y.start-x.start:0).map((item:Row)=>item.id):data.jobs.map((j:Row)=>j.id);
  const ids=allIds.slice(0,listed.page===pageId?listed.count:12),hidden=allIds.length-ids.length;
  const primary:Message={id:'page-'+pageId,sender:'assistant',text:'',block:pageId==='overview'?(flow?undefined:'workspace'):pageId==='properties'||pageId==='catalog'?'properties':pageId==='bookings'?'bookings':['cleaning','jobs','assignments'].includes(pageId)?'jobs':undefined,payload:{ids,role:selectedRole,mode:selectedRole==='owner'?'owner':'guest'}};
  if(erasureResult)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.transcript}><View style={s.card}><Text style={s.cardTitle}>Результат удаления</Text><Text style={s.text}>{erasureResult.message}</Text><Text selectable style={s.meta}>Квитанция: {erasureResult.receipt.id}</Text><Button title="Продолжить" onPress={()=>setErasureResult(null)}/></View></ScrollView></SafeAreaView>;
  if(recoveryCode)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.transcript}><View style={s.card}><Text style={s.cardTitle}>Сохраните резервный код</Text><Text style={s.text}>Он понадобится для восстановления доступа к общему аккаунту. Код показывается один раз и не сохраняется в переписке.</Text><Text selectable style={s.value}>{recoveryCode}</Text><Button title="Код сохранён — продолжить" onPress={()=>setRecoveryCode('')}/></View></ScrollView></SafeAreaView>;
  // No account: the map as a guest sees it. Search, pins, cards and prices work; booking, the chats and the menu ask to sign in.
  if(!selectedRole&&ready&&!opening&&!data.user&&signIn===null)return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><KeyboardAvoidingView style={s.shell} behavior="padding">
    {offline}{!!linkError&&<Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}<View style={s.stage}><MapHome key="visitor" role="guest" accountId="" data={data} menu={<SignInButton busy={busy} onPress={()=>askSignIn('',null)}/>} onChanged={async()=>{}} onOpenPage={()=>askSignIn('Войдите, чтобы открыть этот раздел.',null)} onOpenProcess={()=>askSignIn('',null)} onAsk={text=>askSignIn('Войдите, и ИИ-администратор ответит на ваш вопрос.',{kind:'ask',text})} onIntent={(intent,stay)=>intent.startsWith('favorite:')?askSignIn('Войдите, чтобы сохранять жильё в избранное.',null):askSignIn(intent.startsWith('home-cleaning')?'Чтобы заказать уборку у себя дома, войдите по номеру телефона.':'Войдите, чтобы открыть объявление целиком. Даты и гости сохранятся.',{kind:'open',intent,stay})} onBook={(property,stay)=>askSignIn('Чтобы забронировать «'+String(property.title||'жильё')+'», войдите по номеру телефона. Даты и гости сохранятся.',{kind:'book',property,stay})}/></View>
  </KeyboardAvoidingView></SafeAreaView></ActivityClockProvider>;
  if(!selectedRole)return <RoleEntry reason={signIn||undefined} onBack={!data.user&&signIn!==null?()=>{afterSignIn.current=null;setSignIn(null);}:undefined} start={joinRole} onStarted={()=>setJoinRole(null)} banner={offline} notice={linkError} ready={ready&&!opening} profile={data.profile} user={data.user} busy={busy} auth={<Auth titled={false} busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,'entry','workspace',name,city,recovery)}/>} onChoose={chooseRole} onSave={async(body,role)=>{await request('/api/profile',body);await chooseRole(role);}} onLogout={()=>send('Выйти')}/>;
  return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><KeyboardAvoidingView style={s.shell} behavior={pageId==='chats'?undefined:'padding'}>
    {offline}{!!linkError&&<Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}{processLinks.pending&&chatsActive&&<Text style={s.meta}>Ссылка откроется после закрытия диалога.</Text>}<View style={s.stage}>{/* The map is the only screen: it stays mounted, and every other page is a sheet over it. */}<View style={s.stage} pointerEvents={sheetOpen?'none':'auto'} importantForAccessibility={sheetOpen?'no-hide-descendants':'auto'} accessibilityElementsHidden={sheetOpen}><MapHome key={userId+':'+selectedRole+':'+mapSeq} role={selectedRole} accountId={userId} data={data} menu={<WorkspaceMenuButton avatar avatarId={data.profile?.avatar_id} avatarName={data.profile?.name} open={pageId==='account'} busy={busy} onPress={()=>openPage('account')}/>} chats={<MapChatsButton busy={busy} unread={unread} onPress={()=>openPage('chats')}/>} onChanged={async()=>{await load();}} onOpenPage={id=>{scrollMessage.current=null;setPageId(id);}} onEdit={(id,step)=>{setPageId('overview');if(step==='settings')say('Правила и готовность жилья.','property-settings',{id});else say('','property-editor',{id,step});}} onOpenProcess={(kind,id)=>openDeal(kind==='job'?'job':'booking',id)} onAsk={text=>{setInput('');setChatInitial({administrator:true,text,key:uid(),fromMap:true});setPageId('chats');}} onIntent={openMapIntent} onBook={bookFromMap} target={mapTarget} onTargetDone={()=>setMapTarget(null)} spot={dealOpen?{kind:deal!.kind==='review'?'property':deal!.kind,id:deal!.id}:null} cover={dealOpen?dealCover:0}/></View>{!sheetOpen&&!!toast&&<NoticeToast notice={toast.notice} more={toast.more} onDone={()=>setToast(null)} onPress={()=>{const open=noticeOpen(toast.notice.dedupe,data);setToast(null);if(open)openDeal(open.kind,open.id);else{setMenuStart('notices');openPage('account');}}}/>}{sheetOpen&&<View style={s.sheetLayer}>{!chatsActive&&<Pressable accessibilityLabel="Вернуться на карту" disabled={!!flow} onPress={backToMap} style={[s.sheetScrim,dealOpen&&s.sheetScrimDeal]}/>}<PageTransition page={pageId}><View onLayout={e=>setDealCover(Math.round(e.nativeEvent.layout.height))} style={[s.pageSheet,dealOpen?s.pageSheetFit:s.pageSheetFill,chatsActive&&s.pageSheetFull]}>{!chatsActive&&<View style={s.sheetHead}><View style={s.sheetGrab}/><Text accessibilityRole="header" numberOfLines={1} style={[s.headerTitle,{flex:1}]}>{flow?'AiQonaq':dealOpen?(deal!.kind!=='job'?'Бронь':selectedRole==='owner'?'Уборка':'Задание'):sheetName(selectedRole,pageId,page?.title||'AiQonaq',(data.ownProperties||[]).some((p:Row)=>['banya','sauna','banquet','cafe'].includes(p.details?.type)))}</Text>{!flow&&<Pressable accessibilityRole="button" accessibilityLabel="Закрыть и вернуться на карту" onPress={backToMap} style={({pressed})=>[s.sheetClose,pressed&&s.disabled]}><Text style={s.sheetCloseText}>✕</Text></Pressable>}</View>}{pageId==='chats'?<NativeChats key={userId+':'+selectedRole} accountId={userId} role={selectedRole} onChanged={load} initial={chatInitial} onInitialConsumed={()=>setChatInitial(null)} onConversationChange={setChatsActive} onAuthError={handleError} onReturnToMap={()=>setPageId('map')} mapLink={onMap} onOpenSubject={(kind,id)=>{try{const view=resolveProcessLink({role:selectedRole,section:kind==='booking'?'bookings':selectedRole==='owner'?'cleaning':'assignments',entityId:id},data,userId);setChatsActive(false);setPageId(view.section);if(view.block)say('Открыто из чата.',view.block,view.payload);}catch(e:any){setLinkError(e?.message||'Не удалось открыть.');}}}/>:<><ScrollView ref={scroll} onScroll={e=>{scrollY.current=e.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} style={dealOpen?s.fitScroll:{flex:1}} contentContainerStyle={dealOpen?[s.transcript,s.fitContent]:s.transcript} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>{if(messages[messages.length-1]?.sender==='user'||busy)scroll.current?.scrollToEnd({animated:true});}}>
      {pageId==='overview'&&!dealOpen&&!flow&&nextTask&&!['booking','job'].includes(nextTask.kind)&&<Pressable accessibilityRole="button" accessibilityLabel={'Ассистент рекомендует: '+nextTask.title} disabled={busy} onPress={()=>openAssistantTask(nextTask)} style={[s.recommendation,nextTask.priority===3&&s.urgentRecommendation]}><Text style={s.recommendationLabel}>Ассистент рекомендует</Text><Text style={s.eventTitle}>{nextTask.title}</Text></Pressable>}
      {pageId==='account'?<AccountControl staffPlaces={Number((data as Row).staffPlaces)||0} notices={data.notifications} start={menuStart} onOpenNotice={n=>{const open=noticeOpen(n.dedupe,data);return open?()=>openDeal(open.kind,open.id):undefined;}} onOpenEntry={openEntry} onOpenPage={id=>{scrollMessage.current=null;setPageId(id);scroll.current?.scrollTo({y:0,animated:false});}} role={selectedRole} onChanged={load} onSignedOut={signedOut} key={selectedRole} onEdit={()=>run('profile')} onSwitchRole={switchRole} onPickRole={role=>{switchRole();void chooseRole(role).catch(e=>setLinkError(e.message));}} onJoinRole={role=>{setJoinRole(role);switchRole();}} onAskAdministrator={()=>{setChatInitial({administrator:true});setPageId('chats');}} onLogout={()=>send('Выйти')}/>:pageId==='calendar'?<RentalCalendar data={data} role={selectedRole} busy={busy} onOpen={(kind,id)=>openDeal(kind==='job'?'job':'booking',id)}/>:<>{!!pageTabs&&!dealOpen&&(pageTabs.items.length>0||responses>0)&&<ListTabs tabs={pageTabs.tabs} label={pageTabs.label} value={tabNow} counts={tabCount} onChange={tab=>{setTabPick(v=>({...v,[pageId]:tab}));setListed({page:pageId,count:12});scroll.current?.scrollTo({y:0,animated:false});}}/>}{!!pageTabs&&!dealOpen&&pageTabs.items.length>0&&!allIds.length&&!(tabNow==='new'&&responses>0)&&<Text style={[s.meta,{textAlign:'center',marginTop:24}]}>{'«'+(pageTabs.tabs.find(t=>t.id===tabNow)?.label||'')+'»: пока пусто.'}</Text>}{pageId==='catalog'&&cityFlats.length>0&&cityFlats.length<data.properties.length&&<View style={s.listScope}><Text style={[s.meta,{flex:1}]}>{byCity?homeCity+' · '+allIds.length:'Все города · '+allIds.length}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setAllCities(!allCities);setListed({page:pageId,count:12});}} style={({pressed})=>[s.listScopeLink,pressed&&s.disabled]}><Text style={s.listScopeText}>{byCity?'Показать все города':'Только '+homeCity}</Text></Pressable></View>}{dealOpen?deal!.kind!=='review'&&block({id:'deal',sender:'assistant',text:'',block:deal!.kind==='job'?'jobs':'bookings',payload:{ids:[deal!.id],role:selectedRole}}):primary.block&&!ownForm&&block(primary)}{!!primary.block&&!ownForm&&pageId!=='overview'&&hidden>0&&<Button title={'Показать ещё '+Math.min(12,hidden)} secondary disabled={busy} onPress={()=>setListed({page:pageId,count:ids.length+12})}/>}</>}
      {/* The menu is not a place for the last card of the conversation: it shows under every other page. */}
      {pageId!=='account'&&shown.map((m,index)=><View key={m.id} onLayout={event=>{messageY.current[m.id]=event.nativeEvent.layout.y;if(index===shown.length-1&&m.sender==='assistant'&&m.id===scrollMessage.current)scroll.current?.scrollTo({y:Math.max(0,event.nativeEvent.layout.y-12),animated:true});}} style={[s.message,m.sender==='user'?s.user:s.assistant]}>{m.sender==='assistant'&&!!m.text&&<Text style={s.sender}>AiQonaq</Text>}{!!m.text&&<Text selectable style={s.text}>{m.text}</Text>}{m.sender==='assistant'&&block(m)}</View>)}
      {earlier.length>0&&<HistoryFold key={selectedRole||''} messages={earlier} render={m=>block(m as Message)} onClear={()=>{const gone=new Set(earlier.map(m=>m.id));historyEnd.current='';setMessages(prev=>prev.filter(m=>!gone.has(m.id)));}}/>}
      {busy&&<Thinking label="Ожидаем ответ сервера" style={{alignSelf:'flex-start',marginBottom:20}}/>}
      {saveError&&<Text accessibilityRole="alert" style={s.error}>История ещё не сохранена. Проверьте связь; заявки хранятся на сервере.</Text>}
    </ScrollView>
    {flow?<View style={s.composerWrap}>{flow?.questions[flow.index].choices&&<View style={s.buttonRow}>{flow.questions[flow.index].choices!.map(choice=><Button key={choice.value} title={choice.label} secondary disabled={busy} onPress={()=>send(choice.label)}/>)}</View>}{!!flow&&<View style={s.flowProgress}><Text style={s.flowLabel}>Вопрос {flow.index+1} из {flow.questions.length}</Text><View style={s.buttonRow}>{flow.index>0&&<Button title="Назад" secondary disabled={busy} onPress={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}/>}<Button title="Стоп" secondary disabled={busy} onPress={()=>send('Стоп')}/></View></View>}<View style={s.composer}><TextInput ref={composer} accessibilityLabel="Ваш ответ" placeholder="Ваш ответ…" placeholderTextColor={C.muted} value={input} onChangeText={setInput} style={s.input} maxLength={2500} multiline submitBehavior="submit" onSubmitEditing={()=>send()} editable={ready&&!busy}/><Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" accessibilityState={{disabled:!ready||busy||!input.trim()}} disabled={!ready||busy||!input.trim()} onPress={()=>send()} style={[s.send,(!input.trim()||busy)&&s.disabled]}><Text style={s.sendText}>{busy?'Ждите':'Отправить'}</Text></Pressable></View><Text style={s.footnote}>Данные формы отправятся после проверки и подтверждения.</Text></View>:null}</>}</View></PageTransition></View>}</View>
  </KeyboardAvoidingView></SafeAreaView></ActivityClockProvider>;
}
// What the performer confirms in the report: a home cleaning has its own list by its kind, the rest keep the usual four.
const REPORT_ITEMS=['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Жильё проверено перед заездом'];
function reportItems(job?:Row){const order=homeOrderOf(job?.description);return order?homeChecklist(order):REPORT_ITEMS;}
// photos: the rules of the place ask for photos before and after (a home order always does), so the report cannot go without them.
function Report({items=REPORT_ITEMS,jobId,photos=false,busy,onSubmit}:{items?:string[];jobId?:string;photos?:boolean;busy:boolean;onSubmit:(body:Row)=>void}){
  const [checks,setChecks]=useState(()=>items.map(()=>false)),[report,setReport]=useState(''),[before,setBefore]=useState(0),[after,setAfter]=useState(0),need=photos&&!!jobId&&(!before||!after);
  return <View style={[s.card,{gap:8}]}>{photos&&!!jobId&&<><JobPhotos jobId={jobId} phase="before" role="cleaner" title="Фото до уборки" disabled={busy} onCount={setBefore}/><JobPhotos jobId={jobId} phase="after" role="cleaner" title="Фото после уборки" disabled={busy} onCount={setAfter}/></>}{items.map((label,i)=><Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked:checks[i],disabled:busy}} disabled={busy} onPress={()=>setChecks(prev=>prev.map((v,k)=>k===i?!v:v))} style={s.keyval}><Text style={s.text}>{checks[i]?'☑':'☐'}  {label}</Text></Pressable>)}<TextInput accessibilityLabel="Текст отчёта" style={s.field} placeholder="Что сделано, есть ли замечания?" placeholderTextColor={C.muted} multiline value={report} onChangeText={setReport} maxLength={1500} editable={!busy}/><SwipeConfirm label={'Проведите: отправить отчёт '+(photos?'заказчику':'владельцу')} disabled={busy||need||checks.some(v=>!v)||!report.trim()} onConfirm={()=>onSubmit({checklist:checks,report,...(items!==REPORT_ITEMS?{items}:{})})}/></View>;
}
// Every tap is noted, so a request that follows it lights the loading line (background refreshes do not).
// Bookings and cleanings from now to later, then the past; a group gets its title where it starts.
function byTime(ids:string[],items:Row[]):{id:string;title:string}[]{
 const chosen=ids.map(id=>items.find((item:Row)=>item.id===id)).filter(Boolean) as Row[];
 if(chosen.length<2)return ids.map(id=>({id,title:''}));
 return groupRecords(chosen,Math.floor(Date.now()/1000)).map((item,i,all)=>({id:item.id,title:item._group!==all[i-1]?._group?recordGroupLabels[item._group]:''}));
}
// The archive of the owner's «Заявки»: newest first, a title where a month starts («Ноябрь 2026»).
function byMonth(ids:string[],items:Row[]):{id:string;title:string}[]{
 const chosen=(ids.map(id=>items.find((item:Row)=>item.id===id)).filter(Boolean) as Row[]).sort((a,b)=>b.start-a.start);
 const month=(at:number)=>{const t=new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',month:'long',year:'numeric'}).replace(/\s*г\.?$/,'');return t.charAt(0).toUpperCase()+t.slice(1);};
 return chosen.map((item,i)=>({id:item.id,title:i===0||month(chosen[i-1].start)!==month(item.start)?month(item.start):''}));
}
// The status bar is set once, here, for every screen: a screen that set none (the sign-in one) was left with the
// system's white signs on a light page after the splash had gone.
// Where the person is starts being known at launch, before sign-in, if they allowed it before (no prompt here).
export default function App(){return <SafeAreaProvider><View style={{flex:1}} onStartShouldSetResponderCapture={markGesture}><EntryStatusBar/><Chat/><LoadingBar/><EntrySplash/></View></SafeAreaProvider>;}
