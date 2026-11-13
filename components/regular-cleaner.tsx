'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,Camera,LifeBuoy,Percent,ShieldCheck,Sparkles,UserCheck,Zap} from 'lucide-react';
import {regularBenefits,regularSince} from '../lib/regular-cleaner-text';
import './regular-cleaner.css';
type Row=Record<string,any>;
type API=(path:string,body?:Row)=>Promise<any>;
const ICONS:Record<string,ReactNode>={first:<Zap size={16}/>,backup:<LifeBuoy size={16}/>,guarantee:<ShieldCheck size={16}/>,fee:<Percent size={16}/>,proof:<Camera size={16}/>};

// «Постоянный исполнитель» for one flat: pin the cleaner the owner already works with, and see what the pair gets
// from the service that a messenger does not give: first offers, backup, reserved pay, lower commission, proof.
export function RegularCleaner({propertyId,api,onBack}:{propertyId:string;api:API;onBack:()=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[confirm,setConfirm]=useState(false);
 async function load(){try{setState(await api('operations/regular/state',{propertyId}));}catch(e:any){setError(e?.message||'Не удалось загрузить.');}}
 useEffect(()=>{load();},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await api(path,{propertyId,...body});setNote(r?.message||'');setConfirm(false);await load();}catch(e:any){setError(e?.message||'Не получилось.');}finally{setBusy(false);}}
 const r=state?.regular,benefits=state?regularBenefits(state):[];
 return <section className="pq pe rc" aria-labelledby="rc-title">
  <header className="pe-bar"><button type="button" className="pq-icon" onClick={onBack} aria-label="Назад к списку" disabled={busy}><ArrowLeft size={20}/></button><h2 id="rc-title">Постоянный исполнитель</h2></header>
  <div className="pe-body">
   {!state&&!error&&<p className="pe-hint">Загружаю…</p>}
   {r&&<div className="rc-person is-pinned">
    <span className="rc-avatar" aria-hidden="true">{(r.name||'?').slice(0,1)}</span>
    <span className="pe-text"><strong>{r.name}</strong><small>{regularSince(r)}</small></span>
    <span className="rc-badge"><UserCheck size={14}/>Постоянная</span>
   </div>}
   {state&&!r&&<>
    <p className="pe-hint">Закрепите исполнителя, с которым уже работаете, и уборки этой квартиры будут сами приходить к нему.</p>
    {state.candidates.length?<ul className="rc-list">{state.candidates.map((c:Row)=><li key={c.id} className="rc-person">
     <span className="rc-avatar" aria-hidden="true">{(c.name||'?').slice(0,1)}</span>
     <span className="pe-text"><strong>{c.name}</strong><small>{regularSince(c)}</small></span>
     <button type="button" className="rc-pin" disabled={busy} onClick={()=>run('operations/regular/pin',{cleanerId:c.id})}>Закрепить</button>
    </li>)}</ul>:<p className="rc-empty"><Sparkles size={16}/>Пока закрепить некого. После первой уборки через сервис здесь появится тот, кто её сделал.</p>}
   </>}
   {state&&<>
    <p className="pq-h">{r?'Что это даёт':'Что даст закрепление'}</p>
    <ul className="rc-benefits">{benefits.map(b=><li key={b.key} className={b.warn?'is-warn':''}><span className="pe-ico">{ICONS[b.key]}</span><span className="pe-text"><strong>{b.title}</strong><small>{b.text}</small></span></li>)}</ul>
   </>}
   {note&&<p className="rc-note" role="status">{note}</p>}
   {error&&<p className="pq-error" role="alert">{error}</p>}
   {r&&(confirm?<div className="pe-remove" role="group" aria-labelledby="rc-off-q">
    <p id="rc-off-q"><strong>Снять закрепление с {r.name}?</strong> Уже назначенные уборки останутся за ним, новые ИИ будет предлагать лучшим свободным исполнителям.</p>
    <span className="pe-advice-actions"><button type="button" className="pe-danger" disabled={busy} onClick={()=>run('operations/regular/unpin',{})}>{busy?'Снимаю…':'Снять'}</button><button type="button" className="pe-later" disabled={busy} onClick={()=>setConfirm(false)}>Отмена</button></span>
   </div>:<button type="button" className="pe-remove-link" disabled={busy} onClick={()=>setConfirm(true)}>Снять закрепление</button>)}
  </div>
 </section>;
}
