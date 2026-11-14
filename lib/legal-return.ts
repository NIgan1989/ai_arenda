// A document opened from a screen of the service returns to that screen, not to the map.
// «from» is a path on this site, or «app» when the native app opened the document in the browser.
export const APP_RETURN='aiarenda://';
export function legalReturn(value?:unknown){
 const from=typeof value==='string'?value:'';
 if(from==='app')return {href:APP_RETURN,label:'В приложение'};
 if(from&&/^\/(?![/\\])[^\s\\]*$/.test(from)){
  try{const url=new URL(from,'https://x.invalid');const href=url.pathname+url.search+url.hash;if(url.origin==='https://x.invalid'&&/^\/(?![/\\])/.test(href)&&!/^\/(privacy|terms|data-deletion)(\/|$)/.test(url.pathname))return {href,label:'Назад'};}catch{}
 }
 return {href:'/',label:'На карту'};
}
// The link to a document carries where the person came from, and the tabs between documents keep it.
export function legalLink(path:string,from?:unknown){return typeof from==='string'&&from?path+(path.includes('?')?'&':'?')+'from='+encodeURIComponent(from):path;}
// Props of a link to a document opened in the same tab: the return point is read at the moment of the tap,
// so the screen of the menu the person is on (kept in the address) is where «Назад» brings them.
export function legalFromHere(path:string){return {href:path,onClick:(e:{currentTarget:{href:string}})=>{e.currentTarget.href=legalLink(path,window.location.pathname+window.location.search);}};}
