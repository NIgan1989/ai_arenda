import {L,t} from '../../lib/i18n';
import React,{useRef,useState} from 'react';
import {Image,Pressable,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {C,type,brandFont} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {PhotoGrid} from './PhotoGrid';
import {Stepper} from './SheetParts';
import {FlatCalendars} from './FlatCalendars';
import {RegularCleaner} from './RegularCleaner';
import {PropertyStaff} from './PropertyStaff';
import {VenueHalls} from './VenueHalls';
import {RoomCount} from './RoomCount';
import {menuIcons} from './AccountRows';
import {EDIT_STEPS,banquetPrice,withBanquetPrice,editBody,editRequest,nextAdvice,needsReview,reviewRequest,REVIEW_SENT,stepForError,stepLine,stepNeeds,stepTitle,type Advice,type EditBody,type EditStep} from '../../lib/listing-edit';
import {amenities,categoryAmenities,checkinMethods,isBath,isBanquet,isVenue,kindCategory,roomKinds} from '../../lib/listings';
import {KindPicker} from './KindPicker';
import {PREPAY_CHOICES,prepayNote,prepayState} from '../../lib/prepay';
import {REPEAT_CHOICES} from '../../lib/rental-policy';
import {AddressPin,type PinChoice} from './AddressPin';
import {AddressField} from './AddressSuggest';
type Row=Record<string,any>;
const R=T.radius,H=T.control;
const ICONS:Record<EditStep,string>={photos:'📷',flat:'🏠',place:'📍',text:'📝',amenities:'📶',prices:'₸',checkin:'🕑',rules:'📜'};
const SAVED:Record<EditStep|'publish',string>=L({photos:'Фото сохранены.',flat:'Сохранено.',place:'Адрес сохранён.',text:'Описание сохранено.',amenities:'Удобства сохранены.',prices:'Цены сохранены.',checkin:'Заезд сохранён.',rules:'Правила сохранены.',publish:'Готово.'});

// Editing a flat in the app: an overview of short steps, each opened on its own small screen and saved at once.
// After each save the AI administrator offers the next step. Same rules as the site (lib/listing-edit.ts).
export function PropertyEdit({property,onSave,onReview,onRemove,onClose,onOpenHall,step,call}:{property:Row;onSave:(body:Row)=>Promise<Row|undefined>;onReview?:(body:Row)=>Promise<unknown>;onRemove?:()=>Promise<unknown>;onClose:()=>void;onOpenHall?:(id:string)=>void|Promise<void>;step?:EditStep|'calendars'|'cleaner'|'staff'|'halls'|null;call?:(path:string,body:Row)=>Promise<Row>}){
 const [p,setP]=useState(property),[base,setBase]=useState<EditBody>(()=>editBody(property)),[draft,setDraft]=useState<EditBody>(base);
 const [open,setOpen]=useState<EditStep|null>(step&&EDIT_STEPS.some(x=>x.key===step)?step as EditStep:null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[skipped,setSkipped]=useState<string[]>([]),[held,setHeld]=useState(false),[sent,setSent]=useState(false);
 const pick=useRef<PinChoice|null>(null),errorRu=useRef('');
 const [access,setAccess]=useState(''),[accessState,setAccessState]=useState(''),[place,setPlace]=useState('');
 async function saveAccess(){if(!call||!p.id||!access.trim())return;setAccessState('…');try{await call('access/save',{propertyId:p.id,instructions:access.trim(),expectedVersion:p.access_version||0});setP((o:Row)=>({...o,access_version:(o.access_version||0)+1}));setAccess('');setAccessState(t('Инструкция сохранена. Гость увидит её перед заездом, исполнитель — когда начнёт уборку.'));}catch(r:any){setAccessState(r?.message||t('Не удалось сохранить инструкцию.'));}}
 const [confirm,setConfirm]=useState(false),[removeError,setRemoveError]=useState(''),[calendars,setCalendars]=useState(step==='calendars'),[cleaner,setCleaner]=useState(step==='cleaner'),[staff,setStaff]=useState(step==='staff'),[halls,setHalls]=useState(step==='halls');
 // A save that failed keeps its changes: the owner fixes what the server asked for in another step and everything is saved together.
 // The server's own Russian words decide the step; the person reads them in their language (ApiError.ru).
 const fix=held&&error?stepForError(errorRu.current||error):null;
 // Without a pin that matches the address the review cannot pass, so the AI says it first and leads straight to «Адрес».
 const unmapped=!!p.id&&p.mapped===false&&!!base.address.trim();
 const advice:Advice=held&&error?{step:fix,text:t(fix?'Не сохранилось: {error} Заполните это, и сохранится всё вместе.':'Не сохранилось: {error}',{error}),action:fix?t('Заполнить'):undefined}
  :unmapped&&!skipped.includes('pin')?{step:'place',text:t('Метки жилья на карте нет: без неё проверка не пройдёт. Откройте «Адрес» и проверьте, что метка стоит на доме.'),action:t('Поставить метку')}
  :sent&&!base.published?{step:null,text:t(REVIEW_SENT)}:nextAdvice(base,skipped);
 function go(step:EditStep){pick.current=null;if(!held)setDraft(base);setError(held?error:'');setDone('');setOpen(step);}
 // Removing asks once more right here; the server deletes a flat without history and archives one with bookings.
 async function remove(){if(!onRemove||busy)return;setBusy(true);setRemoveError('');try{await onRemove();}catch(x:any){setRemoveError(x?.message||t('Не удалось удалить жильё.'));}finally{setBusy(false);}}
 // After the address is saved the service has already moved the pin by the new address when it found the house.
 // The owner's own choice on the map (or a house found while he typed) is saved on top; true when a pin now matches the address.
 async function savePin(saved:Row):Promise<boolean|null>{
  if(!call||!p.id)return null;
  try{const now=await call('map/spot',{propertyId:p.id}),choice=pick.current;
   if(choice?.point&&(choice.moved||!now.saved)){await call('map/location',{propertyId:p.id,longitude:choice.point[0],latitude:choice.point[1],version:now.version||0,confirmed:true});return true;}
   return !!now.saved||!!saved.mapped;}
  catch{return null;}
 }
 async function commit(next:EditBody,what:EditStep|'publish'){
  if(busy||uploading)return;setBusy(true);setError('');
  try{const fresh=await onSave(editRequest(next,p));let saved=fresh||{...p,listing_version:(p.listing_version||0)+1};const b=fresh?editBody(fresh):next;
   const pinned=what==='place'?await savePin(saved):null;if(pinned!==null)saved={...saved,mapped:pinned||saved.mapped};
   setP(saved);setBase(b);setDraft(b);setOpen(null);setHeld(false);setError('');
   setDone(what==='place'?(saved.address_check?t('Адрес сохранён и отправлен на проверку. Действующие брони в силе, новые гости увидят жильё после проверки.'):saved.mapped?t('Адрес и метка на карте сохранены.'):t('Адрес сохранён, а дом на карте не нашёлся: откройте «Адрес» и передвиньте карту к дому.')):SAVED[what]);}
  catch(e:any){const message=e?.message||t('Не удалось сохранить.');errorRu.current=String(e?.ru||message);
   // Publishing waits for the administrator: the flat is sent for review instead of failing, and is shown once approved.
   if(what==='publish'&&next.published&&onReview&&needsReview(errorRu.current)){try{const kept={...next,published:false};if(held){const fresh=await onSave(editRequest(kept,p));setP(fresh||p);const b=fresh?editBody(fresh):kept;setBase(b);setDraft(b);}await onReview(reviewRequest({id:p.id,title:next.title,city:next.city,address:next.address}));if(call&&p.id){try{const now=await call('map/spot',{propertyId:p.id});setP((o:Row)=>({...o,mapped:!!now.saved}));}catch{}}setSent(true);setHeld(false);setDone('');setError('');setOpen(null);return;}catch(r:any){setError(r?.message||message);setHeld(true);setOpen(null);return;}}
   setError(message);setHeld(true);setOpen(null);}finally{setBusy(false);}
 }
 const d=draft.details,r=draft.rental;
 const set=(v:Partial<EditBody>)=>setDraft(o=>({...o,...v}));
 const setD=(v:Partial<EditBody['details']>)=>setDraft(o=>({...o,details:{...o.details,...v}}));
 const setR=(v:Partial<EditBody['rental']>)=>setDraft(o=>({...o,rental:{...o.rental,...v}}));
 const chip=(key:string,label:string,on:boolean,press:()=>void,radio=false)=><Pressable key={key} accessibilityRole={radio?'radio':'checkbox'} accessibilityState={{checked:on}} onPress={press} style={[e.chip,on&&e.chipOn]}><Text style={[e.chipText,on&&e.chipTextOn]}>{on&&!radio?'✓ ':''}{label}</Text></Pressable>;
 const num=(label:string,value:number,on:(n:number)=>void,max=10000000,hint='')=><View style={e.tile} key={label}><Text style={e.label}>{label}</Text><TextInput accessibilityLabel={label} style={e.value} keyboardType="number-pad" value={value?String(value):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={v=>on(Math.min(max,Number(v.replace(/[^\d]/g,''))||0))}/>{!!hint&&<Text style={e.hint}>{hint}</Text>}</View>;
 const text=(label:string,value:string,on:(v:string)=>void,max=120,placeholder='',multiline=false)=><View style={e.field} key={label}><Text style={e.label}>{label}</Text><TextInput accessibilityLabel={label} style={[e.input,multiline&&e.area]} value={value} maxLength={max} placeholder={placeholder} placeholderTextColor={C.muted} multiline={multiline} textAlignVertical={multiline?'top':'center'} onChangeText={on}/></View>;
 const half=(node:React.ReactNode)=><View style={{flex:1}}>{node}</View>;

 if(calendars&&p.id)return <FlatCalendars propertyId={p.id} onBack={()=>setCalendars(false)}/>;
 if(cleaner&&p.id)return <RegularCleaner propertyId={p.id} onBack={()=>setCleaner(false)}/>;
 if(halls&&p.id&&call)return <VenueHalls property={p} call={call} onBack={()=>setHalls(false)} onOpen={onOpenHall} onChanged={venue=>setP((o:Row)=>({...o,venue:venue?{id:venue.id,title:venue.title,halls:venue.halls.length}:undefined}))}/>;
 if(staff&&p.id)return <PropertyStaff propertyId={p.id} kind={base.details.type} onBack={()=>setStaff(false)} onChanged={name=>setP((o:Row)=>({...o,staff_name:name}))}/>;
 if(open){const title=stepTitle(draft.details.type,open);
  return <View style={e.sheet}>
   <View style={e.bar}><Pressable accessibilityRole="button" accessibilityLabel={t('Назад к списку')} onPress={()=>{setOpen(null);if(!held)setError('');}} disabled={busy||uploading} style={e.round}><Text style={e.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={e.title}>{title}</Text></View>
   {open==='photos'&&<PhotoGrid photos={draft.photos} onChange={photos=>set({photos})} onBusy={setUploading} disabled={busy}/>}
   {open==='flat'&&<>
    <KindPicker kind={d.type} ownStaff={draft.ownStaff} onChange={v=>setDraft(o=>({...o,ownStaff:v.ownStaff??o.ownStaff,details:{...o.details,type:v.type??o.details.type}}))}/>
    {isBanquet(d.type)?<View style={e.row}>{num(t('Вмещает гостей'),draft.capacity,n=>setDraft(o=>({...o,capacity:Math.max(1,n),details:{...o.details,beds:Math.max(1,n)}})),1000)}{num(t('Площадь, м²'),d.area,n=>setD({area:n}),2000)}</View>:isBath(d.type)?<View style={e.row}>{half(<Stepper label={t('Гостей')} value={draft.capacity} text={String(draft.capacity)} min={1} max={50} onChange={n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}}))}/>)}{half(num(t('Площадь, м²'),d.area,n=>setD({area:n}),2000))}</View>:<>
      <View style={e.row}>{half(<Stepper label={t('Комнаты')} value={draft.rooms} text={String(draft.rooms)} min={1} max={20} onChange={n=>set({rooms:n})}/>)}{half(<Stepper label={t('Гостей')} value={draft.capacity} text={String(draft.capacity)} min={1} max={50} onChange={n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}}))}/>)}</View>
      <View style={e.row}>{half(<Stepper label={t('Спальных мест')} value={d.beds} text={String(d.beds)} min={1} max={50} onChange={n=>setD({beds:n})}/>)}{half(<Stepper label={t('Санузлы')} value={d.bathrooms} text={String(d.bathrooms)} min={1} max={20} onChange={n=>setD({bathrooms:n})}/>)}</View>
      <View style={e.row}>{num(t('Площадь, м²'),d.area,n=>setD({area:n}),2000)}{num(t('Этаж'),d.floor,n=>setD({floor:n}),100)}{num(t('Этажей'),d.floors,n=>setD({floors:n}),100)}</View>
    </>}
   </>}
   {open==='place'&&<>
    <AddressField kind="city" label={t('Город или село')} value={draft.city} max={80} onChange={v=>{setPlace('');set({city:v});}} onPick={c=>setPlace(c.id||'')}/>
    <AddressField kind="district" label={t('Район')} value={draft.district} city={draft.city} place={place} max={120} placeholder={t('Например, Центр')} onChange={v=>set({district:v})}/>
    <AddressField kind="street" label={t('Точный адрес')} value={draft.address} city={draft.city} place={place} max={300} placeholder={t('Улица, дом, номер')} onChange={v=>set({address:v})} onPick={c=>{if(c.district&&!draft.district.trim())set({district:c.district});}}/>
    <Text style={e.hint}>{t('Адрес видит только гость с подтверждённой бронью. Метку на карте ставим по нему.')}</Text>
    {base.published&&(draft.address!==base.address||draft.city!==base.city||draft.district!==base.district)&&<Text accessibilityLiveRegion="polite" style={e.note}>{t('Новый адрес проверит администратор, обычно это быстро. До проверки новые гости не увидят жильё, а действующие брони останутся в силе.')}</Text>}
    {!!call&&!!p.id&&<AddressPin propertyId={p.id} city={draft.city} district={draft.district} address={draft.address} place={place} call={call} onChoice={c=>{pick.current=c;}}/>}
   </>}
   {open==='text'&&<>
    {text(t('Название'),draft.title,v=>set({title:v}),120)}
    {text(t('Описание'),draft.description,v=>set({description:v}),2500,'',true)}
    <Text style={[e.hint,draft.description.trim().length<80&&e.warn]}>{draft.description.trim().length<80?t('{n} знаков · для показа гостям нужно от 80',{n:draft.description.trim().length}):t('{n} знаков',{n:draft.description.trim().length})}</Text>
   </>}
   {open==='amenities'&&<View style={e.chips}>{categoryAmenities[kindCategory(d.type)].map(id=>[id,amenities[id]] as [string,string]).map(([id,label])=>{const on=d.amenities.includes(id);return chip(id,label,on,()=>setD({amenities:on?d.amenities.filter(a=>a!==id):[...d.amenities,id]}));})}</View>}
   {open==='prices'&&isBath(d.type)&&<>
    {/* A bath is taken by the hour. The day price the service needs is twelve hours, kept in step with the hour. */}
    <View style={e.row}>{num(t('Час, ₸'),r.hourlyPrice,n=>setDraft(o=>({...o,price:Math.max(100,n*12),rental:{...o.rental,hourlyPrice:n}})))}{num(t('Депозит, ₸'),r.deposit,n=>setR({deposit:n}))}</View>
    <Stepper label={t('Минимум часов')} value={r.minHours} text={String(r.minHours)} min={1} max={24} onChange={n=>setR({minHours:n})}/>
    <View style={e.row}>{num(t('Гостей в цене'),r.includedGuests,n=>setR({includedGuests:n}),50,t('0 — цена не зависит'))}{num(t('Доплата за гостя в час, ₸'),r.extraGuestPrice,n=>setR({extraGuestPrice:n}),1000000)}</View>
    <Stepper label={t('Подготовка перед гостями')} value={r.prepMinutes} text={r.prepMinutes?(r.prepMinutes%60?t('{prepMinutes} мин',{prepMinutes:r.prepMinutes}):t('{v} ч',{v:r.prepMinutes/60})):t('не нужна')} min={0} max={360} step={30} onChange={n=>setR({prepMinutes:n})}/>
    <Text style={e.label}>{r.prepMinutes?t('Напомню затопить вовремя и не приму бронь, если до гостей осталось меньше.'):t('Сколько нужно, чтобы затопить. Напомню вовремя и не приму бронь раньше.')}</Text>
   </>}
   {open==='prices'&&isBanquet(d.type)&&(()=>{const q=banquetPrice(draft);return <>
    {/* A hall is priced per guest with a least party; the service keeps it as the price of the slot (lib/listing-edit.ts). */}
    <View style={e.row}>{num(t('На гостя, ₸'),q.perGuest,n=>setDraft(o=>withBanquetPrice(o,n,q.least)),1000000)}{num(t('Минимум гостей'),q.least,n=>setDraft(o=>withBanquetPrice(o,q.perGuest,Math.min(Math.max(1,n),o.capacity))),1000)}</View>
    <Text style={e.hint}>{q.perGuest?t('Гость платит за своё число гостей, но не меньше чем за {least}: от {v} ₸. Зал берут на обед (12:00–17:00) или на вечер (18:00–00:00).',{least:q.least,v:new Intl.NumberFormat('ru-RU').format(q.perGuest*q.least)}):t('Зал берут на обед (12:00–17:00) или на вечер (18:00–00:00) по цене на гостя.')}</Text>
    <View style={e.row}>{num(t('Депозит, ₸'),r.deposit,n=>setR({deposit:n}))}</View>
    {text(t('Меню'),d.menu||'',v=>setD({menu:v}),1500,t('Бешбармак, казы, салаты, баурсаки, чай. Халяль. Свои напитки по согласованию.'),true)}
    <Text style={e.hint}>{t('Гость видит меню до брони. Телефоны и ссылки не пишите: бронь идёт через сервис.')}</Text>
   </>;})()}
   {open==='prices'&&!isVenue(d.type)&&<>
    <View style={e.row}>{num(t('Сутки, ₸'),draft.price,n=>set({price:n}))}{num(t('Час, ₸'),r.hourlyPrice,n=>setR({hourlyPrice:n}),10000000,t('0 — без почасовой'))}</View>
    <View style={e.row}>{num(t('Ночь, ₸'),r.nightlyPrice,n=>setR({nightlyPrice:n}),10000000,t('0 — без ночной'))}{num(t('Депозит, ₸'),r.deposit,n=>setR({deposit:n}))}</View>
    {r.hourlyPrice>0&&<Stepper label={t('Минимум часов')} value={r.minHours} text={String(r.minHours)} min={1} max={24} onChange={n=>setR({minHours:n})}/>}
   </>}
   {open==='prices'&&<>
    {/* «Предоплата или оплата при заселении» (lib/prepay.ts): a new place is paid at the door until five completed stays. */}
    <Text style={e.label}>{t('Как гость платит')}</Text>
    <View style={e.chips}>{PREPAY_CHOICES.map(n=>chip('prepay'+n,n?t('Предоплата {n}%',{n}):t('При заселении'),r.prepayPercent===n,()=>setR({prepayPercent:n}),true))}</View>
    <Text style={e.hint}>{prepayNote(prepayState(r.prepayPercent,Number(p.prepay?.completed)||0))}{r.prepayPercent>0&&r.prepayPercent<100?' '+t('Остальное и депозит гость переводит при заселении.'):''}</Text>
    {/* «Скидка постоянного гостя» (lib/rental-policy.ts): a guest who already stayed books again in the app, not by phone. */}
    <Text style={e.label}>{t('Скидка постоянным гостям')}</Text>
    <View style={e.chips}>{REPEAT_CHOICES.map(n=>chip('repeat'+n,n?'−'+n+'%':t('Нет'),r.repeatDiscount===n,()=>setR({repeatDiscount:n}),true))}</View>
    <Text style={e.hint}>{r.repeatDiscount?t('Гость, который уже жил у вас, увидит скидку {n}% и забронирует снова через приложение, а не по телефону. Комиссия считается с цены со скидкой.',{n:r.repeatDiscount}):t('Скидка для гостя, который уже жил у вас: так он бронирует снова через приложение, а не по телефону.')}</Text>
   </>}
   {open==='checkin'&&<>
    {!isVenue(d.type)&&<View style={e.row}>{half(text(t('Заезд с'),r.checkinTime,v=>setR({checkinTime:v}),5,'14:00'))}{half(text(t('Выезд до'),r.checkoutTime,v=>setR({checkoutTime:v}),5,'12:00'))}</View>}
    <Text style={e.label}>{isVenue(d.type)?t('Как гости попадут внутрь'):t('Как гость получит ключи')}</Text>
    <View style={e.chips}>{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,d.checkinMethod===id,()=>setD({checkinMethod:id}),true))}</View>
    <View style={e.row}>{num(t('Уборка между гостями, мин'),draft.cleaningMinutes,n=>set({cleaningMinutes:n}),1440)}</View>
    {!!call&&!!p.id&&<>
     {text(t('Инструкция для заселения'),access,setAccess,2500,t('Подъезд 2, код домофона 45, ключ в сейфе у двери, код 1234'),true)}
     <Text style={e.hint}>{p.access_version>0?t('Инструкция уже сохранена. Новая заменит её.'):t('Её увидят только гость перед заездом и исполнитель на уборке. Хранится зашифрованной.')}</Text>
     {!!accessState&&accessState!=='…'&&<Text accessibilityLiveRegion="polite" style={e.hint}>{accessState}</Text>}
     <Pressable accessibilityRole="button" disabled={!access.trim()||accessState==='…'} onPress={saveAccess} style={[e.go,(!access.trim()||accessState==='…')&&e.off]}><Text style={e.goText}>{accessState==='…'?t('Сохраняю…'):t('Сохранить инструкцию')}</Text></Pressable>
    </>}
   </>}
   {open==='rules'&&<>
    <View style={e.chips}>{([['pets',t('Можно с питомцами')],['smoking',t('Можно курить')],['parties',t('Можно вечеринки')]] as const).map(([k,label])=>chip(k,label,d[k],()=>setD({[k]:!d[k]}))).filter((_,at)=>!isBanquet(d.type)||at===1)}</View>
    {text(t('Правила и возврат депозита'),r.houseRules,v=>setR({houseRules:v}),2500,t('Тишина после 23:00. Депозит вернём в день выезда после проверки.'),true)}
    <Text style={e.hint}>{t('Не пишите здесь коды замков и личные контакты.')}</Text>
   </>}
   {!!error&&<Text accessibilityRole="alert" style={e.error}>{error}</Text>}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||uploading}} disabled={busy||uploading} onPress={()=>commit(draft,open)} style={[e.primary,(busy||uploading)&&e.off]}><Text style={e.primaryText}>{busy?t('Сохраняю…'):uploading?t('Загружаю фото…'):t('✓  Сохранить')}</Text></Pressable>
  </View>;
 }

 return <View style={e.sheet}>
  <View style={e.bar}>
   <View style={e.thumb}>{base.photos[0]?<Photo id={base.photos[0]} alt={t('Обложка')} fill/>:<Text style={e.ico}>📷</Text>}</View>
   <View style={{flex:1,minWidth:0}}><Text accessibilityRole="header" numberOfLines={1} style={e.name}>{base.title||t('Без названия')}</Text><Text style={[e.state,base.published&&(p.address_check?e.warn:e.stateOn)]}>{base.published?(p.address_check?t('Адрес на проверке: новые гости пока не видят'):t('Гости видят на карте')):t('Скрыто от гостей')}</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} disabled={busy} style={e.round}><Text style={e.roundText}>✕</Text></Pressable>
  </View>
  <View style={[e.advice,held&&e.adviceHeld]} accessibilityLiveRegion="polite">
   <View style={e.orb}><Text style={e.orbText}>✦</Text></View>
   <View style={{flex:1,minWidth:0,gap:8}}>
    <Text style={e.adviceText}>{!!done&&<Text style={e.saved}>{done} </Text>}{advice.text}</Text>
    
    {!!advice.step&&<View style={e.adviceRow}>
     <Pressable accessibilityRole="button" disabled={busy} onPress={()=>advice.step==='publish'?commit({...(held?draft:base),published:true},'publish'):go(advice.step as EditStep)} style={e.go}><Text style={e.goText}>{busy&&advice.step==='publish'?t('Сохраняю…'):advice.action}</Text></Pressable>
     {!held&&<Pressable accessibilityRole="button" onPress={()=>{setSkipped(v=>[...v,unmapped&&advice.step==='place'?'pin':advice.step as string]);setDone('');}} style={e.later}><Text style={e.laterText}>{t('Не сейчас')}</Text></Pressable>}
    </View>}
   </View>
  </View>
  <View style={e.grid}>{EDIT_STEPS.map(s=>{const needs=stepNeeds(base,s.key)||(s.key==='place'&&unmapped);return <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={[stepTitle(base.details.type,s.key)+': '+stepLine(base,s.key),s.key==='place'&&unmapped?t('нет метки на карте'):needs?t('нужно заполнить'):''].filter(Boolean).join(', ')} onPress={()=>go(s.key)} style={({pressed})=>[e.step,needs&&e.stepNeeds,pressed&&e.pressed]}>
   <View style={[e.icoBox,needs&&e.icoNeeds]}><Text style={e.ico}>{ICONS[s.key]}</Text></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{stepTitle(base.details.type,s.key)}</Text><Text style={e.stepLine} numberOfLines={1}>{s.key==='place'&&unmapped?t('Нет метки на карте'):stepLine(base,s.key)}</Text></View>
   {needs&&<View style={e.dot}/>}
  </Pressable>;})}</View>
  {!!p.id&&!base.ownStaff&&<Pressable accessibilityRole="button" accessibilityLabel={t('Постоянный исполнитель')} onPress={()=>{setDone('');setCleaner(true);}} style={({pressed})=>[e.step,{width:'100%'},pressed&&e.pressed]}>
   <View style={e.icoBox}><Text style={e.ico}>🧹</Text></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{t('Постоянный исполнитель')}</Text><Text style={e.stepLine} numberOfLines={1}>{p.regular_cleaner_name?t('{regular_cleaner_name}: уборки приходят сначала к нему',{regular_cleaner_name:p.regular_cleaner_name}):t('Закрепите своего: уборки, оплата и замена через сервис')}</Text></View>
  </Pressable>}
  {!!p.id&&!!call&&roomKinds.includes(d.type)&&<RoomCount property={p} call={call} onChanged={units=>setP((o:Row)=>({...o,units}))}/>}
  {!!p.id&&!!call&&!roomKinds.includes(d.type)&&<Pressable accessibilityRole="button" accessibilityLabel={t('Залы: {v}',{v:(p.venue?t('{title}, залов {halls}',{title:p.venue.title,halls:p.venue.halls}):t('один зал'))})} onPress={()=>{setDone('');setHalls(true);}} style={({pressed})=>[e.step,{width:'100%'},pressed&&e.pressed]}>
   <View style={e.icoBox}><Image source={menuIcons.building} style={{width:16,height:16,tintColor:C.accent}}/></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{t('Залы')}</Text><Text style={e.stepLine} numberOfLines={1}>{p.venue?t('{title} · залов: {halls}',{title:p.venue.title,halls:p.venue.halls}):t('Несколько залов по одному адресу? Добавьте их')}</Text></View>
  </Pressable>}
  {/* The person on shift is named here, in the settings of the object, and nowhere else. */}
  {!!p.id&&<Pressable accessibilityRole="button" accessibilityLabel={t('Сотрудник: {v}',{v:(p.staff_name||t('не назначен'))})} onPress={()=>{setDone('');setStaff(true);}} style={({pressed})=>[e.step,{width:'100%'},pressed&&e.pressed]}>
   <View style={e.icoBox}><Image source={menuIcons.users} style={{width:16,height:16,tintColor:C.accent}}/></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{t('Сотрудник')}</Text><Text style={e.stepLine} numberOfLines={1}>{p.staff_name?t('{staff_name}: отмечает гостей и «Занято»',{staff_name:p.staff_name}):t('Назначьте того, кто встречает гостей')}</Text></View>
  </Pressable>}
  <Pressable accessibilityRole="button" accessibilityLabel={t('Календари площадок: Airbnb, Booking, Суточно')} onPress={()=>{setDone('');setCalendars(true);}} style={({pressed})=>[e.step,{width:'100%'},pressed&&e.pressed]}>
   <View style={e.icoBox}><Text style={e.ico}>📅</Text></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{t('Календари площадок')}</Text><Text style={e.stepLine} numberOfLines={1}>{t('Airbnb, Booking, Суточно: без двойных броней')}</Text></View>
  </Pressable>
  <View style={e.switchRow}><View style={{flex:1}}><Text style={e.stepTitle}>{t('Показывать гостям')}</Text><Text style={e.stepLine}>{base.published?(p.address_check?t('Появится на карте после проверки адреса'):t('Объявление на карте')):t('Черновик, видите только вы')}</Text></View><Switch accessibilityLabel={t('Показывать гостям')} value={base.published} disabled={busy} onValueChange={v=>commit({...(held?draft:base),published:v},'publish')} trackColor={{true:C.success,false:C.lineStrong}} thumbColor={C.surface}/></View>
  {onRemove&&(confirm?<View style={e.remove}>
   <Text style={e.adviceText}><Text style={{fontWeight:'700'}}>{t('Удалить «{title}»?',{title:base.title||t('жильё')})} </Text>{t('Гости больше его не увидят. Если по нему были брони, история броней и оплат сохранится.')}</Text>
   {!!removeError&&<Text accessibilityRole="alert" style={e.errorText}>{removeError}</Text>}
   <View style={e.adviceRow}><Pressable accessibilityRole="button" disabled={busy} onPress={remove} style={e.danger}><Text style={e.goText}>{busy?t('Удаляю…'):t('🗑 Удалить')}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setConfirm(false);setRemoveError('');}} style={e.later}><Text style={e.laterText}>{t('Отмена')}</Text></Pressable></View>
  </View>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(true)} style={e.removeLink}><Text style={e.removeText}>{t('🗑 Удалить жильё')}</Text></Pressable>)}
 </View>;
}
const e=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.subtitle,...brandFont},
 thumb:{width:40,height:40,borderRadius:R.md,overflow:'hidden',backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},
 name:{color:C.ink,...type.subtitle,fontWeight:'700'},state:{color:C.muted,...type.caption,fontWeight:'600'},stateOn:{color:C.success},
 advice:{flexDirection:'row',gap:12,padding:12,borderRadius:R.lg,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine},
 orb:{width:32,height:32,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center'},orbText:{color:C.onAccent,...type.label,fontWeight:'700'},
 adviceHeld:{backgroundColor:C.dangerSoft,borderColor:C.danger},adviceText:{color:C.ink,...type.label},saved:{color:C.success,fontWeight:'700'},errorText:{color:C.danger,...type.label},
 adviceRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},
 go:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.accent,justifyContent:'center',paddingHorizontal:16},goText:{color:C.onAccent,...type.label,fontWeight:'700'},
 later:{minHeight:H.compact,justifyContent:'center'},laterText:{color:C.muted,...type.label},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 step:{width:'48.5%',flexDirection:'row',alignItems:'center',gap:8,minHeight:56,padding:8,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 stepNeeds:{borderColor:C.warningLine},pressed:{backgroundColor:C.surfaceAlt},
 icoBox:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},icoNeeds:{backgroundColor:C.warningSoft},
 ico:{color:C.accent,...type.label},
 stepTitle:{color:C.ink,...type.label,fontWeight:'600'},stepLine:{color:C.muted,...type.caption},
 dot:{position:'absolute',top:8,right:8,width:8,height:8,borderRadius:R.full,backgroundColor:C.warning},
 remove:{gap:8,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.danger,backgroundColor:C.dangerSoft},
 danger:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.danger,justifyContent:'center',paddingHorizontal:16},
 removeLink:{minHeight:H.compact,alignSelf:'center',justifyContent:'center',paddingHorizontal:12},removeText:{color:C.danger,...type.label,fontWeight:'600'},
 switchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 row:{flexDirection:'row',gap:8},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.accent,borderColor:C.accent},chipText:{color:C.inkSoft,...type.label},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'space-between'},
 label:{color:C.muted,...type.caption,fontWeight:'600'},value:{color:C.ink,...type.subtitle,fontWeight:'700',padding:0},
 field:{gap:4},input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:128,...type.label},
 hint:{color:C.muted,...type.caption},warn:{color:C.warning,fontWeight:'600'},note:{color:C.warning,backgroundColor:C.warningSoft,borderRadius:R.md,padding:12,...type.label},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24,marginTop:4},off:{backgroundColor:C.lineStrong},
 primaryText:{color:C.onAccent,...type.body,fontWeight:'700'}
});
