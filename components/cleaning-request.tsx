'use client';
import {Thinking} from './thinking';
import './booking-request.css';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {useState} from 'react';
import {ArrowRight,Brush} from 'lucide-react';
import {DayStrip,TimeSelect,Stepper,Segments} from './stay-picker';
import {useActivityClock} from './activity-clock';
import {defaultStay,settleStay,stayStamp,type StayChoice} from '../lib/stay-choice';
import {recordSpan} from '../lib/record-span';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const long=(minutes:number)=>minutes<60?minutes+' мин':String(minutes/60).replace('.',',')+' ч';
export const cleaningTasks=['Сменить бельё и полотенца','Убрать санузел и кухню','Помыть полы','Вынести мусор','Пополнить расходники'];
// A cleaning for one of the owner's flats: the day, the start, how long, how much and what to do — the usual
// tasks are ticked instead of typed.
export function CleaningRequest({properties,busy,onSubmit}:{properties:Row[];busy:boolean;onSubmit:(body:Row)=>void}){
 const clock=useActivityClock(),[opened]=useState(()=>Math.floor(Date.now()/1000)),now=clock||opened;
 const [propertyId,setPropertyId]=useState(()=>properties[0]?.id||''),property=properties.find(p=>p.id===propertyId)||properties[0]||{};
 const [when,setWhen]=useState<StayChoice>(()=>settleStay(defaultStay('hourly',{},opened),{},opened)),[minutes,setMinutes]=useState(()=>Math.min(480,Math.max(30,Math.round((property.cleaning_minutes||120)/30)*30)));
 const [fee,setFee]=useState(()=>property.policy?.cleaning_fee||4000),[tasks,setTasks]=useState<string[]>(()=>cleaningTasks.slice(0,4)),[extra,setExtra]=useState('');
 const start=when.day+when.time*60,end=start+minutes*60,description=[...tasks,extra.trim()].filter(Boolean).join('. '),change=(next:Partial<StayChoice>)=>setWhen(settleStay({...when,...next},{},now));
 return <form className="stay-request" aria-label="Новая уборка" onSubmit={e=>{e.preventDefault();if(!busy&&description)onSubmit({propertyId:property.id,start:stayStamp(start),end:stayStamp(end),fee,description});}}>
  <header className="stay-head"><span><Brush size={16}/>Новая уборка</span><h2>{property.title}</h2>{(property.city||property.district)&&<p>{[property.city,property.district].filter(Boolean).join(', ')}</p>}</header>
  {properties.length>1&&(properties.length<=3?<Segments label="Квартира" value={propertyId} disabled={busy} onChange={setPropertyId} options={properties.map(p=>({id:p.id as string,title:p.title}))}/>:<label className="pick-field"><span className="pick-label">Квартира</span><select className="pick-time" value={propertyId} disabled={busy} onChange={e=>setPropertyId(e.target.value)}>{properties.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>)}
  <DayStrip label="День" value={when.day} now={now} disabled={busy} onChange={day=>change({day})}/>
  <div className="pick-row"><TimeSelect label="Начало" value={when.time} day={when.day} now={now} disabled={busy} onChange={time=>change({time})}/><Stepper label="Сколько времени" value={minutes} min={30} max={480} step={30} disabled={busy} format={long} onChange={setMinutes}/></div>
  <Stepper label="Оплата исполнителю" value={fee} min={500} max={100000} step={500} disabled={busy} format={money} onChange={setFee}/>
  <div className="pick-field"><span className="pick-label" id="cleaning-tasks">Что сделать</span><div className="stay-tasks" role="group" aria-labelledby="cleaning-tasks">{cleaningTasks.map(task=><button type="button" key={task} aria-pressed={tasks.includes(task)} disabled={busy} className={tasks.includes(task)?'is-on':undefined} onClick={()=>setTasks(tasks.includes(task)?tasks.filter(t=>t!==task):cleaningTasks.filter(t=>t===task||tasks.includes(t)))}>{task}</button>)}</div><Textarea aria-label="Что ещё важно" value={extra} disabled={busy} maxLength={1500} placeholder="Что ещё важно: где ключи, средства, особые просьбы" onChange={e=>setExtra(e.target.value)}/></div>
  <div className="stay-total"><p className="stay-span">{recordSpan(start,end)}</p><div className="stay-sum"><strong>{money(fee)}</strong><span>за выполнение</span></div></div>
  <div className="stay-actions"><Button className="stay-send" disabled={busy||!description}>{busy?<><Thinking size="sm" tone="plain"/>Публикую…</>:<>Опубликовать задание<ArrowRight size={17}/></>}</Button></div>
  <p className="stay-note">Исполнители увидят район и условия, точный адрес — после назначения. Время Казахстана.</p>
 </form>;
}
