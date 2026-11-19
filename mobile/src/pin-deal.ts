// What a pin says beyond its label. Pure functions, covered by mobile/tests/pin-deal.test.mjs.
// act: the step that waits for the person themselves, as a small tag under the pin («Проверить уборку · 45 мин»);
// a tap on it opens the card of that booking or cleaning at once. chain: the deal of the place as one line of stages
// on the pin (Заявка, Оплата, Проживание, Уборка, Готово), so one place tells the whole story from request to «Готово ✓».
// Both are read from the threads of the autopilot (lib/process-threads.ts): the map and the sheet never disagree.
import {bookingThread,cleaningThread,threadWhen,THREAD_BY,type ProcessThread,type ThreadState,type ThreadStep} from '../../lib/process-threads';
import {wordsOf} from '../../lib/stay-words';

type Row=Record<string,any>;
// why: the reason with its numbers, a second line of the tag («До заезда 45 мин · уборка займёт 50 мин»).
export type PinAct={label:string;why?:string;kind:'booking'|'job';id:string;urgent:boolean};
export type ChainState='done'|'now'|'wait';
export type PinChain={states:ChainState[];progress?:number};

// «45 мин», «1,5 ч»: the time left, short enough for a tag. Nothing when it is over or more than three hours away.
const SOON=3*3600,HOT=3600;
export function leftShort(seconds:number){
 if(!(seconds>0)||seconds>SOON)return '';
 const m=Math.max(1,Math.round(seconds/60));
 return m<60?m+' мин':String(Math.round(m/30)/2).replace('.',',')+' ч';
}

// The next arrival at the place: a confirmed booking nobody has checked into yet. A cleaning must be accepted before it.
export function nextArrival(data:Row|null|undefined,propertyId:unknown,after:number){
 const starts=((data?.bookings||[]) as Row[]).filter(b=>b.property_id===propertyId&&b.status==='confirmed'&&!b.terms?.actual_checkin&&Number(b.start)>=after).map(b=>Number(b.start));
 return starts.length?Math.min(...starts):0;
}

type Verb={label:string;until?:number};
// The words of the step that waits for the person, by role, and the moment it is due (if any).
function verb(role:'owner'|'cleaner'|'guest',t:ProcessThread,data:Row,now:number):Verb|null{
 const step=t.steps[t.current],key=step?.key;
 if(role==='owner'){
  if(t.tag==='Возврат')return {label:'Вернуть деньги'};
  if(t.kind==='booking'){
   const b=((data.bookings||[]) as Row[]).find(x=>x.id===t.id)||{};
   if(key==='request')return {label:'Ответить на заявку',until:Number(b.start)||0};
   if(key==='pay')return {label:'Проверить оплату',until:Number(b.start)||0};
   if(key==='checkout')return {label:'Подтвердить '+wordsOf(b).leaveLow,until:Number(b.end)||0};
   if(key==='deposit')return {label:'Вернуть депозит'};
   return null;
  }
  const j=((data.jobs||[]) as Row[]).find(x=>x.id===t.id)||{};
  if(key==='pick')return {label:step.label==='Срок прошёл'?'Решить с уборкой':'Выбрать исполнителя',until:Number(j.start)||0};
  if(key==='check')return {label:'Проверить уборку',until:nextArrival(data,j.property_id,Number(j.start)||0)};
  if(key==='pay')return {label:'Оплатить уборку'};
  return null;
 }
 if(role==='guest'){
  const b=((data.bookings||[]) as Row[]).find(x=>x.id===t.id)||{},w=wordsOf(b);
  if(t.finished)return {label:w.rateBtn==='Оценить проживание'?'Оценить':w.rateBtn};
  if(key==='pay')return {label:'Оплатить',until:Number(b.start)||0};
  if(key==='checkin')return {label:w.arrive==='Заезд'?'Заселиться':'Отметить '+w.arriveLow};
  if(key==='checkout')return {label:'Сообщить '+w.ofLeave,until:Number(b.end)||0};
  return null;
 }
 const j=((data.jobs||[]) as Row[]).find(x=>x.id===t.id)||{};
 if(key==='checkout')return {label:j.on_way_at?'Я на месте':'Выехать на уборку',until:Number(j.start)||0};
 if(key==='clean')return j.status==='in_progress'?{label:'Отправить отчёт',until:Number(j.end)||0}:{label:'Начать уборку',until:Number(j.start)||0};
 if(key==='pay')return {label:'Подтвердить оплату'};
 return null;
}

