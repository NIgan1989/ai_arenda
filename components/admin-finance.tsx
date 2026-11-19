'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Landmark,TrendingUp,Wallet,Users,Server,Receipt,Plus,ChevronRight,CheckCircle2,AlertTriangle,Info,Scale,Percent,Banknote} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import './admin-finance.css';
type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
type Line={key:string;label:string;sign?:1|-1;kind?:'section'|'subtotal'|'total';hint?:string};

const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(value||0))+' ₸';
const signed=(value:number,sign:1|-1=1)=>{const v=Math.round(value||0);if(!v)return '0';const shown=new Intl.NumberFormat('ru-RU').format(Math.abs(v));return (sign<0?v>0:v<0)?'−'+shown:shown;};
const usd=(cents:number)=>'$'+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(cents/100);
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
export const monthName=(key:string,style:'short'|'long'='long')=>{const [y,m]=key.split('-').map(Number);const text=new Date(Date.UTC(y,m-1,15)).toLocaleDateString('ru-RU',style==='short'?{month:'short',timeZone:'UTC'}:{month:'long',year:'numeric',timeZone:'UTC'}).replace('.','').replace(' г','');return style==='long'?text.charAt(0).toUpperCase()+text.slice(1):text;};
function monthList(from:string,to:string){const out:string[]=[];let [y,m]=from.split('-').map(Number);for(let i=0;i<240;i++){const k=`${y}-${String(m).padStart(2,'0')}`;if(k>to)break;out.push(k);m++;if(m>12){m=1;y++;}}return out;}
const kindLabels:Row={staff:'Сотрудники',service:'Платные сервисы',opex:'Операционные расходы'};
const periodLabels:Row={month:'в месяц',year:'в год',once:'разово'};
const cashLabels:Row={capital:'Взнос учредителя',loan:'Получен займ',loan_repay:'Возврат займа',dividend:'Дивиденды',asset:'Покупка техники'};

function plLines(s:Row):Line[]{return [
 {key:'_rev',label:'Выручка',kind:'section'},
 {key:'bookings',label:'Комиссия с броней'},{key:'cleaning',label:'Комиссия с уборок'},{key:'autopilot',label:'Подписки «Автопилот»'},
 ...(s.vat_registered?[{key:'vat',label:'НДС в выручке',sign:-1 as const}]:[]),
 {key:'revenue',label:'Выручка',kind:'subtotal'},
 {key:'_direct',label:'Прямые расходы',kind:'section'},
 {key:'acquiring',label:'Комиссия Kaspi Pay',sign:-1,hint:`${percent(s.acquiring_bp)} от денег, пришедших на счёт`},{key:'ai',label:'ИИ по факту (OpenAI)',sign:-1},{key:'bonuses',label:'Бонусы и корректировки владельцам',sign:-1},
 {key:'gross_profit',label:'Валовая прибыль',kind:'subtotal'},
 {key:'_opex',label:'Операционные расходы',kind:'section'},
 {key:'salaries',label:'Зарплаты сотрудников',sign:-1},{key:'employer',label:'Налоги и взносы работодателя',sign:-1},...(s.entity==='ip'?[{key:'self',label:'Взносы ИП за себя',sign:-1 as const,hint:'пенсионные, социальные, медстраховка'}]:[]),{key:'outsource',label:'Аутсорс',sign:-1},{key:'services',label:'Платные сервисы',sign:-1},{key:'opex',label:'Прочие расходы',sign:-1},
 {key:'operating',label:'Прибыль до налога',kind:'subtotal'},
 {key:'profit_tax',label:s.tax_regime==='simplified'?`Налог по упрощёнке ${percent(s.simplified_bp)} с дохода`:`КПН ${percent(s.cit_bp)}`,sign:-1,hint:'уходит в Бухгалтерию'},
 {key:'net',label:'Чистая прибыль',kind:'total'},
];}
function cfLines(basis:string,ip:boolean,payouts:boolean):Line[]{return [
 {key:'_op',label:'Операционная деятельность',kind:'section'},
 {key:'inflow',label:basis==='fact'?'Оплата услуг (списания с карт)':'Оплата комиссий и подписок'},
 ...(basis==='fact'&&payouts?[{key:'payouts',label:'Выплаты исполнителям через сервис',sign:-1 as const}]:[]),
 {key:'salaries_net',label:'Зарплаты на руки',sign:-1},{key:'outsource',label:'Аутсорс',sign:-1},{key:'services',label:'Платные сервисы',sign:-1},{key:'opex',label:'Прочие расходы',sign:-1},{key:'acquiring',label:'Комиссия Kaspi Pay',sign:-1},{key:'ai',label:'ИИ (OpenAI)',sign:-1},{key:'taxes_paid',label:'Налоги и взносы уплачены',sign:-1},
 {key:'operating',label:'Поток от операций',kind:'subtotal'},
 {key:'_inv',label:'Инвестиции',kind:'section'},{key:'assets',label:'Покупка техники',sign:-1},
 {key:'_fin',label:'Финансирование',kind:'section'},
 {key:'capital',label:ip?'Вложения владельца ИП':'Взносы учредителя и уставный капитал'},{key:'loans',label:'Займы получены'},{key:'repay',label:'Займы возвращены',sign:-1},{key:'dividends',label:ip?'Изъятия владельца':'Дивиденды',sign:-1},
 {key:'financing',label:'Поток от финансирования',kind:'subtotal'},
 {key:'total',label:'Чистый поток за месяц',kind:'total'},
];}

