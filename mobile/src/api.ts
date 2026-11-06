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
  try {
    const response=await fetch(API_URL+target,{method:method||(body===undefined?'GET':'POST'),credentials:'omit',redirect:'error',headers:{...(snapshot.token?{Authorization:'Bearer '+snapshot.token}:{}),...(requestRole?{'X-Workspace-Role':requestRole}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json();
    sessions.assertCurrent(snapshot);
    if(!response.ok)throw new ApiError(data.error||'Сервер не подтвердил действие.',response.status);
    return data;
  }catch(error){
    sessions.assertCurrent(snapshot);
    if(error instanceof StaleSessionError)throw error;
    if(error instanceof ApiError)throw error;
    throw new Error('Нет ответа от сервера. Результат действия пока неизвестен. Проверьте связь и обновите данные.');
  }finally{clearTimeout(timer);}
}
