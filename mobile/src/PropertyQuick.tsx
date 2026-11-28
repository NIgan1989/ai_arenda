import {L,forms,t} from '../../lib/i18n';
// Adding a flat in the app: the owner tells the AI about it in one message, then checks the card the AI filled.
// The AI asks only what it could not read (address, district, daily price), one question at a time.
// Same reading as on the site: lib/listing-draft.ts.
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
import {Stepper} from './SheetParts';
import {SERVICE_STARTERS} from '../../lib/venue-services';
import {amenities,categoryAmenities,checkinMethods,isAuto,isBath,isHourlyVenue,kindCategory,propertyTypes} from '../../lib/listings';
import {KindPicker} from './KindPicker';
import {TitleField} from './TitleField';
import {StayClassPicker} from './StayClassPicker';
import {classLabel,hasClass,suggestClass,type ClassGuess} from '../../lib/stay-class';
import {RightDocs} from './RightDocs';
import {needsReview,reviewRequest} from '../../lib/listing-edit';
import {DRAFT_EXAMPLE,DRAFT_EXAMPLE_BATH,answerDraft,draftDescription,draftListingBody,draftQuestions,draftRules,draftTitle,emptyDraft,mergeModelDraft,moneyAnswer,readListingText,type ListingDraft} from '../../lib/listing-draft';
import {plural} from '../../lib/map-search-request';
import {feeOf,useOwnerFee} from './RecordCard';
type Row=Record<string,any>;
type Saved={id:string;message:string;published:boolean;placed?:boolean};
const R=T.radius,H=T.control;
const digits=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>digits(n)+' ₸';
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
// House rules said plainly; parties are not a rule the owner sets here.
const RULES:[keyof ListingDraft,string,string][]=L([['pets','Питомцы разрешены','Без питомцев'],['smoking','Курение разрешено','Курение запрещено']]);