export function AdminFinance({data,busy,save,onParams}:{data:Row;busy:boolean;save:Save;onParams:(p:Row)=>void}){
 const s=data.settings,cur=data.current||{pl:{},cf:{}},pl=cur.pl,b=data.balance;
 const [tab,setTab]=useState<'pl'|'cf'|'balance'|'costs'|'settings'>('pl');
 const [editing,setEditing]=useState<Row|null>(null),[cashOpen,setCashOpen]=useState(false);
 const months=monthList(data.first,data.last),future=data.month>data.now,ip=s.entity==='ip';
 const cashNames:Row=ip?{...cashLabels,capital:'Вложение владельца',dividend:'Изъятие владельца'}:cashLabels;
 const expenses=pl.acquiring+pl.ai+pl.bonuses+pl.salaries+pl.employer+(pl.self||0)+pl.outsource+pl.services+pl.opex;
 const fixed=(data.costs as Row[]).reduce((a,c)=>a+(c.inMonth||0)+(c.payroll&&c.inMonth?c.payroll.sn+c.payroll.so+c.payroll.opvr+c.payroll.vosms_employer:0),0)+(pl.self||0);
 return <div className="admin-revenue admin-finance">
  <div className="finance-toolbar admin-surface">
   <label><span>Месяц</span><NativeSelect value={data.month} disabled={busy} onChange={e=>onParams({month:e.target.value,basis:data.basis})}>{months.map(m=><option key={m} value={m}>{monthName(m)}{m===data.now?' · сейчас':m>data.now?' · план':''}</option>)}</NativeSelect></label>
   <div className="finance-basis" role="radiogroup" aria-label="Какие деньги считать">
    {([['fact','Факт','Только то, что владельцы и исполнители реально оплатили'],['forecast','Прогноз','Как если бы плата за сервис уже была включена']] as const).map(([id,label,note])=><button key={id} type="button" role="radio" aria-checked={data.basis===id} disabled={busy} onClick={()=>onParams({month:data.month,basis:id})}><strong>{label}</strong><small>{note}</small></button>)}
   </div>
  </div>

  <section className={'revenue-hero finance-hero '+(pl.net>=0?'is-active':'is-loss')}>
   <div className="revenue-hero-main">
    <span className="revenue-status"><i aria-hidden="true"/>{ip?'ИП':'ТОО'} «{s.company_name}» · {future?'план на':data.basis==='fact'?'факт за':'прогноз за'} {monthName(data.month).toLowerCase()}</span>
    <p className="revenue-hero-label">{ip?'Чистая прибыль (доход владельца ИП)':'Чистая прибыль'}</p>
    <strong className={'revenue-hero-value'+(pl.net<0?' is-negative':'')}>{pl.net<0?'−':''}{money(Math.abs(pl.net))}</strong>
    <p className="revenue-hero-note">{pl.net<0?`Расходы больше выручки на ${money(-pl.operating)}. Посмотрите вкладку «Расходы», чтобы понять, что можно отложить.`:pl.profit_tax>0?`С прибыли начислено ${money(pl.profit_tax)} налога. Он ушёл в «Бухгалтерию» к уплате.`:'Налог с прибыли за этот месяц не начислен.'}</p>
   </div>
   <div className="revenue-hero-side">
    <dl>
     <div><dt>Выручка</dt><dd>{money(pl.revenue)}</dd></div>
     <div><dt>Расходы</dt><dd>{money(expenses)}</dd></div>
     <div><dt>{s.tax_regime==='simplified'?'Налог с дохода':'Налог с прибыли'}</dt><dd>{money(pl.profit_tax)}</dd></div>
     <div><dt>Деньги на конец месяца</dt><dd className={b.assets.cash<0?'is-negative':''}>{signed(b.assets.cash)} ₸</dd></div>
    </dl>
    <Button className="revenue-primary" variant="outline" onClick={()=>setTab('costs')}><Receipt size={18}/>Настроить расходы</Button>
   </div>
  </section>

  <div className="revenue-stats" aria-label="Главные цифры">
   <Stat Icon={TrendingUp} label={`Выручка за ${data.month.slice(0,4)} год`} value={money(data.ytd.pl.revenue||0)} note={`чистая прибыль ${signed(data.ytd.pl.net||0)} ₸`}/>
   <Stat Icon={Wallet} label="Постоянные расходы в месяц" value={money(fixed)} note={ip?'взносы ИП за себя, зарплаты, сервисы':'зарплаты с взносами, сервисы и прочее'}/>
   <Stat Icon={Percent} label={data.vat.kind==='simplified'?'До лимита упрощёнки':'До порога НДС'} value={`${Math.round((data.vat.share||0)*100)}%`} note={`${money(data.vat.yearRevenue)} из ${money(data.vat.threshold)} за год`}/>
  </div>

  <section className="admin-surface revenue-ledger">
   <div className="revenue-tabs" role="tablist" aria-label="Отчёты финансиста">
    {([['pl','ОПИУ'],['cf','ДДС'],['balance','Баланс'],['costs','Расходы'],['settings','Допущения']] as const).map(([id,label])=><button key={id} role="tab" type="button" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}{id==='balance'&&b.difference!==0&&<b>!</b>}</button>)}
   </div>
   {tab==='pl'&&<><p className="finance-caption">Отчёт о прибылях и убытках: что заработали и потратили по начислению. {data.basis==='forecast'?'В прогнозе выручка считается так, будто плата за сервис уже включена.':'В факте только начисленная плата, бесплатные брони не считаются.'}</p><ReportTable lines={plLines(s)} months={data.months} part="pl" active={data.month}/></>}
   {tab==='cf'&&<><p className="finance-caption">Движение денежных средств: сколько денег пришло и ушло на самом деле. Налоги попадают сюда, когда бухгалтер отметит их оплату.</p><ReportTable lines={cfLines(data.basis,ip,data.months.some((m:Row)=>m.cf.payouts))} months={data.months} part="cf" active={data.month} opening={data.openingCash}/>
    <div className="finance-subhead"><div><h3>{ip?'Деньги владельца, займы и покупки':'Деньги учредителя, займы и покупки'}</h3><p>Не доход и не расход, но меняют остаток денег и баланс.</p></div><Button variant="outline" disabled={busy} onClick={()=>setCashOpen(true)}><Plus size={16}/>Добавить</Button></div>
    {data.cashEntries.length===0?<p className="finance-empty">Пока записей нет.{ip?' Запишите сюда свои деньги, вложенные в дело, чтобы остаток на счёте Kaspi Pay совпадал с отчётом.':` Уставный капитал ${money(s.share_capital)} учтён в месяце начала учёта.`}</p>:<ul className="revenue-list">{data.cashEntries.map((e:Row)=><li key={e.id}><div className="revenue-row"><span className="finance-dot" data-kind={e.kind}><Banknote size={16}/></span><span><strong>{cashNames[e.kind]}</strong><small>{monthName(e.month)}{e.note?' · '+e.note:''}</small></span><b>{['loan_repay','dividend','asset'].includes(e.kind)?'−':'+'}{money(e.amount)}</b><Button variant="ghost" size="sm" disabled={busy} onClick={()=>save('finance/cash/delete',{id:e.id,confirmed:true})}>Удалить</Button></div></li>)}</ul>}
   </>}
   {tab==='balance'&&<BalanceView data={data} onTaxes={()=>setTab('pl')}/>}
   {tab==='costs'&&<CostsView data={data} busy={busy} save={save} onEdit={setEditing}/>}
   {tab==='settings'&&<SettingsForm s={s} busy={busy} save={save}/>}
  </section>

  <Sheet open={!!editing} onOpenChange={open=>{if(!open)setEditing(null);}}><SheetContent side="right" className="revenue-sheet"><SheetHeader><SheetTitle>{editing?.id?editing.name:'Новый расход'}</SheetTitle><SheetDescription>{kindLabels[editing?.kind]||''}. Сумма попадает в ОПИУ, ДДС и баланс сразу после сохранения.</SheetDescription></SheetHeader>{editing&&<CostForm cost={editing} now={data.now} usdRate={s.usd_rate} busy={busy} save={async b=>{const r=await save('finance/cost',b);if(r)setEditing(null);}} remove={async()=>{const r=await save('finance/cost/delete',{id:editing.id,confirmed:true});if(r)setEditing(null);}}/>}</SheetContent></Sheet>
  <Sheet open={cashOpen} onOpenChange={setCashOpen}><SheetContent side="right" className="revenue-sheet"><SheetHeader><SheetTitle>Движение денег</SheetTitle><SheetDescription>{ip?'Вложение или изъятие владельца, займ, возврат займа или покупка техники.':'Взнос учредителя, займ, возврат займа, дивиденды или покупка техники.'}</SheetDescription></SheetHeader>{cashOpen&&<CashForm names={cashNames} month={data.month} busy={busy} save={async b=>{const r=await save('finance/cash',b);if(r)setCashOpen(false);}}/>}</SheetContent></Sheet>
 </div>;
}

