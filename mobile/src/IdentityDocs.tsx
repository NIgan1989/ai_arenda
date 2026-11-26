import React,{useCallback,useEffect,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {t} from '../../lib/i18n';
import {pickImages,jpegData} from './ListingMedia';
import {request} from './api';
import {h} from './SheetParts';
import {Btn} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

// «Удостоверение личности» (lib/identity-docs.ts): every participant attaches a photo of the ID card once.
// Optional for every role: a person at the platform compares it with the profile, then the photo is deleted, and the
// others see «Личность подтверждена» instead of «Личность не подтверждена».
type Doc={id:string;uri:string;checked_at:number|null};

export function IdentityDocs({role}:{role:'guest'|'owner'|'cleaner'}){
 const [docs,setDocs]=useState<Doc[]>([]),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 const fetchDocs=useCallback(async()=>{
  const v=await request('/api/operations/identity',undefined,undefined,undefined,role);
  return {checked:!!v?.checked,docs:await Promise.all((v?.docs||[]).filter((d:Doc)=>!d.checked_at).map(async(d:Doc)=>({...d,uri:(await request('/api/operations/identity/'+d.id+'/photo',undefined,undefined,undefined,role).catch(()=>null))?.data||''}))) as Doc[]};
 },[role]);
 const load=async()=>{const v=await fetchDocs();setChecked(v.checked);setDocs(v.docs);};
 useEffect(()=>{let live=true;fetchDocs().then(v=>{if(live){setChecked(v.checked);setDocs(v.docs);}}).catch(()=>{});return()=>{live=false;};},[fetchDocs]);
 async function add(camera:boolean){setBusy(true);setSaid(null);try{
  const images=await pickImages(camera,1);
  for(const image of images){const v=await request('/api/operations/identity/save',{data:await jpegData(image)},undefined,undefined,role);setSaid({text:v.message,error:false});}
  if(images.length)await load();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось приложить фото.'),error:true});}finally{setBusy(false);}}
 async function remove(id:string){setBusy(true);setSaid(null);try{
  const v=await request('/api/operations/identity/remove',{id},undefined,undefined,role);setSaid({text:v.message,error:false});await load();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось убрать фото.'),error:true});}finally{setBusy(false);}}
 const why=role==='guest'?t('По желанию. После проверки владельцы видят «Личность подтверждена» и охотнее принимают заявку.'):role==='owner'?t('По желанию. После проверки гости видят «Личность подтверждена» и больше доверяют жилью.'):t('По желанию. После проверки владельцы видят «Личность подтверждена» и охотнее выбирают исполнителя.');
 return <View style={u.card}>
  <Text accessibilityRole="header" style={u.title}>{t('Удостоверение личности')}</Text>
  {/* Whether the identity is confirmed is the line above this card in the profile (AccountControl.tsx). */}
  <Text style={h.note}>{checked?t('Личность подтверждена администратором. Фото удалено после проверки.'):docs.length?t('Фото приложено. Администратор сверит его с профилем, затем фото удалится.'):why}</Text>
  {!checked&&!!docs.length&&<View style={u.row}>{docs.map(d=><View key={d.id} style={{gap:4}}>
   {d.uri?<Image source={{uri:d.uri}} style={u.thumb} alt={t('Удостоверение личности')}/>:<View style={[u.thumb,{backgroundColor:C.surfaceAlt}]}/>}
   <Pressable accessibilityRole="button" accessibilityLabel={t('Убрать фото удостоверения')} disabled={busy} onPress={()=>void remove(d.id)}><Text style={u.remove}>{t('Убрать')}</Text></Pressable>
  </View>)}</View>}
  {!checked&&docs.length<2&&<><Btn title={busy?t('Прикладываю…'):docs.length?t('Добавить обратную сторону'):t('Сфотографировать удостоверение')} disabled={busy} onPress={()=>void add(true)}/><Btn kind="line" title={t('Выбрать из галереи')} disabled={busy} onPress={()=>void add(false)}/></>}
  {!!said&&<Text accessibilityLiveRegion="polite" style={said.error?h.error:h.note}>{said.text}</Text>}
  <Text style={u.privacy}>{t('🔒 Фото видит только администратор сервиса')}</Text>
 </View>;
}

const R=T.radius;
const u=StyleSheet.create({
 card:{gap:8,padding:16,marginTop:8,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 title:{...type.label,color:C.ink,fontWeight:'600'},
 row:{flexDirection:'row',flexWrap:'wrap',gap:8},
 thumb:{width:96,height:64,borderRadius:R.md},
 remove:{...type.caption,color:C.danger,textAlign:'center'},
 privacy:{...type.caption,color:C.muted},
});