// Adding a place: the owner tells about it in his own words, the AI fills the fields (the rules at once, the model for
// what the rules could not read), and the check screen is a short list of lines, one per thing: a tap opens that line to fix it.
// Laid out as Airbnb adds a place (concept of 2026-11-25): «Закрыть» and «Шаг N из 3» on top, one big heading, and each
// question the AI could not answer from the story is a screen of its own; at the bottom the step bar, «Назад» and «Далее».
export function PropertyQuick({city,onSave,onGuestMode,onPlace,onReview,onClose,onMap,onDone,onHome,onUnderstand,onTop,onPriceHint,onClassGuess,onClass}:{onClassGuess?:(body:Row)=>Promise<Row>;onClass?:(body:Row)=>Promise<unknown>;city:string;onHome?:(ask?:HomeAsk)=>void;onSave:(body:Row)=>Promise<Row>;onGuestMode:(body:Row)=>Promise<unknown>;onPlace?:(body:Row)=>Promise<unknown>;onReview?:(body:Row)=>Promise<unknown>;onClose:()=>void;onMap?:(id:string)=>void;onDone:(saved:Saved)=>void;onUnderstand?:(text:string)=>Promise<Row|null>;onTop?:()=>void;onPriceHint?:(body:Row)=>Promise<Row>}){
 const [step,setStep]=useState(0),[text,setText]=useState(''),[draft,setDraft]=useState<ListingDraft>(()=>emptyDraft(city)),[found,setFound]=useState<string[]>([]);
 const [photos,setPhotos]=useState<string[]>([]),[uploading,setUploading]=useState(false),[answer,setAnswer]=useState(''),[mode,setMode]=useState<'auto'|'manual'>('auto'),[open,setOpen]=useState('');
 const [busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const questions=useMemo(()=>{const q:{key:string;label:string;question:string;placeholder:string}[]=draftQuestions(draft);return !draft.ownStaff&&!(draft.cleaningFee>=100)?[...q,{key:'cleaningFee',label:t('Уборка'),question:t('Сколько платите за уборку после гостей?'),placeholder:'0'}]:q;},[draft,mode]);
 const ask=questions[0];
 const [place,setPlace]=useState('');
 // «Класс жилья» (lib/stay-class.ts): the rules guess at once from the story, the space and the amenities; with photos the
 // server lets the model look at the renovation. The owner's tap is his choice; untouched, the AI's guess is saved as the AI's.
 const [chosenClass,setChosenClass]=useState<string|null>(null),[photoGuess,setPhotoGuess]=useState<ClassGuess&{key:string}|null>(null);
 const classFacts={type:draft.type,area:draft.area,capacity:draft.capacity,rooms:draft.rooms,amenities:draft.amenities,text};
 const classKey=[draft.type,draft.area,draft.capacity,draft.amenities.join(','),photos.slice(0,3).join(',')].join('|');
 const ruleGuess=useMemo(()=>hasClass(draft.type)?suggestClass(classFacts):null,[classKey,text]);
 const classGuess=hasClass(draft.type)?(photoGuess?.key===classKey?photoGuess:ruleGuess):null;
 const stayClass=hasClass(draft.type)?chosenClass||classGuess?.stayClass||null:null;
 // The check screen, once reached, stays: clearing a line while fixing it does not throw the owner back to a question.
 const [checking,setChecking]=useState(false);
 useEffect(()=>{if(step===1&&!questions.length)setChecking(true);},[step,questions.length]);
 useEffect(()=>{if(step!==1||!photos.length||!onClassGuess||!hasClass(draft.type)||photoGuess?.key===classKey)return;let live=true;const key=classKey;
  onClassGuess({...classFacts,photos:photos.slice(0,3)}).then(v=>{if(live&&v?.from==='photos'&&v.stayClass)setPhotoGuess({stayClass:v.stayClass,reasons:v.reasons||[],from:'photos',key});}).catch(()=>{});
  return()=>{live=false;};},[step,classKey]);
 const asking=step===1&&!!ask&&!checking;
 // Fields only the model read: a new reading of the story may change them; a field the owner edits himself is his.
 const [modelKeys,setModelKeys]=useState<string[]>([]);
 const patch=(value:Partial<ListingDraft>)=>{setModelKeys(k=>k.filter(key=>!(key in value)));setDraft(d=>({...d,...value,known:[...new Set([...d.known,...Object.keys(value)])]}));};
 const guessed=(key:string)=>!draft.known.includes(key);
 // Не объявление, а уборка своего жилья (lib/home-ask.ts): форма ведёт в заказ уборки с тем, что уже понято из текста.
 // «Нет, это объявление»: человек сам решает, если ИИ ошибся. Новый текст спрашивает заново.
 const [listing,setListing]=useState('');
 const homeAsk=useMemo(()=>onHome&&listing!==text?homeAskFromText(text):null,[text,onHome,listing]);
 // The rules read at once; the model, when the server has one and the owner allowed it, fills what they missed.
 // No answer from the model is not an error: the owner checks the lines either way.
 async function read(){if(!text.trim()||reading)return;if(homeAsk&&onHome){onHome(homeAsk);return;}
  const base={...draft,known:draft.known.filter(k=>!modelKeys.includes(k))};
  const rules=readListingText(text,base);let next=rules;setError('');setReading(true);
  try{const ai=onUnderstand?await onUnderstand(text.slice(0,2000)):null;if(ai?.status==='ok')next=mergeModelDraft(rules.draft,rules.found,ai.fields);}catch{/* the rules' reading stays */}
  setReading(false);setModelKeys(next.found.filter(k=>!rules.found.includes(k)));setDraft(next.draft);setFound(next.found);setOpen('');setChecking(false);setStep(1);onTop?.();}
 function reply(){if(!ask||!answer.trim())return;
  // «Сами», «сам убираю», «свой персонал»: nobody is ordered, the owner marks the place ready himself.
  if(ask.key==='cleaningFee'){const v=moneyAnswer(answer);if(v>=100)patch({cleaningFee:v});else if(/(?:^|[^а-я])(?:сам[аи]?|сво[йиея][а-я]*\s+(?:персонал|горничн|уборщ|сотрудник))(?=$|[^а-я])/i.test(answer)||/өзім|өз\s+қызметкер|ourselves|myself|own\s+staff/i.test(answer))patch({ownStaff:true});else{setError(t('Напишите сумму от 100 ₸ или нажмите «Убираем сами».'));return;}}
  else setDraft(d=>answerDraft(d,ask.key as 'address'|'district'|'price',answer));
  setAnswer('');setError('');onTop?.();}
 async function save(){
  if(busy||uploading||questions.length)return;setBusy(true);setError('');
  try{
   let result:Row,published=photos.length>0,review=false;
   try{result=await onSave(draftListingBody(draft,photos,published));}
   catch(e:any){if(!published||!/провер|допуск/i.test(String(e?.ru??e?.message)))throw e;published=false;result=await onSave(draftListingBody(draft,photos,false));
    if(onReview&&needsReview(String(e?.ru??e?.message))){try{await onReview(reviewRequest({id:result.id,title:draftTitle(draft),city:draft.city,address:draft.address}));review=true;}catch{/* the owner can still ask from «Допуск» */}}}
   // The flat goes on the map by its address right away; the owner only checks the pin.
   // The class goes with the place: the owner's choice, or the AI's guess he did not change.
   if(stayClass&&onClass){try{await onClass({propertyId:result.id,stayClass,by:chosenClass?'owner':'ai'});}catch{/* the class can be set later in the editor */}}
   let placed=false;try{placed=!!((await onPlace?.({propertyId:result.id,...(place?{place}:{})})) as Row|undefined)?.saved;}catch{/* the map pin can be set later */}
   let note='';try{await onGuestMode({propertyId:result.id,mode,cleaningFee:!draft.ownStaff&&draft.cleaningFee>=100?draft.cleaningFee:undefined});}catch(e:any){note=' '+(e?.message||'');}
   setSaved({id:result.id,published,placed,message:(published?t(['Зал опубликован, гости уже видят его на карте.','Объект опубликован, гости уже видят его на карте.','Жильё опубликовано, гости уже видят его на карте.'][sort]):review?t('Сохранено черновиком и отправлено на проверку администратору: после проверки появится на карте само.'):photos.length?t('Сохранено черновиком: чтобы показать гостям, пройдите проверку в «Управление → Допуск».'):t('Сохранено черновиком. Добавьте фото, и его можно будет показать гостям.'))+note});setStep(2);onTop?.();
  }catch(e:any){setError(e?.message||t(['Не удалось сохранить зал.','Не удалось сохранить объект.','Не удалось сохранить жильё.'][sort]));}finally{setBusy(false);}
 }
 // A banquet hall: `price` is the price per guest, with the least party (lib/listing-draft.ts).
 // «Досуг», «Спорт», «Авто» go by the hour as a bath does; only a bath is heated, and «Авто» counts no guests.
 const hall=['banquet','cafe'].includes(draft.type),bath=isHourlyVenue(draft.type),venue=hall||bath,heated=isBath(draft.type),car=isAuto(draft.type);
 // A bath or a hall is not «жильё»: the screen names what the owner adds.
 const sort=hall?0:bath?1:2;
 // «Сколько стоят сутки?»: what the guest pays, the service's fee (lib/service-dues.ts rates) and what stays, and what similar
 // flats in the city ask, when there are at least three to compare with (lib/price-advice.ts similarRange).
 const fee=useOwnerFee(asking&&ask?.key==='price'&&!hall);
 const [hint,setHint]=useState<{low:number;high:number;stayClass?:string}|null>(null);
 const hintFor=asking&&ask?.key==='price'&&!venue&&!!onPriceHint&&!!String(draft.city||'').trim()?draft.city+':'+draft.rooms+':'+(stayClass||''):'';
 useEffect(()=>{if(!hintFor||!onPriceHint)return;let live=true;
  onPriceHint({city:draft.city,rooms:draft.rooms,...(stayClass?{stayClass}:{})}).then(v=>{if(live)setHint(Number(v?.low)>=100?{low:Number(v.low),high:Number(v.high),stayClass:v.stayClass||undefined}:null);}).catch(()=>{});
  return()=>{live=false;};},[hintFor]);
 // A car place is booked for a service: the usual services come with it (lib/venue-services.ts), the owner edits them later.
 const starters=car?SERVICE_STARTERS[draft.type]||[]:[];
 const priceLine=hall?(draft.price>=100?t('{v} за гостя',{v:money(draft.price)}):''):starters.length?t('Услуги от {v}',{v:money(Math.min(...starters.map(x=>x.price)))}):bath?(draft.hourlyPrice>=100?t('{v} / час · от {minHours} ч',{v:money(draft.hourlyPrice),minHours:draft.minHours}):''):[draft.price>=100&&t('{v} / сутки',{v:money(draft.price)}),draft.hourlyPrice>=100&&t('{v} / час',{v:money(draft.hourlyPrice)}),draft.nightlyPrice>=100&&t('{v} / ночь',{v:money(draft.nightlyPrice)})].filter(Boolean).join(' · ');
 const chip=(key:string,label:string,on:boolean,onPress:()=>void,radio=false)=><Pressable key={key} accessibilityRole={radio?'radio':'checkbox'} accessibilityState={{checked:on}} onPress={onPress} style={[q.chip,on&&q.chipOn]}><Text style={[q.chipText,on&&q.chipTextOn]}>{on&&!radio?'✓ ':''}{label}</Text></Pressable>;
 const num=(key:keyof ListingDraft,label:string,max=10000000)=><View style={q.tile} key={key}><Text style={q.tileLabel}>{label}</Text><TextInput accessibilityLabel={label} style={q.tileValue} keyboardType="number-pad" returnKeyType="done" value={draft[key]?String(draft[key]):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={v=>patch({[key]:Math.min(max,Number(v.replace(/[^\d]/g,''))||0)} as Partial<ListingDraft>)}/></View>;
 const field=(key:keyof ListingDraft,label:string,placeholder='',max=120)=><View key={key} style={q.field}><Text style={q.tileLabel}>{label}</Text><TextInput accessibilityLabel={label} style={q.input} value={String(draft[key]||'')} placeholder={placeholder} placeholderTextColor={C.muted} maxLength={max} onChangeText={v=>patch({[key]:v} as Partial<ListingDraft>)}/></View>;
 // One line per thing: what the AI filled, a mark when it only guessed, and a tap to open that line and fix it.
 const row=(id:string,label:string,value:string,guess:boolean,content:React.ReactNode)=>{const on=open===id;return <View key={id} style={[q.row,on&&q.rowOn]}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:on}} accessibilityLabel={label+': '+(value||t('не указано'))} onPress={()=>setOpen(on?'':id)} style={({pressed})=>[q.rowHead,pressed&&{opacity:.6}]}>
   <View style={{flex:1,minWidth:0,gap:2}}><Text style={q.rowLabel}>{label}{guess?<Text style={q.guess}>{'  '}{t('Проверьте')}</Text>:null}</Text><Text style={[q.rowValue,!value&&q.rowEmpty]} numberOfLines={on?1:2}>{value||t('не указано')}</Text></View>
   <Text style={q.rowGo}>{on?t('Готово'):t('Изменить')}</Text>
  </Pressable>
  {on&&<View style={q.rowBody}>{content}</View>}
 </View>;};
 const anyGuess=(...keys:string[])=>keys.some(guessed);
 const sizeLine=[!venue&&t(forms(draft.rooms,'{n} комната','{n} комнаты','{n} комнат'),{n:draft.rooms}),!car&&t(forms(draft.capacity,'до {n} гостя','до {n} гостей','до {n} гостей'),{n:draft.capacity}),draft.area?t('{n} м²',{n:draft.area}):'',!bath&&draft.floor?t('{floor} этаж из {floors}',{floor:draft.floor,floors:draft.floors}):''].filter(Boolean).join(' · ');
 const addressLine=[draft.address,draft.district,draft.city].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
 const amenityLine=draft.amenities.map(id=>amenities[id]).filter(Boolean).join(', ');
 const rules=RULES.filter(([key])=>!venue||key==='smoking');
 const rulesLine=rules.map(([key,yes,no])=>draft[key]?yes:no).join(' · ');
 const methodName=checkinMethods[draft.checkinMethod as keyof typeof checkinMethods]||'';
 const entryLine=venue?methodName:[t('заезд с {a}, выезд до {b}',{a:draft.checkinTime,b:draft.checkoutTime}),methodName].filter(Boolean).join(' · ');
 const textLine=draftDescription(draft).replace(/\s+/g,' ').slice(0,90);

 const stepNo=step===0?1:step===1?2:3;
 const money_=(key:string)=>key==='price'||key==='cleaningFee';
 const value=Number(answer)||0,cut=fee&&value>=100?feeOf(value,fee,Date.now()/1000):0,free=!!fee?.freeUntil&&fee.freeUntil>Date.now()/1000;
 const heading=(title:string,sub?:string,note?:string)=><View style={q.heading}><Text accessibilityRole="header" style={q.title}>{title}</Text>{!!sub&&<Text style={q.sub}>{sub}</Text>}{!!note&&<Text style={q.hint}>{note}</Text>}</View>;
 const foot=(back:(()=>void)|null,label:string,onNext:()=>void,off:boolean,working?:string)=><View style={q.foot}>
  <View style={q.seg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{[0,1,2].map(i=><View key={i} style={[q.segBar,i<=step&&q.segOn]}/>)}</View>
  <View style={q.footRow}>
   {back?<Pressable accessibilityRole="button" onPress={back} disabled={busy} hitSlop={12} style={({pressed})=>pressed&&{opacity:.55}}><Text style={q.back}>{t('Назад')}</Text></Pressable>:<View/>}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:off,busy:!!working}} disabled={off||!!working} onPress={onNext} style={({pressed})=>[q.next,off&&q.nextOff,pressed&&{opacity:.85}]}>{working?<View style={q.readingRow}><Thinking size="sm" color={C.onAccent}/><Text style={q.nextText}>{working}</Text></View>:<Text style={q.nextText}>{label}</Text>}</Pressable>
  </View>
 </View>;
 const toStory=()=>{setStep(0);setChecking(false);setAnswer('');setError('');onTop?.();};

 return <View style={q.sheet}>
  <View style={q.top}>
   {step<2?<Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} disabled={busy} style={({pressed})=>[q.pill,pressed&&{opacity:.6}]}><Text style={q.pillText}>{t('Закрыть')}</Text></Pressable>:<View/>}
   <View style={q.pill}><Text style={q.pillText}>{t('Шаг {v} из 3',{v:stepNo})}</Text></View>
  </View>

  {step===0&&<View style={q.body}>
   {heading(t('Расскажите об объекте'),t('ИИ заполнит объявление по вашему рассказу'))}
   <View style={q.line}><TextInput accessibilityLabel={t('Расскажите об объекте')} style={q.lineInput} multiline editable={!reading} value={text} onChangeText={setText} maxLength={2000} placeholder={t('Например: однушка на Торайгырова 64, 4 этаж, до 3 гостей, есть Wi-Fi и стиралка, 15 000 в сутки, 2 500 в час')} placeholderTextColor={C.muted} textAlignVertical="top"/>
    <View style={q.lineBar}><View style={q.grid}><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE)} style={q.chip}><Text style={q.chipText}>{t('Пример: жильё')}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE_BATH)} style={q.chip}><Text style={q.chipText}>{t('Пример: баня')}</Text></Pressable></View><Text style={q.hint}>{text.length?text.length+' / 2000':''}</Text></View></View>
   <PhotoGrid photos={photos} onChange={setPhotos} onBusy={setUploading}/>
   <Text style={q.hint}>{t('Пишите как другу: тип, адрес, район, цены, гости, удобства, правила. ИИ сам разложит всё по полям, вы только проверите.')}</Text>
   {!!onHome&&!homeAsk&&<Pressable accessibilityRole="button" accessibilityLabel={t('Не сдаёте жильё, нужна только уборка? Заказать уборку дома')} onPress={()=>onHome()} style={({pressed})=>[q.homeLink,pressed&&{opacity:.55}]}><Text style={q.homeLinkText}>{t('Не сдаёте, нужна только уборка?')}{' '}<Text style={q.homeLinkGo}>{t('Заказать уборку дома ›')}</Text></Text></Pressable>}
   {!!homeAsk&&<View accessibilityLiveRegion="polite" style={q.homeAsk}><Text style={q.homeAskTitle}>{t('Похоже, вам нужна уборка своего жилья')}</Text><Text style={q.homeAskText}>{homeAsk.address?t('Объявление не нужно: закажем уборку по адресу {address}. Цену поставите сами, ИИ подскажет.',{address:homeAsk.address}):t('Объявление не нужно: закажем уборку. Цену поставите сами, ИИ подскажет.')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Нет, это объявление для сдачи')} onPress={()=>setListing(text)} hitSlop={8}><Text style={q.homeLinkGo}>{t('Нет, это объявление ›')}</Text></Pressable></View>}
   {foot(null,homeAsk?t('Заказать уборку'):t('Далее'),()=>void read(),!text.trim()||uploading,reading?t('ИИ читает рассказ…'):undefined)}
  </View>}

  {asking&&ask&&<View style={q.body}>
   {heading(ask.question,t('В рассказе этого нет.'),questions.length>1?t('Ещё вопросов: {v}',{v:(questions.length-1)}):t('Последний вопрос'))}
   {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}
   {money_(ask.key)?<>
    <View style={q.bigRow}><TextInput accessibilityLabel={ask.label} autoFocus style={[q.big,{width:Math.max(1,(answer?digits(Number(answer)):'0').length)*21+6}]} value={answer?digits(Number(answer)):''} onChangeText={v=>setAnswer(v.replace(/\D/g,'').slice(0,8))} placeholder="0" placeholderTextColor={C.lineStrong} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={reply}/><Text style={q.bigUnit}>₸</Text></View>
    {ask.key==='price'&&!hall&&!!fee&&value>=100&&<View style={q.sum}>
     <View style={q.sumRow}><Text style={q.sumText}>{t('Гость платит')}</Text><Text style={q.sumText}>{money(value)}</Text></View>
     <View style={q.sumRow}><Text style={q.sumMuted}>{free?t('Комиссия сервиса · бесплатный старт'):t('Комиссия сервиса {rate}',{rate:percent(fee.rate)})}</Text><Text style={q.sumMuted}>{cut?'−'+money(cut):money(0)}</Text></View>
     <View style={[q.sumRow,q.sumTotal]}><Text style={q.sumStrong}>{t('Вы получите')}</Text><Text style={q.sumStrong}>{money(value-cut)}</Text></View>
    </View>}
    {ask.key==='price'&&!!hint&&<View style={q.advice}><AiMark/><Text style={q.adviceText}>{hint.stayClass?(hint.low===hint.high?t('Жильё класса «{c}» в городе сдают примерно за {v} ₸ в сутки.',{c:classLabel(hint.stayClass),v:digits(hint.low)}):t('Жильё класса «{c}» в городе сдают за {low}–{high} ₸ в сутки.',{c:classLabel(hint.stayClass),low:digits(hint.low),high:digits(hint.high)})):hint.low===hint.high?t('Похожее жильё в городе сдают примерно за {v} ₸ в сутки.',{v:digits(hint.low)}):t('Похожее жильё в городе сдают за {low}–{high} ₸ в сутки.',{low:digits(hint.low),high:digits(hint.high)})}</Text></View>}
    {ask.key==='cleaningFee'&&<View style={q.chips}><Pressable accessibilityRole="button" onPress={()=>{patch({ownStaff:true});setAnswer('');setError('');}} style={q.chip}><Text style={q.chipText}>{t('Убираем сами')}</Text></Pressable></View>}
   </>:<AddressField kind={ask.key==='address'?'street':'district'} label={ask.label} value={answer} city={String(draft.city||'')} place={place} max={ask.key==='address'?300:120} placeholder={ask.placeholder} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={setAnswer} onPick={c=>{if(ask.key==='address'&&c.district&&!String(draft.district||'').trim())patch({district:c.district});}}/>}
   {foot(toStory,t('Далее'),reply,!answer.trim())}
  </View>}

  {step===1&&!asking&&<View style={q.body}>
   {heading(t('Проверьте объявление'),t('Нажмите на строку, чтобы поправить.'),found.length?t('✓ Всё нужное есть. Из рассказа заполнено: {n}.',{n:found.length}):undefined)}
   {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}
   <View style={q.preview}>
    <View style={[q.cover,!!photos[0]&&q.coverPhoto]}>{photos[0]?<Photo id={photos[0]} alt={t('Обложка')}/>:<Text style={q.coverEmpty}>{t(['Без фото: зал сохранится черновиком','Без фото: объект сохранится черновиком','Без фото: жильё сохранится черновиком'][sort])}</Text>}</View>
    <View style={q.previewBody}><Text style={q.previewTitle}>{draftTitle(draft)}</Text><Text style={q.sub}>{[draft.district||t('Район не указан'),draft.city].filter(Boolean).join(' · ')}</Text><Text style={q.price}>{priceLine||t('Цена не указана')}</Text></View>
   </View>
   <View style={q.rows}>
    {row('title',t('Заголовок'),draftTitle(draft),false,<TitleField kind={draft.type} rooms={draft.rooms} title={draft.title} place={{district:draft.district,city:draft.city}} onChange={v=>patch({title:v})}/>)}
    {row('kind',t('Тип'),[propertyTypes[draft.type as keyof typeof propertyTypes],draft.ownStaff?t('свой персонал'):''].filter(Boolean).join(' · '),guessed('type'),<KindPicker inline kind={draft.type} ownStaff={draft.ownStaff} onChange={v=>{patch(v);if(v.type)setOpen("");}}/>)}
    {!!stayClass&&row('class',t('Класс'),classLabel(stayClass),!chosenClass,<StayClassPicker value={stayClass} guess={classGuess?.stayClass} reasons={classGuess?.reasons} onChange={v=>{setChosenClass(v);setOpen('');}}/>)}
    {row('size',venue?t('Вместимость'):t('Размер'),sizeLine,anyGuess(...(venue?['capacity']:['rooms','capacity','area','floor'])),<>
     <View style={q.grid}>{!venue&&<View style={q.half}><Stepper label={t('Комнаты')} value={draft.rooms} text={String(draft.rooms)} min={1} max={20} onChange={v=>patch({rooms:v})}/></View>}{!car&&<View style={q.half}><Stepper label={bath?t('Вмещает гостей'):t('Гостей')} value={draft.capacity} text={String(draft.capacity)} min={1} max={hall?1000:50} step={hall?10:1} onChange={v=>setDraft(d=>({...d,capacity:v,beds:Math.max(d.beds,v),known:[...new Set([...d.known,'capacity'])]}))}/></View>}</View>
     <View style={q.grid}>{num('area',t('Площадь, м²'),2000)}{!bath&&num('floor',t('Этаж'),100)}{!venue&&num('floors',t('Этажей в доме'),100)}</View>
    </>)}
    {row('address',t('Адрес'),addressLine,anyGuess('address','district'),<>
     <AddressField kind="city" label={t('Город или село')} value={String(draft.city||'')} max={80} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>{setPlace('');patch({city:v});}} onPick={c=>setPlace(c.id||'')}/>
     <AddressField kind="street" label={t('Точный адрес · только для гостя с бронью')} value={String(draft.address||'')} city={String(draft.city||'')} place={place} max={300} placeholder={t('Улица, дом, номер')} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>patch({address:v})} onPick={c=>{if(c.district&&!String(draft.district||'').trim())patch({district:c.district});}}/>
     <AddressField kind="district" label={t('Район')} value={String(draft.district||'')} city={String(draft.city||'')} place={place} max={120} placeholder={t('Например, Центр')} labelStyle={q.tileLabel} inputStyle={q.input} style={q.field} onChange={v=>patch({district:v})}/>
    </>)}
    {row('prices',t('Цены'),[priceLine,draft.deposit?t('депозит {v}',{v:money(draft.deposit)}):''].filter(Boolean).join(' · '),false,<>
     <View style={q.grid}>{hall?<>{num('price',t('На гостя, ₸'),1000000)}{num('leastGuests',t('Минимум гостей'),1000)}</>:bath?<>{num('hourlyPrice',t('Час, ₸'))}{num('minHours',t('Минимум часов'),24)}</>:<>{num('price',t('Сутки, ₸'))}{num('hourlyPrice',t('Час, ₸ · 0 — нет'))}</>}</View>
     {bath&&!car&&<View style={q.grid}>{num('includedGuests',t('Гостей в цене · 0 — все'),50)}{num('extraGuestPrice',t('Доплата за гостя в час, ₸'),1000000)}</View>}
     <View style={q.grid}>{!venue&&num('nightlyPrice',t('Ночь, ₸ · 0 — нет'))}{num('deposit',t('Депозит, ₸'))}</View>
     {heated&&<><Stepper label={t('Подготовка перед гостями')} value={draft.prepMinutes||0} text={draft.prepMinutes?(draft.prepMinutes%60?t('{prepMinutes} мин',{prepMinutes:draft.prepMinutes}):t('{v} ч',{v:draft.prepMinutes/60})):t('не нужна')} min={0} max={360} step={30} onChange={v=>patch({prepMinutes:v})}/>
      <Text style={q.hint}>{draft.prepMinutes?t('Напомню затопить вовремя и не приму бронь, если до гостей осталось меньше.'):t('Сколько нужно, чтобы затопить. Напомню вовремя и не приму бронь раньше.')}</Text></>}
    </>)}
    {row('amenities',t('Удобства'),amenityLine,false,<View style={q.chips}>{categoryAmenities[kindCategory(draft.type)].map(id=>[id,amenities[id]] as [string,string]).map(([id,label])=>{const on=draft.amenities.includes(id);return chip(id,label,on,()=>patch({amenities:on?draft.amenities.filter(a=>a!==id):[...draft.amenities,id]}));})}</View>)}
    {row('rules',t('Правила'),rulesLine,anyGuess(...rules.map(([key])=>key)),<View style={q.chips}>{rules.map(([key,yes])=>chip(key,yes,!!draft[key],()=>patch({[key]:!draft[key]} as Partial<ListingDraft>)))}</View>)}
    {row('entry',venue?t('Как попасть внутрь'):t('Заезд и ключи'),entryLine,anyGuess('checkinMethod'),<>
     {!venue&&<View style={q.grid}><View style={q.half}>{field('checkinTime',t('Заезд с'),'14:00',5)}</View><View style={q.half}>{field('checkoutTime',t('Выезд до'),'12:00',5)}</View></View>}
     <Text style={q.tileLabel}>{venue?t('Как гости попадут внутрь'):t('Как гость получит ключи')}</Text><View style={q.chips}>{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,draft.checkinMethod===id,()=>patch({checkinMethod:id}),true))}</View>
    </>)}
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
   {mode==='auto'&&!draft.ownStaff&&draft.cleaningFee>=100&&<View style={q.grid}>{num('cleaningFee',t('Уборка после гостя, ₸'),1000000)}</View>}
   {/* A line cleared while fixing it brings its question back: «Далее» asks it, nothing is saved half-filled. */}
   {foot(toStory,questions.length?t('Далее'):photos.length?t('Опубликовать'):t('Сохранить черновик'),()=>{if(questions.length){setChecking(false);onTop?.();}else void save();},uploading,busy?t('Сохраняем…'):undefined)}
  </View>}

  {step===2&&saved&&<View style={q.body}>
   <View style={q.doneMark}><Text style={q.doneMarkText}>✓</Text></View>
   {heading(draftTitle(draft),saved.message,(saved.placed?t('Метку на карте ИИ поставил сам по адресу.')+' ':'')+(mode==='auto'?t('Гостям отвечает ИИ: он подтвердит бронь по вашим ценам и закажет уборку.'):t('Запросы гостей будут приходить вам.')))}
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
 next:{minHeight:H.primary,minWidth:132,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24},nextOff:{backgroundColor:C.lineStrong},
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
 doneMark:{width:56,height:56,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center'},doneMarkText:{color:C.onAccent,...type.title,fontWeight:'600'}
});