function Stat({Icon,label,value,note}:{Icon:typeof Wallet;label:string;value:string;note:string}){return <section className="revenue-stat"><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></section>;}

function ReportTable({lines,months,part,active,opening}:{lines:Line[];months:Row[];part:'pl'|'cf';active:string;opening?:number}){
 const shown=months.filter(m=>m.month<=active).slice(-12),wrap=useRef<HTMLDivElement>(null);
 // On a phone the latest months are on the right: open the table there.
 useEffect(()=>{const el=wrap.current;if(el)el.scrollLeft=el.scrollWidth;},[active,part]);
 const total=(key:string)=>shown.reduce((a,m)=>a+Number(m[part][key]||0),0);
 const ends=shown.map((_,i)=>shown.slice(0,i+1).reduce((a,m)=>a+Number(m.cf.total||0),opening||0));
 return <div className="finance-table-wrap" ref={wrap} tabIndex={0} role="region" aria-label="Таблица отчёта"><table className="finance-table">
  <thead><tr><th scope="col">Статья</th>{shown.map(m=><th scope="col" key={m.month} className={m.month===active?'is-active':''}>{monthName(m.month,'short')}</th>)}<th scope="col" className="is-total">Итого</th></tr></thead>
  <tbody>{lines.map(l=>l.kind==='section'?<tr key={l.key} className="is-section"><th scope="rowgroup" colSpan={shown.length+2}>{l.label}</th></tr>:<tr key={l.key} className={l.kind?'is-'+l.kind:''}><th scope="row">{l.label}{l.hint&&<small>{l.hint}</small>}</th>{shown.map(m=>{const v=Number(m[part][l.key]||0);return <td key={m.month} className={(m.month===active?'is-active ':'')+(l.kind&&v<0?'is-negative':'')}>{signed(v,l.sign)}</td>;})}<td className={'is-total'+(l.kind&&total(l.key)<0?' is-negative':'')}>{signed(total(l.key),l.sign)}</td></tr>)}
  {part==='cf'&&<tr className="is-total is-cash"><th scope="row">Деньги на конец месяца</th>{shown.map((m,i)=><td key={m.month} className={(m.month===active?'is-active ':'')+(ends[i]<0?'is-negative':'')}>{signed(ends[i])}</td>)}<td className="is-total">{signed(ends[ends.length-1]||opening||0)}</td></tr>}
  </tbody>
 </table></div>;
}

