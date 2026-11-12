import React,{useState} from 'react';
import {Pressable,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {PhotoGrid} from './PhotoGrid';
import {Stepper} from './SheetParts';
import {EDIT_STEPS,editBody,editRequest,nextAdvice,needsReview,reviewRequest,REVIEW_SENT,stepForError,stepLine,stepNeeds,type Advice,type EditBody,type EditStep} from '../../lib/listing-edit';
import {amenities,checkinMethods,propertyTypes} from '../../lib/listings';
type Row=Record<string,any>;
const R=T.radius,H=T.control;
const ICONS:Record<EditStep,string>={photos:'📷',flat:'🛏',place:'📍',text:'📝',amenities:'📶',prices:'₸',checkin:'🕑',rules:'📜'};
const SAVED:Record<EditStep|'publish',string>={photos:'Фото сохранены.',flat:'Квартира сохранена.',place:'Адрес сохранён.',text:'Описание сохранено.',amenities:'Удобства сохранены.',prices:'Цены сохранены.',checkin:'Заезд сохранён.',rules:'Правила сохранены.',publish:'Готово.'};

// Editing a flat in the app: an overview of short steps, each opened on its own small screen and saved at once.
// After each save the AI administrator offers the next step. Same rules as the site (lib/listing-edit.ts).
export function PropertyEdit({property,onSave,onReview,onClose}:{property:Row;onSave:(body:Row)=>Promise<Row|undefined>;onReview?:(body:Row)=>Promise<unknown>;onClose:()=>void}){
 const [p,setP]=useState(property),[base,setBase]=useState<EditBody>(()=>editBody(property)),[draft,setDraft]=useState<EditBody>(base);
 const [open,setOpen]=useState<EditStep|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[skipped,setSkipped]=useState<string[]>([]),[held,setHeld]=useState(false),[sent,setSent]=useState(false);
 // A save that failed keeps its changes: the owner fixes what the server asked for in another step and everything is saved together.
 const fix=held&&error?stepForError(error):null;
 const advice:Advice=held&&error?{step:fix,text:'Не сохранилось: '+error+(fix?' Заполните это, и сохранится всё вместе.':''),action:fix?'Заполнить':undefined}:sent&&!base.published?{step:null,text:REVIEW_SENT}:nextAdvice(base,skipped);
 function go(step:EditStep){if(!held)setDraft(base);setError(held?error:'');setDone('');setOpen(step);}
 async function commit(next:EditBody,what:EditStep|'publish'){
  if(busy||uploading)return;setBusy(true);setError('');
  try{const fresh=await onSave(editRequest(next,p));setP(fresh||{...p,listing_version:(p.listing_version||0)+1});const b=fresh?editBody(fresh):next;setBase(b);setDraft(b);setOpen(null);setHeld(false);setError('');setDone(SAVED[what]);}
  catch(e:any){const message=e?.message||'Не удалось сохранить.';
   // Publishing waits for the administrator: the flat is sent for review instead of failing, and is shown once approved.
   if(what==='publish'&&next.published&&onReview&&needsReview(message)){try{const kept={...next,published:false};if(held){const fresh=await onSave(editRequest(kept,p));setP(fresh||p);const b=fresh?editBody(fresh):kept;setBase(b);setDraft(b);}await onReview(reviewRequest({id:p.id,title:next.title,city:next.city,address:next.address}));setSent(true);setHeld(false);setDone('');setError('');setOpen(null);return;}catch(r:any){setError(r?.message||message);setHeld(true);setOpen(null);return;}}
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

 if(open){const title=EDIT_STEPS.find(s=>s.key===open)!.title;
  return <View style={e.sheet}>
   <View style={e.bar}><Pressable accessibilityRole="button" accessibilityLabel="Назад к списку" onPress={()=>{setOpen(null);if(!held)setError('');}} disabled={busy||uploading} style={e.round}><Text style={e.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={e.title}>{title}</Text></View>
   {open==='photos'&&<PhotoGrid photos={draft.photos} onChange={photos=>set({photos})} onBusy={setUploading} disabled={busy}/>}
   {open==='flat'&&<>
    <View style={e.chips}>{Object.entries(propertyTypes).map(([id,label])=>chip(id,label,d.type===id,()=>setD({type:id}),true))}</View>
    <View style={e.row}>{half(<Stepper label="Комнаты" value={draft.rooms} text={String(draft.rooms)} min={1} max={20} onChange={n=>set({rooms:n})}/>)}{half(<Stepper label="Гостей" value={draft.capacity} text={String(draft.capacity)} min={1} max={50} onChange={n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}}))}/>)}</View>
    <View style={e.row}>{half(<Stepper label="Спальных мест" value={d.beds} text={String(d.beds)} min={1} max={50} onChange={n=>setD({beds:n})}/>)}{half(<Stepper label="Санузлы" value={d.bathrooms} text={String(d.bathrooms)} min={1} max={20} onChange={n=>setD({bathrooms:n})}/>)}</View>
    <View style={e.row}>{num('Площадь, м²',d.area,n=>setD({area:n}),2000)}{num('Этаж',d.floor,n=>setD({floor:n}),100)}{num('Этажей',d.floors,n=>setD({floors:n}),100)}</View>
   </>}
   {open==='place'&&<>
    <View style={e.row}>{half(text('Город',draft.city,v=>set({city:v}),80))}{half(text('Район',draft.district,v=>set({district:v}),120,'Например, Центр'))}</View>
    {text('Точный адрес',draft.address,v=>set({address:v}),300,'Улица, дом, квартира')}
    <Text style={e.hint}>Адрес видит только гость с подтверждённой бронью. Метку на карте ставим по нему.</Text>
   </>}
   {open==='text'&&<>
    {text('Название',draft.title,v=>set({title:v}),120)}
    {text('Описание',draft.description,v=>set({description:v}),2500,'',true)}
    <Text style={[e.hint,draft.description.trim().length<80&&e.warn]}>{draft.description.trim().length} знаков{draft.description.trim().length<80?' · для показа гостям нужно от 80':''}</Text>
   </>}
   {open==='amenities'&&<View style={e.chips}>{Object.entries(amenities).map(([id,label])=>{const on=d.amenities.includes(id);return chip(id,label,on,()=>setD({amenities:on?d.amenities.filter(a=>a!==id):[...d.amenities,id]}));})}</View>}
   {open==='prices'&&<>
    <View style={e.row}>{num('Сутки, ₸',draft.price,n=>set({price:n}))}{num('Час, ₸',r.hourlyPrice,n=>setR({hourlyPrice:n}),10000000,'0 — без почасовой')}</View>
    <View style={e.row}>{num('Ночь, ₸',r.nightlyPrice,n=>setR({nightlyPrice:n}),10000000,'0 — без ночной')}{num('Депозит, ₸',r.deposit,n=>setR({deposit:n}))}</View>
    {r.hourlyPrice>0&&<Stepper label="Минимум часов" value={r.minHours} text={String(r.minHours)} min={1} max={24} onChange={n=>setR({minHours:n})}/>}
   </>}
   {open==='checkin'&&<>
    <View style={e.row}>{half(text('Заезд с',r.checkinTime,v=>setR({checkinTime:v}),5,'14:00'))}{half(text('Выезд до',r.checkoutTime,v=>setR({checkoutTime:v}),5,'12:00'))}</View>
    <Text style={e.label}>Как гость получит ключи</Text>
    <View style={e.chips}>{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,d.checkinMethod===id,()=>setD({checkinMethod:id}),true))}</View>
    <View style={e.row}>{num('Уборка между гостями, мин',draft.cleaningMinutes,n=>set({cleaningMinutes:n}),1440)}</View>
   </>}
   {open==='rules'&&<>
    <View style={e.chips}>{([['pets','Можно с питомцами'],['smoking','Можно курить'],['parties','Можно вечеринки']] as const).map(([k,label])=>chip(k,label,d[k],()=>setD({[k]:!d[k]})))}</View>
    {text('Правила и возврат депозита',r.houseRules,v=>setR({houseRules:v}),2500,'Тишина после 23:00. Депозит вернём в день выезда после проверки.',true)}
    <Text style={e.hint}>Не пишите здесь коды замков и личные контакты.</Text>
   </>}
   {!!error&&<Text accessibilityRole="alert" style={e.error}>{error}</Text>}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||uploading}} disabled={busy||uploading} onPress={()=>commit(draft,open)} style={[e.primary,(busy||uploading)&&e.off]}><Text style={e.primaryText}>{busy?'Сохраняю…':uploading?'Загружаю фото…':'✓  Сохранить'}</Text></Pressable>
  </View>;
 }

 return <View style={e.sheet}>
  <View style={e.bar}>
   <View style={e.thumb}>{base.photos[0]?<Photo id={base.photos[0]} alt="Обложка" fill/>:<Text style={e.ico}>📷</Text>}</View>
   <View style={{flex:1,minWidth:0}}><Text accessibilityRole="header" numberOfLines={1} style={e.name}>{base.title||'Без названия'}</Text><Text style={[e.state,base.published&&e.stateOn]}>{base.published?'Гости видят на карте':'Скрыто от гостей'}</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} disabled={busy} style={e.round}><Text style={e.roundText}>✕</Text></Pressable>
  </View>
  <View style={[e.advice,held&&e.adviceHeld]} accessibilityLiveRegion="polite">
   <View style={e.orb}><Text style={e.orbText}>✦</Text></View>
   <View style={{flex:1,minWidth:0,gap:8}}>
    <Text style={e.adviceText}>{!!done&&<Text style={e.saved}>{done} </Text>}{advice.text}</Text>
    
    {!!advice.step&&<View style={e.adviceRow}>
     <Pressable accessibilityRole="button" disabled={busy} onPress={()=>advice.step==='publish'?commit({...(held?draft:base),published:true},'publish'):go(advice.step as EditStep)} style={e.go}><Text style={e.goText}>{busy&&advice.step==='publish'?'Сохраняю…':advice.action}</Text></Pressable>
     {!held&&<Pressable accessibilityRole="button" onPress={()=>{setSkipped(v=>[...v,advice.step as string]);setDone('');}} style={e.later}><Text style={e.laterText}>Не сейчас</Text></Pressable>}
    </View>}
   </View>
  </View>
  <View style={e.grid}>{EDIT_STEPS.map(s=>{const needs=stepNeeds(base,s.key);return <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={s.title+': '+stepLine(base,s.key)+(needs?', нужно заполнить':'')} onPress={()=>go(s.key)} style={({pressed})=>[e.step,needs&&e.stepNeeds,pressed&&e.pressed]}>
   <View style={[e.icoBox,needs&&e.icoNeeds]}><Text style={e.ico}>{ICONS[s.key]}</Text></View>
   <View style={{flex:1,minWidth:0}}><Text style={e.stepTitle} numberOfLines={1}>{s.title}</Text><Text style={e.stepLine} numberOfLines={1}>{stepLine(base,s.key)}</Text></View>
   {needs&&<View style={e.dot}/>}
  </Pressable>;})}</View>
  <View style={e.switchRow}><View style={{flex:1}}><Text style={e.stepTitle}>Показывать гостям</Text><Text style={e.stepLine}>{base.published?'Объявление на карте':'Черновик, видите только вы'}</Text></View><Switch accessibilityLabel="Показывать гостям" value={base.published} disabled={busy} onValueChange={v=>commit({...(held?draft:base),published:v},'publish')} trackColor={{true:C.success,false:C.lineStrong}} thumbColor={C.surface}/></View>
 </View>;
}
const e=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.title,fontWeight:'700'},
 thumb:{width:40,height:40,borderRadius:R.md,overflow:'hidden',backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},
 name:{color:C.ink,...type.subtitle,fontWeight:'700'},state:{color:C.muted,...type.caption,fontWeight:'600'},stateOn:{color:C.success},
 advice:{flexDirection:'row',gap:12,padding:12,borderRadius:R.lg,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine},
 orb:{width:32,height:32,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center'},orbText:{color:C.onAccent,...type.label,fontWeight:'700'},
 adviceHeld:{backgroundColor:C.dangerSoft,borderColor:C.danger},adviceText:{color:C.ink,...type.label},saved:{color:C.success,fontWeight:'700'},errorText:{color:C.danger,...type.label},
 adviceRow:{flexDirection:'row',alignItems:'center',gap:12},
 go:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.accent,justifyContent:'center',paddingHorizontal:16},goText:{color:C.onAccent,...type.label,fontWeight:'700'},
 later:{minHeight:H.compact,justifyContent:'center'},laterText:{color:C.muted,...type.label},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 step:{width:'48.5%',flexDirection:'row',alignItems:'center',gap:8,minHeight:56,padding:8,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 stepNeeds:{borderColor:C.warningLine},pressed:{backgroundColor:C.surfaceAlt},
 icoBox:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},icoNeeds:{backgroundColor:C.warningSoft},
 ico:{color:C.accent,...type.label},
 stepTitle:{color:C.ink,...type.label,fontWeight:'600'},stepLine:{color:C.muted,...type.caption},
 dot:{position:'absolute',top:8,right:8,width:8,height:8,borderRadius:R.full,backgroundColor:C.warning},
 switchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 row:{flexDirection:'row',gap:8},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.accent,borderColor:C.accent},chipText:{color:C.inkSoft,...type.label},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'space-between'},
 label:{color:C.muted,...type.caption,fontWeight:'600'},value:{color:C.ink,...type.subtitle,fontWeight:'700',padding:0},
 field:{gap:4},input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:128,...type.label},
 hint:{color:C.muted,...type.caption},warn:{color:C.warning,fontWeight:'600'},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24,marginTop:4},off:{backgroundColor:C.lineStrong},
 primaryText:{color:C.onAccent,...type.body,fontWeight:'700'}
});
