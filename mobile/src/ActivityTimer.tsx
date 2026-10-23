import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {AppState,View,Text,StyleSheet} from 'react-native';
import {activity,duration} from '../../lib/activity';
import {C} from './styles';
const Clock=createContext(0);
export const useActivityClock=()=>useContext(Clock);
export function ActivityClockProvider({serverTime,children}:{serverTime?:number;children:ReactNode}){
 const [now,setNow]=useState(serverTime||0);
 useEffect(()=>{if(!serverTime)return;const anchor=performance.now(),tick=()=>setNow(serverTime+Math.floor((performance.now()-anchor)/1000));tick();const timer=setInterval(tick,1000),subscription=AppState.addEventListener('change',value=>{if(value==='active')tick();});return()=>{clearInterval(timer);subscription.remove();};},[serverTime]);
 return <Clock.Provider value={now}>{children}</Clock.Provider>;
}
export function ActivityTimer({kind,item,compact=false}:{kind:'booking'|'job';item:Record<string,any>;compact?:boolean}){
 const t=useActivityClock(),clock=activity(kind,item,t);if(!clock||!t)return null;
 return <View style={[a.box,clock.phase==='overdue'&&a.late,compact&&a.compact]}><Text style={a.label}>{clock.label}</Text>{clock.phase!=='waiting'&&<Text accessibilityLiveRegion="none" style={[a.counter,compact&&a.small]}>{clock.seconds===null?'Время не зафиксировано':duration(clock.seconds)}</Text>}{!compact&&<><Text style={a.detail}>{clock.started?'Начало: '+new Date(clock.started*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'}):'Фактическое начало ещё не подтверждено'}</Text>{clock.elapsed!==null&&<Text style={a.detail}>Прошло: {duration(clock.elapsed)}</Text>}</>}</View>;
}
const a=StyleSheet.create({box:{padding:13,borderRadius:13,borderWidth:1,borderColor:'#DCE7D5',backgroundColor:'#F2F6EF',gap:6,marginVertical:8},late:{backgroundColor:'#FFF5E7',borderColor:'#EAD4B1'},label:{fontSize:13,lineHeight:20,color:C.ink},counter:{fontSize:23,fontWeight:'600',fontVariant:['tabular-nums'],color:C.ink},detail:{fontSize:12,lineHeight:19,color:C.muted},compact:{padding:8},small:{fontSize:15}});