function BalanceView({data}:{data:Row;onTaxes:()=>void}){
 const b=data.balance,p=data.previousBalance,ip=data.settings.entity==='ip';
 const line=(label:string,value:number,prev?:number,hint?:string)=><div><dt>{label}{hint&&<small>{hint}</small>}</dt><dd className={value<0?'is-negative':''}>{signed(value)} ₸{prev!==undefined&&<em>{prev===value?'без изменений':(value>prev?'+':'−')+new Intl.NumberFormat('ru-RU').format(Math.abs(value-prev))}</em>}</dd></div>;
 return <>
  <p className="finance-caption">Баланс на конец месяца: {monthName(data.month).toLowerCase()}. Рядом изменение за месяц.</p>
  <div className={'finance-check '+(b.difference===0?'is-ok':'is-off')}>{b.difference===0?<CheckCircle2 size={18}/>:<AlertTriangle size={18}/>}<span>{b.difference===0?`Баланс сходится: активы ${money(b.totalAssets)} = обязательства и капитал.`:`Расхождение ${money(b.difference)}. Обновите страницу; если не уйдёт, напишите мне.`}</span></div>
  <div className="finance-balance">
   <section><h3><Scale size={18}/>Активы<b>{money(b.totalAssets)}</b></h3><dl className="revenue-facts">
    {line(ip?'Деньги на счёте Kaspi Pay':'Деньги на счетах',b.assets.cash,p?.assets.cash)}
    {line('Техника и оборудование',b.assets.equipment,p?.assets.equipment,'без амортизации')}
    {line('Долги владельцев сервису',b.assets.owners,p?.assets.owners,'отрицательные балансы')}
    {line('Долги исполнителей за «Автопилот»',b.assets.cleaners,p?.assets.cleaners)}
   </dl></section>
   <section><h3><Landmark size={18}/>Обязательства и капитал<b>{money(b.totalLiabilities+b.totalEquity)}</b></h3><dl className="revenue-facts">
    {line('Авансы владельцев',b.liabilities.owners,p?.liabilities.owners,'деньги на их балансах')}
    {(b.liabilities.cleaners||p?.liabilities.cleaners)?line('Деньги исполнителей к выплате',b.liabilities.cleaners,p?.liabilities.cleaners):null}
    {line('Налоги и взносы к уплате',b.liabilities.taxes,p?.liabilities.taxes,'платит Бухгалтерия')}
    {line('Займы',b.liabilities.loans,p?.liabilities.loans)}
    {line(ip?'Вложения владельца':'Уставный капитал и взносы',b.equity.capital,p?.equity.capital)}
    {line('Нераспределённая прибыль',b.equity.retained,p?.equity.retained,ip?'прибыль минус изъятия владельца':'прибыль минус дивиденды')}
   </dl></section>
  </div>
 </>;
}

