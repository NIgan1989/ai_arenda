import React,{useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {s} from './styles';
import type {Row} from './model';
export function AssistantControl({settings,busy,onSave}:{settings:Row;busy:boolean;onSave:(body:Row)=>void}){
  const [values,setValues]=useState<Row>({...settings});
  const toggle=(key:string,label:string)=><Pressable accessibilityRole="checkbox" accessibilityState={{checked:!!values[key]}} disabled={busy} onPress={()=>setValues(v=>({...v,[key]:!v[key]}))}><Text style={s.text}>{values[key]?'☑':'☐'} {label}</Text></Pressable>;
  return <View style={s.card}><Text style={s.cardTitle}>Инициативность ассистента</Text><Text style={s.meta}>Настройки сохраняются отдельно для текущей роли.</Text>{[{id:'reactive',label:'По запросу'},{id:'important',label:'Только важное'},{id:'proactive',label:'Инициативный'}].map(mode=><Pressable key={mode.id} accessibilityRole="radio" accessibilityState={{checked:values.mode===mode.id}} disabled={busy} style={[s.button,s.secondary]} onPress={()=>setValues(v=>({...v,mode:mode.id}))}><Text style={s.secondaryText}>{values.mode===mode.id?'● ':'○ '}{mode.label}</Text></Pressable>)}
    {[{key:'leadMinutes',label:'Напоминать заранее, минут'},{key:'repeatMinutes',label:'Повторять не чаще, минут'},{key:'quietStart',label:'Тихие часы с, ЧЧ:ММ'},{key:'quietEnd',label:'Тихие часы до, ЧЧ:ММ'}].map(f=><View key={f.key}><Text style={s.fieldLabel}>{f.label}</Text><TextInput accessibilityLabel={f.label} style={s.field} editable={!busy} value={String(values[f.key])} onChangeText={text=>setValues(v=>({...v,[f.key]:text}))}/></View>)}
    {toggle('quietEnabled','Тихие часы для обычных подсказок')}{toggle('urgentInQuiet','Показывать срочные задержки в тихие часы')}
    <Text style={s.meta}>Время Казахстана, UTC+5. Подсказки работают при открытом приложении. Режим не разрешает списание денег или подтверждение фактических действий.</Text>
    <Pressable accessibilityRole="button" disabled={busy} style={[s.button,busy&&s.disabled]} onPress={()=>onSave({...values,leadMinutes:Number(values.leadMinutes),repeatMinutes:Number(values.repeatMinutes),expectedVersion:settings.version})}><Text style={s.buttonText}>Сохранить настройки ассистента</Text></Pressable>
    <Text style={s.cardTitle}>Следующие подключения</Text><Text style={s.meta}>Свободная модель и её инструменты, круглосуточный обработчик событий, мессенджеры, банковские подтверждения и фотоотчёты пока не подключены. Разрешение на автоподтверждение брони задаёт владелец в правилах квартиры.</Text>
  </View>;
}
