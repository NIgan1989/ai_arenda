// The screen of the menu that is open lives in the address (?menu=safety), so a document opened from it,
// a reload or the browser's «Назад» bring the person back to the same screen, not to the top of the menu.
const VIEWS=/^(profile|trust|plan|journal|settings|safety(:(devices|ai|delete|reports|requests))?)$/;
export function menuFromSearch(search:string){const v=new URLSearchParams(search).get('menu')||'';return VIEWS.test(v)?v:'';}
export function searchWithMenu(search:string,view:string){const q=new URLSearchParams(search);if(view&&VIEWS.test(view))q.set('menu',view);else q.delete('menu');const s=q.toString().replace(/%3A/gi,':');return s?'?'+s:'';}