function CostsView({data,busy,save,onEdit}:{data:Row;busy:boolean;save:Save;onEdit:(c:Row)=>void}){
 const costs=data.costs as Row[],s=data.settings;
 return <div className="finance-costs">
  <p className="finance-caption">Включённые строки попадают в отчёты с месяца начала. Суммы в долларах пересчитываются по курсу {s.usd_rate} ₸ за $1, годовые платежи делятся на 12 месяцев.</p>
  {(['staff','service','opex'] as const).map(kind=>{const list=costs.filter(c=>c.kind===kind),Icon=kind==='staff'?Users:kind==='service'?Server:Receipt;
   const sum=list.reduce((a,c)=>a+(c.inMonth||0)+(c.payroll&&c.inMonth?c.payroll.sn+c.payroll.so+c.payroll.opvr+c.payroll.vosms_employer:0),0);
   return <section key={kind} className="finance-cost-group"><div className="finance-subhead"><div><h3><Icon size={18}/>{kindLabels[kind]}</h3><p>{monthName(data.month)}: {money(sum)}{kind==='staff'?' вместе с взносами работодателя':''}</p></div><Button variant="outline" disabled={busy} onClick={()=>onEdit({kind,name:'',amount:0,currency:'KZT',period:kind==='staff'?'month':'month',employment:kind==='staff'?'employee':'none',start_month:data.month,end_month:null,active:1,note:''})}><Plus size={16}/>Добавить</Button></div>
    <ul className="revenue-list">{list.map(c=><li key={c.id} className={c.active?'':'is-off'}><div className="revenue-row finance-cost-row">
     <label className="revenue-switch finance-toggle" aria-label={(c.active?'Выключить ':'Включить ')+c.name}><input type="checkbox" checked={!!c.active} disabled={busy} onChange={e=>save('finance/cost/toggle',{id:c.id,active:e.target.checked})}/><span className="revenue-switch-track"/></label>
     <button type="button" className="finance-cost-open" onClick={()=>onEdit(c)}><span><strong>{c.name}</strong><small>{costNote(c)}</small></span><b>{c.currency==='USD'?usd(c.amount):money(c.amount)}<small>{periodLabels[c.period]}</small></b><ChevronRight size={16}/></button>
    </div></li>)}</ul>
   </section>;})}
 </div>;
}
function costNote(c:Row){
 const parts:string[]=[];
 if(c.payroll)parts.push(`на руки ${money(c.payroll.net)}, взносы работодателя ${money(c.payroll.sn+c.payroll.so+c.payroll.opvr+c.payroll.vosms_employer)}`);
 else if(c.kind==='staff')parts.push('договор с ИП или фирмой, без взносов');
 if(c.currency==='USD')parts.push(`≈ ${money(c.tenge)}`);
 if(c.note)parts.push(c.note);
 if(!c.active)parts.push('выключено');
 else parts.push(c.end_month?`${monthName(c.start_month,'short')}–${monthName(c.end_month,'short')}`:`с ${monthName(c.start_month).toLowerCase()}`);
 return parts.join(' · ');
}

