// Cleanings in the app in tabs, like «Мои брони» (lib/booking-filters.ts).
// Owner («Уборки»): «Ищем» (no performer yet), at work (taken, going on, waiting for acceptance or for the owner to pay), finished.
// Performer («Мои задания»): ahead (taken or applied for), done, cancelled (or the response was turned down).
// A cleaning the owner still has to pay for (the fee after acceptance, a late-cancellation fee) stays «В работе».
type Row=Record<string,any>;
export type OwnerJobTab='need'|'work'|'done';
export type CleanerJobTab='ahead'|'done'|'cancelled';
export const ownerJobTabs:{id:OwnerJobTab;label:string}[]=[{id:'need',label:'Ищем'},{id:'work',label:'В работе'},{id:'done',label:'Готовые'}];
export const cleanerJobTabs:{id:CleanerJobTab;label:string}[]=[{id:'ahead',label:'Предстоящие'},{id:'done',label:'Выполненные'},{id:'cancelled',label:'Отменённые'}];
const owed=(j:Row)=>j.status==='completed'&&!!j.assigned_to&&j.assigned_to!==j.owner_id&&Number(j.fee)>(Number(j.settlement_paid)||0)
 ||j.status==='cancelled'&&Number(j.cancel_fee)>(Number(j.settlement_paid)||0);
export function ownerJobTab(j:Row):OwnerJobTab{
 if(j.status==='open'&&!j.assigned_to)return 'need';
 if(['open','assigned','in_progress','submitted'].includes(j.status)||owed(j))return 'work';
 return 'done';
}
export function cleanerJobTab(j:Row,userId:string,application?:Row):CleanerJobTab{
 if(j.assigned_to===userId){
  if(j.status==='completed')return 'done';
  if(j.status==='cancelled')return 'cancelled';
  return 'ahead';
 }
 // Only applied: waiting for the owner while the cleaning is open; otherwise it went to someone else or was cancelled.
 if(application&&application.status!=='rejected'&&j.status==='open')return 'ahead';
 return 'cancelled';
}
export function tabCounts<T extends string>(tabs:{id:T}[],items:Row[],tabOf:(item:Row)=>T):Record<T,number>{
 const counts=Object.fromEntries(tabs.map(t=>[t.id,0])) as Record<T,number>;
 for(const item of items)counts[tabOf(item)]++;
 return counts;
}
// The tab to open first: the first one that is not empty, or else the first.
export function firstTab<T extends string>(tabs:{id:T}[],counts:Record<T,number>):T{
 return (tabs.find(t=>counts[t.id]>0)||tabs[0]).id;
}
