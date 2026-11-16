import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Image,StyleSheet} from 'react-native';
import {request} from './api';
import {pickImages,jpegData} from './ListingMedia';
import {s,C} from './styles';
import {HANDOVER_ISSUES,STAY_PHOTO_LIMIT,handoverIssueText,type Handover} from '../../lib/stay-handover-text';

type Phase='checkin'|'handover';
const button=(title:string,onPress:()=>void,disabled:boolean,secondary=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,secondary&&s.secondary,disabled&&s.disabled,pressed&&!disabled&&h.pressed]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;

// Small previews of the photos of one stay and one phase, then «Снять фото» and «Из галереи».
// Each photo goes to the server as soon as it is taken (operations/stay-photo), so nothing is lost if the app closes.
// readOnly: only the previews, nothing when there are none (a finished stay, the other side's photos).
export function StayPhotos({bookingId,phase,role,disabled=false,readOnly=false,onCount}:{bookingId:string;phase:Phase;role:'guest'|'owner';disabled?:boolean;readOnly?:boolean;onCount?:(n:number)=>void}){
 const [photos,setPhotos]=useState<{id:string;uri:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const fetchPhotos=useCallback(async()=>{
  const list=((await request('/api/operations/stay-photos/'+bookingId,undefined,undefined,undefined,role))?.photos||[]).filter((p:{phase:string})=>p.phase===phase);
  return Promise.all(list.map(async(p:{id:string})=>({id:p.id,uri:(await request('/api/operations/stay-photos/'+p.id+'/photo',undefined,undefined,undefined,role).catch(()=>null))?.data||''})));
 },[bookingId,phase,role]);
 const show=useCallback((shown:{id:string;uri:string}[])=>{setPhotos(shown);onCount?.(shown.length);},[onCount]);
 useEffect(()=>{let live=true;fetchPhotos().then(shown=>{if(live)show(shown);}).catch(()=>{});return()=>{live=false;};},[fetchPhotos,show]);
 async function add(camera:boolean){setBusy(true);setError('');try{
  const images=await pickImages(camera,camera?1:Math.max(1,STAY_PHOTO_LIMIT-photos.length));
  for(const image of images)await request('/api/operations/stay-photo',{bookingId,data:await jpegData(image)},undefined,undefined,role);
  if(images.length)show(await fetchPhotos());
 }catch(e){setError(e instanceof Error&&e.message?e.message:'Не удалось добавить фото.');}finally{setBusy(false);}}
 const full=photos.length>=STAY_PHOTO_LIMIT,off=busy||disabled||full;
 if(readOnly)return photos.length?<View style={h.grid}>{photos.map(p=>p.uri?<Image key={p.id} source={{uri:p.uri}} style={h.view} alt="Фото жилья" accessibilityLabel="Фото жилья"/>:<View key={p.id} style={[h.view,{backgroundColor:C.surfaceAlt}]}/>)}</View>:null;
 return <View style={{gap:8}}>
  {!!photos.length&&<View style={h.grid}>{photos.map(p=>p.uri?<Image key={p.id} source={{uri:p.uri}} style={h.thumb} alt="Фото жилья" accessibilityLabel="Фото жилья"/>:<View key={p.id} style={[h.thumb,{backgroundColor:C.surfaceAlt}]}/>)}</View>}
  <Text style={s.meta}>{busy?'Сохраняю фото…':photos.length?'Добавлено '+photos.length+' из '+STAY_PHOTO_LIMIT+'.':'Пока нет фото.'}</Text>
  {!full&&<View style={h.row}><View style={h.grow}>{button('Снять фото',()=>add(true),off)}</View><View style={h.grow}>{button('Из галереи',()=>add(false),off,true)}</View></View>}
  {!!error&&<Text accessibilityRole="alert" style={[s.meta,{color:C.danger}]}>{error}</Text>}
 </View>;
}

// The guest, right after moving in: a few photos protect the deposit from damage that was already there.
export function CheckinPhotos({bookingId,count}:{bookingId:string;count:number}){
 return <View style={[s.card,{gap:8}]}>
  <Text style={s.eventTitle}>{count?'Фото при заселении':'Сфотографируйте жильё'}</Text>
  {!count&&<Text style={s.text}>3–5 снимков комнат и того, что уже сломано или испачкано. Тогда это не запишут на вас при выезде. Фото видите только вы и владелец.</Text>}
  <StayPhotos bookingId={bookingId} phase="checkin" role="guest"/>
 </View>;
}

// The owner after checkout: «Всё хорошо» in one tap, or what was wrong with photos.
// The executor's photos taken before cleaning are counted in by themselves; damage they photographed opens the issues at once.
export function StayHandover({bookingId,cleanerPhotos,cleanerDamage,checkinPhotos,busy,onSubmit}:{bookingId:string;cleanerPhotos:number;cleanerDamage:number;checkinPhotos:number;busy:boolean;onSubmit:(body:{verdict:'ok'|'issues';issues?:string[];note?:string})=>void}){
 const [issuesOpen,setIssuesOpen]=useState(cleanerDamage>0),[picked,setPicked]=useState<string[]>(cleanerDamage>0?['damage']:[]),[note,setNote]=useState(''),[photos,setPhotos]=useState(0);
 const flip=(code:string)=>setPicked(list=>list.includes(code)?list.filter(c=>c!==code):[...list,code]);
 const ready=picked.length>0&&(!!note.trim()||photos>0||cleanerPhotos>0);
 return <View style={[s.card,{gap:12}]}>
  <Text style={s.eventTitle}>Как гость оставил жильё?</Text>
  {checkinPhotos>0&&<StayPhotos bookingId={bookingId} phase="checkin" role="owner" readOnly/>}
  <Text style={s.meta}>{[cleanerPhotos?'Фото исполнителя до уборки: '+cleanerPhotos+', приложатся сами':'',cleanerDamage?'исполнитель снял повреждения':'',checkinPhotos?'гость снял жильё при заселении: '+checkinPhotos:''].filter(Boolean).join(' · ')||'Не отметите за двое суток — проживание засчитается без замечаний.'}</Text>
  {!issuesOpen&&<View style={{gap:8}}>{button('Всё хорошо',()=>onSubmit({verdict:'ok'}),busy)}{button('Есть замечания',()=>setIssuesOpen(true),busy,true)}</View>}
  {issuesOpen&&<>
   <Text style={s.text}>Что было не так?</Text>
   <View accessibilityRole="list" style={h.chips}>{Object.keys(HANDOVER_ISSUES).map(code=>{const on=picked.includes(code);return <Pressable key={code} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:busy}} disabled={busy} onPress={()=>flip(code)} style={[s.chip,h.chip,on&&h.chipOn]}><Text style={[s.chipText,on&&h.chipTextOn]}>{handoverIssueText(code)}</Text></Pressable>;})}</View>
   <TextInput accessibilityLabel="Пояснение для гостя" placeholder="Коротко, что именно (необязательно, если есть фото)" placeholderTextColor={C.muted} value={note} onChangeText={setNote} maxLength={500} multiline style={s.input} editable={!busy}/>
   <StayPhotos bookingId={bookingId} phase="handover" role="owner" disabled={busy} onCount={setPhotos}/>
   <Text style={s.meta}>Гость увидит замечания и фото и сможет ответить через «Есть проблема». Другим владельцам они пока не видны.</Text>
   {button('Отправить замечания',()=>onSubmit({verdict:'issues',issues:picked,note:note.trim()}),busy||!ready)}
   {button('Назад',()=>{setIssuesOpen(false);setPicked([]);},busy,true)}
  </>}
 </View>;
}

