import {rows,epoch,type Row} from './operation-core';
import {publicPoint} from './map-workspace';
import {KIND_LABEL,classifyIssue} from './admin-issues';

// The live map of the AI administrator (stage 5 of the live map concept): the pulse of the city (what happened and what the AI did),
// problems as rings at their place, and «соты»: where guests looked for a place to stay and did not find one.
// Nobody's own position is shown. Everything sits at the approximate public point of a flat (the 1 km cell of the catalogue),
// and a guest's search point counts only inside a hexagon where at least SHORTAGE_MIN searches met.
// Pure parts are covered by tests/admin-map.test.mjs.
type Point=[number,number];
export const PULSE_HOURS=24,SHORTAGE_DAYS=14,SHORTAGE_MIN=2,HEX_METRES=1000,RESOLVED_SHOWN=3*3600;
const ZONE=5*3600;
const ok=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v));

// The start of today in Kazakhstan (UTC+5), for the day's counters.
export function dayStart(now:number){return Math.floor((now+ZONE)/86400)*86400-ZONE;}

// ---------- Соты ----------
export type ShortageCell={key:string;center:Point;polygon:Point[];unmet:number;supply:number;weight:number;place:string};
// Pointy-top hexagons of HEX_METRES around a reference latitude: locally the earth is flat enough for a city.
export function hexOf(p:Point,lat0:number,size=HEX_METRES){
 const k=Math.cos(lat0*Math.PI/180),x=p[0]*111320*k,y=p[1]*110540,fq=(Math.sqrt(3)/3*x-y/3)/size,fr=(2/3*y)/size,fs=-fq-fr;
 let q=Math.round(fq),r=Math.round(fr);const s=Math.round(fs),dq=Math.abs(q-fq),dr=Math.abs(r-fr),ds=Math.abs(s-fs);
 if(dq>dr&&dq>ds)q=-r-s;else if(dr>ds)r=-q-s;
 const cx=size*Math.sqrt(3)*(q+r/2),cy=size*1.5*r,toLonLat=(px:number,py:number):Point=>[Number((px/(111320*k)).toFixed(6)),Number((py/110540).toFixed(6))];
 return {key:q+':'+r,center:toLonLat(cx,cy),polygon:Array.from({length:7},(_,i)=>{const a=Math.PI/180*(60*(i%6)-30);return toLonLat(cx+size*Math.cos(a),cy+size*Math.sin(a));})};
}
// Searches that ended without a stay, gathered into hexagons, against the flats published there. A hexagon shows only
// from SHORTAGE_MIN searches, so a single guest is never pointed at. Busiest first; weight is the share of the busiest.
export function shortageCells(searches:{point:Point;place?:string}[],flats:Point[],size=HEX_METRES):ShortageCell[]{
 const valid=searches.filter(s=>ok(s.point));if(!valid.length)return [];
 const lat0=valid.reduce((sum,s)=>sum+s.point[1],0)/valid.length,cells=new Map<string,ShortageCell&{places:Map<string,number>}>();
 for(const s of valid){const h=hexOf(s.point,lat0,size);let c=cells.get(h.key);if(!c){c={...h,unmet:0,supply:0,weight:0,place:'',places:new Map()};cells.set(h.key,c);}c.unmet++;const place=String(s.place||'').trim();if(place)c.places.set(place,(c.places.get(place)||0)+1);}
 for(const f of flats.filter(ok)){const c=cells.get(hexOf(f,lat0,size).key);if(c)c.supply++;}
 const shown=[...cells.values()].filter(c=>c.unmet>=SHORTAGE_MIN),top=Math.max(0,...shown.map(c=>c.unmet));
 return shown.map(({places,...c})=>({...c,weight:Math.round(c.unmet/top*100)/100,place:[...places].sort((a,b)=>b[1]-a[1])[0]?.[0]||''}))
  .sort((a,b)=>b.unmet-a.unmet||a.supply-b.supply);
}
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
// The AI administrator's sentence about the busiest hexagon.
export function shortageText(cells:ShortageCell[],days=SHORTAGE_DAYS){
 const c=cells[0];if(!c)return 'За '+plural(days,'день','дня','дней')+' гости находили жильё везде, где искали.';
 const where=c.place?'В районе «'+c.place+'»':'В отмеченном районе';
 return where+' за '+plural(days,'день','дня','дней')+' '+plural(c.unmet,'поиск закончился','поиска закончились','поисков закончились')+' без жилья, а объектов там '+(c.supply?c.supply:'нет')+'. Здесь стоит искать владельцев.';
}

