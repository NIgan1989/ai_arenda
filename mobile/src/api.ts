import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://127.0.0.1:8788').replace(/\/$/,'');
let token:string|null=null;
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
export async function restoreSession(){token=Platform.OS==='web'?null:await SecureStore.getItemAsync('ai-arenda-session');return token;}
export async function saveSession(value:string|null){
  // Browser preview keeps the token in memory. On a phone it lives in Keychain/Keystore.
  if(Platform.OS!=='web'){
    if(value)await SecureStore.setItemAsync('ai-arenda-session',value);
    else await SecureStore.deleteItemAsync('ai-arenda-session');
  }
  token=value;
}
export async function request(path:string,body?:unknown,method?:string,requestKey?:string):Promise<any>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(API_URL+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(requestKey?{'Idempotency-Key':requestKey}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new ApiError(data.error||'Сервер не подтвердил действие.',response.status);
    return data;
  }catch(error){
    if(error instanceof ApiError)throw error;
    throw new Error('Нет ответа от сервера. Результат действия пока неизвестен. Проверьте связь и обновите данные.');
  }finally{clearTimeout(timer);}
}
