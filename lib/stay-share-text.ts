// «Поделиться жильём» (2026-11-27): a guest sends one place to a friend in WhatsApp or Telegram.
// The link carries only the place and, if the guest chose them, the dates and the number of guests.
// It never carries the address, the owner or anything of the guest who sent it.
// No database code here: the phone app builds the same message and link.
export const SHARE_ID=/^[A-Za-z0-9_-]{1,100}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;

export type ShareStay={start:string;end:string;guests:number};
export type ShareCard={id:string;title:string;city:string;district:string;price:number;unit:'day'|'hour'|'';photo:string;rating:{average:number;count:number}|null};

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g,' ')+' ₸';
const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayOf=(iso:string)=>{const [,m,d]=iso.split('-').map(Number);return {d,m};};

// The dates in words: «27–28 ноября», «30 ноября – 2 декабря».
export function shareDates(stay:ShareStay|null){
 if(!stay)return '';
 const a=dayOf(stay.start),b=dayOf(stay.end);
 return a.m===b.m?`${a.d}–${b.d} ${months[a.m-1]}`:`${a.d} ${months[a.m-1]} – ${b.d} ${months[b.m-1]}`;
}

// ?d=2026-11-27~2026-11-28&g=2 — a stay only when both days are real, in order and at most 60 nights apart.
export function readShareStay(params:URLSearchParams):ShareStay|null{
 const [start,end]=String(params.get('d')||'').split('~');
 if(!DAY.test(start||'')||!DAY.test(end||''))return null;
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>60*86400000)return null;
 const guests=Math.min(50,Math.max(1,Math.floor(Number(params.get('g'))||1)));
 return {start,end,guests};
}

export function shareLink(base:string,id:string,stay?:ShareStay|null){
 const url=new URL('/s/'+encodeURIComponent(id),base);
 if(stay){url.searchParams.set('d',stay.start+'~'+stay.end);if(stay.guests>1)url.searchParams.set('g',String(stay.guests));}
 return url.toString().replace('%7E','~');
}

// The one line under the title, the same in the message and on the page: «18 000 ₸ за сутки · Павлодар».
export function sharePriceLine(card:Pick<ShareCard,'price'|'unit'|'city'>){
 const price=card.price>0&&card.unit?money(card.price)+(card.unit==='hour'?' за час':' за сутки'):'';
 return [price,card.city].filter(Boolean).join(' · ');
}

export function shareMessage(card:Pick<ShareCard,'title'|'price'|'unit'|'city'>,link:string,stay?:ShareStay|null){
 return [card.title,[sharePriceLine(card),shareDates(stay||null)].filter(Boolean).join(' · '),link].filter(Boolean).join('\n');
}


// A link from a friend as the app receives it: aiarenda://stay/<id> from the page, or the page's own https address
// of this server. Anything else is not a shared place.
export function readStayLink(value:unknown,base:string):{id:string;stay:ShareStay|null}|null{
 if(typeof value!=='string'||value.length>500)return null;
 let url:URL;try{url=new URL(value);}catch{return null;}
 let id='';
 try{
  if(url.protocol==='aiarenda:'&&url.hostname==='stay')id=decodeURIComponent(url.pathname.replace(/^\//,''));
  else if(url.protocol==='https:'&&url.origin===new URL(base).origin&&/^\/s\/[^/]+$/.test(url.pathname))id=decodeURIComponent(url.pathname.slice(3));
 }catch{return null;}
 if(!SHARE_ID.test(id)||url.username||url.password)return null;
 return {id,stay:readShareStay(url.searchParams)};
}