// ---------- Пульс ----------
export type PulseKind='ask'|'booking'|'cleaning'|'issue';
export type PulseEvent={id:string;kind:PulseKind;at:number;point:Point|null;place:string;text:string;ai:string};
const ASK_STATE:Record<string,string>={searching:'ждёт ответа владельцев',ready:'нашёл варианты',booking:'гость оформляет бронь',booked:'бронь оформлена',empty:'подходящего жилья нет',expired:'запрос истёк',cancelled:'гость отменил'};
const BOOKING_STATE:Record<string,string>={requested:'ждёт ответа владельца',confirmed:'подтверждена',completed:'гость выехал',cancelled:'отменена',rejected:'владелец отказал',expired:'истекла'};
// The latest step of a cleaning, with what the AI administrator did or waits for.
export function cleaningStep(j:Row):{at:number;ai:string}{
 const steps:[unknown,string][]=[[j.completed_at,'уборка принята, оплата исполнителю'],[j.submitted_at,'отчёт на приёмке'],[j.started_at,'уборка началась'],[j.created_at,j.status==='open'?'ищем исполнителя':'исполнитель назначен']];
 const [at,ai]=steps.map(([a,t])=>[Number(a)||0,t] as const).filter(([a])=>a>0).sort((a,b)=>b[0]-a[0])[0]||[0,''];
 return {at,ai};
}

// ---------- Проблемы ----------
export type ProblemTone='urgent'|'high'|'normal'|'resolved';
export type Problem={id:string;kind:'issue'|'overdue'|'unassigned';tone:ProblemTone;point:Point|null;place:string;title:string;text:string;since:number;deadline?:number;resolvedIn?:number;issueId?:string};
const RANK:Record<ProblemTone,number>={urgent:0,high:1,normal:2,resolved:3};
export function sortProblems(list:Problem[]){return [...list].sort((a,b)=>RANK[a.tone]-RANK[b.tone]||(a.deadline??a.since)-(b.deadline??b.since));}
export function minutesText(s:number){const m=Math.max(1,Math.round(s/60));return m<60?m+' мин':Math.floor(m/60)+' ч'+(m%60?' '+m%60+' мин':'');}
const ROLE_WORD:Record<string,string>={guest:'гость',owner:'владелец',cleaner:'исполнитель'};

