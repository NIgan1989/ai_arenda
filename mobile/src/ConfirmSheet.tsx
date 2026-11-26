import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {PopSheet} from './PopSheet';
import {SwipeConfirm} from './SwipeConfirm';
import {money,type Row} from './model';
import {QuietButton} from './MainParts';
import {C,s,type} from './styles';

// An action of a booking or a cleaning (cancel, «я заселился», «оплатил»…) is confirmed on a small sheet over its card
// (2026-11-26): what it is about, what follows, one swipe. The chat and the AI administrator are not involved: the
// sheet says the answer itself for a moment and closes, and the card under it already shows the new state.
export type ConfirmAsk={id:string;path:string;body:Row;title:string;note?:string;subject?:string;dates?:string;amount?:number;after?:string};
export function ConfirmSheet({ask,busy,onConfirm,onClose}:{ask:ConfirmAsk|null;busy:boolean;onConfirm:(ask:ConfirmAsk)=>Promise<string|null>;onClose:()=>void}){
 const [done,setDone]=useState(''),[error,setError]=useState(''),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{setDone('');setError('');clearTimeout(timer.current);},[ask?.id]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 if(!ask)return null;
 const what=ask.title.charAt(0).toLowerCase()+ask.title.slice(1),cancel=ask.body?.action==='cancel'||ask.body?.action==='release';
 const go=async()=>{setError('');try{const said=await onConfirm(ask);if(said===null)return;setDone(said||t('Готово'));timer.current=setTimeout(onClose,1400);}catch(e){setError((e as Error).message||t('Не получилось. Попробуйте ещё раз.'));}};
 return <PopSheet visible title={ask.title} onClose={onClose} footer={done?null:<><SwipeConfirm key={ask.id+':'+error} label={t('Проведите: {what}',{what})} disabled={busy} onConfirm={()=>void go()}/><QuietButton title={cancel?t('Не отменять'):t('Закрыть')} disabled={busy} onPress={onClose}/></>}>
  {!!ask.subject&&<Text style={c.subject}>{ask.subject}</Text>}
  {(!!ask.dates||ask.amount!==undefined)&&<Text style={s.meta}>{[ask.dates,ask.amount!==undefined?money(ask.amount):''].filter(Boolean).join(' · ')}</Text>}
  {!!ask.note&&!done&&<Text style={[s.text,c.note]}>{ask.note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={[s.error,c.note]}>{error}</Text>}
  {!!done&&<View accessibilityLiveRegion="polite" style={c.done}><Text style={c.tick}>✓</Text><Text style={c.doneText}>{done}</Text></View>}
 </PopSheet>;
}
const c=StyleSheet.create({
 subject:{...type.title,color:C.ink},
 note:{marginTop:12},
 done:{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:16},
 tick:{...type.title,color:C.success},
 doneText:{...type.body,color:C.ink,flex:1},
});
