'use client';
import {useQuery} from '@tanstack/react-query';
import {useEffect,useRef,useState} from 'react';
import {MapPin,RefreshCw} from 'lucide-react';
import {MapCanvas} from './map-canvas';
import {Button} from './ui/button';
import './admin-activity-map.css';
type Row=Record<string,any>;
type Mode='pulse'|'problems'|'shortage';

// The AI administrator's live map (stage 5 of the live map concept): the pulse of the city, problems as rings and
// «соты» where guests found nothing. The map asks again every 20 s; what is new since the last look flashes once.
const REFRESH=20000,FIRST_LOOK=10*60;
const KIND:Record<string,string>={ask:'ask',booking:'booking',cleaning:'cleaning',issue:'issue'};
const clock=(at:number)=>new Date((at+5*3600)*1000).toISOString().slice(11,16);
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};

export function AdminActivityMap({onProperties,onIssues}:{onProperties:()=>void;onIssues?:()=>void}){
 const [selected,setSelected]=useState(''),[mode,setMode]=useState<Mode>('pulse'),[focus,setFocus]=useState<[number,number]|null>(null),[zoom,setZoom]=useState(15),[flashes,setFlashes]=useState<Row[]>([]),seen=useRef<Set<string>|null>(null);
 const query=useQuery({queryKey:['admin-activity-map'],queryFn:async()=>{const response=await fetch('/api/admin/map',{cache:'no-store'}),value=await response.json() as Row;if(!response.ok)throw Error(value.error||'Не удалось загрузить карту.');return value;},retry:1,refetchInterval:REFRESH});
 const data=query.data,events:Row[]=data?.pulse?.events||[],problems:Row[]=data?.problems||[],cells:Row[]=data?.shortage?.cells||[],today=data?.pulse?.today;
 // New events flash; on the first look only those of the last ten minutes, so opening the page is not a firework.
 useEffect(()=>{if(!data)return;const first=!seen.current,known=seen.current||new Set<string>(),fresh=events.filter(e=>!known.has(e.id)&&(!first||e.at>(data.serverTime||0)-FIRST_LOOK));seen.current=new Set(events.map(e=>e.id));if(fresh.length)setFlashes(fresh.slice(0,8).reverse());},[data]);
 const open=problems.filter(p=>p.tone!=='resolved'),item=data?.properties?.find((p:Row)=>p.mapKey===selected),problem=problems.find(p=>'alert:'+p.id===selected);
 const go=(point:unknown,key='',z=15)=>{if(Array.isArray(point)){setZoom(z);setFocus([point[0],point[1]]);}if(key)setSelected(key);};
 // Соты are seen from above: entering the mode brings the busiest hexagon into view at a city zoom.
 const choose=(m:Mode)=>{setMode(m);setSelected('');if(m==='shortage'&&cells[0])go(cells[0].center,'',12);};
 const tabs:[Mode,string,number?][]=[['pulse','Пульс'],['problems','Проблемы',open.length],['shortage','Нехватка']];
 return <section className="admin-surface admin-activity-map">
  <header><div><h2>Живая карта города</h2><p>Активных подборов: {data?.matching?.active||0} · с ответом владельца: {data?.matching?.ready||0}</p></div><Button variant="outline" size="icon" aria-label="Обновить карту" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={17}/></Button></header>
  <div className="admin-map-modes" role="tablist" aria-label="Что показать на карте">{tabs.map(([id,label,count])=><button key={id} type="button" role="tab" aria-selected={mode===id} className={mode===id?'active':''} onClick={()=>choose(id)}>{label}{count?<b className={id==='problems'?'alarm':''}>{count}</b>:null}</button>)}</div>
  {query.error?<p role="alert">{query.error instanceof Error?query.error.message:'Карта недоступна.'}</p>:<div className="admin-map-canvas"><MapCanvas items={data?.properties||[]} selected={selected} center={data?.center||[76.9674,52.2856]} onSelect={setSelected} focus={focus} focusZoom={zoom} alerts={problems} flashes={flashes} hexes={mode==='shortage'?cells:[]}/>{query.isPending&&<p role="status">Загружаем процессы…</p>}{data&&!data.properties.length&&<p className="admin-map-empty">Объектов пока нет. После добавления здесь появятся брони и уборки.</p>}</div>}
  {problem&&mode!=='problems'?<div className="admin-map-selection"><span className={'admin-map-dot '+problem.tone}/><div><strong>{problem.title}{problem.place?' · '+problem.place:''}</strong><p>{problem.text}</p></div>{problem.kind==='issue'&&onIssues?<Button variant="outline" onClick={onIssues}>К обращениям</Button>:<Button variant="outline" onClick={()=>setSelected('')}>Закрыть</Button>}</div>
  :item&&<div className="admin-map-selection"><MapPin size={18}/><div><strong>{item.title}</strong><p>{item.city} · {item.district} · активных броней: {item.bookings} · уборок: {item.jobs}</p></div><Button variant="outline" onClick={onProperties}>К объектам</Button></div>}
  {data&&mode==='pulse'&&<div className="admin-map-panel">
   <div className="admin-map-kpis"><div><b>{today?.asks??0}</b><span>запросов</span></div><div><b>{today?.bookings??0}</b><span>броней</span></div><div><b>{today?.cleanings??0}</b><span>уборок</span></div><div><b>{today?.resolved?today.withoutAdmin+' из '+today.resolved:'—'}</b><span>решено без админа</span></div></div>
   {events.length?<ul className="admin-map-log" aria-live="polite">{events.slice(0,6).map(e=><li key={e.id}><button type="button" disabled={!e.point} onClick={()=>go(e.point)}><time>{clock(e.at)}</time><span className={'admin-map-dot '+KIND[e.kind]}/><span><strong>{e.text}{e.place?' · '+e.place:''}</strong>{e.ai&&<small>ИИ: {e.ai}</small>}</span></button></li>)}</ul>:<p className="admin-map-quiet">За сутки событий не было. Когда гости начнут искать жильё, события появятся здесь и вспыхнут на карте.</p>}
  </div>}
  {data&&mode==='problems'&&<div className="admin-map-panel">{problems.length?<ul className="admin-map-log">{problems.map(p=><li key={p.id}><button type="button" aria-pressed={selected==='alert:'+p.id} disabled={!p.point} onClick={()=>go(p.point,'alert:'+p.id)}><span className={'admin-map-dot '+p.tone}/><span><strong>{p.title}{p.place?' · '+p.place:''}</strong><small>{p.text}</small></span></button>{selected==='alert:'+p.id&&p.kind==='issue'&&onIssues&&<Button variant="outline" onClick={onIssues}>К обращениям</Button>}</li>)}</ul>:<p className="admin-map-quiet">Проблем нет. ИИ-администратор следит за обращениями и сроками уборок и покажет здесь, если что-то пойдёт не так.</p>}</div>}
  {data&&mode==='shortage'&&<div className="admin-map-panel"><p className="admin-map-ai"><span>ИИ</span>{data.shortage?.text}</p>{cells.length>0&&<ul className="admin-map-log">{cells.slice(0,3).map((c:Row)=><li key={c.key}><button type="button" onClick={()=>go(c.center,'',12)}><span className="admin-map-dot shortage"/><span><strong>{c.place||'Район без названия'}</strong><small>{plural(c.unmet,'поиск','поиска','поисков')} без жилья · {c.supply?plural(c.supply,'объект','объекта','объектов'):'объектов нет'}</small></span></button></li>)}</ul>}</div>}
  <small>Объекты показаны с точностью до 1 км, поиски гостей только сотами, где искали несколько раз. Положение людей карта не показывает.</small>
 </section>;
}
