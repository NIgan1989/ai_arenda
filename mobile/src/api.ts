import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {SessionState,StaleSessionError} from './session-state';
export {StaleSessionError} from './session-state';
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://127.0.0.1:5174').replace(/\/$/,'');
const sessionKey='ai-arenda-shared-session-v2';
function checkedServer(){const url=new URL(API_URL);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&(!__DEV__||url.protocol!=='http:'))throw new Error('Укажите защищённый адрес общего сервера приложения.');return url.origin;}
let memoryRecord:string|null=null;
const sessions=new SessionState({read:async()=>Platform.OS==='web'?memoryRecord:SecureStore.getItemAsync(sessionKey),write:async record=>{if(Platform.OS==='web'){memoryRecord=record;return;}if(record!==null)await SecureStore.setItemAsync(sessionKey,record);else await SecureStore.deleteItemAsync(sessionKey);}});
let workspaceRole:string|null=null;
export function setWorkspaceRole(role:string|null){workspaceRole=role;}
export function getSessionGeneration(){return sessions.currentGeneration();}
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
// No answer came back. For a request that only reads, that means "no connection"; for one that may have changed something, the result is unknown.
export class NetworkError extends Error {constructor(public uncertain:boolean){super(uncertain?'Нет ответа от сервера. Результат действия пока неизвестен. Проверьте связь и обновите данные.':'Нет связи. Проверьте интернет.');}}
export const isOffline=(error:unknown)=>error instanceof NetworkError&&!error.uncertain;
const readOnly=/^\/api\/(?:public\/|quote$|operations\/(?:map\/search|matching\/(?:state|inbox)|discussion\/(?:inbox|read|avatar|photo|blocks)|administrator\/(?:conversation|history))$|bookings\/[^/]+\/change-quote$)|^\/auth\/login$/;
// The app shows one quiet "Нет связи" line; every answer or silence of the server updates it.
let reachListener:((reached:boolean)=>void)|null=null;
export function onServerReach(listener:((reached:boolean)=>void)|null){reachListener=listener;}
// The role used last on this device, so the app opens straight on its map. Not a secret; kept beside the session.
// In the browser preview it is kept in localStorage (the session itself stays in memory there), or in memory when storage is off.
const roleKey='ai-arenda-last-role-v1';
let memoryRole:string|null=null;
const browserStore=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
async function readRole(){if(Platform.OS!=='web')return SecureStore.getItemAsync(roleKey);try{return browserStore()?.getItem(roleKey)??memoryRole;}catch{return memoryRole;}}
async function writeRole(record:string|null){
  if(Platform.OS!=='web'){if(record)await SecureStore.setItemAsync(roleKey,record);else await SecureStore.deleteItemAsync(roleKey);return;}
  memoryRole=record;const store=browserStore();if(record)store?.setItem(roleKey,record);else store?.removeItem(roleKey);
}
export async function restoreLastRole(accountId:string):Promise<string|null>{try{const saved=JSON.parse((await readRole())||'null');return saved?.accountId===accountId&&typeof saved.role==='string'?saved.role:null;}catch{return null;}}
export async function saveLastRole(accountId:string|null,role:string|null){try{await writeRole(accountId&&role?JSON.stringify({accountId,role}):null);}catch{/* Remembering the role is a convenience; the role chooser still works. */}}
export function restoreSession(){return sessions.restore(checkedServer());}
export async function saveSession(value:string|null){
  // Browser preview keeps the origin-bound record in memory; phones use Keychain.
  await sessions.save(value,checkedServer());
}
export async function request(path:string,body?:unknown,method?:string,requestKey?:string,role?:string):Promise<any>{
  checkedServer();if(!/^\/(?:api\/|auth\/)/.test(path))throw Error('Неверный адрес операции.');
  const snapshot=sessions.snapshot();if(snapshot.transitioning)throw new StaleSessionError();
  const requestRole=role||workspaceRole;
  const target=path.startsWith('/auth/')?'/api/mobile'+path:path;
  const key=body&&typeof body==='object'&&'requestKey' in body&&typeof body.requestKey==='string'?body.requestKey:requestKey;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),target==='/api/chat'?40000:15000);
  const verb=method||(body===undefined?'GET':'POST');
  try {
    const response=await fetch(API_URL+target,{method:verb,credentials:'omit',redirect:'error',headers:{...(snapshot.token?{Authorization:'Bearer '+snapshot.token}:{}),...(requestRole?{'X-Workspace-Role':requestRole}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json();
    sessions.assertCurrent(snapshot);
    reachListener?.(true);
    if(!response.ok)throw new ApiError(data.error||'Сервер не подтвердил действие.',response.status);
    return data;
  }catch(error){
    sessions.assertCurrent(snapshot);
    if(error instanceof StaleSessionError)throw error;
    if(error instanceof ApiError)throw error;
    reachListener?.(false);
    throw new NetworkError(verb!=='GET'&&!readOnly.test(path.split('?')[0]));
  }finally{clearTimeout(timer);}
}