// After the stay both sides see the photos of both moments: how the guest found the home and what the owner noted.
export function StayEvidence({bookingId,role,checkin,handover}:{bookingId:string;role:'guest'|'owner';checkin:boolean;handover:boolean}){
 return <View style={{gap:8}}>
  {checkin&&<><Text style={s.meta}>Гость при заселении</Text><StayPhotos bookingId={bookingId} phase="checkin" role={role} readOnly/></>}
  {handover&&<><Text style={s.meta}>Владелец после выезда</Text><StayPhotos bookingId={bookingId} phase="handover" role={role} readOnly/></>}
 </View>;
}

// One line about a finished handover: the owner reads it about the guest, the guest about themselves.
export function handoverLine(h:Handover|null|undefined,silent:boolean,guest=false){
 const head=guest?'Владелец после выезда':'Жильё после гостя';
 if(!h)return silent?head+': без замечаний.':'';
 if(h.verdict==='ok')return head+': всё хорошо.';
 const what=h.issues.map(handoverIssueText).join(', ').toLowerCase()+(h.note?'. «'+h.note+'»':'')+'.';
 return guest?'Владелец отметил после выезда: '+what+' Не согласны — «Есть проблема» в «Ещё».':head+': '+what;
}

const h=StyleSheet.create({
 row:{flexDirection:'row',gap:8},grow:{flex:1},pressed:{opacity:.85},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},thumb:{width:72,height:72,borderRadius:12},view:{width:104,height:104,borderRadius:12},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:40,paddingVertical:8,paddingHorizontal:12},
 chipOn:{backgroundColor:C.accent,borderColor:C.accent},chipTextOn:{color:C.onAccent},
});
