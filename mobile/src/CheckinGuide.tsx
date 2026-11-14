import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {ApiError,request} from './api';
import {C,type} from './styles';
import {T} from './tokens';
import {Thinking} from './Thinking';
import {menuIcons} from './AccountRows';

// «Как заселиться» inside a confirmed booking, as on the site (components/checkin-guide.tsx): the owner's instruction
// is asked for only when the guest taps, because every opening is checked (time, payment, readiness) and recorded.
const WHY:Record<number,string>={
 403:'Инструкция откроется за час до заезда, когда оплата и депозит подтверждены, а жильё готово.',
 404:'Владелец ещё не добавил инструкцию. Напишите ему в чат брони.',
 503:'Инструкции сейчас недоступны. Попробуйте позже или напишите владельцу.',
};
export function CheckinGuide({bookingId}:{bookingId:string}){
 const [state,setState]=useState<{text:string;closed?:boolean}|null>(null),[busy,setBusy]=useState(false);
 async function open(){
  if(busy)return;setBusy(true);
  try{
   const value=await request('/api/operations/access/open',{entityId:bookingId},undefined,undefined,'guest');
   setState(value?.instructions?{text:value.instructions}:{text:WHY[503],closed:true});
  }catch(e){setState({text:e instanceof ApiError?WHY[e.status]||WHY[503]:'Нет связи. Проверьте интернет и попробуйте ещё раз.',closed:true});}
  finally{setBusy(false);}
 }
 return <View accessibilityLabel="Как заселиться" style={g.box}>
  {(!state||state.closed)&&<Pressable accessibilityRole="button" accessibilityState={{busy,disabled:busy}} disabled={busy} onPress={()=>void open()} style={({pressed})=>[g.open,pressed&&{backgroundColor:C.surfaceAlt}]}>
   <Image source={menuIcons.key} style={[g.icon,{tintColor:C.accent}]}/><Text style={g.title}>Как заселиться</Text>{busy?<Thinking size="sm"/>:<Text style={g.chevron}>›</Text>}
  </Pressable>}
  {!!state&&(state.closed
   ?<Text accessibilityLiveRegion="polite" style={g.note}>{state.text}</Text>
   :<View accessibilityLiveRegion="polite" style={g.text}><View style={g.head}><Image source={menuIcons.key} style={[g.small,{tintColor:C.ink}]}/><Text style={g.title}>Как заселиться</Text></View><Text selectable style={g.body}>{state.text}</Text></View>)}
 </View>;
}
const g=StyleSheet.create({
 box:{gap:8,minWidth:0},
 open:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch,paddingHorizontal:16,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,backgroundColor:C.surface},
 icon:{width:18,height:18},small:{width:16,height:16},
 title:{...type.label,flex:1,color:C.ink,fontWeight:'600'},chevron:{...type.subtitle,color:C.muted},
 note:{...type.caption,color:C.muted,paddingHorizontal:4},
 text:{gap:4,paddingVertical:12,paddingHorizontal:16,borderRadius:T.radius.lg,backgroundColor:C.successSoft},
 head:{flexDirection:'row',alignItems:'center',gap:8},
 body:{...type.label,color:C.ink},
});
