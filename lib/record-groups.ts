// Bookings and cleanings in the order a person looks for them: what is happening now, today, tomorrow,
// later, and what has passed (the most recent first). Kazakhstan keeps one time all year (UTC+5).
type Row=Record<string,any>;
const SHIFT=18000,DAY=86400;
export type RecordGroup='now'|'today'|'tomorrow'|'later'|'past';
export const recordGroupLabels:Record<RecordGroup,string>={now:'Сейчас',today:'Сегодня',tomorrow:'Завтра',later:'Позже',past:'Прошедшие'};
const order:RecordGroup[]=['now','today','tomorrow','later','past'];
export function recordGroup(item:Row,now:number):RecordGroup{
 const start=Number(item.start)||0,end=Number(item.end)||start,today=Math.floor((now+SHIFT)/DAY)*DAY-SHIFT;
 if(end<=now)return 'past';if(start<=now)return 'now';
 return start<today+DAY?'today':start<today+2*DAY?'tomorrow':'later';
}
// The same items, ordered by group and time, each knowing its group.
export function groupRecords<T extends Row>(items:T[],now:number):(T&{_group:RecordGroup})[]{
 return items.map(item=>({...item,_group:recordGroup(item,now)})).sort((a,b)=>order.indexOf(a._group)-order.indexOf(b._group)||(a._group==='past'?b.start-a.start:a.start-b.start));
}
