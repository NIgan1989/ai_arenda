'use client';
import {Home,ShieldCheck} from 'lucide-react';
import {cleanerMoneyLine} from '../lib/regular-cleaner-text';
import './regular-cleaner.css';
type Row=Record<string,any>;

// The cleaner's regular flats: owners who pinned her, money the service holds or paid, and the way out.
export function RegularFlats({regular,busy,onLeave}:{regular:Row;busy:boolean;onLeave:(propertyId:string)=>void}){
 const money=cleanerMoneyLine(regular.money||{});
 return <section className="acct ops-rules rc" aria-labelledby="rf-title">
  <p className="acct-label" id="rf-title">Постоянные квартиры</p>
  {regular.flats.length?<ul className="rc-list">{regular.flats.map((f:Row)=><li key={f.property_id} className="rc-person">
   <span className="pe-ico"><Home size={16}/></span>
   <span className="pe-text"><strong>{f.title}</strong><small>{[f.owner_name,[f.city,f.district].filter(Boolean).join(', '),f.done?'уборок: '+f.done:''].filter(Boolean).join(' · ')}</small></span>
   <button type="button" className="pe-later" disabled={busy} onClick={()=>onLeave(f.property_id)}>Отказаться</button>
  </li>)}</ul>:<p className="rc-empty">Когда владелец закрепит вас за квартирой, её уборки будут приходить вам первой, а «да» сразу назначит вас.</p>}
  {money&&<p className="rc-money"><ShieldCheck size={16}/>{money}</p>}
  <small className="acct-note">{regular.terms}</small>
 </section>;
}
