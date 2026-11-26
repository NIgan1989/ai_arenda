import {t} from '../../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet,Switch} from 'react-native';
import {request} from '../api';
import {Group,Btn,a} from '../AccountRows';
import {SwipeConfirm} from '../SwipeConfirm';
import {BypassWatch} from '../BypassWatch';
import {AdminClasses} from '../AdminClasses';
import type {MenuHead} from '../AccountControl';
import {s,C,type} from '../styles';
import {T} from '../tokens';
import {useAdmin,Said,Loading,Line,Big,State,Note,Title,Link,Bottom,FormSheet,money,day,when,type Row} from './kit';
import {Reviews,Review,Issues,Issue,Reports,Report,waitingReviews,waitingIssues} from './AdminWork';
import {Users,User,Properties,Property} from './AdminPeople';
import {Revenue,Accounting,Finance,FinanceSettings,Costs} from './AdminMoney';

// «Управление сервисом» in the app (board mobbin/admin, 2026-11-26): the whole management of the site, page by page,
// in the sheet of the menu. The code from Telegram opens it (lib/admin-factor.ts); the home is one line of the state,
// what waits for the administrator in one list, and four sections. Every page puts its name and «‹» into the sheet's head.
export type Page={id:string;title:string;param?:Row};
export type Go=(page:Page)=>void;
const HOME:Page={id:'home',title:'Управление сервисом'};

export function AdminHub({verified,onVerified,onHead,onExit}:{verified:boolean;onVerified:()=>void;onHead?:(head:MenuHead)=>void;onExit:()=>void}){
 const [stack,setStack]=useState<Page[]>([HOME]);
 const top=stack[stack.length-1];
 const back=()=>{if(stack.length>1)setStack(v=>v.slice(0,-1));else onExit();};
 const go:Go=page=>setStack(v=>[...v,page]);
 useEffect(()=>{onHead?.({title:t(verified?top.title:'Управление сервисом'),label:stack.length>1?t('Назад'):t('Назад в меню'),back});},[top,verified]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!verified)return <AdminCode onVerified={onVerified}/>;
 const p=top.param||{},props={go,back};
 switch(top.id){
  case 'work':return <WorkGroup {...props}/>;
  case 'people':return <PeopleGroup {...props}/>;
  case 'money':return <MoneyGroup {...props}/>;
  case 'settings':return <SettingsGroup {...props}/>;
  case 'reviews':return <Reviews {...props}/>;
  case 'review':return <Review review={p} {...props}/>;
  case 'issues':return <Issues {...props}/>;
  case 'issue':return <Issue ticket={p} {...props}/>;
  case 'reports':return <Reports {...props} start={p.tab}/>;
  case 'report':return <Report report={p} {...props}/>;
  case 'users':return <Users {...props}/>;
  case 'user':return <User user={p} {...props}/>;
  case 'properties':return <Properties {...props}/>;
  case 'property':return <Property place={p} {...props}/>;
  case 'revenue':return <Revenue {...props}/>;
  case 'accounting':return <Accounting {...props}/>;
  case 'finance':return <Finance {...props}/>;
  case 'finance-settings':return <FinanceSettings {...props}/>;
  case 'costs':return <Costs {...props}/>;
  case 'policy':return <Policy/>;
  case 'health':return <Health/>;
  case 'admins':return <Admins/>;
  default:return <Home {...props}/>;
 }
}

