import React,{useLayoutEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo,pickImages,uploadImage} from './ListingMedia';
const R=T.radius,GAP=8;

// Photos of a flat as one grid: the first is the cover and is drawn big, ★ moves a photo there, ✕ removes it.
// Several photos can be picked at once from the gallery; each shows as a loading tile until it is saved.
export function PhotoGrid({photos,onChange,max=8,onBusy,disabled=false}:{photos:string[];onChange:(photos:string[])=>void;max?:number;onBusy?:(busy:boolean)=>void;disabled?:boolean}){
 const [width,setWidth]=useState(0),[pending,setPending]=useState(0),[error,setError]=useState('');
 const list=useRef(photos);
 useLayoutEffect(()=>{list.current=photos;},[photos]);
 async function add(camera:boolean){
  setError('');let failed=0,first='';
  try{
   const assets=await pickImages(camera,max-list.current.length);if(!assets.length)return;
   setPending(assets.length);onBusy?.(true);
   for(const a of assets){try{const id=await uploadImage(a,'property');if(!list.current.includes(id)&&list.current.length<max){list.current=[...list.current,id];onChange(list.current);}}catch(e:any){failed++;first=first||e?.message||'';}finally{setPending(n=>Math.max(0,n-1));}}
   onBusy?.(false);
  }catch(e:any){first=e?.message||'Не удалось открыть фото.';failed=failed||1;}
  if(failed)setError(failed===1?first||'Фото не загрузилось.':'Не загрузились '+failed+' фото. '+first);
 }
 const cell=width?(width-2*GAP)/3:0,big=cell*2+GAP,room=photos.length+pending<max;
 const tile=(id:string,i:number,size:number)=><View key={id} style={[g.tile,{width:size,height:size}]}>
  <Photo id={id} alt={i===0?'Обложка':'Фото '+(i+1)} fill/>
  {i===0?<View style={g.badge}><Text style={g.badgeText}>★ Обложка</Text></View>:<Pressable accessibilityRole="button" accessibilityLabel={'Сделать фото '+(i+1)+' обложкой'} disabled={disabled} hitSlop={6} onPress={()=>onChange([id,...photos.filter(x=>x!==id)])} style={[g.round,g.left]}><Text style={g.roundText}>☆</Text></Pressable>}
  <Pressable accessibilityRole="button" accessibilityLabel={'Убрать фото '+(i+1)} disabled={disabled} hitSlop={6} onPress={()=>onChange(photos.filter(x=>x!==id))} style={[g.round,g.right]}><Text style={g.roundText}>✕</Text></Pressable>
 </View>;
 const extra=[...Array.from({length:pending},(_,i)=><View key={'wait'+i} accessibilityLabel="Фото загружается" style={[g.tile,g.wait,{width:cell,height:cell}]}><ActivityIndicator color={C.accent}/></View>),
  room&&photos.length>0?<Pressable key="add" accessibilityRole="button" accessibilityLabel="Добавить ещё фото" disabled={disabled||pending>0} onPress={()=>add(false)} style={[g.tile,g.add,{width:cell,height:cell}]}><Text style={g.addIcon}>＋</Text><Text style={g.addText}>Ещё</Text></Pressable>:null].filter(Boolean) as React.ReactElement[];
 const rest=[...photos.slice(3).map((id,i)=>tile(id,i+3,cell)),...extra];
 return <View style={g.box} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
  {!photos.length&&!pending?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>add(false)} style={g.empty}><Text style={g.addIcon}>📷</Text><Text style={g.emptyTitle}>Добавить фото</Text><Text style={g.hint}>Можно выбрать сразу несколько</Text></Pressable>
  :width>0&&<>
   <View style={g.row}>{photos[0]?tile(photos[0],0,big):null}<View style={{gap:GAP}}>{photos.slice(1,3).map((id,i)=>tile(id,i+1,cell))}{photos.length<3&&extra.slice(0,3-photos.length)}</View></View>
   <View style={[g.row,g.wrap]}>{photos.length<3?extra.slice(3-photos.length):rest}</View>
  </>}
  <View style={g.foot}><Text style={g.count}>{photos.length} из {max}</Text><Pressable accessibilityRole="button" disabled={disabled||!room||pending>0} onPress={()=>add(true)} style={g.camera}><Text style={g.cameraText}>📸 Снять</Text></Pressable></View>
  <Text style={g.hint}>Первое фото — обложка. ☆ на снимке делает его первым.</Text>
  {!!error&&<Text accessibilityRole="alert" style={g.error}>{error}</Text>}
 </View>;
}
const g=StyleSheet.create({
 box:{gap:GAP},row:{flexDirection:'row',gap:GAP},wrap:{flexWrap:'wrap'},
 tile:{borderRadius:R.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
 wait:{alignItems:'center',justifyContent:'center',backgroundColor:C.accentSoft},
 add:{alignItems:'center',justifyContent:'center',gap:4,borderWidth:2,borderStyle:'dashed',borderColor:C.accentLine,backgroundColor:C.accentSoft},
 addIcon:{color:C.accent,...type.title},addText:{color:C.accent,...type.label,fontWeight:'700'},
 empty:{minHeight:144,alignItems:'center',justifyContent:'center',gap:4,borderRadius:R.md,borderWidth:2,borderStyle:'dashed',borderColor:C.accentLine,backgroundColor:C.accentSoft},
 emptyTitle:{color:C.accent,...type.body,fontWeight:'700'},
 badge:{position:'absolute',left:8,bottom:8,paddingHorizontal:8,paddingVertical:2,borderRadius:R.full,backgroundColor:'rgba(14,19,36,0.62)'},badgeText:{color:C.onAccent,...type.caption,fontWeight:'600'},
 round:{position:'absolute',top:4,width:32,height:32,borderRadius:R.full,backgroundColor:'rgba(14,19,36,0.55)',alignItems:'center',justifyContent:'center'},left:{left:4},right:{right:4},
 roundText:{color:C.onAccent,...type.label,fontWeight:'700'},
 foot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 count:{color:C.inkSoft,...type.caption,fontWeight:'600',backgroundColor:C.surfaceAlt,borderRadius:R.full,paddingHorizontal:8,overflow:'hidden'},
 camera:{minHeight:T.control.compact,justifyContent:'center',paddingHorizontal:12},cameraText:{color:C.accent,...type.label,fontWeight:'600'},
 hint:{color:C.muted,...type.caption},
 error:{color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12,...type.label}
});
