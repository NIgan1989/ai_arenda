import {t as tr} from '../../lib/i18n';
import {background} from './loading';
import {ReliabilityBadge} from './Reliability';
import type {Reliability} from '../../lib/reliability-text';
import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {Thinking} from './Thinking';
import {AccessibilityInfo,Animated,AppState,BackHandler,Image,PanResponder,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
const backIcon=require('../assets/ui/chevron.png');
import {NO_BUDGET,plural} from '../../lib/map-search-request';
import {ApiError,isOffline,request} from './api';
import {Photo} from './ListingMedia';
import {date,labels,money,uid,type Role,type Row} from './model';
import {windowBadge} from '../../lib/window-badge';
import {dealBadge} from '../../lib/price-deal';
import {C} from './styles';
import {T} from './tokens';
import {LiveMap,type HeatPoint,type MapLine,type MapPin} from './LiveMap';
import {ownerPin,travellers,withAiResult} from './owner-map';
import {cleanerPin,dayRoute,routeLines,routeSummary} from './cleaner-map';
import {dealChain,marginLabel,ownerDeal,ownerMargin,ownerPinAct,pinAct,threadChain} from './pin-deal';
import {cleanerThreads,guestThreads,ownerThreads} from '../../lib/process-threads';
import {latestMove} from '../../lib/ai-move-marks';
import {TripHead,useTrip} from './Navigator';
import {SwipeConfirm} from './SwipeConfirm';
import {ROAD_BEAMS,beamOrigin,beams,mapMood,moodJoy,roadBeams,roadKey,type BeamRoads,type PinTone} from './map-motion';
import {MOOD_COLOR,MapMood} from './MapMood';
import {OwnerToday,ownerDay,timeLabel} from './OwnerToday';
import {cleanerWeek} from './CleanerEarnings';
import {BlockHead,DarkButton,DayLine,IconRow,NowFrame,PinRow,PlaceRow,QuietButton,TimeRow,type Dot} from './MainParts';
import {CleanerOffer} from './CleanerOffer';
import {getHere,locate,openLocationSettings,useHere} from './here';
import {hereNote,isFresh,nearestCity,type HereAction,type HereNote} from './here-rules';
import {countdown,mapCities,validPoint,type MapPoint} from './map-math';
import {MapSheetHead} from './MapSheetHead';
import {AutopilotThreads,type FeedNeed} from './AutopilotThreads';
import {AutopilotHandoff} from './AutopilotHandoff';
import {PlacePicker,RolePlate,type PickPlace} from './RolePlate';
import {takenNow} from './own-place';
import {cleaningAsk,BATH_TYPES as BATH_KINDS,allKinds,kindCategoryOf,isQuiet,occasionTitle,categoryOf,withKind,kindChoice,PAST_TEXT,nearPlace,placeMissedNote,pinPrice,askFirst,understoodNote,notUnderstoodNote,chipDraft,freshDraft,guestRequestFromText,matchingBody,newDraft,shownReasons,type GuestDraft} from './ai-request';
import type {HeadAction} from './head-line';
import {Action,Grip,SheetHeading,SheetRow,Stage,h,handleHeight,topInset} from './SheetParts';
import {GuestForm} from './GuestForm';
import {useFormCount} from './useFormCount';
import {GuestTokens} from './GuestTokens';
import {blamedTokens,guestTokens,type Section} from './guest-tokens';
import {GuestResults,emptyAnswer} from './GuestResults';
import {KindIcon} from './KindIcon';
import {narrowed as narrowFlats,rotateEquals,foundLine} from './guest-helpers';
import {AgainRow,Heart,useFavorites} from './Favorites';
import {favouredFirst,markOf} from './favorites';
import {GuestMode} from './GuestMode';
import {ArrivalStrip} from './ArrivalStrip';
import {arrivalOf,cardWords,countsAt,homeAt,pinWords,shiftDraft} from './arrival';
import {PriceTip,isAdviceTip,isRequestTip} from './PriceTip';
import {kindLabel} from '../../lib/listings';
import {guestPin,guestTrips} from '../../lib/guest-trips';
import type {HubTab} from '../../lib/property-hub';
import {cleanerLine,cleanerStep} from '../../lib/job-steps';
import {ownerWaiting} from '../../lib/now-card';
import {FlatHub,FlatHubHead} from './FlatHub';
import {RevealProvider,useKeyboardOpen,useKeyboardReveal} from './Keyboard';
import {ECHO_WINDOW,pinStates,recallMap,rememberMap,stageOf,targetPin,withEchoes,type MapTarget} from './map-memory';

// Map-first home screen, like a taxi app: a full-screen map and one bottom sheet.
// Collapsed, the sheet holds only the head (AI line, chips, the "Сейчас" card); expanded, the controls of the role.
// Every action goes through the same server rules as the web workspace: people only confirm facts.
// extra.lines: beams from the guest's search point to the objects being asked (guest);
// extra.heat and extra.sparks: demand around the owner's objects and guests asking right now (owner).
type MapExtra={lines?:MapLine[];heat?:HeatPoint[];sparks?:MapPoint[]};
type Publish=(pins:MapPin[],focusKey:string,extra?:MapExtra)=>void;
// The stay a guest books from the map: Kazakhstan time, as the request form keeps it.
// amount: the searched price of this stay, shown at the bottom of the place's page; the booking itself asks for a fresh quote.
export type MapStay={mode:'daily'|'hourly'|'nightly';start:string;end:string;guests:number;occasion?:string;amount?:number;host?:Reliability|null};
// showNow: whether the "Сейчас" card has its place in the sheet as it is now (see MapHome).
type Common={setFloat?:(bar:ReactNode|null)=>void;setFoot?:(bar:ReactNode|null)=>void;setScanning:(on:boolean)=>void;setQuiet:(on:boolean)=>void;accountId:string;data:Row;mapData:Row|null;city:string;publish:Publish;selected:string;setSelected:(key:string)=>void;focus:string;setFocus:(key:string)=>void;snap:number;showNow:boolean;expand:(snap:number)=>void;onHead:(height:number)=>void;onReach:(bottom:number)=>void;onAsk:(text:string)=>void;onIntent:(intent:string,stay?:MapStay)=>void;onBook:(property:Row,stay:MapStay)=>void;onChanged:()=>Promise<unknown>;onOpenProcess:(kind:'booking'|'job',id:string)=>void;onOpenPage:(id:string)=>void;onEdit?:(id:string,step:string|null)=>void;onChat?:(kind:'booking'|'job',id:string,call?:boolean)=>void;flyMe:()=>void;notify:(text:string)=>void};
const liveRequests=new Map<string,string>();
// The least room above an open card of a deal, under the buttons of the map, in which the pin of that deal is shown.
const SPOT_ROOM=72;
const NOT_ON_MAP='Этого нет на карте сейчас: у объекта не отмечено место или он в другом городе.';
// What the guest searched for outlives a visit to another page (a flat's details, the check of a booking):
// coming back to the map within ten minutes shows the same conditions and the same list.
// A city the guest chose themselves (in the line, in the conditions) is never moved to where the phone is.
const chosenCity=new Set<string>();
const guestSearches=new Map<string,{draft:GuestDraft;preview:Row|null;foundAt:number}>(),SEARCH_KEEP=600000;
const short=(amount:unknown)=>typeof amount==='number'&&amount>0?pinPrice(amount):tr('Жильё');
// «На ночь» books the tariff the search priced the home by: the owner's nightly price, or started days.
const tariffOf=(draft:GuestDraft,property:Row):MapStay['mode']=>draft.mode==='night'?(property.estimate?.billingMode==='nightly'?'nightly':'daily'):draft.mode;
const pointOf=(item:Row):MapPoint|null=>validPoint([item.location?.longitude,item.location?.latitude]);
// The guest's point, rounded as a picked one is: owners never get it, the search gets it to about a kilometre.
const nearOf=(point:MapPoint)=>({longitude:Math.round(point[0]*100)/100,latitude:Math.round(point[1]*100)/100,radius:5000});
const message=(error:unknown)=>error instanceof Error?error.message:tr('Действие не подтверждено. Обновите данные.');
// The server's clock, as of the last refresh of the state: a wrong clock on the phone must not change what is "now".
const serverNow=(data:Row)=>Number(data.serverTime)||Date.now()/1000;

function usePoll(task:()=>Promise<unknown>,ms:number,enabled:boolean){
 const latest=useRef(task);latest.current=task;
 useEffect(()=>{
  if(!enabled)return;let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{if(AppState.currentState==='active'){try{await background(()=>latest.current());}catch{/* The panel shows its own error state. */}}if(live)timer=setTimeout(tick,ms);};
  void tick();return()=>{live=false;if(timer)clearTimeout(timer);};
 },[enabled,ms]);
}
// Reports the height of the sheet's collapsed content, so the collapsed sheet is exactly as tall as its head.
function HeadSlot({onHeight,children}:{onHeight:(height:number)=>void;children:ReactNode}){
 useEffect(()=>()=>onHeight(0),[]);
 return <View style={h.head} onLayout={e=>onHeight(Math.round(e.nativeEvent.layout.height))}>{children}</View>;
}
function useNow(active:boolean){const [now,setNow]=useState(Date.now()/1000);useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[active]);return now;}

