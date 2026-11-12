'use client';
import {Minus,Plus} from 'lucide-react';
import {stayClock,stayDay,stayDays,stayTimes} from '../lib/stay-choice';
import './stay-picker.css';
// The parts a stay or a cleaning is chosen with: a strip of days, a time, a "how many" stepper and a tariff switch.
const words=(day:number,options:Intl.DateTimeFormatOptions)=>new Date((day+18000)*1000).toLocaleDateString('ru-RU',{timeZone:'UTC',...options});
export const stayDayWords=(day:number)=>words(day,{day:'numeric',month:'long'});
export function DayStrip({label,value,now,disabled,onChange}:{label:string;value:number;now:number;disabled?:boolean;onChange:(day:number)=>void}){
 const today=stayDay(now),days=stayDays(now,21),all=days.includes(value)?days:[value,...days];
 return <div className="pick-field"><span className="pick-label" id={'pick-'+label}>{label}</span><div className="pick-days" role="radiogroup" aria-labelledby={'pick-'+label}>{all.map(day=><button type="button" role="radio" key={day} aria-checked={day===value} aria-label={words(day,{weekday:'long',day:'numeric',month:'long'})} disabled={disabled} className={'pick-day'+(day===value?' is-on':'')} onClick={()=>onChange(day)}><small>{day===today?'сегодня':day===today+86400?'завтра':words(day,{weekday:'short'})}</small><strong>{words(day,{day:'numeric'})}</strong><small>{words(day,{month:'short'}).replace('.','')}</small></button>)}</div></div>;
}
export function TimeSelect({label,value,day,now,disabled,onChange}:{label:string;value:number;day:number;now:number;disabled?:boolean;onChange:(minutes:number)=>void}){
 const times=stayTimes(day,now),all=times.includes(value)?times:[value,...times];
 return <label className="pick-field"><span className="pick-label">{label}</span><select className="pick-time" value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}>{all.map(m=><option key={m} value={m}>{stayClock(m)}</option>)}</select></label>;
}
export function Stepper({label,value,min,max,step=1,disabled,format,onChange}:{label:string;value:number;min:number;max:number;step?:number;disabled?:boolean;format:(value:number)=>string;onChange:(value:number)=>void}){
 return <div className="pick-field"><span className="pick-label">{label}</span><div className="pick-stepper" role="group" aria-label={label}><button type="button" aria-label="Меньше" disabled={disabled||value-step<min} onClick={()=>onChange(value-step)}><Minus size={18}/></button><output aria-live="polite">{format(value)}</output><button type="button" aria-label="Больше" disabled={disabled||value+step>max} onClick={()=>onChange(value+step)}><Plus size={18}/></button></div></div>;
}
export function Segments<T extends string>({label,value,options,disabled,onChange}:{label:string;value:T;options:{id:T;title:string;note?:string}[];disabled?:boolean;onChange:(value:T)=>void}){
 return <div className="pick-segments" role="radiogroup" aria-label={label}>{options.map(o=><button type="button" role="radio" key={o.id} aria-checked={o.id===value} disabled={disabled} className={o.id===value?'is-on':undefined} onClick={()=>onChange(o.id)}><strong>{o.title}</strong>{o.note&&<small>{o.note}</small>}</button>)}</div>;
}
