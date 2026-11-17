// «Залы» of one venue (lib/venue.ts): the owner adds the next hall from one that is already filled in. The address,
// the pin, the photos, the rules and the person on shift come with it; the name, the capacity and the price are the
// hall's own. Each hall is booked on its own and has its own calendar.
import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {T} from './tokens';
type Row=Record<string,any>;

export function VenueHalls({property,call,onBack,onOpen,onChanged}:{property:Row;call:(path:string,body:Row)=>Promise<any>;onBack:()=>void;onOpen?:(id:string)=>void|Promise<void>;onChanged?:(venue:Row|null)=>void}){
 const [venue,setVenue]=useState<Row|null|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[title,setTitle]=useState(''),[name,setName]=useState(''),[naming,setNaming]=useState(false);
 useEffect(()=>{let live=true;call('venue/state',{propertyId:property.id}).then(v=>{if(live){setVenue(v.venue||null);setName(v.venue?.title||property.title||'');}}).catch(x=>{if(live)setError(x?.message||'Не удалось загрузить.');});return()=>{live=false;};},[property.id]); // eslint-disable-line react-hooks/exhaustive-deps
 async function add(){if(busy||!title.trim())return;setBusy(true);setError('');setNote('');try{const r=await call('venue/hall',{propertyId:property.id,title:title.trim(),venueTitle:name.trim()||property.title});setVenue(r.venue);onChanged?.(r.venue);setTitle('');if(onOpen)await onOpen(r.id);else setNote(r.message||'');}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 async function rename(){if(busy||!name.trim())return;setBusy(true);setError('');setNote('');try{const r=await call('venue/rename',{propertyId:property.id,title:name.trim()});setVenue(r.venue);onChanged?.(r.venue);setNote(r.message||'');setNaming(false);}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const halls:Row[]=venue?.halls||[];
 return <View style={f.sheet}>
  <View style={f.bar}><Pressable accessibilityRole="button" accessibilityLabel="Назад к списку" onPress={onBack} disabled={busy} style={f.round}><Text style={f.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={f.title}>Залы</Text></View>
  {venue===undefined&&!error&&<ThinkingLine style={f.hint} text="Загружаю…"/>}
  {venue===null&&<Text style={f.hint}>Если у вас несколько залов или парных по одному адресу, добавьте их сюда. Гость выберет свободный зал, а у каждого будет своя цена и свой календарь.</Text>}
  {!!venue&&<>
   {naming?<View style={f.field}><Text style={f.label}>Название заведения</Text><View style={f.line}><TextInput accessibilityLabel="Название заведения" style={[f.input,{flex:1}]} value={name} onChangeText={setName} maxLength={120}/><Pressable accessibilityRole="button" accessibilityLabel="Сохранить название" disabled={busy||!name.trim()} onPress={rename} style={[f.send,(busy||!name.trim())&&f.off]}><Text style={f.sendText}>Сохранить</Text></Pressable></View></View>
   :<Pressable accessibilityRole="button" accessibilityLabel={'Заведение: '+venue.title+'. Переименовать'} onPress={()=>{setNote('');setNaming(true);}} style={({pressed})=>[f.venue,pressed&&f.pressed]}><View style={{flex:1,minWidth:0}}><Text style={f.label}>ЗАВЕДЕНИЕ</Text><Text numberOfLines={1} style={f.venueTitle}>{venue.title}</Text></View><Text style={f.link}>Изменить</Text></Pressable>}
   {halls.map(h=><Pressable key={h.id} accessibilityRole="button" accessibilityLabel={'Зал: '+h.title+(h.id===property.id?', открыт сейчас':'')} disabled={busy||h.id===property.id||!onOpen} onPress={()=>onOpen?.(h.id)} style={({pressed})=>[f.row,h.id===property.id&&f.current,pressed&&f.pressed]}>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={f.name}>{h.title}</Text><Text style={f.meta}>до {h.capacity} гостей · {Number(h.published)?'гости видят':'черновик'}</Text></View>
    <Text style={f.meta}>{h.id===property.id?'этот зал':'›'}</Text>
   </Pressable>)}
  </>}
  {venue!==undefined&&<>
   {venue===null&&<View style={f.field}><Text style={f.label}>Название заведения</Text><TextInput accessibilityLabel="Название заведения" style={f.input} value={name} onChangeText={setName} maxLength={120} placeholder="Сауна «Жар»" placeholderTextColor={C.muted}/></View>}
   <View style={f.field}><Text style={f.label}>Название нового зала</Text><TextInput accessibilityLabel="Название нового зала" style={f.input} value={title} onChangeText={setTitle} maxLength={120} placeholder="Малый зал" placeholderTextColor={C.muted}/></View>
   <Text style={f.hint}>Адрес, фото, правила и сотрудник скопируются из этого зала. Останется указать вместимость и цену.</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Добавить зал" disabled={busy||!title.trim()} onPress={add} style={[f.primary,(busy||!title.trim())&&f.off]}><Text style={f.primaryText}>{busy?'Добавляю…':'+  Добавить зал'}</Text></Pressable>
  </>}
  {!!note&&<Text accessibilityLiveRegion="polite" style={f.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={f.error}>{error}</Text>}
 </View>;
}
const R=T.radius,H=T.control;
const f=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.title,fontWeight:'700'},hint:{color:C.muted,...type.caption},
 venue:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:R.md,backgroundColor:C.accentSoft},venueTitle:{color:C.ink,...type.body,fontWeight:'700'},link:{color:C.accent,...type.label,fontWeight:'600'},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},current:{borderColor:C.accent},pressed:{backgroundColor:C.surfaceAlt},
 name:{color:C.ink,...type.label,fontWeight:'600'},meta:{color:C.muted,...type.caption},
 field:{gap:4},label:{color:C.muted,...type.caption,fontWeight:'600'},line:{flexDirection:'row',alignItems:'center',gap:8},
 input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 send:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16},sendText:{color:C.onAccent,...type.label,fontWeight:'700'},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24},off:{backgroundColor:C.lineStrong},primaryText:{color:C.onAccent,...type.body,fontWeight:'700'},
 note:{padding:12,borderRadius:R.md,backgroundColor:C.accentSoft,color:C.ink,...type.label},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