// The guest's answer on top of the map: back, the conditions in a capsule (a tap changes them), the filters, and the quick
// steps under them (concept of 2026-11-25, as Airbnb and Vrbo).
// The guest's top bar (concept of 2026-11-26): the type of place to stay at the start, then one plate with the city and
// what is chosen. The type opens the categories; the plate opens the filter of that type. There is no other way in.
function GuestFloatBar({title,line,busy,chips,choice,onKind,onEdit}:{title:string;line:string;busy:boolean;chips:ReactNode;choice:{id:string;title:string};onKind:()=>void;onEdit:()=>void}){
 return <><View style={h.capRow}><Pressable accessibilityRole="button" accessibilityLabel={tr('Категория: {title}. Выбрать',{title:choice.title})} disabled={busy} onPress={onKind} style={({pressed})=>[h.capRound,h.capKind,pressed&&h.dim]}><KindIcon id={choice.id} size={22} color={C.ink}/><Image source={backIcon} style={h.capChevron} accessibilityIgnoresInvertColors/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('Фильтр: {v}. Изменить',{v:[title,line].filter(Boolean).join(', ')})} disabled={busy} onPress={onEdit} style={({pressed})=>[h.capsule,h.capsuleRow,pressed&&h.dim]}><View style={h.grow}><Text numberOfLines={1} style={h.capTitle}>{title}</Text>{!!line&&<Text numberOfLines={1} style={h.capLine}>{line}</Text>}</View><View style={h.sliders}><View style={[h.slider,{width:16}]}/><View style={[h.slider,{width:10}]}/><View style={[h.slider,{width:16}]}/></View></Pressable></View>{chips}</>;
}
function GuestPanel({setFloat,setFoot,setScanning,setQuiet,accountId,data,mapData,publish,selected,setSelected,setFocus,snap,showNow,expand,onHead,onReach,onAsk,onIntent,onBook,onChanged,onOpenProcess,onOpenPage,onChat,picking,setPicking,mapCenter,city,setCity,aimed,flyMe,notify,held}:Common&{held:{point:MapPoint;n:number}|null;aimed:boolean;picking:boolean;setPicking:(value:boolean)=>void;mapCenter:React.RefObject<MapPoint|null>;setCity:(city:string)=>void}){
 // «На карте» from a page wins over the search the guest left: the panel starts clean in the target's city.
 const kept=useRef(aimed?undefined:guestSearches.get(accountId)).current,foundAt=useRef(kept?.foundAt||0),recent=!!kept?.preview&&Date.now()-kept.foundAt<SEARCH_KEEP;
 const [draft,setDraft]=useState<GuestDraft>(()=>kept?.draft||newDraft(city));
 // hint.ask: text the request rules could not read; the guest can still send it to the AI administrator.
 const [asked,setAsked]=useState(''),[lastAsk,setLastAsk]=useState(''),[hint,setHint]=useState<{text:string;ask?:string;error?:boolean}|null>(null),[refine,setRefine]=useState<Section|'all'|''>('');
 const [preview,setPreview]=useState<Row|null>(recent?kept!.preview:null),[requestId,setRequestId]=useState(()=>liveRequests.get(accountId)||''),[live,setLive]=useState<Row|null>(null);
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[index,setIndex]=useState(0),[acceptedKey,setAcceptedKey]=useState(''),[skew,setSkew]=useState(0);
 const lock=useRef(false),requestKey=useRef(''),pickThenFind=useRef(false),bookedFlat=useRef<Row|null>(null),askedFrom=useRef<MapPoint|null>(null);
 // «Заезд» under the map: the arrival the pins speak for (null: the searched one), and the arrival the strip was built round.
 const [arriveAt,setArriveAt]=useState<number|null>(null),around=useRef(kept?.draft?kept.draft.start+'+05:00':''),shiftTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),latestDraft=useRef(draft);latestDraft.current=draft;
 const active=!!requestId&&(!live||['searching','ready','booking'].includes(live.status)),now=useNow(active)+skew;
 // «Избранное»: the hearts and the homes of earlier stays; they come first in what the search finds.
 // Without an account a heart asks to sign in (App.tsx), instead of failing on the server.
 const {mine,toggle}=useFavorites(data,onChanged),heart=(id:string)=>{if(!accountId){onIntent('favorite:'+id);return;}void toggle(id).then(text=>{if(text)setError(text);});};
 // Any change of the conditions makes the shown results stale.
 const change=(next:GuestDraft,own=true)=>{if(next.city!==draft.city){setCity(next.city);if(own)chosenCity.add(accountId);}setDraft(next);setPreview(null);setError('');setHint(null);};
 // A lost connection is already said by the line at the top of the screen; the sheet does not repeat it.
 async function guarded(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setWorking(true);setError('');try{await task();}catch(e){if(!isOffline(e))setError(message(e));}finally{lock.current=false;setWorking(false);}}
 // A search never starts in the past: a stay left from an earlier hour moves forward first.
 // shift: the same search moved along the arrival strip; the map keeps its view and the sheet stays as it is.
 const find=(conditions:GuestDraft=draft,shift=false)=>guarded(async()=>{
  const next=freshDraft(conditions);
  if(next.maxPrice&&Number(next.maxPrice)<100)throw new Error(tr('Бюджет: от 100 ₸. Или оставьте поле пустым.'));
  if(next.priority==='closer'&&!next.near)throw new Error(tr('Чтобы искать ближе, сначала укажите точку на карте.'));
  setDraft(next);
  if(!shift){around.current=next.start+'+05:00';clearTimeout(shiftTimer.current);setArriveAt(null);}
  const result=await request('/api/public/matching?q='+encodeURIComponent(JSON.stringify({...matchingBody(next),around:around.current})));
  foundAt.current=Date.now();
  const properties=rotateEquals(favouredFirst(result.properties||[],mine),Math.floor(Date.now()/3600000),p=>mine.favorites.includes(p.id));
  setPreview(old=>({...result,properties,frame:shift&&old?old.frame||old.serverTime:result.serverTime}));
  if(shift)return;
  setRefine('');setSelected('');expand(1);
 });
 // A step of the strip: the pins answer at once from what the search already said; a moment later the search runs for
 // that arrival, so the cards, their prices and «Забронировать» are for it too.
 const arriveBy=(t:number)=>{setArriveAt(t);clearTimeout(shiftTimer.current);// A search still running holds the lock: the latest step waits for it instead of being dropped.
  const run=()=>{if(lock.current){shiftTimer.current=setTimeout(run,300);return;}void find(shiftDraft(latestDraft.current,t),true);};
  shiftTimer.current=setTimeout(run,700);};
 useEffect(()=>()=>clearTimeout(shiftTimer.current),[]);
 // «Снова туда же»: the home is priced for the stay in the line first, so the card books the tariff the search would
 // (the night price too). Busy or not fitting on these conditions: the card opens without dates, and the guest picks them.
 const again=(home:Row)=>guarded(async()=>{
  const d=freshDraft({...draft,district:'',maxPrice:'',kinds:[],rooms:'',features:[],now:false,near:null,priority:'balanced'});
  let found:Row|undefined;
  try{found=((await request('/api/public/matching?q='+encodeURIComponent(JSON.stringify(matchingBody({...d,city:home.city||d.city})))))?.properties||[]).find((p:Row)=>p.id===home.id);}catch(e){if(isOffline(e))throw e;}
  if(found)onIntent('property:'+home.id,{mode:tariffOf(d,found),start:d.start,end:d.end,guests:d.guests});else onIntent('property:'+home.id);
 });
 // The AI line: free text becomes the same conditions the form builds, then the usual search runs.
 // The text is read by rules, not by a model; what the rules cut or cannot take is said, never guessed.
 // said: what the model made of a phrase the rules could not read; it is shown, so the guest sees what is searched.
 const take=(parsed:ReturnType<typeof guestRequestFromText>,said='',text='')=>{
  setLastAsk(text);
  // Understood: the conditions line now says it, so the line is free for the next request (as on the site).
  setPreview(null);setAsked('');if(parsed.draft.city!==draft.city){setCity(parsed.draft.city);chosenCity.add(accountId);}setDraft(parsed.draft);
  // A day or an hour that has passed is never moved to another one: the guest is asked for the date.
  if(parsed.past){setHint({text:[PAST_TEXT[parsed.past],parsed.note,tr('Укажите, когда нужно жильё.')].filter(Boolean).join(' '),error:true});setRefine('when');expand(2);return;}
  const note=[said,parsed.note].filter(Boolean).join(' ');
  setHint(note?{text:note}:null);
  // «Рядом»: where the guest is, if the phone knows it and it is in the searched city; otherwise the guest shows it on the map.
  const fix=getHere().fix;
  if(parsed.nearby&&!parsed.draft.near&&fix&&nearestCity(fix.point)===parsed.draft.city){void find({...parsed.draft,near:nearOf(fix.point)});return;}
  if(parsed.nearby&&!parsed.draft.near){pickThenFind.current=true;setPicking(true);expand(0);return;}
  // «У вокзала»: the landmark is found on the map and the search looks around it; not found is said, and the whole city is searched.
  // Without an account the landmark is not looked up (the service pays for each lookup): the whole city is searched, and it is said.
  if(parsed.place&&!accountId){setHint({text:[note,tr('Искать у ориентира смогу после входа. Пока показываю весь город.')].filter(Boolean).join(' ')});void find({...parsed.draft,near:null,priority:parsed.draft.priority==='closer'?'balanced':parsed.draft.priority});return;}
  if(parsed.place&&!lock.current){
   const asked=parsed.place;lock.current=true;setWorking(true);
   void (async()=>{
    let spot:Row|null=null;
    try{spot=await request('/api/operations/search/place',{city:parsed.draft.city,place:asked},undefined,undefined,'guest');}catch{/* Said below as not found. */}
    lock.current=false;setWorking(false);
    if(spot?.found){void find(nearPlace(parsed.draft,spot,asked));return;}
    setHint({text:[note,placeMissedNote(asked)].filter(Boolean).join(' ')});
    void find({...parsed.draft,near:null,priority:parsed.draft.priority==='closer'?'balanced':parsed.draft.priority});
   })();
   return;
  }
  void find(nearNow(parsed.draft));
 };
 const ask=(text:string)=>{
  // «Уборка завтра» is not a place to stay: it is the home cleaning order, the same as the «Уборка» row of the picker.
  if(cleaningAsk(text)){setAsked('');onIntent('home-cleaning');return;}
  const cities=Object.keys(mapCities),parsed=guestRequestFromText(text,draft,cities);
  setError('');
  if(parsed.understood){take(parsed,'',text);return;}
  // Nothing but what the search cannot check yet («с баней»): said at once, the model could not put it in other words either.
  if(parsed.note){setHint({text:tr('{note} Напишите день, срок, тип жилья или бюджет.',{note:parsed.note}),ask:text});return;}
  // What the rules could not read goes to the model, which says it in the words the rules do read; those words then
  // pass the same rules. No model on the server, no permission or no answer: the guest is told, never guessed for.
  if(lock.current)return;
  // The model reads free text only for someone signed in; without an account the guest is asked for the usual words.
  if(!accountId){const kind=categoryOf(draft);setHint({text:tr('Не понял запрос. Напишите, например: {example} ИИ разберёт любой текст после входа.',{example:kind==='banquet'?tr('«5 декабря на 150 гостей».'):kind==='bath'?tr('«сегодня в 18:00 на 3 часа».'):tr('«завтра на сутки до 15 000».')})});return;}
  lock.current=true;setWorking(true);setHint({text:tr('ИИ разбирает запрос…')});
  void (async()=>{
   let ai:Row|null=null;
   try{ai=await request('/api/operations/search/understand',{text:text.slice(0,300)},undefined,undefined,'guest');}catch{/* Said below as «не понял». */}
   lock.current=false;setWorking(false);
   const again=ai?.status==='ok'?guestRequestFromText(String(ai.phrase),draft,cities):null;
   if(again?.understood){take(again,understoodNote(String(ai!.phrase),ai!.dropped),text);return;}
   setHint({text:notUnderstoodNote(ai?.status,ai?.dropped,categoryOf(draft)),ask:text});
  })();
 };
 // «Сейчас»: the nearest first, counted from where the guest is when the phone knows it and it is in the searched city.
 const nearNow=(next:GuestDraft):GuestDraft=>{const fix=getHere().fix;return next.now&&!next.near&&fix&&nearestCity(fix.point)===next.city?{...next,near:{...nearOf(fix.point),radius:15000},priority:'closer'}:next;};
 const chip=(action:HeadAction)=>{if(action!=='now'&&action!=='night'&&action!=='daily'&&action!=='hourly'&&action!=='weekend'&&action!=='evening'&&action!=='tomorrow'&&action!=='toi'&&action!=='party'&&action!=='memorial')return;const next=nearNow(chipDraft(action,draft));setAsked('');setLastAsk('');setHint(null);setError('');setDraft(next);setPreview(null);void find(next);};
 // «Забронировать»: the price in the list is for the searched time. If that time has passed while the list was open, the search runs again first.
 const bookFlat=(property:Row)=>{if(freshDraft(draft).start!==draft.start){setHint({text:tr('Время начала уже прошло. Обновил варианты на ближайшее время.')});setSelected('');void find(draft);return;}// One button. A home that confirms by itself is booked at once; a home whose owner answers quick requests is asked
  // first, together with the next best ones, so a refusal or silence already has the next offer coming.
  // Without an account the button asks to sign in first (App.tsx); the booking then goes on with the same stay.
  if(askFirst(property)&&accountId){void begin(property.id);return;}
  onBook(property,stayOf(property));};
 // The searched stay for one place (with the event of a banquet), and its page opened with that stay and its searched price.
 const stayOf=(property:Row):MapStay=>({mode:tariffOf(draft,property),start:draft.start,end:draft.end,guests:draft.guests,...(draft.occasion?{occasion:draft.occasion}:{})});
 // The owner's reliability found by the search goes with it: the page says it too, as the short card did.
 const openFlat=(property:Row)=>onIntent('property:'+property.id,{...stayOf(property),...(Number(property.estimate?.amount)>0?{amount:Number(property.estimate.amount)}:{}),...(property.host?{host:property.host}:{})});
 // What narrows a search beyond the place, the time and the guests. An empty result offers to drop these and look again.
 const narrowed=!!(draft.district||draft.maxPrice||draft.features.length||draft.priority!=='balanced'||draft.near||(categoryOf(draft)!=='stay'?draft.kinds.length<allKinds(categoryOf(draft)).length:draft.kinds.length)||draft.rooms||draft.now);
 const retry=(next:GuestDraft)=>{setHint(null);setError('');setDraft(next);setPreview(null);void find(next);};
 const widen=()=>retry({...draft,district:'',maxPrice:'',features:[],priority:'balanced',near:null,kinds:allKinds(categoryOf(draft)),rooms:'',now:false});
 // «Изменить условия» of the results and «Условия» among the tokens: every condition as a list. A token opens its own
 // part of the form; a second tap on it closes the form again.
 const openPart=(part:Section|'all')=>{if(snap>0&&refine===part){setRefine('');expand(preview?1:0);}else{setRefine(part);expand(2);}},toggleRefine=()=>openPart('all');
 // «Помогайки»: the steps that narrow the answer on the phone, each with the card that was in view when it was taken;
 // the ones taken back are not offered again. A new answer starts clean.
 const [listOpen,setListOpen]=useState(false),[floatChips,setFloatChips]=useState<ReactNode>(null),[catOpen,setCatOpen]=useState(false);
 const [steps,setSteps]=useState<{id:string;at:string}[]>([]),[tried,setTried]=useState<string[]>([]),[anchor,setAnchor]=useState('');
 useEffect(()=>{setSteps([]);setTried([]);setAnchor('');},[preview?.frame||preview?.serverTime]);
 const stepIds=steps.map(v=>v.id);
 const here=useHere();
 const meInCity=!!here.fix&&nearestCity(here.fix.point)===draft.city;
 // What the steps leave of the answer: the cards, the pins and the one line of the closed sheet show the same places.
 const from=meInCity&&here.fix?nearOf(here.fix.point):null,shown:Row[]=preview?(stepIds.length?narrowFlats(preview.properties||[],stepIds,{draft,from}):preview.properties||[]):[];
 const stepOn=(id:string,at:string)=>{setAnchor('');setSelected('');setSteps(list=>[...list,{id,at}]);},stepBack=()=>{const last=steps[steps.length-1];if(!last)return;setSelected('');setAnchor(last.at);setTried(list=>[...list,last.id]);setSteps(list=>list.slice(0,-1));};
 // The conditions as tokens; an empty answer blames the ones that leave nothing free.
 const tokens=guestTokens(freshDraft(draft)),blamed=preview&&!(preview.properties||[]).length?blamedTokens(preview.empty,tokens):[];
 useEffect(()=>{if(requestId||preview)expand(1);if(kept&&kept.draft.city!==city)setCity(kept.draft.city);},[]);
 useEffect(()=>{guestSearches.set(accountId,{draft,preview,foundAt:foundAt.current});},[draft,preview]);
 // A flat chosen in the list or on the map is shown in the opened sheet, which never closes for it.
 // A phone shorter than 700px opens the sheet fully, so that «Забронировать» is on screen.
 const lowScreen=useWindowDimensions().height<700;
 useEffect(()=>{if(!selected||!(preview||requestId))return;const need=preview&&!requestId&&lowScreen?2:1;if(snap<need)expand(need);},[selected]);
 useEffect(()=>{if(!picking)pickThenFind.current=false;},[picking]);
 const begin=(prefer?:string)=>guarded(async()=>{
  requestKey.current||=uid();
  // The beams start where the guest is, if the phone told us (here.ts): no new prompt here.
  askedFrom.current=null;
  const fix=getHere().fix;
  if(fix&&fix.accuracy<=1500)askedFrom.current=fix.point;
  const result=await request('/api/operations/matching/begin',{...matchingBody(freshDraft(draft)),...(prefer?{prefer}:{}),requestKey:requestKey.current,consent:true},undefined,undefined,'guest');
  liveRequests.set(accountId,result.id);setSkew(result.serverTime-Date.now()/1000);setLive(result);setRequestId(result.id);setIndex(0);setAccepted(false);expand(1);
 });
 const reset=()=>{askedFrom.current=null;liveRequests.delete(accountId);requestKey.current='';setRequestId('');setLive(null);setPreview(null);setAccepted(false);setIndex(0);};
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
 // The guest's own confirmed stays stand on the map among the homes and say the next step (guest-trips.ts);
 // «Маршрут» leads to the home on our own map, the same way the cleaner is led (Navigator.tsx).
 const mapSkew=mapData?.serverTime&&mapData?.receivedAt?Number(mapData.serverTime)-Number(mapData.receivedAt):0,nav=useTrip('guest',mapSkew);
 const stayNow=serverNow(mapData||data);
 const tripThreads=guestThreads(data,stayNow,data.paymentMode),tripWaiting=tripThreads.filter(t=>t.yours).length;
 const stays:(MapPin&{id:string;start:number;canGo:boolean})[]=(mapData?.processes||[]).flatMap((p:Row)=>{
  const own=p.kind==='booking'?(data.bookings||[]).find((b:Row)=>b.id===p.id):null,point=pointOf(p),state=own?guestPin(own,stayNow,data.paymentMode):null;
  return own&&point&&state?[{key:'booking:'+p.id,id:String(p.id),point,title:p.title,label:state.label,tone:state.tone,act:pinAct('guest',tripThreads,data,stayNow,t=>t.id===p.id)||undefined,chain:(t=>t?threadChain(t):undefined)(tripThreads.find(t=>t.id===p.id)),start:Number(own.start),canGo:p.location?.precision==='exact'&&!own.terms?.actual_checkin&&!own.terms?.actual_checkout&&own.start<stayNow+86400&&own.end>stayNow}]:[];
 }).sort((a:{start:number},b:{start:number})=>a.start-b.start);
 const staysKey=stays.map(v=>v.key+v.label+(v.act?.label||'')+(v.chain?.states.join('')||'')).join();
 const go=(stay:{id:string;title?:string;point:MapPoint})=>{setSelected('');expand(0);void nav.start({kind:'booking',id:stay.id,title:stay.title||tr('Жильё'),target:stay.point});};
 // Each beam goes along the roads, like a route: the first few are asked from the server one by one, the rest stay straight.
 const [roads,setRoads]=useState<BeamRoads>({}),roadAsked=useRef(new Set<string>());
 const askRoads=(lines:MapLine[])=>{
  const fresh=lines.map((line,i)=>({line,i,key:roadKey(line)})).filter(v=>!roadAsked.current.has(v.key));if(!fresh.length)return;
  for(const v of fresh)roadAsked.current.add(v.key);
  void (async()=>{for(const v of fresh){
   let path:[number,number][]|null=null;
   if(v.i<ROAD_BEAMS)try{path=(await request('/api/operations/map/beam',{propertyId:v.line.key.replace(/^beam:/,''),longitude:v.line.from[0],latitude:v.line.from[1]},undefined,undefined,'guest')).path||null;}catch{/* The beam stays straight. */}
   setRoads(known=>({...known,[v.key]:path}));
  }})();
 };
 // Pins follow the stage: catalogue, checked candidates, then owners who are answering.
 const stageKey=(requestId?'live':preview?'preview:'+(preview.frame||preview.serverTime)+':'+stepIds.join():'base:'+draft.city)+':'+mine.favorites.length;
 // The arrival the pins speak for, and the homes free only later on the guest's other conditions («С 19:00»).
 const arrival=arrivalOf(preview),at=arrival?arriveAt!==null&&arrival.steps.includes(arriveAt)?arriveAt:arrival.at:0;
 const later:Row[]=arrival&&!stepIds.length?(preview?.later||[]).filter((p:Row)=>!shown.some(x=>x.id===p.id)):[];
 const counts=arrival?countsAt([...shown,...later],arrival):[];
 // A pin «С 19:00» tapped on the map moves the arrival there; the card of that home opens once the search answers for it.
 useEffect(()=>{if(!arrival||!selected)return;const p=[...shown,...later].find(x=>x.id===selected);if(!p)return;const state=homeAt(p,arrival,at);if(state.state==='later'&&state.from)arriveBy(state.from);},[selected]);
 // What the card of a found home says about its readiness at the searched arrival.
 const readiness=(p:Row)=>{if(!arrival)return null;const state=homeAt(p,arrival,arrival.at);return state.state==='ready'||state.state==='check'?{text:cardWords(state,arrival.at),check:state.state==='check'}:null;};
 // Prices the guest has opened turn grey on the map, as on Airbnb; the set lives as long as the map does.
 const [opened,setOpened]=useState<string[]>([]);
 useEffect(()=>{if(selected&&!opened.includes(selected))setOpened(v=>[...v,selected]);},[selected]);
 useEffect(()=>{
  // The guest's map says the price alone, as Airbnb and Vrbo do (the user's rule of 2026-11-25): no heart, no sign, no «+N».
  // A home whose owner the guest waits for breathes on the map, as the car on its way in a taxi app.
  const clockNow=serverNow(data),waiting=new Set((data.bookings||[]).filter((b:Row)=>b.guest_id===data.user?.id&&b.status==='requested'&&Number(b.expires_at)>clockNow).map((b:Row)=>b.property_id));
  const pin=(p:Row,tone:MapPin['tone']):MapPin[]=>{const point=pointOf(p),amount=p.estimate?.amount??p.price;return point?[{key:p.id,point,title:p.title,label:short(amount),tone:waiting.has(p.id)&&(tone==='home'||tone==='booking')?'pending':tone,plain:true,seen:opened.includes(p.id),rank:typeof amount==='number'?amount:0}]:[];};
  // On the way the map shows only the way: the home, the guest's point and the road between them.
  if(nav.trip){
   const target=stays.filter(v=>v.id===nav.trip!.id).map(({id,start,canGo,...m})=>m),me:MapPin[]=nav.here&&nav.status!=='arrived'?[{key:'me',point:nav.here.point,title:tr('Вы'),label:tr('Вы'),tone:'active'}]:[];
   const path=nav.state?.path;
   publish([...target,...me],'nav:'+nav.trip.id+':'+nav.rerouted,{lines:path&&path.length>1?[{key:'nav:'+nav.trip.id,from:path[0],to:path[path.length-1],tone:'nav',path}]:[]});
  }
  // A booking made: the flat that was booked stays on the map, green, and the rest leave it.
  else if(requestId&&live?.status==='booked'){const flat=bookedFlat.current;publish(flat?pin(flat,'booked').map(p=>({...p,label:tr('✓ Бронь')})):[],'booked:'+live.id);}
  // A flat being asked carries the end of its owner's time to answer, moved to this phone's clock.
  else if(requestId&&live){
   // Beams start at the searched point; a request restored after a restart starts them at the middle of the map.
   const near=live.filters?.near,from=beamOrigin(near?[Number(near.longitude),Number(near.latitude)]:null,askedFrom.current);
   const asked=[...(live.pendingProperties||[]).flatMap((p:Row)=>pin(p,'pending').map(m=>Number(p.askExpiresAt)?{...m,until:Number(p.askExpiresAt)-skew}:m)),...offers.flatMap(p=>pin(p,'offer'))];
   const straight=live.status==='searching'||live.status==='ready'||live.status==='booking'?beams(from,asked):[];
   askRoads(straight);
   publish(asked,'live:'+live.id+':'+offers.length+':'+(live.pendingProperties||[]).length,{lines:roadBeams(straight,roads)});
  }
  else if(preview){
   // With the arrival strip each pin says what the home is at the chosen arrival: its price when it is ready then.
   const found:MapPin[]=[...shown,...later].flatMap((p:Row)=>pin(p,p.quickRequest?'booking':'home').map(m=>{
    if(!arrival)return p.match?.best&&!isQuiet(draft)?{...m,best:true}:m;
    const state=homeAt(p,arrival,at),away=state.state==='later'||state.state==='busy';
     // The price stays the label; a home not ready at the chosen arrival is only quieter.
    return {...m,...(away?{dim:true}:{})};
   }));
   // Searched around a point held on the map: thin beams from that point to what was found, so the guest sees the zone.
   const held0=heldAt.current,from=held0&&draft.near&&nearOf(held0).longitude===draft.near.longitude&&nearOf(held0).latitude===draft.near.latitude?held0:null;
   publish(found,stageKey,{lines:from?found.slice(0,8).map(m=>({key:'beam:'+m.key,from,to:m.point,tone:'answer' as const})):[]});
  }
  // The guest's own stays are not on the map: they are in «Мои брони» under the line (the concept of 2026-11-25).
  else publish((mapData?.properties||[]).flatMap((p:Row)=>pin(p,'home')),stageKey+':'+(mapData?.properties?.length||0));
 },[requestId,live,preview,shown.map((p:Row)=>p.id).join(),mapData,data.bookings,draft.city,staysKey,nav.trip,nav.here,nav.route,nav.rerouted,roads,mine.favorites.join(),at,opened.join()]);
 // Where the guest is: on the first point from the phone the search moves to the guest's city, and once that city's
 // homes are on the map, the map flies to the guest. Anything the guest is already doing (a search, a request, a trip,
 // «На карте» from a page) wins: then the point is only a dot on the map.
 const placed=useRef<'no'|'city'|'done'>('no');
 useEffect(()=>{
  if(placed.current==='done'||!here.fix)return;
  if(aimed||recent||requestId||preview||draft.near||nav.trip||chosenCity.has(accountId)){placed.current='done';return;}
  const near=nearestCity(here.fix.point);
  // Far from every city of the service: the map flies to the guest instead of keeping another city on screen. It waits
  // for the first answer of the map, so the framing of those pins (a new focusKey) does not take the view away again.
  if(!near){if(!mapData)return;placed.current='done';flyMe();if(here.fix.accuracy<=5000)notify(tr('Рядом с вами жилья сервиса пока нет. Нужен город — напишите его в строке, например «Алматы завтра».'));return;}
  // The city moves only once the map of the current one has answered, and never away from the guest's own stays there.
  if(placed.current==='no'){if(!mapData)return;placed.current='city';if(near!==draft.city){if(stays.length){placed.current='done';return;}change({...draft,city:near,district:'',near:null},false);notify(tr('Вы в городе {near}. Нужен другой город — напишите его в строке, например «Астана завтра».',{near}));return;}}
  if(mapData&&mapData.city===near){placed.current='done';flyMe();}
 },[here.fix,mapData]);
 // A finger held on the map: the search runs around that point (5 km), in the city it lies in. The exact point is only
 // drawn on this phone; the search gets it rounded, as a point picked under the marker.
 const heldAt=useRef<MapPoint|null>(null);
 useEffect(()=>{
  if(!held)return;
  if(requestId||nav.trip){notify(tr('Сначала завершите текущий подбор или поездку.'));return;}
  if(lock.current){notify(tr('Секунду: ещё ищем по прошлой точке.'));return;}
  const where=nearestCity(held.point);
  if(!where){notify(tr('Здесь пока нет жилья сервиса. Удерживайте палец на месте в городе.'));return;}
  if(where!==draft.city){setCity(where);chosenCity.add(accountId);}
  heldAt.current=held.point;
  // A point held in «Где ищем?» answers that question: the marker mode ends here.
  if(picking){pickThenFind.current=false;setPicking(false);}
  notify(tr('Ищем жильё в 5 км от этой точки.'));
  void find({...draft,city:where,district:where===draft.city?draft.district:'',near:nearOf(held.point)});
 },[held?.n]);
 // The radar on the map runs while flats are searched and while owners are being asked.
 const scanning=(working&&!requestId)||(!!requestId&&(!live||live.status==='searching'));
 useEffect(()=>{setScanning(scanning);return()=>setScanning(false);},[scanning]);
 // A memorial meal: the map keeps still, nothing on it plays joy.
 useEffect(()=>{setQuiet(isQuiet(draft));return()=>setQuiet(false);},[draft.occasion]);
 useEffect(()=>{if(offers.length&&selected){const at=offers.findIndex(p=>p.id===selected);if(at>=0&&at!==index){setIndex(at);setAccepted(false);}}},[selected]);

 const pickView=<View style={h.block}><Text style={h.title}>{tr('Где ищем?')}</Text><Text style={h.note}>{tr('Передвиньте карту так, чтобы метка стояла в нужном месте. Или просто удерживайте палец на нужном месте карты. Владельцам точка не передаётся, для подбора она округляется.')}</Text><Action title={tr('Искать рядом с этой точкой')} onPress={()=>{const c=mapCenter.current,near=c?{longitude:Math.round(c[0]*100)/100,latitude:Math.round(c[1]*100)/100,radius:5000}:null,search=pickThenFind.current&&!!near;pickThenFind.current=false;if(near)change({...draft,near});setPicking(false);if(search)void find({...draft,near});else expand(1);}}/><Action secondary title={tr('Отмена')} onPress={()=>{const fromLine=pickThenFind.current;pickThenFind.current=false;setPicking(false);expand(fromLine?0:1);}}/></View>;

 // The home «Забронировать» was pressed on is kept in the request itself, so it survives a change of role or a restart.
 const preferId=typeof live?.filters?.prefer==='string'?live.filters.prefer:'';
 // Nobody answered in time: an ordinary request to that owner, for the stay the request was made for, priced again
 // by the same search (the night price too). Not free any more: its card opens, and the guest picks the dates.
 const direct=()=>guarded(async()=>{
  const filters=live!.filters,id=preferId,local=(iso:string)=>new Date(Date.parse(iso)+5*3600000).toISOString().slice(0,16);
  let found:Row|undefined;
  try{const {prefer,...conditions}=filters;found=((await request('/api/public/matching?q='+encodeURIComponent(JSON.stringify(conditions))))?.properties||[]).find((p:Row)=>p.id===id);}catch(e){if(isOffline(e))throw e;}
  reset();
  if(found)onBook(found,{mode:filters.mode==='night'?(found.estimate?.billingMode==='nightly'?'nightly':'daily'):filters.mode,start:local(filters.start),end:local(filters.end),guests:Number(filters.guests),...(filters.occasion?{occasion:String(filters.occasion)}:{})});
  else onIntent('property:'+id);
 });
 const renderLive=()=>{
  const status=live?.status||'searching',booked=status==='booked',step=booked?3:status==='ready'||status==='booking'?2:1;
  const booking=booked?(data.bookings||[]).find((b:Row)=>b.id===live?.bookingId):null;
  return <View style={h.block}><Stage steps={[tr('Условия'),tr('Владельцы'),tr('Предложение'),tr('Бронь')]} current={step}/>{!live&&<View style={h.row}><Thinking size="sm"/><Text style={h.note}>{tr('Восстанавливаем ваш подбор…')}</Text></View>}{live&&status==='searching'&&<><Text accessibilityRole="header" style={h.cardTitle}>{tr('Спрашиваем владельцев')}</Text><View style={h.row}><Thinking size="sm"/><Text style={h.note}>{tr('Ждём ответа: {pending} из {sent} запросов. На ответ у владельца 2 минуты.',{pending:live.pending,sent:live.sent})}</Text></View><Text style={h.timer} accessibilityLabel={tr('До конца подбора {v}',{v:countdown(live.expiresAt-now)})}>{countdown(live.expiresAt-now)}</Text>{/* Who was asked and who has answered: one row per home, the same homes that pulse on the map. */}<View>{offers.map(p=><View key={p.id} style={h.asked}><View style={[h.askedDot,{backgroundColor:C.success}]}/><Text numberOfLines={1} style={[h.eventTitle,h.grow]}>{p.title}</Text><Text style={h.reason}>{tr('Готов принять')}</Text></View>)}{(live.pendingProperties||[]).map((p:Row)=><View key={p.id} style={h.asked}><View style={[h.askedDot,{backgroundColor:C.gold}]}/><Text numberOfLines={1} style={[h.eventTitle,h.grow]}>{p.title}</Text><Text style={h.note}>{tr('ждём…')}</Text></View>)}</View><Text style={h.note}>{tr('Бронь на этом шаге не создаётся.')}</Text></>}{live&&(status==='ready'||status==='booking')&&offer&&<><Text accessibilityRole="header" style={h.cardTitle}>{tr('Владелец подтвердил готовность')}</Text>{offers.length>1&&<View style={h.row}><Action secondary title={tr('← Назад')} disabled={index===0} onPress={()=>{setIndex(index-1);setAccepted(false);setSelected(offers[index-1].id);}}/><Text style={h.note}>{tr('{n} из {all}',{n:index+1,all:offers.length})}</Text><Action secondary title={tr('Ещё →')} disabled={index>=offers.length-1} onPress={()=>{setIndex(index+1);setAccepted(false);setSelected(offers[index+1].id);}}/></View>}<View style={h.card}>{!!offer.photos?.[0]&&<Photo id={offer.photos[0]} alt={tr('{title}, фото',{title:offer.title})}/>}<Text style={h.cardTitle}>{offer.title}</Text><Text style={h.note}>{[offer.city,offer.district].filter(Boolean).join(' · ')}</Text><Text style={h.price}>{money(offer.estimate.amount)}</Text>{!!windowBadge(offer.estimate.window)&&<Text style={h.reason}>✦ {windowBadge(offer.estimate.window)}</Text>}{!!dealBadge(offer.estimate.deal)&&<Text style={h.reason}>✦ {dealBadge(offer.estimate.deal)}</Text>}{!!offer.host&&<View style={{marginTop:8}}><ReliabilityBadge value={offer.host} title={tr('Владелец')}/></View>}<Text style={h.note}>{date(Date.parse(live.filters.start)/1000)} → {date(Date.parse(live.filters.end)/1000)}{tr(' · гостей: {n}',{n:live.filters.guests})}{'\n'}{tr('Депозит отдельно: {v}',{v:offer.policy?.deposit?money(offer.policy.deposit):tr('не требуется')})}</Text>{shownReasons(offer.match?.reasons,{maxPrice:String(live.filters.maxPrice)===NO_BUDGET?'':String(live.filters.maxPrice||'')},BATH_KINDS.includes(offer.details?.type)).map((reason:string)=><Text key={reason} style={h.reason}>✓ {reason}</Text>)}{!!offer.policy?.house_rules&&<Text style={h.note}>{tr('Правила: {v}',{v:offer.policy.house_rules})}</Text>}<Text style={h.timerSmall}>{tr('Предложение действует ещё {v}',{v:countdown(offer.offerExpiresAt-now)})}</Text><Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} onPress={()=>setAccepted(v=>!v)} style={h.check}><Text style={h.checkBox}>{accepted?'☑':'☐'}</Text><Text style={h.checkText}>{tr('Принимаю стоимость, депозит и правила этого жилья')}</Text></Pressable><SwipeConfirm label={status==='booking'?tr('Оформляем…'):tr('Проведите: забронировать')} disabled={working||!accepted||status==='booking'} onConfirm={book}/></View><Text style={h.note}>{tr('Оплата в приложении не списывается.')}{' '}{offer.policy?.auto_confirm?tr('Бронь подтвердится по правилам владельца.'):tr('Владелец подтвердит заявку отдельно.')}</Text></>}{live&&booked&&<><Text accessibilityRole="header" style={h.cardTitle}>{tr('Заявка на бронь создана')}</Text><Text style={h.note}>{booking?tr('Статус: {v}. ',{v:(labels[booking.status]||booking.status)}):''}{tr('Адрес и инструкции заезда появятся после подтверждения. Оплату отмечает владелец.')}</Text><Action title={booking?tr('Открыть бронь'):tr('Мои брони')} onPress={()=>booking?onOpenProcess('booking',booking.id):onOpenPage('bookings')}/><Action secondary title={tr('Новый подбор')} onPress={reset}/></>}{live&&['empty','expired','cancelled'].includes(status)&&<><Text accessibilityRole="header" style={h.cardTitle}>{status==='empty'?tr('Сейчас никто не подтвердил'):status==='expired'?tr('Время подбора вышло'):tr('Подбор отменён')}</Text><Text style={h.note}>{status==='empty'?''+(preferId?tr('Владельцы не ответили за отведённое время. Можно отправить обычную заявку: владелец ответит, когда увидит её.'):tr('Подходящие владельцы не ответили или отказали. Попробуйте изменить время, бюджет или район.'))+'':tr('Условия сохранены. Можно запустить подбор заново.')}</Text>{!!preferId&&<Action title={tr('Отправить заявку владельцу')} disabled={working} onPress={()=>void direct()}/>}<Action secondary={!!preferId} title={tr('Изменить условия')} onPress={reset}/></>}{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{active&&<Action secondary danger title={tr('Отменить подбор')} disabled={working||status==='booking'} onPress={cancel}/>}</View>;
 };

 // Under the line the collapsed sheet shows one thing: a message, the flat tapped on the map, or the "Сейчас" card.
 const picked=snap===0&&!preview&&selected?(mapData?.properties||[]).find((p:Row)=>p.id===selected):null;
 // The guest's own stay tapped on the map, or the nearest one that can be reached now.
 const stay=snap===0&&!preview?stays.find(v=>v.key===selected)||null:null,near=stays.find(v=>v.canGo)||null;
 const trips=guestTrips(data,serverNow(data));
 // A token or «Условия» was tapped: the sheet is the form alone, the bookings and the quick chips wait under the collapsed sheet.
 const formOnly=!!refine&&snap>0;
 // Where the sheet stood before the category picker opened: it returns there when the picker closes.
 const before=useRef(0);
 // As in the concept of 2026-11-25 (Bolt, Freenow): the line, one plate «где · когда» with the category at its start, one button.
 const plateOn=(snap===0||!!preview)&&!formOnly&&blamed.length===0;
 const head=<MapSheetHead role="guest" text={asked} onText={setAsked} onSend={ask} onChip={chip} chips={!formOnly} quick={false} category={categoryOf(draft)} kind={draft.kinds.length===1?draft.kinds[0]:''} choice={kindChoice(draft)} recent={lastAsk} onKind={(c,k)=>{setAsked('');setLastAsk('');const next=withKind(draft,c,k);change(next);/* Another category is another map: its places are shown at once, not the homes left from before. */if(categoryOf(next)!==categoryOf(draft))void find(next);}} pickerOpen={catOpen} onPicker={open=>{if(open){before.current=snap;if(snap<2)expand(2);}else{setCatOpen(false);if(before.current<2&&snap===2)expand(before.current);}}} busy={working} conditions={formOnly||catOpen?null:plateOn?(category:ReactNode)=><GuestTokens tokens={tokens} blamed={blamed} open={snap>0?(refine||(preview?'':'all')):''} line busy={working} lead={category} onOpen={openPart} onClear={token=>retry({...draft,...token.clear})}/>:<GuestTokens tokens={tokens} blamed={blamed} open={snap>0?(refine||(preview?'':'all')):''} busy={working} onOpen={openPart} onClear={token=>retry({...draft,...token.clear})}/>} now={null} onNow={()=>{}}>{/* As in the concept: under the plate «where · when · how many», one button that searches. */}{/* With the sheet open the form below has its own pinned button: one dark button on the screen. */}{!preview&&!picked&&!stay&&!formOnly&&snap===0&&<Action title={working?tr('Ищем…'):tr('Показать варианты')} disabled={working} onPress={()=>void find()}/>}{!!hint&&<View style={h.picked}><Text accessibilityRole={hint.error?'alert':undefined} accessibilityLiveRegion="polite" style={hint.error?h.error:h.note}>{hint.text}</Text>{!!hint.ask&&<Action secondary title={tr('Спросить ИИ-администратора')} onPress={()=>onAsk(hint.ask!)}/>}</View>}{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{!!nav.error&&<Text accessibilityRole="alert" style={h.error}>{nav.error}</Text>}{stay&&<View style={h.listRow}><View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{stay.title}</Text><Text numberOfLines={1} style={h.note}>{stay.label}</Text></View>{stay.canGo&&<Action title={tr('Маршрут')} onPress={()=>go(stay)}/>}<Action secondary title={tr('Открыть')} onPress={()=>onOpenProcess('booking',stay.id)}/></View>}{/* The guest's own bookings in one line, as in the concept: the feed of them is on the page «Мои брони». */}{!preview&&!picked&&!stay&&!formOnly&&tripThreads.length>0&&<Pressable accessibilityRole="button" accessibilityLabel={tr('Мои брони')+(tripWaiting?'. '+tr('Ждёт вас: {n}',{n:tripWaiting}):'')} onPress={()=>onOpenPage('bookings')} style={({pressed})=>[h.tripsLine,pressed&&h.dim]}>{tripWaiting>0&&<View style={h.tripsDot}/>}<Text style={h.tripsTitle}>{tr('Мои брони')}</Text><Text numberOfLines={1} style={[h.note,h.grow]}>{tripWaiting?' · '+tr('{n} ждёт вас',{n:tripWaiting}):' · '+tripThreads.filter(t=>!t.finished).length}</Text><Text style={h.tripsGo}>›</Text></Pressable>}{/* The sheet is down over an answer: the whole of it in one line, and one tap to the cards. */}{!!preview&&snap===0&&shown.length>0&&!stay&&<Pressable accessibilityRole="button" accessibilityLabel={tr('{v}. Показать',{v:foundLine(shown,plural)})} onPress={()=>expand(1)} style={({pressed})=>[h.listRow,pressed&&h.dim]}><Text numberOfLines={1} style={[h.eventTitle,h.grow]}>{foundLine(shown,plural)}</Text><Text style={[h.note,{color:C.accent,fontWeight:'600'}]}>{tr('Показать')}</Text></Pressable>}{picked&&<View style={h.listRow}><Heart plain on={mine.favorites.includes(picked.id)} title={picked.title} onPress={()=>heart(picked.id)}/><View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{picked.title}</Text><Text numberOfLines={1} style={h.note}>{[typeof picked.price==='number'?tr('{v} за сутки',{v:money(picked.price)}):'',picked.district].filter(Boolean).join(' · ')}</Text></View><Action secondary title={tr('Открыть')} onPress={()=>onIntent('property:'+picked.id)}/></View>}</MapSheetHead>;
 // The form and the results live in the opened sheet only; a running request to owners keeps its place in any state.
 // While the form is open, its button counts what the conditions find (useFormCount.ts).
 const formCountNow=useFormCount(draft,!requestId&&snap!==0&&!(preview&&!refine)&&!working);
 const body=requestId?renderLive():snap===0||catOpen?null:preview&&!refine
  ?<>{/* The arrival as one row over the results; its hours open on their own sheet. */}{snap<2&&!!preview&&!!arrival&&!stay&&!picked&&!formOnly&&counts.some(n=>n>0)&&<ArrivalStrip arrival={arrival} at={at} asked={Date.parse(around.current)/1000} counts={counts} onPick={arriveBy}/>}<GuestResults preview={preview} draft={draft} readiness={readiness} mine={mine} onFavorite={heart} selected={selected} onSelect={setSelected} onFocus={setFocus} onBook={bookFlat} onOpen={openFlat} onRefine={toggleRefine} onWiden={narrowed?widen:undefined} onTry={patch=>retry({...draft,...patch})} onBookEdge={onReach} busy={working} steps={stepIds} tried={tried} from={from} onStep={stepOn} onBack={stepBack} anchor={anchor} full={snap===2&&!selected} onMap={listOpen?()=>{setListOpen(false);expand(0);}:undefined}/></>
  :<GuestForm key={refine||'all'} only={refine||'all'} draft={draft} onChange={change} onNearMe={meInCity?()=>change({...draft,near:nearOf(here.fix!.point)}):undefined} onPickPoint={()=>{setPicking(true);expand(0);}} onSubmit={()=>void find()} busy={working} count={formCountNow} onFoot={setFoot}/>;
 // The answer as in the concept of 2026-11-25 (Airbnb, Vrbo): the sheet steps aside, the conditions stand on top of the map
 // with the quick steps under them, one card floats at the bottom. «Список» opens every answer in the sheet, «На карте» returns.
 // The guest's map is always this answer (concept of 2026-11-26): the top bar with the type and the city, the homes on
 // the map and one card at the bottom. Only the filter, the type picker, the list, a running request, a trip and picking
 // a point take the sheet.
 const floatOn=!refine&&!catOpen&&!requestId&&!picking&&!nav.trip&&!listOpen,found=!!preview&&shown.length>0;
 // Nothing to show yet: the search runs by itself, for the conditions the guest has (a new city, a closed filter, a new type).
 useEffect(()=>{if(floatOn&&!preview&&!lock.current&&!error)void find();},[floatOn,preview,error]);
 // The filter or the list pulled down (one step is enough, 2026-11-26): it closes and the map returns with its card,
 // never the half-open sheet of the old results. What the filter changed is searched.
 useEffect(()=>{if(snap<2&&(refine||listOpen)){setRefine('');setListOpen(false);}},[snap]);
 const capsule=tokens.filter(t=>t.id==='city'||t.id==='district').map(t=>t.title).join(', '),capsuleLine=tokens.filter(t=>t.id!=='city'&&t.id!=='district').map(t=>t.title).join(' · ');
 // The map with its card has no half-open sheet: a search that ends (find opens the sheet) or a held point puts it down.
 useEffect(()=>{if(floatOn&&snap!==0)expand(0);},[floatOn,snap]);
 useEffect(()=>{
  if(!floatOn){setFloat?.(null);return;}
  setFloat?.(<GuestFloatBar title={capsule} line={capsuleLine} busy={working} chips={found?floatChips:null} choice={kindChoice(draft)} onKind={()=>{setSelected('');setCatOpen(true);}} onEdit={()=>openPart('all')}/>);
 },[floatOn,capsule,capsuleLine,working,floatChips,found,kindChoice(draft).id]);
 useEffect(()=>()=>setFloat?.(null),[]);
 // Under the map: the guest's own stay or bookings in one line, then the homes; while searching or with nothing found, one card says so.
 const empty=preview&&!found?emptyAnswer(preview.empty,draft,narrowed):null;
 const floatHead=floatOn?<View style={h.floatHead}>
  {stay?<View style={[h.floatCard,h.listRow]}><View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{stay.title}</Text><Text numberOfLines={1} style={h.note}>{stay.label}</Text></View>{stay.canGo&&<Action title={tr('Маршрут')} onPress={()=>go(stay)}/>}<Action secondary title={tr('Открыть')} onPress={()=>onOpenProcess('booking',stay.id)}/></View>
   :tripThreads.length>0&&!selected&&<Pressable accessibilityRole="button" accessibilityLabel={tr('Мои брони')+(tripWaiting?'. '+tr('Ждёт вас: {n}',{n:tripWaiting}):'')} onPress={()=>onOpenPage('bookings')} style={({pressed})=>[h.tripsLine,h.floatTrips,pressed&&h.dim]}>{tripWaiting>0&&<View style={h.tripsDot}/>}<Text style={h.tripsTitle}>{tr('Мои брони')}</Text><Text numberOfLines={1} style={[h.note,h.grow]}>{tripWaiting?' · '+tr('{n} ждёт вас',{n:tripWaiting}):' · '+tripThreads.filter(t=>!t.finished).length}</Text><Text style={h.tripsGo}>›</Text></Pressable>}
  {(!!hint||!!error)&&<View style={[h.floatCard,h.picked]}>{!!hint&&<Text accessibilityRole={hint.error?'alert':undefined} accessibilityLiveRegion="polite" style={hint.error?h.error:h.note}>{hint.text}</Text>}{!!hint?.ask&&<Action secondary title={tr('Спросить ИИ-администратора')} onPress={()=>onAsk(hint.ask!)}/>}{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{!!error&&<Action secondary title={tr('Изменить условия')} onPress={()=>openPart('all')}/>}</View>}
  {found?<><Pressable accessibilityRole="button" accessibilityLabel={tr('Список: {n}',{n:shown.length})} onPress={()=>{setListOpen(true);setSelected('');expand(2);}} style={({pressed})=>[h.listPill,pressed&&h.dim]}><Text style={h.listPillText}>☰  {tr('Список · {n}',{n:shown.length})}</Text></Pressable><GuestResults preview={preview!} draft={draft} readiness={readiness} mine={mine} onFavorite={heart} selected={selected} onSelect={setSelected} onFocus={setFocus} onBook={bookFlat} onOpen={openFlat} onRefine={toggleRefine} onWiden={narrowed?widen:undefined} onTry={patch=>retry({...draft,...patch})} busy={working} steps={stepIds} tried={tried} from={from} onStep={stepOn} onBack={stepBack} anchor={anchor} float onChips={setFloatChips}/></>
   :empty?<View style={[h.floatCard,h.picked]}><Text accessibilityRole="header" style={h.cardTitle}>{empty.title}</Text>{!!empty.note&&<Text style={h.note}>{empty.note}</Text>}{empty.action?<Action title={empty.action.title} disabled={working} onPress={()=>retry({...draft,...empty.action!.patch})}/>:narrowed?<Action title={tr('Показать без уточнений')} disabled={working} onPress={widen}/>:null}<Action secondary title={tr('Изменить условия')} onPress={()=>openPart('all')}/></View>
   :!error&&<View style={[h.floatCard,h.row]}><Thinking size="sm"/><Text style={h.note}>{tr('Ищем варианты…')}</Text></View>}
 </View>:null;
 return <View style={h.block}><HeadSlot onHeight={onHead}>{picking?pickView:nav.trip?<TripHead nav={nav} onOpen={()=>{const id=nav.trip!.id;nav.close();onOpenProcess('booking',id);}} onChat={onChat?()=>onChat('booking',nav.trip!.id):undefined} onCall={onChat?()=>onChat('booking',nav.trip!.id,true):undefined}/>:requestId||listOpen?null:floatHead||head}</HeadSlot>{!picking&&!floatOn&&body}</View>;
}

function OwnerPanel({accountId,data,mapData,publish,snap,showNow,expand,onHead,onAsk,onIntent,onChanged,onOpenProcess,onOpenPage,onEdit,selected,setSelected,setFocus}:Common){
 const [asked,setAsked]=useState(''),[tab,setTab]=useState<HubTab>('today'),[quick,setQuick]=useState(false);
 const [inbox,setInbox]=useState<Row|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[skew,setSkew]=useState(0);
 const lock=useRef(false),seen=useRef(0),now=useNow(!!inbox?.offers?.length)+skew;
 // An answer just sent shows on the flat's pin for a few seconds: «Ответ отправлен» after «Готов», the price again after a refusal.
 const [answered,setAnswered]=useState<Record<string,number>>({});
 const [saved,setSaved]=useState('');
 useEffect(()=>{const keys=Object.keys(answered);if(!keys.length)return;const timer=setTimeout(()=>setAnswered({}),5000);return()=>clearTimeout(timer);},[answered]);
 const apply=(result:Row)=>{setSkew(result.serverTime-Date.now()/1000);setInbox(result);if(result.offers.length>seen.current)expand(1);seen.current=result.offers.length;};
 usePoll(async()=>{try{apply(await request('/api/operations/matching/inbox',{},undefined,undefined,'owner'));setError('');}catch(e){if(e instanceof ApiError)setError(e.message);}},3000,true);
 async function act(action:string,body:Row){if(lock.current)return;lock.current=true;setWorking(true);setError('');setSaved('');try{const property=action==='respond'?(inbox?.offers||[]).find((o:Row)=>o.id===body.offerId)?.property_id:'';const result=await request('/api/operations/matching/'+action,body,undefined,undefined,'owner');apply(result);if(action==='preference'&&result.message)setSaved(result.message);if(property&&body.decision==='accept')setAnswered(v=>({...v,[property]:Date.now()}));if(action==='respond')await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking(false);}}
 const offers:Row[]=(inbox?.offers||[]).filter((o:Row)=>o.expires_at>now),processes:Row[]=mapData?.processes||[];
 useEffect(()=>{
  const asked=new Map(offers.map(o=>[o.property_id,Number(o.expires_at)-skew]));
  // Each object says its most urgent state; the AI's price advice puts the AI ring on it.
  const advice=new Map<string,{from:number;to:number}>((data.approvals||[]).filter((c:Row)=>c.kind==='price'&&c.price?.propertyId&&c.canDecide).map((c:Row)=>[c.price.propertyId,{from:Number(c.price.from),to:Number(c.price.to)}]));
  const clock=serverNow(mapData||data),threads=ownerThreads(data,clock);
  const own=(mapData?.properties||[]).flatMap((p:Row):MapPin[]=>{const point=pointOf(p),sent=!!answered[p.id]&&!asked.has(p.id),aiMove=latestMove(mapData?.aiMarks,[{kind:'property',id:String(p.id)}],clock),deal=ownerDeal(data,p.id,clock),calm=withAiResult(ownerPin(p,processes,clock,advice.get(p.id)),aiMove?.move);
   // The deal of the place has come to its end: the calm pin says «Готово ✓» for a while instead of the price.
   const spare=calm.tone==='alert'||calm.tone==='active'||calm.tone==='pending'?'':marginLabel(ownerMargin(data,p.id,clock));
   const state=spare?{label:spare,tone:'job' as const}:deal?.finished&&calm.tone==='home'?{label:tr('Готово ✓'),tone:'booked' as const}:calm,quiet=asked.has(p.id)||sent;
   return point?[{key:'property:'+p.id,point,round:true,title:p.title,act:quiet?undefined:ownerPinAct(threads,data,p.id,clock)||undefined,chain:deal?dealChain(deal):undefined,label:asked.has(p.id)?tr('Запрос'):sent?tr('Ответ отправлен'):state.label,rank:typeof p.price==='number'?p.price:0,tone:asked.has(p.id)?'pending':sent?'offer':state.tone,best:!asked.has(p.id)&&!sent&&state.best,until:asked.get(p.id),progress:asked.has(p.id)||sent?undefined:state.progress,ai:aiMove}]:[];});
  const moving=travellers(mapData?.journeys||[]).map((t):MapPin=>({...t,title:t.label,tone:'active'}));
  // Demand: the heat of the city, and sparks over the busiest places while guests are asking owners right now.
  const cells:Row[]=mapData?.demand?.cells||[],searching=Number(mapData?.demand?.searching)||0;
  publish([...own,...moving],'owner:'+(mapData?.properties?.length||0),{heat:cells.map(c=>({point:[c.longitude,c.latitude] as MapPoint,weight:c.weight})),sparks:searching?cells.slice(0,Math.min(3,searching)).map(c=>[c.longitude,c.latitude] as MapPoint):[]});
 },[mapData,inbox,answered,data.approvals,data.bookings,data.jobs,data.applications]);
 const searching=Number(mapData?.demand?.searching)||0;
 const clock=Date.now()/1000+skew,flats:Row[]=data.ownProperties||[],quickOn=(inbox?.preferences||[]).filter((p:Row)=>p.enabled).length,quickAuto=(inbox?.preferences||[]).filter((p:Row)=>p.mode==='auto').length;
 const day=ownerDay(data,serverNow(data)),cards=data.approvals||[];
 // A flat chosen by its pin or its row: one row with «Открыть», as the guest's; its card of four tabs opens after it.
 const flat=selected.startsWith('property:')?flats.find(p=>'property:'+p.id===selected):undefined;
 useEffect(()=>{setTab('today');},[flat?.id]);
 const placeOf=(p:Row)=>(mapData?.properties||[]).find((x:Row)=>x.id===p.id)||p;
 const head=(chips:boolean,children?:ReactNode)=><MapSheetHead role="owner" chips={chips} counts={{requests:ownerWaiting(data,data.user?.id||'',clock)}} text={asked} onText={setAsked} onSend={text=>{setAsked('');onAsk(text);}} onChip={action=>{/* A guest waiting for a quick answer is in this sheet; other requests are on their page. */if(action==='requests'){if(offers.length)expand(1);else onOpenPage('bookings');}else if(action==='calendar')onOpenPage('calendar');else if(action==='properties')onOpenPage('properties');}} now={null} onNow={()=>{}}>{children}</MapSheetHead>;
 if(flat&&snap===0){const m=placeOf(flat);return <View style={h.block}><HeadSlot onHeight={onHead}>{head(false,<PinRow photo={(m.photos||flat.photos||[])[0]} title={flat.title} line={[tr(m.display_status?.label||flat.display_status?.label||'Статус уточняется'),typeof flat.price==='number'?tr('{v} за сутки',{v:money(flat.price)}):''].filter(Boolean).join(' · ')} onOpen={()=>expand(1)}/>)}</HeadSlot></View>;}
 if(flat)return <View style={h.block}><HeadSlot onHeight={onHead}><FlatHubHead flat={flat} data={data} now={serverNow(data)} tab={tab} open={snap>0} onTab={next=>{setTab(next);if(snap===0)expand(1);}} onBack={()=>{setSelected('');expand(0);}} onOpen={onOpenProcess}/></HeadSlot>{snap>0&&<FlatHub flat={flat} data={data} now={serverNow(data)} tab={tab} onOpen={onOpenProcess} onEdit={step=>step==='job'?onIntent(flat.details?.type==='home'?'home-cleaning:'+flat.id:'job'):onEdit?.(flat.id,step)} onChanged={onChanged}/>}</View>;
 // «Сейчас» (concept «Один стандарт», 2026-11-26): one deal, one dark button or a swipe. A guest waiting for a quick
 // answer first, then a new booking request, then what waits for the owner's decision, then the AI's advice, then calm.
 const guestWaits=(o:Row)=><NowFrame key={o.id} dot="wait" kicker={tr('Сейчас · гость ждёт ответа')} timer={countdown(o.expires_at-now)} title={o.title} line={[date(Date.parse(o.filters.start)/1000)+' → '+date(Date.parse(o.filters.end)/1000),tr('гостей: {n}',{n:o.filters.guests}),money(o.amount)].join(' · ')}>{/* One swipe answers «Готов»; the words on the track are the promise the owner gives with it. */}<SwipeConfirm label={tr('Проведите: свободно и готово')} disabled={working} onConfirm={()=>act('respond',{offerId:o.id,decision:'accept',ready:true})}/><QuietButton title={tr('Отказать')} disabled={working} onPress={()=>act('respond',{offerId:o.id,decision:'decline'})}/></NowFrame>;
 const decision=day.yours[0];
 const calm=Array.isArray(data.ownProperties)&&!flats.length?<NowFrame dot="calm" kicker={tr('Сейчас')} title={tr('Добавьте первое жильё')} line={tr('Добавьте первое жильё, и оно появится на карте.')}><DarkButton title={tr('Добавить жильё')} onPress={()=>onOpenPage('properties')}/></NowFrame>
  :<NowFrame dot="ok" kicker={tr('Сейчас')} title={tr('Всё идёт по плану')} line={searching>0?plural(searching,'Сейчас {n} гость ищет жильё в городе.','Сейчас {n} гостя ищут жильё в городе.','Сейчас {n} гостей ищут жильё в городе.').replace('{n}',String(searching)):tr('остальное ведёт автопилот')}/>;
 const advice=<PriceTip inline role="owner" cards={cards} pick={isAdviceTip} onChanged={onChanged} onEdit={onEdit} fallback={calm}/>;
 const nowCard=offers[0]?guestWaits(offers[0]):<PriceTip inline role="owner" cards={cards} pick={isRequestTip} onChanged={onChanged} onEdit={onEdit} fallback={decision?<NowFrame dot="wait" kicker={tr('Сейчас · нужно ваше решение')} title={tr(decision.tag)+' · '+decision.title} line={decision.line}><DarkButton title={tr('Решить')} onPress={()=>onOpenProcess(decision.kind,decision.id)}/></NowFrame>:advice}/>;
 const dot=(p:Row):Dot=>{const tone=placeOf(p).display_status?.tone;return tone==='ready'||tone==='good'?'ok':tone==='danger'?'alert':tone==='warning'||tone==='warn'?'wait':'calm';};
 if(snap===0)return <View style={h.block}><HeadSlot onHeight={onHead}>{head(false,<>{/* An answer or a step sent from the folded sheet that failed says so here too. */}{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{nowCard}{flats.length>0&&<DayLine icon="calendar" title={tr('Сегодня')} value={day.line} onPress={()=>expand(1)}/>}</>)}</HeadSlot></View>;
 // The opened sheet, in the same order for every role: the chips of the sections, the day by time, then the blocks
 // of the owner: the AI's advice (it no longer covers the map), the objects with the dot of their state, adding one,
 // who answers guests. As on the site (components/map-workspace.tsx) a flat in the list opens its card.
 return <View style={h.block}><HeadSlot onHeight={onHead}>{head(true)}</HeadSlot>{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{offers.map(guestWaits)}{offers.length>0&&<Text style={h.note}>{tr('Ответ не создаёт бронь и не меняет цену. Если гость выберет ваше жильё, заявка придёт в «Заявки гостей».')}</Text>}<PriceTip inline role="owner" cards={cards} pick={isRequestTip} onChanged={onChanged} onEdit={onEdit}/>{(flats.length>0||day.yours.length>0)&&<OwnerToday data={data} now={serverNow(data)} onOpen={(kind,id)=>onOpenProcess(kind,id)}/>}<PriceTip inline role="owner" cards={cards} pick={isAdviceTip} onChanged={onChanged} onEdit={onEdit}/>{flats.length>0&&<AutopilotHandoff role="owner" accountId={accountId} stamp={flats.map(p=>p.id+':'+(p.policy?.version??'')+':'+(p.policy?.cleaning_fee??'')+':'+(p.policy?.auto_confirm??'')).join('|')} tick={Number(data.serverTime)||0} compact={false} onExpand={()=>expand(2)} onChanged={onChanged} onSetup={id=>{if(id)onEdit?.(id,'prices');}}/>}<View><BlockHead title={tr('Мои объекты')+' · '+flats.length} more={tr('Все')} onMore={()=>onOpenPage('properties')}/>{flats.map(p=>{const m=placeOf(p);return <PlaceRow key={p.id} label={tr('Мои объекты: {title}',{title:p.title})} title={p.title} photo={(m.photos||p.photos||[])[0]} dot={dot(p)} state={[tr(m.display_status?.label||p.display_status?.label||'Статус уточняется'),m.location?'':tr('нет точки на карте')].filter(Boolean).join(' · ')} price={typeof p.price==='number'?money(p.price):undefined} onPress={()=>{setSelected('property:'+p.id);expand(1);}}/>;})}{!flats.length&&<Text style={h.note}>{tr('Объектов пока нет.')}</Text>}<IconRow icon="plus" title={tr('Добавить жильё')} onPress={()=>onOpenPage('properties')}/>{!!inbox&&<IconRow icon="shanyrak" title={tr('Кто отвечает гостям')} value={quickAuto?tr('Автопилот · {n}',{n:quickAuto}):quickOn?tr('Вы'):tr('Никто')} label={tr('Кто отвечает гостям')+': '+(quickOn?tr('Включены: {found}',{found:quickOn+' '+plural(quickOn,'объект','объекта','объектов')}):tr('Выключены'))} onPress={()=>setQuick(v=>!v)}/>}</View>{quick&&!!inbox&&<View style={h.card}><Text accessibilityRole="header" style={h.label}>{tr('Кто отвечает гостям')}</Text><Text style={h.note}>{tr('Автопилот отвечает гостям и заказывает уборку. Оплату проверяете вы.')}</Text>{!!saved&&<Text accessibilityLiveRegion="polite" style={h.note}>{saved}</Text>}{(inbox.preferences||[]).map((p:Row)=><GuestMode key={p.id} flat={p} busy={working} onChange={body=>act('preference',body)}/>)}{!inbox.preferences.length&&<Text style={h.note}>{tr('Включить можно после добавления жилья.')}</Text>}</View>}</View>;
}

function CleanerPanel({accountId,data,mapData,city,publish,snap,showNow,expand,onHead,onAsk,onChanged,onOpenProcess,onOpenPage,onChat,setFocus}:Common){
 const [asked,setAsked]=useState(''),clock=serverNow(data);
 const [error,setError]=useState(''),[working,setWorking]=useState(''),lock=useRef(false);
 const userId=data.user?.id,jobs:Row[]=data.jobs||[],applications:Row[]=data.applications||[];
 const mine=jobs.filter(j=>j.assigned_to===userId&&['assigned','in_progress','submitted'].includes(j.status)).sort((a,b)=>a.start-b.start);
 // The day's route: the cleaning under way, then today's in time order (cleaner-map.ts); the first assigned stop is where to go next.
 const route=dayRoute(jobs,userId,clock),routeIds=route.map(r=>r.id+':'+r.status).join(),order=new Map(route.map(r=>[r.id,r.order]));
 const located=new Map<string,MapPoint|null>((mapData?.processes||[]).map((p:Row)=>[p.id,pointOf(p)]));
 const next=route.find(r=>r.status==='assigned'&&located.get(r.id))?.id,summary=routeSummary(route.map(r=>({fee:Number(mine.find(j=>j.id===r.id)?.fee)||0,point:located.get(r.id)})));
 // «Поехали» leads on our own map (Navigator.tsx): the sheet folds down to the turn ahead, the map shows the road and the cleaner's point.
 const skew=mapData?.serverTime&&mapData?.receivedAt?Number(mapData.serverTime)-Number(mapData.receivedAt):0,nav=useTrip('cleaner',skew);
 const go=(j:Row)=>{const point=located.get(j.id);if(!point)return;expand(0);void nav.start({kind:'job',id:j.id,title:j.title,target:point});};
 const applied=(id:string)=>applications.some(a=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
 const open=jobs.filter(j=>j.status==='open'&&j.end>clock&&j.owner_id!==userId).sort((a,b)=>a.start-b.start);
 // "Рядом" is the city the map shows (the cleaner's own): the same open jobs as the pins, matched the way the server matches them.
 // Jobs in other cities are one tap away, on the page of all jobs.
 const nearby=open.filter(j=>String(j.city||'').toLocaleLowerCase('ru').includes(city.trim().toLocaleLowerCase('ru'))),nearbyIds=nearby.map(j=>j.id).join();
 // «Новое задание» (CleanerOffer.tsx): the best paid open job nearby the cleaner has not answered or skipped, while no cleaning is under way.
 const [skipped,setSkipped]=useState<string[]>([]);
 const offers=nearby.filter(j=>!applied(j.id)&&!skipped.includes(j.id)).sort((a,b)=>Number(b.fee)-Number(a.fee)||a.start-b.start);
 // A cleaning offered to this person with a time to answer (lib/dispatch.ts) comes first, wherever it is: it waits for
 // this answer only. Its card counts the time down and leaves when the time is up or the answer is given.
 const [passed,setPassed]=useState<string[]>([]);
 const personal=((data as Row).cleaningOffers||[]).filter((o:Row)=>!passed.includes(o.id)&&Number(o.expires_at)>clock&&jobs.some(j=>j.id===o.job_id)) as Row[];
 const idle=!mine.some(j=>j.status==='in_progress')&&!nav.trip,proposal=idle?personal[0]:undefined;
 const offer=proposal?jobs.find(j=>j.id===proposal.job_id):idle?offers[0]:undefined;
 // «Сейчас» (concept «Один стандарт», 2026-11-26): an offer made to this person with its time first, then what waits for
 // the cleaner's decision, the cleaning under way, the next stop of the day, a new job nearby, else a calm card.
 const yours=cleanerThreads(data,clock).filter(t=>t.yours),doing=mine.find(j=>j.status==='in_progress'),coming=mine.find(j=>j.id===next)||mine.find(j=>j.status==='assigned');
 const lead=proposal&&offer?'offer':yours[0]?'decision':doing?'doing':coming?'next':offer?'offer':'calm';
 const offerId=lead==='offer'&&offer?offer.id:'';
 useEffect(()=>{
  // Each job says what to do now; the day's stops carry their number and are joined by the route line in order.
  const shown=(mapData?.processes||[]).filter((p:Row)=>p.kind==='job'&&(p.status!=='open'||nearby.some(j=>j.id===p.id)));
  const at=serverNow(mapData||data),byId=new Map(jobs.map(j=>[j.id,j])),threads=cleanerThreads(data,at);
  const pins=shown.flatMap((p:Row):MapPin[]=>{const point=pointOf(p);if(!point)return [];const state=cleanerPin({...byId.get(p.id),...p},route.find(r=>r.id===p.id),at,applied(p.id));const thread=threads.find(t=>t.id===p.id);return [{key:'job:'+p.id,point,title:p.title,...state,best:p.id===offerId,chain:thread&&p.status!=='open'?threadChain(thread):undefined,ai:latestMove(mapData?.aiMarks,[{kind:'job',id:String(p.id)}],at)}];});
  const placed=new Map<string,MapPoint|null>(shown.map((p:Row)=>[p.id,pointOf(p)]));
  // On a trip the map shows only the way: the object, the cleaner's point and the road between them; it frames them at the start and after a new route.
  if(nav.trip){
   const target=pins.filter((p:MapPin)=>p.key==='job:'+nav.trip!.id),me:MapPin[]=nav.here&&nav.status!=='arrived'?[{key:'me',point:nav.here.point,title:tr('Вы'),label:tr('Вы'),tone:'active'}]:[];
   const path=nav.state?.path;
   publish([...target,...me],'nav:'+nav.trip.id+':'+nav.rerouted,{lines:path&&path.length>1?[{key:'nav:'+nav.trip.id,from:path[0],to:path[path.length-1],tone:'nav',path}]:[]});
   return;
  }
  publish(pins,'cleaner:'+(mapData?.processes?.length||0),{lines:routeLines(route.map(r=>placed.get(r.id)))});
 },[mapData,nearbyIds,data.applications,data.jobs,routeIds,nav.trip,nav.here,nav.route,nav.rerouted,offerId]);
 // The offered job's pin is the chosen one on the map: dark, with the ✦, as the order in a taxi app. It runs after the
 // pins are published, which clears the focus of a new set of pins.
 useEffect(()=>{setFocus(offerId?'job:'+offerId:'');},[offerId,mapData]);
 // The step of a job taken right on the map: an answer to an open one, the start of the one the guest has left.
 async function act(id:string,action:'apply'|'start'|'arrived'){if(lock.current)return;lock.current=true;setWorking(id);setError('');try{await request('/api/jobs/'+id,{action},undefined,'map-'+action+':'+id,'cleaner');await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking('');}}
 const apply=(id:string)=>act(id,'apply');
 // The answer to an offer made to this person: «да» takes it (a pinned cleaner is assigned at once), «нет» passes it on.
 async function answer(o:Row,action:'accept'|'decline'){if(lock.current)return;lock.current=true;setWorking(o.job_id);setError('');try{await request('/api/operations/dispatch/offer',{id:o.id,action},undefined,'offer-'+action+':'+o.id,'cleaner');setPassed(v=>[...v,o.id]);await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking('');}}
 // As a taxi order in the concept: while there is a new job, the collapsed sheet is its card alone; the AI line and the
 // rest are one pull of the sheet away, with the card on top of them.
 const offerCard=offer?(proposal?<CleanerOffer job={offer} offer={proposal} left={0} busy={!!working} onApply={()=>void answer(proposal,'accept')} onSkip={()=>void answer(proposal,'decline')} onExpire={()=>setPassed(v=>[...v,proposal.id])} onOpen={()=>onOpenProcess('job',offer.id)}/>
  :<CleanerOffer job={offer} left={offers.length-1} busy={!!working} onApply={()=>apply(offer.id)} onSkip={()=>setSkipped(v=>[...v,offer.id])} onOpen={()=>onOpenProcess('job',offer.id)}/>):null;
 const stopNow=(j:Row)=>{
  // One main button a stop: the step that is due (start, report); before it, the way there.
  const step=cleanerStep(j,undefined,userId),isNext=j.id===next,late=j.status==='assigned'&&Number(j.start)<clock;
  return <NowFrame dot={j.status==='in_progress'?'ok':late?'alert':'ink'} kicker={j.status==='in_progress'?tr('Сейчас · уборка идёт'):tr('Сейчас · следующая уборка')} title={(order.get(j.id)?order.get(j.id)+' · ':'')+j.title} line={[date(j.start)+' → '+date(j.end),money(j.fee)].join(' · ')}>{step?.id==='start'?<DarkButton title={working===j.id?tr('Начинаем…'):step.label} disabled={!!working} onPress={()=>act(j.id,'start')}/>:step?.id==='report'?<DarkButton title={step.label} onPress={()=>onOpenProcess('job',j.id)}/>:isNext?<DarkButton title={tr('Поехали')} disabled={!!nav.trip} onPress={()=>go(j)}/>:<DarkButton title={tr('Открыть задание')} onPress={()=>onOpenProcess('job',j.id)}/>}</NowFrame>;
 };
 const decision=yours[0];
 const nowCard=lead==='offer'?offerCard:lead==='decision'&&decision?<NowFrame dot="wait" kicker={tr('Сейчас · нужно ваше решение')} title={tr(decision.tag)+' · '+decision.title} line={decision.line}><DarkButton title={tr('Решить')} onPress={()=>onOpenProcess(decision.kind,decision.id)}/></NowFrame>
  :lead==='doing'&&doing?stopNow(doing):lead==='next'&&coming?stopNow(coming)
  :<NowFrame dot="calm" kicker={tr('Сейчас')} title={tr('Новых заданий рядом нет')} line={tr('{city}: открытых заданий сейчас нет. Адрес виден только назначенному исполнителю.',{city})}/>;
 const head=(chips:boolean,children?:ReactNode)=><MapSheetHead role="cleaner" chips={chips} counts={{nearby:nearby.filter(j=>!applied(j.id)).length}} text={asked} onText={setAsked} onSend={text=>{setAsked('');onAsk(text);}} onChip={action=>{if(action==='nearby')expand(2);else if(action==='schedule')onOpenPage('calendar');}} now={null} onNow={()=>{}}>{!!nav.error&&<Text accessibilityRole="alert" style={h.error}>{nav.error}</Text>}{children}</MapSheetHead>;
 const week=cleanerWeek(jobs,userId||'',clock);
 if(nav.trip)return <View style={h.block}><HeadSlot onHeight={onHead}>{(()=>{const id=nav.trip!.id,j=jobs.find(x=>x.id===id);return <TripHead nav={nav} address={j?.address||j?.open_address} detail={j?[j.title,money(j.fee)].join(' · '):undefined} onOpen={()=>{nav.close();onOpenProcess('job',id);}} onChat={j&&onChat&&j.assigned_to===userId?()=>onChat('job',id):undefined} onCall={j&&onChat&&j.assigned_to===userId?()=>onChat('job',id,true):undefined} onArrived={j&&j.status==='assigned'&&!j.arrived_at?async()=>{await act(id,'arrived');nav.close();onOpenProcess('job',id);}:undefined}/>;})()}</HeadSlot></View>;
 // The AI line always shows, as the guest's; under it the one deal and the one line of the day.
 if(snap===0)return <View style={h.block}><HeadSlot onHeight={onHead}>{head(false,<>{/* An answer or a step sent from the folded sheet that failed says so here too. */}{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{nowCard}<DayLine icon="calendar" title={tr('Мой день')} value={summary||tr('Сегодня спокойно')} onPress={()=>expand(1)}/></>)}</HeadSlot></View>;
 // The opened sheet: the chips, the offer, the day's route as stops on one rail, the switch of the autopilot, the jobs
 // nearby as rows with «Отклик», the week, the money of the week.
 return <View style={h.block}><HeadSlot onHeight={onHead}>{head(true)}</HeadSlot>{!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}{offerCard}{lead==='decision'&&nowCard}{mine.length>0&&<View><BlockHead title={route.length?tr('Мой день'):tr('Ваше задание')}/>{!!summary&&<Text style={[h.note,{marginBottom:8}]}>{summary}</Text>}{mine.map((j,i)=>{
    const step=cleanerStep(j,undefined,userId),isNext=j.id===next;
    const button=step?.id==='start'?{title:working===j.id?tr('Начинаем…'):step.label,run:()=>act(j.id,'start')}:step?.id==='report'?{title:step.label,run:()=>onOpenProcess('job',j.id)}:isNext?{title:tr('Поехали'),run:()=>go(j)}:null;
    return <TimeRow key={j.id} now={isNext||j.status==='in_progress'} last={i===mine.length-1} time={timeLabel(j.start,clock)} title={(order.get(j.id)?order.get(j.id)+' · ':'')+j.title} line={cleanerLine(j)} button={button?.title} onButton={button?.run} busy={!!working||(!!nav.trip&&button?.title===tr('Поехали'))} onPress={()=>onOpenProcess('job',j.id)}/>;
   })}</View>}<AutopilotHandoff role="cleaner" accountId={accountId} tick={Number(data.serverTime)||0} compact={false} onExpand={()=>expand(2)} onChanged={onChanged} onSetup={()=>onOpenPage('account')}/><View><BlockHead title={tr('Задания рядом · {city}',{city})} more={open.length>nearby.length?tr('Все')+' · '+open.length:tr('Все')} onMore={()=>onOpenPage('jobs')}/>{nearby.slice(0,8).map((j,i,list)=><TimeRow key={j.id} last={i===list.length-1} time={timeLabel(j.start,clock)} title={money(j.fee)+' · '+j.title} line={[date(j.start)+' → '+date(j.end),j.district].filter(Boolean).join(' · ')} button={applied(j.id)?tr('Отклик отправлен'):working===j.id?tr('Отправляем…'):tr('Откликнуться')} busy={!!working||applied(j.id)} onButton={()=>apply(j.id)} onPress={()=>onOpenProcess('job',j.id)}/>)}{!nearby.length&&<Text style={h.note}>{tr('{city}: открытых заданий сейчас нет. Адрес виден только назначенному исполнителю.',{city})}</Text>}</View><View><BlockHead title={tr('Неделя')} more={tr('График')} onMore={()=>onOpenPage('calendar')}/><AutopilotThreads role="cleaner" data={data} now={clock} calendar weekOnly onOpen={(kind,id)=>onOpenProcess(kind,id)}/></View><DayLine icon="wallet" title={tr('Заработок за неделю')} value={money(week.sum)} onPress={()=>onOpenPage('account:money')}/></View>;
}
type Props = {
  role: Role;
  accountId: string;
  data: Row;
  menu?: ReactNode;
  // The owner's and the cleaner's top plate (RolePlate.tsx) in place of the round menu button: the photo opens the menu.
  account?: { avatarId?: string | null; avatarName?: string; open: boolean; busy: boolean; onProfile: () => void };
  chats?: ReactNode;
  onChanged: () => Promise<unknown>;
  onOpenProcess: (kind: 'booking' | 'job', id: string) => void;
  onOpenPage: (id: string) => void;
  onAsk: (text: string) => void;
  onIntent: (intent: string, stay?: MapStay) => void;
  onBook: (property: Row, stay: MapStay) => void;
  onEdit?: (id: string, step: string | null) => void;
  // The chat of a booking or a cleaning from the trip head (Navigator.tsx); call: start the call in the app at once.
  onChat?: (kind: 'booking' | 'job', id: string, call?: boolean) => void;
  // «На карте» on a page: the pin to bring into view and choose; onTargetDone when it was shown (or cannot be).
  target?: MapTarget | null;
  onTargetDone?: () => void;
  // The card of one booking or cleaning is open over the map: the map shows where it is. cover: how much of the
  // map that card hides, from the bottom, so the pin stands in the part that is still seen.
  spot?: MapTarget | null;
  cover?: number;
};

// The screen itself: the map, the avatar button over it, and the sheet with its three positions
// (0: only the head, 1: a little over half of the screen, 2: almost all of it).
export function MapHome({ role, accountId, data, menu, account, chats, onChanged, onOpenProcess, onOpenPage, onAsk, onIntent, onBook, onEdit, onChat, target, onTargetDone, spot, cover = 0 }: Props) {
  // What the map kept from the last visit of this account in this role (map-memory.ts): the view, the chosen pin,
  // the last map answer and how each pin looked. A pin asked for by «На карте» wins over the remembered view.
  const scope = accountId + ':' + role;
  const kept = useRef(recallMap(scope)).current;
  const echoes = useRef(kept ? { stage: kept.stage, pins: { ...kept.pins } } : null);
  const aim = useRef(target ? targetPin(role, target, data) : null);
  const restore = useRef(kept?.view && !aim.current ? { view: kept.view, key: kept.viewKey } : null).current;
  const screen = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const [top, setTop] = useState(0);
  const [snap, setSnap] = useState(0);
  const typing = useKeyboardOpen();
  const [head, setHead] = useState(0);
  const [reach, setReach] = useState(0);
  const [pins, setPins] = useState<MapPin[]>([]);
  // The owner's filter over the map (concept 2026-11-25): only what waits, only the stays, only the cleanings.
  const [only, setOnly] = useState<OwnerFilter>('');
  const [focusKey, setFocusKey] = useState('');
  const [selected, setSelected] = useState(aim.current ? '' : kept?.selected || '');
  const [notice, setNotice] = useState('');
  // The pin of the carousel card in view; a new set of pins forgets it.
  const [focus, setFocus] = useState('');
  const [lines, setLines] = useState<MapLine[]>([]);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [sparks, setSparks] = useState<MapPoint[]>([]);
  const shownKey = useRef('');
  const [mapData, setMapData] = useState<Row | null>(kept?.data || null);
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  // The guest's answer as in the concept of 2026-11-25 (Airbnb, Vrbo): no sheet, the conditions on top of the map,
  // one card floating at the bottom. The guest's panel hands its top bar here; null is the usual sheet.
  const [floatBar, setFloatBar] = useState<ReactNode | null>(null);
  // The guest form's «Показать N вариантов» stands under the sheet's scroll, always in sight (GuestForm onFoot).
  const [footBar, setFootBar] = useState<ReactNode | null>(null);
  // The owner's «Что показать на карте» and the cleaner's switch of new offers, set at once while it is saved.
  const [placesOpen, setPlacesOpen] = useState(false);
  const [away, setAway] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  // A booking card over the map (the wait for the owner) hides the top bar: only the map and that card stay.
  const floating = role === 'guest' && !!floatBar && !(spot && cover > 0);
  const host = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const mapCenter = useRef<MapPoint | null>(null);
  const sheet = useRef(new Animated.Value(0)).current;
  // The sheet settles like a spring with a light overshoot, as in the live map concept; with «reduce motion» it simply moves.
  const [calm, setCalm] = useState(false);
  const [quiet, setQuiet] = useState(false);
  useEffect(() => { let live = true; AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setCalm(v); }).catch(() => {}); const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => setCalm(v)); return () => { live = false; sub?.remove(); }; }, []);
  const calmRef = useRef(calm); calmRef.current = calm;
  const settle = (to: number) => calmRef.current ? Animated.timing(sheet, { toValue: to, duration: T.motion.base, useNativeDriver: false }).start() : Animated.spring(sheet, { toValue: to, stiffness: 260, damping: 24, mass: 1, overshootClamping: false, restDisplacementThreshold: 0.5, restSpeedThreshold: 0.5, useNativeDriver: false }).start();

  // Collapsed, the sheet is as tall as its head, and its top edge stays in the lower half of the screen.
  // A phone shorter than 700px never has the "Сейчас" card there, so a head taller than that is a message with
  // its button: the sheet may rise to 36% of the screen for it instead of hiding the button under the tabs.
  // A head that needs even more scrolls inside the sheet instead of being cut.
  const wanted = (floating ? 0 : handleHeight) + head + 12;
  const topEdge = screen.height >= 700 ? 0.5 : 0.36;
  // While the keyboard is open the map above it is short: the half-screen rule would squeeze the line being typed in
  // to a strip. The sheet then stands on the keyboard with its whole head (the line, the chips), the map above it.
  const cap = typing ? Math.round(height * 0.88) : Math.max(handleHeight + T.control.primary + 24, Math.round(top + height - screen.height * topEdge));
  const collapsed = head ? Math.min(cap, wanted) : Math.max(132, Math.round(height * 0.2));
  // The answer is shown down to «Забронировать» of the card in view or of the chosen flat: the half-open sheet grows for
  // it, so the button is never under the tabs. The results say where that is, and take it back when they go.
  const full = Math.max(collapsed, Math.round(height * 0.88));
  const fit = role === 'guest' && reach ? handleHeight + reach + 16 : 0;
  const heights = [collapsed, Math.min(full, Math.max(collapsed, Math.round(height * 0.55), fit)), full];
  const sheetHeight = height ? heights[snap] : 0;
  const scrollable = snap > 0 || !head || wanted > collapsed;
  // The "Сейчас" card is in the collapsed sheet on a phone tall enough for it (700px, as on the site). A shorter one keeps
  // the map: the collapsed sheet is the line and the chips, and the card is shown when the sheet is opened.
  const showNow = screen.height >= 700 ? snap === 0 : snap > 0;

  // The keyboard moves the sheet with it, evenly: no spring overshoot while it rises or hides.
  const typedBefore = useRef(typing);
  useEffect(() => {
    if (!sheetHeight) return;
    if (typedBefore.current !== typing) { typedBefore.current = typing; Animated.timing(sheet, { toValue: sheetHeight, duration: T.motion.base, useNativeDriver: false }).start(); return; }
    settle(sheetHeight);
  }, [sheetHeight, sheet, typing]);
  useEffect(() => {
    if (snap === 0) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [snap]);
  // What is chosen replaces the list in the same scroll view: it is shown from its top, not from where the list was.
  // Back to the list, the sheet returns to where the guest left it, so the next card is compared from the same place.
  const scrollY = useRef(0), listY = useRef(0), wasSelected = useRef(selected);
  // The field typed in (the search line, the district) and its suggestions come above the keyboard.
  const reveal = useKeyboardReveal(scroll, scrollY);
  useEffect(() => {
    const before = wasSelected.current;
    wasSelected.current = selected;
    if (!before && selected) listY.current = scrollY.current;
    const y = before && !selected ? listY.current : 0;
    if (!y) { scroll.current?.scrollTo({ y: 0, animated: false }); return; }
    // The list is laid out again first; the offset is set once it is there.
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(frame);
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
        settle(all[next]);
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
    // One step at a time: the point picker, then the open card (back to the list it came from), then the sheet.
    if (Platform.OS !== 'android' || (snap === 0 && !picking && !selected)) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) setPicking(false);
      else if (selected) setSelected('');
      else setSnap(0);
      return true;
    });
    return () => back.remove();
  }, [snap, picking, selected]);

  // One city drives the map query, the viewport and the guest's request, so a picked point always lies in the searched city.
  const [city, setCity] = useState<string>(() => {
    // A guest opens the map where the phone last saw them, before the city of the profile (often left as it was at
    // sign-up). Pavlodar is only the last resort, when neither the phone nor the profile names a city of the service.
    const fix = role === 'guest' ? getHere().fix : null;
    const wanted = aim.current?.city || kept?.city || (fix && nearestCity(fix.point)) || data.profile?.city;
    return mapCities[wanted] ? wanted : mapCities[data.profile?.city] ? data.profile.city : tr('Павлодар');
  });
  const cityRef = useRef(city);
  cityRef.current = city;
  const loadMap = async () => {
    const asked = cityRef.current;
    // Without an account the map is the public one: the same homes at the same rough points, nothing of anybody's deals.
    const result = accountId ? await request('/api/operations/map/search', { filters: { city: asked } }, undefined, undefined, role) : await request('/api/public/catalog?map=1&limit=60&city=' + encodeURIComponent(asked));
    if (cityRef.current !== asked) return;
    const next = { ...result, city: asked, receivedAt: Date.now() / 1000 };
    setMapData(next);
    rememberMap(scope, { data: next, city: asked });
  };
  // Someone on the way moves on the map: it refreshes every 10 seconds while they do, otherwise every 30.
  usePoll(loadMap, mapData?.journeys?.some((j: Row) => j.longitude != null) ? 10000 : 30000, true);
  const firstCity = useRef(true);
  useEffect(() => {
    if (firstCity.current) {
      firstCity.current = false;
      return;
    }
    setMapData(null);
    loadMap().catch(() => {});
  }, [city]);
  // A remembered answer is for the city it was asked in.
  useEffect(() => {
    if (mapData && mapData.city !== city) setMapData(null);
  }, []);

  const publish: Publish = (next, key, extra = {}) => {
    const stage = stageOf(key);
    setPins(withEchoes(next, echoes.current, stage));
    rememberMap(scope, { stage, pins: pinStates(next) });
    setLines(extra.lines || []);
    setHeat(extra.heat || []);
    setSparks(extra.sparks || []);
    if (key !== shownKey.current) setFocus('');
    shownKey.current = key;
    setFocusKey(key);
  };
  // The chosen pin is kept for the return; so is the view, with the set of pins it was looking at.
  useEffect(() => {
    rememberMap(scope, { selected });
  }, [selected]);
  useEffect(() => {
    const timer = setTimeout(() => {
      echoes.current = null;
    }, ECHO_WINDOW);
    return () => clearTimeout(timer);
  }, []);
  // «На карте»: once the pin is on the map it is chosen and the map flies to it. A pin that does not come within a few
  // seconds (no place on the map yet, or not in this role's map) is said in one line instead.
  useEffect(() => {
    const t = aim.current;
    if (!target) return;
    if (!t) {
      setNotice(tr(NOT_ON_MAP));
      onTargetDone?.();
      return;
    }
    if (t.city && mapCities[t.city] && t.city !== cityRef.current) setCity(t.city);
    const timer = setTimeout(() => {
      if (aim.current !== t) return;
      aim.current = null;
      setNotice(tr(NOT_ON_MAP));
      onTargetDone?.();
    }, 8000);
    return () => clearTimeout(timer);
  }, []);
  const openedAt = useRef(Date.now() / 1000).current;
  useEffect(() => {
    const t = aim.current;
    if (!t) return;
    if (pins.some(p => p.key === t.key)) {
      aim.current = null;
      setSelected(t.key);
      setFocus(t.key);
      onTargetDone?.();
    } else if (mapData && mapData.receivedAt >= openedAt && (!t.city || !mapCities[t.city] || mapData.city === t.city)) {
      // The map has answered after this visit began and the pin is not among its pins.
      aim.current = null;
      setNotice(tr(NOT_ON_MAP));
      onTargetDone?.();
    }
  }, [pins]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  // The mood of the map: what its pins say taken together (map-motion.ts). A pin that turns green plays the joy once.
  const mood = role === 'cleaner' ? 'calm' : mapMood(pins);
  const [joy, setJoy] = useState(0);
  const tones = useRef<Record<string, PinTone>>({});
  useEffect(() => {
    if (moodJoy(tones.current, pins)) setJoy(n => n + 1);
    tones.current = Object.fromEntries(pins.map(p => [p.key, p.tone || 'home']));
  }, [pins]);
  // The pin of the booking or cleaning whose card is open: the map flies to it and lifts it, without choosing it.
  // Its own pin first (the guest's booking, the performer's job), then the pin of its home.
  const spotKey = (spot ? [spot.kind + ':' + spot.id, targetPin(role, spot, data)?.key || ''] : []).find(key => key && pins.some(p => p.key === key)) || '';
  // The map waits for the measured height of the card, so it flies once, to the place that stays in view. A card that
  // leaves no room above it for a pin (it may take up to 92% of the screen) is not flown to: the pin would be under it.
  const spotted = !!spotKey && cover > 0 && height - cover - topInset >= SPOT_ROOM;
  // That card stands in place of this sheet: the sheet steps back, so its edge never shows from behind a shorter card,
  // and the light of the mood moves to the top edge of the card.
  const covered = !!spot && cover > 0;
  const veil = useRef(new Animated.Value(1)).current, cardEdge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (covered) cardEdge.setValue(cover);
    Animated.timing(veil, { toValue: covered ? 0 : 1, duration: calmRef.current ? 0 : T.motion.base, useNativeDriver: false }).start();
  }, [covered, cover]);
  const common: Common = { setFloat: setFloatBar, setFoot: setFootBar, setScanning, setQuiet, accountId, data, mapData, city, publish, selected, setSelected, focus, setFocus, snap, showNow, expand: setSnap, onHead: setHead, onReach: setReach, onAsk, onIntent, onBook, onChanged, onOpenProcess, onOpenPage, onEdit, onChat, flyMe: () => setMeFly(n => n + 1), notify: setNotice };
  const center = mapCities[city] || validPoint(mapData?.center) || mapCities['Павлодар'];

  // Where the person is (here.ts). The first visit of the map asks the phone (the system prompt appears only if it was
  // never shown); «Где я» asks again and flies to the person. What the phone could not tell is said over the map with
  // a way out: Settings, another try, or (for a guest) the point put on the map by hand. Meanwhile the map shows the city.
  const here = useHere();
  const [meFly, setMeFly] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [hereTip, setHereTip] = useState<HereNote | null>(null);
  // A finger held on the map (guest only): GuestPanel searches around that point.
  const [held, setHeld] = useState<{ point: MapPoint; n: number } | null>(null);
  useEffect(() => {
    if (isFresh(getHere().fix)) return;
    setSeeking(true);
    void locate({ ask: 'first' }).finally(() => setSeeking(false));
  }, []);
  const findMe = async () => {
    setHereTip(null);
    setSeeking(true);
    try {
      const found = await locate({ ask: 'always' });
      if (found.fix) {
        setMeFly(n => n + 1);
        if (found.status !== 'found') setNotice(tr('Показываем место, где телефон видел вас недавно. Уточняем…'));
      } else setHereTip(hereNote(found.status, city, role === 'guest', Platform.OS));
    } finally {
      setSeeking(false);
    }
  };
  // Back from Settings with access allowed: the tip goes and the map flies to the person.
  useEffect(() => {
    if (here.fix && hereTip) {
      setHereTip(null);
      setMeFly(n => n + 1);
    }
  }, [here.fix]);
  useEffect(() => {
    if (!hereTip) return;
    const timer = setTimeout(() => setHereTip(null), 12000);
    return () => clearTimeout(timer);
  }, [hereTip]);
  // Picking a point starts where the guest is, when that is in the searched city.
  useEffect(() => {
    if (picking && here.fix && nearestCity(here.fix.point) === city) setMeFly(n => n + 1);
  }, [picking]);
  const hereAct = (action: HereAction) => {
    setHereTip(null);
    if (action === 'settings') openLocationSettings();
    else if (action === 'retry') void findMe();
    else {
      setPicking(true);
      setSnap(0);
    }
  };
  // The top plate of the owner and the cleaner (concept 2026-11-26): what the map shows, changed in one tap.
  const clockNow = serverNow(data), plateWidth = Math.min(320, screen.width - 136);
  const ownFlats: Row[] = role === 'owner' ? data.ownProperties || [] : [];
  const placeOf = (p: Row) => (mapData?.properties || []).find((x: Row) => x.id === p.id) || p;
  const flatDot = (p: Row) => { const tone = placeOf(p).display_status?.tone; return tone === 'ready' || tone === 'good' ? C.success : tone === 'danger' ? C.danger : tone === 'warning' || tone === 'warn' ? C.warning : C.muted; };
  const flatState = (p: Row) => tr(placeOf(p).display_status?.label || p.display_status?.label || 'Статус уточняется');
  const chosenFlat = role === 'owner' && selected.startsWith('property:') ? ownFlats.find(p => 'property:' + p.id === selected) : undefined;
  // Taken from the bookings themselves (own-place.ts), not from the pins' tones: an arrival tomorrow is not a guest.
  const living = ownFlats.filter(p => takenNow(p.id, data.bookings || [], clockNow)).length, ownerLine = ownerDay(data, clockNow).line;
  const workOn = away === null ? (data.profile?.work_status || 'available') !== 'away' : !away;
  const todayLine = role === 'cleaner' ? routeSummary(dayRoute(data.jobs || [], data.user?.id, clockNow).map(r => ({ fee: Number((data.jobs || []).find((j: Row) => j.id === r.id)?.fee) || 0 }))) : '';
  // The profile may have changed in the menu since the last load (its privacy switches): on a version conflict the switch
  // reads the profile again and saves once more; any other failure reloads, so the next tap starts from the server's state.
  async function setWork(on: boolean) {
    const p = data.profile;
    if (!p || switching) return;
    setSwitching(true); setAway(!on); setNotice('');
    const save = (q: Row) => request('/api/profile/edit', { name: q.name, contact: q.contact, city: q.city, districts: q.districts, experience: q.experience, availability: q.availability, avatarId: q.avatar_id || null, workStatus: on ? 'available' : 'away', expectedVersion: q.profile_version || 0 });
    try {
      try { await save(p); } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        const fresh = (await request('/api/account'))?.profile;
        if (!fresh) throw e;
        await save(fresh);
      }
      await onChanged();
    } catch (e) { setNotice(e instanceof Error ? e.message : tr('Не удалось сохранить.')); await onChanged().catch(() => undefined); } finally { setAway(null); setSwitching(false); }
  }
  // «Что показать на карте»: the chosen object is selected and the map flies to it, as «На карте» does; one in another city
  // loads that city first (the aim effect above selects it when its pin comes), one without a place says so.
  const pickPlace = (id: string) => {
    setPlacesOpen(false); setOnly('');
    const flat = ownFlats.find(p => 'property:' + p.id === id), where = String(flat?.city || '');
    if (!flat) { setSelected(''); setFocus(''); return; }
    if (!pins.some(p => p.key === id) && mapCities[where] && where !== cityRef.current) { aim.current = { key: id, city: where }; setCity(where); return; }
    setSelected(id); setFocus('');
    if (pins.some(p => p.key === id)) setTimeout(() => setFocus(id), 0); else setNotice(tr(NOT_ON_MAP));
  };
  const pickPlaces: PickPlace[] = ownFlats.map(p => ({ id: 'property:' + p.id, title: p.title, photo: (placeOf(p).photos || p.photos || [])[0], dot: flatDot(p), state: flatState(p), price: typeof p.price === 'number' ? money(p.price) : undefined }));
  const plate = !account || floating ? null : role === 'owner' ? (
    <RolePlate {...account} width={plateWidth} caret={ownFlats.length > 1} expanded={placesOpen}
      title={chosenFlat ? chosenFlat.title : ownFlats.length === 1 ? ownFlats[0].title : ownFlats.length ? tr('Все объекты') : tr('Моё жильё')}
      line={chosenFlat ? flatState(chosenFlat) : !ownFlats.length ? tr('Добавьте первое объявление') : [ownFlats.length === 1 ? (living ? tr('гости в доме') : tr('свободно')) : tr('{a} из {b} заняты', { a: living, b: ownFlats.length }), ownerLine === tr('спокойно') ? '' : ownerLine].filter(Boolean).join(' · ')}
      dot={chosenFlat ? flatDot(chosenFlat) : undefined}
      onPress={() => { if (!ownFlats.length) { onOpenPage('properties'); return; } if (ownFlats.length === 1) { pickPlace('property:' + ownFlats[0].id); return; } setPlacesOpen(true); }} />
  ) : role === 'cleaner' ? (
    <RolePlate {...account} width={plateWidth} dot={workOn ? C.success : C.muted}
      title={workOn ? tr('На линии') : tr('Не на линии')}
      line={workOn ? todayLine || tr('Сегодня заданий нет') : tr('Задания не придут')}
      onPress={() => setSnap(1)}
      toggle={data.profile ? { on: workOn, label: tr('Принимаю предложения'), busy: switching || account.busy, onChange: v => void setWork(v) } : undefined} />
  ) : null;
  const HERE_LABEL: Record<HereAction, string> = { settings: tr('Открыть настройки'), retry: tr('Ещё раз'), pick: tr('Указать на карте') };

  return (
    <View
      ref={host}
      style={h.host}
      onLayout={e => {
        setHeight(Math.round(e.nativeEvent.layout.height));
        host.current?.measureInWindow((_x, y) => setTop(Math.round(y) || 0));
      }}
    ><LiveMap
        center={center}
        pins={role === 'owner' ? pins.filter(p => !p.round || ownerShows(p, only)) : pins}
        selected={selected}
        focus={spotted ? spotKey : focus}
        lines={lines}
        heat={heat}
        sparks={sparks}
        onSelect={setSelected}
        onAct={act => onOpenProcess(act.kind, act.id)}
        visit={spotted}
        bottomInset={spotted ? cover : Math.min(sheetHeight, Math.round(height * 0.5))}
        topInset={topInset}
        focusKey={focusKey}
        picking={picking}
        scanning={scanning}
        onCenter={c => {
          mapCenter.current = c;
        }}
        restore={restore}
        me={here.fix}
        locating={seeking}
        onLocate={() => void findMe()}
        areaLabel={role === 'guest' ? tr('К области поиска') : undefined}
        meFly={meFly}
        onLongPress={role === 'guest' ? point => { setHeld({ point, n: Date.now() }); setSnap(1); } : undefined}
        onView={view => rememberMap(scope, shownKey.current ? { view, viewKey: shownKey.current } : { view })}
      />{seeking && !here.fix && !notice && !picking && (
        <View accessibilityLiveRegion="polite" style={w.seek}><Thinking size="sm" /><Text style={w.seekText}>{tr('Ищем вас на карте…')}</Text></View>
      )}{!!hereTip && !picking && (
        <View accessibilityLiveRegion="polite" style={w.tip}><Text style={w.tipText}>{hereTip.text}</Text><View style={w.tipRow}>{hereTip.actions.map(a => (
              <Pressable key={a} accessibilityRole="button" onPress={() => hereAct(a)} style={({ pressed }) => [w.tipButton, pressed && { opacity: 0.6 }]}><Text style={w.tipButtonText}>{HERE_LABEL[a]}</Text></Pressable>
            ))}</View></View>
      )}{!!notice && (
        <Text accessibilityLiveRegion="polite" style={h.mapNotice}>{notice}</Text>
      )}{role === 'guest' && !selected && <PriceTip role={role} cards={data.approvals || []} onChanged={onChanged} onEdit={onEdit} />}{/* Without an account the round slot widens for the «Войти» word. */}{!!plate && !floating ? <View style={[h.menu, h.plate]}>{plate}</View> : !!menu && <View style={[h.menu, { width: 'auto' }]}>{menu}</View>}{role === 'owner' && !selected && !picking && pins.filter(p => p.round).length > 1 && <OwnerFilters pins={pins} only={only} onOnly={setOnly} onList={() => setSnap(2)} />}{/* The bell and the chats share one pill in the corner. */}{!!chats && <View style={[h.chats, { width: 'auto', flexDirection: 'row' }]}>{chats}</View>}{floating && <View pointerEvents="box-none" style={h.floatBar}>{floatBar}</View>}{role === 'owner' && <PlacePicker visible={placesOpen} places={pickPlaces} all={ownFlats.length + ' ' + plural(ownFlats.length, 'объект', 'объекта', 'объектов')} selected={chosenFlat ? 'property:' + chosenFlat.id : ''} onClose={() => setPlacesOpen(false)} onPick={pickPlace} />}{!picking && <MapMood mood={mood} joy={joy} still={calm || quiet} bottom={covered ? cardEdge : sheet} />}<Animated.View style={[h.sheet, snap === 2 && !floating && h.sheetSolid, floating && h.sheetFloat, { height: sheet, opacity: veil }]} accessibilityViewIsModal={false}><View {...drag.handle.panHandlers} style={floating ? h.gone : undefined}><Pressable
            accessibilityRole="button"
            accessibilityLabel={snap === 0 ? tr('Развернуть панель') : tr('Свернуть панель')}
            onPress={() => setSnap(snap === 0 ? 1 : 0)}
            style={h.handleArea}
          ><Grip color={mood === 'calm' ? undefined : MOOD_COLOR[mood]} /></Pressable></View><View style={h.grow} {...drag.body.panHandlers}><ScrollView ref={scroll} scrollEnabled={scrollable} onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={64} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[h.sheetContent, floating && h.sheetContentFloat]} showsVerticalScrollIndicator={false}><RevealProvider value={reveal}>{role === 'guest' ? (
              <GuestPanel {...common} held={held} aimed={!!aim.current} picking={picking} setPicking={setPicking} mapCenter={mapCenter} setCity={setCity} />
            ) : role === 'owner' ? (
              <OwnerPanel {...common} />
            ) : (
              <CleanerPanel {...common} />
            )}</RevealProvider></ScrollView></View>{!!footBar && !floating && <View style={w.foot}>{footBar}</View>}</Animated.View></View>
  );
}

