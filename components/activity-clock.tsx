'use client';
import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {activity,duration} from '../lib/activity';
import './activity-track.css';
const ClockContext=createContext(0);
export function ActivityClockProvider({serverTime,children}:{serverTime?:number;children:ReactNode}){
 const [now,setNow]=useState(serverTime||0);
 useEffect(()=>{if(!serverTime)return;const anchor=performance.now();const tick=()=>setNow(serverTime+Math.floor((performance.now()-anchor)/1000));tick();const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[serverTime]);
 return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}
export const useActivityClock=()=>useContext(ClockContext);
const hm=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'});
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'});
// «Дорожка»: big digits over a line from the start to the deadline; a dot moves along it in real time. After the
// deadline the line keeps going past a flag in red, so the delay is seen at a glance. Compact is one line for lists.
export function ActivityTimer({kind,item,compact=false}:{kind:'booking'|'job';item:Record<string,any>;compact?:boolean}){
 const t=useActivityClock(),clock=activity(kind,item,t);if(!clock||!t)return null;
 const {phase}=clock,at=(x:number)=>(day(x)===day(t)?'':day(x)+', ')+hm(x),known=clock.seconds!==null&&clock.seconds!==undefined;
 const digits=known?(phase==='overdue'?'+':'')+duration(clock.seconds as number):'—';
 const flag=phase==='overdue'&&clock.started?Math.min(.85,Math.max(.4,(clock.deadline-clock.started)/Math.max(1,t-clock.started))):1;
 const dot=phase==='running'?clock.progress:phase==='waiting'?0:1;
 const note=phase==='running'?'осталось до '+at(clock.deadline):phase==='overdue'?'сверх срока':phase==='stopped'?'затрачено':'';
 const bar=<span className="activity-track-bar" aria-hidden="true"><i className="activity-track-fill" style={{width:dot*100+'%','--flag':flag*100+'%'} as React.CSSProperties}/>{phase==='overdue'&&<i className="activity-track-flag" style={{left:flag*100+'%'}}/>}<i className="activity-track-dot" style={{left:dot*100+'%'}}/></span>;
 if(compact)return <span className={'activity-track compact '+phase} role="timer" aria-live="off"><span>{clock.label}</span>{phase!=='waiting'&&<strong>{digits}</strong>}{bar}</span>;
 return <section className={'activity-track '+phase} aria-label={clock.label}>
  <span className="activity-track-label">{clock.label}</span>
  {phase==='waiting'?<p className="activity-track-wait">{kind==='booking'?'Таймер пойдёт с фактического заезда.':'Таймер пойдёт, когда исполнитель нажмёт «Начать уборку».'}</p>
  :<div className="activity-track-top"><strong role="timer" aria-live="off">{digits}</strong><span>{note}</span></div>}
  {bar}
  <div className="activity-track-ends"><span>Начало <b>{clock.started?at(clock.started):'—'}</b></span><span>{phase==='stopped'&&clock.stopped?<>Конец <b>{at(clock.stopped)}</b></>:<>Срок <b>{at(clock.deadline)}</b>{phase==='overdue'&&<> · сейчас <b>{hm(t)}</b></>}</>}</span></div>
 </section>;
}
