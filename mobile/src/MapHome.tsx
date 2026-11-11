import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {ActivityIndicator,Animated,AppState,PanResponder,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ApiError,request} from './api';
import {Photo} from './ListingMedia';
import {date,labels,money,uid,type Role,type Row} from './model';
import {C} from './styles';
import {TileMap,type MapPin} from './TileMap';
import {countdown,kzHour,mapCities,stayInterval,validPoint,type MapPoint} from './map-math';

// Map-first home screen. Every action goes through the same server rules as the web workspace:
// the AI administrator dispatches requests, people only confirm facts.
type Publish=(pins:MapPin[],focusKey:string)=>void;
type Common={accountId:string;data:Row;mapData:Row|null;publish:Publish;selected:string;setSelected:(key:string)=>void;expand:(snap:number)=>void;onChanged:()=>Promise<unknown>;onOpenProcess:(kind:'booking'|'job',id:string)=>void;onOpenPage:(id:string)=>void};
const liveRequests=new Map<string,string>();
const short=(amount:unknown)=>typeof amount==='number'&&amount>0?(amount>=10000?Math.round(amount/1000)+' тыс.':money(amount)):'Объект';
const pointOf=(item:Row):MapPoint|null=>validPoint([item.location?.longitude,item.location?.latitude]);
const message=(error:unknown)=>error instanceof Error?error.message:'Действие не подтверждено. Обновите данные.';

function usePoll(task:()=>Promise<unknown>,ms:number,enabled:boolean){
 const latest=useRef(task);latest.current=task;
 useEffect(()=>{
  if(!enabled)return;let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{if(AppState.currentState==='active'){try{await latest.current();}catch{/* The panel shows its own error state. */}}if(live)timer=setTimeout(tick,ms);};
  void tick();return()=>{live=false;if(timer)clearTimeout(timer);};
 },[enabled,ms]);
}
function useNow(active:boolean){const [now,setNow]=useState(Date.now()/1000);useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()/1000),1000);return()=>clearInterval(timer);},[active]);return now;}

