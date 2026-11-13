'use client';
import {useState} from 'react';
import {Sparkles,CheckCircle2,AlertTriangle,CircleDashed,House,UserRound,Camera,ChevronDown} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import './admin-reviews.css';

type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const money=(n:number)=>Math.round(n||0).toLocaleString('ru-RU').replace(/ /g,' ')+' ₸';
const when=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const stateIcon={ok:CheckCircle2,fix:CircleDashed,risk:AlertTriangle} as const;

// Проверки: the AI administrator checks every request by visible rules. The administrator sees only what
// the AI asks about, decides with one tap, and can look back at what the AI approved by itself this week.
export function AdminReviews({data,busy,save}:{data:Row;busy:boolean;save:Save}){
 const auto=!!data.policy?.ai_review,pending:Row[]=data.pendingReviews||[],decided:Row[]=data.aiDecided||[];
 const yours=pending.filter(r=>!auto||r.ai_verdict!=='fix'),waiting=auto?pending.filter(r=>r.ai_verdict==='fix'):[],approvedAI=decided.filter(r=>r.status==='approved').length;
 const [showWaiting,setShowWaiting]=useState(false);
 return <div className="admin-reviews">
  <section className={'reviews-ai'+(auto?'':' is-off')}>
   <div className="reviews-ai-copy"><span className="reviews-ai-badge"><Sparkles size={16}/>ИИ-администратор</span><h2>{auto?'Проверяет заявки сам':'Проверки решаете вы'}</h2><p>{auto?'Одобряет, когда все правила пройдены. Если чего-то не хватает, сам пишет участнику и проверяет снова. Спорное отдаёт вам.':'ИИ показывает свои проверки у каждой заявки, решение за вами.'}</p></div>
   <div className="reviews-ai-side">
    <div className="reviews-switch" role="radiogroup" aria-label="Кто проверяет заявки"><button type="button" role="radio" aria-checked={auto} disabled={busy} onClick={()=>!auto&&save('reviews/ai',{enabled:true})}>Проверяет ИИ</button><button type="button" role="radio" aria-checked={!auto} disabled={busy} onClick={()=>auto&&save('reviews/ai',{enabled:false})}>Я сам</button></div>
    <dl className="reviews-stats"><div><dt>Ждут вас</dt><dd>{yours.length}</dd></div><div><dt>Ждут участника</dt><dd>{waiting.length}</dd></div><div><dt>ИИ одобрил за неделю</dt><dd>{approvedAI}</dd></div></dl>
   </div>
  </section>
  <details className="reviews-rules"><summary>Правила проверки<ChevronDown size={16}/></summary><div><div><h3><House size={16}/>Квартира</h3><ul><li>Описание не короче 80 знаков</li><li>Не меньше 3 фото</li><li>Точка на карте</li><li>Цена не ниже 40% и не выше 250% обычной в городе</li><li>Адрес не совпадает с квартирой другого владельца</li><li>В тексте нет телефонов, ссылок и оплаты мимо сервиса</li><li>За полгода не было отказов и нет открытых жалоб гостей</li></ul></div><div><h3><UserRound size={16}/>Исполнитель</h3><ul><li>Указано имя</li><li>Есть фото профиля</li><li>За полгода не было отказов и нет открытых жалоб владельцев</li><li>Допуск на 6 месяцев, каждое назначение всё равно согласует владелец</li></ul></div></div><small>Первые три пункта у квартиры и первые два у исполнителя участник исправляет сам: ИИ пишет ему, что добавить. Остальное, если не сходится, приходит вам.</small></details>
  <section className="reviews-group"><header><h2>Нужно ваше решение</h2><span>{yours.length}</span></header>
   {yours.length===0?<div className="reviews-empty"><CheckCircle2 size={22}/><p>{auto?'Всё спокойно: спорных заявок нет.':'Новых заявок пока нет.'}</p></div>:<div className="reviews-list">{yours.map(r=><ReviewCard key={r.id+':'+r.version} review={r} busy={busy} save={save}/>)}</div>}
  </section>
  {waiting.length>0&&<section className="reviews-group"><header><h2>Ждут участника</h2><span>{waiting.length}</span><button type="button" className="reviews-toggle" onClick={()=>setShowWaiting(v=>!v)}>{showWaiting?'Скрыть':'Показать'}</button></header>
   <p className="reviews-note">ИИ уже написал, что добавить, и одобрит сам, когда всё будет на месте.</p>
   {showWaiting&&<div className="reviews-list">{waiting.map(r=><ReviewCard key={r.id+':'+r.version} review={r} busy={busy} save={save} quiet/>)}</div>}
  </section>}
  {decided.length>0&&<section className="reviews-group"><header><h2>Решено ИИ за неделю</h2><span>{decided.length}</span></header>
   <ul className="reviews-done">{decided.map(r=><li key={r.id}><span className="reviews-role">{r.role==='owner'?<House size={16}/>:<UserRound size={16}/>}</span><span><strong>{r.role==='owner'?(r.title||'Квартира'):r.name}</strong><small>{r.role==='owner'?r.name+' · '+(r.city||''):'Исполнитель'+(r.valid_until?' · допуск до '+new Date(r.valid_until*1000).toLocaleDateString('ru-RU'):'')}</small></span><span className="reviews-when">{r.status==='approved'?'Одобрено':'Отклонено'} · {when(r.reviewed_at)}</span></li>)}</ul>
  </section>}
 </div>;
}

