export const defaultGuestPath='/workspace/guest/overview';
export function safeEntryReturn(value:unknown){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.length>2000)return defaultGuestPath;
 try{
  const url=new URL(value,'https://arenda.local');
  if(url.origin!=='https://arenda.local')return defaultGuestPath;
  if(!/^\/workspace\/(guest|owner|cleaner)\/(overview|catalog|properties|bookings|cleaning|jobs|assignments|calendar|assistant|settings|account)$/.test(url.pathname)&&!/^\/join\/(guest|owner|cleaner)$/.test(url.pathname))return defaultGuestPath;
  return url.pathname+url.search;
 }catch{return defaultGuestPath;}
}
export function bookingEntryPath(propertyId:string,values:Record<string,string>={}){
 const query=new URLSearchParams({book:propertyId});
 for(const key of ['city','start','end','guests','mode'])if(values[key])query.set(key,values[key]);
 return '/workspace/guest/catalog?'+query.toString();
}
