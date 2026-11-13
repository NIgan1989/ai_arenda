'use client';
import {useState} from 'react';
import {ChevronRight,KeyRound} from 'lucide-react';
import {Thinking} from './thinking';
import './checkin-guide.css';

// The server says why the instruction is closed in words for all three roles at once; the guest gets his own.
const WHY:Record<number,string>={
 403:'Инструкция откроется за час до заезда, когда оплата и депозит подтверждены, а жильё готово.',
 404:'Владелец ещё не добавил инструкцию. Напишите ему в чат брони.',
 503:'Инструкции сейчас недоступны. Попробуйте позже или напишите владельцу.',
};

// «Как заселиться» inside a booking: the owner's instruction is asked for only when the guest taps, because every
// opening is checked (time, payment, readiness) and recorded.
export function CheckinGuide({bookingId}:{bookingId:string}){
 const [state,setState]=useState<{text:string;closed?:boolean}|null>(null),[busy,setBusy]=useState(false);
 async function open(){
  if(busy)return;setBusy(true);
  try{
   const response=await fetch('/api/operations/access/open',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Workspace-Role':'guest'},body:JSON.stringify({entityId:bookingId})});
   const value=await response.json().catch(()=>null) as {instructions?:string}|null;
   setState(response.ok&&value?.instructions?{text:value.instructions}:{text:WHY[response.status]||WHY[503],closed:true});
  }catch{setState({text:'Нет связи. Проверьте интернет и попробуйте ещё раз.',closed:true});}
  finally{setBusy(false);}
 }
 return <section className="checkin-guide" aria-label="Как заселиться">
  {(!state||state.closed)&&<button type="button" className="checkin-guide-open" disabled={busy} aria-busy={busy} onClick={()=>void open()}><KeyRound size={18} aria-hidden="true"/><span>Как заселиться</span>{busy?<Thinking size="sm"/>:<ChevronRight size={18} aria-hidden="true"/>}</button>}
  {state&&(state.closed
   ?<p className="checkin-guide-note" role="status">{state.text}</p>
   :<div className="checkin-guide-text" role="status"><strong><KeyRound size={16} aria-hidden="true"/>Как заселиться</strong><p>{state.text}</p></div>)}
 </section>;
}
