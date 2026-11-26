import {t} from '../../lib/i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Image,StyleSheet} from 'react-native';
import {request} from './api';
import {pickImages,jpegData} from './ListingMedia';
import {SwipeConfirm} from './SwipeConfirm';
import {PhotoSource} from './PhotoSource';
import {PhotoViewer} from './PhotoViewer';
import {T} from './tokens';
import {s,C,type} from './styles';
import {DAMAGE_PHOTO_LIMIT} from '../../lib/home-cleaning';

// Photos of one cleaning (operations/evidence): the performer's «до» and «после» of the report, and the photos of
// damage either side may add. Each photo goes to the server as soon as it is taken, so nothing is lost if the app closes.
type Phase='before'|'after'|'damage';
type Shot={id:string;uri:string};
export const JOB_PHOTO_LIMIT=6;
const button=(title:string,onPress:()=>void,disabled:boolean,secondary=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,p.grow,secondary&&s.secondary,disabled&&s.disabled,pressed&&!disabled&&p.pressed]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;

// mine: only the photos this person added (true) or only the other side's (false); undefined shows all of the phase.
// readOnly: previews alone, nothing when there are none.
export function JobPhotos({jobId,phase,role,title,mine,readOnly=false,disabled=false,limit=JOB_PHOTO_LIMIT,onCount}:{jobId:string;phase:Phase;role:'owner'|'cleaner';title?:string;mine?:boolean;readOnly?:boolean;disabled?:boolean;limit?:number;onCount?:(n:number)=>void}){
 const [photos,setPhotos]=useState<Shot[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const fetchPhotos=useCallback(async()=>{
  const list=((await request('/api/operations/evidence/'+jobId,undefined,undefined,undefined,role))?.photos||[]).filter((x:{phase:string;mine:number;mime:string})=>x.phase===phase&&x.mime==='image/jpeg'&&(mine===undefined||!!x.mine===mine));
  return Promise.all(list.map(async(x:{id:string})=>({id:x.id,uri:(await request('/api/operations/evidence/'+x.id+'/photo',undefined,undefined,undefined,role).catch(()=>null))?.data||''})));
 },[jobId,phase,role,mine]);
 const show=useCallback((shown:Shot[])=>{setPhotos(shown);onCount?.(shown.length);},[onCount]);
 useEffect(()=>{let live=true;fetchPhotos().then(shown=>{if(live)show(shown);}).catch(()=>{});return()=>{live=false;};},[fetchPhotos,show]);
 async function add(camera:boolean){setBusy(true);setError('');try{
  const images=await pickImages(camera,camera?1:Math.max(1,limit-photos.length));
  for(const image of images)await request('/api/operations/evidence',{jobId,phase,data:await jpegData(image)},undefined,undefined,role);
  if(images.length)show(await fetchPhotos());
 }catch(e){setError(e instanceof Error&&e.message?e.message:t('Не удалось добавить фото.'));}finally{setBusy(false);}}
 const grid=!!photos.length&&<View style={p.grid}>{photos.map(x=>x.uri?<Image key={x.id} source={{uri:x.uri}} style={readOnly?p.view:p.thumb} alt={title||t('Фото уборки')} accessibilityLabel={title||t('Фото уборки')}/>:<View key={x.id} style={[readOnly?p.view:p.thumb,{backgroundColor:C.surfaceAlt}]}/>)}</View>;
 if(readOnly)return photos.length?<View style={p.block}>{!!title&&<Text style={s.meta}>{title}</Text>}{grid}</View>:null;
 const full=photos.length>=limit,off=busy||disabled||full;
 return <View style={p.block}>
  {!!title&&<Text style={s.eventTitle}>{title}</Text>}
  {grid}
  <Text style={s.meta}>{busy?t('Сохраняю фото…'):photos.length?t('Добавлено {length} из {limit}.',{length:photos.length,limit}):t('Пока нет фото.')}</Text>
  {!full&&<View style={p.row}>{button(t('Снять фото'),()=>add(true),off)}{button(t('Из галереи'),()=>add(false),off,true)}</View>}
  {!!error&&<Text accessibilityRole="alert" style={[s.meta,{color:C.danger}]}>{error}</Text>}
 </View>;
}

// The report's «до» and «после» side by side (board «Экраны старой версии», 2026-11-26; Thumbtack): two big places,
// a tap opens «Снять фото / Выбрать из галереи», a filled place shows its photos and how many. readOnly is the owner's
// view of the same report: the places without a plus, a tap on a photo opens it over the whole screen.
export function JobPhotoPair({jobId,role,readOnly=false,disabled=false,limit=JOB_PHOTO_LIMIT,onBefore,onAfter}:{jobId:string;role:'owner'|'cleaner';readOnly?:boolean;disabled?:boolean;limit?:number;onBefore?:(n:number)=>void;onAfter?:(n:number)=>void}){
 const [counts,setCounts]=useState({before:-1,after:-1});
 const seen=(phase:'before'|'after',fn?:(n:number)=>void)=>(n:number)=>{setCounts(c=>({...c,[phase]:n}));fn?.(n);};
 const onB=useCallback(seen('before',onBefore),[onBefore]),onA=useCallback(seen('after',onAfter),[onAfter]); // eslint-disable-line react-hooks/exhaustive-deps
 if(readOnly&&counts.before===0&&counts.after===0)return null;
 return <View style={q.pair}>
  <PhotoPlace jobId={jobId} role={role} phase="before" title={t('До уборки')} readOnly={readOnly} disabled={disabled} limit={limit} onCount={onB}/>
  <PhotoPlace jobId={jobId} role={role} phase="after" title={t('После уборки')} readOnly={readOnly} disabled={disabled} limit={limit} onCount={onA}/>
 </View>;
}
function PhotoPlace({jobId,role,phase,title,readOnly,disabled,limit,onCount}:{jobId:string;role:'owner'|'cleaner';phase:'before'|'after';title:string;readOnly:boolean;disabled:boolean;limit:number;onCount:(n:number)=>void}){
 const [photos,setPhotos]=useState<Shot[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[asking,setAsking]=useState(false),[open,setOpen]=useState('');
 const fetchPhotos=useCallback(async()=>{
  const list=((await request('/api/operations/evidence/'+jobId,undefined,undefined,undefined,role))?.photos||[]).filter((x:{phase:string;mime:string})=>x.phase===phase&&x.mime==='image/jpeg');
  return Promise.all(list.map(async(x:{id:string})=>({id:x.id,uri:(await request('/api/operations/evidence/'+x.id+'/photo',undefined,undefined,undefined,role).catch(()=>null))?.data||''})));
 },[jobId,phase,role]);
 const show=useCallback((shown:Shot[])=>{setPhotos(shown);onCount(shown.length);},[onCount]);
 useEffect(()=>{let live=true;fetchPhotos().then(shown=>{if(live)show(shown);}).catch(()=>{});return()=>{live=false;};},[fetchPhotos,show]);
 async function add(camera:boolean){setAsking(false);setBusy(true);setError('');try{
  const images=await pickImages(camera,camera?1:Math.max(1,limit-photos.length));
  for(const image of images)await request('/api/operations/evidence',{jobId,phase,data:await jpegData(image)},undefined,undefined,role);
  if(images.length)show(await fetchPhotos());
 }catch(e){setError(e instanceof Error&&e.message?e.message:t('Не удалось добавить фото.'));}finally{setBusy(false);}}
 const full=photos.length>=limit,off=busy||disabled||full,cover=photos.slice(0,4);
 const mosaic=<View style={q.mosaic}>{cover.map(x=><Pressable key={x.id} accessibilityRole="imagebutton" accessibilityLabel={t('Открыть фото: {title}',{title})} disabled={!readOnly||!x.uri} onPress={()=>setOpen(x.uri)} style={cover.length===1?q.one:cover.length===2?q.half:q.quarter}>{x.uri?<Image source={{uri:x.uri}} style={q.img} alt={title}/>:<View style={[q.img,{backgroundColor:C.line}]}/>}</Pressable>)}</View>;
 const body=<>
  {photos.length?mosaic:<View style={q.empty}><View style={q.plus}><Image source={require('../assets/menu/camera.png')} style={q.plusIcon} accessibilityElementsHidden importantForAccessibility="no"/></View></View>}
  <View style={[q.caption,!!photos.length&&q.captionOver]}><Text numberOfLines={1} style={[q.captionText,!!photos.length&&{color:C.onAccent}]}>{busy?t('Сохраняю…'):title}</Text>{!!photos.length&&!busy&&<Text style={q.count}>{photos.length}</Text>}</View>
 </>;
 return <View style={q.place}>
  {readOnly?<View style={q.box}>{body}</View>:<Pressable accessibilityRole="button" accessibilityLabel={photos.length?t('{title}: {n} фото. Добавить ещё',{title,n:photos.length}):t('{title}: добавить фото',{title})} accessibilityState={{disabled:off}} disabled={off} onPress={()=>setAsking(true)} style={({pressed})=>[q.box,!photos.length&&q.boxEmpty,pressed&&{opacity:.8}]}>{body}</Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={[s.meta,{color:C.danger}]}>{error}</Text>}
  {!readOnly&&<PhotoSource visible={asking} title={title} busy={busy} onClose={()=>setAsking(false)} onCamera={()=>void add(true)} onGallery={()=>void add(false)}/>}
  {readOnly&&<PhotoViewer uri={open} visible={!!open} title={title} onClose={()=>setOpen('')}/>}
 </View>;
}
const q=StyleSheet.create({
 pair:{flexDirection:'row',gap:8},place:{flex:1,gap:4},
 box:{aspectRatio:4/3,borderRadius:T.radius.lg,overflow:'hidden',backgroundColor:C.surfaceAlt},boxEmpty:{borderWidth:1,borderColor:C.lineStrong,borderStyle:'dashed',backgroundColor:C.surface},
 empty:{flex:1,alignItems:'center',justifyContent:'center'},plus:{width:48,height:48,borderRadius:24,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},plusIcon:{width:22,height:22,tintColor:C.ink},
 mosaic:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:2},one:{width:'100%',height:'100%'},half:{flex:1,height:'100%'},quarter:{width:'48.5%',height:'48.5%'},img:{width:'100%',height:'100%'},
 caption:{position:'absolute',left:0,right:0,bottom:0,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingVertical:8},captionOver:{backgroundColor:'rgba(14,19,36,0.55)'},
 captionText:{flex:1,...type.label,color:C.ink,fontWeight:'600'},count:{minWidth:24,height:24,borderRadius:12,paddingHorizontal:8,overflow:'hidden',backgroundColor:C.surface,color:C.ink,textAlign:'center',...type.caption,lineHeight:24,fontWeight:'700'},
});

// The customer rates the performer after the acceptance: five stars and an optional note.
const words=/* i18n */['Выберите оценку','Плохо','Так себе','Нормально','Хорошо','Отлично'];
export function JobRating({busy,onSubmit}:{busy:boolean;onSubmit:(rating:number,note:string)=>void}){
 const [rating,setRating]=useState(0),[note,setNote]=useState('');
 return <View style={[s.card,p.block]}>
  <Text style={s.eventTitle}>{t('Как убрал исполнитель?')}</Text>
  <View accessibilityRole="radiogroup" accessibilityLabel={t('Оценка исполнителя')} style={p.stars}>
   {[1,2,3,4,5].map(n=><Pressable key={n} accessibilityRole="radio" accessibilityLabel={t('{n} из 5',{n})} accessibilityState={{checked:rating===n,disabled:busy}} disabled={busy} onPress={()=>setRating(n)} hitSlop={4} style={p.star}><Text style={[p.starText,{color:n<=rating?C.accent:C.lineStrong}]}>★</Text></Pressable>)}
  </View>
  <Text style={s.meta}>{t('{word}. Оценку увидят следующие заказчики.',{word:t(words[rating])})}</Text>
  <TextInput accessibilityLabel={t('Отзыв для исполнителя')} placeholder={t('Что понравилось или что улучшить (необязательно)')} placeholderTextColor={C.muted} value={note} onChangeText={setNote} maxLength={1000} multiline style={s.field} editable={!busy}/>
  <SwipeConfirm label={t('Проведите: отправить оценку')} disabled={busy||!rating} onConfirm={()=>onSubmit(rating,note.trim())}/>
 </View>;
}

// A complaint about damage: photos first (they are the proof), then what happened in a line.
export function DamageClaim({jobId,busy,onSubmit}:{jobId:string;busy:boolean;onSubmit:(text:string)=>void}){
 const [count,setCount]=useState(0),[text,setText]=useState('');
 return <View style={[s.card,p.block]}>
  <JobPhotos jobId={jobId} phase="damage" role="owner" mine title={t('Фото повреждения')} limit={DAMAGE_PHOTO_LIMIT} disabled={busy} onCount={setCount}/>
  <TextInput accessibilityLabel={t('Что повреждено')} placeholder={t('Что повреждено и где')} placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={1500} multiline style={s.field} editable={!busy}/>
  <Text style={s.meta}>{t('Жалобу и фото увидит исполнитель. Если не договоритесь, подключится администратор сервиса.')}</Text>
  <SwipeConfirm label={t('Проведите: отправить жалобу')} disabled={busy||!count||!text.trim()} onConfirm={()=>onSubmit(text.trim())}/>
 </View>;
}

const p=StyleSheet.create({
 block:{gap:8},row:{flexDirection:'row',gap:8},grow:{flex:1},pressed:{opacity:.85},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},thumb:{width:72,height:72,borderRadius:12},view:{width:104,height:104,borderRadius:12},
 stars:{flexDirection:'row',gap:4},star:{padding:4},starText:{fontSize:36,lineHeight:40},
});
