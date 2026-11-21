import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {Group,RowIcon,SwitchRow,a} from './AccountRows';
import {ThinkingLine} from './Thinking';
import {request} from './api';
import {s} from './styles';
import type {Row} from './model';

// «Автопилот: решения и сроки», as on the site (components/decision-rules.tsx). Every question the AI administrator
// waits on a person for: whether the AI decides by itself when nobody answers, and how long it waits. Saved at once.
export function NativeDecisionRules({tint}:{tint:string}){
 const [rules,setRules]=useState<Row[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;request('/api/operations/decision-rules/state').then(v=>{if(live)setRules(v.rules);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 async function save(rule:Row,patch:Row){
  if(busy||!rules)return;const before=rules;setBusy(rule.key);setError('');setMessage('');
  setRules(rules.map(r=>r.key===rule.key?{...r,...patch}:r));
  try{const r=await request('/api/operations/decision-rules',{rule:rule.key,...patch});setRules(r.rules);setMessage(r.message||t('Сохранено.'));}catch(e:any){setRules(before);setError(e.message);}finally{setBusy('');}
 }
 if(!rules)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:<ThinkingLine style={s.meta} text={t('Загружаю настройки…')}/>;
 return <View>
  <Text style={a.footnote}>{t('Когда ИИ-администратор ждёт чьего-то ответа, здесь видно, сколько он ждёт и что делает дальше. Без ответа ИИ решает сам только там, где это включено.')}</Text>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
  {rules.map(r=><View key={r.key} accessibilityLabel={r.title}><Group space>
   {r.auto?<SwitchRow icon="sparkles" tint={tint} title={r.title} note={r.auto} checked={!!r.on} disabled={!!busy} onChange={v=>save(r,{on:v})}/>
    :<View style={a.row}><RowIcon icon="sparkles" tint={tint}/><Text style={[a.title,a.wide]}>{r.title}</Text></View>}
   {/* The time sits under its label: four choices do not fit beside it on a phone. */}
   <View style={[a.row,{flexWrap:'wrap',rowGap:8}]}><RowIcon icon="clock" tint={tint}/><Text style={[a.title,{flexGrow:1,flexShrink:1,flexBasis:130,minWidth:130}]}>{r.time}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={r.title+': '+r.time} style={[a.seg,{marginLeft:'auto'}]}>{r.choices.map(([m,label]:[number,string])=><Pressable key={m} accessibilityRole="radio" accessibilityState={{checked:r.minutes===m,disabled:!!busy}} disabled={!!busy} onPress={()=>{if(r.minutes!==m)save(r,{minutes:m});}} style={[a.segItem,r.minutes===m&&a.segOn]}><Text style={[a.segText,r.minutes===m&&a.segTextOn]}>{label}</Text></Pressable>)}</View>
   </View>
   <View style={[a.row,{minHeight:0,paddingTop:8,paddingBottom:12}]}><Text style={[a.note,a.wide]}>{r.on||!r.off?r.note:r.off}</Text></View>
  </Group></View>)}
 </View>;
}
