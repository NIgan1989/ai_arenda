import {t} from '../../lib/i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Image,StyleSheet} from 'react-native';
import {request} from './api';
import {pickImages,jpegData} from './ListingMedia';
import {SwipeConfirm} from './SwipeConfirm';
import {s,C} from './styles';
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
