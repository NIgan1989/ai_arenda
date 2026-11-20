import {L,forms,t} from '../../lib/i18n';
// Adding a flat in the app: the owner tells the AI about it in one message, then checks the card the AI filled.
// The AI asks only what it could not read (address, district, daily price), one question at a time.
// Same reading as on the site: lib/listing-draft.ts.
import {homeAskFromText,type HomeAsk} from '../../lib/home-ask';
import React,{useMemo,useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {C,type,brandFont} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {PhotoGrid} from './PhotoGrid';
import {Stepper} from './SheetParts';
import {amenities,categoryAmenities,checkinMethods,isBath,kindCategory} from '../../lib/listings';
import {KindPicker} from './KindPicker';
import {needsReview,reviewRequest} from '../../lib/listing-edit';
import {DRAFT_EXAMPLE,DRAFT_EXAMPLE_BATH,answerDraft,draftDescription,draftListingBody,draftQuestions,draftRules,draftTitle,emptyDraft,moneyAnswer,readListingText,type ListingDraft} from '../../lib/listing-draft';
import {plural} from '../../lib/map-search-request';
type Row=Record<string,any>;
type Saved={id:string;message:string;published:boolean;placed?:boolean};
const R=T.radius,H=T.control;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const STEPS=L(['Расскажите','Проверьте','Готово']);
const RULES:[keyof ListingDraft,string][]=L([['pets','Можно с питомцами'],['smoking','Можно курить'],['parties','Можно вечеринки']]);

export function PropertyQuick({city,onSave,onGuestMode,onPlace,onReview,onClose,onMap,onDone,onHome}:{city:string;onHome?:(ask?:HomeAsk)=>void;onSave:(body:Row)=>Promise<Row>;onGuestMode:(body:Row)=>Promise<unknown>;onPlace?:(body:Row)=>Promise<unknown>;onReview?:(body:Row)=>Promise<unknown>;onClose:()=>void;onMap?:(id:string)=>void;onDone:(saved:Saved)=>void}){
 const [step,setStep]=useState(0),[text,setText]=useState(''),[draft,setDraft]=useState<ListingDraft>(()=>emptyDraft(city)),[found,setFound]=useState<string[]>([]);
 const [photos,setPhotos]=useState<string[]>([]),[uploading,setUploading]=useState(false),[answer,setAnswer]=useState(''),[mode,setMode]=useState<'auto'|'manual'>('auto'),[more,setMore]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const questions=useMemo(()=>{const q:{key:string;label:string;question:string;placeholder:string}[]=draftQuestions(draft);return !draft.ownStaff&&!(draft.cleaningFee>=100)?[...q,{key:'cleaningFee',label:t('Уборка'),question:t('Сколько платите исполнителю за уборку после гостей? Без цены уборку после выезда не заказать. Убираете сами или свой персонал, напишите «сами».'),placeholder:t('Например, 3 000 или «сами»')}]:q;},[draft,mode]);
 const ask=questions[0];
 const patch=(value:Partial<ListingDraft>)=>setDraft(d=>({...d,...value,known:[...new Set([...d.known,...Object.keys(value)])]}));
 const guessed=(key:string)=>!draft.known.includes(key);
 // Не объявление, а уборка своего жилья (lib/home-ask.ts): форма ведёт в заказ уборки с тем, что уже понято из текста.
 // «Нет, это объявление»: человек сам решает, если ИИ ошибся. Новый текст спрашивает заново.
 const [listing,setListing]=useState('');
 const homeAsk=useMemo(()=>onHome&&listing!==text?homeAskFromText(text):null,[text,onHome,listing]);
 function read(){if(!text.trim())return;if(homeAsk&&onHome){onHome(homeAsk);return;}const r=readListingText(text,draft);setDraft(r.draft);setFound(r.found);setError('');setStep(1);}
 function reply(){if(!ask||!answer.trim())return;
  // «Сами», «сам убираю», «свой персонал»: nobody is ordered, the owner marks the place ready himself.
  if(ask.key==='cleaningFee'){const v=moneyAnswer(answer);if(v>=100)patch({cleaningFee:v});else if(/(?:^|[^а-я])(?:сам[аи]?|сво[йиея][а-я]*\s+(?:персонал|горничн|уборщ|сотрудник))(?=$|[^а-я])/i.test(answer)||/өзім|өз\s+қызметкер|ourselves|myself|own\s+staff/i.test(answer))patch({ownStaff:true});else{setError(t('Напишите сумму числом, от 100 ₸, или «сами».'));return;}}
  else setDraft(d=>answerDraft(d,ask.key as 'address'|'district'|'price',answer));
  setAnswer('');setError('');}
 async function save(){
  if(busy||uploading||questions.length)return;setBusy(true);setError('');
  try{
   let result:Row,published=photos.length>0,review=false;
   try{result=await onSave(draftListingBody(draft,photos,published));}
   catch(e:any){if(!published||!/провер|допуск/i.test(String(e?.message)))throw e;published=false;result=await onSave(draftListingBody(draft,photos,false));
    if(onReview&&needsReview(String(e?.message))){try{await onReview(reviewRequest({id:result.id,title:draftTitle(draft),city:draft.city,address:draft.address}));review=true;}catch{/* the owner can still ask from «Допуск» */}}}
   // The flat goes on the map by its address right away; the owner only checks the pin.
   let placed=false;try{placed=!!((await onPlace?.({propertyId:result.id})) as Row|undefined)?.saved;}catch{/* the map pin can be set later */}
   let note='';try{await onGuestMode({propertyId:result.id,mode,cleaningFee:!draft.ownStaff&&draft.cleaningFee>=100?draft.cleaningFee:undefined});}catch(e:any){note=' '+(e?.message||'');}
   setSaved({id:result.id,published,placed,message:(published?t(['Зал опубликован, гости уже видят его на карте.','Объект опубликован, гости уже видят его на карте.','Жильё опубликовано, гости уже видят его на карте.'][sort]):review?t('Сохранено черновиком и отправлено на проверку администратору: после проверки появится на карте само.'):photos.length?t('Сохранено черновиком: чтобы показать гостям, пройдите проверку в «Управление → Допуск».'):t('Сохранено черновиком. Добавьте фото, и его можно будет показать гостям.'))+note});setStep(2);
  }catch(e:any){setError(e?.message||t(['Не удалось сохранить зал.','Не удалось сохранить объект.','Не удалось сохранить жильё.'][sort]));}finally{setBusy(false);}
 }
 // A banquet hall: `price` is the price per guest, with the least party (lib/listing-draft.ts).
 const hall=['banquet','cafe'].includes(draft.type),bath=isBath(draft.type),venue=hall||bath;
 // A bath or a hall is not «жильё»: the screen names what the owner adds.
 const sort=hall?0:bath?1:2,guess=(label:string,key:string)=>guessed(key)?t('{label} · ИИ предположил',{label}):label;
 const priceLine=hall?(draft.price>=100?t('{v} за гостя',{v:money(draft.price)}):''):bath?(draft.hourlyPrice>=100?t('{v} / час · от {minHours} ч',{v:money(draft.hourlyPrice),minHours:draft.minHours}):''):[draft.price>=100&&t('{v} / сутки',{v:money(draft.price)}),draft.hourlyPrice>=100&&t('{v} / час',{v:money(draft.hourlyPrice)}),draft.nightlyPrice>=100&&t('{v} / ночь',{v:money(draft.nightlyPrice)})].filter(Boolean).join(' · ');
 const chip=(key:string,label:string,on:boolean,onPress:()=>void,radio=false)=><Pressable key={key} accessibilityRole={radio?'radio':'checkbox'} accessibilityState={{checked:on}} onPress={onPress} style={[q.chip,on&&q.chipOn]}><Text style={[q.chipText,on&&q.chipTextOn]}>{on&&!radio?'✓ ':''}{label}</Text></Pressable>;
 const num=(key:keyof ListingDraft,label:string,max=10000000)=><View style={q.tile} key={key}><Text style={q.tileLabel}>{label}{guessed(key)&&!['price','hourlyPrice','nightlyPrice','deposit'].includes(key)?<Text style={q.guess}>{' '}{t('ИИ предположил')}</Text>:null}</Text><TextInput accessibilityLabel={label} style={q.tileValue} keyboardType="number-pad" value={draft[key]?String(draft[key]):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={v=>patch({[key]:Math.min(max,Number(v.replace(/[^\d]/g,''))||0)} as Partial<ListingDraft>)}/></View>;
 const field=(key:keyof ListingDraft,label:string,placeholder='',max=120)=><View key={key} style={q.field}><Text style={q.tileLabel}>{label}</Text><TextInput accessibilityLabel={label} style={q.input} value={String(draft[key]||'')} placeholder={placeholder} placeholderTextColor={C.muted} maxLength={max} onChangeText={v=>patch({[key]:v} as Partial<ListingDraft>)}/></View>;

 return <View style={q.sheet}>
  <View style={q.head}><View style={q.orb}><Text style={q.orbText}>✦</Text></View><View style={{flex:1}}><Text accessibilityRole="header" style={q.title}>{step===0?t('Новый объект'):hall?t('Новый зал'):bath?(draft.type==='sauna'?t('Новая сауна'):t('Новая баня')):t('Новое жильё')}</Text><Text style={q.sub}>{[t('ИИ заполнит объявление по вашему рассказу'),t('ИИ заполнил карточку. Проверьте и поправьте'),t(['Зал добавлен','Объект добавлен','Жильё добавлено'][sort])][step]}</Text></View>{step<2&&<Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} disabled={busy} style={q.close}><Text style={q.closeText}>✕</Text></Pressable>}</View>
  <View style={q.steps} accessibilityLabel={t('Шаг {v} из 3',{v:(step+1)})}>{STEPS.map((label,i)=><View key={label} style={q.stepItem}><View style={[q.stepBar,i<step&&q.stepDone,i===step&&q.stepNow]}/><Text style={[q.stepText,i===step&&q.stepTextNow]}>{label}</Text></View>)}</View>
  {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}

  {step===0&&<View style={q.body}>
   <View style={q.line}><TextInput accessibilityLabel={t('Расскажите об объекте')} style={q.lineInput} multiline value={text} onChangeText={setText} maxLength={2000} placeholder={t('Например: однушка на Торайгырова 64, 4 этаж, до 3 гостей, есть Wi-Fi и стиралка, 15 000 в сутки, 2 500 в час')} placeholderTextColor={C.muted} textAlignVertical="top"/>
    <View style={q.lineBar}><View style={q.grid}><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE)} style={q.chip}><Text style={q.chipText}>{t('Пример: жильё')}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE_BATH)} style={q.chip}><Text style={q.chipText}>{t('Пример: баня')}</Text></Pressable></View><Text style={q.hint}>{text.length?text.length+' / 2000':''}</Text></View></View>
   <PhotoGrid photos={photos} onChange={setPhotos} onBusy={setUploading}/>
   <Text style={q.hint}>{t('Жильё, баня, сауна или зал: ИИ поймёт тип, гостей, цены, удобства, правила и адрес. Порядок не важен, фото можно добавить и потом.')}</Text>
   {!!onHome&&!homeAsk&&<Pressable accessibilityRole="button" accessibilityLabel={t('Не сдаёте жильё, нужна только уборка? Заказать уборку дома')} onPress={()=>onHome()} style={({pressed})=>[q.homeLink,pressed&&{opacity:.55}]}><Text style={q.homeLinkText}>{t('Не сдаёте, нужна только уборка?')}{' '}<Text style={q.homeLinkGo}>{t('Заказать уборку дома ›')}</Text></Text></Pressable>}
   {!!homeAsk&&<View accessibilityLiveRegion="polite" style={q.homeAsk}><Text style={q.homeAskTitle}>{t('Похоже, вам нужна уборка своего жилья')}</Text><Text style={q.homeAskText}>{homeAsk.address?t('Объявление не нужно: закажем уборку по адресу {address}. Цену поставите сами, ИИ подскажет.',{address:homeAsk.address}):t('Объявление не нужно: закажем уборку. Цену поставите сами, ИИ подскажет.')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Нет, это объявление для сдачи')} onPress={()=>setListing(text)} hitSlop={8}><Text style={q.homeLinkGo}>{t('Нет, это объявление ›')}</Text></Pressable></View>}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:!text.trim()||uploading}} disabled={!text.trim()||uploading} onPress={read} style={[q.primary,(!text.trim()||uploading)&&q.primaryOff]}><Text style={q.primaryText}>{homeAsk?t('✦  Заказать уборку'):t('✦  Заполнить с ИИ')}</Text></Pressable>
  </View>}

  {step===1&&<View style={q.body}>
   {ask?<View style={q.ask}><View style={[q.orb,q.orbSm]}><Text style={q.orbTextSm}>✦</Text></View><View style={{flex:1,minWidth:0,gap:8}}><Text style={q.askQ}>{ask.question}</Text><Text style={q.hint}>{questions.length>1?t('Ещё вопросов: {v}',{v:(questions.length-1)}):t('Последний вопрос')}</Text>
     <View style={q.askRow}><TextInput accessibilityLabel={ask.label} style={q.askInput} value={answer} onChangeText={setAnswer} placeholder={ask.placeholder} placeholderTextColor={C.muted} onSubmitEditing={reply} returnKeyType="send" keyboardType={ask.key==='price'||ask.key==='cleaningFee'?'number-pad':'default'}/><Pressable accessibilityRole="button" disabled={!answer.trim()} onPress={reply} style={[q.send,!answer.trim()&&q.primaryOff]}><Text style={q.primaryText}>↑</Text></Pressable></View></View></View>
   :<Text style={q.ready}>{found.length?t(forms(found.length,'✓ Всё нужное есть. ИИ понял из рассказа: {n} деталь.','✓ Всё нужное есть. ИИ понял из рассказа: {n} детали.','✓ Всё нужное есть. ИИ понял из рассказа: {n} деталей.'),{n:found.length}):t('✓ Всё нужное есть.')}</Text>}
   <View style={q.preview}>
    <View style={q.cover}>{photos[0]?<Photo id={photos[0]} alt={t('Обложка')}/>:<Text style={q.coverEmpty}>{t(['Без фото: зал сохранится черновиком','Без фото: объект сохранится черновиком','Без фото: жильё сохранится черновиком'][sort])}</Text>}</View>
    <View style={q.previewBody}><TextInput accessibilityLabel={t('Название')} style={q.previewTitle} value={draftTitle(draft)} maxLength={120} onChangeText={v=>patch({title:v})}/><Text style={q.sub}>📍 {[draft.district||t('Район не указан'),draft.city].filter(Boolean).join(' · ')}</Text><Text style={q.price}>{priceLine||t('Цена не указана')}</Text></View>
   </View>
   <Text style={q.h}>{venue?t('ОБЪЕКТ'):t('ЖИЛЬЁ')}</Text>
   <KindPicker kind={draft.type} ownStaff={draft.ownStaff} onChange={v=>patch(v)}/>
   <View style={q.grid}>{!venue&&<View style={q.half}><Stepper label={guess(t('Комнаты'),'rooms')} value={draft.rooms} text={String(draft.rooms)} min={1} max={20} onChange={v=>patch({rooms:v})}/></View>}<View style={q.half}><Stepper label={guess(bath?t('Вмещает гостей'):t('Гостей'),'capacity')} value={draft.capacity} text={String(draft.capacity)} min={1} max={hall?1000:50} step={hall?10:1} onChange={v=>setDraft(d=>({...d,capacity:v,beds:Math.max(d.beds,v),known:[...new Set([...d.known,'capacity'])]}))}/></View></View>
   <View style={q.grid}>{num('area',t('Площадь, м²'),2000)}{!bath&&num('floor',t('Этаж'),100)}</View>
   {field('address',t('Точный адрес · только для гостя с бронью'),t('Улица, дом, номер'),300)}
   <View style={q.grid}><View style={q.half}>{field('district',t('Район'),t('Например, Центр'))}</View><View style={q.half}>{field('city',t('Город'),'',80)}</View></View>
   <Text style={q.h}>{t('ЦЕНЫ')}</Text>
   <View style={q.grid}>{hall?<>{num('price',t('На гостя, ₸'),1000000)}{num('leastGuests',t('Минимум гостей'),1000)}</>:bath?<>{num('hourlyPrice',t('Час, ₸'))}{num('minHours',t('Минимум часов'),24)}</>:<>{num('price',t('Сутки, ₸'))}{num('hourlyPrice',t('Час, ₸ · 0 — нет'))}</>}</View>
   {bath&&<>
    <View style={q.grid}>{num('includedGuests',t('Гостей в цене · 0 — все'),50)}{num('extraGuestPrice',t('Доплата за гостя в час, ₸'),1000000)}</View>
    <Stepper label={t('Подготовка перед гостями')} value={draft.prepMinutes||0} text={draft.prepMinutes?(draft.prepMinutes%60?t('{prepMinutes} мин',{prepMinutes:draft.prepMinutes}):t('{v} ч',{v:draft.prepMinutes/60})):t('не нужна')} min={0} max={360} step={30} onChange={v=>patch({prepMinutes:v})}/>
    <Text style={q.hint}>{draft.prepMinutes?t('Напомню затопить вовремя и не приму бронь, если до гостей осталось меньше.'):t('Сколько нужно, чтобы затопить. Напомню вовремя и не приму бронь раньше.')}</Text>
   </>}
   <Text style={q.h}>{t('УДОБСТВА')}</Text>
   <View style={q.chips}>{categoryAmenities[kindCategory(draft.type)].map(id=>[id,amenities[id]] as [string,string]).map(([id,label])=>{const on=draft.amenities.includes(id);return chip(id,label,on,()=>patch({amenities:on?draft.amenities.filter(a=>a!==id):[...draft.amenities,id]}));})}</View>
   <Text style={q.h}>{t('ПРАВИЛА')}</Text>
   <View style={q.chips}>{RULES.filter(([key])=>!venue||key==='smoking').map(([key,label])=>chip(key,label,!!draft[key],()=>patch({[key]:!draft[key]} as Partial<ListingDraft>)))}</View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:more}} onPress={()=>setMore(v=>!v)} style={q.moreBtn}><Text style={q.moreText}>{more?t('Скрыть подробности'):venue?t('Ещё: депозит, встреча гостей, текст объявления'):t('Ещё: ночь, депозит, заезд, текст объявления')}</Text></Pressable>
   {more&&<View style={q.body}>
    <View style={q.grid}>{!venue&&num('nightlyPrice',t('Ночь, ₸ · 0 — нет'))}{num('deposit',t('Депозит, ₸'))}</View>
    {!venue&&<View style={q.grid}><View style={q.half}>{field('checkinTime',t('Заезд с'),'14:00',5)}</View><View style={q.half}>{field('checkoutTime',t('Выезд до'),'12:00',5)}</View></View>}
    <Text style={q.tileLabel}>{venue?t('Как гости попадут внутрь'):t('Как гость получит ключи')}</Text><View style={q.chips}>{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,draft.checkinMethod===id,()=>patch({checkinMethod:id}),true))}</View>
    <View style={q.field}><Text style={q.tileLabel}>{t('Описание · ИИ написал сам')}</Text><TextInput accessibilityLabel={t('Описание')} multiline style={[q.input,q.area]} value={draftDescription(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,description:v}))}/></View>
    <View style={q.field}><Text style={q.tileLabel}>{venue?t('Правила'):t('Правила проживания')}</Text><TextInput accessibilityLabel={venue?t('Правила'):t('Правила проживания')} multiline style={[q.input,q.area]} value={draftRules(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,houseRules:v}))}/></View>
   </View>}
   <Text style={q.h}>{t('КТО ОТВЕЧАЕТ ГОСТЯМ')}</Text>
   <View style={q.grid} accessibilityRole="radiogroup">
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='auto'}} onPress={()=>setMode('auto')} style={[q.mode,mode==='auto'&&q.modeOn]}><Text style={q.modeTitle}>{t('✦ ИИ')}</Text><Text style={q.hint}>{draft.ownStaff?t('Отвечает за минуту и подтверждает бронь'):t('Отвечает за минуту, подтверждает бронь и заказывает уборку')}</Text></Pressable>
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='manual'}} onPress={()=>setMode('manual')} style={[q.mode,mode==='manual'&&q.modeOn]}><Text style={q.modeTitle}>{t('Я сам')}</Text><Text style={q.hint}>{t('Запросы приходят вам, вы решаете')}</Text></Pressable>
   </View>
   {mode==='auto'&&!draft.ownStaff&&draft.cleaningFee>=100&&<View style={q.grid}>{num('cleaningFee',t('Уборка после гостя, ₸'),1000000)}</View>}
   <View style={q.actions}><Pressable accessibilityRole="button" onPress={()=>setStep(0)} disabled={busy} style={q.ghost}><Text style={q.ghostText}>{t('← Назад')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{disabled:busy||uploading||!!questions.length}} disabled={busy||uploading||!!questions.length} onPress={save} style={[q.primary,{flex:1},(busy||uploading||!!questions.length)&&q.primaryOff]}><Text style={q.primaryText}>{busy?t('Сохраняю…'):photos.length?t('Опубликовать'):t('Сохранить черновик')}</Text></Pressable></View>
  </View>}

  {step===2&&saved&&<View style={[q.body,{alignItems:'center'}]}>
   <View style={q.doneMark}><Text style={q.doneMarkText}>✓</Text></View>
   <Text style={[q.title,{textAlign:'center'}]}>{draftTitle(draft)}</Text><Text style={[q.sub,{textAlign:'center'}]}>{saved.message}</Text>
   <Text style={[q.hint,{textAlign:'center'}]}>{(saved.placed?t('Метку на карте ИИ поставил сам по адресу.')+' ':'')+(mode==='auto'?t('Гостям отвечает ИИ: он подтвердит бронь по вашим ценам и закажет уборку.'):t('Запросы гостей будут приходить вам.'))}</Text>
   {onMap&&<Pressable accessibilityRole="button" onPress={()=>onMap(saved.id)} style={[q.primary,{alignSelf:'stretch'}]}><Text style={q.primaryText}>{saved.placed?t('Метка по адресу: посмотреть'):t('Показать на карте')}</Text></Pressable>}
   <Pressable accessibilityRole="button" onPress={()=>onDone(saved)} style={[onMap?q.ghost:q.primary,{alignSelf:'stretch'}]}><Text style={onMap?q.ghostText:q.primaryText}>{t('Готово')}</Text></Pressable>
  </View>}
 </View>;
}

