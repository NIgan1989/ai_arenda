'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Clock3} from 'lucide-react';
import {activity,duration} from '../lib/activity';
const ClockContext=createContext(0);
export function ActivityClockProvider({serverTime,children}:{serverTime?:number;children:ReactNode}){
 const [now,setNow]=useState(serverTime||0);
 useEffect(()=>{if(!serverTime)return;const anchor=performance.now();const tick=()=>setNow(serverTime+Math.floor((performance.now()-anchor)/1000));tick();const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[serverTime]);
 return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}
export const useActivityClock=()=>useContext(ClockContext);
const time=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export function ActivityTimer({kind,item,compact=false}:{kind:'booking'|'job';item:Record<string,any>;compact?:boolean}){
 const t=useActivityClock(),clock=activity(kind,item,t);if(!clock||!t)return null;
 return <span className={'activity-timer '+clock.phase+(compact?' compact':'')}>
  <span className="activity-timer-heading"><Clock3 size={compact?14:17}/><span>{clock.label}</span>{clock.phase!=='waiting'&&<strong className={clock.seconds===null?'unknown-time':undefined} role="timer" aria-live="off">{clock.seconds===null?'Время не сохранено':duration(clock.seconds)}</strong>}</span>
  {!compact&&<><span className="activity-timer-detail">{clock.started?'Начало: '+time(clock.started):'Фактическое начало ещё не подтверждено'}{clock.phase!=='stopped'?' · срок: '+time(clock.deadline):''}</span>{clock.phase!=='waiting'&&clock.elapsed!==null&&<span className="activity-timer-detail">{clock.phase==='stopped'?'Затрачено':'Прошло'}: {duration(clock.elapsed)}</span>}{clock.started&&<progress max={1} value={clock.progress} aria-label="Использованная часть согласованного времени"/>}{clock.phase==='overdue'&&<span className="activity-timer-detail">Срок прошёл. Освобождение квартиры или завершение работы нужно подтвердить отдельно.</span>}</>}
 </span>;
}
