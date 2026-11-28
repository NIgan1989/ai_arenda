import {L,t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {PhotoGrid} from './PhotoGrid';
import {FlatCalendars} from './FlatCalendars';
import {RegularCleaner} from './RegularCleaner';
import {PropertyStaff} from './PropertyStaff';
import {VenueHalls} from './VenueHalls';
import {RoomCount,roomsLine} from './RoomCount';
import {SwipeConfirm} from './SwipeConfirm';
import {EditButton,EditChips,EditCount,EditField,EditHeading,EditNote,EditNumber,EditRow,EditSheet,EditSwitch,editDot} from './EditSheet';
import type {MenuIcon} from './AccountRows';
import {TitleField} from './TitleField';
import {EDIT_STEPS,banquetPrice,withBanquetPrice,editBody,editRequest,nextAdvice,needsReview,reviewRequest,stepForError,stepLine,stepNeeds,stepTitle,type EditBody,type EditStep} from '../../lib/listing-edit';
import {MAX_SERVICES,minutesWords,SERVICE_STARTERS,type VenueService} from '../../lib/venue-services';
import {amenities,categoryAmenities,checkinMethods,isAuto,isBath,isBanquet,isHourlyVenue,isVenue,kindCategory,kindLabel,unitKinds,unitWords} from '../../lib/listings';
import {KindPicker} from './KindPicker';
import {StayClassPicker} from './StayClassPicker';
import {classOfRow,hasClass} from '../../lib/stay-class';
import {RightsRow,RightsSheet} from './RightDocs';
import {PREPAY_CHOICES,prepayNote,prepayState} from '../../lib/prepay';
import {REPEAT_CHOICES} from '../../lib/rental-policy';
import {AddressPin,type PinChoice} from './AddressPin';
import {AddressField} from './AddressSuggest';
type Row=Record<string,any>;
// The screens of the editor besides the eight steps: each is a sheet of its own with «‹» back to the list.
type Sub='calendars'|'cleaner'|'staff'|'halls'|'rooms'|'rights'|'kind';
const ICONS:Record<EditStep,MenuIcon>={photos:'camera',flat:'properties',place:'pin',text:'file',amenities:'check',prices:'wallet',checkin:'key',rules:'shield'};
const SAVED:Record<EditStep|'publish',string>=L({photos:'Фото сохранены.',flat:'Сохранено.',place:'Адрес сохранён.',text:'Описание сохранено.',amenities:'Удобства сохранены.',prices:'Цены сохранены.',checkin:'Заезд сохранён.',rules:'Правила сохранены.',publish:'Готово.'});
// What to shoot, in the empty cells of the photos (Airbnb's photo tour): for a home, a bath and a hall.
const SLOTS=L({stay:['Комната','Кухня','Санузел','Вид из окна','Вход'],bath:['Парная','Комната отдыха','Душ','Двор','Вход'],banquet:['Зал','Столы','Сцена','Вход','Парковка'],
 leisure:['Помещение','Зона отдыха','Оборудование','Вход','Парковка'],sport:['Поле или зал','Раздевалка','Инвентарь','Вход','Парковка'],auto:['Бокс','Оборудование','Зона ожидания','Въезд','Вывеска']});

// Editing a place in the app (board «Экраны старой версии», 2026-11-26; Turo «Your car»): a sheet of its own with the
// name in the head, the steps as rows with a black line icon and one grey line of what is there, a dot where
// something is missing. Each step opens its own sheet, its «Сохранить» pinned at the bottom; photos are saved as soon
// as they change. Removing the place is under «⋯». Same rules as the site (lib/listing-edit.ts).
export function PropertyEdit({property,onSave,onReview,onRemove,onClose,onOpenHall,step,call}:{property:Row;onSave:(body:Row)=>Promise<Row|undefined>;onReview?:(body:Row)=>Promise<unknown>;onRemove?:()=>Promise<unknown>;onClose:()=>void;onOpenHall?:(id:string)=>void|Promise<void>;step?:EditStep|Exclude<Sub,'kind'>|null;call?:(path:string,body:Row)=>Promise<Row>}){
 const [p,setP]=useState(property),[base,setBase]=useState<EditBody>(()=>editBody(property)),[draft,setDraft]=useState<EditBody>(base);
 const [open,setOpen]=useState<EditStep|null>(step&&EDIT_STEPS.some(x=>x.key===step)?step as EditStep:null),[sub,setSub]=useState<Sub|null>(step&&!EDIT_STEPS.some(x=>x.key===step)?step as Sub:null);
 const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[held,setHeld]=useState(false),[sent,setSent]=useState(false);
 const pick=useRef<PinChoice|null>(null),errorRu=useRef(''),photoPick=useRef<((camera:boolean)=>void)|null>(null),tried=useRef<string|null>(null);
 // The screen the editor was opened on (a tip, a row of the place's tabs): «‹» there goes back where the owner came from.
 const entry=useRef<string|null>(step||null);
 if(!open&&!sub)entry.current=null;
 const [classNote,setClassNote]=useState('');
 const [access,setAccess]=useState(''),[accessState,setAccessState]=useState(''),[place,setPlace]=useState('');
 async function saveAccess():Promise<boolean>{if(!call||!p.id||!access.trim())return true;setAccessState('…');try{await call('access/save',{propertyId:p.id,instructions:access.trim(),expectedVersion:p.access_version||0});setP((o:Row)=>({...o,access_version:(o.access_version||0)+1}));setAccess('');setAccessState('');return true;}catch(r:any){setAccessState(r?.message||t('Не удалось сохранить инструкцию.'));return false;}}
 const [confirm,setConfirm]=useState(false),[removeError,setRemoveError]=useState('');
 // A save that failed keeps its changes: the owner fixes what the server asked for in another step and everything is saved together.
 // The server's own Russian words decide the step; the person reads them in their language (ApiError.ru).
 const fix=held&&error?stepForError(errorRu.current||error):null;
 // Without a pin that matches the address the review cannot pass: the row of the address says so with a dot.
 const unmapped=!!p.id&&p.mapped===false&&!!base.address.trim();
 // The next thing worth doing gets the dot on its row instead of a card of advice above the list.
 const next=nextAdvice(base).step;
 function go(step:EditStep){pick.current=null;tried.current=null;if(!held)setDraft(base);setError(held?error:'');setDone('');setOpen(step);}
 const back=(key:string,to:()=>void)=>()=>{if(entry.current===key){onClose();return;}entry.current=null;to();};
 const toList=()=>{setOpen(null);if(!held)setError('');};
 // Removing is confirmed with a swipe; the server deletes a place without history and archives one with bookings.
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
 // stay: the step stays open after the save (the photos, saved as they change).
 async function commit(next:EditBody,what:EditStep|'publish',stay=false){
  if(busy||uploading)return;setBusy(true);setError('');
  try{const fresh=await onSave(editRequest(next,p));let saved=fresh||{...p,listing_version:(p.listing_version||0)+1};const b=fresh?editBody(fresh):next;
   const pinned=what==='place'?await savePin(saved):null;if(pinned!==null)saved={...saved,mapped:pinned||saved.mapped};
   setP(saved);setBase(b);setDraft(b);if(!stay)setOpen(null);setHeld(false);setError('');
   setDone(what==='place'?(saved.address_check?t('Адрес сохранён и отправлен на проверку. Действующие брони в силе, новые гости увидят жильё после проверки.'):saved.mapped?t('Адрес и метка на карте сохранены.'):t('Адрес сохранён, а дом на карте не нашёлся: откройте «Адрес» и передвиньте карту к дому.')):SAVED[what]);}
  catch(e:any){const message=e?.message||t('Не удалось сохранить.');errorRu.current=String(e?.ru||message);
   // Publishing waits for the administrator: the place is sent for review instead of failing, and is shown once approved.
   if(what==='publish'&&next.published&&onReview&&needsReview(errorRu.current)){try{const kept={...next,published:false};if(held){const fresh=await onSave(editRequest(kept,p));setP(fresh||p);const b=fresh?editBody(fresh):kept;setBase(b);setDraft(b);}await onReview(reviewRequest({id:p.id,title:next.title,city:next.city,address:next.address}));if(call&&p.id){try{const now=await call('map/spot',{propertyId:p.id});setP((o:Row)=>({...o,mapped:!!now.saved}));}catch{}}setSent(true);setHeld(false);setDone('');setError('');setOpen(null);return;}catch(r:any){setError(r?.message||message);setHeld(true);setOpen(null);return;}}
   setError(message);setHeld(true);if(!stay)setOpen(null);}finally{setBusy(false);}
 }
 // The photos are saved by themselves once the uploads are done: a new set is tried once, so a refusal is not repeated.
 useEffect(()=>{
  if(open!=='photos'||uploading||busy)return;
  const key=draft.photos.join(',');
  if(key===base.photos.join(',')||key===tried.current)return;
  tried.current=key;void commit(draft,'photos',true);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,uploading,busy,draft.photos,base.photos]);
 const d=draft.details,r=draft.rental;
 const set=(v:Partial<EditBody>)=>setDraft(o=>({...o,...v}));
 const setD=(v:Partial<EditBody['details']>)=>setDraft(o=>({...o,details:{...o.details,...v}}));
 const setR=(v:Partial<EditBody['rental']>)=>setDraft(o=>({...o,rental:{...o.rental,...v}}));
 const toOverview=()=>setSub(null);

 if(sub==='calendars'&&p.id)return <FlatCalendars propertyId={p.id} onBack={back('calendars',toOverview)} onClose={onClose}/>;
 if(sub==='cleaner'&&p.id)return <RegularCleaner propertyId={p.id} onBack={back('cleaner',toOverview)} onClose={onClose}/>;
 if(sub==='halls'&&p.id&&call)return <VenueHalls property={p} call={call} onBack={back('halls',toOverview)} onClose={onClose} onOpen={onOpenHall} onChanged={venue=>setP((o:Row)=>({...o,venue:venue?{id:venue.id,title:venue.title,halls:venue.halls.length}:undefined}))}/>;
 if(sub==='staff'&&p.id)return <PropertyStaff propertyId={p.id} kind={base.details.type} onBack={back('staff',toOverview)} onClose={onClose} onChanged={name=>setP((o:Row)=>({...o,staff_name:name}))}/>;
 if(sub==='rooms'&&p.id&&call)return <RoomCount property={p} call={call} onBack={back('rooms',toOverview)} onClose={onClose} onChanged={units=>setP((o:Row)=>({...o,units}))}/>;
 if(sub==='rights'&&p.id)return <RightsSheet propertyId={p.id} approved={!!p.verified} onBack={back('rights',toOverview)} onClose={onClose}/>;
 // The type is a list of its own over the step «Жильё»: a choice closes it, the step saves it with the rest.
 if(sub==='kind')return <EditSheet title={t('Тип объекта')} onBack={toOverview} onClose={onClose}>
  <KindPicker inline staff={false} kind={d.type} ownStaff={draft.ownStaff} onChange={v=>{setDraft(o=>({...o,ownStaff:v.ownStaff??o.ownStaff,details:{...o.details,type:v.type??o.details.type}}));if(v.type)setSub(null);}}/>
 </EditSheet>;

 if(open){
  const title=stepTitle(draft.details.type,open),working=busy?t('Сохраняем…'):uploading?t('Загружаем фото…'):false;
  const save=<EditButton title={open==='place'?t('Сохранить адрес'):t('Сохранить')} busy={working||(accessState==='…'&&t('Сохраняем…'))} onPress={async()=>{if(open==='checkin'&&!(await saveAccess()))return;void commit(draft,open);}}/>;
  const foot=open==='photos'?<EditButton title={t('Добавить фото')} busy={working} disabled={draft.photos.length>=8} onPress={()=>photoPick.current?.(false)}/>:save;
  return <EditSheet title={title} onBack={back(open,toList)} onClose={onClose} busy={busy||uploading} foot={foot}>
   {open==='photos'&&<>
    <PhotoGrid photos={draft.photos} onChange={photos=>set({photos})} onBusy={setUploading} disabled={busy} pickRef={photoPick} slots={SLOTS[kindCategory(d.type) as keyof typeof SLOTS]||SLOTS.stay}/>
    {!!done&&!error&&<EditNote text={done} tone="done"/>}
   </>}
   {open==='flat'&&<View>
    <EditRow icon="properties" title={t('Тип объекта')} line={kindLabel(d.type)} onPress={()=>setSub('kind')}/>
    {/* «Класс жилья» (lib/stay-class.ts) is saved at once by its own tap, apart from the rest of the step. */}
    {hasClass(d.type)&&!!p.id&&!!call&&<View style={x.block}><Text style={x.label}>{t('Класс жилья')}{p.stay_class_by==='ai'||!p.stay_class?<Text style={x.hint}>{'  '}{t('ИИ предложил')}</Text>:null}</Text>
     <StayClassPicker value={p.stay_class||classOfRow(p,p.details)} locked={p.stay_class_by==='admin'} onChange={async v=>{const was=p.stay_class,by=p.stay_class_by;setP((o:Row)=>({...o,stay_class:v,stay_class_by:'owner'}));setClassNote('');
      try{await call('listing/class',{propertyId:p.id,stayClass:v,by:'owner'});setClassNote(t('Класс сохранён.'));}catch(x:any){setP((o:Row)=>({...o,stay_class:was,stay_class_by:by}));setClassNote(x?.message||t('Не удалось сохранить.'));}}}/>
     {!!classNote&&<EditNote text={classNote}/>}</View>}
    {isBanquet(d.type)?<>
     <EditNumber title={t('Вмещает гостей')} value={draft.capacity} max={1000} onChange={n=>setDraft(o=>({...o,capacity:Math.max(1,n),details:{...o.details,beds:Math.max(1,n)}}))}/>
     <EditNumber title={t('Площадь')} unit={t('м²')} value={d.area} max={2000} onChange={n=>setD({area:n})}/>
    </>:isAuto(d.type)?<>
     <EditNumber title={t('Площадь')} unit={t('м²')} value={d.area} max={2000} onChange={n=>setD({area:n})}/>
    </>:isHourlyVenue(d.type)?<>
     <EditCount title={t('Гостей')} value={draft.capacity} min={1} max={50} onChange={n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}}))}/>
     <EditNumber title={t('Площадь')} unit={t('м²')} value={d.area} max={2000} onChange={n=>setD({area:n})}/>
    </>:<>
     <EditCount title={t('Комнаты')} value={draft.rooms} min={1} max={20} onChange={n=>set({rooms:n})}/>
     <EditCount title={t('Гостей')} value={draft.capacity} min={1} max={50} onChange={n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}}))}/>
     <EditCount title={t('Спальных мест')} value={d.beds} min={1} max={50} onChange={n=>setD({beds:n})}/>
     <EditCount title={t('Санузлы')} value={d.bathrooms} min={1} max={20} onChange={n=>setD({bathrooms:n})}/>
     <EditNumber title={t('Площадь')} unit={t('м²')} value={d.area} max={2000} onChange={n=>setD({area:n})}/>
     <EditNumber title={t('Этаж')} value={d.floor} max={100} onChange={n=>setD({floor:n})}/>
     <EditNumber title={t('Этажей в доме')} value={d.floors} max={100} onChange={n=>setD({floors:n})}/>
    </>}
    <EditSwitch icon="users" title={t('Свой персонал')} line={draft.ownStaff?t('Уборки делают ваши люди'):t('Исполнителя подберёт сервис')} value={draft.ownStaff} onChange={v=>set({ownStaff:v})} last/>
   </View>}
   {open==='place'&&<>
    <AddressField kind="city" label={t('Город или село')} value={draft.city} max={80} onChange={v=>{setPlace('');set({city:v});}} onPick={c=>setPlace(c.id||'')}/>
    <AddressField kind="district" label={t('Район')} value={draft.district} city={draft.city} place={place} max={120} placeholder={t('Например, Центр')} onChange={v=>set({district:v})}/>
    <AddressField kind="street" label={t('Точный адрес')} value={draft.address} city={draft.city} place={place} max={300} placeholder={t('Улица, дом, номер')} onChange={v=>set({address:v})} onPick={c=>{if(c.district&&!draft.district.trim())set({district:c.district});}}/>
    <EditNote text={base.published&&(draft.address!==base.address||draft.city!==base.city||draft.district!==base.district)?t('Новый адрес проверит администратор. До проверки новые гости не увидят жильё, брони останутся в силе.'):t('Адрес увидит только гость с подтверждённой бронью.')}/>
    {!!call&&!!p.id&&<AddressPin propertyId={p.id} city={draft.city} district={draft.district} address={draft.address} place={place} call={call} onChoice={c=>{pick.current=c;}}/>}
   </>}
   {open==='text'&&<>
    {/* A hall of a venue keeps its own name («Малый зал»), as the server does (lib/service.ts saveListing). */}
    {p.venue?<EditField label={t('Название')} value={draft.title} onChange={v=>set({title:v})} max={120}/>:<TitleField label={t('Заголовок')} kind={d.type} rooms={draft.rooms} title={draft.title} place={{district:draft.district,city:draft.city}} onChange={v=>set({title:v})}/>}
    <EditField label={t('Описание')} value={draft.description} onChange={v=>set({description:v})} max={2500} multiline/>
    <Text style={x.hint}>{draft.description.trim().length<80&&<Text style={{color:editDot.missing}}>● </Text>}{draft.description.trim().length<80?t('{n} знаков · для показа гостям нужно от 80',{n:draft.description.trim().length}):t('{n} знаков',{n:draft.description.trim().length})}</Text>
   </>}
   {open==='amenities'&&<EditChips many value={d.amenities} options={categoryAmenities[kindCategory(d.type)].map(id=>[id,amenities[id]] as [string,string])} onChange={id=>setD({amenities:d.amenities.includes(id)?d.amenities.filter(a=>a!==id):[...d.amenities,id]})}/>}
   {open==='prices'&&isHourlyVenue(d.type)&&<View>
    {/* A bath is taken by the hour. The day price the service needs is twelve hours, kept in step with the hour. */}
    <EditNumber title={t('Час')} unit="₸" value={r.hourlyPrice} onChange={n=>setDraft(o=>({...o,price:Math.max(100,n*12),rental:{...o.rental,hourlyPrice:n}}))}/>
    {!isAuto(d.type)&&<EditCount title={t('Минимум часов')} value={r.minHours} min={1} max={24} onChange={n=>setR({minHours:n})}/>}
    {!isAuto(d.type)&&<><EditNumber title={t('Гостей в цене')} line={t('0 — цена не зависит')} value={r.includedGuests} max={50} onChange={n=>setR({includedGuests:n})}/>
    <EditNumber title={t('Доплата за гостя в час')} unit="₸" value={r.extraGuestPrice} max={1000000} onChange={n=>setR({extraGuestPrice:n})}/></>}
    <EditCount title={t('Подготовка перед гостями')} line={isBath(d.type)?t('Напомню затопить и не приму бронь раньше'):t('Напомню подготовить и не приму бронь раньше')} value={r.prepMinutes} text={r.prepMinutes?(r.prepMinutes%60?t('{prepMinutes} мин',{prepMinutes:r.prepMinutes}):t('{v} ч',{v:r.prepMinutes/60})):t('нет')} min={0} max={360} step={30} onChange={n=>setR({prepMinutes:n})}/>
    <EditNumber title={t('Депозит')} unit="₸" value={r.deposit} onChange={n=>setR({deposit:n})} last/>
   </View>}
   {open==='prices'&&isAuto(d.type)&&(()=>{const list=d.services||[],put=(i:number,v:Partial<VenueService>)=>setD({services:list.map((s,j)=>j===i?{...s,...v}:s)});return <>
    {/* «Услуги» of a car place (lib/venue-services.ts): the guest picks one, it holds the box for its minutes at its price. */}
    <EditHeading title={t('Услуги')}/>
    {list.map((s,i)=><View key={i}>
     <EditField label={t('Услуга {n}',{n:i+1})} value={s.name} onChange={v=>put(i,{name:v})} max={60} placeholder={t('Например, Комплекс')}/>
     <EditCount title={t('Время')} value={s.minutes} text={minutesWords(s.minutes)} min={15} max={720} step={15} onChange={n=>put(i,{minutes:n})}/>
     <EditNumber title={t('Цена')} unit="₸" line={t('Легковая')} value={s.price} onChange={n=>put(i,{price:n})}/>
     {/* «Цена по классу машины»: 0 — как у легковой (lib/venue-services.ts servicePrice). */}
     <EditNumber title={t('Кроссовер')} unit="₸" line={t('0 — как легковая')} value={s.prices?.crossover||0} onChange={n=>put(i,{prices:{...s.prices,crossover:n}})}/>
     <EditNumber title={t('Джип, минивэн')} unit="₸" line={t('0 — как легковая')} value={s.prices?.suv||0} onChange={n=>put(i,{prices:{...s.prices,suv:n}})} last/>
     <EditButton line title={t('Убрать услугу')} onPress={()=>setD({services:list.filter((_,j)=>j!==i)})}/>
    </View>)}
    {!list.length&&!!SERVICE_STARTERS[d.type]&&<EditButton line title={t('Взять обычные услуги')} onPress={()=>setD({services:SERVICE_STARTERS[d.type]})}/>}
    {list.length<MAX_SERVICES&&<EditButton line title={t('Добавить услугу')} onPress={()=>setD({services:[...list,{name:'',minutes:30,price:3000}]})}/>}
    <EditNote text={t('Гость выбирает услугу, бокс занят на её время. Цена за час — для брони без услуги.')}/>
   </>;})()}
   {open==='prices'&&isBanquet(d.type)&&(()=>{const q=banquetPrice(draft);return <>
    {/* A hall is priced per guest with a least party; the service keeps it as the price of the slot (lib/listing-edit.ts). */}
    <View>
     <EditNumber title={t('На гостя')} unit="₸" value={q.perGuest} max={1000000} onChange={n=>setDraft(o=>withBanquetPrice(o,n,q.least))}/>
     <EditNumber title={t('Минимум гостей')} line={q.perGuest?t('Заказ от {v} ₸',{v:new Intl.NumberFormat('ru-RU').format(q.perGuest*q.least)}):undefined} value={q.least} max={1000} onChange={n=>setDraft(o=>withBanquetPrice(o,q.perGuest,Math.min(Math.max(1,n),o.capacity)))}/>
     <EditNumber title={t('Депозит')} unit="₸" value={r.deposit} onChange={n=>setR({deposit:n})} last/>
    </View>
    <EditField label={t('Меню')} value={d.menu||''} onChange={v=>setD({menu:v})} max={1500} placeholder={t('Бешбармак, казы, салаты, баурсаки, чай. Халяль. Свои напитки по согласованию.')} multiline/>
    <EditNote text={t('Гость видит меню до брони. Телефоны и ссылки не пишите.')}/>
   </>;})()}
   {open==='prices'&&!isVenue(d.type)&&<View>
    <EditNumber title={t('Сутки')} unit="₸" value={draft.price} onChange={n=>set({price:n})}/>
    <EditNumber title={t('Час')} unit="₸" line={t('0 — без почасовой')} value={r.hourlyPrice} onChange={n=>setR({hourlyPrice:n})}/>
    {r.hourlyPrice>0&&<EditCount title={t('Минимум часов')} value={r.minHours} min={1} max={24} onChange={n=>setR({minHours:n})}/>}
    <EditNumber title={t('Ночь')} unit="₸" line={t('0 — без ночной')} value={r.nightlyPrice} onChange={n=>setR({nightlyPrice:n})}/>
    <EditNumber title={t('Депозит')} unit="₸" value={r.deposit} onChange={n=>setR({deposit:n})} last/>
   </View>}
   {open==='prices'&&<>
    {/* «Предоплата или оплата при заселении» (lib/prepay.ts): a new place is paid at the door until five completed stays. */}
    <EditChips label={t('Как гость платит')} value={r.prepayPercent} options={PREPAY_CHOICES.map(n=>[n,n?t('Предоплата {n}%',{n}):t('При заселении')] as [number,string])} onChange={n=>setR({prepayPercent:n})}/>
    <EditNote text={prepayNote(prepayState(r.prepayPercent,Number(p.prepay?.completed)||0))}/>
    {/* «Скидка постоянного гостя» (lib/rental-policy.ts): a guest who already stayed books again in the app, not by phone. */}
    <EditChips label={t('Скидка постоянным гостям')} value={r.repeatDiscount} options={REPEAT_CHOICES.map(n=>[n,n?'−'+n+'%':t('Нет')] as [number,string])} onChange={n=>setR({repeatDiscount:n})}/>
    <EditNote text={t('Гость, который уже жил у вас, забронирует снова через приложение, а не по телефону.')}/>
   </>}
   {open==='checkin'&&<>
    {!isVenue(d.type)&&<View style={x.pair}><View style={x.half}><EditField label={t('Заезд с')} value={r.checkinTime} onChange={v=>setR({checkinTime:v})} max={5} placeholder="14:00" keyboard="numbers-and-punctuation"/></View><View style={x.half}><EditField label={t('Выезд до')} value={r.checkoutTime} onChange={v=>setR({checkoutTime:v})} max={5} placeholder="12:00" keyboard="numbers-and-punctuation"/></View></View>}
    <EditChips label={isVenue(d.type)?t('Как гости попадут внутрь'):t('Как гость получит ключи')} value={d.checkinMethod} options={Object.entries(checkinMethods) as [string,string][]} onChange={id=>setD({checkinMethod:id})}/>
    <View><EditNumber title={t('Уборка между гостями')} unit={t('мин')} value={draft.cleaningMinutes} max={1440} onChange={n=>set({cleaningMinutes:n})} last/></View>
    {!!call&&!!p.id&&<>
     <EditField label={t('Инструкция для заселения')} value={access} onChange={setAccess} max={2500} placeholder={t('Подъезд 2, код домофона 45, ключ в сейфе у двери, код 1234')} multiline/>
     <EditNote text={accessState&&accessState!=='…'?accessState:p.access_version>0?t('Инструкция уже сохранена. Новая заменит её.'):t('Её увидят только гость перед заездом и исполнитель на уборке. Хранится зашифрованной.')} tone={accessState&&accessState!=='…'?'error':undefined}/>
    </>}
   </>}
   {open==='rules'&&<>
    {/* The rules are strict words: what is allowed is said as a fact («Питомцы разрешены»), parties are not offered. */}
    <EditChips many value={(['pets','smoking'] as const).filter(k=>d[k])} options={([['pets',t('Питомцы разрешены')],['smoking',t('Курение разрешено')]] as ['pets'|'smoking',string][]).filter(([k])=>!isBanquet(d.type)||k==='smoking')} onChange={k=>setD({[k]:!d[k]})}/>
    <EditField label={t('Правила и возврат депозита')} value={r.houseRules} onChange={v=>setR({houseRules:v})} max={2500} placeholder={t('Тишина после 23:00. Депозит вернём в день выезда после проверки.')} multiline/>
    <EditNote text={t('Не пишите здесь коды замков и личные контакты.')}/>
   </>}
   {!!error&&<EditNote text={error} tone="error"/>}
  </EditSheet>;
 }

 const status=base.published?(p.address_check?{dot:editDot.wait,text:t('Адрес на проверке: новые гости пока не видят')}:{dot:editDot.ok,text:t('Гости видят на карте')})
  :sent?{dot:editDot.wait,text:t('На проверке у администратора')}:{dot:editDot.off,text:t('Скрыто от гостей')};
 const venue=isVenue(base.details.type);
 const extra:{key:Sub;icon:MenuIcon;title:string;line:string}[]=[
  ...(p.id&&call&&unitKinds.includes(base.details.type)?[{key:'rooms' as Sub,icon:'building' as MenuIcon,title:t(unitWords(base.details.type).title),line:roomsLine(p)}]:[]),
  ...(p.id&&call&&(venue||!!p.venue)?[{key:'halls' as Sub,icon:'building' as MenuIcon,title:t('Залы'),line:p.venue?t('{title} · залов: {halls}',{title:p.venue.title,halls:p.venue.halls}):t('Один зал')}]:[]),
  // The person on shift is named here, in the settings of the object, and nowhere else.
  ...(p.id?[{key:'staff' as Sub,icon:'user' as MenuIcon,title:t('Сотрудник'),line:p.staff_name||t('Не назначен')}]:[]),
  ...(p.id&&!base.ownStaff?[{key:'cleaner' as Sub,icon:'users' as MenuIcon,title:t('Постоянный исполнитель'),line:p.regular_cleaner_name||t('Не закреплён')}]:[]),
  ...(p.id?[{key:'calendars' as Sub,icon:'calendar' as MenuIcon,title:t('Календари площадок'),line:t('Airbnb, Booking, Суточно')}]:[]),
 ];
 const rights=!!p.id&&!p.demo_owner;
 return <EditSheet title={base.title||t('Без названия')} onBack={onClose} onClose={onClose} busy={busy}
  menu={onRemove?[{title:t('Удалить жильё'),icon:'trash',danger:true,onPress:()=>{setConfirm(true);setRemoveError('');}}]:undefined}
  foot={confirm?<View style={x.confirm}>
   <Text style={x.confirmText}><Text style={x.strong}>{t('Удалить «{title}»?',{title:base.title||t('жильё')})} </Text>{t('Гости больше его не увидят. Если по нему были брони, история броней и оплат сохранится.')}</Text>
   {!!removeError&&<EditNote text={removeError} tone="error"/>}
   <SwipeConfirm key={removeError} label={t('Проведите, чтобы удалить')} disabled={busy} onConfirm={()=>void remove()}/>
   <EditButton line title={t('Не удалять')} disabled={busy} onPress={()=>{setConfirm(false);setRemoveError('');}}/>
  </View>:undefined}>
  <View>
   <EditSwitch icon="eye" title={t('Показывать гостям')} line={status.text} dot={status.dot} value={base.published} disabled={busy} onChange={v=>void commit({...(held?draft:base),published:v},'publish')} last/>
  </View>
  {!!done&&!error&&<EditNote text={done} tone="done"/>}
  {!!error&&<View style={x.block}><EditNote text={fix?t('Не сохранилось: {error} Заполните это, и сохранится всё вместе.',{error}):t('Не сохранилось: {error}',{error})} tone="error"/>{!!fix&&<Pressable accessibilityRole="button" onPress={()=>go(fix)} hitSlop={8}><Text style={x.link}>{t('Заполнить')} ›</Text></Pressable>}</View>}
  <View>{EDIT_STEPS.map((s,i)=>{const needs=stepNeeds(base,s.key)||(s.key==='place'&&unmapped)||fix===s.key,soon=next===s.key;
   return <EditRow key={s.key} icon={ICONS[s.key]} title={stepTitle(base.details.type,s.key)} line={s.key==='place'&&unmapped?t('Нет метки на карте'):stepLine(base,s.key)} dot={needs?editDot.missing:soon?editDot.wait:false} label={[stepTitle(base.details.type,s.key)+': '+stepLine(base,s.key),s.key==='place'&&unmapped?t('нет метки на карте'):needs?t('нужно заполнить'):''].filter(Boolean).join(', ')} onPress={()=>go(s.key)} last={i===EDIT_STEPS.length-1}/>;})}</View>
  {(extra.length>0||rights)&&<View style={x.group}>
   {extra.map((row,i)=><EditRow key={row.key} icon={row.icon} title={row.title} line={row.line} onPress={()=>{setDone('');setSub(row.key);}} last={i===extra.length-1&&!rights}/>)}
   {rights&&<RightsRow propertyId={p.id} approved={!!p.verified} onPress={()=>{setDone('');setSub('rights');}} last/>}
  </View>}
 </EditSheet>;
}
const x=StyleSheet.create({
 block:{gap:8,paddingVertical:8},
 label:{...type.label,color:C.ink,fontWeight:'600'},hint:{...type.label,color:C.muted,fontWeight:'400'},
 pair:{flexDirection:'row',gap:12},half:{flex:1},
 group:{marginTop:12,borderTopWidth:8,borderTopColor:C.bg,marginHorizontal:-16,paddingHorizontal:16},
 link:{...type.label,color:C.ink,fontWeight:'600'},
 confirm:{gap:12},confirmText:{...type.label,color:C.ink},strong:{fontWeight:'600'},
});
