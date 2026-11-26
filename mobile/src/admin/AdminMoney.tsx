import {t} from '../../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,Switch,Share,Pressable} from 'react-native';
import {Group,a} from '../AccountRows';
import {SwipeConfirm} from '../SwipeConfirm';
import {C} from '../styles';
import {useAdmin,Said,Loading,Tabs,Line,Sum,Big,Note,Title,Empty,Link,Bottom,TextSheet,FormSheet,money,day,when,percent,monthName,today,type Row,type Field} from './kit';
import type {Go} from './AdminHub';

// Деньги: «Доход и балансы», «Бухгалтерия», «Финансист» (board mobbin/admin). One big number on top of each page,
// then one line per thing; a step with money (new terms, a tax paid, a payout sent) is checked in a sheet and swiped.
type Nav={go:Go;back:()=>void};
const num=(v:unknown)=>Number(String(v??'').replace(/\s/g,'').replace(',','.'));
const yes=(on:boolean,title:string,note:string,onChange:()=>void,disabled=false)=><View style={a.row}><View style={a.wide}><Text style={a.title}>{title}</Text><Text style={a.note}>{note}</Text></View><Switch accessibilityLabel={title} value={on} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface}/></View>;

/** A step that waits for a swipe: what will happen in one line, the swipe, «Отмена». */
function Confirm({text,label,busy,onConfirm,onCancel}:{text:string;label:string;busy:boolean;onConfirm:()=>void;onCancel:()=>void}){
 return <Bottom><Text style={[a.title,{textAlign:'center'}]}>{text}</Text><SwipeConfirm label={label} disabled={busy} onConfirm={onConfirm}/><Link title={t('Отмена')} onPress={onCancel}/></Bottom>;
}

