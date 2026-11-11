export const defaultGuestPath='/workspace/guest/map';
export function safeEntryReturn(value:unknown){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.length>2000)return defaultGuestPath;
 try{
  const url=new URL(value,'https://arenda.local');
  if(url.origin!=='https://arenda.local')return defaultGuestPath;
  if(url.pathname!=='/admin'&&!/^\/workspace\/(guest|owner|cleaner)\/(map|overview|catalog|properties|bookings|cleaning|jobs|assignments|calendar|assistant|chats|operations|settings|account)$/.test(url.pathname)&&!/^\/join\/(guest|owner|cleaner)$/.test(url.pathname))return defaultGuestPath;
  return url.pathname+url.search;
 }catch{return defaultGuestPath;}
}
export function entryDestination(value:unknown,platformAdmin=false){return !value&&platformAdmin?'/admin':safeEntryReturn(value);}
export function bookingEntryPath(propertyId:string,values:Record<string,string>={}){
 const query=new URLSearchParams({book:propertyId});
 for(const key of ['city','start','end','guests','mode'])if(values[key])query.set(key,values[key]);
 return '/workspace/guest/catalog?'+query.toString();
}
