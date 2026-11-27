// Приглашения и промокоды (2026-11-27): what the app and the server both need about a code, without the database, so the
// mobile app can import it (lib/invites.ts keeps the rules).
export const INVITE_DAYS=30;
// At most this many friends' months in a year for the one who invites (offer, п. 5.6).
export const INVITER_YEAR_CAP=6;
export const INVITE_CODE=/^[A-Z0-9]{4,24}$/;
export const normalizeInviteCode=(value:unknown)=>String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');
export const inviteLink=(base:string,code:string)=>base.replace(/\/+$/,'')+'/i/'+encodeURIComponent(code);

// A link to the code: aiarenda://invite/<code> from the page of the link, or the page itself (https://<the same site>/i/<code>).
export function readInviteLink(value:unknown,base:string):string|null{
 const raw=String(value||'').trim();if(!raw)return null;
 let path='';
 const app=/^aiarenda:\/\/invite\/([^?#]+)/i.exec(raw);
 if(app)path=app[1];
 else{
  let url:URL,home:URL;try{url=new URL(raw);home=new URL(base);}catch{return null;}
  if(url.origin!==home.origin)return null;
  const m=/^\/i\/([^/?#]+)\/?$/.exec(url.pathname);if(!m)return null;
  path=m[1];
 }
 let code='';try{code=normalizeInviteCode(decodeURIComponent(path));}catch{return null;}
 return INVITE_CODE.test(code)?code:null;
}

// A friend's code from the name: the first word in Latin letters (up to 8) and three digits, «DULAT482».
const LATIN:Record<string,string>={а:'a',ә:'a',б:'b',в:'v',г:'g',ғ:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',қ:'k',л:'l',м:'m',н:'n',ң:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ұ:'u',ү:'u',ф:'f',х:'h',һ:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',і:'i',ь:'',э:'e',ю:'yu',я:'ya'};
export function codeStem(name:unknown){
 const word=String(name||'').trim().split(/\s+/)[0]||'';
 const latin=[...word.toLowerCase()].map(c=>LATIN[c]??c).join('').toUpperCase().replace(/[^A-Z]/g,'').slice(0,8);
 return latin.length>=2?latin:'AQ';
}
