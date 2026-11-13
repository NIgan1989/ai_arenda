'use client';
import {ShieldCheck,UserRound,Smartphone,Sparkles,type LucideIcon} from 'lucide-react';
import './admin-reviews.css';

type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;

// Правила допуска: one switch per rule. A tap saves at once; the change applies to new publications,
// bookings and assignments only.
export function AdminPolicy({state,busy,save}:{state:Row;busy:boolean;save:Save}){
 const p=state.policy||{},locked=!!state.testMode;
 const rules:{key:string;field:string;on:boolean;Icon:LucideIcon;title:string;note:string}[]=[
  {key:'owner',field:'requireOwnerReview',on:!!p.require_owner_review,Icon:ShieldCheck,title:'Проверять квартиру до показа на карте',note:'Новая квартира попадает на карту и принимает брони после проверки.'},
  {key:'cleaner',field:'requireCleanerReview',on:!!p.require_cleaner_review,Icon:UserRound,title:'Проверять исполнителя до назначения',note:'Назначить на уборку можно только проверенного исполнителя.'},
  {key:'phone',field:'requirePhone',on:!!p.require_phone,Icon:Smartphone,title:'Требовать подтверждённый номер',note:'Нужен работающий SMS-канал, иначе новые операции остановятся.'}
 ];
 const current={requireOwnerReview:!!p.require_owner_review,requireCleanerReview:!!p.require_cleaner_review,requirePhone:!!p.require_phone};
 const toggle=(field:string,on:boolean)=>save('governance/policy',{...current,[field]:!on,expectedVersion:p.version,confirmed:true});
 return <div className="admin-reviews">
  <section className="reviews-ai"><div className="reviews-ai-copy"><span className="reviews-ai-badge"><Sparkles size={16}/>ИИ-администратор</span><h2>Проверки идут сами</h2><p>Когда проверка включена, заявки сначала смотрит ИИ: одобряет по правилам, а спорные отдаёт вам в «Проверки» и в Telegram.</p></div></section>
  {locked&&<p className="policy-note">Учебный стенд: правила включаются только на рабочем сервисе. Учебные брони и назначения работают без проверок.</p>}
  <ul className="policy-list">{rules.map(({key,field,on,Icon,title,note})=><li key={key}><span><strong><Icon size={16}/>{title}</strong><small>{note}</small></span><button type="button" role="switch" aria-checked={on} aria-label={title} className="policy-switch" disabled={busy||locked||!p.version} onClick={()=>toggle(field,on)}/></li>)}</ul>
  <p className="policy-note">Изменение действует на новые публикации, брони и назначения. Оплаты, текущие проживания и принятые уборки не меняются.</p>
 </div>;
}