// The code from Telegram in its own sheet: six cells, one button; the session is confirmed for 8 hours.
function AdminCode({onVerified}:{onVerified:()=>void}){
 const [sent,setSent]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 async function send(){if(busy)return;setBusy(true);setError('');try{const d=await request('/api/admin-factor',{action:'send'});setSent(true);setInfo(d?.testCode?t('{message} Код: {testCode}',{message:d.message,testCode:d.testCode}):d?.message||t('Код отправлен.'));}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy(false);}}
 async function verify(){if(busy)return;setBusy(true);setError('');try{await request('/api/admin-factor',{action:'verify',code});onVerified();}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy(false);}}
 return <View>
  <Title title={t('Код из Telegram')} note={t('Вход действует 8 часов на этом телефоне.')}/>
  {sent?<>
   <Pressable accessible={false} style={h.cells}>{[0,1,2,3,4,5].map(i=><View key={i} style={[h.cell,i===code.length&&h.cellOn]}><Text style={h.cellText}>{code[i]||''}</Text></View>)}
    <TextInput accessibilityLabel={t('Код из Telegram')} value={code} onChangeText={v=>setCode(v.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" textContentType="oneTimeCode" autoFocus maxLength={6} style={h.hidden}/></Pressable>
   <Btn title={busy?t('Проверяем…'):t('Войти')} disabled={busy||code.length!==6} onPress={()=>void verify()}/>
   <Link title={t('Прислать код ещё раз')} disabled={busy} onPress={()=>void send()}/>
  </>:<Btn title={busy?t('Отправляем…'):t('Прислать код в Telegram')} disabled={busy} onPress={()=>void send()}/>}
  {!!info&&<Text style={[s.meta,{marginTop:12}]}>{info}</Text>}
  <Said error={error}/>
 </View>;
}

function Home({go}:{go:Go}){
 const o=useAdmin('overview'),r=useAdmin('reviews'),g=useAdmin('governance'),m=useAdmin('reports');
 const [all,setAll]=useState(false);
 if(!o.data)return <Loading error={o.error}/>;
 const c=o.data.counts||{},run=o.data.runtime||{},money_=o.data.money;
 const reviews:Row[]=r.data?waitingReviews(r.data):[],issues:Row[]=g.data?waitingIssues(g.data):[],reports:Row[]=m.data?.queue||[];
 const now=Date.now()/1000;
 const items:{key:string;at:number;line:React.ReactNode}[]=[
  ...issues.map(x=>({key:'i'+x.issue_id,at:0,line:<Line key={'i'+x.issue_id} icon="messages" dot={x.priority==='urgent'||x.deadline<=now?'red':undefined} title={x.description?String(x.description).slice(0,60):x.property_title} note={(t({guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'}[x.opened_role as string]||'Участник'))+' · '+(x.deadline<=now?t('срок прошёл'):t('ответить до {v}',{v:when(x.deadline)}))} value={x.priority==='urgent'?t('Срочно'):t('Обращение')} onPress={()=>go({id:'issue',title:'Обращение',param:{...x,currentUserId:g.data?.currentUserId}})}/>})),
  ...reviews.map(x=>({key:'r'+x.id,at:1,line:<Line key={'r'+x.id} icon={x.role==='owner'?'building':'user'} title={x.role==='owner'?(x.title||t('Жильё')):x.name} note={reviewSummary(x)} value={t('Проверка')} onPress={()=>go({id:'review',title:'Проверка',param:x})}/>})),
  ...reports.map(x=>({key:'p'+x.id,at:2,line:<Line key={'p'+x.id} icon="flag" title={x.target_kind==='ai'?t('Ответ ИИ-администратора'):t('Сообщение в чате')} note={t('Причина: {v}',{v:x.reason})} value={t('Жалоба')} onPress={()=>go({id:'report',title:'Жалоба',param:x})}/>})),
 ];
 const shown=all?items:items.slice(0,5);
 return <View>
  <State ok={!!run.ok} title={run.ok?t('Сервис работает'):t('Нужно проверить состояние')} note={t('проверено в {v}',{v:when(run.serverTime||now).split(', ').pop()||''})}/>
  <Group title={items.length?t('Ждут вас · {n}',{n:items.length}):t('Ждут вас')}>
   {items.length?shown.map(i=>i.line):<Line title={t('Всё спокойно')} note={t('Спорных заявок, срочных обращений и новых жалоб нет.')}/>}
  </Group>
  {items.length>5&&<Link title={all?t('Свернуть'):t('Показать все {n}',{n:items.length})} onPress={()=>setAll(v=>!v)}/>}
  <Group title={t('Разделы')}>
   <Line icon="shield" title={t('Работа')} note={t('Проверки, обращения, жалобы')} value={[c.reviews||0,c.issues||0,c.reports||0].join(' · ')} onPress={()=>go({id:'work',title:'Работа'})}/>
   <Line icon="users" title={t('Участники')} note={t('Люди, жильё, классы, обход')} value={String(c.users||0)} onPress={()=>go({id:'people',title:'Участники'})}/>
   <Line icon="wallet" title={t('Деньги')} note={t('Доход, бухгалтерия, финансист')} value={money_?money(money_.net):undefined} onPress={()=>go({id:'money',title:'Деньги'})}/>
   <Line icon="sliders" title={t('Настройки')} note={t('Правила допуска, состояние, администраторы')} onPress={()=>go({id:'settings',title:'Настройки'})}/>
  </Group>
 </View>;
}
export const reviewSummary=(x:Row)=>{const checks:Row[]=x.ai_checks||[],bad=checks.filter(c=>c.state==='risk'),fix=checks.filter(c=>c.state==='fix');
 const low=(c:Row)=>String(c.note||'').replace(/^./,ch=>ch.toLowerCase());
 return x.ai_verdict==='escalate'?t('ИИ сомневается: {v}',{v:bad.map(low).join('; ')}):x.ai_verdict==='fix'?t('Не хватает: {v}',{v:fix.map(low).join('; ')}):x.ai_verdict==='approve'?t('ИИ: все правила пройдены'):t('ИИ ещё не проверял');};

function WorkGroup({go}:{go:Go}){
 const o=useAdmin('overview');const c=o.data?.counts||{};
 return <View><Group>
  <Line icon="shield" title={t('Проверки')} note={t('Жильё и исполнители. ИИ одобряет сам, вам спорное')} value={String(c.reviews??'')} onPress={()=>go({id:'reviews',title:'Проверки'})}/>
  <Line icon="messages" title={t('Обращения')} note={t('ИИ ведёт сам, вам срочное и просроченное')} value={String(c.issues??'')} onPress={()=>go({id:'issues',title:'Обращения'})}/>
  <Line icon="flag" title={t('Жалобы')} note={t('Явное ИИ скрывает сам, остальное решаете вы')} value={String(c.reports??'')} onPress={()=>go({id:'reports',title:'Жалобы'})}/>
 </Group><Said error={o.error}/></View>;
}
function PeopleGroup({go}:{go:Go}){
 const o=useAdmin('overview');const c=o.data?.counts||{};
 return <View><Group>
  <Line icon="users" title={t('Люди')} note={t('Гости, владельцы, исполнители')} value={String(c.users??'')} onPress={()=>go({id:'users',title:'Люди'})}/>
  <Line icon="building" title={t('Объекты')} note={c.unmapped?t('Без точки на карте: {n}',{n:c.unmapped}):t('Объявления и их проверка')} value={String(c.properties??'')} onPress={()=>go({id:'properties',title:'Объекты'})}/>
 </Group>
 <Group space><AdminClasses/></Group>
 <Group space><BypassWatch/></Group></View>;
}
function MoneyGroup({go}:{go:Go}){
 const o=useAdmin('overview');const m=o.data?.money;
 return <View>
  {m?<Big label={t('Чистая прибыль · {v}',{v:monthLabel(m.month)})} value={money(m.net)} red={m.net<0} note={t('Комиссия по прогнозу {a} · в банке {b}',{a:money(m.forecastRevenue),b:money(m.cash)})}/>:<Loading error={o.error}/>}
  <Group>
   <Line icon="wallet" title={t('Доход и балансы')} note={t('Комиссия, бесплатный старт, списания')} value={m?money(m.forecastRevenue):undefined} onPress={()=>go({id:'revenue',title:'Доход и балансы'})}/>
   <Line icon="file" title={t('Бухгалтерия')} note={m?.next?t('Ближайший срок {v}',{v:day(m.next.due||0)}):t('Налоги, выгрузка для 1С, сверка Kaspi Pay')} value={m?money(m.taxesDue):undefined} dot={m?.overdue?'red':undefined} onPress={()=>go({id:'accounting',title:'Бухгалтерия'})}/>
   <Line icon="chart" title={t('Финансист')} note={t('ОПИУ, ДДС, баланс')} value={m?money(m.net):undefined} onPress={()=>go({id:'finance',title:'Финансист'})}/>
  </Group>
 </View>;
}
export const monthLabel=(m:string)=>{const [y,mm]=String(m||'').split('-').map(Number);return y&&mm?new Date(Date.UTC(y,mm-1,15)).toLocaleDateString('ru-RU',{month:'long',timeZone:'UTC'}):'';};
function SettingsGroup({go}:{go:Go}){
 return <View><Group>
  <Line icon="sliders" title={t('Правила допуска')} note={t('Что проверять до показа жилья и назначения')} onPress={()=>go({id:'policy',title:'Правила допуска'})}/>
  <Line icon="zap" title={t('Состояние сервиса')} note={t('Фоновые задачи, копии, подключения')} onPress={()=>go({id:'health',title:'Состояние сервиса'})}/>
  <Line icon="key" title={t('Администраторы')} note={t('Кто ещё управляет сервисом')} onPress={()=>go({id:'admins',title:'Администраторы'})}/>
 </Group></View>;
}

// Правила допуска: who checks (the AI or me) and the three rules, one switch each, a line of explanation under it.
function Policy(){
 const g=useAdmin('governance'),r=useAdmin('reviews');
 if(!g.data)return <Loading error={g.error}/>;
 const p=g.data.policy||{},locked=!!g.data.testMode,ai=!!(r.data?.policy?.ai_review??p.ai_review);
 const current={requireOwnerReview:!!p.require_owner_review,requireCleanerReview:!!p.require_cleaner_review,requirePhone:!!p.require_phone};
 const toggle=(field:keyof typeof current)=>g.save('governance/policy',{...current,[field]:!current[field],expectedVersion:p.version,confirmed:true});
 const rules:[keyof typeof current,string,string][]=[['requireOwnerReview',t('Проверять жильё до показа'),t('Новое жильё на карте только после проверки')],['requireCleanerReview',t('Проверять исполнителя'),t('Назначить на уборку можно только проверенного')],['requirePhone',t('Подтверждённый номер'),t('Нужен работающий SMS-канал, иначе новые операции остановятся')]];
 return <View>
  <Group><Line title={t('Кто проверяет заявки')} value={ai?t('ИИ'):t('Я сам')} note={ai?t('ИИ одобряет по правилам, спорное отдаёт вам'):t('ИИ показывает проверки, решение за вами')}/>
   <View style={[a.row,{paddingVertical:10}]}><View style={a.seg}>{[[true,t('Проверяет ИИ')],[false,t('Я сам')]].map(([v,l])=><Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{checked:ai===v}} disabled={r.busy} onPress={()=>{if(ai!==v)void r.save('reviews/ai',{enabled:v});}} style={[a.segItem,ai===v&&a.segOn]}><Text style={[a.segText,ai===v&&a.segTextOn]}>{l as string}</Text></Pressable>)}</View></View></Group>
  <Group space>{rules.map(([f,title,note])=><SwitchLine key={f} title={title} note={note} on={current[f]} disabled={locked||g.busy||!p.version} onChange={()=>void toggle(f)}/>)}</Group>
  {locked&&<Note text={t('Учебный стенд: правила включаются только на рабочем сервисе.')}/>}
  <Note text={t('Изменение действует на новые публикации, брони и назначения.')}/>
  <Said error={g.error||r.error} note={g.note||r.note}/>
 </View>;
}
function SwitchLine({title,note,on,disabled,onChange}:{title:string;note:string;on:boolean;disabled:boolean;onChange:()=>void}){
 return <View style={a.row}><View style={a.wide}><Text style={a.title}>{title}</Text><Text style={a.note}>{note}</Text></View><Switch accessibilityLabel={title} value={on} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)}/></View>;
}

// Состояние сервиса: one line on top, then each part with its state on the right; a dead background task is retried here.
const jobKinds:Row={owner:'Контроль объектов','finance-history':'История расчётов',calendar:'Календари',discovery:'Поиск задач',delivery:'Доставка уведомлений',backup:'Резервная копия','local-backup':'Локальная резервная копия'};
function Health(){
 const h=useAdmin('health');
 if(!h.data)return <Loading error={h.error}/>;
 const r=h.data.runtime||{},c=r.checks||{},i=h.data.integrations||{},jobs:Row[]=h.data.queue?.jobs||[];
 const backup=(h.data.queue?.backups||[]).reduce((m:number,b:Row)=>Math.max(m,b.last_completed||0),0);
 const dead=jobs.filter(j=>j.status==='dead');
 const yes=(v:boolean,on:string,off:string):[string,'ink'|'grey'|'red']=>v?[on,'ink']:[off,'grey'];
 const parts:[string,[string,'ink'|'grey'|'red']][]=[
  [t('База данных'),c.database?.ready?[t('в порядке'),'ink']:[t('недоступна'),'red']],
  [t('Фоновый контроль'),c.scheduler?.fresh?[t('работает'),'ink']:[t('нет свежей проверки'),'red']],
  [t('Резервная копия'),backup?[when(backup),'ink']:[t('пока нет'),'grey']],
  [t('ИИ (OpenAI)'),yes(!!c.configuration?.modelConfigured,t('настроен'),t('не настроен'))],
  [t('Telegram'),yes(!!i.telegram,t('подключён'),t('не подключён'))],
  [t('SMS'),yes(!!i.sms,t('подключено'),t('нет провайдера'))],
  [t('Push-уведомления'),yes(!!i.push,t('подключены'),t('ждут ключей'))],
  [t('Платёжный шлюз'),yes(!!i.payments,t('подключён'),t('не подключён'))],
 ];
 return <View>
  <State ok={!!r.ok} title={r.ok?t('Всё работает'):t('Нужно проверить')} note={t('проверено в {v}',{v:when(r.serverTime||Date.now()/1000).split(', ').pop()||''})}/>
  <Group>{parts.map(([title,[v,dot]])=><Line key={title} title={title} value={v} dot={dot}/>)}</Group>
  <Group title={t('Фоновые задачи')}>{jobs.length?jobs.map(j=><Line key={j.id} dot={j.status==='dead'?'red':'ink'} title={t(jobKinds[j.kind]||'Фоновая задача')} note={t('Успешный запуск: {v}',{v:j.last_completed?when(j.last_completed):t('ещё не было')})} value={j.status==='dead'?t('ошибка'):j.status==='running'?t('идёт'):t('в порядке')}/>):<Line title={t('Задач пока нет')}/>}</Group>
  {dead.map(j=><Link key={j.id} title={t('Повторить: {v}',{v:t(jobKinds[j.kind]||'Фоновая задача')})} disabled={h.busy} onPress={()=>void h.save('background/retry',{id:j.id})}/>)}
  <Note text={t('Состояние этого сервера. Облачное размещение и восстановление из внешних копий проверяются отдельно.')}/>
  <Said error={h.error} note={h.note}/>
 </View>;
}

// Администраторы: the main administrator (the secret of the server) adds another account by its phone and removes it.
// An added one manages everything with its own code from Telegram but does not see the buttons of this page.
function Admins(){
 const d=useAdmin('admins');
 const [adding,setAdding]=useState(false),[removing,setRemoving]=useState<Row|null>(null),[phone,setPhone]=useState('');
 if(!d.data)return <Loading error={d.error}/>;
 const main:Row[]=d.data.main||[],added:Row[]=d.data.added||[],can=!!d.data.canManage;
 if(removing)return <View>
  <Title title={removing.name} note={removing.phone}/>
  <Note text={t('Его вход в управление закроется сразу. Аккаунт и роли останутся.')}/>
  <Bottom><SwipeConfirm label={t('Проведите, чтобы убрать администратора')} disabled={d.busy} onConfirm={async()=>{if(await d.save('admins/remove',{userId:removing.userId}))setRemoving(null);}}/><Link title={t('Отмена')} onPress={()=>setRemoving(null)}/></Bottom>
  <Said error={d.error}/>
 </View>;
 return <View>
  <Group title={t('Главный')}>{main.map(m=><Line key={m.userId} icon="key" title={m.name+(m.you?' · '+t('вы'):'')} note={t('Задан на сервере, из приложения не убрать')}/>)}</Group>
  <Group title={t('Добавленные · {n}',{n:added.length})}>{added.length?added.map(m=><Line key={m.userId} icon="user" title={m.name+(m.you?' · '+t('вы'):'')} note={[m.phone,t('с {v}',{v:day(m.addedAt)})].filter(Boolean).join(' · ')} onPress={can?()=>setRemoving(m):undefined}/>):<Line title={t('Пока никого')} note={t('Добавьте помощника, если управлять будете не один')}/>}</Group>
  {can?<Btn title={t('Добавить администратора')} onPress={()=>{setPhone('');setAdding(true);}}/>:<Note text={t('Добавлять и убирать администраторов может только главный.')}/>}
  <Note text={t('Новый администратор видит и решает всё, кроме этого списка. Вход — тем же кодом из Telegram на его телефоне.')}/>
  <FormSheet visible={adding} title={t('Новый администратор')} note={t('Номер аккаунта, с которым человек входит в приложение.')} fields={[{key:'phone',label:t('Номер телефона'),placeholder:'+7 777 123 45 67'}]} initial={{phone}} button={t('Дальше')} onClose={()=>setAdding(false)} onSubmit={v=>{setPhone(String(v.phone||''));setAdding(false);}}/>
  {!!phone&&!adding&&<Bottom><Text style={[a.title,{textAlign:'center'}]}>{phone}</Text><SwipeConfirm label={t('Проведите: дать доступ к управлению')} disabled={d.busy} onConfirm={async()=>{if(await d.save('admins/add',{phone,confirmed:true}))setPhone('');}}/><Link title={t('Отмена')} onPress={()=>setPhone('')}/></Bottom>}
  <Said error={d.error} note={d.note}/>
 </View>;
}

const h=StyleSheet.create({
 cells:{flexDirection:'row',gap:8,marginTop:8,marginBottom:4,position:'relative'},
 cell:{flex:1,height:56,borderRadius:T.radius.md,borderWidth:1.5,borderColor:C.line,alignItems:'center',justifyContent:'center',backgroundColor:C.surface},cellOn:{borderColor:C.ink},
 cellText:{...type.title,color:C.ink,fontWeight:'600'},
 hidden:{position:'absolute',left:0,right:0,top:0,bottom:0,opacity:0.02,color:'transparent',fontSize:1},
});
