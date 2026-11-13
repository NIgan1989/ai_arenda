import {rolePages} from './access';
import type {Role} from './domain';
import {sheetName} from './sheet-title';

export function sheetTitle(role:Role,section:string){return sheetName(role,section,rolePages[role].find(p=>p.id===section)?.title||'');}

// A link to a section of the same workspace opens as a sheet instead of loading a page.
// Anything else (another role, another site, a file, an unknown section) is left to the browser.
export function workspaceTarget(href:string,origin:string,role:string,sections:string[]){
 let url:URL;try{url=new URL(href,origin);}catch{return null;}
 if(url.origin!==origin)return null;
 const m=/^\/workspace\/([a-z]+)\/([a-z]+)\/?$/.exec(url.pathname);
 if(!m||m[1]!==role||!sections.includes(m[2]))return null;
 return {section:m[2],search:url.search,path:url.pathname+url.search+url.hash};
}

export {WORKSPACE_GO,goWorkspace} from './workspace-go';
