type Row=Record<string,any>;
export function duration(seconds:number){
 const n=Math.max(0,Math.floor(seconds)),days=Math.floor(n/86400),hours=Math.floor(n%86400/3600),minutes=Math.floor(n%3600/60),rest=n%60;
 return (days?days+' д. ':'')+[hours,minutes,rest].map(v=>String(v).padStart(2,'0')).join(':');
}
// The agreed end remains the deadline; a late start never silently extends a stay or cleaning.
export function activity(kind:'booking'|'job',item:Row,t:number){
 const started=kind==='booking'?item.terms?.actual_checkin:item.started_at;
 const stopped=kind==='booking'?item.terms?.actual_checkout:item.submitted_at;
 const finished=kind==='booking'?item.status==='completed':['submitted','completed'].includes(item.status);
 if(['cancelled','expired','requested','open'].includes(item.status))return null;
 const deadline=Number(item.end),elapsed=started?Math.max(0,(stopped||t)-started):null;
 const phase=finished?'stopped':!started?'waiting':t>=deadline?'overdue':'running';
 return {kind,phase,started:started||null,stopped:stopped||null,deadline,elapsed,
  seconds:phase==='stopped'?elapsed:Math.abs(deadline-t),
  label:phase==='stopped'?(kind==='booking'?'Проживание завершено':item.status==='submitted'?'Отчёт на проверке':'Уборка принята'):phase==='waiting'?(kind==='booking'?'Ожидаем заселения':item.status==='in_progress'?'Начало не зафиксировано':'Ожидаем начала уборки'):phase==='overdue'?'Просрочено':kind==='booking'?'До выезда':'До окончания уборки',
  progress:started?Math.min(1,Math.max(0,((stopped||t)-started)/Math.max(1,deadline-started))):0};
}