// ── Доход и балансы ─────────────────────────────────────────────────────────────────────────────────────────────
const phases:Row={off:'Плата выключена',scheduled:'Плата начнётся',active:'Плата идёт'};
export function Revenue(_:Nav){
 const d=useAdmin('billing'),[editing,setEditing]=useState(false),[pending,setPending]=useState<null|{text:string;label:string;route:string;body:Row}>(null),[charge,setCharge]=useState<Row|null>(null);
 if(!d.data)return <Loading error={d.error}/>;
 const b=d.data,st=b.settings||{},l=b.last30||{},ch=b.charges||{},cl=b.cleaners||{},plans=b.plans?.settings||{};
 const owners:Row[]=b.owners||[],due:Row[]=cl.due||[],open:Row[]=ch.open||[];
 const ask=(text:string,label:string,route:string,body:Row)=>setPending({text,label,route,body});
 const run=async()=>{if(!pending)return;const p=pending;if(await d.save(p.route,p.body))setPending(null);};
 const fields:Field[]=[{key:'ratePercent',label:t('Комиссия с заселения, %'),numeric:true},{key:'maxFee',label:t('Максимум за заселение, ₸ (0 — без предела)'),numeric:true},{key:'minFee',label:t('Минимум за заселение, ₸'),numeric:true},{key:'cleaningRatePercent',label:t('Комиссия с уборки, %'),numeric:true},{key:'freeBookings',label:t('Бесплатных заселений'),numeric:true}];
 const initial={ratePercent:String(st.rate_bp/100).replace('.',','),maxFee:String(st.max_fee||0),minFee:String(st.min_fee||0),cleaningRatePercent:String((st.cleaning_rate_bp||0)/100).replace('.',','),freeBookings:String(st.free_bookings||0)};
 const body=(v:Row,enabled:boolean)=>({enabled,ratePercent:num(v.ratePercent),maxFee:num(v.maxFee),minFee:num(v.minFee),cleaningRatePercent:num(v.cleaningRatePercent),freeBookings:num(v.freeBookings),pairRatePercent:(st.pair_rate_bp||0)/100,pairMonthCap:st.pair_month_cap||0,startsAt:enabled?(st.enabled&&st.starts_at?st.starts_at:Math.floor(Date.now()/1000)+120):0,expectedVersion:st.version,confirmed:true});
 if(pending)return <View><Title title={t('Проверьте')}/><Confirm text={pending.text} label={pending.label} busy={d.busy} onConfirm={()=>void run()} onCancel={()=>setPending(null)}/><Said error={d.error}/></View>;
 if(charge)return <View>
  <Title title={charge.name||t('Участник')} note={t('Списание {v} · {w}',{v:money(charge.amount),w:when(charge.created_at)})}/>
  <Note text={t('Банк не ответил, списал ли он деньги. Проверьте операцию в выписке Kaspi Pay.')}/>
  <Bottom><SwipeConfirm label={t('Проведите: банк списал')} disabled={d.busy} onConfirm={async()=>{if(await d.save('billing/charges',{action:'resolve',id:charge.id,outcome:'succeeded',confirmed:true}))setCharge(null);}}/>
   <Link title={t('Банк не списал')} disabled={d.busy} onPress={async()=>{if(await d.save('billing/charges',{action:'resolve',id:charge.id,outcome:'failed',confirmed:true}))setCharge(null);}}/><Link title={t('Отмена')} onPress={()=>setCharge(null)}/></Bottom>
  <Said error={d.error}/>
 </View>;
 return <View>
  <Big label={t('Комиссия за 30 дней')} value={money(l.projected)} note={t('Оборот {a} · заселений {b} · списано {c}',{a:money(l.turnover),b:l.bookings||0,c:money(l.charged)})}/>
  <Group title={t('Условия')}>
   <Line icon="zap" title={t(phases[b.phase]||'Плата')} value={b.phase==='scheduled'?day(st.starts_at):b.phase==='active'?t('с {v}',{v:day(st.starts_at)}):undefined} dot={b.phase==='active'?'ink':'grey'}/>
   <Line icon="wallet" title={t('С заселения')} value={percent(st.rate_bp)+(st.max_fee?' · '+t('до {v}',{v:money(st.max_fee)}):'')}/>
   <Line icon="sparkles" title={t('С уборки')} value={percent(st.cleaning_rate_bp)}/>
   <Line icon="star" title={t('Бесплатный старт')} value={t('{n} дней',{n:st.free_days||14})}/>
  </Group>
  <Link title={t('Изменить условия')} onPress={()=>setEditing(true)}/>
  {st.enabled?<Link title={t('Выключить плату')} danger onPress={()=>ask(t('Плата выключится для всех владельцев'),t('Проведите, чтобы выключить'),'billing/settings',body(initial,false))}/>:<Link title={t('Включить плату')} onPress={()=>ask(t('Владельцы начнут платить {v} с заселения',{v:percent(st.rate_bp)}),t('Проведите, чтобы включить плату'),'billing/settings',body(initial,true))}/>}
  <Group title={t('Списания с карт')}>
   <Line icon="lock" title={ch.stoppedAt?t('Остановлены'):t('Идут раз в неделю')} dot={ch.stoppedAt?'red':'ink'} value={t('сегодня {v}',{v:money(ch.today)})}/>
   <Line title={t('Подтверждать от')} value={money(ch.confirmAbove)}/>
   <Line title={t('Предел в день')} value={money(ch.dailyLimit)}/>
   {open.map(c=><Line key={c.id} icon="alert" dot={c.status==='unknown'||c.status==='started'?'red':'grey'} title={c.name||t('Участник')} note={[c.reason,when(c.created_at)].filter(Boolean).join(' · ')} value={money(c.amount)} onPress={c.status==='unknown'||c.status==='started'?()=>setCharge(c):undefined}/>)}
  </Group>
  {ch.stoppedAt?<Link title={t('Включить списания')} onPress={()=>ask(t('Списания с карт снова пойдут'),t('Проведите, чтобы включить'),'billing/charges',{action:'resume'})}/>:<Link title={t('Остановить все списания')} danger onPress={()=>ask(t('Ни одна карта не будет списана, долги копятся'),t('Проведите, чтобы остановить'),'billing/charges',{action:'stop'})}/>}
  <Group title={t('«Автопилот»')}>{yes(!!plans.charge,t('Брать плату за тариф'),t('Владелец {a}/мес · исполнитель {b}/мес',{a:money(plans.ownerPrice),b:money(plans.cleanerPrice)}),()=>ask(plans.charge?t('Тариф станет бесплатным'):t('Участники с тарифом начнут платить'),t('Проведите, чтобы применить'),'billing/plans',{charge:!plans.charge,confirmed:true}),d.busy)}</Group>
  {!!due.length&&<Group title={t('Выплатить исполнителям · {v}',{v:money(cl.dueTotal)})}>{due.map(x=><Line key={x.job_id} icon="send" title={x.cleaner_name} note={x.title+(x.withhold?' · '+t('удержать {v}',{v:money(x.withhold)}):'')} value={money(x.amount-(x.withhold||0))} onPress={()=>ask(t('Отправлено {a}: {b}',{a:money(x.amount-(x.withhold||0)),b:x.cleaner_name}),t('Проведите: деньги отправлены'),'billing/payout',{jobId:x.job_id,withhold:x.withhold||0,confirmed:true})}/>)}</Group>}
  <Group title={t('Владельцы · {n}',{n:b.ownersTotal||owners.length})}>{owners.length?owners.map(o=><Line key={o.id} icon="user" dot={o.balance<0?'red':undefined} title={o.name} note={t('Жильё {a} · заселений {b}',{a:o.properties,b:o.bookings})+(o.freeLeft?' · '+t('бесплатно ещё {n}',{n:o.freeLeft}):'')} value={money(o.projected)}/>):<Empty text={t('Пока нет')}/>}</Group>
  <FormSheet visible={editing} title={t('Условия оплаты')} note={t('Новые условия действуют для новых заселений.')} fields={fields} initial={initial} button={t('Дальше')} onClose={()=>setEditing(false)} onSubmit={v=>{setEditing(false);ask(t('{a} с заселения, {b} с уборки',{a:String(v.ratePercent)+'%',b:String(v.cleaningRatePercent)+'%'}),t('Проведите, чтобы применить условия'),'billing/settings',body(v,!!st.enabled));}}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}