function CostForm({cost,now,usdRate,busy,save,remove}:{cost:Row;now:string;usdRate:number;busy:boolean;save:(b:Row)=>Promise<void>;remove:()=>Promise<void>}){
 const [f,setF]=useState<Row>({...cost,amount:cost.currency==='USD'?String(cost.amount/100):String(cost.amount||''),end_month:cost.end_month||''});
 const set=(k:string,v:unknown)=>setF(x=>({...x,[k]:v}));
 const amount=Number(String(f.amount).replace(',','.'))||0,tenge=f.currency==='USD'?Math.round(amount*usdRate):amount;
 function submit(e:FormEvent){e.preventDefault();void save({id:cost.id,kind:f.kind,name:f.name,amount:f.amount,currency:f.currency,period:f.period,employment:f.employment,startMonth:f.start_month,endMonth:f.end_month||null,note:f.note,active:!!f.active});}
 return <form className="revenue-terms" onSubmit={submit}>
  <label>Название<Input value={f.name} maxLength={120} required onChange={e=>set('name',e.target.value)} placeholder={f.kind==='staff'?'Например: менеджер по владельцам':f.kind==='service'?'Например: SMS-шлюз':'Например: аренда офиса'}/></label>
  {f.kind==='staff'&&<div className="revenue-segment finance-segment-2" role="radiogroup" aria-label="Как оформлен">{([['employee','В штате'],['outsource','ИП или фирма']] as const).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={f.employment===id} onClick={()=>set('employment',id)}>{label}</button>)}</div>}
  <div className="revenue-fields">
   <label>{f.kind==='staff'&&f.employment==='employee'?'Оклад до удержаний':'Сумма'}<Input value={f.amount} inputMode="decimal" required onChange={e=>set('amount',e.target.value.replace(/[^\d.,]/g,'').slice(0,12))}/></label>
   <label>Валюта<NativeSelect value={f.currency} onChange={e=>set('currency',e.target.value)}><option value="KZT">Тенге</option><option value="USD">Доллары</option></NativeSelect></label>
  </div>
  <div className="revenue-segment" role="radiogroup" aria-label="Как часто">{([['month','Каждый месяц'],['year','Раз в год'],['once','Разово']] as const).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={f.period===id} onClick={()=>set('period',id)}>{label}</button>)}</div>
  {f.currency==='USD'&&amount>0&&<p className="finance-caption">≈ {money(tenge)} по курсу {usdRate} ₸ за $1</p>}
  <div className="revenue-fields">
   <label>С месяца<Input type="month" value={f.start_month} required onChange={e=>set('start_month',e.target.value)}/></label>
   {f.period!=='once'&&<label>По месяц<Input type="month" value={f.end_month} min={f.start_month} onChange={e=>set('end_month',e.target.value)}/></label>}
  </div>
  <label>Заметка<Input value={f.note} maxLength={200} onChange={e=>set('note',e.target.value)} placeholder="Необязательно"/></label>
  <label className="revenue-switch"><input type="checkbox" checked={!!f.active} onChange={e=>set('active',e.target.checked)}/><span className="revenue-switch-track"/><span><strong>Учитывать в отчётах</strong><small>Выключите, если расход пока только в планах.</small></span></label>
  <Button className="revenue-primary" disabled={busy}>{cost.id?'Сохранить':'Добавить'}</Button>
  {cost.id&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void remove()}>Удалить расход</Button>}
  {f.start_month<now&&!cost.id&&<p className="finance-caption">Месяц в прошлом: расход появится и в прошлых отчётах.</p>}
 </form>;
}

