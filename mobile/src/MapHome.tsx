import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {ActivityIndicator,Animated,AppState,BackHandler,PanResponder,Platform,Pressable,ScrollView,Switch,Text,View,useWindowDimensions} from 'react-native';
import {NO_BUDGET} from '../../lib/map-search-request';
import {ApiError,isOffline,request} from './api';
import {Photo} from './ListingMedia';
import {date,labels,money,uid,type Role,type Row} from './model';
import {C} from './styles';
import {T} from './tokens';
import {TileMap,type MapPin} from './TileMap';
import {countdown,mapCities,validPoint,type MapPoint} from './map-math';
import {MapSheetHead} from './MapSheetHead';
import {NowCard as NowCardView} from './NowCard';
import {PAST_TEXT,chipDraft,freshDraft,guestRequestFromText,guestSummary,matchingBody,newDraft,shownReasons,type GuestDraft} from './ai-request';
import type {HeadAction} from './head-line';
import {nowCard,when,type NowCard} from './now-card';
import {Action,Stage,h,handleHeight,topInset} from './SheetParts';
import {GuestForm} from './GuestForm';
import {GuestResults} from './GuestResults';

// Map-first home screen, like a taxi app: a full-screen map and one bottom sheet.
// Collapsed, the sheet holds only the head (AI line, chips, the "Сейчас" card); expanded, the controls of the role.
// Every action goes through the same server rules as the web workspace: people only confirm facts.
type Publish=(pins:MapPin[],focusKey:string)=>void;
// The stay a guest books from the map: Kazakhstan time, as the request form keeps it.
export type MapStay={mode:'daily'|'hourly';start:string;end:string;guests:number};
// showNow: whether the "Сейчас" card has its place in the sheet as it is now (see MapHome).
type Common={setScanning:(on:boolean)=>void;accountId:string;data:Row;mapData:Row|null;city:string;publish:Publish;selected:string;setSelected:(key:string)=>void;snap:number;showNow:boolean;expand:(snap:number)=>void;onHead:(height:number)=>void;onReach:(bottom:number)=>void;onAsk:(text:string)=>void;onIntent:(intent:string,stay?:MapStay)=>void;onBook:(property:Row,stay:MapStay)=>void;onChanged:()=>Promise<unknown>;onOpenProcess:(kind:'booking'|'job',id:string)=>void;onOpenPage:(id:string)=>void};
const liveRequests=new Map<string,string>();
// What the guest searched for outlives a visit to another page (a flat's details, the check of a booking):
// coming back to the map within ten minutes shows the same conditions and the same list.
const guestSearches=new Map<string,{draft:GuestDraft;preview:Row|null;foundAt:number}>(),SEARCH_KEEP=600000;
const short=(amount:unknown)=>typeof amount==='number'&&amount>0?(amount>=10000?Math.round(amount/1000)+' тыс.':money(amount)):'Квартира';
const pointOf=(item:Row):MapPoint|null=>validPoint([item.location?.longitude,item.location?.latitude]);
const message=(error:unknown)=>error instanceof Error?error.message:'Действие не подтверждено. Обновите данные.';
// The server's clock, as of the last refresh of the state: a wrong clock on the phone must not change what is "now".
const serverNow=(data:Row)=>Number(data.serverTime)||Date.now()/1000;

function usePoll(task:()=>Promise<unknown>,ms:number,enabled:boolean){
 const latest=useRef(task);latest.current=task;
 useEffect(()=>{
  if(!enabled)return;let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{if(AppState.currentState==='active'){try{await latest.current();}catch{/* The panel shows its own error state. */}}if(live)timer=setTimeout(tick,ms);};
  void tick();return()=>{live=false;if(timer)clearTimeout(timer);};
 },[enabled,ms]);
}
// Reports the height of the sheet's collapsed content, so the collapsed sheet is exactly as tall as its head.
function HeadSlot({onHeight,children}:{onHeight:(height:number)=>void;children:ReactNode}){
 useEffect(()=>()=>onHeight(0),[]);
 return <View style={h.head} onLayout={e=>onHeight(Math.round(e.nativeEvent.layout.height))}>{children}</View>;
}
function openNow(card:NowCard|null,c:Pick<Common,'expand'|'onOpenProcess'|'onOpenPage'>){
 if(!card)return;const target=card.target;
 if(target.type==='process')c.onOpenProcess(target.kind,target.id);else if(target.type==='page')c.onOpenPage(target.id);else c.expand(1);
}
function useNow(active:boolean){const [now,setNow]=useState(Date.now()/1000);useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[active]);return now;}

