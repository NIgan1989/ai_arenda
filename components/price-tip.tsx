'use client';
import {useEffect,useState} from 'react';
import {Check,Sparkles,TrendingDown,TrendingUp,X} from 'lucide-react';
import type {Approval} from '../lib/approvals';
import './price-tip.css';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const hiddenKey='ai-arenda-price-tip-later';
function laterIds():string[]{try{return JSON.parse(sessionStorage.getItem(hiddenKey)||'[]');}catch{return [];}}

// The AI administrator's price advice, shown like a notification on top of the owner's map.
// Two buttons: the owner raises (or lowers) the price, or leaves it. «Позже» only hides it for now.
export function PriceTipBody({card,busy,onDecide,compact=false}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact?:boolean}){
 const p=card.price!,up=p.direction==='up',Icon=up?TrendingUp:TrendingDown;
 return <>
  <div className="price-tip-price" aria-label={'Сейчас '+money(p.from)+', предлагаю '+money(p.to)}>
   <span className="price-tip-from">{money(p.from)}</span><span className="price-tip-arrow" aria-hidden="true">→</span><strong className="price-tip-to">{money(p.to)}</strong>
   <span className={'price-tip-delta'+(up?' is-up':' is-down')}><Icon size={14} aria-hidden="true"/>{(up?'+':'−')+p.percent}%</span>
  </div>
  {compact?<p className="price-tip-why">{p.reasons.slice(0,2).join(' · ')}</p>:<>
   {p.rows.length>1&&<p className="price-tip-rows">{p.rows.slice(1).map(([label,from,to])=><span key={label}>{label}: {money(from)} → {money(to)}</span>)}</p>}
   {p.reasons.length>0&&<ul className="price-tip-reasons">{p.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </>}
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>Оставить</button>
  </div>
  {!compact&&<p className="price-tip-note">Без вашего согласия цена не изменится.</p>}
 </>;
}

export function PriceTip({cards,onChanged}:{cards:Approval[];onChanged?:()=>void}){
 const [later,setLater]=useState<string[]>(()=>typeof window==='undefined'?[]:laterIds()),[busy,setBusy]=useState(false),[result,setResult]=useState<{text:string;error:boolean}|null>(null);
 const card=cards.find(c=>c.kind==='price'&&c.price&&c.canDecide&&!later.includes(c.id));
 useEffect(()=>{if(!result)return;const t=setTimeout(()=>setResult(null),result.error?8000:5000);return()=>clearTimeout(t);},[result]);
 if(result)return <aside className="price-tip is-result" role="status"><span className={'price-tip-icon'+(result.error?' is-error':'')} aria-hidden="true">{result.error?<X size={18}/>:<Check size={18}/>}</span><p>{result.text}</p></aside>;
 if(!card)return null;
 const up=card.price!.direction==='up';
 async function decide(action:'accept'|'reject'){
  if(!card)return;setBusy(true);
  try{const r=await fetch('/api/approvals',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':'owner'},body:JSON.stringify({id:card.id,revision:card.revision,action}),cache:'no-store'}),v=await r.json() as Row;
   setResult({text:r.ok?v.message||'Готово.':v.error||'Не получилось. Обновите экран.',error:!r.ok});onChanged?.();}
  catch{setResult({text:'Нет связи. Цена не изменилась, попробуйте ещё раз.',error:true});}
  finally{setBusy(false);}
 }
 function hide(){if(!card)return;const next=[...later,card.id];setLater(next);try{sessionStorage.setItem(hiddenKey,JSON.stringify(next));}catch{}}
 return <aside className={'price-tip'+(up?' is-up':' is-down')} aria-label="Совет AI администратора по цене">
  <header className="price-tip-head">
   <span className="price-tip-icon" aria-hidden="true"><Sparkles size={18}/></span>
   <span className="price-tip-title"><small>AI администратор · {up?'спрос вырос':'спрос снизился'}</small><strong>{card.subject}</strong></span>
   <button type="button" className="price-tip-close" aria-label="Позже" title="Позже" onClick={hide}><X size={18}/></button>
  </header>
  <PriceTipBody card={card} busy={busy} onDecide={decide} compact/>
 </aside>;
}