// ── Бухгалтерия ─────────────────────────────────────────────────────────────────────────────────────────────────
export function Accounting(_:Nav){
 const d=useAdmin('accounting'),[paying,setPaying]=useState<Row|null>(null),[payment,setPayment]=useState<Row|null>(null),[pasting,setPasting]=useState(false),[result,setResult]=useState<Row|null>(null);
 if(!d.data)return <Loading error={d.error}/>;
 const x=d.data,tot=x.totals||{},obl:Row[]=x.obligations||[],paid:Row[]=x.payments||[];
 const exportCsv=async()=>{const r=await d.save('accounting/export',{month:x.now},false);if(r?.csv)await Share.share({title:r.filename,message:r.csv}).catch(()=>undefined);};
 if(paying&&payment)return <View>
  <Title title={paying.name} note={t('Период {v}',{v:paying.period})}/>
  <Group><Line title={t('Сумма')} value={money(num(payment.amount))}/><Line title={t('Номер платёжки')} value={payment.bankRef}/><Line title={t('Дата')} value={payment.paidOn}/></Group>
  <Confirm text={t('Платёж уже отправлен в бюджет')} label={t('Проведите, чтобы записать')} busy={d.busy} onConfirm={async()=>{if(await d.save('accounting/pay',{key:paying.key,amount:num(payment.amount),bankRef:payment.bankRef,paidOn:payment.paidOn,month:String(payment.paidOn).slice(0,7),confirmed:true})){setPaying(null);setPayment(null);}}} onCancel={()=>{setPaying(null);setPayment(null);}}/>
  <Said error={d.error}/>
 </View>;
 return <View>
  <Big label={t('К уплате в бюджет')} value={money(tot.due)} red={tot.overdue>0} note={tot.overdue?t('Просрочено {v}',{v:money(tot.overdue)}):tot.next?t('Ближайший срок {v}',{v:day(Date.parse(tot.next.due+'T00:00:00Z')/1000)}):t('Сроков пока нет')}/>
  <Group title={t('Налоги и взносы')}>{obl.length?obl.map(o=><Line key={o.key} icon="file" dot={o.status==='overdue'?'red':o.status==='paid'?'grey':undefined} title={o.name} note={t('{a} · срок {b}',{a:o.period,b:o.due})+(o.form?' · '+o.form:'')} value={o.status==='paid'?t('оплачено'):money(o.left)} onPress={o.left>0?()=>setPaying(o):undefined}/>):<Line title={t('Начислений пока нет')} note={t('Появятся с первой выручкой или зарплатой')}/>}</Group>
  <Group title={t('Для бухгалтера')}>
   <Line icon="send" title={t('Выгрузка для 1С')} note={t('Продажи, поступления и платежи за {v}',{v:monthName(x.now)})} onPress={()=>void exportCsv()}/>
   <Line icon="check" title={t('Сверка с выпиской Kaspi Pay')} note={t('Вставьте выписку, сервис найдёт расхождения')} onPress={()=>setPasting(true)}/>
  </Group>
  {!!result&&<Group title={t('Сверка · {v}',{v:monthName(result.month)})}><Line title={t('Совпало')} value={String(result.matched)}/><Line dot={result.bankOnly?.length?'red':undefined} title={t('Есть только в банке')} value={String(result.bankOnly?.length||0)}/><Line dot={result.serviceOnly?.length?'red':undefined} title={t('Есть только в сервисе')} value={String(result.serviceOnly?.length||0)}/></Group>}
  <Group title={t('Год')}><Line title={t('Прибыль {v}',{v:x.profit?.year||''})} value={money(x.profit?.profit)}/><Line title={t('КПН')} value={money(x.profit?.cit)}/><Line title={t('Порог НДС')} note={x.vat?.registered?t('Плательщик НДС'):t('Выручка за год {v}',{v:money(x.vat?.yearRevenue)})} value={Math.round((x.vat?.share||0)*100)+'%'} dot={(x.vat?.share||0)>=.8?'red':undefined}/></Group>
  <Group title={t('Оплачено')}>{paid.length?paid.slice(0,20).map(p=><Line key={p.id||p.bank_ref+p.tax} title={p.name||p.tax} note={[p.period,p.paid_on||p.month,p.bank_ref].filter(Boolean).join(' · ')} value={money(p.amount)}/>):<Empty text={t('Платежей пока нет')}/>}</Group>
  <FormSheet visible={!!paying&&!payment} title={paying?.name||''} note={t('Осталось {v}',{v:money(paying?.left||0)})} fields={[{key:'amount',label:t('Сумма, ₸'),numeric:true},{key:'bankRef',label:t('Номер платёжки')},{key:'paidOn',label:t('Дата, ГГГГ-ММ-ДД')}]} initial={{amount:String(paying?.left||''),bankRef:'',paidOn:today()}} button={t('Дальше')} onClose={()=>setPaying(null)} onSubmit={v=>setPayment(v)}/>
  <TextSheet visible={pasting} title={t('Выписка Kaspi Pay')} note={t('Вставьте строки выписки за {v} (CSV).',{v:monthName(x.now)})} placeholder={t('Дата;Сумма;Назначение…')} button={t('Сверить')} busy={d.busy} onClose={()=>setPasting(false)} onSubmit={async v=>{setPasting(false);const r=await d.save('accounting/reconcile',{month:x.now,statement:v},false);if(r)setResult(r);}}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}

