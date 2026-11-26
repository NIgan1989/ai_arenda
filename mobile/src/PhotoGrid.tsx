import {t} from '../../lib/i18n';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {Thinking} from './Thinking';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {menuIcons} from './AccountRows';
import {EditNote} from './EditSheet';
import {Photo,pickImages,uploadImage} from './ListingMedia';
const R=T.radius,GAP=8;

// Photos of a place as an even grid of three (board «Фотографии», 2026-11-26; Airbnb's photo tour): the first one is
// the cover and says so, the star on another makes it the cover, ✕ removes it. Until there are as many photos as `slots`
// the free cells name what to shoot («Кухня», «Санузел»); a tap on one opens the gallery, the camera has its own cell.
// Several photos can be picked at once; each shows as a grey tile until it is saved.
// `pickRef` lets a button outside the grid (the sheet's pinned «Добавить фото») open the same picker.
export function PhotoGrid({photos,onChange,max=8,onBusy,disabled=false,slots,pickRef}:{photos:string[];onChange:(photos:string[])=>void;max?:number;onBusy?:(busy:boolean)=>void;disabled?:boolean;slots?:string[];pickRef?:React.MutableRefObject<((camera:boolean)=>void)|null>}){
 const [width,setWidth]=useState(0),[pending,setPending]=useState(0),[error,setError]=useState('');
 const list=useRef(photos),working=useRef(false);
 useLayoutEffect(()=>{list.current=photos;},[photos]);
 async function add(camera:boolean){
  // A call from outside while a pick runs or the grid is full does nothing: the cells are disabled then too.
  if(disabled||working.current||list.current.length>=max)return;
  working.current=true;setError('');let failed=0,first='';
  try{
   const assets=await pickImages(camera,max-list.current.length);if(!assets.length)return;
   setPending(assets.length);onBusy?.(true);
   for(const a of assets){try{const id=await uploadImage(a,'property');if(!list.current.includes(id)&&list.current.length<max){list.current=[...list.current,id];onChange(list.current);}}catch(e:any){failed++;first=first||e?.message||'';}finally{setPending(n=>Math.max(0,n-1));}}
   onBusy?.(false);
  }catch(e:any){first=e?.message||t('Не удалось открыть фото.');failed=failed||1;}
  finally{working.current=false;}
  if(failed)setError(failed===1?first||t('Фото не загрузилось.'):t('Не загрузились {failed} фото. {first}',{failed,first}));
 }
 if(pickRef)pickRef.current=add;
 const names=slots||[t('Комната'),t('Кухня'),t('Санузел'),t('Вид из окна'),t('Вход')];
 const cell=width?Math.floor((width-2*GAP)/3):0,size={width:cell,height:cell},used=photos.length+pending,room=used<max,off=disabled||pending>0;
 // The free cells: one per name still unshot, or one plain «+» once the named ones are filled.
 const free=room?names.slice(used,Math.min(names.length,max)):[],more=room&&!free.length;
 return <View style={g.box} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
  {width>0&&<View style={g.grid}>
   {photos.map((id,i)=><View key={id} style={[g.tile,size]}>
    <Photo id={id} alt={i===0?t('Обложка'):t('Фото {v}',{v:(i+1)})} fill/>
    {i===0?<View style={g.badge}><Text style={g.badgeText}>{t('Обложка')}</Text></View>
     :<Pressable accessibilityRole="button" accessibilityLabel={t('Сделать фото {v} обложкой',{v:(i+1)})} disabled={disabled} hitSlop={6} onPress={()=>onChange([id,...photos.filter(x=>x!==id)])} style={[g.round,g.left]}><Image source={menuIcons.star} style={g.roundIcon} accessibilityElementsHidden importantForAccessibility="no"/></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel={t('Убрать фото {v}',{v:(i+1)})} disabled={disabled} hitSlop={6} onPress={()=>onChange(photos.filter(x=>x!==id))} style={[g.round,g.right]}><Text style={g.roundText}>✕</Text></Pressable>
   </View>)}
   {Array.from({length:pending},(_,i)=><View key={'wait'+i} accessibilityLabel={t('Фото загружается')} style={[g.tile,g.wait,size]}><Thinking/></View>)}
   {free.map((name,i)=><Pressable key={'free'+(used+i)}accessibilityRole="button" accessibilityLabel={t('Добавить фото')+': '+name} disabled={off} onPress={()=>void add(false)} style={({pressed})=>[g.tile,g.empty,size,(pressed||off)&&g.dim]}><Image source={menuIcons.plus} style={g.emptyIcon} accessibilityElementsHidden importantForAccessibility="no"/><Text numberOfLines={2} style={g.emptyText}>{name}</Text></Pressable>)}
   {more&&<Pressable accessibilityRole="button" accessibilityLabel={t('Добавить ещё фото')} disabled={off} onPress={()=>void add(false)} style={({pressed})=>[g.tile,g.empty,size,(pressed||off)&&g.dim]}><Image source={menuIcons.plus} style={g.emptyIcon} accessibilityElementsHidden importantForAccessibility="no"/><Text style={g.emptyText}>{t('Ещё')}</Text></Pressable>}
   {room&&<Pressable accessibilityRole="button" accessibilityLabel={t('Снять фото камерой')} disabled={off} onPress={()=>void add(true)} style={({pressed})=>[g.tile,g.empty,size,(pressed||off)&&g.dim]}><Image source={menuIcons.camera} style={g.cameraIcon} accessibilityElementsHidden importantForAccessibility="no"/><Text style={g.cameraText}>{t('Снять')}</Text></Pressable>}
  </View>}
  <Text style={g.count}>{t('{n} из {max}',{n:photos.length,max})}</Text>
  {!!error&&<EditNote tone="error" text={error}/>}
 </View>;
}
const g=StyleSheet.create({
 box:{gap:GAP},grid:{flexDirection:'row',flexWrap:'wrap',gap:GAP},
 tile:{borderRadius:R.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
 wait:{alignItems:'center',justifyContent:'center'},
 // An empty cell is only outlined: a grey line, a plus or the camera, the grey name of what to shoot.
 empty:{alignItems:'center',justifyContent:'center',gap:4,padding:8,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 emptyIcon:{width:20,height:20,tintColor:C.muted},emptyText:{...type.caption,color:C.muted,textAlign:'center'},
 cameraIcon:{width:24,height:24,tintColor:C.ink},cameraText:{...type.caption,color:C.ink,fontWeight:'600'},
 badge:{position:'absolute',left:4,bottom:4,paddingHorizontal:8,paddingVertical:2,borderRadius:R.full,backgroundColor:'rgba(14,19,36,0.72)'},badgeText:{color:C.surface,...type.caption,fontWeight:'600'},
 round:{position:'absolute',top:4,width:28,height:28,borderRadius:R.full,backgroundColor:'rgba(14,19,36,0.55)',alignItems:'center',justifyContent:'center'},left:{left:4},right:{right:4},
 roundText:{color:C.surface,...type.label,fontWeight:'700'},roundIcon:{width:16,height:16,tintColor:C.surface},
 count:{color:C.muted,...type.caption},
 dim:{opacity:.5},
});