function ReviewCard({review:r,busy,save,quiet=false}:{review:Row;busy:boolean;save:Save;quiet?:boolean}){
 const checks:Row[]=r.ai_checks||[],risks=checks.filter(c=>c.state==='risk'),fixes=checks.filter(c=>c.state==='fix');
 const [rejecting,setRejecting]=useState(false),[reason,setReason]=useState(()=>[...risks,...fixes].map(c=>c.note).join('. '));
 const owner=r.role==='owner';
 const decide=(status:'approved'|'rejected')=>save('reviews/decide',{id:r.id,status,expectedVersion:r.version,confirmed:true,method:'Администратор по проверке ИИ',notes:status==='approved'?(risks.length?'Проверено вручную: '+risks.map(c=>c.note).join('; '):'Проверено администратором'):reason.trim(),validUntil:!owner&&status==='approved'?new Date(Date.now()+180*86400000).toISOString():undefined});
 const summary=r.ai_verdict==='escalate'?'ИИ сомневается: '+risks.map(c=>c.note.charAt(0).toLowerCase()+c.note.slice(1)).join('; '):r.ai_verdict==='fix'?'Не хватает: '+fixes.map(c=>c.note.charAt(0).toLowerCase()+c.note.slice(1)).join('; '):r.ai_verdict==='approve'?'ИИ: все правила пройдены':'ИИ ещё не проверял';
 return <article className={'review-card'+(r.ai_verdict==='escalate'?' is-risk':'')}>
  <div className="review-head"><span className="reviews-role">{owner?<House size={18}/>:<UserRound size={18}/>}</span><div><span className="review-kind">{owner?'Квартира':'Исполнитель'} · {when(r.created_at)}</span><h3>{owner?(r.title||'Квартира'):r.name}</h3><p>{owner?[r.name,[r.city,r.district].filter(Boolean).join(', '),r.address].filter(Boolean).join(' · '):'Отклик на уборку'}</p></div>{owner&&<div className="review-price"><strong>{money(r.price)}</strong><small><Camera size={13}/>{r.photos} фото</small></div>}</div>
  <p className={'review-verdict is-'+(r.ai_verdict||'none')}><Sparkles size={15}/>{summary}</p>
  {checks.length>0&&<ul className="review-checks">{checks.map(c=>{const Icon=stateIcon[c.state as keyof typeof stateIcon]||CheckCircle2;return <li key={c.key} className={'is-'+c.state}><Icon size={15}/><span>{c.note}</span></li>;})}</ul>}
  {!quiet&&(rejecting?<div className="review-reject"><label>Причина для участника<Textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={3}/></label><div className="review-actions"><Button variant="outline" disabled={busy} onClick={()=>setRejecting(false)}>Отмена</Button><Button variant="destructive" disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>Отклонить</Button></div></div>
   :<div className="review-actions"><Button variant="outline" disabled={busy} onClick={()=>setRejecting(true)}>Отклонить</Button><Button disabled={busy} onClick={()=>decide('approved')}>Одобрить</Button></div>)}
 </article>;
}