// ── Финансист ───────────────────────────────────────────────────────────────────────────────────────────────────
const shift=(m:string,n:number)=>{const [y,mm]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mm-1+n,1));return d.toISOString().slice(0,7);};
const cashKinds:[string,string][]=[['capital','Взнос учредителя'],['loan','Получен займ'],['loan_repay','Возврат займа'],['dividend','Дивиденды'],['asset','Покупка техники']];
export function Finance({go}:Nav){
 const [basis,setBasis]=useState<'fact'|'plan'>('fact'),[month,setMonth]=useState(''),[tab,setTab]=useState<'pl'|'cf'|'bs'>('pl'),[cash,setCash]=useState(false),[kind,setKind]=useState('capital');
 const d=useAdmin('finance?'+new URLSearchParams(month?{basis,month}:{basis}).toString());
 if(!d.data)return <Loading error={d.error}/>;
 const f=d.data,m:string=f.month,row=(f.months as Row[]|undefined)?.find(x=>x.month===m)||f.current||{},pl=row.pl||{},cf=row.cf||{},bs=f.balance||{};
 const costs:Row[]=f.costs||[];
 return <View>
  <Tabs value={basis} onChange={setBasis} items={[['fact',t('Факт')],['plan',t('План')]]}/>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Прошлый месяц')} disabled={m<=f.first} onPress={()=>setMonth(shift(m,-1))} style={{padding:12,opacity:m<=f.first?.3:1}}><Text style={a.title}>‹</Text></Pressable>
   <Text style={a.title}>{monthName(m)}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Следующий месяц')} disabled={m>=f.last} onPress={()=>setMonth(shift(m,1))} style={{padding:12,opacity:m>=f.last?.3:1}}><Text style={a.title}>›</Text></Pressable>
  </View>
  <Big label={t('Чистая прибыль')} value={money(pl.net)} red={pl.net<0} note={t('Выручка {a} · расходы {b}',{a:money(pl.revenue),b:money((pl.revenue||0)-(pl.operating||0))})}/>
  <Tabs value={tab} onChange={setTab} items={[['pl',t('ОПИУ')],['cf',t('ДДС')],['bs',t('Баланс')]]}/>
  {tab==='pl'&&<Group>
   <Sum title={t('Выручка')} value={pl.revenue}/><Sum part title={t('Комиссия с заселений')} value={pl.bookings}/><Sum part title={t('Комиссия с уборок')} value={pl.cleaning}/><Sum part title={t('«Автопилот»')} value={pl.autopilot}/>
   <Sum part title={t('Эквайринг')} value={-pl.acquiring}/><Sum part title={t('ИИ')} value={-pl.ai}/><Sum title={t('Валовая прибыль')} value={pl.gross_profit}/>
   <Sum part title={t('Зарплата')} value={-pl.salaries}/><Sum part title={t('Налоги работодателя')} value={-pl.employer}/><Sum part title={t('Подрядчики')} value={-pl.outsource}/><Sum part title={t('Сервисы')} value={-pl.services}/><Sum part title={t('Прочие расходы')} value={-pl.opex}/>
   <Sum title={t('Операционная прибыль')} value={pl.operating}/><Sum part title={t('КПН')} value={-pl.profit_tax}/><Sum title={t('Чистая прибыль')} value={pl.net}/>
  </Group>}
  {tab==='cf'&&<Group>
   <Sum title={t('Поступления')} value={cf.inflow}/><Sum part title={t('Расходы оплачены')} value={-cf.costs_paid}/><Sum part title={t('Налоги оплачены')} value={-cf.taxes_paid}/><Sum part title={t('Эквайринг и ИИ')} value={-(cf.acquiring||0)-(cf.ai||0)}/>
   <Sum title={t('Операционный поток')} value={cf.operating}/><Sum title={t('Инвестиции')} value={cf.investing}/><Sum title={t('Финансирование')} value={cf.financing}/><Sum title={t('Итого за месяц')} value={cf.total}/>
  </Group>}
  {tab==='bs'&&<Group>
   <Sum title={t('Активы')} value={bs.totalAssets}/><Sum part title={t('Деньги')} value={bs.assets?.cash}/><Sum part title={t('Техника')} value={bs.assets?.equipment}/><Sum part title={t('Долги участников')} value={(bs.assets?.owners||0)+(bs.assets?.cleaners||0)}/>
   <Sum title={t('Обязательства')} value={bs.totalLiabilities}/><Sum part title={t('Поставщикам')} value={bs.liabilities?.suppliers}/><Sum part title={t('Налоги')} value={bs.liabilities?.taxes}/><Sum part title={t('Займы')} value={bs.liabilities?.loans}/><Sum part title={t('Участникам')} value={(bs.liabilities?.owners||0)+(bs.liabilities?.cleaners||0)}/>
   <Sum title={t('Капитал')} value={bs.totalEquity}/>
  </Group>}
  {tab==='bs'&&!!bs.difference&&<Note text={t('Расхождение баланса {v}: проверьте записи.',{v:money(bs.difference)})}/>}
  <Group space>
   <Line icon="file" title={t('Расходы')} note={t('Включено {a} из {b}',{a:costs.filter(c=>c.active).length,b:costs.length})} onPress={()=>go({id:'costs',title:'Расходы'})}/>
   <Line icon="sliders" title={t('Допущения')} note={t('Налоги, ставки, МРП, курс доллара')} onPress={()=>go({id:'finance-settings',title:'Допущения'})}/>
   <Line icon="bank" title={t('Записать движение денег')} note={t('Взнос, займ, дивиденды, техника')} onPress={()=>setCash(true)}/>
  </Group>
  <FormSheet visible={cash} title={t('Движение денег')} fields={[{key:'amount',label:t('Сумма, ₸'),numeric:true},{key:'note',label:t('Комментарий')}]} initial={{amount:'',note:''}} button={t('Записать')} busy={d.busy} extra={<Tabs value={kind} onChange={setKind} items={cashKinds.map(([k,l])=>[k,t(l)] as [string,string])}/>} onClose={()=>setCash(false)} onSubmit={async v=>{setCash(false);await d.save('finance/cash',{kind,amount:num(v.amount),month:m,note:v.note});}}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}

