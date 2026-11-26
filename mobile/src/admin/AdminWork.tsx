import {t} from '../../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Image,Switch,StyleSheet} from 'react-native';
import {request} from '../api';
import {Group,a} from '../AccountRows';
import {SwipeConfirm} from '../SwipeConfirm';
import {C} from '../styles';
import {T} from '../tokens';
import {useAdmin,Said,Loading,Tabs,Line,Quote,Check,Note,Title,Link,Bottom,TextSheet,money,when,span,roleName,upper,uid,type Row} from './kit';
import type {Go} from './AdminHub';
import {reviewSummary} from './AdminHub';

// Работа: «Проверки», «Обращения», «Жалобы» (board mobbin/admin). A list is tabs with a count and one line per thing;
// the thing opens on its own page with what the AI found, and the main step is swiped at the bottom.
type Nav={go:Go;back:()=>void};

/** What waits for the administrator among the requests: all of them when «Я сам», only the disputed ones when the AI checks. */
export const waitingReviews=(d:Row)=>{const auto=!!d.policy?.ai_review;return (d.pendingReviews||[] as Row[]).filter((r:Row)=>!auto||r.ai_verdict!=='fix');};
export const waitingIssues=(d:Row)=>{const now=Date.now()/1000,me=d.currentUserId;return (d.tickets||[] as Row[]).filter((x:Row)=>x.status!=='resolved'&&(x.priority==='urgent'||x.deadline<=now||x.assigned_to===me));};

export function Reviews({go}:Nav){
 const d=useAdmin('reviews'),[tab,setTab]=useState<'yours'|'waiting'|'ids'|'done'>('yours'),ids=useAdmin(tab==='ids'?'identity':null);
 if(!d.data)return <Loading error={d.error}/>;
 const auto=!!d.data.policy?.ai_review,pending:Row[]=d.data.pendingReviews||[],decided:Row[]=d.data.aiDecided||[];
 const yours=waitingReviews(d.data),waiting=auto?pending.filter(r=>r.ai_verdict==='fix'):[];
 const line=(r:Row)=><Line key={r.id+':'+r.version} icon={r.role==='owner'?'building':'user'} title={r.role==='owner'?(r.title||t('Жильё')):r.name} note={reviewSummary(r)} value={r.role==='owner'&&r.price?money(r.price):t('исполнитель')} onPress={()=>go({id:'review',title:'Проверка',param:r})}/>;
 return <View>
  <Tabs value={tab} onChange={setTab} items={[['yours',t('Ждут вас'),yours.length],['waiting',t('Ждут участника'),waiting.length],['ids',t('Удостоверения')],['done',t('Решено ИИ'),decided.length]]}/>
  {tab==='yours'&&<Group>{yours.length?yours.map(line):<Line title={auto?t('Всё спокойно: спорных заявок нет'):t('Новых заявок пока нет')}/>}</Group>}
  {tab==='waiting'&&<><Group>{waiting.length?waiting.map(line):<Line title={t('Никто не дорабатывает заявку')}/>}</Group><Note text={t('ИИ уже написал, что добавить, и одобрит сам, когда всё будет на месте.')}/></>}
  {tab==='ids'&&(!ids.data?<Loading error={ids.error}/>:<Group>{(ids.data.queue||[]).length?(ids.data.queue as Row[]).map(q=><Line key={q.user_id} icon="user" title={q.name||t('Участник')} note={t('Фото: {n}',{n:q.photos})} onPress={()=>go({id:'review',title:'Удостоверение',param:{identity:true,user_id:q.user_id,name:q.name,roles:q.roles}})}/>):<Line title={t('Новых удостоверений нет')}/>}</Group>)}
  {tab==='done'&&<Group>{decided.length?decided.map(r=><Line key={r.id} icon={r.role==='owner'?'building':'user'} title={r.role==='owner'?(r.title||t('Жильё')):r.name} note={(r.status==='approved'?t('Одобрено'):t('Отклонено'))+' · '+when(r.reviewed_at)}/>):<Line title={t('За неделю ИИ ничего не решал')}/>}</Group>}
  <Group space><Line title={t('Кто проверяет')} value={auto?t('ИИ'):t('Я сам')} note={auto?t('ИИ одобряет сам, когда все правила пройдены. Вам — только спорное.'):t('ИИ показывает свои проверки, решение за вами.')} onPress={()=>go({id:'policy',title:'Правила допуска'})}/></Group>
  <Said error={d.error}/>
 </View>;
}