const w = StyleSheet.create({
  foot: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.surface },
  seek: { position: 'absolute', top: 68, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16, borderRadius: T.radius.full, backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.glassLine, shadowColor: C.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  seekText: { fontSize: T.font.label[0], lineHeight: T.font.label[1], color: C.ink, fontWeight: '600' },
  tip: { position: 'absolute', top: 68, left: 16, right: 68, gap: 8, padding: 12, borderRadius: T.radius.lg, backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.glassLine, shadowColor: C.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  tipText: { fontSize: T.font.label[0], lineHeight: T.font.label[1], color: C.ink },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipButton: { minHeight: T.control.compact, paddingHorizontal: 12, borderRadius: T.radius.full, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentLine, alignItems: 'center', justifyContent: 'center' },
  tipButtonText: { fontSize: T.font.label[0], lineHeight: T.font.label[1], color: C.accent, fontWeight: '600' }
});

// ---------- The owner's filter over the map ----------
type OwnerFilter = '' | 'yours' | 'stay' | 'clean';
function ownerShows(pin: MapPin, only: OwnerFilter) {
  const tone = pin.tone || 'home';
  if (only === 'yours') return !!pin.act || tone === 'pending' || tone === 'alert';
  if (only === 'stay') return tone === 'booking' || tone === 'booked';
  if (only === 'clean') return tone === 'job' || tone === 'active';
  return true;
}
// A row of pills under the top buttons, as the filters of Google Maps: a pill shows its count, a second tap shows all.
function OwnerFilters({ pins, only, onOnly, onList }: { pins: MapPin[]; only: OwnerFilter; onOnly: (v: OwnerFilter) => void; onList: () => void }) {
  const own = pins.filter(p => p.round);
  const items: [OwnerFilter, string][] = [['yours', tr('Ждут вас')], ['stay', tr('Живут')], ['clean', tr('Уборка')]];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={f.row} contentContainerStyle={f.content} accessibilityRole="tablist">
      {items.map(([id, title]) => {
        const n = own.filter(p => ownerShows(p, id)).length, on = only === id;
        return (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={title + ': ' + n} onPress={() => onOnly(on ? '' : id)} style={({ pressed }) => [f.pill, on && f.pillOn, pressed && { opacity: 0.8 }]}>
            {id === 'yours' && n > 0 && <View style={f.dot} />}<Text style={[f.text, on && f.textOn]}>{title}{n ? ' · ' + n : ''}</Text>
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={tr('Список: {n}', { n: own.length })} onPress={onList} style={({ pressed }) => [f.pill, pressed && { opacity: 0.8 }]}><Text style={f.text}>{tr('Список')}</Text></Pressable>
    </ScrollView>
  );
}
const f = StyleSheet.create({
  row: { position: 'absolute', top: 64, left: 0, right: 0, flexGrow: 0 },
  content: { paddingHorizontal: 12, gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: T.radius.full, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, shadowColor: C.ink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  pillOn: { backgroundColor: C.ink, borderColor: C.ink },
  text: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.ink },
  textOn: { color: C.surface },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold },
});