// ── Расходы ─────────────────────────────────────────────────────────────────────────────────────────────────────
const costKinds:[string,string][]=[['staff','Команда'],['service','Сервисы'],['opex','Прочие']];
export function Costs(_:Nav){
 const d=useAdmin('finance'),[open,setOpen]=useState<Row|null>(null),[edit,setEdit]=useState<Row|null>(null),[kind,setKind]=useState('opex'),[pay,setPay]=useState(false),[removing,setRemoving]=useState(false);
 if(!d.data)return <Loading error={d.error}/>;
 const costs:Row[]=d.data.costs||[],now:string=d.data.now;
 const c=open&&costs.find(x=>x.id===open.id);
 const amount=(x:Row)=>x.currency==='USD'?'$'+(x.amount/100).toLocaleString('ru-RU'):money(x.amount);
 const per:Row={month:'в месяц',year:'в год',once:'разово'};
 const save=async(v:Row)=>{setEdit(null);await d.save('finance/cost',{id:v.id,kind,name:v.name,amount:num(v.amount),currency:v.currency||'KZT',period:v.period||'month',employment:v.employment,startMonth:v.startMonth||now,endMonth:v.endMonth||'',note:v.note,active:v.active!==false});};
 const form=<FormSheet visible={!!edit} title={edit?.id?t('Изменить расход'):t('Новый расход')} fields={[{key:'name',label:t('Название')},{key:'amount',label:t('Сумма в месяц')+(edit?.currency==='USD'?', $':', ₸'),numeric:true},{key:'startMonth',label:t('С месяца, ГГГГ-ММ')},{key:'note',label:t('Комментарий')}]} initial={edit||{}} button={t('Сохранить')} busy={d.busy} extra={<Tabs value={kind} onChange={setKind} items={costKinds.map(([k,l])=>[k,t(l)] as [string,string])}/>} onClose={()=>setEdit(null)} onSubmit={v=>void save({...edit,...v})}/>;
 if(c)return <View>
  <Title title={c.name} note={c.note}/>
  <Group>
   <Line title={t('Сумма')} value={amount(c)+' '+t(per[c.period]||'')}/>
   <Line title={t('В этом месяце')} value={money(c.inMonth||0)}/>
   <Line title={t('С месяца')} value={monthName(c.start_month)+(c.end_month?' — '+monthName(c.end_month):'')}/>
   {yes(!!c.active,t('Учитывать в отчётах'),c.active?t('Входит в ОПИУ и ДДС'):t('Выключен, в отчёты не попадает'),()=>void d.save('finance/cost/toggle',{id:c.id,active:!c.active}),d.busy)}
  </Group>
  <Link title={t('Изменить')} onPress={()=>{setKind(c.kind);setEdit({id:c.id,name:c.name,amount:c.currency==='USD'?String(c.amount/100):String(c.amount),currency:c.currency,period:c.period,employment:c.employment,startMonth:c.start_month,endMonth:c.end_month||'',note:c.note||'',active:!!c.active});}}/>
  <Link title={t('Записать оплату из банка')} onPress={()=>setPay(true)}/>
  {removing?<Bottom><SwipeConfirm label={t('Проведите, чтобы удалить')} disabled={d.busy} onConfirm={async()=>{if(await d.save('finance/cost/delete',{id:c.id,confirmed:true})){setRemoving(false);setOpen(null);}}}/><Link title={t('Отмена')} onPress={()=>setRemoving(false)}/></Bottom>:<Link title={t('Удалить расход')} danger onPress={()=>setRemoving(true)}/>}
  <FormSheet visible={pay} title={t('Оплата «{v}»',{v:c.name})} fields={[{key:'amount',label:t('Сумма, ₸'),numeric:true},{key:'bankRef',label:t('Номер платёжки')},{key:'paidOn',label:t('Дата, ГГГГ-ММ-ДД')}]} initial={{amount:String(c.inMonth||c.tenge||''),bankRef:'',paidOn:today()}} button={t('Записать')} busy={d.busy} onClose={()=>setPay(false)} onSubmit={async v=>{setPay(false);await d.save('finance/cost-payment',{costId:c.id,amount:num(v.amount),bankRef:v.bankRef,paidOn:v.paidOn,month:String(v.paidOn).slice(0,7)});}}/>
  {form}
  <Said error={d.error} note={d.note}/>
 </View>;
 return <View>
  {costKinds.map(([k,l])=>{const list=costs.filter(x=>x.kind===k);return list.length?<Group key={k} title={t(l)}>{list.map(x=><Line key={x.id} dot={x.active?undefined:'grey'} title={x.name} note={x.active?t(per[x.period]||''):t('выключен')} value={amount(x)} onPress={()=>setOpen(x)}/>)}</Group>:null;})}
  {!costs.length&&<Empty text={t('Расходов пока нет')}/>}
  <Bottom><Link title={t('Добавить расход')} onPress={()=>{setKind('opex');setEdit({currency:'KZT',period:'month',startMonth:now});}}/></Bottom>
  {form}
  <Said error={d.error} note={d.note}/>
 </View>;
}

