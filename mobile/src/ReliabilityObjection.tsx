import {dateText,t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {request} from './api';
import {C,s} from './styles';

// «Не согласен с оценкой» under the reliability rating (lib/reliability-objection.ts). The rating is computed by rules,
// so the person can object in their own words; the administrator answers within three working days.
type Objection={status:'open'|'answered';body:string;dueAt:number;answer:string|null}|null;
const day=(t:number)=>dateText(new Date(t*1000),{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});

export function ReliabilityObjection({role}:{role:string}){
 const [objection,setObjection]=useState<Objection>(null),[open,setOpen]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{request('/api/reliability/objection',undefined,undefined,undefined,role).then(r=>setObjection(r?.objection||null)).catch(()=>{});},[role]);
 const send=async()=>{
  setBusy(true);setError('');
  try{const r=await request('/api/reliability/objection',{text},undefined,undefined,role);setObjection(r?.objection||null);setOpen(false);setText('');}
  catch(e){setError((e as Error).message||t('Не получилось отправить.'));}
  finally{setBusy(false);}
 };
 if(objection?.status==='open')return <View style={{gap:4,marginTop:12}}><Text style={[s.text,{fontWeight:'600'}]}>{t('Возражение на рассмотрении')}</Text><Text style={s.meta}>{t('Администратор ответит до {day}. Ответ придёт в уведомлениях.',{day:day(objection.dueAt)})}</Text></View>;
 return <View style={{gap:8,marginTop:12}}>
  {objection?.status==='answered'&&!!objection.answer&&<View style={{gap:4}}><Text style={[s.text,{fontWeight:'600'}]}>{t('Ответ на ваше возражение')}</Text><Text style={s.meta}>{objection.answer}</Text></View>}
  {!open?<Pressable accessibilityRole="button" onPress={()=>setOpen(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={[s.meta,{color:C.accent}]}>{t('Не согласен с оценкой')}</Text></Pressable>:<>
   <Text style={s.meta}>{t('Оценку считает сервис по правилам из истории броней и уборок. Напишите, с чем вы не согласны. Администратор проверит и ответит в течение 3 рабочих дней.')}</Text>
   <TextInput accessibilityLabel={t('Возражение на оценку')} value={text} onChangeText={setText} multiline maxLength={2000} placeholder={t('Например: спор при выезде был по ошибке')} placeholderTextColor={C.muted} style={[s.field,{minHeight:96,textAlignVertical:'top'}]}/>
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
   <View style={s.buttonRow}>
    <Pressable accessibilityRole="button" disabled={busy||text.trim().length<10} onPress={()=>void send()} style={[s.button,(busy||text.trim().length<10)&&s.disabled]}><Text style={s.buttonText}>{busy?t('Отправляю…'):t('Отправить')}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setOpen(false);setError('');}} style={[s.button,s.secondary]}><Text style={[s.buttonText,s.secondaryText]}>{t('Отмена')}</Text></Pressable>
   </View>
  </>}
 </View>;
}
