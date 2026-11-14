'use client';
import {useEffect,useState} from 'react';
import {Sparkles} from 'lucide-react';
import './account-list.css';
import {flatAutopilotNote,type FlatAutopilot} from '../lib/flat-autopilot';
type Row=Record<string,any>;
async function call(path:string,body?:Row){const r=await fetch('/api/operations/'+path,{method:body?'POST':'GET',headers:{'X-Workspace-Role':'owner',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const v=await r.json() as Row;if(!r.ok)throw Error(v.error||'Не получилось. Попробуйте ещё раз.');return v;}

// The «Автопилот» plan of one flat, in its settings: a switch, the price in one line and, when the AI
// still needs it, the cleaning price. The plan is paid per flat, so it lives with the flat, not in the menu.
export function FlatAutopilotRow({propertyId,onChanged}:{propertyId:string;onChanged?:()=>void}){
 const [state,setState]=useState<FlatAutopilot|null>(null),[busy,setBusy]=useState(false),[asking,setAsking]=useState(false),[fee,setFee]=useState(''),[notice,setNotice]=useState('');
 async function load(){try{const v=await call('autopilot/state'),flat=(v.flats||[]).find((f:Row)=>f.id===propertyId);setState(flat?{...flat,price:v.settings?.price||0,trialDays:v.settings?.trialDays||0,charge:!!v.settings?.charge}:null);}catch(e:any){setNotice(e.message);}}
 useEffect(()=>{void load();},[propertyId]);
 async function run(body:()=>Promise<Row>){setBusy(true);setNotice('');try{const r=await body();setNotice(r.failed?.length?r.failed[0].error:'');setAsking(false);await load();onChanged?.();}catch(e:any){setNotice(e.message);await load();}finally{setBusy(false);}}
 const on=(cleaningFee?:number)=>run(()=>call('autopilot/start',{propertyIds:[propertyId],...(cleaningFee?{cleaningFees:{[propertyId]:cleaningFee}}:{})}));
 const off=()=>run(()=>call('matching/preference',{propertyId,mode:'manual'}));
 function toggle(next:boolean){if(!state)return;if(!next){void off();return;}if(!state.ownStaff&&!(state.cleaningFee>=100)){setAsking(true);return;}void on();}
 return <div className="hub-autopilot">
  <label className="hub-row hub-switch"><span className="hub-row-icon" aria-hidden="true"><Sparkles size={20}/></span><span className="hub-row-text"><strong>Автопилот</strong><small>{state?flatAutopilotNote(state):notice||'Загружаем…'}</small></span><input type="checkbox" role="switch" className="acct-switch" checked={!!state?.managed||asking} disabled={busy||!state||!state.ready} onChange={e=>toggle(e.target.checked)}/></label>
  {asking&&<form className="hub-autopilot-fee" onSubmit={e=>{e.preventDefault();void on(Number(fee));}}><label>Сколько платить за уборку, ₸<input type="number" inputMode="numeric" min={100} max={1000000} required value={fee} onChange={e=>setFee(e.target.value)} autoFocus/></label><div><button type="submit" disabled={busy||Number(fee)<100}>Включить</button><button type="button" disabled={busy} onClick={()=>setAsking(false)}>Отмена</button></div></form>}
  {notice&&state&&<p className="hub-autopilot-note" role="status">{notice}</p>}
 </div>;
}
