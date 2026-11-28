import {t} from '../../lib/i18n';
// Adding a place in the app (thread «Сделать формы под каждый тип жилья», 2026-11-28): first the kind, then a form of
// that kind only, then the address, the photos and publishing. Three steps:
//  1. «Что вы сдаёте?» — the owner tells about the place in his own words; the AI shows at once which kind it read
//     (the rules while he types, the model on «Далее»), or he picks the kind from the list.
//  2. The form of the kind (TypeForm): only its own fields, filled from the story; room types, halls, services, boxes
//     and hours right here, not later in the editor.
//  3. «Где и как выглядит» — the address, the photos, the class, the title and text, who answers the guests.
// Same reading as on the site: lib/listing-draft.ts; what the kinds add: lib/listing-forms.ts.
import {homeAskFromText,type HomeAsk} from '../../lib/home-ask';
import React,{useEffect,useMemo,useState} from 'react';
import {Platform,View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {Thinking} from './Thinking';
import {AddressField} from './AddressSuggest';
import {C,type} from './styles';
import {AiMark} from './AiMark';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {PhotoGrid} from './PhotoGrid';
import {KindIcon} from './KindIcon';
import {defaultOwnStaff,isBanquet,isHourlyVenue,isVenue,propertyTypes} from '../../lib/listings';
import {KindPicker} from './KindPicker';
import {TitleField} from './TitleField';
import {StayClassPicker} from './StayClassPicker';
import {TypeForm} from './TypeForm';
import {classLabel,hasClass,suggestClass,type ClassGuess} from '../../lib/stay-class';
import {RightDocs} from './RightDocs';
import {needsReview,reviewRequest} from '../../lib/listing-edit';
import {DRAFT_EXAMPLE,DRAFT_EXAMPLE_BATH,draftDescription,draftRules,draftTitle,emptyDraft,mergeModelDraft,readListingText,type ListingDraft} from '../../lib/listing-draft';
import {formKind,formPlan,missingFields,startExtras,type FormExtras} from '../../lib/listing-forms';
import {feeOf,useOwnerFee} from './RecordCard';
type Row=Record<string,any>;
type Saved={id:string;message:string;published:boolean;placed?:boolean;cards:number};
const R=T.radius,H=T.control;
const digits=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>digits(n)+' ₸';
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';

export function PropertyQuick({city,onSave,onUpdate,call,onGuestMode,onPlace,onReview,onClose,onMap,onDone,onHome,onUnderstand,onTop,onClassGuess,onClass}:{onClassGuess?:(body:Row)=>Promise<Row>;onClass?:(body:Row)=>Promise<unknown>;city:string;onHome?:(ask?:HomeAsk)=>void;onSave:(body:Row)=>Promise<Row>;onUpdate?:(id:string,body:Row)=>Promise<unknown>;call?:(path:string,body:Row)=>Promise<any>;onGuestMode:(body:Row)=>Promise<unknown>;onPlace?:(body:Row)=>Promise<unknown>;onReview?:(body:Row)=>Promise<unknown>;onClose:()=>void;onMap?:(id:string)=>void;onDone:(saved:Saved)=>void;onUnderstand?:(text:string)=>Promise<Row|null>;onTop?:()=>void;onPriceHint?:(body:Row)=>Promise<Row>}){
 const [step,setStep]=useState(0),[text,setText]=useState(''),[draft,setDraft]=useState<ListingDraft>(()=>emptyDraft(city)),[found,setFound]=useState<string[]>([]);
 const [extras,setExtras]=useState<FormExtras|null>(null);
 const [photos,setPhotos]=useState<string[]>([]),[uploading,setUploading]=useState(false),[mode,setMode]=useState<'auto'|'manual'>('auto'),[open,setOpen]=useState('');
 const [busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const [place,setPlace]=useState('');
 // Step 1: the kind the owner picked from the list wins over the one read from his words; the list opens by a tap.
 const [picked,setPicked]=useState(''),[listOpen,setListOpen]=useState(false),[readText,setReadText]=useState<string|null>(null);
 const ruleKind=useMemo(()=>{if(!text.trim())return '';const r=readListingText(text,emptyDraft(city));return r.found.includes('type')?r.draft.type:'';},[text]);
 const shownKind=picked||(readText===text&&draft.known.includes('type')?draft.type:ruleKind);
 // «Класс жилья» (lib/stay-class.ts): the rules guess at once from the story, the space and the amenities; with photos the
 // server lets the model look at the renovation. The owner's tap is his choice; untouched, the AI's guess is saved as the AI's.
 const [chosenClass,setChosenClass]=useState<string|null>(null),[photoGuess,setPhotoGuess]=useState<ClassGuess&{key:string}|null>(null);
 const classFacts={type:draft.type,area:draft.area,capacity:draft.capacity,rooms:draft.rooms,amenities:draft.amenities,text};
 const classKey=[draft.type,draft.area,draft.capacity,draft.amenities.join(','),photos.slice(0,3).join(',')].join('|');
 const ruleGuess=useMemo(()=>hasClass(draft.type)?suggestClass(classFacts):null,[classKey,text]);
 const classGuess=hasClass(draft.type)?(photoGuess?.key===classKey?photoGuess:ruleGuess):null;
 const stayClass=hasClass(draft.type)?chosenClass||classGuess?.stayClass||null:null;
 useEffect(()=>{if(step!==2||!photos.length||!onClassGuess||!hasClass(draft.type)||photoGuess?.key===classKey)return;let live=true;const key=classKey;
  onClassGuess({...classFacts,photos:photos.slice(0,3)}).then(v=>{if(live&&v?.from==='photos'&&v.stayClass)setPhotoGuess({stayClass:v.stayClass,reasons:v.reasons||[],from:'photos',key});}).catch(()=>{});
  return()=>{live=false;};},[step,classKey]);
 // A field the owner sets himself is known: it loses its «Проверьте».
 const patch=(value:Partial<ListingDraft>)=>{setDraft(d=>({...d,...value,known:[...new Set([...d.known,...Object.keys(value)])]}));};
 const guessed=(key:string)=>!draft.known.includes(key);
 const ex=extras&&extras.type===draft.type?extras:startExtras(draft,extras);
 const putExtras=(v:Partial<FormExtras>)=>setExtras({...ex,...v});
 // Не объявление, а уборка своего жилья (lib/home-ask.ts): форма ведёт в заказ уборки с тем, что уже понято из текста.
 // «Нет, это объявление»: человек сам решает, если ИИ ошибся. Новый текст спрашивает заново.
 const [listing,setListing]=useState('');
 const homeAsk=useMemo(()=>onHome&&listing!==text?homeAskFromText(text):null,[text,onHome,listing]);
 const withKind=(d:ListingDraft,kind:string,staffFound:boolean)=>kind&&kind!==d.type||kind&&!d.known.includes('type')?{...d,type:kind,ownStaff:staffFound?d.ownStaff:defaultOwnStaff(kind),known:[...new Set([...d.known,'type'])]}:d;
 // «Далее» on step 1: the rules read at once; the model, when the server has one and the owner allowed it, fills what
 // they missed. A kind nobody could read opens the list: the form of step 2 depends on it.
 async function next(){if(reading)return;if(homeAsk&&onHome){onHome(homeAsk);return;}
  setError('');
  if(readText!==text&&text.trim()){
   // A new story is read anew: what the form held came from the old one.
   const rules=readListingText(text,emptyDraft(city));let read_=rules;setReading(true);
   try{const ai=onUnderstand?await onUnderstand(text.slice(0,2000)):null;if(ai?.status==='ok')read_=mergeModelDraft(rules.draft,rules.found,ai.fields);}catch{/* the rules' reading stays */}
   setReading(false);setFound(read_.found);setReadText(text);
   const d=withKind(read_.draft,picked,read_.found.includes('ownStaff'));setDraft(d);
   if(!d.known.includes('type')){setListOpen(true);setError(t('Не понял, что это за объект. Выберите тип из списка.'));return;}
   setExtras(startExtras(d,null));setStep(1);setOpen('');onTop?.();return;
  }
  const kind=picked||(draft.known.includes('type')?draft.type:'');
  if(!kind){setListOpen(true);setError(t('Выберите тип из списка или расскажите об объекте.'));return;}
  const d=withKind(text.trim()?draft:emptyDraft(city),kind,found.includes('ownStaff'));setDraft(d);setExtras(e=>startExtras(d,e));setStep(1);setOpen('');onTop?.();
 }
 const missing=missingFields(draft,ex);
 function toPlace(){const left=missing.filter(m=>m.step===1);if(left.length){setError(t('Заполните: {v}.',{v:left.map(m=>m.label).join(', ')}));return;}setError('');setStep(2);onTop?.();}
 async function save(){
  if(busy||uploading)return;
  if(missing.length){setError(t('Заполните: {v}.',{v:missing.map(m=>m.label).join(', ')}));return;}
  setBusy(true);setError('');
  try{
   let published=photos.length>0,review=false;
   const plan=formPlan(draft,ex,photos,published),ids:string[]=[];
   // The first card decides the publication: without the platform's check every card stays a draft.
   for(const [i,card] of plan.cards.entries()){
    let result:Row;const body={...card.body,published};
    try{result=await onSave(body);}
    catch(e:any){if(i>0||!published||!/провер|допуск/i.test(String(e?.ru??e?.message)))throw e;published=false;result=await onSave({...body,published:false});
     if(onReview&&needsReview(String(e?.ru??e?.message))){try{await onReview(reviewRequest({id:result.id,title:draftTitle(draft),city:draft.city,address:draft.address}));review=true;}catch{/* the owner can still ask from «Допуск» */}}}
    ids.push(result.id);
    // «N одинаковых»: rooms of one type, fields, tables, boxes (lib/room-units.ts).
    if(card.units>1&&call){try{await call('rooms/count',{propertyId:result.id,count:card.units});}catch{/* the count can be set later in the editor */}}
   }
   // The further halls of a banquet hall (lib/venue.ts): each a copy of the first with its own name and capacity.
   if(call&&onUpdate)for(const h of plan.halls){
    try{const r=await call('venue/hall',{propertyId:ids[0],title:h.name,venueTitle:plan.venueTitle});
     try{await onUpdate(r.id,{...h.body,title:h.name,published,expectedVersion:1,policyVersion:1});}catch{try{await onUpdate(r.id,{...h.body,title:h.name,published:false,expectedVersion:1,policyVersion:1});}catch{/* the hall stays a draft copy */}}
     ids.push(r.id);}catch{/* a hall can be added later in the editor */}
   }
   // Every card goes on the map by its address right away; the owner only checks the pin. The class goes with it: the
   // owner's choice, or the AI's guess he did not change.
   let placed=false,note='';
   for(const id of ids){
    if(stayClass&&onClass){try{await onClass({propertyId:id,stayClass,by:chosenClass?'owner':'ai'});}catch{/* the class can be set later in the editor */}}
    try{placed=!!((await onPlace?.({propertyId:id,...(place?{place}:{})})) as Row|undefined)?.saved||placed;}catch{/* the map pin can be set later */}
    try{await onGuestMode({propertyId:id,mode,cleaningFee:!draft.ownStaff&&draft.cleaningFee>=100?draft.cleaningFee:undefined});}catch(e:any){note=' '+(e?.message||'');}
   }
   const what=ids.length>1?t('Карточек: {n}.',{n:ids.length})+' ':'';
   setSaved({id:ids[0],cards:ids.length,published,placed,message:what+(published?t(['Зал опубликован, гости уже видят его на карте.','Объект опубликован, гости уже видят его на карте.','Жильё опубликовано, гости уже видят его на карте.'][sort]):review?t('Сохранено черновиком и отправлено на проверку администратору: после проверки появится на карте само.'):photos.length?t('Сохранено черновиком: чтобы показать гостям, пройдите проверку в «Управление → Допуск».'):t('Сохранено черновиком. Добавьте фото, чтобы показать гостям.'))+note});setStep(3);onTop?.();
  }catch(e:any){setError(e?.message||t(['Не удалось сохранить зал.','Не удалось сохранить объект.','Не удалось сохранить жильё.'][sort]));}finally{setBusy(false);}
 }
 const form=formKind(draft.type),hall=isBanquet(draft.type),venue=isVenue(draft.type);
 const sort=hall?0:venue?1:2;
 // «Сколько стоят сутки?»: what stays to the owner after the service's fee (lib/service-dues.ts rates).
 const fee=useOwnerFee(step===1&&form==='stay');
 const cut=fee&&draft.price>=100?feeOf(draft.price,fee,Date.now()/1000):0,free=!!fee?.freeUntil&&fee.freeUntil>Date.now()/1000;
 const feeLine=fee&&draft.price>=100?(free?t('Бесплатный старт: комиссии нет, вы получите {v}.',{v:money(draft.price)}):t('Комиссия сервиса {rate}: вы получите {v} за сутки.',{rate:percent(fee.rate),v:money(draft.price-cut)})):'';
 const priceLine=form==='rooms'?(()=>{const p=ex.roomTypes.map(r=>r.price).filter(v=>v>=100);return p.length?t('от {v} / сутки',{v:money(Math.min(...p))}):'';})():form==='auto'?(ex.services.length?t('Услуги от {v}',{v:money(Math.min(...ex.services.map(s=>s.price||0)))}):''):hall?(draft.price>=100?t('{v} за гостя',{v:money(draft.price)}):''):isHourlyVenue(draft.type)?(draft.hourlyPrice>=100?t('{v} / час · от {minHours} ч',{v:money(draft.hourlyPrice),minHours:draft.minHours}):''):[draft.price>=100&&t('{v} / сутки',{v:money(draft.price)}),draft.hourlyPrice>=100&&t('{v} / час',{v:money(draft.hourlyPrice)}),draft.nightlyPrice>=100&&t('{v} / ночь',{v:money(draft.nightlyPrice)})].filter(Boolean).join(' · ');
 // One line per thing on step 3: what the AI filled and a tap to open that line and fix it.
 const row=(id:string,label:string,value:string,guess:boolean,content:React.ReactNode)=>{const on=open===id;return <View key={id} style={[q.row,on&&q.rowOn]}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:on}} accessibilityLabel={label+': '+(value||t('не указано'))} onPress={()=>setOpen(on?'':id)} style={({pressed})=>[q.rowHead,pressed&&{opacity:.6}]}>
   <View style={{flex:1,minWidth:0,gap:2}}><Text style={q.rowLabel}>{label}{guess?<Text style={q.guess}>{'  '}{t('Проверьте')}</Text>:null}</Text><Text style={[q.rowValue,!value&&q.rowEmpty]} numberOfLines={on?1:2}>{value||t('не указано')}</Text></View>
   <Text style={q.rowGo}>{on?t('Готово'):t('Изменить')}</Text>
  </Pressable>
  {on&&<View style={q.rowBody}>{content}</View>}
 </View>;};
 const textLine=draftDescription(draft).replace(/\s+/g,' ').slice(0,90);
 const heading=(title:string,sub?:string,note?:string)=><View style={q.heading}><Text accessibilityRole="header" style={q.title}>{title}</Text>{!!sub&&<Text style={q.sub}>{sub}</Text>}{!!note&&<Text style={q.hint}>{note}</Text>}</View>;
 const foot=(back:(()=>void)|null,label:string,onNext:()=>void,off:boolean,working?:string)=><View style={q.foot}>
  <View style={q.seg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{[0,1,2].map(i=><View key={i} style={[q.segBar,i<=step&&q.segOn]}/>)}</View>
  <View style={q.footRow}>
   {back?<Pressable accessibilityRole="button" onPress={back} disabled={busy} hitSlop={12} style={({pressed})=>pressed&&{opacity:.55}}><Text style={q.back}>{t('Назад')}</Text></Pressable>:<View/>}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:off,busy:!!working}} disabled={off||!!working} onPress={onNext} style={({pressed})=>[q.next,off&&q.nextOff,pressed&&{opacity:.85}]}>{working?<View style={q.readingRow}><Thinking size="sm" color={C.onAccent}/><Text style={q.nextText}>{working}</Text></View>:<Text style={q.nextText}>{label}</Text>}</Pressable>
  </View>
 </View>;
 const go=(n:number)=>()=>{setStep(n);setError('');onTop?.();};
 const kindName=propertyTypes[shownKind as keyof typeof propertyTypes]||'';

 return <View style={q.sheet}>
  <View style={q.top}>
   {step<3?<Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} disabled={busy} style={({pressed})=>[q.pill,pressed&&{opacity:.6}]}><Text style={q.pillText}>{t('Закрыть')}</Text></Pressable>:<View/>}
   <View style={q.pill}><Text style={q.pillText}>{t('Шаг {v} из 3',{v:Math.min(3,step+1)})}</Text></View>
  </View>

  {step===0&&<View style={q.body}>
   {heading(t('Что вы сдаёте?'),t('Пара слов — ИИ поймёт тип и подготовит форму под него'))}
   <View style={q.line}><TextInput accessibilityLabel={t('Расскажите об объекте')} style={q.lineInput} multiline editable={!reading} value={text} onChangeText={setText} maxLength={2000} placeholder={t('Например: баня на дровах в Зелёной роще, до 8 человек, 6 000 в час')} placeholderTextColor={C.muted} textAlignVertical="top"/>
    <View style={q.lineBar}><View style={q.grid}><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE)} style={q.chip}><Text style={q.chipText}>{t('Пример: жильё')}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE_BATH)} style={q.chip}><Text style={q.chipText}>{t('Пример: баня')}</Text></Pressable></View><Text style={q.hint}>{text.length?text.length+' / 2000':''}</Text></View></View>
   {!!kindName&&!listOpen&&<View accessibilityLiveRegion="polite" style={q.kind}>
    {picked?<KindIcon id={shownKind} size={24} color={C.ink}/>:<AiMark/>}
    <View style={{flex:1,minWidth:0}}><Text style={q.kindName}>{kindName}</Text><Text style={q.hint}>{picked?t('Выбрано вами'):t('Понял из рассказа')}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={t('Выбрать другой тип')} onPress={()=>setListOpen(true)} hitSlop={8}><Text style={q.rowGo}>{t('Другой тип')}</Text></Pressable>
   </View>}
   {!kindName&&!listOpen&&<Pressable accessibilityRole="button" onPress={()=>setListOpen(true)} style={({pressed})=>[q.homeLink,pressed&&{opacity:.55}]}><Text style={q.homeLinkText}>{t('Или')}{' '}<Text style={q.homeLinkGo}>{t('выберите тип из списка ›')}</Text></Text></Pressable>}
   {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}
   {listOpen&&<View style={q.listBox}><KindPicker inline staff={false} kind={shownKind} ownStaff={false} onChange={v=>{if(v.type){setPicked(v.type);setListOpen(false);setError('');}}}/></View>}
   {!!onHome&&!homeAsk&&!listOpen&&<Pressable accessibilityRole="button" accessibilityLabel={t('Не сдаёте жильё, нужна только уборка? Заказать уборку дома')} onPress={()=>onHome()} style={({pressed})=>[q.homeLink,pressed&&{opacity:.55}]}><Text style={q.homeLinkText}>{t('Не сдаёте, нужна только уборка?')}{' '}<Text style={q.homeLinkGo}>{t('Заказать уборку дома ›')}</Text></Text></Pressable>}
   {!!homeAsk&&<View accessibilityLiveRegion="polite" style={q.homeAsk}><Text style={q.homeAskTitle}>{t('Похоже, вам нужна уборка своего жилья')}</Text><Text style={q.homeAskText}>{homeAsk.address?t('Объявление не нужно: закажем уборку по адресу {address}. Цену поставите сами, ИИ подскажет.',{address:homeAsk.address}):t('Объявление не нужно: закажем уборку. Цену поставите сами, ИИ подскажет.')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Нет, это объявление для сдачи')} onPress={()=>setListing(text)} hitSlop={8}><Text style={q.homeLinkGo}>{t('Нет, это объявление ›')}</Text></Pressable></View>}
   {foot(null,homeAsk?t('Заказать уборку'):t('Далее'),()=>void next(),!text.trim()&&!picked,reading?t('ИИ читает рассказ…'):undefined)}
  </View>}

  {step===1&&<View style={q.body}>
   <View style={q.heading}>
    <View style={q.kindHead}><KindIcon id={draft.type} size={28} color={C.ink}/><Text accessibilityRole="header" style={[q.title,{flex:1}]}>{propertyTypes[draft.type as keyof typeof propertyTypes]}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel={t('Выбрать другой тип')} onPress={()=>{setStep(0);setListOpen(true);setError('');onTop?.();}} hitSlop={8}><Text style={q.rowGo}>{t('Другой тип')}</Text></Pressable></View>
    <Text style={q.sub}>{found.length?t('ИИ заполнил по рассказу: {n}. Проверьте отмеченное.',{n:found.length}):t('Заполните поля этого типа.')}</Text>
   </View>
   <TypeForm draft={draft} extras={ex} patch={patch} onExtras={putExtras} guessed={guessed} feeLine={feeLine}/>
   {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}
   {foot(go(0),t('Далее'),toPlace,false)}
  </View>}

  {step===2&&<View style={q.body}>
   {heading(t('Где и как выглядит'),t('Адрес, фото и текст объявления'))}
   <View style={q.sec}>
    <Text style={q.secTitle}>{t('Адрес')}{(guessed('address')||guessed('district'))&&draft.address?<Text style={q.guess}>{'  '}{t('Проверьте')}</Text>:null}</Text>
    <AddressField kind="city" label={t('Город или село')} value={String(draft.city||'')} max={80} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>{setPlace('');patch({city:v});}} onPick={c=>setPlace(c.id||'')}/>
    <AddressField kind="street" label={t('Точный адрес · только для гостя с бронью')} value={String(draft.address||'')} city={String(draft.city||'')} place={place} max={300} placeholder={t('Улица, дом, номер')} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>patch({address:v})} onPick={c=>{if(c.district&&!String(draft.district||'').trim())patch({district:c.district});}}/>
    <AddressField kind="district" label={t('Район')} value={String(draft.district||'')} city={String(draft.city||'')} place={place} max={120} placeholder={t('Например, Центр')} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>patch({district:v})}/>
   </View>
   <View style={q.sec}><Text style={q.secTitle}>{t('Фото')}</Text><PhotoGrid photos={photos} onChange={setPhotos} onBusy={setUploading}/>{!photos.length&&<Text style={q.hint}>{t(['Без фото зал сохранится черновиком.','Без фото объект сохранится черновиком.','Без фото жильё сохранится черновиком.'][sort])}</Text>}</View>
   <View style={q.preview}>
    {!!photos[0]&&<View style={[q.cover,q.coverPhoto]}><Photo id={photos[0]} alt={t('Обложка')}/></View>}
    <View style={q.previewBody}><Text style={q.previewTitle}>{draftTitle(draft)}</Text><Text style={q.sub}>{[draft.district||t('Район не указан'),draft.city].filter(Boolean).join(' · ')}</Text><Text style={q.price}>{priceLine||t('Цена не указана')}</Text></View>
   </View>
   <View style={q.rows}>
    {row('title',t('Заголовок'),draftTitle(draft),false,<TitleField kind={draft.type} rooms={draft.rooms} title={draft.title} place={{district:draft.district,city:draft.city}} onChange={v=>patch({title:v})}/>)}
    {!!stayClass&&row('class',t('Класс'),classLabel(stayClass),!chosenClass,<StayClassPicker value={stayClass} guess={classGuess?.stayClass} reasons={classGuess?.reasons} onChange={v=>{setChosenClass(v);setOpen('');}}/>)}
    {row('text',t('Текст объявления'),textLine,false,<>
     <View style={q.field}><Text style={q.tileLabel}>{t('Описание · ИИ написал сам')}</Text><TextInput accessibilityLabel={t('Описание')} multiline scrollEnabled={false} style={[q.input,q.area]} value={draftDescription(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,description:v}))}/></View>
     <View style={q.field}><Text style={q.tileLabel}>{venue?t('Правила'):t('Правила проживания')}</Text><TextInput accessibilityLabel={venue?t('Правила'):t('Правила проживания')} multiline scrollEnabled={false} style={[q.input,q.area]} value={draftRules(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,houseRules:v}))}/></View>
    </>)}
   </View>
   <Text style={q.h}>{t('Кто отвечает гостям')}</Text>
   <View style={q.grid} accessibilityRole="radiogroup">
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='auto'}} onPress={()=>setMode('auto')} style={[q.mode,mode==='auto'&&q.modeOn]}><Text style={q.modeTitle}>{t('ИИ')}</Text><Text style={q.hint}>{draft.ownStaff?t('Отвечает за минуту и подтверждает бронь'):t('Отвечает за минуту, подтверждает бронь и заказывает уборку')}</Text></Pressable>
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='manual'}} onPress={()=>setMode('manual')} style={[q.mode,mode==='manual'&&q.modeOn]}><Text style={q.modeTitle}>{t('Я сам')}</Text><Text style={q.hint}>{t('Запросы приходят вам, вы решаете')}</Text></Pressable>
   </View>
   {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}
   {foot(go(1),photos.length?t('Опубликовать'):t('Сохранить черновик'),()=>void save(),uploading,busy?t('Сохраняем…'):undefined)}
  </View>}

  {step===3&&saved&&<View style={q.body}>
   <View style={q.doneMark}><Text style={q.doneMarkText}>✓</Text></View>
   {heading(draftTitle(draft),saved.message,(saved.placed?t('Метку на карте ИИ поставил сам по адресу.')+' ':'')+(mode==='auto'?(draft.ownStaff?t('Гостям отвечает ИИ: он подтвердит бронь по вашим ценам.'):t('Гостям отвечает ИИ: он подтвердит бронь по вашим ценам и закажет уборку.')):t('Запросы гостей будут приходить вам.')))}
   {/* «Право сдавать жильё» right here, not only in the place's card on the map: the owner finds it while the place is fresh. */}
   <RightDocs propertyId={saved.id} approved={false}/>
   <View style={q.seg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{[0,1,2].map(i=><View key={i} style={[q.segBar,q.segOn]}/>)}</View>
   {onMap&&<Pressable accessibilityRole="button" onPress={()=>onMap(saved.id)} style={({pressed})=>[q.next,q.wide,pressed&&{opacity:.85}]}><Text style={q.nextText}>{saved.placed?t('Метка по адресу: посмотреть'):t('Показать на карте')}</Text></Pressable>}
   <Pressable accessibilityRole="button" onPress={()=>onDone(saved)} style={({pressed})=>[onMap?q.outline:q.next,q.wide,pressed&&{opacity:.85}]}><Text style={onMap?q.outlineText:q.nextText}>{t('Готово')}</Text></Pressable>
  </View>}
 </View>;
}

