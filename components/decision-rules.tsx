'use client';
import {useEffect,useState} from 'react';
import {Sparkles,Clock} from 'lucide-react';
import {Thinking} from './thinking';
type Row=Record<string,any>;

// «Автопилот: решения и сроки». Every question the AI administrator waits on a person for: whether the AI decides by
// itself when nobody answers, and how long it waits. Each change is saved at once, as every switch of the menu.
export function DecisionRules({api}:{api:(path:string,body?:Row)=>Promise<Row>}){
 const [rules,setRules]=useState<Row[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;api('operations/decision-rules/state').then(v=>{if(live)setRules(v.rules);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function save(rule:Row,patch:Row){
  if(busy||!rules)return;const before=rules;setBusy(rule.key);setError('');setMessage('');
  setRules(rules.map(r=>r.key===rule.key?{...r,...patch}:r));
  try{const r=await api('operations/decision-rules',{rule:rule.key,...patch});setRules(r.rules);setMessage(r.message||'Сохранено.');}catch(e:any){setRules(before);setError(e.message);}finally{setBusy('');}
 }
 if(!rules)return error?<p className="form-error" role="alert">{error}</p>:<p role="status"><Thinking size="sm" lead/>Загружаю настройки…</p>;
 return <>
  <small className="acct-note">Когда ИИ-администратор ждёт чьего-то ответа, здесь видно, сколько он ждёт и что делает дальше. Без ответа ИИ решает сам только там, где это включено.</small>
  <div className="acct-live" aria-live="polite">{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status" className="acct-saved">{message}</p>}</div>
  {rules.map(r=><section key={r.key} className="acct-group" aria-label={r.title}>
   {r.auto?<label className="acct-row"><Sparkles size={20}/><span>{r.title}<small>{r.auto}</small></span><input type="checkbox" role="switch" className="acct-switch" aria-label={r.title+': '+r.auto} checked={!!r.on} disabled={!!busy} onChange={e=>save(r,{on:e.target.checked})}/></label>
    :<div className="acct-row acct-static"><Sparkles size={20}/><span>{r.title}</span></div>}
   <div className="acct-row acct-static acct-seg-row acct-rule-time"><Clock size={20}/><span>{r.time}</span><div className="acct-seg" role="radiogroup" aria-label={r.title+': '+r.time}>{r.choices.map(([m,label]:[number,string])=><button key={m} type="button" role="radio" aria-checked={r.minutes===m} disabled={!!busy} onClick={()=>r.minutes!==m&&save(r,{minutes:m})}>{label}</button>)}</div></div>
   <small className="acct-note acct-rule-note">{r.on||!r.off?r.note:r.off}</small>
  </section>)}
 </>;
}