// ── Допущения ───────────────────────────────────────────────────────────────────────────────────────────────────
// [field of the form, column of the settings, label, kind]: a percent is stored in basis points.
const assumptions:[string,string,string,'bp'|'n'|'text'][]=[
 ['companyName','company_name','Название','text'],['startMonth','start_month','Начало учёта, ГГГГ-ММ','text'],
 ['cit','cit_bp','КПН','bp'],['vat','vat_bp','НДС','bp'],['vatThresholdMrp','vat_threshold_mrp','Порог НДС, МРП','n'],['mrp','mrp','МРП, ₸','n'],['mzp','mzp','МЗП, ₸','n'],
 ['opv','opv_bp','ОПВ','bp'],['vosmsEmployee','vosms_employee_bp','ВОСМС работника','bp'],['ipn','ipn_bp','ИПН','bp'],['ipnDeductionMrp','ipn_deduction_mrp','Вычет ИПН, МРП','n'],
 ['sn','sn_bp','Социальный налог','bp'],['so','so_bp','Социальные отчисления','bp'],['opvr','opvr_bp','ОПВР','bp'],['vosmsEmployer','vosms_employer_bp','ООСМС работодателя','bp'],
 ['acquiring','acquiring_bp','Эквайринг','bp'],['usdRate','usd_rate','Курс доллара, ₸','n'],['shareCapital','share_capital','Уставный капитал, ₸','n'],
];
export function FinanceSettings(_:Nav){
 const d=useAdmin('finance'),[field,setField]=useState<typeof assumptions[number]|null>(null);
 if(!d.data)return <Loading error={d.error}/>;
 const st=d.data.settings||{};
 const full=():Row=>{const b:Row={entity:st.entity,taxRegime:st.tax_regime,vatRegistered:!!st.vat_registered,simplified:(st.simplified_bp||0)/100,ownerBase:st.owner_base,vosmsSelf:(st.vosms_self_bp||0)/100,expectedVersion:st.version};for(const [f,col,,kind] of assumptions)b[f]=kind==='bp'?(st[col]||0)/100:st[col];return b;};
 const shown=(col:string,kind:string)=>kind==='bp'?percent(st[col]):kind==='n'?(col==='usd_rate'||col.endsWith('mrp')&&col!=='mrp'?String(st[col]):money(st[col])):String(st[col]||'—');
 return <View>
  <Group><Line title={t('Форма')} value={st.entity==='too'?t('ТОО'):t('ИП')}/><Line title={t('Режим')} value={st.tax_regime==='general'?t('Общеустановленный'):t('Упрощённый')}/>{yes(!!st.vat_registered,t('Плательщик НДС'),t('Включите после постановки на учёт'),()=>void d.save('finance/settings',{...full(),vatRegistered:!st.vat_registered}),d.busy)}</Group>
  <Group space>{assumptions.map(x=><Line key={x[0]} title={t(x[2])} value={shown(x[1],x[3])} onPress={()=>setField(x)}/>)}</Group>
  <Note text={t('Изменение пересчитывает отчёты за все месяцы. Ставки сверяйте с бухгалтером.')}/>
  <TextSheet visible={!!field} title={field?t(field[2]):''} initial={field?(field[3]==='bp'?String((st[field[1]]||0)/100).replace('.',','):String(st[field[1]]??'')):''} multiline={false} numeric={field?.[3]!=='text'} button={t('Сохранить')} busy={d.busy} onClose={()=>setField(null)} onSubmit={v=>{const f=field;setField(null);if(f)void d.save('finance/settings',{...full(),[f[0]]:f[3]==='text'?v:num(v)});}}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}