// The documents of a request, seen only by the administrator: loaded on a tap, the photos are deleted after the decision.
export function Docs({path,photo,title}:{path:string;photo:string;title:string}){
 const [open,setOpen]=useState(false),[v,setV]=useState<Row|null>(null),[error,setError]=useState('');
 async function load(){setOpen(o=>!o);if(v)return;try{const r=await request('/api/admin/'+path);const docs=await Promise.all((r.docs||[]).filter((d:Row)=>!d.checked_at).map(async(d:Row)=>({...d,uri:(await request('/api/admin/'+photo+encodeURIComponent(d.id)).catch(()=>null))?.data||''})));setV({...r,docs});}catch(e){setError(e instanceof Error?e.message:t('Не получилось.'));}}
 const n=v?.docs?.length;
 return <><Line icon="file" title={title} value={v?(v.checked?t('проверено'):n?t('фото: {n}',{n}):t('не приложено')):undefined} onPress={()=>void load()}/>
  {open&&<View style={w.docs}>{error?<Text style={a.note}>{error}</Text>:!v?<Text style={a.note}>{t('Загружаю…')}</Text>:<>
   {!!v.names&&<Text style={a.note}>{t('Профиль: {a} · Получатель Kaspi: {b}',{a:v.names.profile||'—',b:v.names.recipient||t('не указан')})}</Text>}
   <View style={w.photos}>{(v.docs as Row[]).map(d=>d.uri?<Image key={d.id} source={{uri:d.uri}} style={w.photo} accessibilityLabel={title}/>:null)}</View>
   {!n&&<Text style={a.note}>{v.checked?t('Уже проверено, фото удалено.'):t('Не приложено. Гости увидят «не проверено».')}</Text>}
  </>}</View>}
 </>;
}

