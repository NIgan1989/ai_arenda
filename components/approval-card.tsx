'use client';
import {useState,type ReactNode} from 'react';
import {Check,Clock3,MessagesSquare,X} from 'lucide-react';
import type {Approval} from '../lib/approvals';
import {duration} from '../lib/activity';
import {useActivityClock} from './activity-clock';
type Row=Record<string,any>;
export function ApprovalCard({card,busy,onDecide}:{card:Approval;busy:boolean;onDecide:(body:Row)=>void}){
 const [rejecting,setRejecting]=useState(false),[reason,setReason]=useState(''),[fee,setFee]=useState(card.cleaningFee||0),t=useActivityClock(),expired=!!card.expiresAt&&t>=card.expiresAt;
 const decide=(action:string)=>onDecide({id:card.id,revision:card.revision,action,reason,cleaningFee:fee});
 return <section className="inline-card approval-card" aria-label={card.title+': '+card.subject}>
  <div className="card-eyebrow"><MessagesSquare size={16}/>{card.canDecide?'Нужно ваше решение':'Ожидает ответа'}{card.expiresAt&&<span className="approval-expiry"><Clock3 size={13}/>{expired?'Срок истёк':t?duration(card.expiresAt-t):'Уточняю время'}</span>}</div>
  <h2>{card.title}</h2><p className="approval-subject">{card.subject}</p><p className="approval-participants">{card.from} → {card.to}</p>
  <dl>{card.facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{card.detail&&<p className="approval-detail">{card.detail}</p>}
  {card.canDecide&&!expired?<><form className="inline-form" onSubmit={event=>{event.preventDefault();decide(rejecting?'reject':'accept');}}>
   {card.kind==='booking'&&!rejecting&&<label>Оплата уборки после выезда, ₸<input type="number" min={0} max={1000000} required value={fee} disabled={busy} onChange={event=>setFee(Number(event.target.value))}/><small>Ноль — не публиковать уборку автоматически. Это расход владельца; стоимость проживания не меняется.</small></label>}
   {rejecting&&card.requiresReason&&<label>{card.kind==='report'?'Что нужно доработать?':'Почему выезд не подтверждён?'}<textarea value={reason} onChange={event=>setReason(event.target.value)} required maxLength={1000} disabled={busy}/></label>}
   <div className="inline-actions">{rejecting?<><button className="inline-button" disabled={busy}><X size={16}/>{card.rejectLabel}</button><button type="button" className="inline-button secondary" disabled={busy} onClick={()=>setRejecting(false)}>Назад</button></>:<><button className="inline-button" disabled={busy}><Check size={16}/>{card.acceptLabel}</button><button type="button" className="inline-button secondary" disabled={busy} onClick={()=>card.requiresReason?setRejecting(true):decide('reject')}><X size={16}/>{card.rejectLabel}</button></>}</div>
  </form><small className="approval-note">Решение проверяется и сохраняется на сервере. Кнопки не выполняют банковскую операцию.</small></>:<p className="approval-note">{expired?'Обновите данные: ответ по этой карточке больше не принимается.':'Решение доступно получателю. После ответа здесь появится актуальный статус задачи.'}</p>}
 </section>;
}
export function ApprovalInbox({cards,busy,onDecide}:{cards:Approval[];busy:boolean;onDecide:(body:Row)=>void}){
 const incoming=cards.filter(c=>c.canDecide),outgoing=cards.filter(c=>!c.canDecide);
 return <section className="approval-inbox" aria-label="Согласования в чате"><div className="approval-inbox-title"><h2>Согласования</h2><span>{incoming.length} ждут решения</span></div>{incoming.length?incoming.map(card=><ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={onDecide}/>):<p className="workspace-empty">Сейчас нет запросов, требующих вашего решения.</p>}{outgoing.length>0&&<details className="outgoing-approvals"><summary>Отправленные запросы · {outgoing.length}</summary>{outgoing.map(card=><ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={onDecide}/>)}</details>}</section>;
}
export function DecisionPrompt({title,subject,children,busy,acceptLabel,onAccept,onDismiss}:{title:string;subject:string;children:ReactNode;busy:boolean;acceptLabel:string;onAccept:()=>void;onDismiss:()=>void}){
 return <section className="inline-card approval-card" aria-label={title}><div className="card-eyebrow"><MessagesSquare size={16}/>Подтверждение действия</div><h2>{title}</h2><p className="approval-subject">{subject}</p>{children}<div className="inline-actions"><button className="inline-button" disabled={busy} onClick={onAccept}><Check size={16}/>{acceptLabel}</button><button className="inline-button secondary" disabled={busy} onClick={onDismiss}>Не выполнять</button></div></section>;
}
