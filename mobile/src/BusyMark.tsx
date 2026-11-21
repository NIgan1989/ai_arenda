import {dateText,t} from '../../lib/i18n';
// «Занято»: guests came from the street or by phone. The hours are closed for guests of the service from this
// minute; «Освободить» opens them again. The owner marks it on the card of the object, the person on shift in «Смена».
import React,{useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import type {Row} from './model';

export const BUSY_HOURS=[1,2,3,4,6];
export const hhmm=(at:number)=>dateText(at*1000,{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
/** The mark that holds now, if any. */
export const busyNow=(busy:Row[]|undefined,now=Date.now()/1000)=>(busy||[]).find(b=>Number(b.start)<=now+60&&Number(b.end)>now);

export function BusyMark({propertyId,busy,onChange}:{propertyId:string;busy?:Row[];onChange:(busy:Row[],message:string)=>void}){
 const [wait,setWait]=useState(0),[error,setError]=useState(''),held=busyNow(busy);
 async function send(path:string,hours:number){if(wait)return;setWait(hours||-1);setError('');try{const r=await request('/api/operations/staff/'+path,{propertyId,hours});onChange(r.busy||[],r.message||'');}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setWait(0);}}
 return <View style={b.box}>
  {held?<View style={b.row}>
   <View style={b.dot}/><Text style={b.held}>{t('Занято до {time}',{time:hhmm(Number(held.end))})}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Освободить')} disabled={!!wait} onPress={()=>send('free',0)} style={[b.free,!!wait&&b.dim]}><Text style={b.freeText}>{wait?t('Освобождаю…'):t('Освободить')}</Text></Pressable>
  </View>:<>
   <Text style={b.label}>{t('Занято с этой минуты на')}</Text>
   <View style={b.hours}>{BUSY_HOURS.map(h=><Pressable key={h} accessibilityRole="button" accessibilityLabel={t('Занято на {h} ч',{h})} disabled={!!wait} onPress={()=>send('busy',h)} style={({pressed})=>[b.hour,(pressed||wait===h)&&b.hourOn,!!wait&&wait!==h&&b.dim]}><Text style={[b.hourText,wait===h&&b.hourTextOn]}>{t('{h} ч',{h})}</Text></Pressable>)}</View>
   <Text style={b.hint}>{t('Гостям из приложения это время не предлагается.')}</Text>
  </>}
  {!!error&&<Text accessibilityRole="alert" style={b.error}>{error}</Text>}
 </View>;
}
const R=T.radius,H=T.control;
const b=StyleSheet.create({
 box:{gap:8,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 row:{flexDirection:'row',alignItems:'center',gap:8},dot:{width:8,height:8,borderRadius:R.full,backgroundColor:C.warning},
 held:{flex:1,color:C.ink,...type.label,fontWeight:'700'},
 free:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong},freeText:{color:C.ink,...type.label,fontWeight:'600'},
 label:{color:C.muted,...type.caption,fontWeight:'600'},
 hours:{flexDirection:'row',gap:8},
 hour:{flex:1,minHeight:H.compact,alignItems:'center',justifyContent:'center',borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},hourOn:{backgroundColor:C.accent,borderColor:C.accent},
 hourText:{color:C.ink,...type.label,fontWeight:'600'},hourTextOn:{color:C.onAccent},
 hint:{color:C.muted,...type.caption},dim:{opacity:.45},
 error:{color:C.danger,...type.caption}
});