function GuestPanel({setScanning,accountId,data,mapData,publish,selected,setSelected,snap,showNow,expand,onHead,onReach,onAsk,onIntent,onBook,onChanged,onOpenProcess,onOpenPage,picking,setPicking,mapCenter,city,setCity}:Common&{picking:boolean;setPicking:(value:boolean)=>void;mapCenter:React.RefObject<MapPoint|null>;setCity:(city:string)=>void}){
 const kept=useRef(guestSearches.get(accountId)).current,foundAt=useRef(kept?.foundAt||0),recent=!!kept?.preview&&Date.now()-kept.foundAt<SEARCH_KEEP;
 const [draft,setDraft]=useState<GuestDraft>(()=>kept?.draft||newDraft(city));
 // hint.ask: text the request rules could not read; the guest can still send it to the AI administrator.
 const [asked,setAsked]=useState(''),[hint,setHint]=useState<{text:string;ask?:string;error?:boolean}|null>(null),[refine,setRefine]=useState(false);
 const [preview,setPreview]=useState<Row|null>(recent?kept!.preview:null),[requestId,setRequestId]=useState(()=>liveRequests.get(accountId)||''),[live,setLive]=useState<Row|null>(null);
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[index,setIndex]=useState(0),[acceptedKey,setAcceptedKey]=useState(''),[skew,setSkew]=useState(0);
 const lock=useRef(false),requestKey=useRef(''),pickThenFind=useRef(false),bookedFlat=useRef<Row|null>(null);
 const active=!!requestId&&(!live||['searching','ready','booking'].includes(live.status)),now=useNow(active)+skew;
 // Any change of the conditions makes the shown results stale.
 const change=(next:GuestDraft)=>{if(next.city!==draft.city)setCity(next.city);setDraft(next);setPreview(null);setError('');setHint(null);};
 // A lost connection is already said by the line at the top of the screen; the sheet does not repeat it.
 async function guarded(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setWorking(true);setError('');try{await task();}catch(e){if(!isOffline(e))setError(message(e));}finally{lock.current=false;setWorking(false);}}
 // A search never starts in the past: a stay left from an earlier hour moves forward first.
 const find=(conditions:GuestDraft=draft)=>guarded(async()=>{
  const next=freshDraft(conditions);
  if(next.maxPrice&&Number(next.maxPrice)<100)throw new Error('Бюджет: от 100 ₸. Или оставьте поле пустым.');
  if(next.priority==='closer'&&!next.near)throw new Error('Чтобы искать ближе, сначала укажите точку на карте.');
  setDraft(next);
  const result=await request('/api/public/matching?q='+encodeURIComponent(JSON.stringify(matchingBody(next))));
  foundAt.current=Date.now();setPreview(result);setRefine(false);setSelected('');expand(1);
 });
 // The AI line: free text becomes the same conditions the form builds, then the usual search runs.
 // The text is read by rules, not by a model; what the rules cut or cannot take is said, never guessed.
 const ask=(text:string)=>{
  const parsed=guestRequestFromText(text,draft,Object.keys(mapCities));
  setError('');
  if(!parsed.understood){setHint({text:'Не понял запрос. Назовите день и срок, например: «завтра на сутки на двоих».',ask:text});return;}
  // Understood: the conditions line now says it, so the line is free for the next request (as on the site).
  setPreview(null);setAsked('');if(parsed.draft.city!==draft.city)setCity(parsed.draft.city);setDraft(parsed.draft);
  // A day or an hour that has passed is never moved to another one: the guest is asked for the date.
  if(parsed.past){setHint({text:[PAST_TEXT[parsed.past],parsed.note,'Укажите, когда нужно жильё.'].filter(Boolean).join(' '),error:true});setRefine(true);expand(2);return;}
  setHint(parsed.note?{text:parsed.note}:null);
  if(parsed.nearby&&!parsed.draft.near){pickThenFind.current=true;setPicking(true);expand(0);return;}
  void find(parsed.draft);
 };
 const chip=(action:HeadAction)=>{if(action!=='daily'&&action!=='hourly'&&action!=='weekend')return;const next=chipDraft(action,draft);setAsked('');setHint(null);setError('');setDraft(next);setPreview(null);void find(next);};
 // «Забронировать»: the price in the list is for the searched time. If that time has passed while the list was open, the search runs again first.
 const bookFlat=(property:Row)=>{if(freshDraft(draft).start!==draft.start){setHint({text:'Время начала уже прошло. Обновил варианты на ближайшее время.'});setSelected('');void find(draft);return;}onBook(property,{mode:draft.mode,start:draft.start,end:draft.end,guests:draft.guests});};
 // What narrows a search beyond the place, the time and the guests. An empty result offers to drop these and look again.
 const narrowed=!!(draft.district||draft.maxPrice||draft.features.length||draft.priority!=='balanced'||draft.near);
 const widen=()=>{const next:GuestDraft={...draft,district:'',maxPrice:'',features:[],priority:'balanced',near:null};setHint(null);setError('');setDraft(next);setPreview(null);void find(next);};
 const refining=snap>0&&(refine||!preview),toggleRefine=()=>{if(refining){setRefine(false);expand(preview?1:0);}else{setRefine(true);expand(2);}};
 useEffect(()=>{if(requestId||preview)expand(1);if(kept&&kept.draft.city!==city)setCity(kept.draft.city);},[]);
 useEffect(()=>{guestSearches.set(accountId,{draft,preview,foundAt:foundAt.current});},[draft,preview]);
 // A flat chosen in the list or on the map is shown in the opened sheet, which never closes for it.
 // A phone shorter than 700px opens the sheet fully, so that «Забронировать» is on screen.
 const lowScreen=useWindowDimensions().height<700;
 useEffect(()=>{if(!selected||!(preview||requestId))return;const need=preview&&!requestId&&lowScreen?2:1;if(snap<need)expand(need);},[selected]);
 useEffect(()=>{if(!picking)pickThenFind.current=false;},[picking]);
 const begin=()=>guarded(async()=>{
  requestKey.current||=uid();
  const result=await request('/api/operations/matching/begin',{...matchingBody(freshDraft(draft)),requestKey:requestKey.current,consent:true},undefined,undefined,'guest');
  liveRequests.set(accountId,result.id);setSkew(result.serverTime-Date.now()/1000);setLive(result);setRequestId(result.id);setIndex(0);setAccepted(false);expand(1);
 });
 const reset=()=>{liveRequests.delete(accountId);requestKey.current='';setRequestId('');setLive(null);setPreview(null);setAccepted(false);setIndex(0);};
 const cancel=()=>guarded(async()=>{if(active)await request('/api/operations/matching/cancel',{id:requestId},undefined,undefined,'guest');reset();});
 usePoll(async()=>{
  try{const result=await request('/api/operations/matching/state',{id:requestId},undefined,undefined,'guest');setSkew(result.serverTime-Date.now()/1000);setLive(result);}
  catch(e){if(e instanceof ApiError&&e.status===404)reset();else if(e instanceof ApiError)setError(e.message);}
 },3000,active);
 const offers:Row[]=live?.properties||[],offer=offers[Math.min(index,Math.max(0,offers.length-1))];
 // Consent belongs to one offer and its terms; a different offer shown after a poll is not accepted.
 const offerKey=offer?offer.offerId+':'+offer.estimate.amount+':'+offer.policy.version:'',accepted=!!offerKey&&acceptedKey===offerKey,setAccepted=(value:boolean|((v:boolean)=>boolean))=>setAcceptedKey((typeof value==='function'?value(accepted):value)?offerKey:'');
 const book=()=>guarded(async()=>{
  if(!offer||!live||!accepted)return;
  bookedFlat.current=offer;
  await request('/api/operations/matching/book',{id:live.id,offerId:offer.offerId,start:live.filters.start,end:live.filters.end,guests:Number(live.filters.guests),billingMode:live.filters.mode,expectedAmount:offer.estimate.amount,expectedPolicyVersion:offer.policy.version,acceptTerms:true},undefined,'match:'+live.id,'guest');
  const state=await request('/api/operations/matching/state',{id:live.id},undefined,undefined,'guest');setLive(state);await onChanged();
 });
 // Pins follow the stage: catalogue, checked candidates, then owners who are answering.
 const stageKey=requestId?'live':preview?'preview:'+preview.serverTime:'base:'+draft.city;
 useEffect(()=>{
  const pin=(p:Row,tone:MapPin['tone']):MapPin[]=>{const point=pointOf(p),amount=p.estimate?.amount??p.price;return point?[{key:p.id,point,title:p.title,label:short(amount),tone,rank:typeof amount==='number'?amount:0}]:[];};
  // A booking made: the flat that was booked stays on the map, green, and the rest leave it.
  if(requestId&&live?.status==='booked'){const flat=bookedFlat.current;publish(flat?pin(flat,'booked').map(p=>({...p,label:'✓ Бронь'})):[],'booked:'+live.id);}
  else if(requestId&&live)publish([...(live.pendingProperties||[]).flatMap((p:Row)=>pin(p,'pending')),...offers.flatMap(p=>pin(p,'offer'))],'live:'+live.id+':'+offers.length+':'+(live.pendingProperties||[]).length);
  else if(preview)publish(preview.properties.flatMap((p:Row)=>pin(p,p.quickRequest?'booking':'home')),stageKey);
  else publish((mapData?.properties||[]).flatMap((p:Row)=>pin(p,'home')),stageKey+':'+(mapData?.properties?.length||0));
 },[requestId,live,preview,mapData,draft.city]);
 // The radar on the map runs while flats are searched and while owners are being asked.
 const scanning=(working&&!requestId)||(!!requestId&&(!live||live.status==='searching'));
 useEffect(()=>{setScanning(scanning);return()=>setScanning(false);},[scanning]);
 useEffect(()=>{if(offers.length&&selected){const at=offers.findIndex(p=>p.id===selected);if(at>=0&&at!==index){setIndex(at);setAccepted(false);}}},[selected]);

 const pickView=<View style={h.block}><Text style={h.title}>Где ищем?</Text><Text style={h.note}>Передвиньте карту так, чтобы метка стояла в нужном месте. Владельцам точка не передаётся, для подбора она округляется.</Text>
  <Action title="Искать рядом с этой точкой" onPress={()=>{const c=mapCenter.current,near=c?{longitude:Math.round(c[0]*100)/100,latitude:Math.round(c[1]*100)/100,radius:5000}:null,search=pickThenFind.current&&!!near;pickThenFind.current=false;if(near)change({...draft,near});setPicking(false);if(search)void find({...draft,near});else expand(1);}}/>
  <Action secondary title="Отмена" onPress={()=>{const fromLine=pickThenFind.current;pickThenFind.current=false;setPicking(false);expand(fromLine?0:1);}}/></View>;

 const renderLive=()=>{
  const status=live?.status||'searching',booked=status==='booked',step=booked?3:status==='ready'||status==='booking'?2:1;
  const booking=booked?(data.bookings||[]).find((b:Row)=>b.id===live?.bookingId):null;
  return <View style={h.block}>
   <Stage steps={['Условия','Владельцы','Предложение','Бронь']} current={step}/>
   {!live&&<View style={h.row}><ActivityIndicator color={C.accent}/><Text style={h.note}>Восстанавливаем ваш подбор…</Text></View>}
   {live&&status==='searching'&&<>
    <Text accessibilityRole="header" style={h.cardTitle}>Спрашиваем владельцев</Text>
    <View style={h.row}><ActivityIndicator color={C.accent}/><Text style={h.note}>Ждём ответа: {live.pending} из {live.sent} запросов. На ответ у владельца 2 минуты.</Text></View>
    <Text style={h.timer} accessibilityLabel={'До конца подбора '+countdown(live.expiresAt-now)}>{countdown(live.expiresAt-now)}</Text>
    <Text style={h.note}>Квартиры, владельцы которых сейчас отвечают, отмечены на карте. Бронь на этом шаге не создаётся.</Text>
   </>}
   {live&&(status==='ready'||status==='booking')&&offer&&<>
    <Text accessibilityRole="header" style={h.cardTitle}>Владелец подтвердил готовность</Text>
    {offers.length>1&&<View style={h.row}><Action secondary title="← Назад" disabled={index===0} onPress={()=>{setIndex(index-1);setAccepted(false);setSelected(offers[index-1].id);}}/><Text style={h.note}>{index+1} из {offers.length}</Text><Action secondary title="Ещё →" disabled={index>=offers.length-1} onPress={()=>{setIndex(index+1);setAccepted(false);setSelected(offers[index+1].id);}}/></View>}
    <View style={h.card}>
     {!!offer.photos?.[0]&&<Photo id={offer.photos[0]} alt={offer.title+', фото'}/>}
     <Text style={h.cardTitle}>{offer.title}</Text><Text style={h.note}>{[offer.city,offer.district].filter(Boolean).join(' · ')}</Text>
     <Text style={h.price}>{money(offer.estimate.amount)}</Text>
     <Text style={h.note}>{date(Date.parse(live.filters.start)/1000)} → {date(Date.parse(live.filters.end)/1000)} · гостей: {live.filters.guests}{'\n'}Депозит отдельно: {offer.policy?.deposit?money(offer.policy.deposit):'не требуется'}</Text>
     {shownReasons(offer.match?.reasons,{maxPrice:String(live.filters.maxPrice)===NO_BUDGET?'':String(live.filters.maxPrice||'')}).map((reason:string)=><Text key={reason} style={h.reason}>✓ {reason}</Text>)}
     {!!offer.policy?.house_rules&&<Text style={h.note}>Правила: {offer.policy.house_rules}</Text>}
     <Text style={h.timerSmall}>Предложение действует ещё {countdown(offer.offerExpiresAt-now)}</Text>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} onPress={()=>setAccepted(v=>!v)} style={h.check}><Text style={h.checkBox}>{accepted?'☑':'☐'}</Text><Text style={h.checkText}>Принимаю стоимость, депозит и правила этой квартиры</Text></Pressable>
     <Action title={status==='booking'?'Оформляем…':'Забронировать'} disabled={working||!accepted||status==='booking'} onPress={book}/>
    </View>
    <Text style={h.note}>Оплата в приложении не списывается. {offer.policy?.auto_confirm?'Бронь подтвердится по правилам владельца.':'Владелец подтвердит заявку отдельно.'}</Text>
   </>}
   {live&&booked&&<>
    <Text accessibilityRole="header" style={h.cardTitle}>Заявка на бронь создана</Text>
    <Text style={h.note}>{booking?'Статус: '+(labels[booking.status]||booking.status)+'. ':''}Адрес и инструкции заезда появятся после подтверждения. Оплату отмечает владелец.</Text>
    <Action title="Открыть мои брони" onPress={()=>onOpenPage('bookings')}/><Action secondary title="Новый подбор" onPress={reset}/>
   </>}
   {live&&['empty','expired','cancelled'].includes(status)&&<>
    <Text accessibilityRole="header" style={h.cardTitle}>{status==='empty'?'Сейчас никто не подтвердил':status==='expired'?'Время подбора вышло':'Подбор отменён'}</Text>
    <Text style={h.note}>{status==='empty'?'Подходящие владельцы не ответили или отказали. Попробуйте изменить время, бюджет или район.':'Условия сохранены. Можно запустить подбор заново.'}</Text>
    <Action title="Изменить условия" onPress={reset}/><Action secondary title="Открыть каталог" onPress={()=>onOpenPage('catalog')}/>
   </>}
   {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
   {active&&<Action secondary danger title="Отменить подбор" disabled={working||status==='booking'} onPress={cancel}/>}
  </View>;
 };

 const quick=preview?preview.properties.filter((p:Row)=>p.quickRequest).length:0;
 // Under the line the collapsed sheet shows one thing: a message, the flat tapped on the map, or the "Сейчас" card.
 const picked=snap===0&&!preview&&selected?(mapData?.properties||[]).find((p:Row)=>p.id===selected):null;
 const card=showNow&&!picked&&!hint&&!error?nowCard('guest',data,serverNow(data)):null;
 // On a short phone the card lives in the opened sheet, but never above what the person has just asked for:
 // with the list of flats or the form opened by "Уточнить" on screen it goes under them.
 const cardBelow=snap>0&&(!!preview||refine),openCard=()=>openNow(card,{expand,onOpenProcess,onOpenPage});
 const head=<MapSheetHead role="guest" text={asked} onText={setAsked} onSend={ask} onChip={chip} busy={working} summary={guestSummary(freshDraft(draft))} onRefine={toggleRefine} refining={refining} now={cardBelow?null:card} onNow={openCard}>
  {!!hint&&<View style={h.picked}><Text accessibilityRole={hint.error?'alert':undefined} accessibilityLiveRegion="polite" style={hint.error?h.error:h.note}>{hint.text}</Text>{!!hint.ask&&<Action secondary title="Спросить AI администратора" onPress={()=>onAsk(hint.ask!)}/>}</View>}
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
  {picked&&<View style={h.listRow}><View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{picked.title}</Text><Text numberOfLines={1} style={h.note}>{[typeof picked.price==='number'?money(picked.price)+' за сутки':'',picked.district].filter(Boolean).join(' · ')}</Text></View><Action secondary title="Открыть" onPress={()=>onIntent('property:'+picked.id)}/></View>}
 </MapSheetHead>;
 // The form and the results live in the opened sheet only; a running request to owners keeps its place in any state.
 const body=requestId?renderLive():snap===0?null:preview&&!refine
  ?<GuestResults preview={preview} draft={draft} selected={selected} onSelect={setSelected} onBook={bookFlat} onOpen={property=>onIntent('property:'+property.id,{mode:draft.mode,start:draft.start,end:draft.end,guests:draft.guests})} onRefine={toggleRefine} onWiden={narrowed?widen:undefined} onAskOwners={quick>0?()=>void begin():undefined} onBookEdge={onReach} busy={working}/>
  :<GuestForm draft={draft} onChange={change} onPickPoint={()=>{setPicking(true);expand(0);}} onSubmit={()=>void find()} busy={working}/>;
 return <View style={h.block}>
  <HeadSlot onHeight={onHead}>{picking?pickView:requestId?null:head}</HeadSlot>
  {!picking&&body}
  {!picking&&!requestId&&cardBelow&&!!card&&<NowCardView card={card} onOpen={openCard}/>}
 </View>;
}

