import React,{useEffect,useState} from 'react';
import {Pressable,Switch,Text,TextInput,View,StyleSheet} from 'react-native';
import {flatAutopilotNote,type FlatAutopilot} from '../../lib/flat-autopilot';
import {request} from './api';
import {h} from './SheetParts';
import {C,s} from './styles';
import {T} from './tokens';

// The «Автопилот» plan of one flat, in its settings: a switch, the price in one line and, when the AI
// still needs it, the cleaning price. The same as on the site.
export function FlatAutopilotRow({propertyId,onChanged}:{propertyId:string;onChanged?:()=>Promise<unknown>|void}){
 const [state,setState]=useState<FlatAutopilot|null>(null),[busy,setBusy]=useState(false),[asking,setAsking]=useState(false),[fee,setFee]=useState(''),[notice,setNotice]=useState('');
 async function load(){try{const v=await request('/api/operations/autopilot/state',undefined,undefined,undefined,'owner'),flat=(v.flats||[]).find((f:any)=>f.id===propertyId);setState(flat?{...flat,price:v.settings?.price||0,trialDays:v.settings?.trialDays||0,charge:!!v.settings?.charge}:null);}catch(e:any){setNotice(e.message);}}
 useEffect(()=>{void load();},[propertyId]);
 async function run(body:()=>Promise<any>){setBusy(true);setNotice('');try{const r=await body();setNotice(r?.failed?.length?r.failed[0].error:'');setAsking(false);await load();await onChanged?.();}catch(e:any){setNotice(e.message);await load();}finally{setBusy(false);}}
 const on=(cleaningFee?:number)=>run(()=>request('/api/operations/autopilot/start',{propertyIds:[propertyId],...(cleaningFee?{cleaningFees:{[propertyId]:cleaningFee}}:{})},undefined,undefined,'owner'));
 const off=()=>run(()=>request('/api/operations/matching/preference',{propertyId,mode:'manual'},undefined,undefined,'owner'));
 function toggle(next:boolean){if(!state)return;if(!next){void off();return;}if(!state.ownStaff&&!(state.cleaningFee>=100)){setAsking(true);return;}void on();}
 return <View style={{gap:8}}>
  <View style={a.row}><View style={h.grow}><Text style={h.eventTitle}>Автопилот</Text><Text style={h.note}>{state?flatAutopilotNote(state):notice||'Загружаем…'}</Text></View><Switch accessibilityLabel="Автопилот" value={!!state?.managed||asking} disabled={busy||!state||!state.ready} onValueChange={toggle} trackColor={{false:C.lineStrong,true:C.accent}} thumbColor={C.surface}/></View>
  {asking&&<View style={a.fee}><Text style={s.fieldLabel}>Сколько платить за уборку, ₸</Text><TextInput accessibilityLabel="Стоимость уборки" style={s.field} keyboardType="number-pad" value={fee} onChangeText={setFee} autoFocus/><View style={{flexDirection:'row',gap:8}}><Pressable accessibilityRole="button" disabled={busy||Number(fee)<100} onPress={()=>void on(Number(fee))} style={[s.button,{flex:1},(busy||Number(fee)<100)&&s.disabled]}><Text style={s.buttonText}>Включить</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setAsking(false)} style={[s.button,s.secondary,{flex:1}]}><Text style={[s.buttonText,s.secondaryText]}>Отмена</Text></Pressable></View></View>}
  {!!notice&&!!state&&<Text accessibilityLiveRegion="polite" style={h.note}>{notice}</Text>}
 </View>;
}
const a=StyleSheet.create({
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.field,paddingVertical:8,paddingHorizontal:12,borderRadius:T.radius.lg,backgroundColor:C.surfaceAlt},
 fee:{gap:8,padding:12,borderRadius:T.radius.lg,backgroundColor:C.surfaceAlt},
});