// Monochrome as the apps on Mobbin: ink for what is chosen and for the main button, neutral lines, no tinted boxes.
const q=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:16,borderWidth:1,borderColor:C.line},
 top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 pill:{minHeight:36,paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'center'},pillText:{color:C.ink,...type.label,fontWeight:'600'},
 heading:{gap:4},title:{color:C.ink,...type.title,fontWeight:'600',letterSpacing:-.3},sub:{color:C.muted,...type.label},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label},
 body:{gap:12},
 line:{borderWidth:1,borderColor:C.lineStrong,borderRadius:R.lg,backgroundColor:C.surface,overflow:'hidden'},
 lineInput:{minHeight:136,padding:16,color:C.ink,...type.body},
 lineBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:12,paddingBottom:12},
 hint:{color:C.muted,...type.caption},
 homeLink:{paddingVertical:8},homeAsk:{gap:4,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line},homeAskTitle:{color:C.ink,...type.label,fontWeight:'600'},homeAskText:{color:C.inkSoft,...type.caption},homeLinkText:{color:C.inkSoft,...type.label},homeLinkGo:{color:C.ink,fontWeight:'600'},
 foot:{gap:16,marginTop:8},seg:{flexDirection:'row',gap:4},segBar:{flex:1,height:4,borderRadius:R.full,backgroundColor:C.line},segOn:{backgroundColor:C.ink},
 footRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16},
 back:{color:C.ink,...type.body,fontWeight:'600',textDecorationLine:'underline'},
 next:{minHeight:H.primary,minWidth:132,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:24},nextOff:{backgroundColor:C.lineStrong},
 nextText:{color:C.onAccent,...type.body,fontWeight:'600'},wide:{alignSelf:'stretch'},
 outline:{minHeight:H.primary,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:20},outlineText:{color:C.ink,...type.body,fontWeight:'600'},
 bigRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:8,paddingVertical:16},
 big:{maxWidth:'80%',color:C.ink,...type.display,fontWeight:'600',letterSpacing:-1,textAlign:'center',padding:0,...(Platform.OS==='web'?({outlineStyle:'none'} as object):null)},bigUnit:{color:C.ink,...type.display,fontWeight:'600'},
 sum:{borderRadius:R.lg,borderWidth:1.5,borderColor:C.ink,paddingHorizontal:16,paddingVertical:12,gap:4},
 sumRow:{flexDirection:'row',justifyContent:'space-between',gap:12},sumTotal:{borderTopWidth:1,borderTopColor:C.line,paddingTop:8,marginTop:4},
 sumText:{color:C.ink,...type.body},sumMuted:{color:C.muted,...type.body,flexShrink:1},sumStrong:{color:C.ink,...type.body,fontWeight:'600'},
 advice:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingVertical:12},adviceText:{flex:1,color:C.ink,...type.label,paddingTop:4},
 preview:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,overflow:'hidden'},
 cover:{minHeight:56,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},coverPhoto:{aspectRatio:16/9},coverEmpty:{color:C.inkSoft,...type.label,fontWeight:'600',textAlign:'center',padding:16},
 previewBody:{padding:12,gap:4},previewTitle:{color:C.ink,...type.subtitle,fontWeight:'600',padding:0},price:{color:C.ink,...type.body,fontWeight:'600'},
 readingRow:{flexDirection:'row',alignItems:'center',gap:12},
 h:{color:C.muted,...type.caption,fontWeight:'600',marginTop:8},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.ink,borderColor:C.ink},chipText:{color:C.ink,...type.label},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 grid:{flexDirection:'row',gap:8},half:{flex:1},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'space-between'},
 tileLabel:{color:C.muted,...type.caption,fontWeight:'600'},guess:{color:C.warning,...type.caption},
 tileValue:{color:C.ink,...type.subtitle,fontWeight:'600',padding:0},
 field:{gap:4},input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:112,textAlignVertical:'top',...type.label},
 rows:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 row:{borderTopWidth:1,borderTopColor:C.line},rowOn:{backgroundColor:C.bg},
 rowHead:{flexDirection:'row',alignItems:'center',gap:12,minHeight:60,paddingHorizontal:16,paddingVertical:8},
 rowLabel:{color:C.muted,...type.caption,fontWeight:'600'},rowValue:{color:C.ink,...type.body},rowEmpty:{color:C.danger},
 rowGo:{color:C.ink,...type.label,fontWeight:'600',textDecorationLine:'underline'},rowBody:{gap:12,paddingHorizontal:16,paddingBottom:16},
 mode:{flex:1,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,gap:4},modeOn:{borderColor:C.ink,borderWidth:2,padding:12},
 modeTitle:{color:C.ink,...type.body,fontWeight:'600'},
 kind:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:R.lg,borderWidth:1.5,borderColor:C.ink},kindName:{color:C.ink,...type.body,fontWeight:'600'},kindHead:{flexDirection:'row',alignItems:'center',gap:12},
 listBox:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,padding:12},
 sec:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,padding:12,gap:12},secTitle:{color:C.ink,...type.body,fontWeight:'600'},
 doneMark:{width:56,height:56,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center'},doneMarkText:{color:C.onAccent,...type.title,fontWeight:'600'}
});
