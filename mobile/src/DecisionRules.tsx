import {t,tServer} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {Group,Row as Line,RowIcon,SwitchRow,a} from './AccountRows';
import {ThinkingLine} from './Thinking';
import {request} from './api';
import {s} from './styles';
import type {Row} from './model';
// The rules come from the server in Russian (lib/decision-rules.ts): shown in the language of the app.
const say=(v:unknown)=>typeof v==='string'&&v?tServer(v):v;
const shown=(list:Row[]|undefined)=>(list||[]).map(r=>({...r,title:say(r.title),auto:say(r.auto),note:say(r.note),off:say(r.off),time:say(r.time),choices:Array.isArray(r.choices)?r.choices.map(([m,label]:[number,string])=>[m,say(label)]):r.choices}));

// «Автопилот: решения и сроки», as on the site (components/decision-rules.tsx). Every question the AI administrator
// waits on a person for: whether the AI decides by itself when nobody answers, and how long it waits. Saved at once.
export function NativeDecisionRules({tint}:{tint:string}){
 const [rules,setRules]=useState<Row[]|null>(null),[open,setOpen]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;request('/api/operations/decision-rules/state').then(v=>{if(live)setRules(shown(v.rules));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 async function save(rule:Row,patch:Row){
  if(busy||!rules)return;const before=rules;setBusy(rule.key);setError('');setMessage('');
  setRules(rules.map(r=>r.key===rule.key?{...r,...patch}:r));
  try{const r=await request('/api/operations/decision-rules',{rule:rule.key,...patch});setRules(shown(r.rules));setMessage(r.message||t('Сохранено.'));}catch(e:any){setRules(before);setError(e.message);}finally{setBusy('');}
 }
 if(!rules)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:<ThinkingLine style={s.meta} text={t('Загружаем настройки…')}/>;
 // As the concept of the menu: one row per question with what happens now on the right («15 мин», «выключено»); the
 // switch, the time and the note open under the row.
 return <View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
  <Group title={t('Если вы не ответили')}>{rules.map(r=>{
   const time=(r.choices||[]).find(([m]:[number,string])=>m===r.minutes)?.[1],shut=!!r.auto&&!r.on,here=open===r.key;
   return <View key={r.key} accessibilityLabel={r.title}>
    <Line title={r.title} value={shut?t('выключено'):time} open={here} onPress={()=>setOpen(here?'':r.key)}/>
    {here&&<>
     {!!r.auto&&<SwitchRow icon="shanyrak" tint={tint} title={r.auto} checked={!!r.on} disabled={!!busy} onChange={v=>save(r,{on:v})}/>}
     {/* The time sits under its label: four choices do not fit beside it on a phone. A switched-off rule hides its time:
         it does not act, so a time there would read as if it did (audit of 2026-11-22). */}
     {!shut&&!!r.time&&<View style={[a.row,{flexWrap:'wrap',rowGap:8}]}><RowIcon icon="clock" tint={tint}/><Text style={[a.title,{flexGrow:1,flexShrink:1,flexBasis:130,minWidth:130}]}>{r.time}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={r.title+': '+r.time} style={[a.seg,{marginLeft:'auto'}]}>{r.choices.map(([m,label]:[number,string])=><Pressable key={m} accessibilityRole="radio" accessibilityState={{checked:r.minutes===m,disabled:!!busy}} disabled={!!busy} onPress={()=>{if(r.minutes!==m)save(r,{minutes:m});}} style={[a.segItem,r.minutes===m&&a.segOn]}><Text style={[a.segText,r.minutes===m&&a.segTextOn]}>{label}</Text></Pressable>)}</View>
     </View>}
     <View style={[a.row,{minHeight:0,paddingTop:8,paddingBottom:12}]}><Text style={[a.note,a.wide]}>{r.on||!r.off?r.note:r.off}</Text></View>
    </>}
   </View>;})}</Group>
 </View>;
}