function OwnerPanel({data,mapData,publish,snap,showNow,expand,onHead,onAsk,onIntent,onChanged,onOpenProcess,onOpenPage}:Common){
 const [asked,setAsked]=useState('');
 const [inbox,setInbox]=useState<Row|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[ready,setReady]=useState<Record<string,boolean>>({}),[skew,setSkew]=useState(0);
 const lock=useRef(false),seen=useRef(0),now=useNow(!!inbox?.offers?.length)+skew;
 // An answer just sent shows on the flat's pin for a few seconds: «Ответ отправлен» after «Готов», the price again after a refusal.
 const [answered,setAnswered]=useState<Record<string,number>>({});
 useEffect(()=>{const keys=Object.keys(answered);if(!keys.length)return;const timer=setTimeout(()=>setAnswered({}),5000);return()=>clearTimeout(timer);},[answered]);
 const apply=(result:Row)=>{setSkew(result.serverTime-Date.now()/1000);setInbox(result);if(result.offers.length>seen.current)expand(1);seen.current=result.offers.length;};
 usePoll(async()=>{try{apply(await request('/api/operations/matching/inbox',{},undefined,undefined,'owner'));setError('');}catch(e){if(e instanceof ApiError)setError(e.message);}},3000,true);
 async function act(action:string,body:Row){if(lock.current)return;lock.current=true;setWorking(true);setError('');try{const property=action==='respond'?(inbox?.offers||[]).find((o:Row)=>o.id===body.offerId)?.property_id:'';apply(await request('/api/operations/matching/'+action,body,undefined,undefined,'owner'));if(property&&body.decision==='accept')setAnswered(v=>({...v,[property]:Date.now()}));if(action==='respond')await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking(false);}}
 const offers:Row[]=(inbox?.offers||[]).filter((o:Row)=>o.expires_at>now),processes:Row[]=mapData?.processes||[];
 useEffect(()=>{
  const asked=new Set(offers.map(o=>o.property_id));
  publish([...(mapData?.properties||[]).flatMap((p:Row):MapPin[]=>{const point=pointOf(p),sent=!!answered[p.id]&&!asked.has(p.id);return point?[{key:'property:'+p.id,point,title:p.title,label:asked.has(p.id)?'Запрос':sent?'Ответ отправлен':short(p.price),rank:typeof p.price==='number'?p.price:0,tone:asked.has(p.id)?'pending':sent?'offer':'home'}]:[];})],'owner:'+(mapData?.properties?.length||0));
 },[mapData,inbox,answered]);
 const clock=Date.now()/1000+skew,flats:Row[]=data.ownProperties||[];
 const card=showNow?nowCard('owner',data,clock,{quickOffers:inbox?.offers||[]}):null;
 return <View style={h.block}>
  <HeadSlot onHeight={onHead}><MapSheetHead role="owner" text={asked} onText={setAsked} onSend={text=>{setAsked('');onAsk(text);}} onChip={action=>{/* A guest waiting for a quick answer is in this sheet; other requests are on their page. */if(action==='requests'){if(offers.length)expand(1);else onOpenPage('bookings');}else if(action==='calendar')onOpenPage('calendar');else if(action==='add-property')onIntent('add-property');}} now={card} onNow={()=>openNow(card,{expand,onOpenProcess,onOpenPage})}>
   {snap===0&&!card&&Array.isArray(data.ownProperties)&&!flats.length&&<Text style={h.note}>Добавьте первую квартиру, и она появится на карте.</Text>}
  </MapSheetHead></HeadSlot>
  {snap>0&&<>
   {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
   {offers.length>0&&<Text accessibilityRole="header" style={h.cardTitle}>Гость ждёт ответа</Text>}
   {offers.map(o=><View key={o.id} style={[h.card,h.urgent]}>
    <View style={h.row}><Text style={[h.cardTitle,h.grow]}>{o.title}</Text><Text style={h.timerSmall} accessibilityLabel={'На ответ осталось '+countdown(o.expires_at-now)}>{countdown(o.expires_at-now)}</Text></View>
    <Text style={h.note}>{date(Date.parse(o.filters.start)/1000)} → {date(Date.parse(o.filters.end)/1000)}{'\n'}{o.filters.mode==='hourly'?'На часы':'На сутки'} · гостей: {o.filters.guests}</Text>
    <Text style={h.price}>{money(o.amount)}</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:!!ready[o.id]}} onPress={()=>setReady(v=>({...v,[o.id]:!v[o.id]}))} style={h.check}><Text style={h.checkBox}>{ready[o.id]?'☑':'☐'}</Text><Text style={h.checkText}>Квартира будет свободна и готова к этому заезду</Text></Pressable>
    <View style={h.pair}><View style={h.grow}><Action title="Готов принять" disabled={working||!ready[o.id]} onPress={()=>act('respond',{offerId:o.id,decision:'accept',ready:true})}/></View><View style={h.grow}><Action secondary title="Отказать" disabled={working} onPress={()=>act('respond',{offerId:o.id,decision:'decline'})}/></View></View>
    <Text style={h.note}>Ответ не создаёт бронь и не меняет цену. Если гость выберет вашу квартиру, заявка придёт в «Заявки гостей».</Text>
   </View>)}
   {processes.length>0&&<View style={h.card}>
    <Text accessibilityRole="header" style={h.label}>Сейчас в работе</Text>
    {processes.slice(0,6).map(p=><Pressable key={p.kind+p.id} accessibilityRole="button" onPress={()=>onOpenProcess(p.kind,p.id)} style={h.listRow}>
     <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{p.kind==='job'?'Уборка':'Заезд'} {when(p.start,clock)}</Text><Text numberOfLines={2} style={h.note}>{p.title} · {labels[p.status]||p.status}</Text></View>
     <Text style={h.rowPrice}>→</Text>
    </Pressable>)}
   </View>}
   <View style={h.card}>
    <Text accessibilityRole="header" style={h.label}>Мои квартиры</Text>
    {flats.slice(0,6).map(p=><Pressable key={p.id} accessibilityRole="button" accessibilityLabel={'Мои квартиры: '+p.title} onPress={()=>onOpenPage('properties')} style={h.listRow}>
     <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{p.title}</Text><Text numberOfLines={1} style={h.note}>{[typeof p.price==='number'?money(p.price)+' за сутки':'',p.district].filter(Boolean).join(' · ')}</Text></View>
     <Text style={h.rowPrice}>→</Text>
    </Pressable>)}
    {!flats.length&&<Text style={h.note}>Квартир пока нет.</Text>}
    <Action secondary title="Добавить квартиру" onPress={()=>onIntent('add-property')}/>
   </View>
   <View style={h.card}>
    <Text accessibilityRole="header" style={h.label}>Быстрые запросы гостей</Text>
    <Text style={h.note}>{!inbox?'Загружаем…':offers.length?'На ответ даётся 2 минуты.':'Новых запросов нет. На ответ даётся 2 минуты.'}</Text>
    {(inbox?.preferences||[]).map((p:Row)=><View key={p.id} style={h.listRow}><Text numberOfLines={2} style={[h.eventTitle,h.grow]}>{p.title}</Text><Switch accessibilityLabel={'Принимать быстрые запросы: '+p.title} value={!!p.enabled} disabled={working} onValueChange={enabled=>act('preference',{propertyId:p.id,enabled})} trackColor={{true:C.accent,false:C.line}}/></View>)}
    {!!inbox&&!inbox.preferences.length&&<Text style={h.note}>Включить можно после добавления квартиры.</Text>}
   </View>
  </>}
 </View>;
}