// The tag of one thread that waits for the person, or nothing when the step is somebody else's.
export function threadAct(role:'owner'|'cleaner'|'guest',t:ProcessThread,data:Row,now:number):(PinAct&{until:number;verb:string})|null{
 if(!t.yours)return null;
 const v=verb(role,t,data,now);if(!v)return null;
 const until=v.until||0,left=until?until-now:0,short=leftShort(left);
 return {label:v.label+(short?' · '+short:''),verb:v.label,kind:t.kind,id:t.id,urgent:!!until&&left<=HOT,until};
}

// One tag a pin: of all the steps that wait for the person at this place, the one that is due first; those without a time come last.
export function pinAct(role:'owner'|'cleaner'|'guest',threads:ProcessThread[],data:Row|null|undefined,now:number,match:(t:ProcessThread)=>boolean):PinAct|null{
 if(!data)return null;
 const acts=threads.filter(match).map(t=>threadAct(role,t,data,now)).filter(Boolean) as (PinAct&{until:number;verb:string})[];
 if(!acts.length)return null;
 acts.sort((a,b)=>(a.until||Infinity)-(b.until||Infinity));
 const {until:_until,verb:_verb,...act}=acts[0];
 return act;
}

// The stages of a thread as they stand on a pin.
const mark=(s:ThreadState):ChainState=>s==='done'?'done':s==='now'||s==='next'?'now':'wait';
export function threadChain(t:ProcessThread):PinChain{
 const now=t.steps[t.current];
 return {states:t.steps.map(s=>t.finished?'done':mark(s.state)),...(typeof now?.progress==='number'&&!t.finished?{progress:now.progress}:{})};
}

// ---------- The deal of a place, for its owner ----------
// A booking and the cleaning after it are one deal: Заявка → Оплата → Проживание → Уборка → Готово.
// history: every step of both threads with its time and who did it, for «История сделки» in the card of the place.
export type DealStage={key:string;label:string;state:ChainState;progress?:number};
export type DealStep={key:string;label:string;note:string;by:string;at?:number;state:ThreadState;open:{kind:'booking'|'job';id:string}};
export type Deal={id:string;title:string;stages:DealStage[];history:DealStep[];finished:boolean;line:string;open:{kind:'booking'|'job';id:string}};
const RECENT=6*3600;
const stage=(key:string,label:string,steps:ThreadStep[],closed:boolean):DealStage=>{
 const done=closed||steps.every(s=>s.state==='done'),live=steps.find(s=>s.state==='now'||s.state==='next'),started=steps.some(s=>s.state==='done');
 return {key,label,state:done?'done':live||started?'now':'wait',...(!done&&typeof live?.progress==='number'?{progress:live.progress}:{})};
};
const told=(t:ProcessThread):DealStep[]=>t.steps.map(s=>({key:t.kind+':'+s.key,label:s.label,note:s.note||s.label,by:THREAD_BY[s.by],at:s.at,state:t.finished?'done':s.state,open:{kind:t.kind,id:t.id}}));

