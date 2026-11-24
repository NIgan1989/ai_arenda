import {t,tServer} from '../../lib/i18n';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {SessionState,StaleSessionError} from './session-state';
import {trackRequest} from './loading';
export {StaleSessionError} from './session-state';
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://127.0.0.1:5174').replace(/\/$/,'');
const sessionKey='ai-arenda-shared-session-v2';
function checkedServer(){const url=new URL(API_URL);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&(!__DEV__||url.protocol!=='http:'))throw new Error(t('Укажите защищённый адрес общего сервера приложения.'));return url.origin;}
let memoryRecord:string|null=null;
const sessions=new SessionState({read:async()=>Platform.OS==='web'?memoryRecord:SecureStore.getItemAsync(sessionKey),write:async record=>{if(Platform.OS==='web'){memoryRecord=record;return;}if(record!==null)await SecureStore.setItemAsync(sessionKey,record);else await SecureStore.deleteItemAsync(sessionKey);}});
let workspaceRole:string|null=null;
export function setWorkspaceRole(role:string|null){workspaceRole=role;}
export function getSessionGeneration(){return sessions.currentGeneration();}
// `ru` keeps the server's own Russian words, for code that reads the reason; `message` is in the language of the app.
export class ApiError extends Error {constructor(message:string,public status:number,public ru=message){super(message);}}
// No answer came back. For a request that only reads, that means "no connection"; for one that may have changed something, the result is unknown.
export class NetworkError extends Error {constructor(public uncertain:boolean){super(uncertain?t('Нет ответа от сервера. Результат действия пока неизвестен. Проверьте связь и обновите данные.'):t('Нет связи. Проверьте интернет.'));}}
export const isOffline=(error:unknown)=>error instanceof NetworkError&&!error.uncertain;
const readOnly=/^\/api\/(?:public\/|quote$|operations\/(?:map\/search|matching\/(?:state|inbox)|discussion\/(?:inbox|read|avatar|photo|blocks)|administrator\/(?:conversation|history))$|bookings\/[^/]+\/change-quote$)|^\/auth\/login$/;
// The app shows one quiet "Нет связи" line; every answer or silence of the server updates it.
let reachListener:((reached:boolean)=>void)|null=null;
export function onServerReach(listener:((reached:boolean)=>void)|null){reachListener=listener;}
// The server answers 428 when the role has documents to accept (lib/legal-acceptance.ts): the app refreshes and shows the sheet.
let legalListener:(()=>void)|null=null;
export function onLegalRequired(listener:(()=>void)|null){legalListener=listener;}
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
// fetch has no upload progress, so a request that shows one (a photo in a chat) goes through XMLHttpRequest with the same
// headers, the same timeout and the same answers.
function send(url:string,init:{method:string;headers:Record<string,string>;body?:string;signal:AbortSignal},onUpload:(fraction:number)=>void):Promise<{ok:boolean;status:number;json:()=>Promise<any>}>{
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open(init.method,url);for(const [k,v] of Object.entries(init.headers))xhr.setRequestHeader(k,v);
    xhr.upload&&(xhr.upload.onprogress=e=>{if(e.lengthComputable&&e.total>0)onUpload(e.loaded/e.total);});
    xhr.onload=()=>{onUpload(1);const text=xhr.responseText;resolve({ok:xhr.status>=200&&xhr.status<300,status:xhr.status,json:async()=>JSON.parse(text)});};
    xhr.onerror=()=>reject(new TypeError('Network request failed'));xhr.ontimeout=xhr.onerror;xhr.onabort=()=>reject(new DOMException('Aborted','AbortError'));
    init.signal.addEventListener('abort',()=>xhr.abort());xhr.send(init.body??null);
  });
}
export async function request(path:string,body?:unknown,method?:string,requestKey?:string,role?:string,onUpload?:(fraction:number)=>void):Promise<any>{
  checkedServer();if(!/^\/(?:api\/|auth\/)/.test(path))throw Error(t('Неверный адрес операции.'));
  const snapshot=sessions.snapshot();if(snapshot.transitioning)throw new StaleSessionError();
  const requestRole=role||workspaceRole;
  const target=path.startsWith('/auth/')?'/api/mobile'+path:path;
  const key=body&&typeof body==='object'&&'requestKey' in body&&typeof body.requestKey==='string'?body.requestKey:requestKey;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),target==='/api/chat'?40000:onUpload?60000:15000);
  const verb=method||(body===undefined?'GET':'POST');
  const settle=trackRequest();
  try {
    const headers={...(snapshot.token?{Authorization:'Bearer '+snapshot.token}:{}),...(requestRole?{'X-Workspace-Role':requestRole}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},payload=body===undefined?undefined:JSON.stringify(body);
    const response=onUpload?await send(API_URL+target,{method:verb,headers,body:payload,signal:controller.signal},onUpload):await fetch(API_URL+target,{method:verb,credentials:'omit',redirect:'error',headers,body:payload,signal:controller.signal});
    const data=await response.json();
    sessions.assertCurrent(snapshot);
    reachListener?.(true);
    if(response.status===428&&Array.isArray(data.legal))legalListener?.();
    // The server speaks Russian; its error and its «message» are shown in the language of the app (lib/i18n.ts tServer).
    if(!response.ok)throw new ApiError(data.error?tServer(String(data.error)):t('Сервер не подтвердил действие.'),response.status,String(data.error||''));
    if(data&&typeof data==='object'&&typeof data.message==='string')data.message=tServer(data.message);
    return data;
  }catch(error){
    sessions.assertCurrent(snapshot);
    if(error instanceof StaleSessionError)throw error;
    if(error instanceof ApiError)throw error;
    reachListener?.(false);
    throw new NetworkError(verb!=='GET'&&!readOnly.test(path.split('?')[0]));
  }finally{clearTimeout(timer);settle?.();}
}
