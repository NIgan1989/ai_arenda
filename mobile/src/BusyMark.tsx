import {dateText,t} from '../../lib/i18n';
// «Занято»: guests came from the street or by phone. The hours are closed for guests of the service from this
// minute; «Освободить» opens them again. The owner marks it on the card of the object, the person on shift in «Смена».
import React,{useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {SwipeConfirm} from './SwipeConfirm';
import type {Row} from './model';

export const BUSY_HOURS=[1,2,3,4,6];
export const hhmm=(at:number)=>dateText(at*1000,{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
/** The mark that holds now, if any. */
export const busyNow=(busy:Row[]|undefined,now=Date.now()/1000)=>(busy||[]).find(b=>Number(b.start)<=now+60&&Number(b.end)>now);

// Board «Экраны старой версии», 2026-11-26: one line «Занято до 15:40» with «− +» by an hour (up to 12, as lib/staff.ts
// allows) and one swipe at the bottom instead of five hour chips; a held mark is one line with «Освободить».
export function BusyMark({propertyId,busy,onChange}:{propertyId:string;busy?:Row[];onChange:(busy:Row[],message:string)=>void}){
 const [wait,setWait]=useState(0),[error,setError]=useState(''),[hours,setHours]=useState(2),held=busyNow(busy);
 async function send(path:string,hours:number){if(wait)return;setWait(hours||-1);setError('');try{const r=await request('/api/operations/staff/'+path,{propertyId,hours});onChange(r.busy||[],r.message||'');}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setWait(0);}}
 const until=hhmm(Math.floor(Date.now()/60000)*60+hours*3600);
 const step=(sign:number,mark:string,label:string)=>{const off=!!wait||(sign<0?hours<=1:hours>=MAX_HOURS);return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={off} onPress={()=>setHours(h=>h+sign)} hitSlop={4} style={({pressed})=>[b.step,(off||pressed)&&b.dim]}><Text style={b.stepText}>{mark}</Text></Pressable>;};
 return <View style={b.box}>
  {held?<View style={b.row}>
   <View style={b.dot}/><Text style={b.held}>{t('Занято до {time}',{time:hhmm(Number(held.end))})}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Освободить')} disabled={!!wait} onPress={()=>send('free',0)} style={[b.free,!!wait&&b.dim]}><Text style={b.freeText}>{wait?t('Освобождаю…'):t('Освободить')}</Text></Pressable>
  </View>:<>
   <View style={b.row}>
    <View style={{flex:1,minWidth:0}}><Text accessibilityLiveRegion="polite" style={b.held}>{t('Занято до {time}',{time:until})}</Text><Text style={b.hint}>{t('Гостям из приложения это время не предлагается.')}</Text></View>
    {step(-1,'−',t('На час меньше'))}<Text style={b.hours}>{t('{h} ч',{h:hours})}</Text>{step(1,'+',t('На час больше'))}
   </View>
   <SwipeConfirm label={wait?t('Закрываю время…'):t('Проведите: закрыть время')} disabled={!!wait} onConfirm={()=>void send('busy',hours)}/>
  </>}
  {!!error&&<Text accessibilityRole="alert" style={b.error}>{error}</Text>}
 </View>;
}
const MAX_HOURS=12;
const R=T.radius,H=T.control;
const b=StyleSheet.create({
 box:{gap:12,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 row:{flexDirection:'row',alignItems:'center',gap:8},dot:{width:8,height:8,borderRadius:R.full,backgroundColor:C.ink},
 held:{flex:1,color:C.ink,...type.label,fontWeight:'700'},
 free:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong},freeText:{color:C.ink,...type.label,fontWeight:'600'},
 step:{width:36,height:36,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},stepText:{color:C.ink,fontSize:22,lineHeight:24},
 hours:{minWidth:36,textAlign:'center',color:C.ink,...type.label,fontWeight:'700'},
 hint:{color:C.muted,...type.caption},dim:{opacity:.45},
 error:{color:C.danger,...type.caption}
});
