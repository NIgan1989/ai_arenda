import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {pickImages,jpegData} from './ListingMedia';
import {request} from './api';
import {t} from '../../lib/i18n';
import {EditButton,EditChips,EditNote,EditRow,EditSheet,editDot,type EditMenuItem} from './EditSheet';
import {C,type} from './styles';
import {T} from './tokens';

// «Право сдавать жильё» (lib/property-rights.ts): before guests see the place, a person at the platform checks
// a photo of the owner's title or, for one who sublets, the lease with the owner's notarised consent.
// The photos are seen only by the owner and the platform administrators.
export type RightDoc={id:string;kind:'owner'|'sublease';uri:string};
type Doc=RightDoc;
type Kind=Doc['kind'];
// What the server asks for (lib/property-rights.ts), translated when shown.
const NEED=/* i18n */['документ о праве собственности: выписка из eGov, договор купли-продажи или свидетельство','договор аренды и нотариально заверенное согласие собственника на сдачу в субаренду'];void NEED;

// Every row and sheet of one place hears when its documents change, so the row in the list is fresh after the sheet.
const heard=new Set<(id:string)=>void>();

// The documents of a place and what the server asks for. photos=false skips the pictures (the row needs only the count).
// A failed first fetch leaves no documents; reload() throws so the caller can say what went wrong.
export function useRights(propertyId:string,photos=true){
 const [docs,setDocs]=useState<Doc[]>([]),[need,setNeed]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[round,setRound]=useState(0);
 const fetchDocs=useCallback(async()=>{
  const v=await request('/api/operations/rights/'+propertyId,undefined,undefined,undefined,'owner');
  // A document checked by the administrator has no photo any more: only its kind is shown.
  const found:Doc[]=await Promise.all((v?.docs||[]).map(async(d:Doc&{checked_at?:number})=>({...d,uri:d.checked_at||!photos?'':(await request('/api/operations/rights/'+d.id+'/photo',undefined,undefined,undefined,'owner').catch(()=>null))?.data||''})));
  return {need:(v?.need||{}) as Record<string,string>,found};
 },[propertyId,photos]);
 const apply=(v:{need:Record<string,string>;found:Doc[]})=>{setNeed(v.need);setDocs(v.found);};
 useEffect(()=>{let live=true;fetchDocs().then(v=>{if(live)apply(v);}).catch(()=>{}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[fetchDocs,round]);
 const self=useRef<(id:string)=>void>(()=>{});
 useEffect(()=>{const hear=(id:string)=>{if(id===propertyId)setRound(n=>n+1);};self.current=hear;heard.add(hear);return()=>{heard.delete(hear);};},[propertyId]);
 const reload=useCallback(async()=>{apply(await fetchDocs());heard.forEach(f=>{if(f!==self.current)f(propertyId);});},[fetchDocs,propertyId]);
 return {docs,need,loading,reload};
}

// What the card and the sheet share: who the owner is, the photo being added or removed, the page opened large.
function useRightsEdit(propertyId:string){
 const {docs,need,loading,reload}=useRights(propertyId);
 const [kind,setKind]=useState<Kind>('owner'),[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null),[open,setOpen]=useState('');
 // The kind follows what is attached, as it did after every load.
 useEffect(()=>{if(docs[0])setKind(docs[0].kind);},[docs]);
 async function add(){setBusy(true);setSaid(null);try{
  const images=await pickImages(false,1);
  for(const image of images){const v=await request('/api/operations/rights/save',{propertyId,kind,data:await jpegData(image)},undefined,undefined,'owner');setSaid({text:v.message,error:false});}
  if(images.length)await reload();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось приложить фото.'),error:true});}finally{setBusy(false);}}
 async function remove(id:string){setBusy(true);setSaid(null);try{
  const v=await request('/api/operations/rights/remove',{id},undefined,undefined,'owner');setSaid({text:v.message,error:false});await reload();
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не удалось убрать фото.'),error:true});}finally{setBusy(false);}}
 const switching=docs.length>0&&docs[0].kind!==kind;
 const addTitle=docs.length&&!switching?t('Приложить ещё страницу'):t('Приложить фото документа');
 return {docs,need,loading,kind,setKind,busy,said,open,setOpen,add,remove,switching,addTitle};
}

// One line with a dot: checked, waiting for the administrator, or nothing yet. Nothing while the first answer is on its way.
function RightsState({approved,count,loading}:{approved:boolean;count:number;loading:boolean}){
 if(!approved&&loading)return null;
 const [dot,text]=approved?[editDot.ok,t('Документ проверен администратором. Чтобы заменить его, напишите в поддержку.')]
  :count?[editDot.wait,t('Документ приложен. Администратор сверит его вручную, обычно в течение дня.')]
  :[editDot.off,t('По желанию: с документом у жилья будет «Жильё проверено».')];
 return <Text accessibilityLiveRegion="polite" style={r.note}><Text style={{color:dot}}>● </Text>{text}</Text>;
}

// The attached pages in a row; a tap opens one large under them. onRemove puts a small grey «Убрать» under each.
function RightsPages({docs,open,setOpen,busy,onRemove}:{docs:Doc[];open:string;setOpen:(id:string)=>void;busy:boolean;onRemove?:(id:string)=>void}){
 if(!docs.length)return null;
 const big=docs.find(d=>d.id===open);
 return <>
  <View style={r.row}>{docs.map(d=><View key={d.id} style={r.page}>
   <Pressable accessibilityRole="imagebutton" accessibilityLabel={open===d.id?t('Свернуть документ'):t('Открыть документ')} onPress={()=>setOpen(open===d.id?'':d.id)}>{d.uri?<Image source={{uri:d.uri}} style={r.thumb} alt={t('Документ о праве')}/>:<View style={[r.thumb,r.blank]}/>}</Pressable>
   {!!onRemove&&<Pressable accessibilityRole="button" accessibilityLabel={t('Убрать фото документа')} disabled={busy} hitSlop={8} onPress={()=>onRemove(d.id)}><Text style={r.remove}>{t('Убрать')}</Text></Pressable>}
  </View>)}</View>
  {!!big?.uri&&<Pressable accessibilityRole="imagebutton" accessibilityLabel={t('Свернуть документ')} onPress={()=>setOpen('')}><Image source={{uri:big.uri}} style={r.big} resizeMode="contain" alt={t('Документ о праве')}/></Pressable>}
 </>;
}

// The row in the place's editor: «Документ о праве», one grey line with a dot of state, «›» to RightsSheet.
export function RightsRow({propertyId,approved,onPress,last=false}:{propertyId:string;approved:boolean;onPress:()=>void;last?:boolean}){
 const {docs,loading}=useRights(propertyId,false);
 const [line,dot]:[string,string|false]=approved?[t('Проверен'),editDot.ok]:loading?['',false]:docs.length?[t('На проверке'),editDot.wait]:[t('Не приложен · по желанию'),editDot.off];
 return <EditRow icon="badge" title={t('Документ о праве')} line={line||undefined} dot={dot} onPress={onPress} last={last}/>;
}

// The sheet of the document: the state, who you are, what photo is needed, the pages; «Приложить» pinned at the bottom,
// removing a page in «⋯».
export function RightsSheet({propertyId,approved,onBack,onClose}:{propertyId:string;approved:boolean;onBack:()=>void;onClose:()=>void}){
 const x=useRightsEdit(propertyId);
 const menu:EditMenuItem[]=approved?[]:x.docs.map((d,i)=>({title:x.docs.length>1?t('Убрать страницу {n}',{n:i+1}):t('Убрать фото документа'),icon:'trash',danger:true,onPress:()=>void x.remove(d.id)}));
 const foot=!approved&&x.docs.length<4?<EditButton title={x.addTitle} busy={x.busy&&t('Прикладываю…')} onPress={()=>void x.add()}/>:undefined;
 return <EditSheet title={t('Документ о праве')} onBack={onBack} onClose={onClose} menu={menu} foot={foot} busy={x.busy}>
  <RightsState approved={approved} count={x.docs.length} loading={x.loading}/>
  {!approved&&<EditChips label={t('Кто вы')} value={x.kind} options={[['owner',t('Я собственник')],['sublease',t('Сдаю в субаренду')]]} onChange={x.setKind} disabled={x.busy}/>}
  {!approved&&!!x.need[x.kind]&&<Text style={r.note}>{t('Нужно фото: {v}.',{v:t(x.need[x.kind])})}</Text>}
  <RightsPages docs={x.docs} open={x.open} setOpen={x.setOpen} busy={x.busy}/>
  {x.switching&&<Text style={r.note}><Text style={{color:editDot.missing}}>● </Text>{t('Новое фото заменит уже приложенные документы.')}</Text>}
  {!!x.said&&<EditNote text={x.said.text} tone={x.said.error?'error':undefined}/>}
  <Text style={r.note}>{t('Фото видит только администратор сервиса')}</Text>
 </EditSheet>;
}

// The inline card (PropertyQuick, FlatHub): the same pieces with one line of state and the outlined button inside.
export function RightDocs({propertyId,approved}:{propertyId:string;approved:boolean}){
 const x=useRightsEdit(propertyId);
 return <View style={r.card}>
  <Text accessibilityRole="header" style={r.title}>{t('Право сдавать жильё')}</Text>
  <RightsState approved={approved} count={x.docs.length} loading={x.loading}/>
  {!approved&&<EditChips label={t('Кто вы')} value={x.kind} options={[['owner',t('Я собственник')],['sublease',t('Сдаю в субаренду')]]} onChange={x.setKind} disabled={x.busy}/>}
  {!approved&&!!x.need[x.kind]&&<Text style={r.note}>{t('Нужно фото: {v}.',{v:t(x.need[x.kind])})}</Text>}
  {x.switching&&<Text style={r.note}><Text style={{color:editDot.missing}}>● </Text>{t('Новое фото заменит уже приложенные документы.')}</Text>}
  <RightsPages docs={x.docs} open={x.open} setOpen={x.setOpen} busy={x.busy} onRemove={approved?undefined:id=>void x.remove(id)}/>
  {!approved&&x.docs.length<4&&<EditButton line title={x.addTitle} busy={x.busy&&t('Прикладываю…')} onPress={()=>void x.add()}/>}
  {!!x.said&&<EditNote text={x.said.text} tone={x.said.error?'error':undefined}/>}
 </View>;
}

const R=T.radius;
const r=StyleSheet.create({
 card:{gap:12,padding:16,borderRadius:R.lg,borderWidth:StyleSheet.hairlineWidth,borderColor:C.lineStrong,backgroundColor:C.surface},
 title:{...type.label,color:C.ink,fontWeight:'600'},
 note:{...type.label,color:C.muted},
 row:{flexDirection:'row',flexWrap:'wrap',gap:8},
 page:{gap:4,alignItems:'center'},
 thumb:{width:72,height:72,borderRadius:R.md,borderWidth:StyleSheet.hairlineWidth,borderColor:C.lineStrong},
 blank:{backgroundColor:C.surfaceAlt},
 big:{width:'100%',height:360,borderRadius:R.md,backgroundColor:C.surfaceAlt},
 remove:{...type.caption,color:C.muted,textAlign:'center'},
});
