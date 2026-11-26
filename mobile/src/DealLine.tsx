import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {stepWhen,type Deal} from './pin-deal';
import {C,type} from './styles';
import {T} from './tokens';

// The deal of a place as one line: Заявка, Оплата, Проживание, Уборка, Готово. The same stages stand on the pin of the
// place as a strip (MapPins.tsx); here they have their names, and a tap opens the history of the deal step by step.
export function DealLine({deal,now,onOpen,history=true}:{deal:Deal;now:number;onOpen:(kind:'booking'|'job',id:string)=>void;history?:boolean}){
 const [open,setOpen]=useState(false);
 const at=deal.stages.findIndex(s=>s.state==='now'),said=deal.finished?t('Сделка: всё готово'):t('Сделка: {v}, шаг {v2} из {length}',{v:(deal.stages[at]?.label||''),v2:(at+1),length:deal.stages.length});
 return <View style={d.box}>
  <Pressable accessibilityRole="button" accessibilityLabel={said+(history?'. '+(open?t('Скрыть историю'):t('История сделки')):'')} accessibilityState={history?{expanded:open}:undefined} disabled={!history} onPress={()=>setOpen(v=>!v)} style={({pressed})=>[d.line,pressed&&{opacity:.7}]}>
   <View style={d.stages}>{deal.stages.map(s=><View key={s.key} style={[d.stage,{flex:Math.max(6,s.label.length+(s.key==='ready'?2:0))}]}>
    <View style={d.track}><View style={[d.fill,s.state==='done'&&d.fillDone,s.state==='now'&&d.fillNow,s.state==='now'&&typeof s.progress==='number'?{width:(Math.max(8,Math.round(s.progress*100))+'%') as `${number}%`}:null,s.state==='wait'&&d.fillWait]}/></View>
    <Text numberOfLines={1} style={[d.label,s.state==='now'&&d.labelNow,s.state==='done'&&d.labelDone]}>{s.label}{s.key==='ready'&&s.state==='done'?' ✓':''}</Text>
   </View>)}</View>
   {history&&<Text style={d.more}>{open?t('Скрыть историю'):t('История сделки')} {open?'⌃':'›'}</Text>}
  </Pressable>
  {open&&<View style={d.history}>{deal.history.map((s,i)=>{const when=stepWhen(s,now),shown=s.state!=='wait';
   return <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={t('{v}. Открыть',{v:[when,s.label,shown?s.note:t('впереди'),s.by].filter(Boolean).join(', ')})} onPress={()=>onOpen(s.open.kind,s.open.id)} style={({pressed})=>[d.step,pressed&&{opacity:.7}]}>
    <Text style={d.when}>{when}</Text>
    <View style={d.rail}><View style={[d.dot,s.state==='done'&&d.dotDone,(s.state==='now'||s.state==='next')&&d.dotNow]}/>{i<deal.history.length-1&&<View style={[d.thread,s.state==='done'&&d.threadDone]}/>}</View>
    <View style={d.text}><View style={d.head}><Text style={[d.stepLabel,!shown&&d.wait]}>{s.label}</Text><Text style={d.who}>{s.by}</Text></View>{shown&&s.note!==s.label&&<Text style={d.note}>{s.note}</Text>}</View>
   </Pressable>;})}</View>}
 </View>;
}

const d=StyleSheet.create({
 box:{gap:8},line:{gap:8,paddingVertical:4},
 stages:{flexDirection:'row',gap:4},stage:{flex:1,gap:4},
 track:{height:4,borderRadius:2,backgroundColor:C.line,overflow:'hidden'},fill:{height:4,width:'100%',borderRadius:2},fillDone:{backgroundColor:C.success},fillNow:{backgroundColor:C.accent},fillWait:{backgroundColor:'transparent'},
 label:{fontSize:12,lineHeight:16,color:C.muted},labelNow:{color:C.accent,fontWeight:'600'},labelDone:{color:C.ink},
 more:{...type.caption,color:C.accent,fontWeight:'600'},
 history:{paddingVertical:4},step:{flexDirection:'row',gap:8,minHeight:T.control.touch},
 when:{...type.caption,width:84,textAlign:'right',color:C.muted,paddingTop:2,fontVariant:['tabular-nums']},
 rail:{width:16,alignItems:'center'},dot:{width:12,height:12,marginTop:4,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,backgroundColor:C.surface},dotDone:{borderColor:C.success,backgroundColor:C.success},dotNow:{borderWidth:4,borderColor:C.accent},
 thread:{flex:1,width:2,backgroundColor:C.line},threadDone:{backgroundColor:C.success},
 text:{flex:1,paddingBottom:8},head:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',gap:8},stepLabel:{...type.label,color:C.ink,fontWeight:'600'},wait:{color:C.muted,fontWeight:'400'},who:{...type.caption,color:C.muted},note:{...type.caption,color:C.inkSoft},
});
