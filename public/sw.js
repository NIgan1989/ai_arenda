// No offline cache: authenticated pages and API responses stay on the server.
const allowed=path=>/^\/workspace\/(guest|owner|cleaner)\/(assistant|map)$/.test(path)?path:'/';
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 // The AI administrator's price advice is answered right from the notification: two buttons, the owner's choice.
 if(data.kind==='price'&&data.decision&&typeof data.decision.id==='string'){
  const d=data.decision;
  event.waitUntil(self.registration.showNotification(String(data.title||'Совет по цене').slice(0,120),{
   body:String(data.body||'').slice(0,300),icon:'/brand-mark.png',badge:'/brand-mark.png',tag:'price-advice',renotify:true,requireInteraction:true,
   data:{url:'/workspace/owner/map',decision:{id:d.id,revision:d.revision}},
   actions:[{action:'accept',title:String(d.accept||'Принять').slice(0,40)},{action:'reject',title:String(d.reject||'Оставить').slice(0,40)}]
  }));
  return;
 }
 const path=allowed(data.url);
 event.waitUntil(self.registration.showNotification('AI Аренда',{
  body:data.body==='Уведомления на этом устройстве работают.'?data.body:'Есть новое событие. Откройте приложение, чтобы узнать подробности.',
  icon:'/brand-mark.png',badge:'/brand-mark.png',data:{url:path},tag:path,renotify:true
 }));
});
async function openApp(path){
 const target=new URL(allowed(path),self.location.origin);
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(new URL(client.url).origin===target.origin&&'focus' in client){await client.navigate(target.href);return client.focus();}}
 return self.clients.openWindow(target.href);
}
// The answer goes through the same server check as the button in the app; if it fails, the app opens on the card.
async function decide(decision,action){
 try{
  const r=await fetch('/api/approvals',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Workspace-Role':'owner'},body:JSON.stringify({id:decision.id,revision:decision.revision,action})});
  const v=await r.json().catch(()=>({}));
  if(!r.ok)return openApp('/workspace/owner/map');
  return self.registration.showNotification(action==='accept'?'Цена обновлена':'Цена осталась прежней',{body:String(v.message||'').slice(0,300),icon:'/brand-mark.png',badge:'/brand-mark.png',tag:'price-advice',data:{url:'/workspace/owner/map'}});
 }catch{return openApp('/workspace/owner/map');}
}
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const data=event.notification.data||{};
 if(data.decision&&(event.action==='accept'||event.action==='reject')){event.waitUntil(decide(data.decision,event.action));return;}
 event.waitUntil(openApp(data.url));
});
