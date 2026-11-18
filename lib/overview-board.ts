// «Сводка» in the app (2026-11-18): three tabs instead of one long card. Each thing is in one tab only, as one short line.
// «Ждут вас»: what needs the person's answer — approvals they can decide and what the operations summary marks for attention
//   (a guest's request that already has its approval card is not said twice).
// «Сейчас»: what is going on — a stay or a cleaning under way, and a request waiting for the other side.
// «Скоро»: what is planned next (lib/operations.ts `upcoming`).
import type {OperationEvent} from './operations';
import {nowCardWhen} from './now-card';
type Row=Record<string,any>;
export type BoardTab='decide'|'now'|'soon';
export const boardTabs:{id:BoardTab;label:string}[]=[{id:'decide',label:'Ждут вас'},{id:'now',label:'Сейчас'},{id:'soon',label:'Скоро'}];
export type BoardItem={key:string;title:string;detail:string;when:string;urgent:boolean;entityKind?:'booking'|'job';entityId?:string;approval?:Row};
export function overviewBoard(workspace:Row|null|undefined,approvals:Row[],data:Row|null|undefined,now:number):Record<BoardTab,BoardItem[]>{
 const board:Record<BoardTab,BoardItem[]>={decide:[],now:[],soon:[]};
 const asked=new Set((approvals||[]).filter(a=>a.canDecide&&a.kind==='booking').map(a=>String(a.entityId)));
 for(const a of approvals||[]){
  const item:BoardItem={key:'approval:'+a.id,title:String(a.title||'Нужно решение'),detail:String(a.subject||''),when:a.expiresAt&&a.expiresAt>now?'ответить до '+nowCardWhen(a.expiresAt,now).replace(/^сегодня в /,''):'',urgent:!!a.canDecide,approval:a};
  (a.canDecide?board.decide:board.now).push(item);
 }
 const event=(e:OperationEvent):BoardItem=>({key:e.id,title:e.title,detail:e.detail,when:e.at?nowCardWhen(e.at,now):'',urgent:!!e.urgent,entityKind:e.kind,entityId:e.entityId});
 for(const e of (workspace?.attention||[]) as OperationEvent[]){
  if(e.kind==='booking'&&asked.has(String(e.entityId))&&e.title==='Подтвердить заявку')continue;
  board.decide.push(event(e));
 }
 const going=(e:OperationEvent)=>{
  if(e.kind==='job')return ['in_progress','submitted'].includes(String((data?.jobs||[]).find((j:Row)=>j.id===e.entityId)?.status));
  const b=(data?.bookings||[]).find((x:Row)=>x.id===e.entityId);
  return !!b&&b.status==='confirmed'&&Number(b.start)<=now&&Number(b.end)>now;
 };
 for(const e of (workspace?.upcoming||[]) as OperationEvent[])(going(e)?board.now:board.soon).push(event(e));
 return board;
}