function CashForm({names,month,busy,save}:{names:Row;month:string;busy:boolean;save:(b:Row)=>Promise<void>}){
 const [kind,setKind]=useState('capital'),[m,setM]=useState(month),[amount,setAmount]=useState(''),[note,setNote]=useState('');
 return <form className="revenue-terms" onSubmit={e=>{e.preventDefault();void save({kind,month:m,amount,note});}}>
  <label>Что произошло<NativeSelect value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(names).map(([id,label])=><option key={id} value={id}>{label as string}</option>)}</NativeSelect></label>
  <div className="revenue-fields"><label>Сумма, ₸<Input value={amount} inputMode="numeric" required onChange={e=>setAmount(e.target.value.replace(/\D/g,'').slice(0,11))}/></label><label>Месяц<Input type="month" value={m} required onChange={e=>setM(e.target.value)}/></label></div>
  <label>Заметка<Input value={note} maxLength={200} onChange={e=>setNote(e.target.value)} placeholder="Например: ноутбук для оператора"/></label>
  <Button className="revenue-primary" disabled={busy}>Записать</Button>
 </form>;
}

function SettingsForm({s,busy,save}:{s:Row;busy:boolean;save:Save}){
 const p=(bp:number)=>String(bp/100).replace('.',',');
 const [f,setF]=useState<Row>({entity:s.entity,companyName:s.company_name,mzp:String(s.mzp),ownerBase:String(s.owner_base),vosmsSelf:p(s.vosms_self_bp),startMonth:s.start_month,taxRegime:s.tax_regime,cit:p(s.cit_bp),simplified:p(s.simplified_bp),vatRegistered:!!s.vat_registered,vat:p(s.vat_bp),vatThresholdMrp:String(s.vat_threshold_mrp),mrp:String(s.mrp),usdRate:String(s.usd_rate),opv:p(s.opv_bp),vosmsEmployee:p(s.vosms_employee_bp),ipn:p(s.ipn_bp),ipnDeductionMrp:String(s.ipn_deduction_mrp),sn:p(s.sn_bp),so:p(s.so_bp),opvr:p(s.opvr_bp),vosmsEmployer:p(s.vosms_employer_bp),acquiring:p(s.acquiring_bp),shareCapital:String(s.share_capital)});
 const field=(key:string,label:string,suffix:string)=><label className="plans-field">{label}<span><Input value={f[key]} inputMode="decimal" disabled={busy} onChange={e=>setF({...f,[key]:e.target.value.replace(/[^\d.,]/g,'').slice(0,12)})}/><em>{suffix}</em></span></label>;
 const num=(k:string)=>Number(String(f[k]).replace(',','.'));
 return <form className="revenue-terms finance-settings" onSubmit={e=>{e.preventDefault();void save('finance/settings',{...f,expectedVersion:s.version,vatThresholdMrp:num('vatThresholdMrp'),mrp:num('mrp'),usdRate:num('usdRate'),mzp:num('mzp'),ownerBase:num('ownerBase'),ipnDeductionMrp:num('ipnDeductionMrp'),shareCapital:num('shareCapital')});}}>
  <div className="finance-note"><Info size={18}/><p>По умолчанию ИП на упрощённой декларации со счётом Kaspi Pay: {percent(s.simplified_bp)} с дохода раз в полугодие, без НДС и без социального налога, плюс взносы ИП за себя каждый месяц. Гости платят владельцам, а владельцы исполнителям напрямую, мимо сервиса: на счёт ИП приходят только комиссия и «Автопилот», и только они считаются доходом. Ставки по Налоговому кодексу РК 2026 года. Это допущения, их стоит сверить с бухгалтером. Не учтены потолки взносов, входящий НДС, перенос убытков и амортизация техники.</p></div>
  <fieldset><legend>Бизнес</legend>
   <div className="revenue-segment finance-segment-2" role="radiogroup" aria-label="Форма бизнеса">{([['ip','ИП'],['too','ТОО']] as const).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={f.entity===id} onClick={()=>setF({...f,entity:id,taxRegime:id==='ip'?'simplified':'general'})}>{label}</button>)}</div>
   <div className="revenue-fields"><label>Название<Input value={f.companyName} maxLength={80} onChange={e=>setF({...f,companyName:e.target.value})}/></label><label>Начало учёта<Input type="month" value={f.startMonth} onChange={e=>setF({...f,startMonth:e.target.value})}/></label></div>
   {f.entity==='too'&&<div className="revenue-fields">{field('shareCapital','Уставный капитал','₸')}</div>}
   <div className="revenue-segment finance-segment-2" role="radiogroup" aria-label="Режим налогообложения">{([['general','Общий режим (КПН)'],['simplified','Упрощённая декларация']] as const).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={f.taxRegime===id} onClick={()=>setF({...f,taxRegime:id})}>{label}</button>)}</div>
   <div className="revenue-fields">{f.taxRegime==='general'?field('cit',f.entity==='ip'?'ИПН с прибыли':'КПН','%'):field('simplified','Налог с дохода','%')}{field('acquiring','Комиссия Kaspi Pay','%')}</div>
  </fieldset>
  {f.entity==='ip'&&<fieldset><legend>Взносы ИП за себя</legend>
   <div className="revenue-fields">{field('ownerBase','Заявленный доход в месяц','₸')}{field('vosmsSelf','ВОСМС от 1,4 МЗП','%')}</div>
   <p className="finance-caption">ОПВ, ОПВР и соцотчисления считаются с заявленного дохода, но не меньше чем с одной минимальной зарплаты.</p>
  </fieldset>}
  <fieldset><legend>НДС</legend>
   <label className="revenue-switch"><input type="checkbox" checked={f.vatRegistered} onChange={e=>setF({...f,vatRegistered:e.target.checked})}/><span className="revenue-switch-track"/><span><strong>Плательщик НДС</strong><small>На упрощённой декларации НДС не платят. На общем режиме обязателен после порога.</small></span></label>
   <div className="revenue-fields">{field('vat','Ставка НДС','%')}{field('vatThresholdMrp','Порог','МРП')}</div>
  </fieldset>
  <fieldset><legend>Зарплата: удерживается с работника</legend>
   <div className="revenue-fields">{field('opv','ОПВ','%')}{field('vosmsEmployee','ВОСМС','%')}{field('ipn','ИПН','%')}{field('ipnDeductionMrp','Вычет по ИПН','МРП')}</div>
  </fieldset>
  <fieldset><legend>Зарплата: платит работодатель</legend>
   <div className="revenue-fields">{f.taxRegime==='general'&&field('sn','Социальный налог','%')}{field('so','Соц. отчисления','%')}{field('opvr','ОПВР','%')}{field('vosmsEmployer','ООСМС','%')}</div>
  </fieldset>
  <fieldset><legend>Показатели</legend>
   <div className="revenue-fields">{field('mrp','МРП 2026','₸')}{field('mzp','МЗП 2026','₸')}{field('usdRate','Курс доллара','₸')}</div>
  </fieldset>
  <Button className="revenue-primary" disabled={busy}>Сохранить и пересчитать</Button>
 </form>;
}