export function ownerDeal(data:Row|null|undefined,propertyId:unknown,now:number):Deal|null{
 const userId=data?.user?.id;if(!userId)return null;
 const jobs=((data!.jobs||[]) as Row[]).filter(j=>j.property_id===propertyId&&j.owner_id===userId&&j.status!=='cancelled');
 const deals=((data!.bookings||[]) as Row[]).filter(b=>b.property_id===propertyId&&b.owner_id===userId&&['requested','confirmed','completed'].includes(b.status)).map(b=>{
  const stay=bookingThread(b,data!,now),job=jobs.filter(j=>j.booking_id===b.id).sort((x,y)=>Number(y.start)-Number(x.start))[0],clean=job?cleaningThread(job,data!,now):null;
  // The place is ready when the cleaning is accepted; paying the performer is the owner's own step after that.
  const accepted=!!job&&job.status==='completed',finished=stay.finished&&(!clean||accepted);
  const closed=Math.max(Number(b.terms?.actual_checkout)||Number(b.end)||0,Number(job?.completed_at)||0);
  return {b,stay,clean,accepted,finished,closed};
 });
 // The deal under way wins, the earliest first; then the one that has just come to «Готово», for six hours.
 const live=deals.filter(d=>!d.finished).sort((x,y)=>Number(x.b.start)-Number(y.b.start))[0];
 const last=deals.filter(d=>d.finished&&d.closed>now-RECENT).sort((x,y)=>y.closed-x.closed)[0];
 const d=live||last;
 if(!d){
  // No booking: a cleaning ordered by itself (a private home, the owner's own order) is a deal of its own.
  const alone=jobs.filter(j=>j.booking_id===null).map(j=>({j,t:cleaningThread(j,data!,now)})).filter(({j,t})=>!t.finished?Number(j.start)<now+3*86400:Number(j.completed_at||j.end)>now-RECENT).sort((x,y)=>Number(x.t.finished)-Number(y.t.finished)||Number(x.j.start)-Number(y.j.start))[0];
  if(!alone)return null;
  const t=alone.t,accepted=alone.j.status==='completed';
  return {id:t.id,title:t.title,stages:[stage('pick','Подбор',t.steps.slice(0,1),accepted),stage('clean','Уборка',t.steps.slice(1,3),accepted),stage('check','Приёмка',t.steps.slice(3,4),accepted),{key:'ready',label:'Готово',state:accepted?'done':'wait'}],history:told(t),finished:accepted,line:accepted?'Уборка принята':t.line,open:{kind:'job',id:t.id}};
 }
 const w=wordsOf(d.b),s=d.stay.steps,c=d.clean?.steps||[];
 const stages:DealStage[]=[stage('request','Заявка',s.slice(0,1),d.finished),stage('pay','Оплата',s.slice(1,2),d.finished),stage('stay',w.stay,s.slice(2,5),d.finished)];
 if(d.clean)stages.push(stage('clean','Уборка',c.slice(0,4),d.accepted));
 stages.push({key:'ready',label:'Готово',state:d.finished?'done':'wait'});
 // One stage is «now» at a time: the first that is not done. A cleaning that is being picked while the guest still lives waits its turn on the line.
 let seen=false;
 for(const st of stages){if(st.state==='done')continue;if(seen){st.state='wait';delete st.progress;}else{seen=true;if(st.state==='wait'&&st.key!=='ready')st.state='now';}}
 const current=!d.stay.finished?d.stay:d.clean&&!d.accepted?d.clean:d.stay;
 return {id:d.b.id,title:d.b.title||'Бронь',stages,history:[...told(d.stay),...(d.clean?told(d.clean):[])],finished:d.finished,line:d.finished?w.ready+' · сделка закрыта':current.line,open:{kind:current.kind,id:current.id}};
}
export function dealChain(deal:Deal):PinChain{
 const now=deal.stages.find(s=>s.state==='now');
 return {states:deal.stages.map(s=>s.state),...(typeof now?.progress==='number'?{progress:now.progress}:{})};
}
// «Заявка 14:02» for a step of the history: only what has happened or is happening has a time.
export function stepWhen(step:DealStep,now:number){return step.at&&(step.state==='done'||step.state==='now')&&step.at<=now?threadWhen(step.at,now):step.at&&step.at>now&&(step.state==='next'||step.state==='now')?threadWhen(step.at,now):'';}

