// Adding a flat in the app: the owner tells the AI about it in one message, then checks the card the AI filled.
// The AI asks only what it could not read (address, district, daily price), one question at a time.
// Same reading as on the site: lib/listing-draft.ts.
import React,{useMemo,useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo,PhotoUpload} from './ListingMedia';
import {Stepper} from './SheetParts';
import {amenities,checkinMethods,propertyTypes} from '../../lib/listings';
import {DRAFT_EXAMPLE,answerDraft,draftDescription,draftListingBody,draftQuestions,draftRules,draftTitle,emptyDraft,readListingText,type ListingDraft} from '../../lib/listing-draft';
import {plural} from '../../lib/map-search-request';
type Row=Record<string,any>;
type Saved={id:string;message:string;published:boolean};
const R=T.radius,H=T.control;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const STEPS=['Расскажите','Проверьте','Готово'];
const RULES:[keyof ListingDraft,string][]=[['pets','Можно с питомцами'],['smoking','Можно курить'],['parties','Можно вечеринки']];

export function PropertyQuick({city,onSave,onGuestMode,onClose,onMap,onDone}:{city:string;onSave:(body:Row)=>Promise<Row>;onGuestMode:(body:Row)=>Promise<unknown>;onClose:()=>void;onMap?:(id:string)=>void;onDone:(saved:Saved)=>void}){
 const [step,setStep]=useState(0),[text,setText]=useState(''),[draft,setDraft]=useState<ListingDraft>(()=>emptyDraft(city)),[found,setFound]=useState<string[]>([]);
 const [photos,setPhotos]=useState<string[]>([]),[uploading,setUploading]=useState(false),[answer,setAnswer]=useState(''),[mode,setMode]=useState<'auto'|'manual'>('auto'),[more,setMore]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const questions=useMemo(()=>{const q:{key:string;label:string;question:string;placeholder:string}[]=draftQuestions(draft);return mode==='auto'&&!(draft.cleaningFee>=100)?[...q,{key:'cleaningFee',label:'Уборка',question:'Сколько вы платите за уборку после гостя? ИИ будет заказывать её сам.',placeholder:'Например, 3 000'}]:q;},[draft,mode]);
 const ask=questions[0];
 const patch=(value:Partial<ListingDraft>)=>setDraft(d=>({...d,...value,known:[...new Set([...d.known,...Object.keys(value)])]}));
 const guessed=(key:string)=>!draft.known.includes(key);
 function read(){if(!text.trim())return;const r=readListingText(text,draft);setDraft(r.draft);setFound(r.found);setError('');setStep(1);}
 function reply(){if(!ask||!answer.trim())return;
  if(ask.key==='cleaningFee'){const v=Number(answer.replace(/[^\d]/g,''))*(/тыс|\dк/i.test(answer)?1000:1);if(v>=100)patch({cleaningFee:v});else{setError('Напишите сумму числом, от 100 ₸.');return;}}
  else setDraft(d=>answerDraft(d,ask.key as 'address'|'district'|'price',answer));
  setAnswer('');setError('');}
 async function save(){
  if(busy||uploading||questions.length)return;setBusy(true);setError('');
  try{
   let result:Row,published=photos.length>0;
   try{result=await onSave(draftListingBody(draft,photos,published));}
   catch(e:any){if(!published||!/провер|допуск/i.test(String(e?.message)))throw e;published=false;result=await onSave(draftListingBody(draft,photos,false));}
   let note='';try{await onGuestMode({propertyId:result.id,mode,cleaningFee:mode==='auto'?draft.cleaningFee:undefined});}catch(e:any){note=' '+(e?.message||'');}
   setSaved({id:result.id,published,message:(published?'Квартира опубликована, гости уже видят её на карте.':photos.length?'Сохранена черновиком: чтобы показать гостям, пройдите проверку допуска.':'Сохранена черновиком. Добавьте фото, и её можно будет показать гостям.')+note});setStep(2);
  }catch(e:any){setError(e?.message||'Не удалось сохранить квартиру.');}finally{setBusy(false);}
 }
 const priceLine=[draft.price>=100&&money(draft.price)+' / сутки',draft.hourlyPrice>=100&&money(draft.hourlyPrice)+' / час',draft.nightlyPrice>=100&&money(draft.nightlyPrice)+' / ночь'].filter(Boolean).join(' · ');
 const chip=(key:string,label:string,on:boolean,onPress:()=>void,radio=false)=><Pressable key={key} accessibilityRole={radio?'radio':'checkbox'} accessibilityState={{checked:on}} onPress={onPress} style={[q.chip,on&&q.chipOn]}><Text style={[q.chipText,on&&q.chipTextOn]}>{on&&!radio?'✓ ':''}{label}</Text></Pressable>;
 const num=(key:keyof ListingDraft,label:string,max=10000000)=><View style={q.tile} key={key}><Text style={q.tileLabel}>{label}{guessed(key)&&!['price','hourlyPrice','nightlyPrice','deposit'].includes(key)?<Text style={q.guess}>  ИИ предположил</Text>:null}</Text><TextInput accessibilityLabel={label} style={q.tileValue} keyboardType="number-pad" value={draft[key]?String(draft[key]):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={v=>patch({[key]:Math.min(max,Number(v.replace(/[^\d]/g,''))||0)} as Partial<ListingDraft>)}/></View>;
 const field=(key:keyof ListingDraft,label:string,placeholder='',max=120)=><View key={key} style={q.field}><Text style={q.tileLabel}>{label}</Text><TextInput accessibilityLabel={label} style={q.input} value={String(draft[key]||'')} placeholder={placeholder} placeholderTextColor={C.muted} maxLength={max} onChangeText={v=>patch({[key]:v} as Partial<ListingDraft>)}/></View>;

 return <View style={q.sheet}>
  <View style={q.head}><View style={q.orb}><Text style={q.orbText}>✦</Text></View><View style={{flex:1}}><Text accessibilityRole="header" style={q.title}>Новая квартира</Text><Text style={q.sub}>{['ИИ заполнит объявление по вашему рассказу','ИИ заполнил карточку. Проверьте и поправьте','Квартира добавлена'][step]}</Text></View>{step<2&&<Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} disabled={busy} style={q.close}><Text style={q.closeText}>✕</Text></Pressable>}</View>
  <View style={q.steps} accessibilityLabel={'Шаг '+(step+1)+' из 3'}>{STEPS.map((label,i)=><View key={label} style={q.stepItem}><View style={[q.stepBar,i<step&&q.stepDone,i===step&&q.stepNow]}/><Text style={[q.stepText,i===step&&q.stepTextNow]}>{label}</Text></View>)}</View>
  {!!error&&<Text accessibilityRole="alert" style={q.error}>{error}</Text>}

  {step===0&&<View style={q.body}>
   <View style={q.line}><TextInput accessibilityLabel="Расскажите о квартире" style={q.lineInput} multiline value={text} onChangeText={setText} maxLength={2000} placeholder="Например: однушка на Торайгырова 64, 4 этаж, до 3 гостей, есть Wi-Fi и стиралка, 15 000 в сутки, 2 500 в час" placeholderTextColor={C.muted} textAlignVertical="top"/>
    <View style={q.lineBar}><Pressable accessibilityRole="button" onPress={()=>setText(DRAFT_EXAMPLE)} style={q.chip}><Text style={q.chipText}>Пример</Text></Pressable><Text style={q.hint}>{text.length?text.length+' / 2000':'Порядок не важен'}</Text></View></View>
   {photos.length>0&&<View style={q.photos}>{photos.map((id,i)=><View key={id} style={q.photo}><Photo id={id} alt={'Фото '+(i+1)}/><Pressable accessibilityRole="button" accessibilityLabel={'Убрать фото '+(i+1)} onPress={()=>setPhotos(v=>v.filter(x=>x!==id))} style={q.photoX}><Text style={q.photoXText}>✕</Text></Pressable></View>)}</View>}
   <PhotoUpload kind="property" onBusy={setUploading} disabled={photos.length>=8} onAdd={id=>setPhotos(v=>v.length<8&&!v.includes(id)?[...v,id]:v)}/>
   <Text style={q.hint}>ИИ поймёт комнаты, этаж, площадь, гостей, цены за сутки и час, удобства, правила и адрес. Фото можно добавить и потом.</Text>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:!text.trim()||uploading}} disabled={!text.trim()||uploading} onPress={read} style={[q.primary,(!text.trim()||uploading)&&q.primaryOff]}><Text style={q.primaryText}>✦  Заполнить с ИИ</Text></Pressable>
  </View>}

  {step===1&&<View style={q.body}>
   <View style={q.preview}>
    <View style={q.cover}>{photos[0]?<Photo id={photos[0]} alt="Обложка"/>:<Text style={q.coverEmpty}>Без фото: квартира сохранится черновиком</Text>}</View>
    <View style={q.previewBody}><TextInput accessibilityLabel="Название" style={q.previewTitle} value={draftTitle(draft)} maxLength={120} onChangeText={v=>patch({title:v})}/><Text style={q.sub}>📍 {[draft.district||'Район не указан',draft.city].filter(Boolean).join(' · ')}</Text><Text style={q.price}>{priceLine||'Цена не указана'}</Text></View>
   </View>
   {ask?<View style={q.ask}><View style={[q.orb,q.orbSm]}><Text style={q.orbTextSm}>✦</Text></View><View style={{flex:1,minWidth:0,gap:8}}><Text style={q.askQ}>{ask.question}</Text><Text style={q.hint}>{questions.length>1?'Ещё вопросов: '+(questions.length-1):'Последний вопрос'}</Text>
     <View style={q.askRow}><TextInput accessibilityLabel={ask.label} style={q.askInput} value={answer} onChangeText={setAnswer} placeholder={ask.placeholder} placeholderTextColor={C.muted} onSubmitEditing={reply} returnKeyType="send" keyboardType={ask.key==='price'||ask.key==='cleaningFee'?'number-pad':'default'}/><Pressable accessibilityRole="button" disabled={!answer.trim()} onPress={reply} style={[q.send,!answer.trim()&&q.primaryOff]}><Text style={q.primaryText}>↑</Text></Pressable></View></View></View>
   :<Text style={q.ready}>✓ Всё нужное есть.{found.length?' ИИ понял из рассказа: '+found.length+' '+plural(found.length,'деталь','детали','деталей')+'.':''}</Text>}
   <Text style={q.h}>КВАРТИРА</Text>
   <View style={q.chips}>{Object.entries(propertyTypes).map(([id,label])=>chip(id,label,draft.type===id,()=>patch({type:id}),true))}</View>
   <View style={q.grid}><View style={q.half}><Stepper label={'Комнаты'+(guessed('rooms')?' · ИИ предположил':'')} value={draft.rooms} text={String(draft.rooms)} min={1} max={20} onChange={v=>patch({rooms:v})}/></View><View style={q.half}><Stepper label={'Гостей'+(guessed('capacity')?' · ИИ предположил':'')} value={draft.capacity} text={String(draft.capacity)} min={1} max={50} onChange={v=>setDraft(d=>({...d,capacity:v,beds:Math.max(d.beds,v),known:[...new Set([...d.known,'capacity'])]}))}/></View></View>
   <View style={q.grid}>{num('area','Площадь, м²',2000)}{num('floor','Этаж',100)}</View>
   {field('address','Точный адрес · только для гостя с бронью','Улица, дом, квартира',300)}
   <View style={q.grid}><View style={q.half}>{field('district','Район','Например, Центр')}</View><View style={q.half}>{field('city','Город','',80)}</View></View>
   <Text style={q.h}>ЦЕНЫ</Text>
   <View style={q.grid}>{num('price','Сутки, ₸')}{num('hourlyPrice','Час, ₸ · 0 — нет')}</View>
   <Text style={q.h}>УДОБСТВА</Text>
   <View style={q.chips}>{Object.entries(amenities).map(([id,label])=>{const on=draft.amenities.includes(id);return chip(id,label,on,()=>patch({amenities:on?draft.amenities.filter(a=>a!==id):[...draft.amenities,id]}));})}</View>
   <Text style={q.h}>ПРАВИЛА</Text>
   <View style={q.chips}>{RULES.map(([key,label])=>chip(key,label,!!draft[key],()=>patch({[key]:!draft[key]} as Partial<ListingDraft>)))}</View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:more}} onPress={()=>setMore(v=>!v)} style={q.moreBtn}><Text style={q.moreText}>{more?'Скрыть подробности':'Ещё: ночь, депозит, заезд, текст объявления'}</Text></Pressable>
   {more&&<View style={q.body}>
    <View style={q.grid}>{num('nightlyPrice','Ночь, ₸ · 0 — нет')}{num('deposit','Депозит, ₸')}</View>
    <View style={q.grid}><View style={q.half}>{field('checkinTime','Заезд с','14:00',5)}</View><View style={q.half}>{field('checkoutTime','Выезд до','12:00',5)}</View></View>
    <Text style={q.tileLabel}>Как гость получит ключи</Text><View style={q.chips}>{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,draft.checkinMethod===id,()=>patch({checkinMethod:id}),true))}</View>
    <View style={q.field}><Text style={q.tileLabel}>Описание · ИИ написал сам</Text><TextInput accessibilityLabel="Описание" multiline style={[q.input,q.area]} value={draftDescription(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,description:v}))}/></View>
    <View style={q.field}><Text style={q.tileLabel}>Правила проживания</Text><TextInput accessibilityLabel="Правила проживания" multiline style={[q.input,q.area]} value={draftRules(draft)} maxLength={2500} onChangeText={v=>setDraft(d=>({...d,houseRules:v}))}/></View>
   </View>}
   <Text style={q.h}>КТО ОТВЕЧАЕТ ГОСТЯМ</Text>
   <View style={q.grid} accessibilityRole="radiogroup">
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='auto'}} onPress={()=>setMode('auto')} style={[q.mode,mode==='auto'&&q.modeOn]}><Text style={q.modeTitle}>✦ ИИ</Text><Text style={q.hint}>Отвечает за минуту, подтверждает бронь и заказывает уборку</Text></Pressable>
    <Pressable accessibilityRole="radio" accessibilityState={{checked:mode==='manual'}} onPress={()=>setMode('manual')} style={[q.mode,mode==='manual'&&q.modeOn]}><Text style={q.modeTitle}>Я сам</Text><Text style={q.hint}>Запросы приходят вам, вы решаете</Text></Pressable>
   </View>
   {mode==='auto'&&draft.cleaningFee>=100&&<View style={q.grid}>{num('cleaningFee','Уборка после гостя, ₸',1000000)}</View>}
   <View style={q.actions}><Pressable accessibilityRole="button" onPress={()=>setStep(0)} disabled={busy} style={q.ghost}><Text style={q.ghostText}>← Назад</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{disabled:busy||uploading||!!questions.length}} disabled={busy||uploading||!!questions.length} onPress={save} style={[q.primary,{flex:1},(busy||uploading||!!questions.length)&&q.primaryOff]}><Text style={q.primaryText}>{busy?'Сохраняю…':photos.length?'Опубликовать':'Сохранить черновик'}</Text></Pressable></View>
  </View>}

  {step===2&&saved&&<View style={[q.body,{alignItems:'center'}]}>
   <View style={q.doneMark}><Text style={q.doneMarkText}>✓</Text></View>
   <Text style={[q.title,{textAlign:'center'}]}>{draftTitle(draft)}</Text><Text style={[q.sub,{textAlign:'center'}]}>{saved.message}</Text>
   <Text style={[q.hint,{textAlign:'center'}]}>{mode==='auto'?'Гостям отвечает ИИ: он подтвердит бронь по вашим ценам и закажет уборку.':'Запросы гостей будут приходить вам.'}</Text>
   {onMap&&<Pressable accessibilityRole="button" onPress={()=>onMap(saved.id)} style={[q.primary,{alignSelf:'stretch'}]}><Text style={q.primaryText}>Показать на карте</Text></Pressable>}
   <Pressable accessibilityRole="button" onPress={()=>onDone(saved)} style={[onMap?q.ghost:q.primary,{alignSelf:'stretch'}]}><Text style={onMap?q.ghostText:q.primaryText}>Готово</Text></Pressable>
  </View>}
 </View>;
}

