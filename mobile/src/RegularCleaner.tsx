import React,{useEffect,useState} from 'react';
import {ThinkingLine} from './Thinking';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {regularBenefits,regularSince} from '../../lib/regular-cleaner-text';
type Row=Record<string,any>;
const R=T.radius,H=T.control;
const ICONS:Record<string,string>={first:'⚡',backup:'🛟',guarantee:'🛡',fee:'％',proof:'📷'};

// «Постоянный исполнитель» for one flat (same screen as components/regular-cleaner.tsx): pin the cleaner the owner
// already works with and see what the pair gets from the service.
export function RegularCleaner({propertyId,onBack}:{propertyId:string;onBack:()=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[confirm,setConfirm]=useState(false);
 async function load(){try{setState(await request('/api/operations/regular/state',{propertyId}));}catch(x:any){setError(x?.message||'Не удалось загрузить.');}}
 useEffect(()=>{load();},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await request(path,{propertyId,...body});setNote(r?.message||'');setConfirm(false);await load();}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const r=state?.regular,benefits=state?regularBenefits(state):[];
 const avatar=(name:string)=><View style={f.avatar}><Text style={f.avatarText}>{(name||'?').slice(0,1)}</Text></View>;
 return <View style={f.sheet}>
  <View style={f.bar}><Pressable accessibilityRole="button" accessibilityLabel="Назад к списку" onPress={onBack} disabled={busy} style={f.round}><Text style={f.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={f.title}>Постоянный исполнитель</Text></View>
  {!state&&!error&&<ThinkingLine style={f.hint} text="Загружаю…"/>}
  {r&&<View style={[f.row,f.pinned]}>{avatar(r.name)}<View style={{flex:1,minWidth:0}}><Text style={f.name}>{r.name}</Text><Text style={f.line}>{regularSince(r)}</Text></View><Text style={f.badge}>Постоянная</Text></View>}
  {state&&!r&&<>
   <Text style={f.hint}>Закрепите исполнителя, с которым уже работаете, и уборки этой квартиры будут сами приходить к нему.</Text>
   {state.candidates.length?state.candidates.map((c:Row)=><View key={c.id} style={f.row}>{avatar(c.name)}<View style={{flex:1,minWidth:0}}><Text style={f.name}>{c.name}</Text><Text style={f.line}>{regularSince(c)}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={'Закрепить '+c.name} disabled={busy} onPress={()=>run('/api/operations/regular/pin',{cleanerId:c.id})} style={[f.send,busy&&f.disabled]}><Text style={f.sendText}>Закрепить</Text></Pressable></View>)
    :<Text style={f.empty}>Пока закрепить некого. После первой уборки через сервис здесь появится тот, кто её сделал.</Text>}
  </>}
  {state&&<><Text style={f.h}>{r?'ЧТО ЭТО ДАЁТ':'ЧТО ДАСТ ЗАКРЕПЛЕНИЕ'}</Text>
   {benefits.map(b=><View key={b.key} style={f.benefit}><View style={[f.ico,b.warn&&f.icoWarn]}><Text style={f.icoText}>{ICONS[b.key]}</Text></View><View style={{flex:1,minWidth:0}}><Text style={[f.name,b.warn&&{color:C.warning}]}>{b.title}</Text><Text style={f.line}>{b.text}</Text></View></View>)}</>}
  {!!note&&<Text accessibilityRole="text" style={f.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={f.error}>{error}</Text>}
  {r&&(confirm?<View style={f.remove}>
   <Text style={f.label}><Text style={{fontWeight:'700'}}>Снять закрепление с {r.name}? </Text>Уже назначенные уборки останутся за ним, новые ИИ будет предлагать лучшим свободным исполнителям.</Text>
   <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>run('/api/operations/regular/unpin',{})} style={f.danger}><Text style={f.dangerText}>{busy?'Снимаю…':'Снять'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(false)} style={f.small}><Text style={f.smallText}>Отмена</Text></Pressable></View>
  </View>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(true)} style={[f.small,{alignSelf:'center'}]}><Text style={f.smallText}>Снять закрепление</Text></Pressable>)}
 </View>;
}
const f=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.title,fontWeight:'700'},
 h:{color:C.muted,...type.caption,fontWeight:'700',marginTop:4},
 hint:{color:C.muted,...type.caption},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 pinned:{borderColor:C.accent,backgroundColor:C.accentSoft},
 avatar:{width:40,height:40,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},avatarText:{color:C.onAccent,...type.body,fontWeight:'700'},
 badge:{paddingHorizontal:8,paddingVertical:4,borderRadius:R.full,backgroundColor:C.surface,color:C.accent,...type.caption,fontWeight:'600',overflow:'hidden'},
 name:{color:C.ink,...type.label,fontWeight:'600'},line:{color:C.muted,...type.caption},label:{color:C.ink,...type.label},
 benefit:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingVertical:4},
 ico:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},icoWarn:{backgroundColor:C.warningSoft},icoText:{...type.label},
 send:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16},sendText:{color:C.onAccent,...type.label,fontWeight:'700'},disabled:{opacity:.45},
 empty:{padding:12,borderRadius:R.md,backgroundColor:C.surfaceAlt,color:C.muted,...type.label},
 small:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:4},smallText:{color:C.muted,...type.label},
 remove:{gap:8,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.danger,backgroundColor:C.dangerSoft},
 danger:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.danger,alignItems:'center',justifyContent:'center',paddingHorizontal:16},dangerText:{color:C.onAccent,...type.label,fontWeight:'700'},
 note:{padding:12,borderRadius:R.md,backgroundColor:C.accentSoft,color:C.ink,...type.label},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
