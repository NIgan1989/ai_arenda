import {dateText,forms,lang,t,t as tr,tParts} from '../lib/i18n';
import React,{Fragment,useEffect,useRef,useState} from 'react';
import {Thinking} from './src/Thinking';
import {cancelVoice} from './src/useVoice';
import {SwipeConfirm} from './src/SwipeConfirm';
import {LegalAccept,type LegalState} from './src/LegalAccept';
import {JobPhotos,JobRating,DamageClaim} from './src/JobPhotos';
import {groupRecords,recordGroupLabels,recordGroup} from '../lib/record-groups';
import {bookingTab,bookingTabs,ownerRequestTab,ownerRequestTabs} from '../lib/booking-filters';
import {pruneHistory,splitAt} from '../lib/conversation-history';
import {OverviewBoard,HistoryFold} from './src/OverviewBoard';
import {ownerJobTab,ownerJobTabs,cleanerJobTab,cleanerJobTabs,tabCounts,firstTab} from '../lib/job-filters';
import {ListTabs} from './src/ListTabs';
import {useFonts} from 'expo-font';
import {BrandEmpty,BrandMoment,celebrate} from './src/BrandMoments';
import {recordSpan} from '../lib/record-span';
import {checkinOpen,checkinOpensLabel} from '../lib/checkin-window';
import {lateOpen,lateNote,lateLabel} from '../lib/late-arrival';
// How often the background refresh of the app also brings the catalogue of places (see load).
const CATALOG_EVERY=5*60*1000;
// The stay as «Задерживаюсь на час» reads it (lib/late-arrival.ts).
const lateStay=(b:Record<string,any>)=>({start:b.start,end:b.end,arrival_eta:b.terms?.arrival_eta,late_count:b.terms?.late_count});
import { Animated,AppState,BackHandler,KeyboardAvoidingView,Linking,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { SafeAreaProvider,SafeAreaView } from 'react-native-safe-area-context';
import {NativeChats,type NativeChatInitial} from './src/NativeChats';
import {StayRequest,CleaningRequest,HomeCleaningOrder} from './src/StayRequest';
import {KeyboardBar,RevealProvider,useKeyboardReveal} from './src/Keyboard';
import {AnswerSuggest} from './src/AddressSuggest';
import {HOME_TYPE,HOME_DAMAGE_WINDOW,homeCancel,homeCancelLine,homeChecklist,homeOrderOf} from '../lib/home-cleaning';
import {targetPin,type MapTarget} from './src/map-memory';
import {DealCard,RecordFacts} from './src/RecordCard';
import {bookingThread,cleaningThread,cleanerThreads,guestThreads,jobThread,ownerThreads} from '../lib/process-threads';
import {guestLine} from '../lib/guest-line';
import {payDue} from '../lib/guest-trips';
import {canRate,rateClosed} from '../lib/review-window';
import {prepayLabel,prepayOf} from '../lib/prepay';
import {PayTo,Receipts} from './src/PayoutDetails';
import {isHome,wordsOf} from '../lib/stay-words';
import {useProcessLinks} from './src/use-process-links';
import {registerPush,setupNotifications,usePushTaps} from './src/NativePush';
import {resolveProcessLink} from './src/deep-links';
import { API_URL,ApiError,StaleSessionError,getSessionGeneration,isOffline,onLegalRequired,onServerReach,request,restoreLastRole,restoreSession,saveLastRole,saveSession,setWorkspaceRole } from './src/api';
import { baseQuestions,cleanerQuestions,date,empty,labels,money,parseDate,propertyQuestions,uid,type Flow,type Message,type Question,type Role,type Row } from './src/model';
import { C,s,type } from './src/styles';
import { T } from './src/tokens';
import {ActivityClockProvider,ActivityTimer} from './src/ActivityTimer';
import {ApprovalCard} from './src/ApprovalCard';
import {PropertyControl,upcomingStays,readinessLabels} from './src/PropertyControl';
import {BookingChanges} from './src/BookingChanges';
import {StayReview} from './src/StayReview';
import {StayHandover,CheckinPhotos,StayEvidence,handoverLine} from './src/StayHandover';
import {handoverState} from '../lib/stay-handover-text';
import {MapChatsButton,SignInButton} from './src/WorkspaceNavigation';
import {sheetName} from '../lib/sheet-title';
import {OwnProperties} from './src/OwnProperties';
import {PropertyListing} from './src/PropertyListing';
// The line above a place opened from the map, in the words of its kind.
const placeSaid=(type?:string)=>type==='banya'?tr('Баня, выбранная на карте.'):type==='sauna'?tr('Сауна, выбранная на карте.'):type==='banquet'?tr('Зал, выбранный на карте.'):type==='cafe'?tr('Кафе, выбранное на карте.'):tr('Жильё, выбранное на карте.');
import {PropertyEdit} from './src/PropertyEdit';
import {PropertyQuick} from './src/PropertyQuick';
import {AddressField} from './src/AddressSuggest';
import {CleanerCard} from './src/ProfileEditor';
import {AccountControl} from './src/AccountControl';
import {NoticeToast} from './src/Notices';
import {freshEvents,noticeOpen} from '../lib/notice-feed';
import {RentalCalendar} from './src/RentalCalendar';
import {RoleEntry,roleNames,rolePages,intentRole} from './src/RoleEntry';
import {MapAccountButton,RolePlate,RoleSheet,hideRolePlate,showRolePlate} from './src/RoleSwitch';
import {useFavorites} from './src/Favorites';
import {MapHome,type MapStay} from './src/MapHome';
import {stayISO,occasionTitle} from './src/ai-request';
import {banquetWhen} from '../lib/map-search-request';
import {OfflineNotice} from './src/OfflineNotice';
import {CallCenter} from './src/Calls';
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
import {startLang,useLang} from './src/lang';
import {nearestCity} from './src/here-rules';
import {refundLeft,FREE_DAILY,FREE_HOURLY} from '../lib/cancellation';
import {Photo} from './src/ListingMedia';

// What cancelling costs, in the words of the confirmation: the server counts it by the guest offer (lib/cancellation.ts).
function cancelLine(c:Row|null|undefined,owner:boolean,paid:number){
 if(!c||(!paid&&!c.deposit))return tr('Оплаты не было, возвращать нечего');
 const deposit=c.deposit?'. '+tr('Депозит {sum} возвращается полностью',{sum:money(c.deposit)}):'',kept=money(c.withheld),back=money(c.refund);
 if(c.withheld)return (owner?(c.refund?tr('У вас остаётся {kept}, гостю нужно вернуть {back}',{kept,back}):tr('У вас остаётся {kept}',{kept})):tr('Бесплатная отмена уже закончилась: владельцу остаётся {kept}, вам вернут {back}',{kept,back}))+deposit;
 return (owner?tr('Гостю нужно вернуть всю оплату: {back}',{back}):tr('Вам вернут всю оплату: {back}',{back}))+deposit;
}

function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  const [focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={(e:any)=>{if(Platform.OS!=='web'||e?.target?.matches?.(':focus-visible'))setFocused(true);}} onBlur={()=>setFocused(false)} style={({pressed})=>[s.button,secondary&&s.secondary,focused&&s.focusRing,(disabled||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
}
// The free cancellation of a stay as the guest offer says it (lib/cancellation.ts): a request is free until the owner
// confirms it; a confirmed stay is free until a day before (two hours before an hourly one), a hall always.
export function freeCancelLine(quote:Row,mode:string,now=Math.floor(Date.now()/1000)){
  if(['banquet','cafe'].includes(quote?.kind))return tr('Отмена бесплатно: вся оплата возвращается');
  const until=Number(quote?.start)-(mode==='hourly'?FREE_HOURLY:FREE_DAILY);
  return until>now?tr('Отмена бесплатно до {v}',{v:date(until)}):tr('Отмена бесплатно, пока владелец не подтвердил');
}
function BookingReview({flow,photo,busy,done,result,onConfirm,onEdit}:{flow:Flow;photo?:string;busy:boolean;done?:boolean;result?:string;onConfirm:(quote:Row)=>void;onEdit:()=>void}){
  const [quote,setQuote]=useState<Row|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[attempt,setAttempt]=useState(0);
  const [more,setMore]=useState(false);
  useEffect(()=>{let active=true;if(done)return;setChecking(true);setError('');request('/api/quote',{...flow.answers,...flow.extra}).then(value=>{if(active)setQuote(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[flow,attempt,done]);
  if(done)return <View style={s.card}><Text style={s.badge}>{result||tr('Сохранено')}</Text><Text style={s.meta}>{result===tr('Изменено')||result==='Изменено'?tr('Этот расчёт закрыт. Продолжите ввод в разговоре.'):tr('Заявка и её статус доступны в «Мои брони».')}</Text></View>;
  // The final action confirms the dates, price, deposit and house rules shown in the review.
  // A home that confirms by itself still leaves a risky request to its owner (lib/service.ts risk.held), so «сразу» is not promised.
  const guests=Number(quote?.guests)||1,auto=!!quote?.policy?.auto_confirm,deposit=Number(quote?.policy?.deposit)||0;
  const hall=['banquet','cafe'].includes(quote?.kind),bath=hall||['banya','sauna'].includes(quote?.kind),extra=Number(quote?.extraGuests)||0;
  // A banquet hall: the slot of the day, what it is for, the price per guest and the least order.
  const perGuest=Number(quote?.policy?.extra_guest_price)||0,least=Number(quote?.policy?.included_guests)||0,occasion=hall?occasionTitle(String(flow.answers.occasion||'')):'';
  const guestsText=guests+' '+forms(guests,'гость','гостя','гостей'),depositSum=money(deposit),minutes=quote?.cleaningMinutes;
  // The place comes first with its photo, as on the big rental apps: the guest sees what is being booked.
  // As in the concept (Mobbin: Airbnb, Booking): the place with its photo, then one row for each thing the guest checks,
  // each with its own button, the free cancellation as a green line and the send by a swipe.
  const unit=tr('Итого');
  const when=quote?(hall?[occasion&&flow.answers.occasion!=='other'?occasion:'',banquetWhen(new Date((Number(quote.start)+18000)*1000).toISOString().slice(0,16))].filter(Boolean).join(' · '):date(quote.start)+' → '+date(quote.end)):'';
  const rated=Number(quote?.rating?.count)>0?'★ '+Number(quote!.rating.average).toFixed(1).replace('.',',')+' ('+quote!.rating.count+')':'';
  return <View style={[s.card,rv.card]}><View style={rv.head}>{!!photo&&<View style={rv.thumb}><Photo id={photo} alt={tr('{title}, фото',{title:String(quote?.title||'')})} fill/></View>}<View style={rv.title}><Text accessibilityRole="header" numberOfLines={2} style={rv.name}>{quote?.title||tr('Условия бронирования')}</Text>{!!quote&&<Text numberOfLines={1} style={rv.sub}>{[rated,guestsText].filter(Boolean).join(' · ')}</Text>}</View></View>
    {checking&&<View style={s.progressRow}><Thinking size="sm"/><Text style={s.meta}>{tr('Проверяю стоимость и свободный интервал…')}</Text></View>}
    {!!error&&<><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title={tr('Проверить ещё раз')} secondary disabled={busy||checking} onPress={()=>setAttempt(v=>v+1)}/></>}
    {quote&&!error&&!checking&&<>
      <View style={rv.row}><View style={rv.grow}><Text style={rv.key}>{hall?tr('Дата'):tr('Даты')}</Text><Text style={rv.value}>{when}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={hall?tr('Изменить'):tr('Изменить даты')} disabled={busy} onPress={onEdit} style={({pressed})=>[rv.small,pressed&&rv.pressed]}><Text style={rv.smallText}>{tr('Изменить')}</Text></Pressable></View>
      <View style={rv.row}><View style={rv.grow}><Text style={rv.key}>{bath?tr('Стоимость'):unit}</Text><Text style={rv.value}>{money(quote.amount)}</Text>{!!quote.repeat&&<Text style={rv.note}>{tr('Скидка постоянного гостя −{n}%',{n:quote.repeat.percent})}{' · '+tr('без неё {price}',{price:money(quote.repeat.regular*Number(quote.periods))})}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={more?tr('Свернуть'):tr('Правила и расчёт')} accessibilityState={{expanded:more}} disabled={busy} onPress={()=>setMore(v=>!v)} style={({pressed})=>[rv.small,pressed&&rv.pressed]}><Text style={rv.smallText}>{more?tr('Свернуть'):tr('Расчёт')}</Text></Pressable></View>
      {more&&<View style={rv.more}>{!hall&&<Text style={s.meta}>{quote.periods} × {money(quote.price)} · {tr(quote.unitLabel)}. {bath?tr('После вас {minutes} мин. на уборку.',{minutes}):tr('После выезда {minutes} мин. на подготовку жилья.',{minutes})}</Text>}{!!quote.policy.house_rules&&<Text style={s.meta}>{quote.policy.house_rules}</Text>}</View>}
      {hall&&perGuest>0&&<Text style={s.meta}>{tr('{price} за гостя × {n}.',{price:money(perGuest),n:Math.max(guests,least)})}{guests<least?' '+tr('Наименьший заказ зала: {least} гостей.',{least}):''}{' '}{tr('При отмене вся оплата возвращается: заведение может заявить только расходы на ваш заказ, подтверждённые документами.')}</Text>}
      {bath&&!hall&&extra>0&&<Text style={s.meta}>{tr('В цене гостей: {included}. Доплата за ещё {extra}: {sum}.',{included:guests-extra,extra,sum:money(Number(quote.guestSurcharge)*Number(quote.periods))})}</Text>}
      {deposit>0&&<View style={rv.row}><View style={rv.grow}><Text style={rv.key}>{tr('Депозит')}</Text><Text style={rv.value}>{hall?tr('{sum}, вернётся после мероприятия',{sum:depositSum}):bath?tr('{sum}, вернётся после ухода',{sum:depositSum}):tr('{sum}, вернётся после выезда',{sum:depositSum})}</Text></View></View>}
      <Text style={rv.free}>{'✓ '+freeCancelLine(quote,String(flow.answers.billingMode||''))}</Text>
      <View style={rv.calm}><Text style={rv.calmText}>{auto?tr('Обычно бронь подтверждается сразу, иначе владелец ответит за 15 минут.'):tr('Деньги не спишутся, пока владелец не ответит. Он ответит за 15 минут.')}</Text></View>
      {/* One gesture sends the request, as every main confirmation of the app («Проведите»). */}
      <SwipeConfirm label={auto?tr('Проведите: забронировать за {v}',{v:money(quote.amount)}):tr('Проведите: отправить заявку')} disabled={busy} onConfirm={()=>onConfirm(quote)}/>
      <Text style={rv.agree}>{hall?tr('Нажимая кнопку, вы соглашаетесь с датой, ценой на гостя, депозитом и правилами зала.'):bath?tr('Нажимая кнопку, вы соглашаетесь с датами, тарифом, депозитом и правилами объекта.'):tr('Нажимая кнопку, вы соглашаетесь с датами, тарифом, депозитом и правилами жилья.')}</Text>
    </>}
    {(!quote||!!error)&&!checking&&<View style={s.buttonRow}><Button title={hall?tr('Изменить'):tr('Изменить даты')} secondary disabled={busy} onPress={onEdit}/></View>}
  </View>;
}
const rv=StyleSheet.create({
  card:{gap:0},
  head:{flexDirection:'row',alignItems:'center',gap:12,paddingBottom:12},title:{flex:1,minWidth:0,gap:2},
  name:{...type.subtitle,color:C.ink,fontWeight:'700'},sub:{...type.caption,color:C.muted},
  thumb:{width:64,height:64,borderRadius:T.radius.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.line},
  grow:{flex:1,minWidth:0,gap:2},
  key:{...type.caption,color:C.muted},value:{...type.body,color:C.ink,fontWeight:'600'},note:{...type.caption,color:C.muted},
  small:{minHeight:36,paddingHorizontal:12,borderRadius:T.radius.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},
  smallText:{...type.label,color:C.ink,fontWeight:'600'},pressed:{opacity:.6},
  more:{gap:4,paddingBottom:12},
  free:{...type.caption,alignSelf:'flex-start',marginTop:4,marginBottom:12,paddingHorizontal:8,paddingVertical:4,borderRadius:T.radius.sm,overflow:'hidden',backgroundColor:C.successSoft,color:C.success,fontWeight:'600'},
  calm:{padding:12,marginBottom:12,borderRadius:T.radius.md,backgroundColor:C.surfaceAlt},calmText:{...type.caption,color:C.inkSoft},
  agree:{...type.caption,color:C.muted,marginTop:8}
});
// «+7 701 ••• 45 67»: the number the password goes with, as the concept shows where the code was sent.
function maskedPhone(d:string){return d.length<10?d:'+'+d.slice(0,d.length-10)+' '+d.slice(-10,-7)+' ••• '+d.slice(-4,-2)+' '+d.slice(-2);}
const au=StyleSheet.create({
  box:{gap:12,marginTop:8},
  ask:{...type.subtitle,color:C.ink,fontWeight:'700'},
  sent:{...type.label,color:C.muted},
  big:{minHeight:64,paddingHorizontal:16,borderRadius:T.radius.lg,borderWidth:2,borderColor:C.accentLine,backgroundColor:C.surface,...type.title,color:C.ink,fontWeight:'700',fontVariant:['tabular-nums'],letterSpacing:.5},
  link:{minHeight:T.control.touch,alignItems:'center',justifyContent:'center'},
  linkText:{...type.label,color:C.accent,fontWeight:'600'},
});
function Auth({onSubmit,busy,titled=true}:{titled?:boolean;onSubmit:(mode:string,phone:string,password:string,name?:string,city?:string,recovery?:string)=>Promise<void>;busy:boolean}){
  const [mode,setMode]=useState('login'),[phone,setPhone]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[city,setCity]=useState(''),[recovery,setRecovery]=useState(''),[error,setError]=useState('');
  // «Забыли пароль?»: first the number, then the code that came in Telegram or that the administrator dictated, and a new password.
  const [codeSent,setCodeSent]=useState(''),[sending,setSending]=useState(false);
  const [accepted,setAccepted]=useState(false);const legal=(path:string)=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>setError(t('Не удалось открыть документ.')));
  const go=(next:string)=>{setError('');setPassword('');setRecovery('');setCodeSent('');setMode(next);};
  const askCode=async()=>{if(sending)return;setError('');setSending(true);try{const r=await request('/auth/reset-request',{phone});setRecovery('');setCodeSent(String(r.message||t('Код отправлен.')));}catch(e){setError(isOffline(e)?t('Нет связи. Проверьте интернет и повторите.'):(e as Error).message);}finally{setSending(false);}};
  const forgot=mode==='forgot',waiting=forgot&&!codeSent,locked=busy||sending;
  // Sign-in as in the concept: one question on the screen. First the number in a large field, then the password.
  const [step,setStep]=useState<'phone'|'password'>('phone'),digits=phone.replace(/\D/g,''),numberReady=digits.length>=10;
  const toPassword=()=>{if(!numberReady||locked)return;setError('');setStep('password');};
  const login=()=>{setError('');onSubmit('login',phone,password).then(()=>setPassword('')).catch(e=>setError(isOffline(e)?t('Нет связи. Проверьте интернет и повторите.'):e.message));};
  if(mode==='login')return <View style={au.box}>
    {step==='phone'?<>
      <Text style={au.ask}>{t('Ваш номер телефона')}</Text>
      <TextInput accessibilityLabel={t('Номер телефона')} style={au.big} placeholder="+7 777 123 45 67" placeholderTextColor={C.lineStrong} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={30} editable={!locked} returnKeyType="next" onSubmitEditing={toPassword}/>
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Button title={t('Продолжить')} disabled={locked||!numberReady} onPress={toPassword}/>
    </>:<>
      <Text style={au.ask}>{t('Введите пароль')}</Text>
      <Text style={au.sent}>{maskedPhone(digits)}{' · '}<Text accessibilityRole="link" style={s.inlineLink} onPress={locked?undefined:()=>{setPassword('');setError('');setStep('phone');}}>{t('Изменить номер')}</Text></Text>
      <TextInput accessibilityLabel={t('Пароль')} style={au.big} placeholder={t('От 10 символов')} placeholderTextColor={C.lineStrong} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={128} editable={!locked} autoFocus returnKeyType="go" onSubmitEditing={()=>{if(password&&!locked)login();}}/>
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Button title={t('Войти')} disabled={locked||!password} onPress={login}/>
      <Pressable accessibilityRole="button" disabled={locked} onPress={()=>go('forgot')} style={au.link}><Text style={au.linkText}>{t('Забыли пароль?')}</Text></Pressable>
    </>}
    <Pressable accessibilityRole="button" disabled={locked} onPress={()=>{setStep('phone');go('register');}} style={au.link}><Text style={au.linkText}>{t('Создать новый аккаунт')}</Text></Pressable>
  </View>;
  const title=mode==='register'?t('Один аккаунт для всех устройств'):forgot?t('Новый пароль'):t('С возвращением');
  // A new password goes the way sign-in goes: one question, large fields, the other ways as plain links.
  const plain=forgot,field=plain?au.big:s.field,link=(title:string,onPress:()=>void)=>plain?<Pressable accessibilityRole="button" disabled={locked} onPress={onPress} style={au.link}><Text style={au.linkText}>{title}</Text></Pressable>:<Button secondary title={title} disabled={locked} onPress={onPress}/>;
  return <View style={plain?au.box:s.card}>
    {(titled||mode!=='login')&&<Text style={plain?au.ask:s.cardTitle}>{title}</Text>}
    <Text style={s.meta}>{forgot?(codeSent||t('Укажите номер, на который зарегистрирован аккаунт. Мы пришлём код для смены пароля.')):t('Номер телефона и пароль те же, что на сайте. Брони и чаты общие.')}</Text>
    {mode==='register'&&<><Text style={s.fieldLabel}>{t('Имя')}</Text><TextInput accessibilityLabel={t('Имя')} style={s.field} value={name} onChangeText={setName} maxLength={100} editable={!locked}/>{locked?<><Text style={s.fieldLabel}>{t('Город')}</Text><TextInput accessibilityLabel={t('Город')} style={s.field} value={city} maxLength={80} editable={false}/></>:<AddressField kind="city" label={t('Город')} value={city} onChange={setCity} max={80} placeholder={t('Например, Алматы')} labelStyle={s.fieldLabel} inputStyle={s.field}/>}</>}
    <Text style={s.fieldLabel}>{t('Номер телефона')}</Text><TextInput accessibilityLabel={t('Номер телефона')} style={field} placeholder="+7 777 123 45 67" placeholderTextColor={C.muted} value={phone} onChangeText={v=>{setPhone(v);if(codeSent)setCodeSent('');}} keyboardType="phone-pad" autoComplete="tel" maxLength={30} editable={!locked}/>
    {forgot&&!!codeSent&&<><Text style={s.fieldLabel}>{t('Код из сообщения')}</Text><TextInput accessibilityLabel={t('Код из сообщения')} style={field} placeholder={t('6 цифр')} placeholderTextColor={C.muted} value={recovery} onChangeText={v=>setRecovery(v.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!locked}/></>}
    {!waiting&&<><Text style={s.fieldLabel}>{forgot?t('Новый пароль'):t('Пароль')}</Text><TextInput accessibilityLabel={t('Пароль')} style={field} placeholder={t('От 10 символов')} placeholderTextColor={C.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode==='login'?'current-password':'new-password'} maxLength={128} editable={!locked}/></>}
    {mode==='register'&&<View style={{flexDirection:'row',alignItems:'flex-start',gap:12,marginTop:12}}><Pressable accessibilityRole="checkbox" accessibilityLabel={t('Принимаю соглашение и даю согласие на обработку данных')} accessibilityState={{checked:accepted,disabled:locked}} disabled={locked} onPress={()=>setAccepted(v=>!v)} hitSlop={10} style={[s.checkBox,accepted&&s.checkBoxOn]}>{accepted&&<Text style={s.checkTick}>✓</Text>}</Pressable><Text style={[s.meta,{flex:1}]} onPress={locked?undefined:()=>setAccepted(v=>!v)}>{tParts(tr('Принимаю {terms} и даю {consent}')).map((part,i)=>typeof part==='string'?part:part.slot==='terms'?<Text key={i} accessibilityRole="link" style={s.inlineLink} onPress={()=>legal('/terms')}>{t('Пользовательское соглашение')}</Text>:<Text key={i} accessibilityRole="link" style={s.inlineLink} onPress={()=>legal('/privacy/consent')}>{t('согласие на обработку персональных данных')}</Text>)}{lang()!=='ru'&&t(' (документы на русском языке)')}</Text></View>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {waiting?<Button title={sending?t('Отправляю…'):t('Получить код')} disabled={locked||!phone.trim()} onPress={askCode}/>
    :<Button title={mode==='register'?t('Создать аккаунт'):forgot?t('Сменить пароль и войти'):t('Войти')} disabled={locked||mode==='register'&&!accepted||forgot&&recovery.length!==6} onPress={()=>{setError('');onSubmit(forgot?'reset':mode,phone,password,name,city,recovery).then(()=>setPassword('')).catch(e=>setError(isOffline(e)?t('Нет связи. Проверьте интернет и повторите.'):e.message));}}/>}
    {forgot&&!!codeSent&&link(sending?t('Отправляю…'):t('Прислать код ещё раз'),askCode)}
    {mode==='login'&&<Button secondary title={t('Забыли пароль?')} disabled={locked} onPress={()=>go('forgot')}/>}
    {mode==='login'||mode==='register'?<Button secondary title={mode==='register'?t('Уже есть аккаунт'):t('Создать новый аккаунт')} disabled={locked} onPress={()=>go(mode==='register'?'login':'register')}/>
    :link(t('Назад ко входу'),()=>go('login'))}
  </View>;
}

function Chat(){
  // Where the person is starts being known at launch, before sign-in, if they allowed it before (no prompt here).
  useEffect(()=>{startHere();},[]);
  const [data,setData]=useState<Row>(empty),[messages,setMessages]=useState<Message[]>([]),[flow,setFlow]=useState<Flow|null>(null),[actor,setActor]=useState<Role>('guest');
  const [rolesOpen,setRolesOpen]=useState(false);
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[online,setOnline]=useState(false),[historyReady,setHistoryReady]=useState(false),[saveError,setSaveError]=useState(false);
  const scrollY=useRef(0),scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null),locked=useRef(false),session=useRef(false),pending=useRef(''),seen=useRef(new Set<string>());
  // The field being typed in comes above the keyboard once, smoothly; the page never jumps (src/Keyboard.tsx).
  const revealField=useKeyboardReveal(scroll,scrollY);
  const [linkError,setLinkError]=useState('');
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
  // A new message is brought into view once, where it starts; a form growing as the person types must not pull them back to its top.
  const scrolledTo=useRef<Record<string,number>>({});
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
    const text=open?tr('Обращение уже открыто: «{v}». ИИ-администратор следит за ответом. Что добавить?',{v:String(open.description).slice(0,200)}):kind==='job'?tr('Что произошло? Сообщение получит другой участник задания.'):tr('Что произошло? Сообщение получит другая сторона бронирования.');
    beginFlow('issue',[{key:'issue',text,label:open?tr('Дополнение'):tr('Проблема')}],{},endpoint,kind==='job'?(role==='owner'?'owner-jobs':'my-jobs'):'bookings',role,{action:'issue'});
  }
  // A booking, a cleaning or a task opened from the map, the calendar or a link: the sheet shows that one card and what
  // was done from it, not the whole overview. `after` is the last message before it was opened.
  const [deal,setDeal]=useState<{kind:'booking'|'job'|'review';id:string;after:string}|null>(null),dealRef=useRef('');
  // How tall the open card of a deal is: the map puts the pin of that deal above it (MapHome cover). Opening a deal
  // forgets the height of the sheet that was open before, so the map waits for this card to be measured.
  const [dealCover,setDealCover]=useState(0);
  // A new event of this role, said over the map until it is read or eight seconds pass; `more` came with it. What the
  // AI did alone is not said: it is in the journal. menuStart: the menu opens on its notices when the event has no card, and on «Оплата услуг» for a notice about service fees.
  const [toast,setToast]=useState<{notice:Row;more:number}|null>(null),[menuStart,setMenuStart]=useState<'notices'|'billing'|'payout'|undefined>();
  useEffect(()=>{if(pageId!=='account')setMenuStart(undefined);},[pageId]);
  useEffect(()=>{setToast(null);setTabPick({});},[userId,selectedRole]);
  useEffect(()=>{if(pageId!=='overview')setDeal(null);},[pageId]);
  useEffect(()=>{dealRef.current=deal&&pageId==='overview'?deal.kind:'';},[deal,pageId]);
  const say=(text:string,block?:string,payload?:Row)=>{const id=uid();scrollMessage.current=id;setMessages(prev=>[...prev,{id,sender:'assistant' as const,text,block,payload}].slice(-120));};
  const processLinks=useProcessLinks({apiUrl:API_URL,ready,accountId:userId||null,blocked:busy||!!flow||chatsActive,onError:message=>setLinkError(message),onOpen:async(link,guard)=>{
    if(locked.current||!session.current||!guard.isCurrent())return;
    setLinkError('');locked.current=true;setBusy(true);
    try{
      const [state,history]=await Promise.all([request('/api/state',undefined,undefined,undefined,link.role),request('/api/conversation',undefined,undefined,undefined,link.role)]);
      if(!session.current||!guard.isCurrent())return;
      const view=resolveProcessLink(link,state,guard.accountId);
      setWorkspaceRole(link.role);activeRoleRef.current=link.role;setData(state);historyEnd.current=pruneHistory(history.messages||[]).at(-1)?.id||'';setMessages(pruneHistory(history.messages||[]));setFlow(history.flow||null);setActor(link.role);setSelectedRole(link.role);setPageId(history.flow?'overview':view.section);setHistoryReady(true);setOnline(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));
      if(history.flow)setLinkError(tr('В этой роли сохранён незавершённый ввод. Завершите или отмените его, затем откройте ссылку повторно.'));else if(view.block)say(tr('Открыто по ссылке.'),view.block,view.payload);
    }finally{locked.current=false;setBusy(false);}
  }});
  // A tap on a push: the card it is about, through the same check as a link; a chat opens its room.
  usePushTaps(link=>{
    if(link.kind==='chat'&&link.role===activeRoleRef.current){setChatInitial(link.roomId?{roomId:link.roomId}:null);setPageId('chats');return;}
    processLinks.acceptURL(link.kind==='link'?link.url:'aiarenda://workspace/'+link.role+'/map');
  });
  const finish=(id:string,result=tr('Сохранено'))=>setMessages(prev=>prev.map(m=>m.id===id?{...m,done:true,result}:m));
  async function signedOut(result?:Row){
    try{await saveSession(null);await saveLastRole(null,null);}finally{session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setData(empty);setMessages([]);setFlow(null);setInput('');setChatInitial(null);setChatsActive(false);if(result?.receipt)setErasureResult(result);}
  }
  // «Избранное» on a home's card; the map's panel keeps its own copy, both follow the state.
  const favorites=useFavorites(data,()=>load());
  // The refresh every 15 seconds brings the catalogue of all places only once in five minutes: it is the biggest part of
  // the state and changes rarely, and every refresh is paid in rows read from the database. Between, the map keeps the list it has.
  const catalogAt=useRef(0);
  async function load(light=false){
    const active=activeRoleRef.current,generation=getSessionGeneration(),withCatalog=!light||Date.now()-catalogAt.current>=CATALOG_EVERY;
    try{const state=await request(active?(withCatalog?'/api/state':'/api/state?catalog=0'):'/api/access');if(activeRoleRef.current!==active||generation!==getSessionGeneration())return;if(active&&withCatalog)catalogAt.current=Date.now();setData(prev=>!active?{...empty,...state}:withCatalog?state:{...state,properties:prev.properties});setOnline(true);return state;}
    catch(error){if(error instanceof StaleSessionError||generation!==getSessionGeneration()||activeRoleRef.current!==active)return;if(active&&error instanceof ApiError&&error.status===403){setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);const access=await request('/api/access');if(generation===getSessionGeneration()&&activeRoleRef.current===null)setData({...empty,...access});}throw error;}
  }
  // `catalog`: the published homes already on the screen, reused when only the role changes (they are the same for
  // every role), so the switch does not wait for the whole catalogue again.
  async function hydrate(role:Role,catalog?:Row[]){
    const generation=getSessionGeneration();setHistoryReady(false);setWorkspaceRole(role);activeRoleRef.current=role;
    const [fetched,history]=await Promise.all([request(catalog?'/api/state?catalog=0':'/api/state',undefined,undefined,undefined,role),request('/api/conversation',undefined,undefined,undefined,role)]);
    if(generation!==getSessionGeneration()||activeRoleRef.current!==role)throw new StaleSessionError();
    const state=catalog?{...fetched,properties:catalog}:fetched;
    setData(state);if(!catalog)catalogAt.current=Date.now();historyEnd.current=pruneHistory(history.messages||[]).at(-1)?.id||'';setMessages(pruneHistory(history.messages||[]));setFlow(history.flow||null);setActor(role);setSelectedRole(role);setPageId(history.flow?'overview':'map');if(history.draftInvalid)setLinkError(tr('Сохранённый ввод не удалось открыть. Начните форму заново; заявки сохранены на сервере.'));setSaveError(false);setOnline(true);(state.notifications||[]).forEach((n:Row)=>seen.current.add(n.id));setHistoryReady(true);seen.current=new Set(state.notifications.map((n:Row)=>n.id));void saveLastRole(state.user?.id||null,role);return state;
    // Push to this phone for the role that opened (src/NativePush.tsx): the system question once per phone.
    void registerPush(role,'once').catch(()=>undefined);
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
  // Another role of the same account: the screen stays, the night plate names the new role while it loads, and on a
  // failure the old role simply stays. The chooser (RoleEntry) is only for an account that has no role yet.
  async function pickRole(role:Role){
    const prev=selectedRole;if(locked.current||!prev||role===prev)return;
    locked.current=true;setBusy(true);setRolesOpen(false);showRolePlate(role);
    const fresh=Date.now()-catalogAt.current<CATALOG_EVERY&&Array.isArray(data.properties)&&data.properties.length>0;
    try{await hydrate(role,fresh?data.properties:undefined);}
    catch(e){if(activeRoleRef.current===role||activeRoleRef.current===null){setWorkspaceRole(prev);activeRoleRef.current=prev;setHistoryReady(true);}if(!(e instanceof StaleSessionError))setLinkError(e instanceof Error?e.message:tr('Не удалось сменить роль. Попробуйте ещё раз.'));}
    finally{locked.current=false;setBusy(false);hideRolePlate();}
  }
  function switchRole(){if(locked.current)return;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setHistoryReady(false);setMessages([]);setFlow(null);setInput('');setData({...empty,user:data.user,profile:data.profile});}
  async function handleError(error:any){
    if(error instanceof StaleSessionError)return;
    if(error instanceof ApiError&&error.status===401&&session.current){
      try{await signedOut();}catch{}setLinkError(tr('Сессия закончилась. Войдите снова.'));
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
  // Telegram messages and the AI administrator's answers come in the language of the app (lib/user-language.ts).
  const appLang=useLang();
  useEffect(()=>{if(userId)void request('/api/language',{lang:appLang}).catch(()=>undefined);},[userId,appLang]);
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
  // A role with documents to accept: the state brings them, a refused action (428) brings a fresh state and the sheet back.
  // «Не сейчас» hides the sheet: the person can still read, chat, change settings or delete the account; new actions wait.
  const [legalLater,setLegalLater]=useState(false);
  useEffect(()=>{onLegalRequired(()=>{setLegalLater(false);void load();});return()=>onLegalRequired(null);});
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
    async function refresh(){if(AppState.currentState!=='active'||locked.current)return;try{const state=await background(()=>load(true));if(!state)return;
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
    if(questions.length){setFlow(next);say(questions[0].text);}else say(tr('Проверьте сведения перед сохранением.'),'review',{flow:next});
  }
  function ensure(role:Role,after:string,state=data,edit=false){
    if(role!==selectedRole){say(tr('Эта задача относится к другой роли. Нажмите «Сменить роль».'));return false;}
    if(!state.user){pending.current=after;say(tr('Чтобы сохранять заявки и продолжать разговор с другого устройства, войдите или создайте аккаунт.'),'auth',{intent:after});return false;}
    const p=state.profile||{},roles=p.roles?JSON.parse(p.roles):[];
    if(!edit&&roles.includes(role))return true;
    const answers={...p,roles:[...new Set([...roles,role])]};
    const questions=[...baseQuestions,...(role==='cleaner'?cleanerQuestions:[])].filter(q=>edit||!answers[q.key]);
    say(role==='cleaner'?tr('Подготовим анкету исполнителя. Назначение на уборку подтверждает заказчик.'):tr('Познакомимся. Я задам несколько коротких вопросов.'));
    beginFlow('profile',questions,answers,'profile',after,role);return false;
  }
  function catalog(state:Row,mode='guest',query=''){
    if((mode==='guest'?'guest':'owner')!==selectedRole){say(tr('Для этой страницы нужно переключить роль.'));return;}
    let items=mode==='guest'?state.properties:state.ownProperties;
    const budget=query.match(/до\s*(\d[\d ]*)\s*(тыс)?/i);let max=budget?Number(budget[1].replace(/ /g,''))*(budget[2]?1000:1):0;
    const people=/двоих/.test(query)?2:Number(query.match(/(\d+)\s*(гост|человек)/i)?.[1]||0);
    const city=items.find((p:Row)=>query.toLowerCase().includes(p.city.toLowerCase()))?.city||state.profile?.city;
    if(mode==='guest')items=items.filter((p:Row)=>(!max||p.price<=max)&&(!people||p.capacity>=people)&&(!city||p.city.toLowerCase()===city.toLowerCase()));
    say(items.length?(mode==='job'?tr('Для какого жилья нужна уборка?'):mode==='owner'?tr('Ваши объекты.'):tr('Посмотрим, что вам подойдёт.')):(mode==='guest'?tr('В этом городе пока нет предложений. Можем посмотреть учебный пример.'):tr('Сначала добавим ваше жильё.')),'properties',{ids:items.map((p:Row)=>p.id),mode});
  }
  // The four answers a booking needs. The map's results already carry all of them; the chat asks for them one by one.
  const bookingQuestions=(property:Row):Question[]=>[{key:'billingMode',text:tr('Какой тариф выбираете? По ночам заезд и выезд строго в часы, указанные владельцем.'),label:tr('Тариф'),choices:[{label:tr('Сутки'),value:'daily'},...(property.policy?.hourly_price?[{label:tr('Почасово'),value:'hourly'}]:[]),...(property.policy?.nightly_price?[{label:tr('По ночам'),value:'nightly'}]:[])]},{key:'start',text:tr('Когда заедете? Напишите дату и время: ДД.ММ.ГГГГ ЧЧ:ММ.'),label:tr('Заезд'),date:true},{key:'end',text:tr('Когда выезжаете? Такой же формат: ДД.ММ.ГГГГ ЧЧ:ММ.'),label:tr('Выезд'),date:true},{key:'guests',text:tr('Сколько будет гостей?'),label:tr('Гостей'),min:1,max:property.capacity}];
  function run(intent:string,state=data){
    const required=intentRole(intent);if(required&&required!==selectedRole){say(tr('Эта задача относится к другой роли. Нажмите «Сменить роль».'));return;}
    if(intent==='properties'){setActor('guest');catalog(state);return;}
    if(intent==='workspace'){if(!state.user){ensure(actor,intent,state);return;}say(tr('Ближайшие события и задачи по вашим данным.'),'workspace',{role:actor});return;}
    if(intent==='property'){
      if(!ensure('owner',intent,state))return;
      say(tr('Расскажите об объекте одним сообщением, остальное заполню сам.'),'property-quick',{});return;
    }
    if(intent==='own-properties'){if(ensure('owner',intent,state)){setActor('owner');catalog(state,'owner');}return;}
    if(intent==='cleaner-profile'){if(ensure('cleaner','jobs',state)){setActor('cleaner');say(tr('Анкета уже сохранена. Посмотрим доступные уборки.'));run('jobs',state);}return;}
    if(intent==='profile'){ensure(actor,'profile-done',state,true);return;}
    if(intent==='profile-done'){say(tr('Профиль сохранён. Чем займёмся дальше?'));return;}
    if(intent==='jobs'||intent==='my-jobs'||intent==='owner-jobs'){
      const role=intent==='owner-jobs'?'owner':'cleaner';if(!ensure(role,intent,state))return;setActor(role);
      // A list that has its own page opens that page instead of repeating the same cards under the current one.
      const listPage=rolePages[role].find(p=>p.intent===intent);if(listPage&&selectedRole===role){setPageId(listPage.id);return;}
      const items=state.jobs.filter((j:Row)=>role==='owner'?j.owner_id===state.user.id:intent==='my-jobs'?j.assigned_to===state.user.id||state.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===state.user.id):j.status==='open'&&j.end>Date.now()/1000&&(!state.profile?.city||j.city.toLowerCase()===state.profile.city.toLowerCase()));
      say(items.length?(intent==='jobs'?tr('Вот доступные уборки. Адрес появится после назначения.'):tr('Вот ваши задания и их текущий статус.')):tr('Сейчас заданий по этому запросу нет.'),'jobs',{ids:items.map((j:Row)=>j.id),role});return;
    }
    // Уборка своего жилья (не сдаётся): заказывает только владелец.
    if(intent==='home-cleaning'||intent.startsWith('home-cleaning:')){
      if(!state.user){pending.current=intent;say(tr('Чтобы заказать уборку, войдите или создайте аккаунт.'),'auth',{intent});return;}
      // Только владелец (решение 2026-11-18): гостю и исполнителю подсказываем, где это.
      if(selectedRole!=='owner'){say(tr('Уборку своего жилья заказывают в роли владельца: «Сменить роль» → «Владелец» → «Жильё» → «Мой дом: только уборка».'));return;}
      say(tr('Закажем уборку вашего дома.'),'home-order',{propertyId:intent.slice(14)||undefined,requestKey:uid()});return;
    }
    if(intent==='job'){
      if(!ensure('owner',intent,state))return;setActor('owner');catalog(state,'job');return;
    }
    if(intent.startsWith('book:')){
      if(!ensure('guest',intent,state))return;const property=state.properties.find((p:Row)=>p.id===intent.slice(5));
      if(!property){say(tr('Жильё больше недоступно. Обновите предложения.'));return;}
      say(tr('Выберите время проживания в «{title}».',{title:property.title}),'stay-form',{propertyId:property.id,requestKey:uid()});return;
    }
    if(intent.startsWith('job:')){
      if(!ensure('owner',intent,state))return;const id=intent.slice(4);if(!state.ownProperties.some((p:Row)=>p.id===id)){say(tr('Жильё недоступно.'));return;}
      if(state.ownProperties.find((p:Row)=>p.id===id)?.details?.type===HOME_TYPE){say(tr('Закажем уборку вашего дома.'),'home-order',{propertyId:id,requestKey:uid()});return;}
      say(tr('Когда и что нужно убрать?'),'job-form',{propertyId:id});return;
    }
    if(intent==='bookings'||intent==='owner-bookings'){
      const role=intent==='owner-bookings'?'owner':'guest';if(!ensure(role,intent,state))return;setActor(role);
      const items=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===state.user.id:b.guest_id===state.user.id);
      say(items.length?tr('Ваши бронирования. Время Казахстана.'):tr('У вас пока нет бронирований.'),'bookings',{ids:items.map((b:Row)=>b.id),role});return;
    }
    if(intent==='demo'){if(!state.user){ensure('guest',intent,state);return;}say(tr('Добавлю две учебных объекта и уборку. Их увидите только вы. Реальных заездов и выплат по ним нет.'),'confirm',{path:'demo',body:{},after:selectedRole==='owner'?'own-properties':selectedRole==='cleaner'?'jobs':'properties',title:tr('Добавить учебные данные')});return;}
    if(intent==='notifications'){if(!state.user){ensure('guest',intent,state);return;}say(state.notifications.length?tr('Последние события:'):tr('Пока новых событий нет.'),'notifications');return;}
  }
  // Заказ уборки на дом. Ведётся он в кабинете владельца («Мой дом»): гостя переводим туда и открываем заказ.
  async function orderHome(body:Row,id:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/api/home-cleaning',body,undefined,id+':home-cleaning');finish(id,result.message||tr('Заказ принят'));
      if(activeRoleRef.current!=='owner')await hydrate('owner');else await load();
      say(result.message||tr('Заказ принят. Ищем исполнителя.'));
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
      say(result.message||tr('Сохранено.'));
      try{const state=await load();
        // A payment that went through is marked: the night plate, the crown and its rays (BrandMoments.tsx).
        if(path==='operations/payment-test'&&body.bookingId){const b=state?(state.bookings||[]).find((x:Row)=>x.id===body.bookingId):null;const was=(data.bookings||[]).find((x:Row)=>x.id===body.bookingId),due=was?Math.max(0,was.amount-(was.terms?.paid_amount||0))+(was.terms?.deposit>0&&was.terms?.deposit_status==='pending'?Number(was.terms.deposit):0):0;celebrate({title:tr('Оплачено'),sum:due>0?money(due):undefined,lines:b?[String(b.title||''),recordSpan(b.start,b.end),tr('ИИ-администратор пришлёт всё для заселения')].filter(Boolean):undefined});}
        // The booking just sent from its check opens as its card: the state, what happens next and the payment when it is due.
        if(dealRef.current==='review'&&path==='bookings'&&result?.id&&state){setDeal(d=>d&&d.kind==='review'?{kind:'booking',id:result.id,after:id}:d);scroll.current?.scrollTo({y:0,animated:false});}
        else if(after&&state&&!dealRef.current)run(after,state);
        // The cleaning is paid: the last thing left to the customer is the rating, so it is asked right away.
        const paid=body.action==='record_job_payment'&&state?(state.jobs||[]).find((j:Row)=>j.id===path.split('/')[1]):null;
        if(paid&&paid.status==='completed'&&paid.assigned_to&&paid.assigned_to!==paid.owner_id&&!paid.rating)say(tr('Оцените работу исполнителя.'),'rate',{id:paid.id});
        // A good rating of a home cleaning: the customer may keep this performer, so the next orders go to them first.
        const rated=body.action==='rate'&&Number(body.rating)>=4&&state?(state.jobs||[]).find((j:Row)=>j.id===path.split('/')[1]):null,ratedHome=rated?(state!.ownProperties||[]).find((p:Row)=>p.id===rated.property_id):null;
        if(rated&&ratedHome&&ratedHome.details?.type===HOME_TYPE&&!ratedHome.regular_cleaner_name&&rated.assigned_to)say(tr('Понравилась работа? Закрепите исполнителя за домом: следующие заказы сначала придут к нему.'),'confirm',{path:'operations/regular/pin',body:{propertyId:rated.property_id,cleanerId:rated.assigned_to},title:tr('Закрепить исполнителя'),subject:rated.worker?.name||ratedHome.title,note:tr('Его «да» сразу назначает его на уборку. Открепить можно в карточке дома.'),dates:''});
      }catch(e){await handleError(e);}
    }catch(e){await handleError(e);}
    finally{locked.current=false;setBusy(false);}
  }
  // A city left empty at sign-up is the one the phone sees the person in; the server takes its own default otherwise.
  const cityHere=()=>{const fix=getHere().fix;return fix?nearestCity(fix.point)||'':'';};
  async function authenticate(mode:string,phone:string,password:string,id:string,intent:string,name?:string,city?:string,recovery?:string){
    if(locked.current)return;locked.current=true;setBusy(true);
    try{
      const result=await request('/auth/'+mode,{phone,password,...(mode==='register'?{name,city:city?.trim()||cityHere(),accept:true}:mode==='reset'?{code:recovery}:{})});/* The server still returns a backup code (the site keeps it); the app no longer shows one: a forgotten password is reset by a code in Telegram. */if(typeof result.token!=='string')throw Error(tr('Сервер не подтвердил вход.'));await saveSession(result.token);session.current=true;
      setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);
      // While the last role is opening the chooser is not shown, so the map is the first thing seen after «Войти».
      // Signed in to book or to see something from the visitor map: the guest's pages open, and that goes on there.
      setOpening(true);try{const state=await load();if(afterSignIn.current&&state?.user)await hydrate('guest');else await openLastRole(state);}finally{setOpening(false);}
    }finally{locked.current=false;setBusy(false);}
  }
  async function send(value=input){
    const text=value.trim();if(!text||locked.current||!ready)return;setInput('');setMessages(prev=>[...prev,{id:uid(),sender:'user' as const,text}].slice(-120));
    if(/^(стоп|отмена|начать сначала)$/i.test(text)){setFlow(null);say(tr('Остановили ввод. Чем помочь дальше?'));return;}
    if(flow){
      const q=flow.questions[flow.index];let answer:any=text;
      try{
        if(q.choices){const choice=q.choices.find(c=>c.value===text||c.label.toLowerCase()===text.toLowerCase());if(!choice)throw new Error(tr('Выберите один из показанных тарифов.'));answer=choice.value;}
        else if(q.date)answer=parseDate(text);
        else if(q.min!==undefined){answer=Number(text.replace(/\s/g,'').replace(/(?:₸|тенге|минут[аы]?)$/i,''));if(!Number.isInteger(answer)||answer<q.min||answer>(q.max||Infinity))throw new Error(tr('Напишите целое число от {min} до {max}.',{min:q.min,max:q.max}));}
        else if(text.length>(q.key==='description'?2000:q.key==='experience'?1000:q.key==='name'?100:q.key==='contact'?120:q.key==='city'?80:300))throw new Error(tr('Ответ слишком длинный. Напишите короче.'));
        const answers={...flow.answers,[q.key]:answer};
        if(q.key==='end'&&Date.parse(answer)<=Date.parse(answers.start))throw new Error(tr('Окончание должно быть позже начала. Укажите другую дату.'));
        if(q.key==='start'&&Date.parse(answer)<Date.now()-60000)throw new Error(tr('Начало должно быть в будущем. Укажите другую дату.'));
        const next={...flow,answers,index:flow.index+1};
        if(next.index<next.questions.length){setFlow(next);say(next.questions[next.index].text);}
        else{setFlow(null);say(tr('Всё собрали. Проверьте сведения перед подтверждением.'),'review',{flow:next});}
      }catch(e:any){say(e.message);}return;
    }
    locked.current=true;setBusy(true);
    try{
      if(/^выйти/i.test(text)){
        let revoked=true;try{if(session.current)await request('/auth/logout',{});}catch{revoked=false;}
        await saveSession(null);session.current=false;setWorkspaceRole(null);activeRoleRef.current=null;setSelectedRole(null);setData(empty);setMessages([]);setFlow(null);setActor('guest');setHistoryReady(false);say(revoked?tr('Вы вышли из аккаунта.'):tr('Вы вышли на этом устройстве. Для завершения серверной сессии не хватило связи.'));return;
      }
      const state=session.current?await load():data;if(!state)return;
      if(/демо|учебн|пример/i.test(text)){run('demo',state);return;}
      if(/сдать|сдаю|сдавать|добав.*кварт|подключ.*кварт/i.test(text)){run('property',state);return;}
      if(/изменить.*(?:профил|анкет)/i.test(text)){run('profile',state);return;}
      if(/хочу работ|ищу работ|стать.*исполн|работать на убор/i.test(text)){run('cleaner-profile',state);return;}
      if(selectedRole==='guest'&&/нужна убор|заказать убор|уборк\S* (?:на дом|дома|квартир)|убрать(?:ся)? (?:в |у меня|дом|квартир)/i.test(text)){run('home-cleaning',state);return;}
      // Владелец: уборка своего дома, который не сдаётся. Без сдаваемых объектов любая «нужна уборка» ведёт сюда же.
      if(selectedRole==='owner'&&(/уборк\S* (?:на дом|дома|у меня дома|в мо\S+ (?:квартир|дом))|(?:сво\S+|мо\S+) (?:квартир|дом)\S* (?:для|на) уборк|только уборк|убрать(?:ся)? (?:у меня|дома|дом)/i.test(text)||/нужна убор|заказать убор|найти.*(?:уборщ|исполнител)/i.test(text)&&!state.ownProperties.some((p:Row)=>p.details?.type!==HOME_TYPE))){run('home-cleaning',state);return;}
      if(/нужна убор|создать убор|заказать убор|найти.*(?:уборщ|исполнител)/i.test(text)){run('job',state);return;}
      if(/мои квартир|мо[иё] жиль|мои объект/i.test(text)){run('own-properties',state);return;}
      if(/уборк.*(?:квартир|жиль|объект)|уборк.*моих|уборки владельца/i.test(text)){run('owner-jobs',state);return;}
      if(/мои (?:задан|отклик|уборк)|назначени/i.test(text)){run('my-jobs',state);return;}
      if(/найти убор|показать убор|доступн.*убор/i.test(text)){run('jobs',state);return;}
      if(/заявки гост|брони владельца/i.test(text)){run('owner-bookings',state);return;}
      if(/мои брон|мои заяв|заезд/i.test(text)){run('bookings',state);return;}
      if(/обзор|ближайш|что.*сегодня|что.*внимани/i.test(text)){run('workspace',state);return;}
      if(/что нового|уведомлен/i.test(text)){run('notifications',state);return;}
      if(/обновить/i.test(text)){say(tr('Данные обновлены.'),'workspace',{role:actor});return;}
      if(/помощь|что.*уме|о сервисе|как.*работ/i.test(text)){say(tr('Помогу снять жильё, подключить жильё и организовать уборку. Напишите, что нужно сделать. ИИ-администратор доступен в разделе «Чаты». Там сохраняются вопросы и ответы. Внешняя доставка и банковские платежи зависят от подключений сервиса. Важные действия подтверждаете вы.'),'help');return;}
      if(/снять|квартир|жиль|хостел|гостиниц|аренд/i.test(text)){if(!state.user){run('properties',state);return;}setActor('guest');catalog(state,'guest',text);return;}
      say(tr('Уточните вашу задачу: хотите снять жильё, сдавать жильё или работать на уборке?'),'help');
    }catch(e){await handleError(e);}finally{locked.current=false;setBusy(false);composer.current?.focus();}
  }
  // A swipe is the confirmation itself: the same request as the «Подтвердите действие» card sends, without that card.
  function swiped(path:string,body:Row,after?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);void perform(path,{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},uid(),after);}
  function confirm(path:string,body:Row,title:string,after?:string,note?:string){const id=path.split('/')[1],item=(path.startsWith('bookings/')?data.bookings:data.jobs).find((v:Row)=>v.id===id);say(tr('Подтвердите действие: {v}.',{v:title.toLowerCase()}),'confirm',{path,body:{...body,expectedVersion:path.startsWith('bookings/')?item?.terms?.version:item?.version},title,note,subject:item?.title,dates:item?date(item.start)+' → '+date(item.end):'',amount:item?.amount??item?.fee,after});}
  function review(m:Message){
    const f=m.payload!.flow as Flow;
    if(f.kind==='booking')return <><BookingReview flow={f} photo={m.payload!.photo} busy={busy} done={m.done} result={m.result} onConfirm={quote=>perform(f.endpoint,{...f.answers,...f.extra,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:true},m.id,f.after)} onEdit={()=>{finish(m.id,tr('Изменено'));const next={...f,index:0};setFlow(next);say(next.questions[0].text);}}/>{!!m.payload!.back&&!m.done&&!dealOpen&&<Button title={tr('Назад к вариантам')} secondary disabled={busy} onPress={backToMap}/>}</>;
    const questions=f.kind==='profile'?[...baseQuestions,...cleanerQuestions]:f.kind==='property'?propertyQuestions:f.questions;
    return <View style={s.card}><Text style={s.cardTitle}>{({profile:tr('Ваш профиль'),property:tr('Ваше жильё'),job:tr('Уборка'),report:tr('Отчёт'),confirm:tr('Подтверждение')} as Row)[f.kind]||tr('Проверьте сведения')}</Text>
      {questions.filter(q=>f.answers[q.key]!==undefined).map(q=><View key={q.key} style={s.keyval}><Text style={s.key}>{q.label}</Text><Text style={s.value}>{q.date?date(Date.parse(f.answers[q.key])/1000):String(f.answers[q.key])}</Text></View>)}
      <Button title={m.done?(m.result||tr('Сохранено')):f.kind==='property'?tr('Опубликовать жильё'):tr('Подтвердить')} disabled={busy||m.done} onPress={()=>perform(f.endpoint,{...f.answers,...f.extra},m.id,f.after)}/>
      {!m.done&&<Button title={tr('Отменить')} secondary disabled={busy} onPress={()=>{finish(m.id,tr('Отменено'));say(tr('Действие отменено. Данные не отправлены.'));}}/>}
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
    setActor('guest');say('','review',{flow:next,back:true,photo:found.photos?.[0]||property.photos?.[0]});
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
  let accountRoles:Role[]=[];try{accountRoles=JSON.parse(data.profile?.roles||'[]');}catch{}
  function renderAssistantBrief(){const brief=data.assistantBrief;if(!brief)return null;return <View style={s.card}><Text style={s.eyebrow}>{tr('ПЛАН АССИСТЕНТА')}</Text><Text style={s.cardTitle}>{brief.summary}</Text>{brief.tasks.map((task:Row)=><View key={task.id} style={s.event}><Text style={s.eventTitle}>{task.title}</Text><Text style={s.meta}>{task.reason}</Text><Button title={tr('Открыть задачу')} secondary disabled={busy} onPress={()=>openAssistantTask(task)}/></View>)}<Text style={s.meta}>{tr('Сроки и согласования проверяются сервером. Внешние каналы подключаются отдельно.')}</Text></View>;}
  function approval(id:string){const card=(data.approvals||[]).find((c:Row)=>c.id===id);const reportOf=card?.kind==='report'&&card.canDecide?card.entityId:'';
   // A closed card leaves the feed: the decision's own answer is already said below it, and the card of the booking or
   // job shows the result, so no line that reads like an error stays behind.
   // The acceptance of a cleaning: the performer's photos are looked at before the decision, and damage is reported from here.
   return card?<Fragment key={card.id+card.revision}>{!!reportOf&&<View style={{gap:8,marginTop:8,marginBottom:8}}><JobPhotos jobId={reportOf} phase="before" role="owner" readOnly title={tr('До уборки')}/><JobPhotos jobId={reportOf} phase="after" role="owner" readOnly title={tr('После уборки')}/></View>}<ApprovalCard card={card} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>{!!reportOf&&<View style={{marginTop:8}}><Button title={tr('Сообщить об ущербе')} secondary disabled={busy} onPress={()=>say(tr('Сфотографируйте повреждение и опишите, что случилось.'),'damage',{id:reportOf})}/></View>}</Fragment>:null;}
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
      if(!workspace)return <View style={s.card}><Text style={s.meta}>{tr('Обновите данные, чтобы увидеть ближайшие события.')}</Text><Button title={tr('Обновить')} secondary disabled={busy} onPress={()=>send('Ближайшие события')}/></View>;
      return <OverviewBoard workspace={workspace} approvals={data.approvals||[]} data={data} now={data.serverTime||Math.floor(Date.now()/1000)} busy={busy} onDecide={body=>perform('approvals',body,uid())} onOpen={(kind,id)=>openDeal(kind,id)}/>;
    }
    if(m.block==='auth')return session.current?<Text style={s.meta}>{tr('Вход выполнен.')}</Text>:<Auth key={m.id} busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,m.id,payload.intent,name,city,recovery)}/>;
    if(m.block==='review')return review(m);
    if(m.block==='stay-form'){const property=data.properties.find((p:Row)=>p.id===payload.propertyId);return property?<StayRequest property={property} busy={busy} done={m.done} result={m.result} onQuote={body=>request('/api/quote',body)} onConfirm={body=>perform('bookings',{...body,requestKey:payload.requestKey},m.id,'bookings')}/>:<Text style={s.meta}>{tr('Жильё больше недоступно.')}</Text>;}
    if(m.block==='job-form'){const property=data.ownProperties.find((p:Row)=>p.id===payload.propertyId);return property?<CleaningRequest property={property} busy={busy} done={m.done} result={m.result} onSubmit={body=>perform('jobs',body,m.id,'owner-jobs')}/>:<Text style={s.meta}>{tr('Жильё недоступно.')}</Text>;}
    if(m.block==='home-order')return <HomeCleaningOrder places={(data as Row).homePlaces||[]} deals={(data as Row).homeDeals||[]} city={data.profile?.city||tr('Павлодар')} propertyId={payload.propertyId} initial={payload.initial} busy={busy} done={m.done} result={m.result} onSubmit={body=>orderHome({...body,requestKey:payload.requestKey},m.id)}/>;
    if(m.block==='confirm')return <View style={s.card}><Text accessibilityRole="header" style={s.cardTitle}>{payload.title}</Text><Text style={s.text}>{payload.subject||tr('Подтверждение действия')}</Text>{!!payload.note&&<Text style={s.text}>{payload.note}</Text>}<Text style={s.meta}>{payload.dates}{payload.amount!==undefined?' · '+money(payload.amount):''}</Text>{m.done?<Button title={m.result||tr('Действие закрыто')} disabled onPress={()=>{}}/>:<SwipeConfirm label={tr('Проведите: {what}',{what:String(payload.title||tr('подтвердить')).charAt(0).toLowerCase()+String(payload.title||tr('подтвердить')).slice(1)})} disabled={busy} onConfirm={()=>perform(payload.path,payload.body,m.id,payload.after)}/>}{!m.done&&<Button title={payload.body?.action==='cancel'?tr('Не отменять'):tr('Отменить')} secondary disabled={busy} onPress={()=>finish(m.id,tr('Отменено'))}/>}</View>;
    if(m.block==='help')return <View style={s.suggestions}>{[tr('Хочу снять жильё'),tr('Хочу сдать жильё'),tr('Хочу работать на уборке'),tr('Мои брони'),tr('Что нового')].map(t=><Button key={t} title={t} secondary disabled={busy} onPress={()=>send(t)}/>)}</View>;
    if(m.block==='property-quick')return m.done?<Text style={s.meta}>{m.result||tr('Готово')}</Text>:<PropertyQuick city={data.profile?.city||tr('Павлодар')} onUnderstand={text=>request('/api/operations/listing/understand',{text},undefined,undefined,'owner')} onTop={()=>{const y=messageY.current[m.id];if(y!==undefined)scroll.current?.scrollTo({y:Math.max(0,y-12),animated:true});}} onHome={ask=>{finish(m.id,tr('Перешли к заказу уборки'));setPageId('overview');say(tr('Закажем уборку вашего жилья.'),'home-order',{requestKey:uid(),...(ask?{initial:ask}:{})});}} onSave={body=>request('/api/listings',body)} onGuestMode={body=>request('/api/operations/matching/preference',body,undefined,undefined,'owner')} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onPlace={body=>request('/api/operations/map/place',body,undefined,undefined,'owner')} onClose={()=>finish(m.id,tr('Добавление отменено'))} onMap={async()=>{finish(m.id,tr('Жильё добавлено'));await load();setPageId('map');}} onDone={async saved=>{finish(m.id,tr('Жильё добавлено'));const state=await load();say(saved.message);catalog(state,'owner');}}/>;
    if(m.block==='property-editor'){const property=data.ownProperties.find((p:Row)=>p.id===payload.id);return m.done||!property?<Text style={s.meta}>{m.result||tr('Форма закрыта')}</Text>:<PropertyEdit key={property.id} property={property} step={payload.step} onOpenHall={async id=>{finish(m.id,tr('Изменения сохранены'));await load();say('','property-editor',{id});}} call={(path,body)=>request('/api/operations/'+path,body,undefined,undefined,'owner')} onClose={()=>{finish(m.id,tr('Изменения сохранены'));void load().then(state=>{if(state)catalog(state,'owner');});}} onReview={body=>request('/api/operations/reviews/request',body,undefined,undefined,'owner')} onRemove={async()=>{const r=await request('/api/listings/'+property.id+'/remove',{},undefined,undefined,'owner');finish(m.id,r?.message||tr('Жильё удалено'));const state=await load();if(state)catalog(state,'owner');}} onSave={async body=>{await request('/api/listings/'+property.id,body);const state=await load();return state?.ownProperties?.find((p:Row)=>p.id===property.id);}}/>;}
    // The owner's own objects are short cards («Моё жильё»); the page's own list carries «Добавить жильё» on top.
    if(m.block==='properties'&&payload.mode==='owner')return <OwnProperties properties={payload.ids.map((id:string)=>data.ownProperties.find((p:Row)=>p.id===id)).filter(Boolean)} bookings={data.bookings} busy={busy} onAdd={m.id==='page-properties'?()=>run('property'):undefined} onHome={m.id==='page-properties'?()=>openMapIntent('home-cleaning'):undefined} onEdit={id=>say('','property-editor',{id})} onSettings={id=>say(tr('Правила и готовность жилья.'),'property-settings',{id})} onCleaning={id=>run('job:'+id)} onMap={id=>onMap('property',id)} onResend={async p=>{const r=await request('/api/operations/reviews/request',{propertyId:p.id,reference:(p.published?'Проверка нового адреса':'Показать гостям после проверки')+': «'+p.title+'»'},undefined,undefined,'owner');await load();return r;}}/>;
    if(m.block==='properties')return <View>{!!payload.back&&<Button title={tr('Назад к карте')} secondary disabled={busy} onPress={backToMap}/>}{payload.ids.map((id:string)=>{const p=[...data.properties,...data.ownProperties].find((p:Row)=>p.id===id);if(!p)return null;const stay:MapStay|undefined=payload.mode==='guest'?payload.stay:undefined;return <PropertyListing key={id} property={p} owner={payload.mode==='owner'} chooseTitle={stay?tr('Забронировать'):payload.mode==='job'?tr('Убрать здесь'):undefined} onChoose={()=>stay?bookFromMap(p,stay):run((payload.mode==='owner'||payload.mode==='job'?'job:':'book:')+id)} onEdit={()=>say('','property-editor',{id})} onSettings={()=>say(tr('Полномочия и готовность жилья.'),'property-settings',{id})} onMap={onMap('property',id)} {...(payload.mode==='guest'&&selectedRole==='guest'&&!p.demo_owner?{favorite:favorites.mine.favorites.includes(id),onFavorite:()=>void favorites.toggle(id).then(text=>{if(text)say(text);})}:{})}/>;})}{!payload.ids.length&&<Button title={payload.mode==='guest'?tr('Посмотреть учебный пример'):tr('Добавить жильё')} secondary disabled={busy} onPress={()=>send(payload.mode==='guest'?tr('Покажи учебный пример'):tr('Хочу сдать жильё'))}/>}</View>;
    if(m.block==='bookings')return <View>{payload.role==='owner'&&m.id==='page-bookings'&&tabNow==='new'&&<OwnerResponses autopilot={(job,apps)=>autopilotPick(data,job,apps,data.serverTime||Date.now()/1000)} rows={ownerResponses(data,userId||'',data.serverTime||Date.now()/1000)} approvals={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())} onOpen={id=>openDeal('job',id)}/>}{payload.role==='owner'&&m.id==='page-bookings'&&tabNow==='new'&&payload.ids.length>0&&ownerResponses(data,userId||'',data.serverTime||Date.now()/1000).length>0&&<Text accessibilityRole="header" style={s.groupTitle}>{tr('Заявки гостей')}</Text>}{(m.id==='page-bookings'&&tabNow==='archive'?byMonth:byTime)(payload.ids,data.bookings).map(({id,title}:{id:string;title:string})=>{
      const b=data.bookings.find((b:Row)=>b.id===id);if(!b)return null;const owner=b.owner_id===userId&&payload.role==='owner';
      const expired=b.status==='expired',confirmed=b.status==='confirmed',started=b.start<=data.serverTime,rest=Math.max(0,b.amount-(b.terms?.paid_amount||0)),owed=payDue(b,data.serverTime||Date.now()/1000),left=owed.left,depositDue=owed.deposit,due=owed.sum,guests=Number(b.guests)||1,closed=['cancelled','expired','completed'].includes(b.status),returned=(Number(b.terms?.refunded_amount)||0)+(Number(b.terms?.deposit_returned_amount)||0),moneyMoved=(Number(b.terms?.paid_amount)||0)+returned+(Number(b.terms?.deposit_received_amount)||0)>0||!!b.terms?.payment_reported_at||!!b.terms?.deposit_reported_at||Number(b.receipts)>0,toldSum=(b.terms?.payment_reported_at?Number(b.terms.payment_reported_amount)||0:0)+(b.terms?.deposit_reported_at?Number(b.terms.deposit_reported_amount)||0:0);
      const clock=data.serverTime||Date.now()/1000,inside=!!b.terms?.actual_checkin&&!b.terms?.actual_checkout,guideNow=!owner&&confirmed&&!b.terms?.actual_checkout,guideFirst=guideNow&&b.payment_status==='owner_verified'&&!b.terms?.actual_checkin,asked=(b.changes||[]).some((c:Row)=>c.status==='pending');
      // «Как гость оставил жильё?» after checkout; the guest's own photos of the home while staying (lib/stay-handover.ts).
      const handed=handoverState(b as Parameters<typeof handoverState>[0],clock),shooting=!owner&&confirmed&&!!(b.terms?.actual_checkin||b.terms?.checkin_reported_at)&&!b.terms?.actual_checkout;
      const changes=<BookingChanges key={b.id+':'+b.terms?.version} booking={b} role={payload.role} busy={busy} onReview={id=>say(tr('Предложение новых условий.'),'approval',{id:'change:'+id})} onQuote={body=>request('/api/bookings/'+id+'/change-quote',body)} onPropose={body=>perform('bookings/'+id+'/changes',body,uid())} onDecide={(changeId,action)=>perform('bookings/'+id+'/changes/'+changeId,{action},uid())} onReveal={reveal}/>;
      // The owner answers a request right in the card: its approval decides it (concept 2026-11-25).
      const card=owner&&b.status==='requested'?(data.approvals||[]).find((c:Row)=>c.id==='booking:'+id&&c.canDecide):undefined,ask=card?{card,onDecide:(body:Row)=>perform('approvals',body,uid()),onReview:()=>say(tr('Запрос гостя на согласование.'),'approval',{id:'booking:'+id}),payout:data.payout||null,onMethod:(page:'payout')=>{setMenuStart(page);openPage('account');}}:undefined;
      return <Fragment key={id}>{!!title&&!(m.id==='page-bookings'&&['done','cancelled'].includes(tabNow))&&<Text accessibilityRole="header" style={s.groupTitle}>{title}</Text>}<DealCard kind="booking" compact={m.id==='page-bookings'} startOpen={recordGroup(b,clock)==='now'} request={ask} item={b} role={payload.role} userId={userId||''} thread={owner?bookingThread(b,data,clock):null} line={owner?null:guestLine(b,clock,data.paymentMode)} busy={busy} onMap={onMap('booking',id)}
        always={<>{closed&&moneyMoved&&<View style={{gap:8}}><Receipts key={'paid-receipts:'+id} kind="booking" id={id} role={owner?'owner':'guest'} count={Number(b.receipts)||0} canAdd={!owner} from="payment" title={owner?tr('Чек гостя'):tr('Ваш чек об оплате')}/><Receipts key={'refund-receipts:'+id} kind="booking" id={id} role={owner?'owner':'guest'} count={Number(b.receipts)||0} canAdd={owner&&returned>0} from="refund" title={tr('Чек возврата')}/></View>}{!owner&&confirmed&&due>0&&<PayTo title={payDue(b).reported?tr('Перевод на проверке'):tr('Переведите владельцу')} to={b.owner_pay} amount={due} parts={left>0&&depositDue?tr('{stay} {sum} и депозит {deposit}, он вернётся {afterLeave}',{stay:wordsOf(b).stay,sum:money(left),deposit:money(depositDue),afterLeave:wordsOf(b).afterLeave}):depositDue?tr('Депозит, он вернётся {afterLeave}',{afterLeave:wordsOf(b).afterLeave}):undefined} waiting={payDue(b).reported?tr('Вы сообщили о переводе. Владелец проверит банк и подтвердит оплату.'):undefined} missing={tr('Владелец ещё не указал, куда переводить. Спросите его в чате брони.')} note={tr('Оплата идёт владельцу напрямую, сервис её не принимает.')}><Receipts key={'receipts:'+id} kind="booking" id={id} role="guest" count={Number(b.receipts)||0} canAdd from="payment"/></PayTo>}{owner&&confirmed&&due>0&&Number(b.receipts)>0&&<Receipts key={'receipts:'+id} kind="booking" id={id} role="owner" count={Number(b.receipts)||0} title={tr('Чек гостя')} from="payment"/>}{owner&&confirmed&&due>0&&!data.payout&&<Text style={[s.meta,{color:C.warning}]}>{tr('Гость не видит, куда платить. Укажите номер Kaspi: Меню, «Настройки», «Реквизиты для оплаты».')}</Text>}{guideFirst&&<CheckinGuide key={'guide:'+id} bookingId={id} venue={!isHome(b)}/>}{inside&&<ActivityTimer kind="booking" item={b}/>}{asked&&changes}{owner&&handed==='ask'&&<StayHandover key={'handover:'+id} bookingId={id} kind={b.property_type} cleanerPhotos={Number(b.cleaner_photos)||0} cleanerDamage={Number(b.cleaner_damage)||0} checkinPhotos={Number(b.checkin_photos)||0} busy={busy} onSubmit={body=>perform('operations/handover',{bookingId:id,...body},uid())}/>}{(handed==='done'||handed==='silent')&&<Text style={s.meta}>{handoverLine(b.handover,handed==='silent',!owner,b.property_type)}</Text>}{shooting&&!Number(b.checkin_photos)&&<CheckinPhotos key={'checkin-photos:'+id} bookingId={id} count={0} venue={!isHome(b)}/>}{payload.role==='guest'&&canRate(b,clock)&&<StayReview key={'review:'+id} busy={busy} onSubmit={(rating,text)=>perform('operations/review',{bookingId:id,rating,text},uid())}/>}{payload.role==='guest'&&rateClosed(b,clock)&&<Text style={s.meta}>{tr('Срок для отзыва прошёл: оценить можно в течение 14 дней после выезда.')}</Text>}</>}
        details={<><RecordFacts rows={[[tr('Гости'),guests+' '+forms(guests,'гость','гостя','гостей')],owner&&b.guest_name&&[tr('Гость'),b.guest_name+(b.guest_contact?' · '+b.guest_contact:'')],b.terms&&[tr('Оплачено'),money(b.terms.paid_amount||0)+(rest>0&&!expired&&b.status!=='cancelled'?' · '+tr('остаток {sum}',{sum:money(rest)}):'')],returned>0&&[tr('Возвращено'),money(returned)+(b.terms?.refund_confirmed_at?' · '+tr('гость получил'):'')],['cancelled','expired'].includes(b.status)&&refundLeft(b)>0&&[tr('К возврату'),money(refundLeft(b))],b.terms&&confirmed&&[tr('Оплата'),prepayLabel(prepayOf(b.terms))],b.terms&&[tr('Депозит'),expired&&b.terms.deposit_status!=='owner_verified'?(b.terms.deposit_received_amount?tr('получено {sum}',{sum:money(b.terms.deposit_received_amount)}):tr('не требуется')):b.terms.deposit?money(b.terms.deposit)+' · '+(b.terms.deposit_status==='owner_verified'?tr('подтверждён владельцем'):tr('ожидается')):tr('не требуется')],b.readiness&&['requested','confirmed'].includes(b.status)&&[isHome(b)?tr('Жильё'):tr('Объект'),isHome(b)?readinessLabels[b.readiness]:({ready:tr('Готово к приходу гостей'),occupied:tr('Гости на месте'),blocked:tr('Брони закрыты')} as Row)[b.readiness]||readinessLabels[b.readiness]],b.address&&[tr('Адрес'),b.address+(b.owner_contact?' · '+b.owner_contact:''),true]]}/>{guideNow&&!guideFirst&&<CheckinGuide key={'guide:'+id} bookingId={id} venue={!isHome(b)}/>}{shooting&&!!Number(b.checkin_photos)&&<CheckinPhotos key={'checkin-photos:'+id} bookingId={id} count={Number(b.checkin_photos)} venue={!isHome(b)}/>}{b.status==='completed'&&!(owner&&handed==='ask')&&(!!Number(b.checkin_photos)||!!Number(b.handover_photos))&&<StayEvidence key={'evidence:'+id} bookingId={id} kind={b.property_type} role={owner?'owner':'guest'} checkin={!!Number(b.checkin_photos)} handover={!!Number(b.handover_photos)}/>}{!inside&&<ActivityTimer kind="booking" item={b}/>}</>}
        extra={asked?null:changes}
        actions={[
          !owner&&expired&&{title:t('Подобрать другое жильё'),kind:'main',onPress:backToMap},
          owner&&b.status==='requested'&&{title:tr('Рассмотреть заявку'),kind:'main',onPress:()=>say(tr('Запрос гостя на согласование.'),'approval',{id:'booking:'+id})},
          // In the order the booking allows them: the check-in is confirmed only after the payment and the deposit, and the first one is the big button.
          // Direct settlement: the guest transfers to the owner's own bank; one swipe confirms the stay and the deposit together.
          owner&&confirmed&&due>0&&{title:tr('Деньги получены · {v}',{v:money(due)}),kind:'main',swipe:tr('Проведите: получено {v}',{v:money(due)}),onSwipe:()=>swiped('bookings/'+id,{action:'received'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'received'},tr('Подтверждаю: {sum} от гостя получены',{sum:money(due)}),'owner-bookings',left>0&&depositDue?tr('{stay} {sum} и депозит {deposit}.',{stay:wordsOf(b).stay,sum:money(left),deposit:money(depositDue)}):undefined)},
          owner&&confirmed&&due>0&&!!(b.terms?.payment_reported_at||b.terms?.deposit_reported_at)&&{title:tr('Перевод не пришёл'),kind:'side',onPress:()=>confirm('bookings/'+id,{action:'not_received'},tr('Сообщить гостю, что перевод не пришёл'),undefined,tr('Гость получит сообщение и сможет повторить перевод или написать вам.'))},
          // Cancelled with a transfer «на проверке»: the owner still says whether the money came (lib/service.ts receivedAfterCancel).
          owner&&b.status==='cancelled'&&toldSum>0&&{title:tr('Деньги получены · {v}',{v:money(toldSum)}),kind:'main',onPress:()=>confirm('bookings/'+id,{action:'received'},tr('Подтверждаю: {sum} от гостя получены',{sum:money(toldSum)}),'owner-bookings',tr('Бронь отменена: деньги вернутся гостю по правилам отмены.'))},
          owner&&b.status==='cancelled'&&toldSum>0&&{title:tr('Перевод не пришёл'),kind:'side',onPress:()=>confirm('bookings/'+id,{action:'not_received'},tr('Сообщить гостю, что перевод не пришёл'),undefined,tr('Гость получит сообщение. Переводить заново ему не нужно: бронь отменена.'))},
          // The flat is not marked ready and no executor cleaning is on the way (a new flat, own staff): one tap, no form.
          owner&&confirmed&&!b.terms?.actual_checkin&&['inspection','awaiting_cleaning'].includes(b.readiness)&&!data.jobs.some((j:Row)=>j.property_id===b.property_id&&['open','assigned','in_progress','submitted'].includes(j.status))&&{title:wordsOf(b).ready,kind:'main',swipe:tr('Проведите: {what}',{what:wordsOf(b).readyLow}),onSwipe:()=>swiped('properties/'+b.property_id+'/readiness',{readiness:'ready',inspected:true},'owner-bookings'),onPress:()=>confirm('properties/'+b.property_id+'/readiness',{readiness:'ready',inspected:true},tr('Подтверждаю: {what}',{what:wordsOf(b).readyLow}),'owner-bookings')},
          // Cleaned early: the next guest may come in now, at no extra cost (lib/arrival-shift.ts).
          owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.early_checkin_at&&!checkinOpen(b.start,clock)&&b.start-clock<=12*3600&&b.readiness==='ready'&&b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending'&&{title:tr('Можно заселиться раньше'),kind:'side',onPress:()=>confirm('bookings/'+id,{action:'early_checkin'},tr('Пустить гостя раньше'),undefined,(isHome(b)?tr('Гость получит сообщение, что может заселиться уже сейчас, без доплаты.'):tr('Гость получит сообщение, что может прийти уже сейчас, без доплаты.')))},
          // The cleaning runs late: ask the guest to come later. The guest accepts or declines; until then the old time holds.
          ...[30,60].map(min=>owner&&confirmed&&!b.terms?.actual_checkin&&b.start>clock&&b.start-clock<=86400&&!asked&&{title:tr('Сдвинуть {arriveLow} на {time}',{arriveLow:wordsOf(b).arriveLow,time:(min===60?tr('1 ч'):tr('{min} мин',{min}))}),kind:'side' as const,onPress:()=>confirm('bookings/'+id,{action:'shift_arrival',minutes:min},isHome(b)?tr('Попросить гостя заехать на {time} позже',{time:(min===60?tr('1 ч'):tr('{min} мин',{min}))}):tr('Попросить гостя прийти на {time} позже',{time:(min===60?tr('1 ч'):tr('{min} мин',{min}))}),undefined,tr('Гость получит предложение и ответит в карточке брони. Пока он не согласился, действует прежнее время.'))}),
          owner&&confirmed&&checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)&&!b.terms?.actual_checkin&&{title:tr('Подтвердить {arriveAcc}',{arriveAcc:wordsOf(b).arriveAcc}),kind:b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending'?'main':'side',swipe:tr('Проведите: {what}',{what:wordsOf(b).guestIn.toLowerCase()}),onSwipe:()=>swiped('bookings/'+id,{action:'checkin'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'checkin'},tr('Подтверждаю: {what}',{what:wordsOf(b).guestIn.toLowerCase()}),'owner-bookings')},
          owner&&confirmed&&started&&{title:tr('Подтвердить {leaveLow}',{leaveLow:wordsOf(b).leaveLow}),kind:'main',swipe:tr('Проведите: {what}',{what:wordsOf(b).swipeGuestOut}),onSwipe:()=>swiped('bookings/'+id,{action:'checkout'},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'checkout'},tr('Подтверждаю: {swipeGuestOut}, объект свободен',{swipeGuestOut:wordsOf(b).swipeGuestOut}),'owner-bookings')},
          // «Я оплатил»: the guest has transferred the stay and the deposit to the owner; the owner checks the bank and confirms.
          !owner&&confirmed&&due>0&&!owed.reported&&{title:tr('Я оплатил {v}',{v:money(due)}),kind:'main',swipe:tr('Проведите: я оплатил {v}',{v:money(due)}),onSwipe:()=>swiped('bookings/'+id,{action:'report_paid'}),onPress:()=>confirm('bookings/'+id,{action:'report_paid'},tr('Сообщить владельцу, что вы перевели {v}',{v:money(due)}))},
          !owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.checkin_reported_at&&b.end>data.serverTime&&{title:wordsOf(b).iAmIn,kind:'main',swipe:tr('Проведите: {what}',{what:wordsOf(b).swipeIn}),onSwipe:()=>swiped('bookings/'+id,{action:'report_checkin'}),onPress:()=>confirm('bookings/'+id,{action:'report_checkin'},tr('Сообщить: {swipeIn}; владелец подтвердит после проверки оплаты и депозита',{swipeIn:wordsOf(b).swipeIn})),...(checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)?{}:{disabled:true,note:tr('Кнопка станет активной за 15 минут до {arriveGen}: {when}.',{arriveGen:wordsOf(b).arriveGen,when:checkinOpensLabel(b.start,data.serverTime,b.terms?.early_checkin_at)})})},
          // «Не могу попасть»: at the door with a transfer still on the owner's check. The owner and the service administrator hear it at once.
          !owner&&confirmed&&!b.terms?.actual_checkin&&due>0&&owed.reported&&checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)&&b.end>data.serverTime&&{title:tr('Не могу попасть'),kind:'main',onPress:()=>confirm('bookings/'+id,{action:'door_help'},tr('Сообщить владельцу и администратору сервиса, что вы у двери, а перевод ещё на проверке'))},
          // «Меня не заселили»: the guest is at the door and nobody lets them in. The owner's places leave the map at once.
          !owner&&confirmed&&!b.terms?.actual_checkin&&checkinOpen(b.start,data.serverTime,b.terms?.early_checkin_at)&&b.end+86400>data.serverTime&&{title:tr('Меня не заселили'),kind:'side',onPress:()=>confirm('bookings/'+id,{action:'not_let_in'},tr('Сообщить администратору, что вас не заселили или жилья нет. Объекты владельца сразу скроются, пока идёт проверка'))},
          !owner&&confirmed&&!b.terms?.actual_checkin&&!b.terms?.checkin_reported_at&&lateOpen(lateStay(b),data.serverTime)&&{title:lateLabel(lateStay(b)),kind:'main',swipe:tr('Проведите: {what}',{what:lateLabel(lateStay(b)).toLowerCase()}),onSwipe:()=>swiped('bookings/'+id,{action:'report_late'}),onPress:()=>confirm('bookings/'+id,{action:'report_late'},tr('Предупредить владельца, что вы приедете на час позже; бронь сохранится')),...(lateNote(lateStay(b),data.serverTime)?{note:lateNote(lateStay(b),data.serverTime)}:{})},
          !owner&&confirmed&&started&&!b.terms?.checkout_reported_at&&{title:tr('Сообщить {ofLeave}',{ofLeave:wordsOf(b).ofLeave}),kind:'main',swipe:tr('Проведите: {what}',{what:wordsOf(b).swipeOut}),onSwipe:()=>swiped('bookings/'+id,{action:'report_checkout'}),onPress:()=>confirm('bookings/'+id,{action:'report_checkout'},tr('Сообщить {ofLeave}? Владелец или ИИ-администратор подтвердит.',{ofLeave:wordsOf(b).ofLeave}))},
          {title:tr('Открыть чат'),kind:'side',onPress:()=>{setChatInitial({kind:'booking',entityId:id,channel:'stay'});setPageId('chats');}},
          // After a refund the guest closes the money or opens an appeal about this transfer (lib/service.ts refund_missing).
          !owner&&closed&&returned>0&&!b.terms?.refund_confirmed_at&&{title:tr('Возврат получен · {v}',{v:money(returned)}),kind:'main',swipe:tr('Проведите: возврат получен'),onSwipe:()=>swiped('bookings/'+id,{action:'refund_received'}),onPress:()=>confirm('bookings/'+id,{action:'refund_received'},tr('Подтверждаю: возврат {v} получен',{v:money(returned)}))},
          !owner&&closed&&returned>0&&{title:tr('Деньги не пришли'),kind:'side',onPress:()=>confirm('bookings/'+id,{action:'refund_missing'},tr('Сообщить, что возврат не пришёл'),undefined,tr('Откроется обращение по этому переводу. Его увидят владелец и администратор сервиса.'))},
          (confirmed||closed&&!owner&&moneyMoved||b.status==='completed'&&(owner||!!b.terms?.deposit_kept||b.handover?.verdict==='issues'))&&{title:tr('Есть проблема'),kind:'side',onPress:()=>raiseIssue('booking',id,actor)},
          // The owner moved the flat after the guest booked (publication audit 2026-11-22): once a person checked the new address,
          // the guest accepts it or cancels for free; until then the card keeps the address the guest agreed to.
          !owner&&['requested','confirmed'].includes(b.status)&&b.address_change?.state==='offered'&&{title:tr('Принять новый адрес'),kind:'main',note:b.address_change.next?tr('Новый адрес: {v}',{v:b.address_change.next}):undefined,onPress:()=>confirm('bookings/'+id,{action:'address_accept'},tr('Принять новый адрес'),undefined,b.address_change.next?tr('Новый адрес: {v}. Бронь останется в силе.',{v:b.address_change.next}):tr('Бронь останется в силе. Точный адрес откроется после подтверждения брони.'))},
          ['requested','confirmed'].includes(b.status)&&!b.terms?.actual_checkin&&{title:!owner&&b.address_change?tr('Отменить бесплатно'):tr('Отменить бронь'),kind:'danger',onPress:()=>confirm('bookings/'+id,{action:'cancel'},!owner&&b.address_change?tr('Отменить бронь из-за смены адреса'):tr('Отменить бронь'),undefined,cancelLine(b.cancel_terms,owner,b.terms?.paid_amount||0)+'.')},
          // Money after the stay or a cancellation: the owner marks each transfer in one tap, the amount is on the button.
          owner&&['cancelled','expired'].includes(b.status)&&refundLeft(b)>0&&{title:tr('Вернул гостю {v}',{v:money(refundLeft(b))}),kind:'main',swipe:tr('Проведите: вернул гостю {v}',{v:money(refundLeft(b))}),onSwipe:()=>swiped('bookings/'+id,{action:'record_refund',confirmed:true},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'record_refund',confirmed:true},tr('Вернул гостю {v}',{v:money(refundLeft(b))}),'owner-bookings',tr('Подтверждаю, что уже перевёл гостю эту сумму за отменённую бронь.'))},
          owner&&['completed','cancelled','expired'].includes(b.status)&&b.terms?.deposit_balance>0&&{title:tr('Вернул депозит {v}',{v:money(b.terms.deposit_balance)}),kind:handed==='ask'?'side':'main',swipe:tr('Проведите: вернул депозит {v}',{v:money(b.terms.deposit_balance)}),onSwipe:()=>swiped('bookings/'+id,{action:'record_deposit_return',confirmed:true},'owner-bookings'),onPress:()=>confirm('bookings/'+id,{action:'record_deposit_return',confirmed:true},tr('Вернул депозит {v}',{v:money(b.terms.deposit_balance)}),'owner-bookings',tr('Подтверждаю, что уже перевёл гостю депозит.'))},
          // Damage after the stay: the owner keeps a part of the deposit once, with a reason the guest sees.
          owner&&b.status==='completed'&&b.terms?.deposit_status==='owner_verified'&&b.terms?.deposit_balance>0&&!b.terms?.deposit_kept&&{title:tr('Удержать часть депозита'),kind:'side',onPress:()=>beginFlow('keep-deposit',[{key:'amount',text:tr('Какую сумму удержать из депозита {v}? Гость увидит сумму и причину.',{v:money(b.terms.deposit_balance)}),label:tr('Удержать, ₸'),min:1,max:b.terms.deposit_balance},{key:'reason',text:tr('За что удерживаете? Напишите коротко, что повреждено или пропало.'),label:tr('Причина')}],{},'bookings/'+id,'owner-bookings','owner',{action:'keep_deposit'})},
        ]}/>


      </Fragment>;
    })}</View>;
    if(m.block==='jobs')return <View>{byTime(payload.ids,data.jobs).map(({id,title}:{id:string;title:string})=>{
      const j=data.jobs.find((j:Row)=>j.id===id);if(!j)return null;const owner=j.owner_id===userId&&payload.role==='owner',assigned=j.assigned_to===userId&&!owner;
      const applied=data.applications.some((a:Row)=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
      const application=data.applications.find((a:Row)=>a.job_id===id&&a.user_id===userId);
      const home=j.booking_id===null&&!!homeOrderOf(j.description),hired=!!j.assigned_to&&j.assigned_to!==j.owner_id,lateDue=j.status==='cancelled'&&j.cancel_fee>0?Math.max(0,j.cancel_fee-(j.settlement_paid||0)):0,gotSum=j.status==='cancelled'?Number(j.cancel_fee)||0:Number(j.fee)||0,stars=(n:number)=>'★'.repeat(n)+'☆'.repeat(5-n);
      const clock=data.serverTime||Date.now()/1000,running=j.status==='in_progress',reported=['submitted','completed'].includes(j.status),canClaim=owner&&hired&&(j.status==='submitted'||j.status==='completed'&&(j.completed_at||0)>=clock-HOME_DAMAGE_WINDOW),thread=owner?cleaningThread(j,data,clock):assigned?jobThread(j,data,clock):null;
      const nextBox=<CleanerNextBox job={j} application={application} admission={application?.admission??data.profile?.admission} userId={userId||''} busy={busy} onRequestReview={()=>perform('operations/reviews/request',{reference:'Отклик на уборку: проверьте анкету исполнителя.'},uid())}/>;
      return <Fragment key={id}>{!!title&&!(m.id!=='page-jobs'&&m.id.startsWith('page-')&&!firstTabNow)&&<Text accessibilityRole="header" style={s.groupTitle}>{title}</Text>}<DealCard kind="job" compact={m.id.startsWith('page-')} startOpen={recordGroup(j,clock)==='now'} item={j} role={payload.role} userId={userId||''} application={application} thread={thread} busy={busy} onMap={onMap('job',id)}
        always={<>{owner&&j.status==='open'&&!isUnclaimed(j,Date.now()/1000)&&<ApplicantPick applications={data.applications.filter((a:Row)=>a.job_id===id&&a.status==='pending')} approvals={data.approvals||[]} busy={busy} onDecide={body=>perform('approvals',body,uid())}/>}{running&&<ActivityTimer kind="job" item={j}/>}{(owner||assigned)&&<OverdueHelp job={j} role={owner?'owner':'cleaner'} busy={busy} onAction={body=>perform('jobs/'+id,body,uid(),owner?'owner-jobs':'my-jobs')}/>}{owner&&hired&&(j.status==='completed'&&j.fee>(j.settlement_paid||0)||lateDue>0)&&<PayTo title={tr('Переведите исполнителю')} to={j.cleaner_pay} amount={lateDue>0?lateDue:j.fee-(j.settlement_paid||0)} parts={lateDue>0?tr('За позднюю отмену уборки'):undefined} missing={tr('Исполнитель ещё не указал, куда переводить. Спросите его в чате уборки.')} note={tr('Оплата идёт исполнителю напрямую, сервис её не принимает.')}>{j.status==='completed'&&<Receipts key={'receipts:'+id} kind="job" id={id} role="owner" count={Number(j.receipts)||0} canAdd/>}</PayTo>}{!owner&&assigned&&j.status==='completed'&&!j.payment_received_at&&Number(j.receipts)>0&&<Receipts key={'receipts:'+id} kind="job" id={id} role="cleaner" count={Number(j.receipts)||0} title={tr('Чек заказчика')}/>}{!owner&&assigned&&j.status==='completed'&&!j.settled_at&&j.fee>0&&!data.payout&&<Text style={[s.meta,{color:C.warning}]}>{tr('Заказчик не видит, куда платить. Укажите номер Kaspi: Меню, «Настройки», «Реквизиты для оплаты».')}</Text>}{!owner&&!thread&&nextBox}</>}
        details={<>{!owner&&<JobPlace job={j}/>}{assigned&&['assigned','in_progress'].includes(j.status)&&<CheckinGuide key={'access:'+id} bookingId={id} role="cleaner"/>}{owner&&!!j.worker&&<View style={applicantStyles.assigned}><WorkerRow worker={j.worker} label={tr('Исполнитель')}/></View>}<RecordFacts rows={[owner&&j.description&&[tr('Что сделать'),j.description],j.address&&[tr('Адрес'),j.address+(j.owner_contact?' · '+j.owner_contact:''),true],j.report&&[tr('Отчёт'),j.report],j.status==='cancelled'&&j.cancel_fee>0&&[tr('За позднюю отмену'),money(j.cancel_fee)+(lateDue?'':tr(' · оплачено'))],!!j.rating&&[owner?tr('Ваша оценка'):tr('Оценка заказчика'),stars(j.rating)+(j.rating_note?' «'+j.rating_note+'»':'')]]}/>{(owner||assigned)&&hired&&reported&&<>{owner&&<><JobPhotos jobId={id} phase="before" role="owner" readOnly title={tr('До уборки')}/><JobPhotos jobId={id} phase="after" role="owner" readOnly title={tr('После уборки')}/></>}<JobPhotos key={'damage:'+j.version} jobId={id} phase="damage" role={owner?'owner':'cleaner'} readOnly title={tr('Фото повреждений')}/></>}{!running&&<ActivityTimer kind="job" item={j}/>}{!owner&&!!thread&&nextBox}</>}
        actions={[
          owner&&j.status==='completed'&&!!j.assigned_to&&j.fee>(j.settlement_paid||0)&&{title:tr('Оплатил уборку {v}',{v:money(j.fee-(j.settlement_paid||0))}),kind:'main',swipe:tr('Проведите: оплатил {v}',{v:money(j.fee-(j.settlement_paid||0))}),onSwipe:()=>swiped('jobs/'+id,{action:'record_job_payment',confirmed:true},'owner-jobs'),onPress:()=>confirm('jobs/'+id,{action:'record_job_payment',confirmed:true},tr('Оплатил уборку {v}',{v:money(j.fee-(j.settlement_paid||0))}),'owner-jobs',tr('Подтверждаю, что уже перевёл исполнителю эту сумму.'))},




          // A home order cancelled after the free term: the customer owes the performer a part of the sum.
          owner&&lateDue>0&&{title:tr('Оплатил за отмену {v}',{v:money(lateDue)}),kind:'main',swipe:tr('Проведите: оплатил за отмену {v}',{v:money(lateDue)}),onSwipe:()=>swiped('jobs/'+id,{action:'record_job_payment',confirmed:true},'owner-jobs'),onPress:()=>confirm('jobs/'+id,{action:'record_job_payment',confirmed:true},tr('Оплатил за отмену {v}',{v:money(lateDue)}),'owner-jobs',tr('Подтверждаю, что уже перевёл исполнителю эту сумму.'))},
          assigned&&lateDue>0&&{title:tr('Не получил оплату'),kind:'side',onPress:()=>confirm('jobs/'+id,{action:'issue',issue:'Исполнитель не получил '+money(lateDue)+' за позднюю отмену уборки.'},tr('Сообщить, что оплата за отмену не пришла'),'my-jobs',tr('Заказчик и администратор сервиса получат сообщение.'))},
          // After the acceptance: the rating first once the work is paid, the complaint about damage for two days.
          owner&&j.status==='completed'&&hired&&!j.rating&&{title:tr('Оценить исполнителя'),kind:j.fee>(j.settlement_paid||0)?'side':'main',onPress:()=>say(tr('Оцените работу исполнителя.'),'rate',{id})},
          canClaim&&{title:tr('Сообщить об ущербе'),kind:'side',onPress:()=>say(tr('Сфотографируйте повреждение и опишите, что случилось.'),'damage',{id})},
          // The customer changes their mind: the terms are said before the confirmation (free term, then a part of the sum).
          owner&&home&&['open','assigned'].includes(j.status)&&{title:tr('Отменить уборку'),kind:'danger',onPress:()=>{const terms=homeCancel(j,clock);confirm('jobs/'+id,{action:'cancel',expectedFee:terms.fee},tr('Отменить уборку'),'owner-jobs',homeCancelLine(terms,tr('до {v}',{v:date(terms.freeUntil)})));}},
          // Accepted and still not paid by the owner: one tap opens an issue the service administrator sees too.
          // «Деньги получены»: the performer confirms the owner's direct transfer; if nothing came, the service administrator is told.
          assigned&&!owner&&!!j.settled_at&&!j.payment_received_at&&!j.guarantee&&gotSum>0&&{title:tr('Деньги получены · {v}',{v:money(gotSum)}),kind:'main',swipe:tr('Проведите: получено {v}',{v:money(gotSum)}),onSwipe:()=>swiped('jobs/'+id,{action:'payment_received'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'payment_received'},(j.status==='cancelled'?tr('Подтверждаю: {sum} за отмену уборки получены',{sum:money(gotSum)}):tr('Подтверждаю: {sum} за уборку получены',{sum:money(gotSum)})),'my-jobs')},
          assigned&&!owner&&!!j.settled_at&&!j.payment_received_at&&!j.guarantee&&gotSum>0&&{title:tr('Деньги не пришли'),kind:'side',onPress:()=>confirm('jobs/'+id,{action:'issue',issue:'Заказчик отметил оплату '+money(gotSum)+(j.status==='cancelled'?' за отмену уборки':' за уборку')+', но исполнитель её не получил.'},tr('Сообщить, что деньги за уборку не пришли'),'my-jobs',tr('Заказчик и администратор сервиса получат сообщение.'))},
          assigned&&j.status==='completed'&&!j.settled_at&&!j.guarantee&&j.fee>(j.settlement_paid||0)&&{title:tr('Не получил оплату'),kind:'side',onPress:()=>confirm('jobs/'+id,{action:'issue',issue:'Исполнитель не получил оплату '+money(j.fee-(j.settlement_paid||0))+' за уборку.'},tr('Сообщить, что оплата за уборку не пришла'),'my-jobs',tr('Владелец и администратор сервиса получат сообщение.'))},
          !owner&&j.status==='open'&&!applied&&{title:tr('Откликнуться'),kind:'main',swipe:tr('Проведите: беру эту уборку'),onPress:()=>perform('jobs/'+id,{action:'apply'},m.id)},
          !owner&&j.status==='open'&&application?.status==='pending'&&{title:tr('Отозвать отклик'),kind:'side',onPress:()=>confirm('jobs/'+id,{action:'withdraw'},tr('Отозвать отклик на эту уборку'),'jobs')},
          // The guest left without a word: the cleaner at the door says so, and the owner (or the autopilot) confirms the checkout.
          assigned&&j.status==='assigned'&&!!j.booking_id&&!j.checkout_confirmed&&clock>=j.start-1800&&{title:tr('Гостя нет, жильё свободно'),kind:'main',swipe:tr('Проведите: гостя нет, жильё свободно'),onSwipe:()=>swiped('jobs/'+id,{action:'vacant'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'vacant'},tr('Сообщить владельцу, что гость ушёл и жильё свободно'),'my-jobs')},
          // A cleaning without a booking: the customer is at home and waits, so the performer says «Выезжаю» and «Я на месте».
          assigned&&j.status==='assigned'&&j.booking_id===null&&!j.arrived_at&&clock>=j.start-3600&&{title:tr('Я на месте'),kind:'main',swipe:tr('Проведите: я на месте'),onSwipe:()=>swiped('jobs/'+id,{action:'arrived'},'my-jobs'),onPress:()=>confirm('jobs/'+id,{action:'arrived'},tr('Сообщить заказчику, что вы на месте'),'my-jobs')},
          assigned&&j.status==='assigned'&&j.booking_id===null&&!j.arrived_at&&!j.on_way_at&&clock>=j.start-3*3600&&{title:tr('Выезжаю'),kind:clock>=j.start-3600?'side':'main',onPress:()=>swiped('jobs/'+id,{action:'on_way'},'my-jobs')},
          assigned&&j.status==='assigned'&&(j.booking_id!==null||!!j.arrived_at||clock<j.start-3600)&&{title:tr('Начать уборку'),kind:'main',onPress:()=>confirm('jobs/'+id,{action:'start'},tr('Отметить начало работы'),'my-jobs'),...(j.checkout_confirmed?{swipe:tr('Проведите: начинаю уборку'),onSwipe:()=>swiped('jobs/'+id,{action:'start'},'my-jobs')}:{disabled:true,note:tr('Начать можно после подтверждения выезда гостя.')})},
          assigned&&j.status==='assigned'&&clock>=j.start-3*3600&&clock<=j.start+2700&&{title:tr('Опаздываю'),kind:'side',onPress:()=>confirm('jobs/'+id,{action:'late'},tr('Предупредить владельца: вы начнёте на полчаса позже, время уборки сдвинется'),'my-jobs')},
          // Cannot come after all: said in advance, the cleaning goes back to the search and the owner hears at once.
          assigned&&j.status==='assigned'&&{title:tr('Отказаться от задания'),kind:'danger',onPress:()=>confirm('jobs/'+id,{action:'release'},tr('Отказаться от задания'),'my-jobs',tr('Уборка вернётся в поиск, владелец сразу узнает.'))},
          assigned&&j.status==='in_progress'&&{title:tr('Подготовить отчёт'),kind:'main',onPress:()=>say(home?tr('Проверьте каждый пункт. Отчёт уйдёт заказчику после вашего подтверждения.'):tr('Проверьте каждый пункт. Отчёт уйдёт владельцу после вашего подтверждения.'),'report',{id})},
          owner&&j.status==='submitted'&&{title:tr('Рассмотреть отчёт'),kind:'main',onPress:()=>say(tr('Отчёт на приёмке.'),'approval',{id:'report:'+id})},
          (owner&&!!j.assigned_to||assigned)&&{title:tr('Открыть чат'),kind:'side',onPress:()=>{setChatInitial({kind:'job',entityId:id,channel:'cleaning'});setPageId('chats');}},
          (owner&&!!j.assigned_to||assigned)&&{title:tr('Есть проблема'),kind:'side',onPress:()=>raiseIssue('job',id,owner?'owner':'cleaner')},
        ]}/>
      </Fragment>;
    })}{payload.role==='owner'&&m.id!=='deal'&&<Button title={tr('Создать уборку')} secondary disabled={busy} onPress={()=>send('Создать уборку')}/>}</View>;
    if(m.block==='rate')return m.done?null:<JobRating busy={busy} onSubmit={(rating,note)=>perform('jobs/'+payload.id,{action:'rate',rating,note},m.id,'owner-jobs')}/>;
    if(m.block==='damage')return m.done?null:<DamageClaim jobId={payload.id} busy={busy} onSubmit={text=>perform('jobs/'+payload.id,{action:'damage',text},m.id,'owner-jobs')}/>;
    if(m.block==='report')return <Report items={reportItems(data.jobs.find((j:Row)=>j.id===payload.id))} jobId={payload.id} job={data.jobs.find((j:Row)=>j.id===payload.id)} photos={!!data.jobs.find((j:Row)=>j.id===payload.id)?.photos_required} busy={busy||!!m.done} onSubmit={(body:Row)=>perform('jobs/'+payload.id,{action:'submit',...body},m.id,'my-jobs')}/>;
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
  const pageTabs:{tabs:{id:string;label:string}[];of:(item:Row)=>string;items:Row[];label:string}|null=pageId==='bookings'&&selectedRole==='owner'?{tabs:ownerRequestTabs,of:b=>ownerRequestTab(b,userId||'',data.serverTime||Date.now()/1000),items:data.bookings,label:tr('Заявки')}
   :pageId==='bookings'?{tabs:bookingTabs,of:b=>bookingTab(b,selectedRole||'',userId||''),items:data.bookings,label:tr('Брони')}
   :pageId==='cleaning'&&selectedRole==='owner'?{tabs:ownerJobTabs,of:ownerJobTab,items:data.jobs,label:tr('Уборки')}
   :pageId==='assignments'?{tabs:cleanerJobTabs,of:j=>cleanerJobTab(j,userId||'',data.applications.find((a:Row)=>a.job_id===j.id&&a.user_id===userId)),items:data.jobs.filter((j:Row)=>j.assigned_to===userId||data.applications.some((a:Row)=>a.job_id===j.id&&a.user_id===userId)),label:tr('Задания')}:null;
  // The owner's «Новые» also count the cleaners' responses shown above the guests' requests.
  const responses=pageId==='bookings'&&selectedRole==='owner'?ownerResponses(data,userId||'',data.serverTime||Date.now()/1000).reduce((n,r)=>n+r.count,0):0;
  const tabCount:Record<string,number>=pageTabs?{...tabCounts(pageTabs.tabs,pageTabs.items,pageTabs.of),...(responses?{new:tabCounts(pageTabs.tabs,pageTabs.items,pageTabs.of).new+responses}:{})}:{},tabNow=pageTabs?(tabPick[pageId]&&pageTabs.tabs.some(t=>t.id===tabPick[pageId])?tabPick[pageId]:firstTab(pageTabs.tabs,tabCount)):'',firstTabNow=pageTabs?.tabs[0]?.id===tabNow;
  const allIds:string[]=pageId==='catalog'?(byCity?cityFlats:data.properties).map((p:Row)=>p.id):pageId==='properties'?data.ownProperties.map((p:Row)=>p.id):pageTabs?pageTabs.items.filter((item:Row)=>pageTabs.of(item)===tabNow).sort((x:Row,y:Row)=>tabNow==='archive'?y.start-x.start:0).map((item:Row)=>item.id):data.jobs.map((j:Row)=>j.id);
  const ids=allIds.slice(0,listed.page===pageId?listed.count:12),hidden=allIds.length-ids.length;
  const primary:Message={id:'page-'+pageId,sender:'assistant',text:'',block:pageId==='overview'?(flow?undefined:'workspace'):pageId==='properties'||pageId==='catalog'?'properties':pageId==='bookings'?'bookings':['cleaning','jobs','assignments'].includes(pageId)?'jobs':undefined,payload:{ids,role:selectedRole,mode:selectedRole==='owner'?'owner':'guest'}};
  if(erasureResult)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.transcript}><View style={s.card}><Text style={s.cardTitle}>{tr('Результат удаления')}</Text><Text style={s.text}>{erasureResult.message}</Text><Text selectable style={s.meta}>{tr('Квитанция: {id}',{id:erasureResult.receipt.id})}</Text><Button title={tr('Продолжить')} onPress={()=>setErasureResult(null)}/></View></ScrollView></SafeAreaView>;
  // No account: the map as a guest sees it. Search, pins, cards and prices work; booking, the chats and the menu ask to sign in.
  if(!selectedRole&&ready&&!opening&&!data.user&&signIn===null)return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><KeyboardAvoidingView style={s.shell} behavior="padding">
    {offline}{!!linkError&&<Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}<View style={s.stage}><MapHome key="visitor" role="guest" accountId="" data={data} menu={<SignInButton busy={busy} onPress={()=>askSignIn('',null)}/>} onChanged={async()=>{}} onOpenPage={()=>askSignIn(tr('Войдите, чтобы открыть этот раздел.'),null)} onOpenProcess={()=>askSignIn('',null)} onAsk={text=>askSignIn(tr('Войдите, и ИИ-администратор ответит на ваш вопрос.'),{kind:'ask',text})} onIntent={(intent,stay)=>intent.startsWith('favorite:')?askSignIn(tr('Войдите, чтобы сохранять жильё в избранное.'),null):askSignIn(intent.startsWith('home-cleaning')?tr('Уборку своего жилья заказывает владелец: войдите по номеру телефона и выберите роль «Владелец».'):tr('Войдите, чтобы открыть объявление целиком. Даты и гости сохранятся.'),{kind:'open',intent,stay})} onBook={(property,stay)=>askSignIn(tr('Чтобы забронировать «{v}», войдите по номеру телефона. Даты и гости сохранятся.',{v:String(property.title||tr('жильё'))}),{kind:'book',property,stay})}/></View>
  <KeyboardBar/></KeyboardAvoidingView></SafeAreaView></ActivityClockProvider>;
  const legalDue=data.user&&((data as Row).legal as LegalState|undefined)?.missing?.length?(data as Row).legal as LegalState:null;
  if(!selectedRole)return <RoleEntry reason={signIn||undefined} onBack={!data.user&&signIn!==null?()=>{afterSignIn.current=null;setSignIn(null);}:undefined} start={joinRole} onStarted={()=>setJoinRole(null)} banner={offline} notice={linkError} ready={ready&&!opening} profile={data.profile} user={data.user} busy={busy} auth={<Auth titled={false} busy={busy} onSubmit={(mode,phone,password,name,city,recovery)=>authenticate(mode,phone,password,'entry','workspace',name,city,recovery)}/>} onChoose={chooseRole} onSave={async(body,role)=>{await request('/api/profile',body);await chooseRole(role);}} onLogout={()=>send('Выйти')}/>;
  return <ActivityClockProvider serverTime={data.serverTime}><SafeAreaView style={s.screen} edges={['top','bottom']}><KeyboardAvoidingView style={s.shell} behavior={pageId==='chats'?undefined:'padding'}>
    <RoleSheet visible={rolesOpen} role={selectedRole} roles={accountRoles} onClose={()=>setRolesOpen(false)} onPick={role=>void pickRole(role)} onJoin={role=>{setRolesOpen(false);setJoinRole(role);switchRole();}} onProfile={()=>{setRolesOpen(false);openPage('account');}}/>{offline}{!!linkError&&<Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}{processLinks.pending&&chatsActive&&<Text style={s.meta}>{tr('Ссылка откроется после закрытия диалога.')}</Text>}<View style={s.stage}>{/* The map is the only screen: it stays mounted, and every other page is a sheet over it. */}<View style={s.stage} pointerEvents={sheetOpen?'none':'auto'} importantForAccessibility={sheetOpen?'no-hide-descendants':'auto'} accessibilityElementsHidden={sheetOpen}><MapHome key={userId+':'+selectedRole+':'+mapSeq} role={selectedRole} accountId={userId} data={data} menu={<MapAccountButton role={selectedRole} avatarId={data.profile?.avatar_id} avatarName={data.profile?.name} open={pageId==='account'} busy={busy} onProfile={()=>openPage('account')} onRoles={()=>setRolesOpen(true)}/>} chats={<MapChatsButton busy={busy} unread={unread} onPress={()=>openPage('chats')}/>} onChanged={async()=>{await load();}} onOpenPage={id=>{scrollMessage.current=null;setPageId(id);}} onEdit={(id,step)=>{setPageId('overview');if(step==='settings')say(tr('Правила и готовность жилья.'),'property-settings',{id});else say('','property-editor',{id,step});}} onOpenProcess={(kind,id)=>openDeal(kind==='job'?'job':'booking',id)} onAsk={text=>{setInput('');setChatInitial({administrator:true,text,key:uid(),fromMap:true});setPageId('chats');}} onIntent={openMapIntent} onBook={bookFromMap} target={mapTarget} onTargetDone={()=>setMapTarget(null)} spot={dealOpen?{kind:deal!.kind==='review'?'property':deal!.kind,id:deal!.id}:null} cover={dealOpen?dealCover:0}/></View>{!sheetOpen&&!!toast&&<NoticeToast notice={toast.notice} more={toast.more} onDone={()=>setToast(null)} onPress={()=>{const open=noticeOpen(toast.notice.dedupe,data);setToast(null);if(open)openDeal(open.kind,open.id);else{setMenuStart(selectedRole!=='guest'&&String(toast.notice.dedupe||'').startsWith('service:')?'billing':'notices');openPage('account');}}}/>}{sheetOpen&&<View style={s.sheetLayer}>{!chatsActive&&<Pressable accessibilityLabel={tr('Вернуться на карту')} disabled={!!flow} onPress={backToMap} style={[s.sheetScrim,dealOpen&&s.sheetScrimDeal]}/>}<PageTransition page={pageId}><View onLayout={e=>setDealCover(Math.round(e.nativeEvent.layout.height))} style={[s.pageSheet,dealOpen?s.pageSheetFit:s.pageSheetFill,chatsActive&&s.pageSheetFull]}>{!chatsActive&&<View style={s.sheetHead}><View style={s.sheetGrab}/>{/* As an iOS sheet (Airbnb, Turo): a small title in the middle, the close button on the right. */}<View style={s.sheetSide}/><Text accessibilityRole="header" numberOfLines={1} style={s.sheetTitle}>{flow?'AiQonaq':dealOpen?(deal!.kind==='review'?t('Заявка на бронь'):deal!.kind==='booking'?tr('Бронь'):selectedRole==='owner'?tr('Уборка'):tr('Задание')):t(sheetName(selectedRole,pageId,page?.title||'AiQonaq',(data.ownProperties||[]).some((p:Row)=>['banya','sauna','banquet','cafe'].includes(p.details?.type))))}</Text>{!flow&&<Pressable accessibilityRole="button" accessibilityLabel={tr('Закрыть и вернуться на карту')} onPress={backToMap} style={({pressed})=>[s.sheetClose,pressed&&s.disabled]}><Text style={s.sheetCloseText}>✕</Text></Pressable>}</View>}{pageId==='chats'?<NativeChats key={userId+':'+selectedRole} accountId={userId} role={selectedRole} onChanged={load} initial={chatInitial} onInitialConsumed={()=>setChatInitial(null)} onConversationChange={setChatsActive} onAuthError={handleError} onReturnToMap={()=>setPageId('map')} mapLink={onMap} onOpenSubject={(kind,id)=>{try{const view=resolveProcessLink({role:selectedRole,section:kind==='booking'?'bookings':selectedRole==='owner'?'cleaning':'assignments',entityId:id},data,userId);setChatsActive(false);setPageId(view.section);if(view.block)say(tr('Открыто из чата.'),view.block,view.payload);}catch(e:any){setLinkError(e?.message||tr('Не удалось открыть.'));}}}/>:<><ScrollView ref={scroll} onScroll={e=>{scrollY.current=e.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} style={dealOpen?s.fitScroll:{flex:1}} contentContainerStyle={dealOpen?[s.transcript,s.fitContent]:s.transcript} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onContentSizeChange={()=>{if(messages[messages.length-1]?.sender==='user'||busy)scroll.current?.scrollToEnd({animated:true});}}><RevealProvider value={revealField}>
      {pageId==='overview'&&!dealOpen&&!flow&&nextTask&&!['booking','job'].includes(nextTask.kind)&&<Pressable accessibilityRole="button" accessibilityLabel={tr('Ассистент рекомендует: {title}',{title:nextTask.title})} disabled={busy} onPress={()=>openAssistantTask(nextTask)} style={[s.recommendation,nextTask.priority===3&&s.urgentRecommendation]}><Text style={s.recommendationLabel}>{tr('Ассистент рекомендует')}</Text><Text style={s.eventTitle}>{nextTask.title}</Text></Pressable>}
      {pageId==='account'?<AccountControl waiting={waitingFor(selectedRole,data,openDeal)} jobs={data.jobs||[]} userId={userId} staffPlaces={Number((data as Row).staffPlaces)||0} notices={data.notifications} start={menuStart} onOpenNotice={n=>{const open=noticeOpen(n.dedupe,data);return open?()=>openDeal(open.kind,open.id):undefined;}} onOpenEntry={openEntry} onOpenPage={id=>{scrollMessage.current=null;setPageId(id);scroll.current?.scrollTo({y:0,animated:false});}} role={selectedRole} onChanged={load} onSignedOut={signedOut} key={selectedRole} onEdit={()=>run('profile')} onSwitchRole={switchRole} onPickRole={role=>void pickRole(role)} onJoinRole={role=>{setJoinRole(role);switchRole();}} onAskAdministrator={()=>{setChatInitial({administrator:true});setPageId('chats');}} onLogout={()=>send('Выйти')}/>:pageId==='calendar'?<RentalCalendar data={data} role={selectedRole} busy={busy} onOpen={(kind,id)=>openDeal(kind==='job'?'job':'booking',id)}/>:<>{!!pageTabs&&!dealOpen&&(pageTabs.items.length>0||responses>0)&&<ListTabs tabs={pageTabs.tabs} label={pageTabs.label} value={tabNow} counts={tabCount} onChange={tab=>{setTabPick(v=>({...v,[pageId]:tab}));setListed({page:pageId,count:12});scroll.current?.scrollTo({y:0,animated:false});}}/>}{!!pageTabs&&!dealOpen&&pageTabs.items.length>0&&!allIds.length&&!(tabNow==='new'&&responses>0)&&<BrandEmpty text={tr('«{v}»: здесь пока ничего нет.',{v:(pageTabs.tabs.find(t=>t.id===tabNow)?.label||'')})}/>}{pageId==='catalog'&&cityFlats.length>0&&cityFlats.length<data.properties.length&&<View style={s.listScope}><Text style={[s.meta,{flex:1}]}>{byCity?homeCity+' · '+allIds.length:tr('Все города · {length}',{length:allIds.length})}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setAllCities(!allCities);setListed({page:pageId,count:12});}} style={({pressed})=>[s.listScopeLink,pressed&&s.disabled]}><Text style={s.listScopeText}>{byCity?tr('Показать все города'):tr('Только {homeCity}',{homeCity})}</Text></Pressable></View>}{dealOpen?deal!.kind!=='review'&&block({id:'deal',sender:'assistant',text:'',block:deal!.kind==='job'?'jobs':'bookings',payload:{ids:[deal!.id],role:selectedRole}}):primary.block&&!ownForm&&block(primary)}{!!primary.block&&!ownForm&&pageId!=='overview'&&hidden>0&&<Button title={tr('Показать ещё {v}',{v:Math.min(12,hidden)})} secondary disabled={busy} onPress={()=>setListed({page:pageId,count:ids.length+12})}/>}</>}
      {/* The menu is not a place for the last card of the conversation: it shows under every other page. */}
      {pageId!=='account'&&shown.map((m,index)=><View key={m.id} onLayout={event=>{const y=event.nativeEvent.layout.y;messageY.current[m.id]=y;if(index===shown.length-1&&m.sender==='assistant'&&m.id===scrollMessage.current&&scrolledTo.current[m.id]!==y){scrolledTo.current[m.id]=y;scroll.current?.scrollTo({y:Math.max(0,y-12),animated:true});}}} style={[s.message,m.sender==='user'?s.user:s.assistant]}>{m.sender==='assistant'&&!!m.text&&<Text style={s.sender}>AiQonaq</Text>}{!!m.text&&<Text selectable style={s.text}>{m.text}</Text>}{m.sender==='assistant'&&block(m)}</View>)}
      {earlier.length>0&&<HistoryFold key={selectedRole||''} messages={earlier} render={m=>block(m as Message)} onClear={()=>{const gone=new Set(earlier.map(m=>m.id));historyEnd.current='';setMessages(prev=>prev.filter(m=>!gone.has(m.id)));}}/>}
      {busy&&<Thinking label={tr('Ожидаем ответ сервера')} style={{alignSelf:'flex-start',marginBottom:20}}/>}
      {saveError&&<Text accessibilityRole="alert" style={s.error}>{tr('История ещё не сохранена. Проверьте связь; заявки хранятся на сервере.')}</Text>}
    </RevealProvider></ScrollView>
    {flow?<View style={s.composerWrap}>{flow?.questions[flow.index].choices&&<View style={s.buttonRow}>{flow.questions[flow.index].choices!.map(choice=><Button key={choice.value} title={choice.label} secondary disabled={busy} onPress={()=>send(choice.label)}/>)}</View>}{!!flow&&<View style={s.flowProgress}><Text style={s.flowLabel}>{tr('Вопрос {n} из {total}',{n:flow.index+1,total:flow.questions.length})}</Text><View style={s.buttonRow}>{flow.index>0&&<Button title={tr('Назад')} secondary disabled={busy} onPress={()=>{const previous={...flow,index:flow.index-1};setFlow(previous);say(previous.questions[previous.index].text);}}/>}<Button title={tr('Стоп')} secondary disabled={busy} onPress={()=>send('Стоп')}/></View></View>}{(()=>{const key=flow.questions[flow.index]?.key;return key==='city'||key==='districts'?<AnswerSuggest kind={key==='city'?'city':'district'} multi={key==='districts'} value={input} city={String(flow.answers.city||'')} onChoose={text=>{setInput(text);composer.current?.focus();}}/>:null;})()}<View style={s.composer}><TextInput ref={composer} accessibilityLabel={tr('Ваш ответ')} placeholder={tr('Ваш ответ…')} placeholderTextColor={C.muted} value={input} onChangeText={setInput} style={s.input} maxLength={2500} multiline submitBehavior="submit" onSubmitEditing={()=>send()} editable={ready&&!busy}/><Pressable accessibilityRole="button" accessibilityLabel={tr('Отправить сообщение')} accessibilityState={{disabled:!ready||busy||!input.trim()}} disabled={!ready||busy||!input.trim()} onPress={()=>send()} style={[s.send,(!input.trim()||busy)&&s.disabled]}><Text style={s.sendText}>{busy?tr('Ждите'):tr('Отправить')}</Text></Pressable></View><Text style={s.footnote}>{tr('Данные формы отправятся после проверки и подтверждения.')}</Text></View>:null}</>}</View></PageTransition></View>}</View>
  <KeyboardBar hidden={pageId==='chats'}/></KeyboardAvoidingView>{!!userId&&<CallCenter key={userId} userId={userId}/>}{legalDue&&!legalLater&&<LegalAccept legal={legalDue} role={selectedRole} onAccepted={()=>void load()} onLeave={()=>setLegalLater(true)}/>}</SafeAreaView></ActivityClockProvider>;
}
// What the performer confirms in the report: a home cleaning has its own list by its kind, the rest keep the usual four.
const REPORT_ITEMS=/* i18n */['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Жильё проверено перед заездом'];
// A home after guests is cleaned room by room (concept of 2026-11-25, «Уборка по списку»): the points stand under the room
// they belong to. The server keeps the ticks of 4 to 12 points, so the longer list goes as it is.
const REPORT_ROOMS:[string,string[]][]=/* i18n */[['Спальня',['Сменить бельё','Пыль и пол']],['Кухня',['Посуда и плита','Мусор вынести']],['Санузел',['Сантехника','Полотенца']],['Перед заездом',['Жильё проверено перед заездом']]];
const ROOM_ITEMS=REPORT_ROOMS.flatMap(([,list])=>list);
const roomOf=(label:string)=>REPORT_ROOMS.find(([,list])=>list.includes(label))?.[0]||'';
function reportItems(job?:Row){const order=homeOrderOf(job?.description);if(order)return homeChecklist(order);let type='';try{type=(typeof job?.property_details==='string'?JSON.parse(job.property_details):job?.property_details||{}).type||'';}catch{type='';}return ['banya','sauna','banquet','cafe'].includes(type)?REPORT_ITEMS:ROOM_ITEMS;}
// photos: the rules of the place ask for photos before and after (a home order always does), so the report cannot go without them.
// The list is ticked right here, point by point; when the last one is ticked (and the photos are there), the swipe
// «отправить отчёт» comes in its place. What the work pays and when it is due stay on the same screen.
function Report({items=REPORT_ITEMS,jobId,job,photos=false,busy,onSubmit}:{items?:string[];jobId?:string;job?:Row;photos?:boolean;busy:boolean;onSubmit:(body:Row)=>void}){
  const [checks,setChecks]=useState(()=>items.map(()=>false)),[report,setReport]=useState(''),[before,setBefore]=useState(0),[after,setAfter]=useState(0),need=photos&&!!jobId&&(!before||!after);
  const done=checks.filter(Boolean).length,left=items.length-done,ready=!left&&!need,toOwner=!photos;
  const rise=useRef(new Animated.Value(0)).current;
  useEffect(()=>{if(ready)Animated.spring(rise,{toValue:1,friction:7,tension:90,useNativeDriver:true}).start();else rise.setValue(0);},[ready]);
  const due=Number(job?.end)?dateText(new Date(Number(job!.end)*1000),{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}):'';
  const minutesLeft=Number(job?.end)?Math.max(0,Math.round((Number(job!.end)-Date.now()/1000)/60)):0;
  return <View style={[s.card,{gap:12}]}>
    {!!job&&<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><View style={{flex:1,gap:2}}><Text accessibilityRole="header" style={s.eventTitle}>{tr('Уборка · {done} из {length}',{done,length:items.length})}</Text><Text numberOfLines={1} style={s.meta}>{[job.title,Number(job.fee)>0?money(Number(job.fee)):''].filter(Boolean).join(' · ')}</Text></View>{!!due&&<View style={{minHeight:32,paddingHorizontal:12,borderRadius:T.radius.full,justifyContent:'center',backgroundColor:minutesLeft<=15?C.warningSoft:C.successSoft}}><Text style={[s.meta,{fontWeight:'700',color:minutesLeft<=15?C.warning:C.success}]}>{minutesLeft>0?tr('{m} мин',{m:minutesLeft}):tr('до {due}',{due})}</Text></View>}</View>}
    <View accessibilityRole="progressbar" accessibilityLabel={tr('Чек-лист: {done} из {length}',{done,length:items.length})} accessibilityValue={{min:0,max:items.length,now:done}} style={{gap:8}}>
      <View style={{flexDirection:'row',gap:4}}>{items.map((label,i)=><View key={label} style={{flex:1,height:4,borderRadius:2,backgroundColor:checks[i]?C.success:C.line}}/>)}</View>
    </View>
    <View>{items.map((label,i)=>{const last=left===1&&!checks[i],room=roomOf(label),head=!!room&&room!==roomOf(items[i-1]||'');return <React.Fragment key={label}>{head&&<Text accessibilityRole="header" style={[s.meta,{marginTop:i?12:0,fontWeight:'700',letterSpacing:.5}]}>{tr(room).toUpperCase()}</Text>}<Pressable accessibilityRole="checkbox" accessibilityLabel={tr(label)} accessibilityState={{checked:checks[i],disabled:busy}} disabled={busy} onPress={()=>setChecks(prev=>prev.map((v,k)=>k===i?!v:v))} style={({pressed})=>[{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line},pressed&&{opacity:.7}]}>
      <View style={{width:24,height:24,borderRadius:8,borderWidth:2,alignItems:'center',justifyContent:'center',borderColor:checks[i]?C.success:last?C.accent:C.lineStrong,backgroundColor:checks[i]?C.success:C.surface}}>{checks[i]&&<Text style={{color:C.surface,fontSize:14,fontWeight:'700',lineHeight:20}}>✓</Text>}</View>
      <Text style={[s.text,{flex:1},checks[i]&&{color:C.muted,textDecorationLine:'line-through'}]}>{tr(label)}</Text>{last&&<Text style={[s.meta,{color:C.accent,fontWeight:'600'}]}>{tr('Отметить')}</Text>}
    </Pressable></React.Fragment>;})}</View>
    {photos&&!!jobId&&<><JobPhotos jobId={jobId} phase="before" role="cleaner" title={tr('Фото до уборки')} disabled={busy} onCount={setBefore}/><JobPhotos jobId={jobId} phase="after" role="cleaner" title={tr('Фото после уборки')} disabled={busy} onCount={setAfter}/></>}
    <TextInput accessibilityLabel={tr('Замечания к отчёту')} style={s.field} placeholder={tr('Замечания, если есть')} placeholderTextColor={C.muted} multiline value={report} onChangeText={setReport} maxLength={1500} editable={!busy}/>
    {/* As in the concept: the swipe is there from the start, pale until the list (and the photos) are done. */}
    <Animated.View accessibilityLiveRegion="polite" style={{transform:[{scale:rise.interpolate({inputRange:[0,1],outputRange:[1,1.02]})}]}}><SwipeConfirm label={ready?(toOwner?tr('Проведите: отправить отчёт владельцу'):tr('Проведите: отправить отчёт заказчику')):left?tr('Сдать уборку · осталось {n}',{n:left}):tr('Сдать уборку · нужны фото')} disabled={busy||!ready} onConfirm={()=>onSubmit({checklist:checks,report:report.trim()||REPORT_DONE,...(items!==REPORT_ITEMS?{items}:{})})}/></Animated.View>
  </View>;
}
// «Нужно ваше решение» on top of «Уведомления»: the deals of the role whose next step is the person's own, one button each.
function waitingFor(role:Role,data:Row,open:(kind:'booking'|'job',id:string)=>void){
 const now=Number(data.serverTime)||Date.now()/1000,threads=role==='owner'?ownerThreads(data,now):role==='cleaner'?cleanerThreads(data,now):guestThreads(data,now,data.paymentMode);
 return threads.filter(t=>t.yours&&!t.finished).sort((a,b)=>Number(b.kind==='booking'&&b.current===0)-Number(a.kind==='booking'&&a.current===0)).map(t=>{const ask=t.kind==='booking'&&t.tag==='Бронь'&&t.current===0&&role==='owner';return {key:t.kind+':'+t.id,title:(ask?tr('Заявка'):tr(t.tag))+' · '+t.title,line:t.line,action:ask?tr('Ответить'):tr('Решить'),onPress:()=>open(t.kind,t.id)};});
}
// What the report says when the performer adds no remark of their own.
const REPORT_DONE='Всё сделано по чек-листу, замечаний нет.';
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
 const month=(at:number)=>{const t=dateText(new Date(at*1000),{timeZone:'Asia/Almaty',month:'long',year:'numeric'}).replace(/\s*г\.?$/,'');return t.charAt(0).toUpperCase()+t.slice(1);};
 return chosen.map((item,i)=>({id:item.id,title:i===0||month(chosen[i-1].start)!==month(item.start)?month(item.start):''}));
}
// The status bar is set once, here, for every screen: a screen that set none (the sign-in one) was left with the
// system's white signs on a light page after the splash had gone.
// Where the person is starts being known at launch, before sign-in, if they allowed it before (no prompt here).
// The typeface of the name is read before the first screen is drawn (the splash covers that moment); if the file
// cannot be read, the titles stay in the system typeface.
function Fonted({children}:{children:React.ReactNode}){const [fonts,fontError]=useFonts({Unbounded:require('./assets/fonts/Unbounded-SemiBold.ttf')});return fonts||fontError?<>{children}</>:null;}
// The language is known before the first frame (the phone's, then the saved choice: src/lang.ts); a change draws
// the whole app again, so every screen speaks the new language at once.
startLang();
setupNotifications();
export default function App(){useLang();return <SafeAreaProvider><View style={{flex:1}} onStartShouldSetResponderCapture={markGesture}><EntryStatusBar/><Fonted><Chat/></Fonted><LoadingBar/><BrandMoment/><RolePlate/><EntrySplash/></View></SafeAreaProvider>;}