// Everything the admin map shows, from the database.
export async function adminLiveMap(db:D1Database,now=epoch()){
 const since=now-PULSE_HOURS*3600,today=dayStart(now);
 // Every flat once: its public point, its place and title. A point counts only for the address it was set for.
 const flats=await rows(db,"SELECT p.id,p.title,p.city,p.district,p.published,l.longitude,l.latitude,l.source,CASE WHEN l.address_fingerprint=p.city||'|'||p.district||'|'||p.address THEN 1 ELSE 0 END current FROM properties p LEFT JOIN property_locations l ON l.property_id=p.id WHERE p.demo_owner IS NULL");
 const flat=new Map<string,{point:Point|null;place:string;title:string;city:string;published:boolean}>();
 for(const f of flats){const p=f.current&&f.longitude!==null?publicPoint(f):null;flat.set(String(f.id),{point:p?[Number(p.longitude.toFixed(3)),Number(p.latitude.toFixed(3))]:null,place:String(f.district||f.city||''),title:String(f.title||'Объект'),city:String(f.city||''),published:f.published===1||f.published===true});}
 const at=(id:unknown)=>flat.get(String(id));

 // Pulse: the day's requests, bookings, cleanings and issues, newest first.
 const asks=await rows(db,"SELECT r.id,r.status,r.filters,r.created_at,(SELECT o.property_id FROM matching_offers o WHERE o.request_id=r.id ORDER BY o.created_at,o.id LIMIT 1) first_offer FROM matching_requests r WHERE r.created_at>? ORDER BY r.created_at DESC LIMIT 60",since);
 const bookings=await rows(db,"SELECT b.id,b.status,b.property_id,b.created_at FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.demo_owner IS NULL AND b.created_at>? ORDER BY b.created_at DESC LIMIT 60",since);
 const jobs=await rows(db,"SELECT j.id,j.status,j.property_id,j.created_at,j.started_at,j.submitted_at,j.completed_at FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE p.demo_owner IS NULL AND MAX(j.created_at,COALESCE(j.started_at,0),COALESCE(j.submitted_at,0),COALESCE(j.completed_at,0))>? LIMIT 60",since);
 const issues=await rows(db,"SELECT i.id,i.property_id,i.description,i.opened_role,i.created_at FROM administrator_issues i WHERE i.created_at>? ORDER BY i.created_at DESC LIMIT 30",since);
 const events:PulseEvent[]=[];
 for(const r of asks){let f:Row={};try{f=JSON.parse(r.filters)||{};}catch{}const near=f.near&&ok([f.near.longitude,f.near.latitude])?[Number(f.near.longitude),Number(f.near.latitude)] as Point:null,offered=r.first_offer?at(r.first_offer):undefined;
  events.push({id:'ask:'+r.id+':'+r.status,kind:'ask',at:Number(r.created_at),point:near||offered?.point||null,place:String(f.district||f.city||offered?.place||''),text:'Запрос гостя',ai:ASK_STATE[r.status]||''});}
 for(const b of bookings){const p=at(b.property_id);events.push({id:'booking:'+b.id+':'+b.status,kind:'booking',at:Number(b.created_at),point:p?.point||null,place:p?.place||'',text:'Бронь',ai:BOOKING_STATE[b.status]||''});}
 for(const j of jobs){const p=at(j.property_id),step=cleaningStep(j);if(step.at>since)events.push({id:'cleaning:'+j.id+':'+step.at,kind:'cleaning',at:step.at,point:p?.point||null,place:p?.place||'',text:'Уборка',ai:step.ai});}
 for(const i of issues){const p=at(i.property_id),{kind,priority}=classifyIssue(String(i.description||''));events.push({id:'issue:'+i.id,kind:'issue',at:Number(i.created_at),point:p?.point||null,place:p?.place||'',text:'Есть проблема',ai:KIND_LABEL[kind]+(priority==='urgent'?', срочно':'')});}
 events.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
 const day=events.filter(e=>e.at>=today),resolvedToday=await rows(db,"SELECT t.assigned_to FROM administrator_issues i LEFT JOIN operator_tickets t ON t.issue_id=i.id WHERE i.status='resolved' AND i.resolved_at>=?",today);
 const count=(k:PulseKind)=>day.filter(e=>e.kind===k).length;
 const pulse={events:events.slice(0,40),today:{asks:count('ask'),bookings:count('booking'),cleanings:count('cleaning'),issues:count('issue'),resolved:resolvedToday.length,withoutAdmin:resolvedToday.filter(r=>!r.assigned_to).length}};

 // Problems: open issues by urgency, late or unattended cleanings, and the issues solved in the last hours.
 const problems:Problem[]=[];
 for(const i of await rows(db,"SELECT i.id,i.property_id,i.description,i.opened_role,i.status,i.created_at,i.resolved_at,t.priority,t.deadline,t.assigned_to FROM administrator_issues i LEFT JOIN operator_tickets t ON t.issue_id=i.id WHERE i.status<>'resolved' OR i.resolved_at>? ORDER BY i.created_at DESC LIMIT 40",now-RESOLVED_SHOWN)){
  const p=at(i.property_id),{kind,priority}=classifyIssue(String(i.description||'')),open=i.status!=='resolved';
  const tone:ProblemTone=open?((i.priority||priority) as ProblemTone):'resolved',deadline=open?Number(i.deadline)||undefined:undefined;
  const text=open?KIND_LABEL[kind]+' · пишет '+(ROLE_WORD[i.opened_role]||'участник')+(deadline?deadline>now?' · ответ в течение '+minutesText(deadline-now):' · срок ответа прошёл':''):'Решено за '+minutesText(Number(i.resolved_at)-Number(i.created_at));
  problems.push({id:'issue:'+i.id,issueId:String(i.id),kind:'issue',tone,point:p?.point||null,place:p?.place||'',title:p?.title||'Объект',text,since:Number(i.created_at),deadline,resolvedIn:open?undefined:Number(i.resolved_at)-Number(i.created_at)});
 }
 for(const j of await rows(db,"SELECT j.id,j.property_id,j.status,j.start,j.end FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE p.demo_owner IS NULL AND ((j.status IN ('assigned','in_progress') AND j.end<?) OR (j.status='open' AND j.start<? AND j.end>?)) LIMIT 30",now,now+3600,now)){
  const p=at(j.property_id),late=j.status!=='open';
  problems.push({id:'job:'+j.id,kind:late?'overdue':'unassigned',tone:late?'high':Number(j.start)<=now?'high':'normal',point:p?.point||null,place:p?.place||'',title:p?.title||'Объект',text:late?'Уборка просрочена на '+minutesText(now-Number(j.end)):Number(j.start)<=now?'Нет исполнителя, уборка уже должна идти':'Нет исполнителя, начало через '+minutesText(Number(j.start)-now),since:late?Number(j.end):Number(j.start)});
 }

 // Соты: searches of the last two weeks that ended without a stay. The point is the guest's chosen zone (already rounded
 // to 0.01°) or the middle of the asked district's flats; searches with neither are not placed.
 const middle=new Map<string,Point>();{const sums=new Map<string,[number,number,number]>();for(const f of flat.values())if(f.point){const k=(f.city+'|'+f.place).toLocaleLowerCase('ru'),s=sums.get(k)||[0,0,0];sums.set(k,[s[0]+f.point[0],s[1]+f.point[1],s[2]+1]);}for(const [k,[x,y,n]] of sums)middle.set(k,[x/n,y/n]);}
 const searches:{point:Point;place?:string}[]=[];
 for(const r of await rows(db,"SELECT r.filters FROM matching_requests r WHERE r.created_at>? AND r.status IN ('empty','expired','cancelled') AND r.booking_id IS NULL LIMIT 2000",now-SHORTAGE_DAYS*86400)){
  let f:Row={};try{f=JSON.parse(r.filters)||{};}catch{continue;}
  const near=f.near&&ok([f.near.longitude,f.near.latitude])?[Number(f.near.longitude),Number(f.near.latitude)] as Point:null,district=String(f.district||'').trim();
  const point=near||(district?middle.get((String(f.city||'')+'|'+district).toLocaleLowerCase('ru')):undefined);if(point)searches.push({point,place:district});
 }
 const cells=shortageCells(searches,[...flat.values()].filter(f=>f.published&&f.point).map(f=>f.point!));
 return {pulse,problems:sortProblems(problems),shortage:{cells:cells.slice(0,40),days:SHORTAGE_DAYS,text:shortageText(cells)},serverTime:now};
}