export function Review({review:r,back}:{review:Row}&Nav){
 const d=useAdmin(null),[rejecting,setRejecting]=useState(false);
 const owner=r.role==='owner',checks:Row[]=r.ai_checks||[],risks=checks.filter(c=>c.state==='risk'),fixes=checks.filter(c=>c.state==='fix');
 if(r.identity){
  const decide=async(action:'confirm'|'reject',reason?:string)=>{if(await d.save('identity/decide',{userId:r.user_id,action,namesMatch:action==='confirm'||undefined,reason},false))back();};
  return <View><Title title={r.name||t('Участник')} note={t('Удостоверение личности')}/>
   <Group><Docs path={'identity/docs?userId='+encodeURIComponent(r.user_id)} photo="identity/photo?id=" title={t('Удостоверение')}/></Group>
   <Bottom><SwipeConfirm label={t('Проведите: ФИО и фото совпадают')} disabled={d.busy} onConfirm={()=>void decide('confirm')}/><Link title={t('Не принять с причиной')} danger onPress={()=>setRejecting(true)}/></Bottom>
   <TextSheet visible={rejecting} title={t('Почему не принято')} note={t('Участник увидит причину.')} button={t('Не принять')} busy={d.busy} onClose={()=>setRejecting(false)} onSubmit={v=>{setRejecting(false);void decide('reject',v);}}/>
   <Said error={d.error}/></View>;
 }
 const decide=async(status:'approved'|'rejected',reason='')=>{
  const ok=await d.save('reviews/decide',{id:r.id,status,expectedVersion:r.version,confirmed:true,method:'Администратор по проверке ИИ',notes:status==='approved'?(risks.length?'Проверено вручную: '+risks.map(c=>c.note).join('; '):'Проверено администратором'):reason,namesMatch:status==='approved'?true:undefined,validUntil:!owner&&status==='approved'?new Date(Date.now()+180*86400000).toISOString():undefined},false);
  if(ok)back();
 };
 return <View>
  <Title title={owner?(r.title||t('Жильё')):r.name} note={owner?[r.name,[r.city,r.district].filter(Boolean).join(', '),r.price?money(r.price):''].filter(Boolean).join(' · '):t('Исполнитель · отклик на уборку')}/>
  {checks.length?checks.map(c=><Check key={c.key} ok={c.state!=='risk'&&c.state!=='fix'} text={c.note}/>):<Check ok text={reviewSummary(r)}/>}
  <Group>
   {owner&&<Line title={t('Адрес')} note={r.address||t('не указан')}/>}
   {owner&&<Line title={t('Фото')} value={String(r.photos||0)}/>}
   <Line title={t('Подана')} value={when(r.created_at)}/>
   {owner&&!!r.property_id&&<Docs path={'rights?propertyId='+encodeURIComponent(r.property_id)} photo="rights/photo?id=" title={t('Документ о праве сдавать')}/>}
   <Docs path={'identity/docs?userId='+encodeURIComponent(r.user_id)} photo="identity/photo?id=" title={t('Удостоверение личности')}/>
  </Group>
  <Note text={t('Проводя, вы подтверждаете: сведения, фото и описание проверены, ФИО в документах совпадает с профилем и получателем Kaspi.')}/>
  <Bottom><SwipeConfirm label={t('Проведите, чтобы одобрить')} disabled={d.busy} onConfirm={()=>void decide('approved')}/><Link title={t('Отклонить с причиной')} danger onPress={()=>setRejecting(true)}/></Bottom>
  <TextSheet visible={rejecting} title={t('Причина для участника')} initial={[...risks,...fixes].map(c=>c.note).join('. ')} button={t('Отклонить')} busy={d.busy} onClose={()=>setRejecting(false)} onSubmit={v=>{setRejecting(false);void decide('rejected',v);}}/>
  <Said error={d.error}/>
 </View>;
}

