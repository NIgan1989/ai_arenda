import {jobPayNote} from '../../lib/regular-cleaner-text';
import React,{useState} from 'react';
import {View,Text,Pressable,StyleSheet,Platform} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {money,type Row} from './model';
import {processJourney} from '../../lib/process-journey';
import {processStatus} from '../../lib/process-status';
import {recordSpan} from '../../lib/record-span';
// An opened booking or cleaning, built the same way as on the site: the head says what it is, when and how much,
// one line and a bar show the step, the facts follow, and the next action is the only big button.
const tones:Record<string,[string,string]>={success:[C.successSoft,C.success],warning:[C.warningSoft,C.warning],active:[C.accentSoft,C.accentPressed],neutral:[C.surfaceAlt,C.muted],danger:[C.dangerSoft,C.danger]};
// «На карте»: a small pill next to the place of a booking, a cleaning or an object, in a chat's subject line too.
// It opens the home map on that pin (MapHome, map-memory.ts targetPin).
export function MapLink({onPress,label='Показать на карте'}:{onPress:()=>void;label?:string}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({pressed})=>[r.mapLink,pressed&&r.dim]}><View style={r.mapPin}><View style={r.mapPinDot}/></View><Text style={r.mapLinkText}>На карте</Text></Pressable>;
}
export function RecordHead({kind,item,role,userId,application,onMap}:{kind:'booking'|'job';item:Row;role:string;userId:string;application?:Row;onMap?:()=>void}){
 const status=processStatus(kind,item,role,userId,application),[bg,ink]=tones[status.tone]||tones.neutral,paid=item.payment_status==='owner_verified',place=[item.city,item.district].filter(Boolean).join(', ');
 return <View style={r.head}>
  <View style={r.tags}><Text style={[r.status,{backgroundColor:bg,color:ink}]}>{status.label}</Text>{!!item.demo_owner&&<Text style={[r.status,{backgroundColor:C.surfaceAlt,color:C.muted}]}>{kind==='job'?'Учебное':'Учебная'}</Text>}{kind==='job'&&!!item.regular&&<Text style={[r.status,{backgroundColor:C.accentSoft,color:C.accentPressed}]}>Постоянный исполнитель</Text>}</View>
  <Text accessibilityRole="header" style={r.title}>{item.title}</Text>
  <Text style={r.when}>{recordSpan(item.start,item.end)}</Text>
  {(!!place||!!onMap)&&<View style={r.whereRow}><Text style={[r.where,r.whereText]}>{place}</Text>{!!onMap&&<MapLink onPress={onMap}/>}</View>}
  <View style={r.sum}><Text style={r.amount}>{money(kind==='job'?item.fee:item.amount)}</Text><Text style={[r.sumNote,(kind==='booking'&&paid||kind==='job'&&!!item.guarantee)&&{color:C.success}]}>{kind==='job'?jobPayNote(item):paid?'оплата отмечена владельцем':'оплата не подтверждена'}</Text></View>
 </View>;
}
export function RecordJourney({kind,item}:{kind:'booking'|'job';item:Row}){
 const flow=processJourney(kind,item),total=flow.labels.length,step=Math.min(flow.current,total-1);
 return <View style={[r.journey,flow.stopped&&r.journeyStopped]} accessible accessibilityLabel={(flow.stopped?'':flow.done?'Завершено. ':flow.labels[step]+', шаг '+(step+1)+' из '+total+'. ')+flow.hint}>
  {!flow.stopped&&<><View style={r.journeyNow}><Text style={r.journeyStep}>{flow.done?'Завершено':flow.labels[step]}</Text>{!flow.done&&<Text style={r.journeyCount}>шаг {step+1} из {total}{step+1<total?' · дальше «'+flow.labels[step+1]+'»':''}</Text>}</View>
  <View style={r.bar}>{flow.labels.map((label,index)=><View key={label} style={[r.segment,flow.done?{backgroundColor:C.success}:index<flow.current?{backgroundColor:C.accent}:index===flow.current?{backgroundColor:C.aiTo}:null]}/>)}</View></>}
  <Text style={r.hint}>{flow.hint}</Text>
 </View>;
}
export function RecordFacts({rows}:{rows:(readonly [string,string,boolean?]|false|null|undefined|'')[]}){
 const shown=rows.filter(Boolean) as (readonly [string,string,boolean?])[];if(!shown.length)return null;
 return <View style={r.facts}>{shown.map(([label,value,secret],index)=><View key={label} style={[r.fact,index>0&&r.factLine,secret&&r.factPrivate]}><Text style={r.factLabel}>{label}</Text><Text style={r.factValue}>{value}</Text></View>)}</View>;
}
export type RecordAction={title:string;onPress:()=>void;kind:'main'|'side'|'danger';disabled?:boolean};
export function RecordActions({actions,busy}:{actions:(RecordAction|false|null|undefined|''|0)[];busy:boolean}){
 const [focused,setFocused]=useState(''),all=actions.filter(Boolean) as RecordAction[],mains=all.filter(a=>a.kind==='main'),side=all.filter(a=>a.kind==='side'),danger=all.filter(a=>a.kind==='danger');
 if(!all.length)return null;
 const button=(a:RecordAction,box:any,text:any)=><Pressable key={a.title} accessibilityRole="button" accessibilityLabel={a.title} accessibilityState={{disabled:busy||!!a.disabled}} disabled={busy||!!a.disabled} onPress={a.onPress} onFocus={(e:any)=>{if(Platform.OS!=='web'||e?.target?.matches?.(':focus-visible'))setFocused(a.title);}} onBlur={()=>setFocused('')} style={({pressed})=>[r.action,box,focused===a.title&&r.focus,(pressed||busy||a.disabled)&&r.dim]}><Text style={[r.actionText,text]}>{a.title}</Text></Pressable>;
 return <View style={r.actions}>{mains.map((a,i)=>button(a,i?r.next:r.main,i?r.nextText:r.mainText))}{side.length>0&&<View style={r.sideRow}>{side.map(a=>button(a,r.side,r.sideText))}</View>}{danger.map(a=>button(a,r.danger,r.dangerText))}</View>;
}
const R=T.radius,H=T.control;
const r=StyleSheet.create({
 card:{gap:12,marginTop:12,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.glassLine,backgroundColor:C.glassStrong},
 head:{gap:8},tags:{flexDirection:'row',flexWrap:'wrap',gap:8},status:{...type.caption,fontWeight:'500',paddingHorizontal:8,paddingVertical:4,borderRadius:R.sm,overflow:'hidden'},
 title:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.3},when:{...type.label,color:C.inkSoft},where:{...type.label,color:C.muted},
 sum:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12,rowGap:4,marginTop:4},amount:{...type.heading,color:C.ink,fontWeight:'700',letterSpacing:-.5},sumNote:{...type.caption,color:C.muted},
 journey:{gap:8,paddingVertical:12,paddingHorizontal:16,borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface},journeyStopped:{backgroundColor:C.surfaceAlt,borderWidth:0},
 journeyNow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'space-between',columnGap:12},journeyStep:{...type.body,color:C.ink,fontWeight:'600'},journeyCount:{...type.caption,color:C.muted},
 bar:{flexDirection:'row',gap:4},segment:{flex:1,height:4,borderRadius:R.xs,backgroundColor:C.line},hint:{...type.caption,color:C.muted},
 facts:{borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface,overflow:'hidden'},fact:{flexDirection:'row',gap:12,paddingVertical:12,paddingHorizontal:16},factLine:{borderTopWidth:1,borderTopColor:C.line},factPrivate:{backgroundColor:C.successSoft},
 factLabel:{...type.label,color:C.muted,width:96},factValue:{...type.label,color:C.ink,flex:1},
 actions:{gap:8},sideRow:{flexDirection:'row',gap:8},action:{minHeight:H.touch,borderRadius:R.md,paddingVertical:8,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},actionText:{...type.label,fontWeight:'600',textAlign:'center'},
 main:{minHeight:H.primary,backgroundColor:C.accent},mainText:{...type.body,fontWeight:'600',color:C.onAccent},next:{backgroundColor:C.accentSoft},nextText:{color:C.accentPressed},
 side:{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},sideText:{color:C.ink},danger:{backgroundColor:'transparent'},dangerText:{color:C.danger,fontWeight:'500'},
 focus:{borderWidth:2,borderColor:C.focus},dim:{opacity:.55},
 whereRow:{flexDirection:'row',alignItems:'center',gap:8},whereText:{flex:1,minWidth:0},
 mapLink:{flexDirection:'row',alignItems:'center',gap:4,minHeight:32,paddingHorizontal:12,borderRadius:R.full,backgroundColor:C.accentSoft},mapLinkText:{...type.caption,fontWeight:'600',color:C.accentPressed},
 mapPin:{width:12,height:12,borderRadius:R.full,borderBottomRightRadius:0,backgroundColor:C.accentPressed,transform:[{rotate:'45deg'}],alignItems:'center',justifyContent:'center'},mapPinDot:{width:4,height:4,borderRadius:R.full,backgroundColor:C.accentSoft},
});
export const recordStyles=r;