const q=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:16,borderWidth:1,borderColor:C.line,shadowColor:C.aiFrom,shadowOpacity:.18,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:4},
 head:{flexDirection:'row',alignItems:'center',gap:12},
 orb:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:C.accentLine},
 orbSm:{width:32,height:32,borderWidth:2},
 orbText:{color:C.onAccent,...type.subtitle,fontWeight:'700'},orbTextSm:{color:C.onAccent,...type.label,fontWeight:'700'},
 title:{color:C.ink,...type.subtitle,...brandFont},sub:{color:C.muted,...type.label},
 close:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},closeText:{color:C.inkSoft,...type.subtitle},
 steps:{flexDirection:'row',gap:8},stepItem:{flex:1,gap:4},stepBar:{height:4,borderRadius:R.full,backgroundColor:C.line},stepNow:{backgroundColor:C.gold},stepDone:{backgroundColor:C.night},
 stepText:{color:C.muted,...type.caption,fontWeight:'600'},stepTextNow:{color:C.ink},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label},
 body:{gap:12},
 line:{borderWidth:2,borderColor:C.aiFrom,borderRadius:R.lg,backgroundColor:C.surface,overflow:'hidden'},
 lineInput:{minHeight:136,padding:16,color:C.ink,...type.body},
 lineBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:12,paddingBottom:12},
 hint:{color:C.muted,...type.caption},
 homeLink:{paddingVertical:8},homeAsk:{gap:4,padding:12,borderRadius:R.lg,backgroundColor:C.accentSoft},homeAskTitle:{color:C.accentPressed,...type.label,fontWeight:'700'},homeAskText:{color:C.inkSoft,...type.caption},homeLinkText:{color:C.inkSoft,...type.label},homeLinkGo:{color:C.accentPressed,fontWeight:'600'},
 photos:{flexDirection:'row',flexWrap:'wrap',gap:8},photo:{width:88,height:88,borderRadius:R.md,overflow:'hidden'},
 photoX:{position:'absolute',top:4,right:4,width:24,height:24,borderRadius:R.full,backgroundColor:C.scrim,alignItems:'center',justifyContent:'center'},photoXText:{color:C.onAccent,...type.caption},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24},primaryOff:{backgroundColor:C.lineStrong},
 primaryText:{color:C.onAccent,...type.body,fontWeight:'700'},
 ghost:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center',paddingHorizontal:20},ghostText:{color:C.ink,...type.body,fontWeight:'700'},
 preview:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,overflow:'hidden'},
 cover:{aspectRatio:16/9,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},coverEmpty:{color:C.accent,...type.label,fontWeight:'600',textAlign:'center',padding:16},
 previewBody:{padding:12,gap:4},previewTitle:{color:C.ink,...type.subtitle,fontWeight:'700',padding:0},price:{color:C.accent,...type.body,fontWeight:'700'},
 ask:{flexDirection:'row',gap:12,padding:16,borderRadius:R.lg,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine},
 askQ:{color:C.ink,...type.body,fontWeight:'600'},askRow:{flexDirection:'row',gap:8},
 askInput:{flex:1,minWidth:0,minHeight:H.field,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,paddingHorizontal:16,color:C.ink,...type.body},
 send:{width:H.field,height:H.field,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},
 ready:{color:C.success,backgroundColor:C.successSoft,borderRadius:R.md,padding:12,...type.label,fontWeight:'600'},
 h:{color:C.muted,...type.caption,fontWeight:'700',letterSpacing:.8,marginTop:8},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.accent,borderColor:C.accent},chipText:{color:C.inkSoft,...type.label},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 grid:{flexDirection:'row',gap:8},half:{flex:1},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'space-between'},
 tileLabel:{color:C.muted,...type.caption,fontWeight:'600'},guess:{color:C.warning,...type.caption},
 tileValue:{color:C.ink,...type.subtitle,fontWeight:'700',padding:0},
 field:{gap:4},input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:112,textAlignVertical:'top',...type.label},
 moreBtn:{minHeight:H.field,justifyContent:'center'},moreText:{color:C.accent,...type.label,fontWeight:'600'},
 mode:{flex:1,padding:12,borderRadius:R.lg,borderWidth:2,borderColor:C.line,backgroundColor:C.surface,gap:4},modeOn:{borderColor:C.aiFrom,backgroundColor:C.accentSoft},
 modeTitle:{color:C.ink,...type.body,fontWeight:'700'},
 actions:{flexDirection:'row',gap:12,marginTop:8},
 doneMark:{width:64,height:64,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center'},doneMarkText:{color:C.onAccent,...type.heading,fontWeight:'700'}
});