export function Issues({go}:Nav){
 const d=useAdmin('governance'),[tab,setTab]=useState<'yours'|'ai'|'done'>('yours');
 if(!d.data)return <Loading error={d.error}/>;
 const now=Date.now()/1000,all:Row[]=d.data.tickets||[],open=all.filter(x=>x.status!=='resolved'),yours=waitingIssues(d.data),ai=open.filter(x=>!yours.includes(x)),done=all.filter(x=>x.status==='resolved');
 const line=(x:Row)=>{const late=x.deadline<=now;return <Line key={x.issue_id+':'+x.version} icon="messages" dot={x.priority==='urgent'||late?'red':undefined} title={String(x.description||x.property_title).slice(0,70)} note={[t(roleName[x.opened_role]||'Участник'),x.property_title,x.status==='resolved'?t('решено {v}',{v:when(x.resolved_at||x.updated_at)}):late?t('срок прошёл {v} назад',{v:span(now-x.deadline)}):t('осталось {v}',{v:span(x.deadline-now)})].filter(Boolean).join(' · ')} value={x.priority==='urgent'&&x.status!=='resolved'?t('Срочно'):undefined} onPress={()=>go({id:'issue',title:'Обращение',param:x})}/>;};
 const list=tab==='yours'?yours:tab==='ai'?ai:done;
 return <View>
  <Tabs value={tab} onChange={setTab} items={[['yours',t('Ждут вас'),yours.length],['ai',t('Ведёт ИИ'),ai.length],['done',t('Решены'),done.length]]}/>
  <Group>{list.length?list.map(line):<Line title={tab==='yours'?t('Срочных и просроченных обращений нет'):tab==='ai'?t('ИИ сейчас ничего не ведёт'):t('Решённых пока нет')}/>}</Group>
  <Note text={t('ИИ ставит срочность и срок ответа, напоминает сторонам. Сюда попадает срочное, просроченное и то, что вы взяли себе.')}/>
  <Said error={d.error}/>
 </View>;
}
const actions:Row={triage:'Срочность и срок',claim:'Взято в работу',release:'Возвращено в очередь',note:'Комментарий',resolve:'Решение',reopen:'Открыто повторно',takeover:'Смена ответственного',source_resolved:'Решение участника'};
export function Issue({ticket:x,back}:{ticket:Row}&Nav){
 const d=useAdmin(null),key=useRef(uid()),[mode,setMode]=useState<''|'resolve'|'note'|'internal'>(''),[history,setHistory]=useState(false);
 const [version,setVersion]=useState<number>(x.version),[mine,setMine]=useState(false);
 const now=Date.now()/1000,late=x.deadline<=now,ai=(x.history||[]).find((h:Row)=>h.actor_id==='ai-administrator'),resolved=x.status==='resolved';
 useEffect(()=>{setMine(!!x.assigned_to&&x.assigned_to===x.currentUserId);},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const send=(action:string,v:number,extra:Row={})=>d.save('governance/ticket',{issueId:x.issue_id,expectedVersion:v,action,requestKey:key.current+':'+action,...extra},false);
 async function claim(){const r=await send('claim',version);if(r){setVersion(r.version??version+1);setMine(true);}return r;}
 async function submit(text:string){
  let v=version;
  if(mode==='resolve'&&!mine&&!x.assigned_to){const c=await claim();if(!c)return;v=c.version??v+1;}
  const r=await send(mode==='internal'?'note':mode,v,{note:text,confirmed:true,visibility:mode==='internal'?'operators':'participants'});
  if(r){key.current=uid();setMode('');if(mode==='resolve')back();else setVersion(r.version??v+1);}
 }
 return <View>
  <Title title={String(x.description||'').slice(0,80)||x.property_title} note={[t(roleName[x.opened_role]||'Участник'),x.property_title,when(x.created_at)].filter(Boolean).join(' · ')}/>
  {!!x.description&&<Quote text={x.description}/>}
  <Group>
   {!!ai&&<Line title={t('ИИ')} note={upper(String(ai.body).replace(/^ИИ-администратор:\s*/,''))}/>}
   <Line title={t('Ведёт')} value={x.assigned_to||mine?(mine?t('вы'):t('другой оператор')):t('ИИ-администратор')}/>
   {!resolved&&<Line title={t('Срок ответа')} value={late?t('прошёл {v} назад',{v:span(now-x.deadline)}):when(x.deadline)} dot={late?'red':undefined}/>}
   {resolved&&<Line title={t('Решение')} note={x.resolution||'—'}/>}
   {(x.history||[]).length>0&&<Line title={t('История')} value={String(x.history.length)} onPress={()=>setHistory(v=>!v)}/>}
  </Group>
  {history&&<Group>{(x.history as Row[]).map(h=><Line key={h.id} title={t(actions[h.action]||'Событие')+(h.visibility==='operators'?' · '+t('только операторам'):'')} note={when(h.created_at)+' · '+String(h.body||'')}/>)}</Group>}
  <Bottom>
   {!resolved&&<SwipeConfirm label={t('Проведите: ответить и закрыть')} disabled={d.busy||(!!x.assigned_to&&!mine)} onConfirm={()=>setMode('resolve')}/>}
   <Link title={t('Написать сторонам')} onPress={()=>setMode('note')}/>
   <Link title={t('Заметка только для операторов')} onPress={()=>setMode('internal')}/>
   {!resolved&&!x.assigned_to&&!mine&&<Link title={t('Взять себе')} disabled={d.busy} onPress={()=>void claim()}/>}
  </Bottom>
  <TextSheet visible={!!mode} title={mode==='resolve'?t('Решение'):mode==='internal'?t('Заметка для операторов'):t('Сообщение сторонам')} note={mode==='resolve'?t('Его увидят обе стороны, обращение закроется.'):mode==='internal'?t('Участники её не увидят.'):undefined} button={mode==='resolve'?t('Закрыть обращение'):t('Отправить')} busy={d.busy} onClose={()=>setMode('')} onSubmit={v=>void submit(v)}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}

export function Reports({go,start}:Nav&{start?:string}){
 const d=useAdmin('reports'),[tab,setTab]=useState<'queue'|'objections'|'hidden'>((start as 'queue')||'queue');
 if(!d.data)return <Loading error={d.error}/>;
 const queue:Row[]=d.data.queue||[],hidden:Row[]=d.data.hidden||[],objections:Row[]=d.data.objections||[],openObj=objections.filter(o=>o.status==='open');
 return <View>
  <Tabs value={tab} onChange={setTab} items={[['queue',t('Решить'),Number(d.data.queueTotal??queue.length)],['objections',t('Возражения'),openObj.length],['hidden',t('Скрыто ИИ'),hidden.length]]}/>
  {tab==='queue'&&<Group>{queue.length?queue.map(r=><Line key={r.id+':'+(r.version||0)} icon="flag" title={r.target_kind==='ai'?t('Ответ ИИ-администратора'):t('Сообщение в чате')} note={t(roleName[r.role]||'Участник')+' · '+when(r.created_at)+' · '+r.reason} onPress={()=>go({id:'report',title:'Жалоба',param:r})}/>):<Line title={t('Новых жалоб нет')}/>}</Group>}
  {tab==='objections'&&<Group>{objections.length?objections.map(o=><Line key={o.id} icon="user" dot={o.status==='open'&&o.late?'red':undefined} title={o.name||t('Участник')} note={o.status==='open'?(o.late?t('Срок ответа прошёл'):t('Ответить до {v}',{v:when(o.due_at)})):t('Отвечено: {v}',{v:o.answer})} onPress={o.status==='open'?()=>go({id:'report',title:'Возражение',param:{...o,objection:true}}):undefined}/>):<Line title={t('Открытых возражений нет')}/>}</Group>}
  {tab==='hidden'&&<Group>{hidden.length?hidden.map(r=><Line key={r.id} icon="eye" title={!r.hidden?t('Сообщение возвращено'):upper(String(r.resolution||t('Сообщение скрыто')).replace(/^Скрыто ИИ-администратором:\s*/,'').replace(/\.\s*Администратор может восстановить\.?$/,''))} note={t('Жалоба: {v}',{v:r.reason})} value={r.hidden?t('Вернуть'):undefined} onPress={r.hidden?async()=>{const seen=await d.save('reports/action',{action:'inspect',reportId:r.id,reason:'Проверка решения ИИ'},false);if(seen?.material)await d.save('reports/action',{action:'moderate',reportId:r.id,decision:'restore',expectedVersion:seen.material.version,reason:'Администратор вернул сообщение'});}:undefined}/>):<Line title={t('За неделю ИИ ничего не скрывал')}/>}</Group>}
  <Note text={t('Явное (телефоны, ссылки, мат, оплата мимо сервиса) ИИ скрывает сам. Оригинал сохраняется, вернуть можно здесь.')}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}

export function Report({report:r,back}:{report:Row}&Nav){
 const d=useAdmin(null),[material,setMaterial]=useState<Row|null>(null);
 // Opening the message is an audited look, as on the site: it is read when the page opens.
 useEffect(()=>{if(r.objection)return;void d.save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'},false).then(v=>{if(v?.material)setMaterial(v.material);});},[]); // eslint-disable-line react-hooks/exhaustive-deps
 if(r.objection)return <Objection o={r} back={back}/>;
 async function hide(){let version=material?.version;if(version===undefined){const seen=await d.save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'},false);if(!seen?.material)return;version=seen.material.version;}
  if(await d.save('reports/action',{action:'moderate',reportId:r.id,decision:'hide',expectedVersion:version,reason:'Нарушение подтверждено администратором'},false)&&await d.save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Сообщение скрыто администратором.'},false))back();}
 async function keep(){if(await d.save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Нарушения нет, сообщение оставлено.'},false))back();}
 return <View>
  <Title title={r.target_kind==='ai'?t('Ответ ИИ-администратора'):t('Сообщение в чате')} note={t('{who} пожаловался · {v}',{who:t(roleName[r.role]||'Участник'),v:when(r.created_at)})}/>
  <Quote text={material?.body||t('Загружаю сообщение…')}/>
  <Group>
   <Line title={t('Причина жалобы')} note={r.reason}/>
   <Line title={t('ИИ')} note={r.ai_note?upper(r.ai_note):t('ИИ ещё не проверял')}/>
  </Group>
  <Bottom><SwipeConfirm label={t('Проведите, чтобы скрыть')} disabled={d.busy} onConfirm={()=>void hide()}/><Link title={t('Нарушения нет, оставить')} disabled={d.busy} onPress={()=>void keep()}/></Bottom>
  <Said error={d.error}/>
 </View>;
}

// «Не согласен с оценкой»: the episodes that lower the rating; a wrong one is ticked and cancelled with the answer.
function Objection({o,back}:{o:Row;back:()=>void}){
 const d=useAdmin(null),[cancel,setCancel]=useState<string[]>([]),[answering,setAnswering]=useState(false);
 const episodes:Row[]=o.episodes||[],key=(e:Row)=>e.kind+':'+e.id;
 return <View>
  <Title title={o.name||t('Участник')} note={t(roleName[o.role]||'Участник')+' · '+(o.late?t('срок ответа прошёл'):t('ответить до {v}',{v:when(o.due_at)}))}/>
  <Quote text={o.body}/>
  {!!o.reliability&&<Note text={t('Оценка сейчас: {v}',{v:(o.reliability.score?String(o.reliability.score).replace('.',','):t('нет'))+' · '+((o.reliability.facts||[]).join(', ')||o.reliability.label)})}/>}
  <Group title={t('Что снижает оценку')}>{episodes.length?episodes.map(e=>{const k=key(e),on=e.voided||cancel.includes(k);return <View key={k} style={a.row}><View style={a.wide}><Text style={a.title}>{e.note}</Text><Text style={a.note}>{e.title} · {when(e.at)}{e.voided?' · '+t('уже отменено'):''}</Text></View><Switch accessibilityLabel={t('Отменить: {v}',{v:e.note})} value={on} disabled={d.busy||e.voided} onValueChange={()=>setCancel(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k])} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface}/></View>;}):<Line title={t('Отметок, которые снижают оценку, нет')}/>}</Group>
  {episodes.length>0&&<Note text={t('Включите ошибочное, оно отменится вместе с ответом.')}/>}
  <Bottom><SwipeConfirm label={cancel.length?t('Проведите: ответить и отменить {n}',{n:cancel.length}):t('Проведите, чтобы ответить')} disabled={d.busy} onConfirm={()=>setAnswering(true)}/></Bottom>
  <TextSheet visible={answering} title={t('Ответ участнику')} note={t('Что проверили и что решили.')} min={10} button={t('Ответить')} busy={d.busy} onClose={()=>setAnswering(false)} onSubmit={async v=>{setAnswering(false);if(await d.save('objections/answer',{id:o.id,answer:v,cancel},false))back();}}/>
  <Said error={d.error}/>
 </View>;
}

const w=StyleSheet.create({
 docs:{paddingHorizontal:16,paddingBottom:12,gap:8},photos:{flexDirection:'row',flexWrap:'wrap',gap:8},photo:{width:140,height:100,borderRadius:T.radius.md,backgroundColor:C.surfaceAlt},
});
