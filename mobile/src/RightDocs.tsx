import React,{useCallback,useEffect,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {pickImages,jpegData} from './ListingMedia';
import {request} from './api';
import {t} from '../../lib/i18n';
import {Action,Chips,h} from './SheetParts';
import {C,type} from './styles';
import {T} from './tokens';

// «Право сдавать жильё» (lib/property-rights.ts): before guests see the place, a person at the platform checks
// a photo of the owner's title or, for one who sublets, the lease with the owner's notarised consent.
// The photos are seen only by the owner and the platform administrators.
type Doc={id:string;kind:'owner'|'sublease';uri:string};
type Kind=Doc['kind'];

export function RightDocs({propertyId,approved}:{propertyId:string;approved:boolean}){
 const [docs,setDocs]=useState<Doc[]>([]),[kind,setKind]=useState<Kind>('owner'),[need,setNeed]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null),[open,setOpen]=useState('');
 const load=useCallback(async()=>{
  const v=await request('/api/operations/rights/'+propertyId,undefined,undefined,undefined,'owner');
  const found:Doc[]=await Promise.all((v?.docs||[]).map(async(d:Doc)=>({...d,uri:(await request('/api/operations/rights/'+d.id+'/photo',undefined,undefined,undefined,'owner').catch(()=>null))?.data||''})));
  setNeed(v?.need||{});setDocs(found);if(found[0])setKind(found[0].kind);
 },[propertyId]);
 useEffect(()=>{load().catch(()=>{});},[load]);
 async function add(){setBusy(true);setSaid(null);try{
  const images=await pickImages(false,1);
  for(const image of images){const v=await request('/api/operations/rights/save',{propertyId,kind,data:await jpegData(image)},undefined,undefined,'owner');setSaid({text:v.message,error:false});}
  if(images.length)await load();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось приложить фото.'),error:true});}finally{setBusy(false);}}
 async function remove(id:string){setBusy(true);setSaid(null);try{
  const v=await request('/api/operations/rights/remove',{id},undefined,undefined,'owner');setSaid({text:v.message,error:false});await load();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось убрать фото.'),error:true});}finally{setBusy(false);}}
 const switching=docs.length>0&&docs[0].kind!==kind,big=docs.find(d=>d.id===open);
 return <View style={r.card}>
  <Text accessibilityRole="header" style={r.title}>{t('Право сдавать жильё')}</Text>
  <Text style={h.note}>{approved?t('Документ проверен администратором. Чтобы заменить его, напишите в поддержку.'):docs.length?t('Документ приложен. Администратор сверит его вручную, обычно в течение дня.'):t('Гости увидят жильё после того, как администратор проверит документ.')}</Text>
  {!approved&&<Chips name={t('Кто вы')} value={kind} options={[['owner',t('Я собственник')],['sublease',t('Сдаю в субаренду')]]} onChange={setKind} disabled={busy}/>}
  {!approved&&!!need[kind]&&<Text style={h.note}>{t('Нужно фото: {v}.',{v:need[kind]})}</Text>}
  {switching&&<Text style={r.warn}>{t('Новое фото заменит уже приложенные документы.')}</Text>}
  {!!docs.length&&<View style={r.row}>{docs.map(d=><View key={d.id} style={{gap:4}}>
   <Pressable accessibilityRole="imagebutton" accessibilityLabel={open===d.id?t('Свернуть документ'):t('Открыть документ')} onPress={()=>setOpen(open===d.id?'':d.id)}>{d.uri?<Image source={{uri:d.uri}} style={r.thumb} alt={t('Документ о праве')}/>:<View style={[r.thumb,{backgroundColor:C.surfaceAlt}]}/>}</Pressable>
   {!approved&&<Pressable accessibilityRole="button" accessibilityLabel={t('Убрать фото документа')} disabled={busy} onPress={()=>void remove(d.id)}><Text style={r.remove}>{t('Убрать')}</Text></Pressable>}
  </View>)}</View>}
  {!!big?.uri&&<Pressable accessibilityRole="imagebutton" accessibilityLabel={t('Свернуть документ')} onPress={()=>setOpen('')}><Image source={{uri:big.uri}} style={r.big} resizeMode="contain" alt={t('Документ о праве')}/></Pressable>}
  {!approved&&docs.length<4&&<Action secondary title={busy?t('Прикладываю…'):docs.length&&!switching?t('Приложить ещё страницу'):t('Приложить фото документа')} disabled={busy} onPress={()=>void add()}/>}
  {!!said&&<Text accessibilityLiveRegion="polite" style={said.error?h.error:h.note}>{said.text}</Text>}
  <Text style={r.privacy}>🔒 {t('Фото видит только администратор сервиса')}</Text>
 </View>;
}

const R=T.radius;
const r=StyleSheet.create({
 card:{gap:8,padding:16,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 title:{...type.label,color:C.ink,fontWeight:'600'},
 row:{flexDirection:'row',flexWrap:'wrap',gap:8},
 thumb:{width:72,height:72,borderRadius:R.md},
 big:{width:'100%',height:360,borderRadius:R.md,backgroundColor:C.surfaceAlt},
 remove:{...type.caption,color:C.danger,textAlign:'center'},
 warn:{...type.caption,color:C.danger},
 privacy:{...type.caption,color:C.muted},
});