const q=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:16,borderWidth:1,borderColor:C.line,shadowColor:C.aiFrom,shadowOpacity:.18,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:4},
 head:{flexDirection:'row',alignItems:'center',gap:12},
 orb:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:C.accentLine},
 orbSm:{width:32,height:32,borderWidth:2},
 orbText:{color:C.onAccent,...type.subtitle,fontWeight:'700'},orbTextSm:{color:C.onAccent,...type.label,fontWeight:'700'},
 title:{color:C.ink,...type.title,fontWeight:'700'},sub:{color:C.muted,...type.label},
 close:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},closeText:{color:C.inkSoft,...type.subtitle},
 steps:{flexDirection:'row',gap:8},stepItem:{flex:1,gap:4},stepBar:{height:4,borderRadius:R.full,backgroundColor:C.line},stepNow:{backgroundColor:C.aiFrom},stepDone:{backgroundColor:C.accent},
 stepText:{color:C.muted,...type.caption,fontWeight:'600'},stepTextNow:{color:C.ink},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label},
 body:{gap:12},
 line:{borderWidth:2,borderColor:C.aiFrom,borderRadius:R.lg,backgroundColor:C.surface,overflow:'hidden'},
 lineInput:{minHeight:136,padding:16,color:C.ink,...type.body},
 lineBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:12,paddingBottom:12},
 hint:{color:C.muted,...type.caption},
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
