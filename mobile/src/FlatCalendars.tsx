import React,{useEffect,useState} from 'react';
import {ThinkingLine} from './Thinking';
import {Pressable,Share,StyleSheet,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {calendarStatus,CALENDAR_HELP} from '../../lib/flat-calendars';
type Row=Record<string,any>;
const R=T.radius,H=T.control;

// Linking a flat with its listings on other platforms (same screen as components/flat-calendars.tsx):
// paste the platform's link here, send this service's link there.
export function FlatCalendars({propertyId,onBack}:{propertyId:string;onBack:()=>void}){
 const [state,setState]=useState<Row|null>(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[link,setLink]=useState(''),[help,setHelp]=useState(false);
 async function load(){try{setState(await request('/api/operations/calendar/flat',{propertyId}));}catch(x:any){setError(x?.message||'Не удалось загрузить календари.');}}
 useEffect(()=>{load();},[propertyId]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNote('');try{await action();await load();}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const connect=()=>run(async()=>{const r=await request('/api/operations/calendar/connect',{propertyId,url});setNote(r.message);if(!r.failed)setUrl('');});
 const toggle=(s:Row)=>run(async()=>{const r=await request('/api/operations/calendar/source',{id:s.id,propertyId,label:s.label,expectedVersion:s.version,enabled:!s.enabled});setNote(r.message||'');});
 const share=()=>run(async()=>{const r=await request('/api/operations/calendar/export',{propertyId});setLink(r.url);});
 return <View style={f.sheet}>
  <View style={f.bar}><Pressable accessibilityRole="button" accessibilityLabel="Назад к списку" onPress={onBack} disabled={busy} style={f.round}><Text style={f.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={f.title}>Календари площадок</Text></View>
  <Text style={f.hint}>Если квартира есть на Airbnb, Booking или Суточно, свяжите календари, и одну квартиру не забронируют дважды.</Text>
  <Text style={f.h}>ЗАНЯТОСТЬ С ДРУГИХ ПЛОЩАДОК</Text>
  {!state&&!error&&<ThinkingLine style={f.hint} text="Загружаю…"/>}
  {(state?.sources||[]).map((s:Row)=>{const st=calendarStatus(s);return <View key={s.id} style={[f.row,st.tone==='warn'&&f.rowWarn,st.tone==='off'&&f.rowOff]}>
   <View style={[f.ico,st.tone==='warn'&&f.icoWarn]}><Text style={f.icoText}>📅</Text></View>
   <View style={{flex:1,minWidth:0}}><Text style={f.name}>{s.label}</Text><Text style={[f.line,st.tone==='ok'&&f.lineOk,st.tone==='warn'&&f.lineWarn]}>{st.text}</Text></View>
   {s.automatic===1&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>toggle(s)} style={f.small}><Text style={f.smallText}>{s.enabled?'Отключить':'Включить'}</Text></Pressable>}
  </View>;})}
  <View style={{gap:4}}><Text style={f.label}>Ссылка на календарь площадки</Text><TextInput accessibilityLabel="Ссылка на календарь площадки" style={f.input} value={url} onChangeText={setUrl} maxLength={2000} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://www.airbnb.ru/calendar/ical/…" placeholderTextColor={C.muted}/></View>
  <Pressable accessibilityRole="button" onPress={()=>setHelp(v=>!v)} style={f.small}><Text style={f.link}>{help?'Скрыть подсказку':'Где взять ссылку'}</Text></Pressable>
  {help&&<View style={{gap:4}}>{CALENDAR_HELP.map(h=><Text key={h.name} style={f.hint}><Text style={{fontWeight:'700'}}>{h.name}: </Text>{h.where}</Text>)}</View>}
  <Pressable accessibilityRole="button" disabled={busy||!url.trim()} onPress={connect} style={[f.primary,(busy||!url.trim())&&f.disabled]}><Text style={f.primaryText}>{busy?'Подключаю…':'Подключить'}</Text></Pressable>
  <Text style={f.h}>ССЫЛКА ДЛЯ ДРУГИХ ПЛОЩАДОК</Text>
  <Text style={f.hint}>Вставьте её в импорт календаря на Airbnb или Booking, тогда брони отсюда закроют даты и там. В ссылке только занятые даты, без имён и адресов.</Text>
  {link?<><Text selectable style={f.linkBox}>{link}</Text><Pressable accessibilityRole="button" onPress={()=>Share.share({message:link}).catch(()=>{})} style={f.primary}><Text style={f.primaryText}>Отправить ссылку</Text></Pressable></>
   :<Pressable accessibilityRole="button" disabled={busy} onPress={share} style={f.ghost}><Text style={f.ghostText}>Получить ссылку</Text></Pressable>}
  {!!note&&<Text accessibilityRole="text" style={f.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={f.error}>{error}</Text>}
 </View>;
}
const f=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.title,fontWeight:'700'},
 h:{color:C.muted,...type.caption,fontWeight:'700',marginTop:4},
 hint:{color:C.muted,...type.caption},
 row:{flexDirection:'row',alignItems:'center',gap:8,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 rowWarn:{borderColor:C.warningLine},rowOff:{opacity:.7},
 ico:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},icoWarn:{backgroundColor:C.warningSoft},icoText:{...type.label},
 name:{color:C.ink,...type.label,fontWeight:'600'},line:{color:C.muted,...type.caption},lineOk:{color:C.success},lineWarn:{color:C.warning},
 small:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:4},smallText:{color:C.muted,...type.label},link:{color:C.accent,...type.label,fontWeight:'600'},
 label:{color:C.muted,...type.caption,fontWeight:'600'},
 input:{minHeight:H.field,paddingHorizontal:16,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,color:C.ink,...type.body},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:24},primaryText:{color:C.onAccent,...type.body,fontWeight:'700'},disabled:{backgroundColor:C.lineStrong},
 ghost:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center',paddingHorizontal:24},ghostText:{color:C.ink,...type.body,fontWeight:'700'},
 linkBox:{padding:12,borderRadius:R.md,backgroundColor:C.surfaceAlt,color:C.ink,...type.caption},
 note:{padding:12,borderRadius:R.md,backgroundColor:C.accentSoft,color:C.ink,...type.label},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