function Action({title,onPress,secondary=false,disabled=false,danger=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;danger?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[h.action,secondary&&h.actionSecondary,(disabled||pressed)&&h.dim]}><Text style={[h.actionText,secondary&&h.actionSecondaryText,danger&&h.dangerText]}>{title}</Text></Pressable>;
}
function Chips<T extends string|number>({label,value,options,onChange,disabled}:{label:string;value:T;options:[T,string][];onChange:(value:T)=>void;disabled?:boolean}){
 return <View style={h.field}><Text style={h.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={h.chips} accessibilityRole="radiogroup">{options.map(([id,title])=><Pressable key={String(id)} accessibilityRole="radio" accessibilityState={{checked:id===value,disabled}} disabled={disabled} onPress={()=>onChange(id)} style={[h.chip,id===value&&h.chipOn]}><Text style={[h.chipText,id===value&&h.chipTextOn]}>{title}</Text></Pressable>)}</ScrollView></View>;
}
function Stepper({label,value,text,min,max,onChange,disabled}:{label:string;value:number;text:string;min:number;max:number;onChange:(value:number)=>void;disabled?:boolean}){
 return <View style={h.stepper}><Text style={h.label}>{label}</Text><View style={h.stepperRow}>
  <Pressable accessibilityRole="button" accessibilityLabel={label+': меньше'} disabled={disabled||value<=min} onPress={()=>onChange(value-1)} style={[h.step,(disabled||value<=min)&&h.dim]}><Text style={h.stepText}>−</Text></Pressable>
  <Text accessibilityLiveRegion="polite" style={h.stepValue}>{text}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label+': больше'} disabled={disabled||value>=max} onPress={()=>onChange(value+1)} style={[h.step,(disabled||value>=max)&&h.dim]}><Text style={h.stepText}>+</Text></Pressable>
 </View></View>;
}
function Stage({steps,current}:{steps:string[];current:number}){
 return <View style={h.stages} accessibilityLabel={'Этап '+(current+1)+' из '+steps.length+': '+steps[current]}>{steps.map((step,i)=><View key={step} style={h.stage}><View style={[h.stageBar,i<=current&&h.stageBarOn]}/><Text numberOfLines={1} style={[h.stageText,i===current&&h.stageTextOn]}>{step}</Text></View>)}</View>;
}
const dayOptions=():[number,string][]=>[0,1,2,3,4,5,6].map(offset=>[offset,offset===0?'Сегодня':offset===1?'Завтра':new Date(Date.now()+offset*86400000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',weekday:'short',day:'numeric',month:'short'})]);

function GuestPanel({accountId,data,mapData,publish,selected,setSelected,expand,onChanged,onOpenPage,picking,setPicking,mapCenter}:Common&{picking:boolean;setPicking:(value:boolean)=>void;mapCenter:React.RefObject<MapPoint|null>}){
 const late=kzHour()>=13;
 const [draft,setDraft]=useState<Row>({city:mapCities[data.profile?.city]?data.profile.city:'Павлодар',mode:'daily',day:late?1:0,hour:14,units:1,guests:2,maxPrice:'20000',priority:'balanced',near:null});
 const [preview,setPreview]=useState<Row|null>(null),[requestId,setRequestId]=useState(()=>liveRequests.get(accountId)||''),[live,setLive]=useState<Row|null>(null);
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[index,setIndex]=useState(0),[accepted,setAccepted]=useState(false),[skew,setSkew]=useState(0);
 const lock=useRef(false),requestKey=useRef('');
 const active=!!requestId&&(!live||['searching','ready','booking'].includes(live.status)),now=useNow(active)+skew;
 const set=(patch:Row)=>{setDraft(v=>({...v,...patch}));setPreview(null);setError('');};
 const filters=()=>({city:draft.city,district:'',mode:draft.mode,...stayInterval(draft.mode,draft.day,draft.hour,draft.units),guests:draft.guests,maxPrice:Number(String(draft.maxPrice).replace(/\s/g,'')),priority:draft.priority,features:[],near:draft.near});
 async function guarded(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setWorking(true);setError('');try{await task();}catch(e){setError(message(e));}finally{lock.current=false;setWorking(false);}}
 const find=()=>guarded(async()=>{
  const input=filters();
  if(!Number.isInteger(input.maxPrice)||input.maxPrice<100)throw new Error('Укажите бюджет за весь период целым числом в тенге.');
  if(Date.parse(input.start)<Date.now()+60000)throw new Error('Заезд должен быть в будущем. Выберите более позднее время.');
  if(input.priority==='closer'&&!input.near)throw new Error('Для приоритета «Ближе» сначала укажите точку на карте.');
  const result=await request('/api/public/matching?q='+encodeURIComponent(JSON.stringify(input)));
  setPreview(result);setSelected('');expand(1);
 });
 const begin=()=>guarded(async()=>{
  requestKey.current||=uid();
  const result=await request('/api/operations/matching/begin',{...filters(),requestKey:requestKey.current,consent:true},undefined,undefined,'guest');
  liveRequests.set(accountId,result.id);setSkew(result.serverTime-Date.now()/1000);setLive(result);setRequestId(result.id);setIndex(0);setAccepted(false);expand(1);
 });
 const reset=()=>{liveRequests.delete(accountId);requestKey.current='';setRequestId('');setLive(null);setPreview(null);setAccepted(false);setIndex(0);};
 const cancel=()=>guarded(async()=>{if(active)await request('/api/operations/matching/cancel',{id:requestId},undefined,undefined,'guest');reset();});
 usePoll(async()=>{
  try{const result=await request('/api/operations/matching/state',{id:requestId},undefined,undefined,'guest');setSkew(result.serverTime-Date.now()/1000);setLive(result);}
  catch(e){if(e instanceof ApiError&&e.status===404)reset();else if(e instanceof ApiError)setError(e.message);}
 },3000,active);
 const offers:Row[]=live?.properties||[],offer=offers[Math.min(index,Math.max(0,offers.length-1))];
 const book=()=>guarded(async()=>{
  if(!offer||!live)return;
  await request('/api/operations/matching/book',{id:live.id,offerId:offer.offerId,start:live.filters.start,end:live.filters.end,guests:Number(live.filters.guests),billingMode:live.filters.mode,expectedAmount:offer.estimate.amount,expectedPolicyVersion:offer.policy.version,acceptTerms:true},undefined,'match:'+live.id,'guest');
  const state=await request('/api/operations/matching/state',{id:live.id},undefined,undefined,'guest');setLive(state);await onChanged();
 });
 // Pins follow the stage: catalogue, checked candidates, then owners who are answering.
 const stageKey=requestId?'live':preview?'preview:'+preview.serverTime:'base:'+draft.city;
 useEffect(()=>{
  const pin=(p:Row,tone:MapPin['tone']):MapPin[]=>{const point=pointOf(p);return point?[{key:p.id,point,title:p.title,label:short(p.estimate?.amount??p.price),tone}]:[];};
  if(requestId&&live)publish([...(live.pendingProperties||[]).flatMap((p:Row)=>pin(p,'pending')),...offers.flatMap(p=>pin(p,'offer'))],'live:'+live.id+':'+offers.length+':'+(live.pendingProperties||[]).length);
  else if(preview)publish(preview.properties.flatMap((p:Row)=>pin(p,p.quickRequest?'booking':'home')),stageKey);
  else publish((mapData?.properties||[]).flatMap((p:Row)=>pin(p,'home')),stageKey+':'+(mapData?.properties?.length||0));
 },[requestId,live,preview,mapData,draft.city]);
 useEffect(()=>{if(offers.length&&selected){const at=offers.findIndex(p=>p.id===selected);if(at>=0&&at!==index){setIndex(at);setAccepted(false);}}},[selected]);

 if(picking)return <View style={h.block}><Text style={h.title}>Где ищем?</Text><Text style={h.note}>Передвиньте карту так, чтобы метка стояла в нужном месте. Владельцам точка не передаётся, для подбора она округляется.</Text>
  <Action title="Искать рядом с этой точкой" onPress={()=>{const c=mapCenter.current;if(c)set({near:{longitude:Math.round(c[0]*100)/100,latitude:Math.round(c[1]*100)/100,radius:5000}});setPicking(false);expand(1);}}/>
  <Action secondary title="Отмена" onPress={()=>{setPicking(false);expand(1);}}/></View>;

 if(requestId){
  const status=live?.status||'searching',booked=status==='booked',step=booked?3:status==='ready'||status==='booking'?2:1;
  const booking=booked?(data.bookings||[]).find((b:Row)=>b.id===live?.bookingId):null;
  return <View style={h.block}>
   <Stage steps={['Условия','Владельцы','Предложение','Бронь']} current={step}/>
   {!live&&<View style={h.row}><ActivityIndicator color={C.green}/><Text style={h.note}>Восстанавливаем ваш подбор…</Text></View>}
   {live&&status==='searching'&&<>
    <Text accessibilityRole="header" style={h.title}>Администратор опрашивает владельцев</Text>
    <View style={h.row}><ActivityIndicator color={C.green}/><Text style={h.note}>Ждём ответа: {live.pending} из {live.sent} запросов. На ответ у владельца 2 минуты.</Text></View>
    <Text style={h.timer} accessibilityLabel={'До конца подбора '+countdown(live.expiresAt-now)}>{countdown(live.expiresAt-now)}</Text>
    <Text style={h.note}>Объекты, которые сейчас отвечают, подсвечены на карте. Броней и блокировок на этом этапе нет.</Text>
   </>}
   {live&&(status==='ready'||status==='booking')&&offer&&<>
    <Text accessibilityRole="header" style={h.title}>Владелец подтвердил готовность</Text>
    {offers.length>1&&<View style={h.row}><Action secondary title="← Назад" disabled={index===0} onPress={()=>{setIndex(index-1);setAccepted(false);setSelected(offers[index-1].id);}}/><Text style={h.note}>{index+1} из {offers.length}</Text><Action secondary title="Ещё →" disabled={index>=offers.length-1} onPress={()=>{setIndex(index+1);setAccepted(false);setSelected(offers[index+1].id);}}/></View>}
    <View style={h.card}>
     {!!offer.photos?.[0]&&<Photo id={offer.photos[0]} alt={offer.title+', фото'}/>}
     <Text style={h.cardTitle}>{offer.title}</Text><Text style={h.note}>{[offer.city,offer.district].filter(Boolean).join(' · ')}</Text>
     <Text style={h.price}>{money(offer.estimate.amount)}</Text>
     <Text style={h.note}>{date(Date.parse(live.filters.start)/1000)} → {date(Date.parse(live.filters.end)/1000)} · гостей: {live.filters.guests}{'\n'}Депозит отдельно: {offer.policy?.deposit?money(offer.policy.deposit):'не требуется'}</Text>
     {(offer.match?.reasons||[]).map((reason:string)=><Text key={reason} style={h.reason}>✓ {reason}</Text>)}
     {!!offer.policy?.house_rules&&<Text style={h.note}>Правила: {offer.policy.house_rules}</Text>}
     <Text style={h.timerSmall}>Предложение действует ещё {countdown(offer.offerExpiresAt-now)}</Text>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} onPress={()=>setAccepted(v=>!v)} style={h.check}><Text style={h.checkBox}>{accepted?'☑':'☐'}</Text><Text style={h.checkText}>Принимаю стоимость, депозит и правила этой квартиры</Text></Pressable>
     <Action title={status==='booking'?'Оформляем…':'Забронировать'} disabled={working||!accepted||status==='booking'} onPress={book}/>
    </View>
    <Text style={h.note}>Оплата в приложении не списывается. {offer.policy?.auto_confirm?'Бронь подтвердится по правилам владельца.':'Владелец подтвердит заявку отдельно.'}</Text>
   </>}
   {live&&booked&&<>
    <Text accessibilityRole="header" style={h.title}>Заявка на бронь создана</Text>
    <Text style={h.note}>{booking?'Статус: '+(labels[booking.status]||booking.status)+'. ':''}Адрес и инструкции заезда появятся после подтверждения. Оплату отмечает владелец.</Text>
    <Action title="Открыть мои брони" onPress={()=>onOpenPage('bookings')}/><Action secondary title="Новый подбор" onPress={reset}/>
   </>}
   {live&&['empty','expired','cancelled'].includes(status)&&<>
    <Text accessibilityRole="header" style={h.title}>{status==='empty'?'Сейчас никто не подтвердил':status==='expired'?'Время подбора вышло':'Подбор отменён'}</Text>
    <Text style={h.note}>{status==='empty'?'Подходящие владельцы не ответили или отказали. Попробуйте изменить время, бюджет или район.':'Условия сохранены. Можно запустить подбор заново.'}</Text>
    <Action title="Изменить условия" onPress={reset}/><Action secondary title="Открыть каталог" onPress={()=>onOpenPage('catalog')}/>
   </>}
   {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
   {active&&<Action secondary danger title="Отменить подбор" disabled={working||status==='booking'} onPress={cancel}/>}
  </View>;
 }

 const quick=preview?preview.properties.filter((p:Row)=>p.quickRequest).length:0,chosen=preview?.properties.find((p:Row)=>p.id===selected);
 return <View style={h.block}>
  <Stage steps={['Условия','Владельцы','Предложение','Бронь']} current={0}/>
  <Text accessibilityRole="header" style={h.title}>Куда и когда?</Text>
  <Chips label="Город" value={draft.city} options={Object.keys(mapCities).map(c=>[c,c])} onChange={city=>set({city,near:null})} disabled={working}/>
  <Chips label="Тариф" value={draft.mode} options={[['daily','На сутки'],['hourly','На часы']]} onChange={mode=>set({mode,units:mode==='hourly'?3:1,hour:mode==='hourly'?Math.min(23,kzHour()+2):14})} disabled={working}/>
  <Chips label="Заезд" value={draft.day} options={dayOptions()} onChange={day=>set({day})} disabled={working}/>
  <View style={h.pair}>
   <Stepper label="Время заезда" value={draft.hour} text={String(draft.hour).padStart(2,'0')+':00'} min={0} max={23} onChange={hour=>set({hour})} disabled={working}/>
   <Stepper label={draft.mode==='hourly'?'Часов':'Суток'} value={draft.units} text={String(draft.units)} min={1} max={draft.mode==='hourly'?23:30} onChange={units=>set({units})} disabled={working}/>
  </View>
  <View style={h.pair}>
   <Stepper label="Гости" value={draft.guests} text={String(draft.guests)} min={1} max={12} onChange={guests=>set({guests})} disabled={working}/>
   <View style={h.stepper}><Text style={h.label}>Бюджет за период, ₸</Text><TextInput accessibilityLabel="Бюджет за весь период в тенге" style={h.input} keyboardType="number-pad" maxLength={9} value={String(draft.maxPrice)} onChangeText={maxPrice=>set({maxPrice:maxPrice.replace(/[^\d]/g,'')})} editable={!working}/></View>
  </View>
  <Chips label="Что важнее" value={draft.priority} options={[['balanced','Баланс'],['cheaper','Дешевле'],['closer','Ближе']]} onChange={priority=>set({priority})} disabled={working}/>
  <View style={h.row}><Text style={[h.note,{flex:1}]}>{draft.near?'Ищем в радиусе 5 км от выбранной точки.':'Поиск по всему городу.'}</Text><Action secondary title={draft.near?'Сбросить точку':'Точка на карте'} disabled={working} onPress={()=>{if(draft.near)set({near:null,priority:draft.priority==='closer'?'balanced':draft.priority});else{setPicking(true);expand(0);}}}/></View>
  <Text style={h.note}>Время Казахстана (UTC+5). {draft.mode==='daily'?'Выезд до 12:00. ':''}Депозит оплачивается отдельно.</Text>
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
  {!preview&&<Action title={working?'Проверяем…':'Показать варианты'} disabled={working} onPress={find}/>}
  {preview&&<>
   <View style={h.card}><Text style={h.cardTitle}>{preview.total?'Свободно по условиям: '+preview.total:'На эти условия вариантов нет'}</Text>
    <Text style={h.note}>{preview.total?(quick?'Быстро ответить готовы владельцы '+quick+' объектов. Администратор спросит до трёх одновременно.':'Владельцы этих объектов не включили быстрые запросы. Выберите квартиру в каталоге.'):'Попробуйте другой бюджет, время или город.'}</Text>
    {chosen&&<View style={h.picked}>{!!chosen.photos?.[0]&&<Photo id={chosen.photos[0]} alt={chosen.title+', фото'}/>}<Text style={h.eventTitle}>{chosen.title}</Text><Text style={h.note}>{money(chosen.estimate.amount)} за период · {(chosen.match?.reasons||[]).join(' · ')}</Text></View>}
    {!chosen&&preview.properties.slice(0,3).map((p:Row)=><Pressable key={p.id} accessibilityRole="button" onPress={()=>setSelected(p.id)} style={h.listRow}><View style={{flex:1}}><Text style={h.eventTitle}>{p.title}</Text><Text style={h.note}>{(p.match?.reasons||[]).slice(0,2).join(' · ')}</Text></View><Text style={h.rowPrice}>{money(p.estimate.amount)}</Text></Pressable>)}
   </View>
   {quick>0&&<><Text style={h.note}>Владельцы получат даты, число гостей и сумму по своему тарифу. Имя, телефон и точка поиска не передаются.</Text><Action title={working?'Отправляем…':'Отправить запрос владельцам'} disabled={working} onPress={begin}/></>}
   {quick===0&&<Action secondary title="Открыть каталог" onPress={()=>onOpenPage('catalog')}/>}
  </>}
 </View>;
}

function OwnerPanel({data,mapData,publish,expand,onChanged,onOpenProcess,onOpenPage}:Common){
 const [inbox,setInbox]=useState<Row|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[ready,setReady]=useState<Record<string,boolean>>({}),[skew,setSkew]=useState(0);
 const lock=useRef(false),seen=useRef(0),now=useNow(!!inbox?.offers?.length)+skew;
 const apply=(result:Row)=>{setSkew(result.serverTime-Date.now()/1000);setInbox(result);if(result.offers.length>seen.current)expand(1);seen.current=result.offers.length;};
 usePoll(async()=>{try{apply(await request('/api/operations/matching/inbox',{},undefined,undefined,'owner'));setError('');}catch(e){if(e instanceof ApiError)setError(e.message);}},3000,true);
 async function act(action:string,body:Row){if(lock.current)return;lock.current=true;setWorking(true);setError('');try{apply(await request('/api/operations/matching/'+action,body,undefined,undefined,'owner'));if(action==='respond')await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking(false);}}
 const offers:Row[]=(inbox?.offers||[]).filter((o:Row)=>o.expires_at>now),processes:Row[]=mapData?.processes||[];
 useEffect(()=>{
  const asked=new Set(offers.map(o=>o.property_id));
  publish([...(mapData?.properties||[]).flatMap((p:Row):MapPin[]=>{const point=pointOf(p);return point?[{key:'property:'+p.id,point,title:p.title,label:asked.has(p.id)?'Запрос':short(p.price),tone:asked.has(p.id)?'pending':'home'}]:[];})],'owner:'+(mapData?.properties?.length||0));
 },[mapData,inbox]);
 const requested=(data.bookings||[]).filter((b:Row)=>b.status==='requested'&&b.owner_id===data.user?.id);
 return <View style={h.block}>
  <Text accessibilityRole="header" style={h.title}>{offers.length?'Быстрые запросы гостей':'Ваши объекты на линии'}</Text>
  {!inbox&&!error&&<View style={h.row}><ActivityIndicator color={C.green}/><Text style={h.note}>Загружаем запросы…</Text></View>}
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
  {offers.map(o=><View key={o.id} style={[h.card,h.urgent]}>
   <View style={h.row}><Text style={[h.cardTitle,{flex:1}]}>{o.title}</Text><Text style={h.timerSmall} accessibilityLabel={'На ответ осталось '+countdown(o.expires_at-now)}>{countdown(o.expires_at-now)}</Text></View>
   <Text style={h.note}>{date(Date.parse(o.filters.start)/1000)} → {date(Date.parse(o.filters.end)/1000)}{'\n'}{o.filters.mode==='hourly'?'На часы':'На сутки'} · гостей: {o.filters.guests}</Text>
   <Text style={h.price}>{money(o.amount)}</Text>
   <Pressable accessibilityRole="checkbox" accessibilityState={{checked:!!ready[o.id]}} onPress={()=>setReady(v=>({...v,[o.id]:!v[o.id]}))} style={h.check}><Text style={h.checkBox}>{ready[o.id]?'☑':'☐'}</Text><Text style={h.checkText}>Квартира будет свободна и готова к этому заезду</Text></Pressable>
   <View style={h.pair}><View style={{flex:1}}><Action title="Готов принять" disabled={working||!ready[o.id]} onPress={()=>act('respond',{offerId:o.id,decision:'accept',ready:true})}/></View><View style={{flex:1}}><Action secondary title="Отказать" disabled={working} onPress={()=>act('respond',{offerId:o.id,decision:'decline'})}/></View></View>
   <Text style={h.note}>Ответ не создаёт бронь и не меняет цену. Если гость выберет вашу квартиру, заявка придёт в «Заявки гостей».</Text>
  </View>)}
  {inbox&&!offers.length&&<Text style={h.note}>Новых запросов нет. Когда гость рядом начнёт подбор, запрос появится здесь и придёт уведомление. На ответ отводится 2 минуты.</Text>}
  {requested.length>0&&<Pressable accessibilityRole="button" onPress={()=>onOpenPage('bookings')} style={[h.card,h.listRow]}><View style={{flex:1}}><Text style={h.eventTitle}>Заявки ждут решения: {requested.length}</Text><Text style={h.note}>Подтвердите или отклоните бронирование</Text></View><Text style={h.rowPrice}>→</Text></Pressable>}
  {processes.length>0&&<View style={h.card}><Text style={h.label}>Сейчас в работе</Text>{processes.slice(0,6).map(p=><Pressable key={p.kind+p.id} accessibilityRole="button" onPress={()=>onOpenProcess(p.kind,p.id)} style={h.listRow}><View style={{flex:1}}><Text style={h.eventTitle}>{p.kind==='job'?'Уборка':'Заезд'} · {p.title}</Text><Text style={h.note}>{labels[p.status]||p.status} · {date(p.start)}</Text></View><Text style={h.rowPrice}>→</Text></Pressable>)}</View>}
  {inbox&&<View style={h.card}><Text style={h.label}>Принимать быстрые запросы</Text><Text style={h.note}>Включите для объектов, по которым готовы отвечать за 2 минуты.</Text>
   {inbox.preferences.map((p:Row)=><View key={p.id} style={h.listRow}><Text style={[h.eventTitle,{flex:1}]}>{p.title}</Text><Switch accessibilityLabel={'Быстрые запросы: '+p.title} value={!!p.enabled} disabled={working} onValueChange={enabled=>act('preference',{propertyId:p.id,enabled})} trackColor={{true:C.green,false:C.line}}/></View>)}
   {!inbox.preferences.length&&<><Text style={h.note}>Сначала добавьте квартиру и пройдите проверку.</Text><Action secondary title="Мои квартиры" onPress={()=>onOpenPage('properties')}/></>}
  </View>}
 </View>;
}

function CleanerPanel({data,mapData,publish,onChanged,onOpenProcess,onOpenPage}:Common){
 const [error,setError]=useState(''),[working,setWorking]=useState(''),lock=useRef(false);
 const userId=data.user?.id,jobs:Row[]=data.jobs||[],applications:Row[]=data.applications||[];
 const mine=jobs.filter(j=>j.assigned_to===userId&&['assigned','in_progress','submitted'].includes(j.status)).sort((a,b)=>a.start-b.start);
 const applied=(id:string)=>applications.some(a=>a.job_id===id&&a.user_id===userId&&a.status!=='rejected');
 const open=jobs.filter(j=>j.status==='open'&&j.end>Date.now()/1000&&j.owner_id!==userId).sort((a,b)=>a.start-b.start);
 useEffect(()=>{
  publish((mapData?.processes||[]).filter((p:Row)=>p.kind==='job').flatMap((p:Row):MapPin[]=>{const point=pointOf(p);return point?[{key:'job:'+p.id,point,title:p.title,label:p.status==='open'?'Уборка':'Моё задание',tone:p.status==='open'?'job':'offer'}]:[];}),'cleaner:'+(mapData?.processes?.length||0));
 },[mapData]);
 async function apply(id:string){if(lock.current)return;lock.current=true;setWorking(id);setError('');try{await request('/api/jobs/'+id,{action:'apply'},undefined,'map-apply:'+id,'cleaner');await onChanged();}catch(e){setError(message(e));}finally{lock.current=false;setWorking('');}}
 return <View style={h.block}>
  <Text accessibilityRole="header" style={h.title}>{mine.length?'Ваше задание':'Уборки рядом'}</Text>
  {mine.map(j=><View key={j.id} style={[h.card,h.urgent]}>
   <Stage steps={['Назначено','Выезд гостя','Уборка','Приёмка']} current={j.status==='submitted'?3:j.status==='in_progress'?2:j.checkout_confirmed?1:0}/>
   <Text style={h.cardTitle}>{j.title}</Text><Text style={h.note}>{date(j.start)} → {date(j.end)}{j.address?'\n'+j.address:''}</Text><Text style={h.price}>{money(j.fee)}</Text>
   <Text style={h.note}>{j.status==='submitted'?'Отчёт у владельца на приёмке.':j.status==='in_progress'?'Уборка идёт. Подготовьте отчёт с фото.':j.checkout_confirmed?'Гость выехал, можно начинать.':'Ждём подтверждения выезда гостя.'}</Text>
   <Action title="Открыть задание" onPress={()=>onOpenProcess('job',j.id)}/>
  </View>)}
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
  {mine.length>0&&open.length>0&&<Text style={h.label}>Новые предложения</Text>}
  {open.slice(0,8).map(j=><View key={j.id} style={h.card}>
   <View style={h.row}><Text style={[h.cardTitle,{flex:1}]}>{j.title}</Text><Text style={h.rowPrice}>{money(j.fee)}</Text></View>
   <Text style={h.note}>{[j.city,j.district].filter(Boolean).join(' · ')}{'\n'}{date(j.start)} → {date(j.end)}</Text>
   <View style={h.pair}><View style={{flex:1}}><Action title={applied(j.id)?'Отклик отправлен':working===j.id?'Отправляем…':'Откликнуться'} disabled={!!working||applied(j.id)} onPress={()=>apply(j.id)}/></View><View style={{flex:1}}><Action secondary title="Подробнее" onPress={()=>onOpenProcess('job',j.id)}/></View></View>
  </View>)}
  {!mine.length&&!open.length&&<><Text style={h.note}>Открытых уборок сейчас нет. Новые задания появятся здесь после подтверждения броней. Точный адрес виден только назначенному исполнителю.</Text><Action secondary title="Мои задания" onPress={()=>onOpenPage('assignments')}/></>}
 </View>;
}

export function MapHome({role,accountId,data,menu,onChanged,onOpenProcess,onOpenPage,onAdministrator,onAssistantTask}:{role:Role;accountId:string;data:Row;menu?:ReactNode;onChanged:()=>Promise<unknown>;onOpenProcess:(kind:'booking'|'job',id:string)=>void;onOpenPage:(id:string)=>void;onAdministrator:()=>void;onAssistantTask:(task:Row)=>void}){
 const insets=useSafeAreaInsets();
 const [height,setHeight]=useState(0),[snap,setSnap]=useState(1),[pins,setPins]=useState<MapPin[]>([]),[focusKey,setFocusKey]=useState(''),[selected,setSelected]=useState(''),[mapData,setMapData]=useState<Row|null>(null),[picking,setPicking]=useState(false);
 const sheet=useRef(new Animated.Value(0)).current,mapCenter=useRef<MapPoint|null>(null),snapRef=useRef(snap);snapRef.current=snap;
 const sheetHeight=height?Math.max(132,Math.round(height*[.2,.5,.88][snap])):0;
 useEffect(()=>{if(!sheetHeight)return;Animated.timing(sheet,{toValue:sheetHeight,duration:200,useNativeDriver:false}).start();},[sheetHeight,sheet]);
 const drag=useRef(PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dy)>8,
  onPanResponderRelease:(_e,g)=>{if(g.dy<-24)setSnap(Math.min(2,snapRef.current+1));else if(g.dy>24)setSnap(Math.max(0,snapRef.current-1));}
 })).current;
 const city=data.profile?.city||'Павлодар';
 usePoll(async()=>{setMapData(await request('/api/operations/map/search',{filters:{city}},undefined,undefined,role));},30000,true);
 const publish:Publish=(next,key)=>{setPins(next);setFocusKey(key);};
 const approvals=(data.approvals||[]).filter((c:Row)=>c.canDecide).length,task=data.assistantBrief?.tasks?.[0];
 const common:Common={accountId,data,mapData,publish,selected,setSelected:key=>{setSelected(key);if(key&&snapRef.current===0)setSnap(1);},expand:setSnap,onChanged,onOpenProcess,onOpenPage};
 const center=validPoint(mapData?.center)||mapCities[city]||mapCities['Павлодар'];
 return <View style={h.host} onLayout={e=>setHeight(Math.round(e.nativeEvent.layout.height))}>
  <TileMap center={center} pins={pins} selected={selected} onSelect={common.setSelected} bottomInset={Math.min(sheetHeight,Math.round(height*.5))} topInset={insets.top+64} focusKey={focusKey} picking={picking} onCenter={c=>{mapCenter.current=c;}}/>
  <View style={[h.top,{top:insets.top+10}]} pointerEvents="box-none">
   <Pressable accessibilityRole="button" accessibilityLabel={'AI администратор'+(approvals?', согласований: '+approvals:'')} onPress={onAdministrator} style={h.orb}><Text style={h.orbText}>AI</Text>{approvals>0&&<View style={h.orbBadge}><Text style={h.orbBadgeText}>{approvals}</Text></View>}</Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={task?'AI администратор советует: '+task.title:'Написать AI администратору'} onPress={()=>task?onAssistantTask(task):onAdministrator()} style={h.hint}><Text style={h.hintLabel}>AI администратор</Text><Text numberOfLines={1} style={h.hintText}>{task?task.title:role==='guest'?'Подберу жильё и договорюсь с владельцем':role==='owner'?'Слежу за запросами, заездами и уборками':'Сообщу о новых уборках и приёмке'}</Text></Pressable>
   {!!menu&&<View style={h.menu}>{menu}</View>}
  </View>
  <Animated.View style={[h.sheet,{height:sheet}]} accessibilityViewIsModal={false}>
   <View {...drag.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={snap===2?'Свернуть панель':'Развернуть панель'} onPress={()=>setSnap(snap===2?0:snap+1)} style={h.handleArea}><View style={h.handle}/></Pressable></View>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={h.sheetContent} showsVerticalScrollIndicator={false}>
    {role==='guest'?<GuestPanel {...common} picking={picking} setPicking={setPicking} mapCenter={mapCenter}/>:role==='owner'?<OwnerPanel {...common}/>:<CleanerPanel {...common}/>}
   </ScrollView>
  </Animated.View>
 </View>;
}

const h=StyleSheet.create({
 host:{flex:1,backgroundColor:C.bg},
 top:{position:'absolute',left:12,right:12,flexDirection:'row',alignItems:'center',gap:8},
 menu:{width:48,height:48,borderRadius:24,backgroundColor:'rgba(255,255,255,0.96)',borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},
 orb:{width:48,height:48,borderRadius:24,backgroundColor:C.green,alignItems:'center',justifyContent:'center',shadowColor:'#17231F',shadowOffset:{width:0,height:3},shadowOpacity:.2,shadowRadius:6,elevation:4},orbText:{color:C.white,fontWeight:'700',fontSize:15,letterSpacing:.5},
 orbBadge:{position:'absolute',top:-3,right:-3,minWidth:20,height:20,borderRadius:10,backgroundColor:'#B4532A',alignItems:'center',justifyContent:'center',paddingHorizontal:5},orbBadgeText:{color:C.white,fontSize:11,fontWeight:'700'},
 hint:{flex:1,minHeight:48,borderRadius:24,backgroundColor:'rgba(255,255,255,0.96)',borderWidth:1,borderColor:C.line,paddingHorizontal:16,justifyContent:'center',shadowColor:'#17231F',shadowOffset:{width:0,height:3},shadowOpacity:.12,shadowRadius:6,elevation:3},hintLabel:{fontSize:10,color:C.muted,letterSpacing:.6},hintText:{fontSize:14,color:C.ink,fontWeight:'500'},
 sheet:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#FAF9F6',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:C.line,shadowColor:'#17231F',shadowOffset:{width:0,height:-4},shadowOpacity:.12,shadowRadius:12,elevation:12},
 handleArea:{height:28,alignItems:'center',justifyContent:'center'},handle:{width:44,height:5,borderRadius:3,backgroundColor:'#C9CFC5'},sheetContent:{paddingHorizontal:16,paddingBottom:28},
 block:{gap:12},title:{fontSize:21,lineHeight:27,color:C.ink,fontWeight:'600',letterSpacing:-.4},note:{fontSize:13,lineHeight:19,color:C.muted},label:{fontSize:12,color:C.muted,marginBottom:6},
 field:{gap:0},chips:{gap:8,paddingRight:8},chip:{minHeight:44,paddingHorizontal:15,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.white,justifyContent:'center'},chipOn:{backgroundColor:C.ink,borderColor:C.ink},chipText:{fontSize:14,color:C.ink},chipTextOn:{color:C.white,fontWeight:'600'},
 pair:{flexDirection:'row',gap:10},stepper:{flex:1},stepperRow:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:14,backgroundColor:C.white,height:48},step:{width:46,height:46,alignItems:'center',justifyContent:'center'},stepText:{fontSize:22,color:C.ink},stepValue:{flex:1,textAlign:'center',fontSize:16,color:C.ink,fontWeight:'600'},
 input:{height:48,borderWidth:1,borderColor:C.line,borderRadius:14,backgroundColor:C.white,paddingHorizontal:14,fontSize:16,color:C.ink},
 action:{minHeight:50,borderRadius:16,backgroundColor:C.green,alignItems:'center',justifyContent:'center',paddingHorizontal:16},actionSecondary:{backgroundColor:C.white,borderWidth:1,borderColor:C.line},actionText:{color:C.white,fontSize:16,fontWeight:'600'},actionSecondaryText:{color:C.ink,fontSize:14,fontWeight:'500'},dangerText:{color:'#9B3B22'},dim:{opacity:.5},
 row:{flexDirection:'row',alignItems:'center',gap:10},card:{borderWidth:1,borderColor:C.line,borderRadius:18,backgroundColor:C.white,padding:14,gap:8},urgent:{borderColor:'#E8C98F',backgroundColor:'#FFFBF2'},cardTitle:{fontSize:17,lineHeight:23,color:C.ink,fontWeight:'600'},price:{fontSize:22,color:C.ink,fontWeight:'700',letterSpacing:-.4},
 reason:{fontSize:13,color:'#3D6A4F'},timer:{fontSize:34,color:C.ink,fontWeight:'300',letterSpacing:-1},timerSmall:{fontSize:14,color:'#7A4B10',fontWeight:'600'},
 check:{flexDirection:'row',alignItems:'center',gap:10,minHeight:44},checkBox:{fontSize:22,color:C.green},checkText:{flex:1,fontSize:14,lineHeight:20,color:C.ink},
 listRow:{flexDirection:'row',alignItems:'center',gap:10,minHeight:48},eventTitle:{fontSize:15,color:C.ink,fontWeight:'500'},rowPrice:{fontSize:15,color:C.ink,fontWeight:'600'},picked:{gap:6},
 error:{fontSize:13,lineHeight:19,color:'#9B3B22',backgroundColor:'#FBEDE7',borderRadius:12,padding:10},
 stages:{flexDirection:'row',gap:6},stage:{flex:1,gap:4},stageBar:{height:4,borderRadius:2,backgroundColor:C.line},stageBarOn:{backgroundColor:C.green},stageText:{fontSize:10,color:C.muted},stageTextOn:{color:C.ink,fontWeight:'600'}
});
