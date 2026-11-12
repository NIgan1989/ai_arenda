type Row=Record<string,any>;
export function calendarEvents(data:Row,role:string,property:string,now:number){
 const stays=(data.bookings||[]).filter((b:Row)=>['confirmed','requested','completed'].includes(b.status)&&(!property||b.property_id===property)).map((b:Row)=>({id:'booking:'+b.id,title:b.title+(b.status==='confirmed'&&!b.terms?.actual_checkout&&b.end<now?' · выезд требует проверки':''),start:new Date(b.start*1000).toISOString(),end:new Date((b.terms?.actual_checkout||(b.status==='confirmed'?Math.max(b.end,now+60):b.end))*1000).toISOString(),color:b.status==='requested'?'#7c3aed':b.status==='completed'?'#6e758c':'#4f46e5',extendedProps:{kind:'booking',entityId:b.id}}));
 const jobs=(role==='guest'?[]:data.jobs||[]).filter((j:Row)=>j.status!=='cancelled'&&(!property||j.property_id===property)&&(role!=='cleaner'||j.assigned_to===data.user?.id)).map((j:Row)=>({id:'job:'+j.id,title:'Уборка · '+j.title,start:new Date(j.start*1000).toISOString(),end:new Date((j.status==='completed'?j.end:Math.max(j.end,now+60))*1000).toISOString(),color:j.status==='completed'?'#6e758c':'#0891b2',extendedProps:{kind:'job',entityId:j.id}}));
 return [...stays,...jobs];
}
