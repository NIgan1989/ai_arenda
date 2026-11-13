import React,{createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState,Animated,View,Text,StyleSheet} from 'react-native';
import {activity,duration} from '../../lib/activity';
import {T} from './tokens';
const Clock=createContext(0);
export const useActivityClock=()=>useContext(Clock);
export function ActivityClockProvider({serverTime,children}:{serverTime?:number;children:ReactNode}){
 const [now,setNow]=useState(serverTime||0);
 useEffect(()=>{if(!serverTime)return;const anchor=performance.now(),tick=()=>setNow(serverTime+Math.floor((performance.now()-anchor)/1000));tick();const timer=setInterval(tick,1000),subscription=AppState.addEventListener('change',value=>{if(value==='active')tick();});return()=>{clearInterval(timer);subscription.remove();};},[serverTime]);
 return <Clock.Provider value={now}>{children}</Clock.Provider>;
}
const hm=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'});
// Same as components/activity-clock.tsx on the site, «Дорожка»: big digits over a line from the start to the
// deadline with a moving dot; after the deadline the line goes on in red past a flag.
export function ActivityTimer({kind,item,compact=false}:{kind:'booking'|'job';item:Record<string,any>;compact?:boolean}){
 const t=useActivityClock(),clock=activity(kind,item,t),breathe=useRef(new Animated.Value(0)).current,phase=clock?.phase;
 useEffect(()=>{if(phase!=='running'&&phase!=='overdue')return;const loop=Animated.loop(Animated.sequence([Animated.timing(breathe,{toValue:1,duration:phase==='overdue'?800:1000,useNativeDriver:true}),Animated.timing(breathe,{toValue:0,duration:phase==='overdue'?800:1000,useNativeDriver:true})]));loop.start();return()=>loop.stop();},[phase,breathe]);
 if(!clock||!t)return null;
 const at=(x:number)=>(day(x)===day(t)?'':day(x)+', ')+hm(x),known=clock.seconds!==null&&clock.seconds!==undefined,late=clock.phase==='overdue';
 const digits=known?(late?'+':'')+duration(clock.seconds as number):'—';
 const flag=late&&clock.started?Math.min(.85,Math.max(.4,(clock.deadline-clock.started)/Math.max(1,t-clock.started))):1;
 const dot=clock.phase==='running'?clock.progress:clock.phase==='waiting'?0:1,pct=(v:number)=>`${Math.round(v*100)}%` as const;
 const ring=late?T.color.danger:clock.phase==='stopped'?T.color.success:clock.phase==='waiting'?T.color.lineStrong:T.color.aiMid;
 const halo=breathe.interpolate({inputRange:[0,1],outputRange:[1,1.5]});
 const bar=<View style={[a.bar,compact&&a.barSmall]}>
  <View style={[a.fill,{width:pct(late?flag:dot),backgroundColor:clock.phase==='stopped'?T.color.success:T.color.accent}]}/>
  {late&&<View style={[a.fill,a.tail,{left:pct(flag),width:pct(1-flag)}]}/>}
  {late&&<View style={[a.flag,{left:pct(flag)}]}/>}
  <View style={[a.dotWrap,compact&&a.dotWrapSmall,{left:pct(dot)}]}>{(clock.phase==='running'||late)&&<Animated.View style={[a.halo,compact&&a.haloSmall,{backgroundColor:ring,transform:[{scale:halo}]}]}/>}<View style={[a.dot,compact&&a.dotSmall,{borderColor:ring}]}/></View>
 </View>;
 const note=clock.phase==='running'?'осталось до '+at(clock.deadline):late?'сверх срока':clock.phase==='stopped'?'затрачено':'';
 if(compact)return <View style={[a.box,a.compact]}><View style={a.row}><Text style={a.label}>{clock.label}</Text>{clock.phase!=='waiting'&&<Text accessibilityLiveRegion="none" style={[a.small,late&&a.red]}>{digits}</Text>}</View>{bar}</View>;
 return <View accessibilityLabel={clock.label} style={[a.box,late&&a.lateBox]}>
  <Text style={a.label}>{clock.label.toUpperCase()}</Text>
  {clock.phase==='waiting'?<Text style={a.wait}>{kind==='booking'?'Таймер пойдёт с фактического заезда.':'Таймер пойдёт, когда исполнитель нажмёт «Начать уборку».'}</Text>
  :<View style={a.top}><Text accessibilityLiveRegion="none" style={[a.digits,late&&a.red]}>{digits}</Text><Text style={a.note}>{note}</Text></View>}
  {bar}
  <View style={a.row}><Text style={a.end}>Начало <Text style={a.endB}>{clock.started?at(clock.started):'—'}</Text></Text><Text style={a.end}>{clock.phase==='stopped'&&clock.stopped?<>Конец <Text style={a.endB}>{at(clock.stopped)}</Text></>:<>Срок <Text style={a.endB}>{at(clock.deadline)}</Text>{late&&<> · сейчас <Text style={a.endB}>{hm(t)}</Text></>}</>}</Text></View>
 </View>;
}
const a=StyleSheet.create({
 box:{gap:T.space[3],marginVertical:T.space[3],padding:T.space[5],borderRadius:T.radius.xl,borderWidth:1,borderColor:T.color.line,backgroundColor:T.color.surface},
 lateBox:{borderColor:T.color.dangerSoft},
 label:{fontSize:12,lineHeight:16,fontWeight:'600',letterSpacing:.6,color:T.color.muted},
 top:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',gap:T.space[4],flexWrap:'wrap'},
 digits:{fontSize:36,lineHeight:44,fontWeight:'800',letterSpacing:-.8,fontVariant:['tabular-nums'],color:T.color.ink},
 red:{color:T.color.danger},
 note:{fontSize:14,lineHeight:20,color:T.color.muted,paddingBottom:T.space[2]},
 wait:{fontSize:14,lineHeight:20,color:T.color.inkSoft},
 bar:{height:8,marginVertical:T.space[4],borderRadius:T.radius.full,backgroundColor:T.color.surfaceAlt},
 barSmall:{height:4,marginVertical:T.space[2]},
 fill:{position:'absolute',left:0,top:0,bottom:0,borderRadius:T.radius.full},
 tail:{backgroundColor:T.color.danger},
 flag:{position:'absolute',top:-8,bottom:-8,width:2,marginLeft:-1,borderRadius:2,backgroundColor:T.color.ink},
 dotWrap:{position:'absolute',top:-8,width:24,height:24,marginLeft:-12,alignItems:'center',justifyContent:'center'},
 dotWrapSmall:{top:-4,width:12,height:12,marginLeft:-8},
 halo:{position:'absolute',width:24,height:24,borderRadius:T.radius.full,opacity:.18},
 haloSmall:{width:12,height:12},
 dot:{width:24,height:24,borderRadius:T.radius.full,borderWidth:4,backgroundColor:T.color.surface},
 dotSmall:{width:12,height:12,borderWidth:2},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:T.space[3],flexWrap:'wrap'},
 end:{fontSize:12,lineHeight:16,color:T.color.muted},
 endB:{fontWeight:'600',color:T.color.ink},
 compact:{alignSelf:'stretch',padding:T.space[4],gap:T.space[2],borderRadius:T.radius.md},
 small:{fontSize:14,lineHeight:20,fontWeight:'700',fontVariant:['tabular-nums'],color:T.color.ink}
});
