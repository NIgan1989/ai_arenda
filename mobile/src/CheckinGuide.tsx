import {L,t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {ApiError,request} from './api';
import {C,type} from './styles';
import {T} from './tokens';
import {Thinking} from './Thinking';
import {menuIcons} from './AccountRows';
import {PopSheet} from './PopSheet';

// «Как заселиться» inside a confirmed booking, as on the site (components/checkin-guide.tsx): the owner's instruction
// is asked for only when the guest taps, because every opening is checked (time, payment, readiness) and recorded.
const WHY:Record<number,string>=L({
 403:'Инструкция откроется за час до заезда, когда оплата и депозит подтверждены, а жильё готово.',
 404:'Владелец ещё не добавил инструкцию. Напишите ему в чат брони.',
 503:'Инструкции сейчас недоступны. Попробуйте позже или напишите владельцу.',
});
// The cleaner opens the same instruction from the assigned cleaning («Как попасть»), once the guest has left.
const CLEANER_WHY:Record<number,string>=L({
 403:'Инструкция откроется за час до уборки, когда выезд гостя подтверждён.',
 404:'Владелец ещё не добавил инструкцию. Напишите ему в чат уборки.',
 503:'Инструкции сейчас недоступны. Попробуйте позже или напишите владельцу.',
});
// venue: баня или зал, куда приходят, а не заселяются.
// waiting: the instruction cannot open yet, and the line says what comes first («Сейчас: оплатите → дальше …»), so there is
// no arrow that opens nothing. Once it can open, the card shows one short row; the text opens on its own sheet,
// as «Заезд» in Airbnb (board «Экраны старой версии», 2026-11-26).
export function CheckinGuide({bookingId,role='guest',venue=false,waiting}:{bookingId:string;role?:'guest'|'cleaner';venue?:boolean;waiting?:string}){
 const why=role==='cleaner'?CLEANER_WHY:venue?{...WHY,403:t('Инструкция откроется за час до начала, когда оплата и депозит подтверждены, а объект готов.')}:WHY,title=role==='cleaner'?t('Как попасть в жильё'):venue?t('Как пройти'):t('Как заселиться');
 const [state,setState]=useState<{text:string;closed?:boolean}|null>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 async function load(){
  if(busy)return;setBusy(true);
  try{
   const value=await request('/api/operations/access/open',{entityId:bookingId},undefined,undefined,role);
   setState(value?.instructions?{text:value.instructions}:{text:why[503],closed:true});
  }catch(e){setState({text:e instanceof ApiError?why[e.status]||why[503]:t('Нет связи. Проверьте интернет и попробуйте ещё раз.'),closed:true});}
  finally{setBusy(false);}
 }
 if(waiting)return <View accessible accessibilityLabel={title+'. '+waiting} style={g.wait}><Image source={menuIcons.key} style={[g.icon,{tintColor:C.muted}]}/><Text style={g.waitText}>{waiting}</Text></View>;
 return <View accessibilityLabel={title} style={g.box}>
  <Pressable accessibilityRole="button" accessibilityState={{busy,disabled:busy}} disabled={busy} onPress={()=>{setOpen(true);if(!state||state.closed)void load();}} style={({pressed})=>[g.open,pressed&&{backgroundColor:C.surfaceAlt}]}>
   <Image source={menuIcons.key} style={[g.icon,{tintColor:C.ink}]}/><Text style={g.title}>{title}</Text>{busy?<Thinking size="sm"/>:<Text style={g.chevron}>›</Text>}
  </Pressable>
  <PopSheet visible={open} title={title} onClose={()=>setOpen(false)}>
   {!state?<Thinking size="sm"/>:<Text accessibilityLiveRegion="polite" selectable={!state.closed} style={state.closed?g.note:g.body}>{state.text}</Text>}
  </PopSheet>
 </View>;
}
const g=StyleSheet.create({
 box:{gap:8,minWidth:0},
 open:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch,paddingHorizontal:16,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,backgroundColor:C.surface},
 icon:{width:18,height:18},
 title:{...type.label,flex:1,color:C.ink,fontWeight:'600'},chevron:{...type.subtitle,color:C.muted},
 wait:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch,paddingHorizontal:4},waitText:{...type.label,flex:1,color:C.inkSoft},
 note:{...type.label,color:C.muted},
 body:{...type.body,color:C.ink},
});
