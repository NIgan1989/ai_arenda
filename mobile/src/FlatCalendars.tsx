import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {ThinkingLine} from './Thinking';
import {Pressable,Share,StyleSheet,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {calendarStatus,CALENDAR_HELP} from '../../lib/flat-calendars';
import {EditButton,EditNote,EditRow,EditSheet,editDot,editStyles as e} from './EditSheet';
type Row=Record<string,any>;
const R=T.radius,H=T.control;

// Linking a flat with its listings on other platforms (same screen as components/flat-calendars.tsx), as one sheet
// (board «Экраны старой версии», Luma's «Calendars»): the connected platforms are rows with when they were last
// read, the link for other platforms is one row with «Скопировать», and «Подключить площадку» at the bottom opens
// the step of pasting a link, whose «‹» comes back to the list.
export function FlatCalendars({propertyId,onBack,onClose}:{propertyId:string;onBack:()=>void;onClose:()=>void}){
 const [state,setState]=useState<Row|null>(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[link,setLink]=useState(''),[help,setHelp]=useState(false),[adding,setAdding]=useState(false);
 async function load(){try{setState(await request('/api/operations/calendar/flat',{propertyId}));}catch(x:any){setError(x?.message||t('Не удалось загрузить календари.'));}}
 useEffect(()=>{load();},[propertyId]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNote('');try{await action();await load();}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 // A link that connected takes the owner back to the list, where the new platform now stands.
 const connect=()=>run(async()=>{const r=await request('/api/operations/calendar/connect',{propertyId,url});setNote(r.message);if(!r.failed){setUrl('');setAdding(false);}});
 const toggle=(s:Row)=>run(async()=>{const r=await request('/api/operations/calendar/source',{id:s.id,propertyId,label:s.label,expectedVersion:s.version,enabled:!s.enabled});setNote(r.message||'');});
 // «Скопировать»: the first press asks for the link, then the system share sheet (with its «Copy») sends it on.
 const send=(v:string)=>{Share.share({message:v}).catch(()=>{});};
 const copy=()=>link?send(link):run(async()=>{const r=await request('/api/operations/calendar/export',{propertyId});setLink(r.url);if(r.url)send(r.url);});
 const sources:Row[]=state?.sources||[];
 const foot=adding?<EditButton title={t('Подключить')} busy={busy&&t('Подключаем…')} disabled={!url.trim()} onPress={connect}/>
  :<EditButton title={t('Подключить площадку')} disabled={busy} onPress={()=>{setNote('');setError('');setAdding(true);}}/>;
 return <EditSheet title={adding?t('Подключить площадку'):t('Календари площадок')} onBack={adding?()=>setAdding(false):onBack} onClose={onClose} foot={foot} busy={busy}>
  {adding?<>
   <View style={e.field}><Text style={e.label}>{t('Ссылка на календарь площадки')}</Text><TextInput accessibilityLabel={t('Ссылка на календарь площадки')} style={e.input} value={url} onChangeText={setUrl} maxLength={2000} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://www.airbnb.ru/calendar/ical/…" placeholderTextColor={C.muted}/></View>
   <View>
    <EditRow title={t('Где взять ссылку')} line={CALENDAR_HELP.map(h=>h.name).join(', ')} onPress={()=>setHelp(v=>!v)} last={!help}/>
    {help&&<View style={f.help}>{CALENDAR_HELP.map(h=><Text key={h.name} style={e.note}><Text style={f.name}>{h.name}: </Text>{h.where}</Text>)}</View>}
   </View>
  </>:<>
   {!state&&!error&&<ThinkingLine style={e.note} text={t('Загружаем…')}/>}
   {!!state&&!sources.length&&<EditNote text={t('Если жильё есть на Airbnb, Booking или Суточно, свяжите календари, и одно жильё не забронируют дважды.')}/>}
   <View>
    {sources.map(s=>{const st=calendarStatus(s);return <EditRow key={s.id} icon="calendar" title={s.label} line={st.text} dot={st.tone==='warn'?editDot.wait:st.tone==='off'?editDot.off:false}
     right={s.automatic===1?<Pressable accessibilityRole="button" accessibilityLabel={(s.enabled?t('Отключить'):t('Включить'))+': '+s.label} disabled={busy} onPress={()=>toggle(s)} hitSlop={4} style={({pressed})=>[f.quiet,(pressed||busy)&&e.dim]}><Text style={f.quietText}>{s.enabled?t('Отключить'):t('Включить')}</Text></Pressable>:undefined}/>;})}
    <EditRow icon="send" title={t('Ссылка для других площадок')} line={link||t('Только занятые даты, без имён и адресов')} last
     right={<Pressable accessibilityRole="button" accessibilityLabel={t('Скопировать')} disabled={busy} onPress={copy} style={({pressed})=>[f.copy,(pressed||busy)&&e.dim]}><Text style={f.copyText}>{t('Скопировать')}</Text></Pressable>}/>
   </View>
  </>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
const f=StyleSheet.create({
 // The help opens under its row, in line with the row's text.
 help:{gap:8,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.line},
 name:{color:C.ink,fontWeight:'600'},
 // A quiet word at the row's end: switching a platform off is rare, so it does not look like a button.
 quiet:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:4},quietText:{...type.label,color:C.muted},
 copy:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 copyText:{...type.label,color:C.ink,fontWeight:'600'},
});