// What a job's pin says at each step; the change between them is what the map animates (see map-motion.ts).
function jobPin(status:string,applied:boolean):Pick<MapPin,'label'|'tone'>{
 if(status==='open')return applied?{label:'Отклик ✓',tone:'job'}:{label:'Уборка',tone:'job'};
 if(status==='in_progress')return {label:'Уборка идёт',tone:'active'};
 if(status==='submitted')return {label:'На приёмке',tone:'booking'};
 return {label:'Моё задание',tone:'offer'};
}
function CleanerPanel({data,mapData,city,publish,snap,showNow,expand,onHead,onAsk,onChanged,onOpenProcess,onOpenPage}:Common){
 const [asked,setAsked]=useState(''),clock=serverNow(data),card=showNow?nowCard('cleaner',data,clock):null;
 const [error,setError]=useState(''),[working,setWorking]=useState(''),lock=useRef(false);
 const userId=data.user?.id,jobs:Row[]=data.jobs||[],applications:Row[]=data.applications||[];
 const mine=jobs.filter(j=>j.assigned_to===userId&&['assigned','in_progress','submitted'].includes(j.status)).sort((a,b)=>a.start-b.start);
 const applied=(id:string)=>applications.some(a=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
 const open=jobs.filter(j=>j.status==='open'&&j.end>clock&&j.owner_id!==userId).sort((a,b)=>a.start-b.start);
 // "Рядом" is the city the map shows (the cleaner's own): the same open jobs as the pins, matched the way the server matches them.
 // Jobs in other cities are one tap away, on the page of all jobs.
 const nearby=open.filter(j=>String(j.city||'').toLocaleLowerCase('ru').includes(city.trim().toLocaleLowerCase('ru'))),nearbyIds=nearby.map(j=>j.id).join();
 useEffect(()=>{
  publish((mapData?.processes||[]).filter((p:Row)=>p.kind==='job'&&(p.status!=='open'||nearby.some(j=>j.id===p.id))).flatMap((p:Row):MapPin[]=>{const point=pointOf(p);return point?[{key:'job:'+p.id,point,title:p.title,...jobPin(p.status,applied(p.id))}]:[];}),'cleaner:'+(mapData?.processes?.length||0));
 },[mapData,nearbyIds,data.applications]);
 async function apply(id:string){if(lock.current)return;lock.current=true;setWorking(id);setError('');try{await request('/api/jobs/'+id,{action:'apply'},undefined,'map-apply:'+id,'cleaner');await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking('');}}
 return <View style={h.block}>
  <HeadSlot onHeight={onHead}><MapSheetHead role="cleaner" text={asked} onText={setAsked} onSend={text=>{setAsked('');onAsk(text);}} onChip={action=>{if(action==='nearby')expand(1);else if(action==='schedule')onOpenPage('calendar');}} now={card} onNow={()=>openNow(card,{expand,onOpenProcess,onOpenPage})}/></HeadSlot>
  {snap>0&&<>
   {mine.length>0&&<Text accessibilityRole="header" style={h.cardTitle}>Ваше задание</Text>}
   {mine.map(j=><View key={j.id} style={[h.card,h.urgent]}>
    <Stage steps={['Назначено','Выезд','Уборка','Приёмка']} current={j.status==='submitted'?3:j.status==='in_progress'?2:j.checkout_confirmed?1:0}/>
    <Text style={h.cardTitle}>{j.title}</Text><Text style={h.note}>{date(j.start)} → {date(j.end)}{j.address?'\n'+j.address:''}</Text><Text style={h.price}>{money(j.fee)}</Text>
    <Text style={h.note}>{j.status==='submitted'?'Отчёт у владельца на приёмке.':j.status==='in_progress'?'Уборка идёт. Подготовьте отчёт с фото.':j.checkout_confirmed?'Гость выехал, можно начинать.':'Ждём подтверждения выезда гостя.'}</Text>
    <Action title="Открыть задание" onPress={()=>onOpenProcess('job',j.id)}/>
   </View>)}
   {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
   <Text accessibilityRole="header" style={h.cardTitle}>Задания рядом · {city}</Text>
   {nearby.slice(0,8).map(j=><View key={j.id} style={h.card}>
    <View style={h.row}><Text style={[h.cardTitle,h.grow]}>{j.title}</Text><Text style={h.rowPrice}>{money(j.fee)}</Text></View>
    <Text style={h.note}>{j.district?j.district+'\n':''}{date(j.start)} → {date(j.end)}</Text>
    <View style={h.pair}><View style={h.grow}><Action title={applied(j.id)?'Отклик отправлен':working===j.id?'Отправляем…':'Откликнуться'} disabled={!!working||applied(j.id)} onPress={()=>apply(j.id)}/></View><View style={h.grow}><Action secondary title="Подробнее" onPress={()=>onOpenProcess('job',j.id)}/></View></View>
   </View>)}
   {!nearby.length&&<Text style={h.note}>{city}: открытых заданий сейчас нет. Адрес виден только назначенному исполнителю.</Text>}
   <Action secondary title={open.length>nearby.length?'Все задания · '+open.length:'Все задания'} onPress={()=>onOpenPage('jobs')}/>
  </>}
 </View>;
}
type Props = {
  role: Role;
  accountId: string;
  data: Row;
  menu?: ReactNode;
  onChanged: () => Promise<unknown>;
  onOpenProcess: (kind: 'booking' | 'job', id: string) => void;
  onOpenPage: (id: string) => void;
  onAsk: (text: string) => void;
  onIntent: (intent: string, stay?: MapStay) => void;
  onBook: (property: Row, stay: MapStay) => void;
};

// The screen itself: the map, the avatar button over it, and the sheet with its three positions
// (0: only the head, 1: a little over half of the screen, 2: almost all of it).
export function MapHome({ role, accountId, data, menu, onChanged, onOpenProcess, onOpenPage, onAsk, onIntent, onBook }: Props) {
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const [top, setTop] = useState(0);
  const [snap, setSnap] = useState(0);
  const [head, setHead] = useState(0);
  const [reach, setReach] = useState(0);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [focusKey, setFocusKey] = useState('');
  const [selected, setSelected] = useState('');
  const [mapData, setMapData] = useState<Row | null>(null);
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const host = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const mapCenter = useRef<MapPoint | null>(null);
  const sheet = useRef(new Animated.Value(0)).current;

  // Collapsed, the sheet is as tall as its head, and its top edge stays in the lower half of the screen.
  // A phone shorter than 700px never has the "Сейчас" card there, so a head taller than that is a message with
  // its button: the sheet may rise to 36% of the screen for it instead of hiding the button under the tabs.
  // A head that needs even more scrolls inside the sheet instead of being cut.
  const wanted = handleHeight + head + 12;
  const topEdge = screen.height >= 700 ? 0.5 : 0.36;
  const cap = Math.max(handleHeight + T.control.primary + 24, Math.round(top + height - screen.height * topEdge));
  const collapsed = head ? Math.min(cap, wanted) : Math.max(132, Math.round(height * 0.2));
  // A chosen flat is shown down to its «Забронировать»: the half-open sheet grows for it, so the button is never under the tabs.
  const full = Math.max(collapsed, Math.round(height * 0.88));
  const fit = role === 'guest' && selected && reach ? handleHeight + reach + 16 : 0;
  const heights = [collapsed, Math.min(full, Math.max(collapsed, Math.round(height * 0.55), fit)), full];
  const sheetHeight = height ? heights[snap] : 0;
  const scrollable = snap > 0 || !head || wanted > collapsed;
  // The "Сейчас" card is in the collapsed sheet on a phone tall enough for it (700px, as on the site). A shorter one keeps
  // the map: the collapsed sheet is the line and the chips, and the card is shown when the sheet is opened.
  const showNow = screen.height >= 700 ? snap === 0 : snap > 0;

  useEffect(() => {
    if (sheetHeight) Animated.timing(sheet, { toValue: sheetHeight, duration: T.motion.base, useNativeDriver: false }).start();
  }, [sheetHeight, sheet]);
  useEffect(() => {
    if (snap === 0) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [snap]);
  // What is chosen replaces the list in the same scroll view: it is shown from its top, not from where the list was.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (!selected) setReach(0);
  }, [selected]);

  // The sheet follows the finger and settles in the nearest position. The handle always drags it;
  // the rest of a collapsed sheet does too, because there is nothing to scroll there.
  const live = useRef({ snap, heights, bodyDrags: false });
  live.current = { snap, heights, bodyDrags: snap === 0 && !scrollable && !picking };
  const drag = useRef(
    (() => {
      const follow = (dy: number) => {
        const { snap: at, heights: all } = live.current;
        sheet.setValue(Math.max(all[0] - 16, Math.min(all[2], all[at] - dy)));
      };
      const release = (dy: number, vy: number) => {
        const { snap: at, heights: all } = live.current;
        const next = dy < -24 || vy < -0.5 ? Math.min(2, at + 1) : dy > 24 || vy > 0.5 ? Math.max(0, at - 1) : at;
        Animated.timing(sheet, { toValue: all[next], duration: T.motion.base, useNativeDriver: false }).start();
        if (next !== at) setSnap(next);
      };
      const vertical = (dx: number, dy: number, slop: number) => Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx) * 1.5;
      const handlers = {
        onPanResponderMove: (_e: unknown, g: { dy: number }) => follow(g.dy),
        onPanResponderRelease: (_e: unknown, g: { dy: number; vy: number }) => release(g.dy, g.vy),
        onPanResponderTerminate: () => release(0, 0)
      };
      return {
        handle: PanResponder.create({ onMoveShouldSetPanResponder: (_e, g) => vertical(g.dx, g.dy, 6), ...handlers }),
        // Capture: a swipe that starts on the "Сейчас" card or on a chip moves the sheet too.
        body: PanResponder.create({ onMoveShouldSetPanResponderCapture: (_e, g) => live.current.bodyDrags && vertical(g.dx, g.dy, 12), ...handlers })
      };
    })()
  ).current;

  // Android's back button closes what is open on this screen before it leaves the app.
  useEffect(() => {
    if (Platform.OS !== 'android' || (snap === 0 && !picking)) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) setPicking(false);
      else setSnap(0);
      return true;
    });
    return () => back.remove();
  }, [snap, picking]);

  // One city drives the map query, the viewport and the guest's request, so a picked point always lies in the searched city.
  const [city, setCity] = useState<string>(mapCities[data.profile?.city] ? data.profile.city : 'Павлодар');
  const cityRef = useRef(city);
  cityRef.current = city;
  const loadMap = async () => {
    const asked = cityRef.current;
    const result = await request('/api/operations/map/search', { filters: { city: asked } }, undefined, undefined, role);
    if (cityRef.current === asked) setMapData({ ...result, city: asked });
  };
  usePoll(loadMap, 30000, true);
  const firstCity = useRef(true);
  useEffect(() => {
    if (firstCity.current) {
      firstCity.current = false;
      return;
    }
    setMapData(null);
    loadMap().catch(() => {});
  }, [city]);

  const publish: Publish = (next, key) => {
    setPins(next);
    setFocusKey(key);
  };
  const common: Common = { setScanning, accountId, data, mapData, city, publish, selected, setSelected, snap, showNow, expand: setSnap, onHead: setHead, onReach: setReach, onAsk, onIntent, onBook, onChanged, onOpenProcess, onOpenPage };
  const center = mapCities[city] || validPoint(mapData?.center) || mapCities['Павлодар'];

  return (
    <View
      ref={host}
      style={h.host}
      onLayout={e => {
        setHeight(Math.round(e.nativeEvent.layout.height));
        host.current?.measureInWindow((_x, y) => setTop(Math.round(y) || 0));
      }}
    >
      <TileMap
        center={center}
        pins={pins}
        selected={selected}
        onSelect={setSelected}
        bottomInset={Math.min(sheetHeight, Math.round(height * 0.5))}
        topInset={topInset}
        focusKey={focusKey}
        picking={picking}
        scanning={scanning}
        onCenter={c => {
          mapCenter.current = c;
        }}
      />
      {!!menu && <View style={h.menu}>{menu}</View>}
      <Animated.View style={[h.sheet, { height: sheet }]} accessibilityViewIsModal={false}>
        <View {...drag.handle.panHandlers}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={snap === 0 ? 'Развернуть панель' : 'Свернуть панель'}
            onPress={() => setSnap(snap === 0 ? 1 : 0)}
            style={h.handleArea}
          >
            <View style={h.handle} />
          </Pressable>
        </View>
        <View style={h.grow} {...drag.body.panHandlers}>
          <ScrollView ref={scroll} scrollEnabled={scrollable} keyboardShouldPersistTaps="handled" contentContainerStyle={h.sheetContent} showsVerticalScrollIndicator={false}>
            {role === 'guest' ? (
              <GuestPanel {...common} picking={picking} setPicking={setPicking} mapCenter={mapCenter} setCity={setCity} />
            ) : role === 'owner' ? (
              <OwnerPanel {...common} />
            ) : (
              <CleanerPanel {...common} />
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
