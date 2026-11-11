// No offline cache: authenticated pages and API responses stay on the server.
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const path=/^\/workspace\/(guest|owner|cleaner)\/assistant$/.test(data.url)?data.url:'/';
 event.waitUntil(self.registration.showNotification('AI Аренда',{
  body:data.body==='Уведомления на этом устройстве работают.'?data.body:'В вашем кабинете есть новое событие. Откройте приложение, чтобы узнать подробности.',
  icon:'/brand-mark.png',badge:'/brand-mark.png',data:{url:path},tag:path,renotify:true
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const path=event.notification.data?.url;
 const target=new URL(/^\/workspace\/(guest|owner|cleaner)\/assistant$/.test(path)?path:'/',self.location.origin);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===target.origin&&'focus' in client){await client.navigate(target.href);return client.focus();}}
  return self.clients.openWindow(target.href);
 })());
});
