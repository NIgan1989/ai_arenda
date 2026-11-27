import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {RowIcon,type MenuIcon} from './AccountRows';
import {PopSheet} from './PopSheet';
import {SwipeConfirm} from './SwipeConfirm';
import {money,type Row} from './model';
import {QuietButton} from './MainParts';
import {C,s,type} from './styles';

// An action of a booking or a cleaning (cancel, «я заселился», «оплатил»…) is confirmed on a small sheet over its card
// (2026-11-26): what it is about, what follows, one swipe. The chat and the AI administrator are not involved: the
// sheet says the answer itself for a moment and closes, and the card under it already shows the new state.
// `choices`: one answer to pick before the swipe («Что случилось?»), sent as body[choiceKey]; `swipe` names the swipe itself.
export type ConfirmChoice={value:string;label:string;note?:string;icon?:MenuIcon};
export type ConfirmAsk={id:string;path:string;body:Row;title:string;note?:string;subject?:string;dates?:string;amount?:number;after?:string;choices?:ConfirmChoice[];choiceKey?:string;swipe?:string};
export function ConfirmSheet({ask,busy,onConfirm,onClose}:{ask:ConfirmAsk|null;busy:boolean;onConfirm:(ask:ConfirmAsk)=>Promise<string|null>;onClose:()=>void}){
 const [done,setDone]=useState(''),[error,setError]=useState(''),[pick,setPick]=useState<{id:string;value:string}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{setDone('');setError('');clearTimeout(timer.current);},[ask?.id]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 if(!ask)return null;
 const what=ask.title.charAt(0).toLowerCase()+ask.title.slice(1),cancel=ask.body?.action==='cancel'||ask.body?.action==='release';
 // The answer picked on this ask; a new ask starts from its first answer.
 const picked=pick&&pick.id===ask.id?pick.value:ask.choices?.[0]?.value||'',choice=ask.choices?.find(c=>c.value===picked);
 const go=async()=>{setError('');try{const said=await onConfirm(ask.choices&&ask.choiceKey?{...ask,body:{...ask.body,[ask.choiceKey]:picked}}:ask);if(said===null)return;setDone(said||t('Готово'));timer.current=setTimeout(onClose,1400);}catch(e){setError((e as Error).message||t('Не получилось. Попробуйте ещё раз.'));}};
 return <PopSheet visible title={ask.title} onClose={onClose} footer={done?null:<><SwipeConfirm key={ask.id+':'+error} label={t('Проведите: {what}',{what:ask.swipe||what})} disabled={busy} onConfirm={()=>void go()}/><QuietButton title={cancel?t('Не отменять'):t('Закрыть')} disabled={busy} onPress={onClose}/></>}>
  {!!ask.subject&&<Text style={c.subject}>{ask.subject}</Text>}
  {(!!ask.dates||ask.amount!==undefined)&&<Text style={s.meta}>{[ask.dates,ask.amount!==undefined?money(ask.amount):''].filter(Boolean).join(' · ')}</Text>}
  {!!ask.choices&&!done&&<View accessibilityRole="radiogroup" style={c.choices}>{ask.choices.map(o=><Pressable key={o.value} accessibilityRole="radio" accessibilityState={{checked:o===choice}} disabled={busy} onPress={()=>setPick({id:ask.id,value:o.value})} style={({pressed})=>[c.choice,pressed&&c.pressed]}>
   <RowIcon icon={o.icon}/><View style={c.grow}><Text style={c.choiceText}>{o.label}</Text>{!!o.note&&<Text style={s.meta}>{o.note}</Text>}</View>
   <View style={[c.radio,o===choice&&c.radioOn]}>{o===choice&&<View style={c.radioDot}/>}</View></Pressable>)}</View>}
  {!!ask.note&&!done&&<Text style={[s.text,c.note]}>{ask.note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={[s.error,c.note]}>{error}</Text>}
  {!!done&&<View accessibilityLiveRegion="polite" style={c.done}><Text style={c.tick}>✓</Text><Text style={c.doneText}>{done}</Text></View>}
 </PopSheet>;
}
const c=StyleSheet.create({
 subject:{...type.title,color:C.ink},
 note:{marginTop:12},
 done:{flexDirection:'row',alignItems:'flex-start',gap:8,marginTop:16},
 tick:{...type.title,color:C.success},
 doneText:{...type.body,color:C.ink,flex:1},
 choices:{marginTop:4},
 choice:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:C.line},
 pressed:{opacity:.6},grow:{flex:1,minWidth:0},
 choiceText:{...type.body,color:C.ink},
 radio:{width:22,height:22,borderRadius:12,borderWidth:1.5,borderColor:C.muted,alignItems:'center',justifyContent:'center'},
 radioOn:{borderColor:C.ink},radioDot:{width:12,height:12,borderRadius:8,backgroundColor:C.ink},
});
