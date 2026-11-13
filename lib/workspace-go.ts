// Opens a workspace address from code. On a phone the map shell takes it and shows a sheet; anywhere else the page loads.
export const WORKSPACE_GO='workspace-go';
export function goWorkspace(path:string){
 if(typeof window==='undefined')return;
 if(window.dispatchEvent(new CustomEvent(WORKSPACE_GO,{detail:path,cancelable:true})))window.location.assign(path);
}