// ---------- The margin before the next arrival, for the owner ----------
// What will be ready by the time the next guest comes: the time left to the arrival against what the cleaning still needs.
// It is counted again on every refresh, so a departure, an assignment, a delay and the start of the work all move it.
// need: the cleaning that is left (its whole window before it starts, the time to its deadline once it runs) plus a quarter of an
// hour to accept the report. decide: the owner has something to do or to watch: a report to accept, nobody assigned, a cleaning
// that does not fit, or an arrival within the hour (the pin is red then, owner-map.ts). A cleaning in time and in hands is not shown.
export const MARGIN_AHEAD=6*3600,ACCEPT_BUFFER=900;
export type Margin={jobId:string;status:string;left:number;need:number;tight:boolean;decide:boolean;verb:string;reason:string;why:string};
const span=(seconds:number)=>{const m=Math.max(1,Math.round(seconds/60));return m<60?m+' мин':String(Math.round(m/30)/2).replace('.',',')+' ч';};
export function ownerMargin(data:Row|null|undefined,propertyId:unknown,now:number):Margin|null{
 const userId=data?.user?.id;if(!userId)return null;
 const jobs=((data!.jobs||[]) as Row[]).filter(j=>j.property_id===propertyId&&j.owner_id===userId&&['open','assigned','in_progress','submitted'].includes(j.status)).sort((a,b)=>Number(a.start)-Number(b.start));
 for(const j of jobs){
  const arrival=nextArrival(data,propertyId,Number(j.start)||0);
  if(!arrival||arrival-now>MARGIN_AHEAD)continue;
  const left=arrival-now,window=Math.max(0,Number(j.end)-Number(j.start));
  const out=j.booking_id===null||!!j.checkout_confirmed,taken=!!j.assigned_to&&j.status!=='open';
  const work=j.status==='submitted'?0:j.status==='in_progress'?Math.max(0,Number(j.end)-now):window;
  const need=work+ACCEPT_BUFFER,tight=left<need,near=left<=HOT;
  const [verb,reason,decide]:[string,string,boolean]=
   j.status==='submitted'?['Проверить уборку','отчёт ждёт приёмки',true]
   :!taken?['Найти исполнителя','исполнитель не назначен',true]
   :!out?['Подтвердить выезд','гость ещё не выехал',tight||near]
   :j.status==='in_progress'?[tight?'Уборка не успевает':'Следить за уборкой',work>0?'уборке осталось '+span(work):'срок уборки вышел',tight||near]
   :[tight?'Уборка не успевает':'Следить за уборкой','уборка займёт '+span(work),tight||near];
  return {jobId:String(j.id),status:taken?String(j.status):'open',left,need,tight,decide,verb,reason,why:(left>0?'До заезда '+span(left):'Заезд уже начался')+' · '+reason};
 }
 return null;
}
// The margin is back: a performer is assigned, the cleaning fits and nothing is asked of the owner. The calm pin says so
// with the minutes to spare («Назначено · запас 7 мин»); «Готово ✓» comes only when the cleaning is accepted.
export function marginLabel(m:Margin|null){return m&&!m.decide&&m.status==='assigned'&&m.left>m.need?'Назначено · запас '+span(m.left-m.need):'';}
// The tag of the owner's pin: where the next arrival is at stake, the margin with its reason; otherwise the step that waits for the owner.
export function ownerPinAct(threads:ProcessThread[],data:Row|null|undefined,propertyId:unknown,now:number):PinAct|null{
 const m=ownerMargin(data,propertyId,now);
 if(m?.decide)return {label:m.verb,why:m.why,kind:'job',id:m.jobId,urgent:m.tight||m.left<=HOT};
 return pinAct('owner',threads,data,now,t=>t.propertyId===propertyId);
}
// «Требуют внимания»: the pins with a tag, the urgent ones first; next() walks them round, one tap one place.
export function attention<P extends {key:string;act?:PinAct}>(pins:P[]):string[]{
 return pins.filter(p=>p.act).sort((a,b)=>Number(b.act!.urgent)-Number(a.act!.urgent)).map(p=>p.key);
}
export function nextAttention(keys:string[],current:string){return keys.length?keys[(keys.indexOf(current)+1)%keys.length]:'';}
