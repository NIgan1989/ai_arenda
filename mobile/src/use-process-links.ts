import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking} from 'react-native';
import {StaleSessionError} from './session-state';
import {ProcessLinkQueue,type ProcessLink} from './deep-links';

export type ProcessLinkGuard={accountId:string;isCurrent:()=>boolean};
type Options={apiUrl:string;ready:boolean;accountId:string|null;blocked:boolean;onOpen:(link:ProcessLink,guard:ProcessLinkGuard)=>Promise<void>;onError:(message:string)=>void};

// Queue cold-start, warm-start and future push URLs through the same validation.
export function useProcessLinks(options:Options){
 const latest=useRef(options);latest.current=options;
 const queue=useRef(new ProcessLinkQueue()),running=useRef(false),mounted=useRef(false),receivedEvent=useRef(false);
 const [revision,setRevision]=useState(0);
 const wake=useCallback(()=>{if(mounted.current)setRevision(n=>n+1);},[]);
 const acceptURL=useCallback((url:unknown)=>{const o=latest.current,accepted=queue.current.offer(url,o.apiUrl,o.accountId);if(accepted)wake();return accepted;},[wake]);
 const cancelPending=useCallback(()=>{queue.current.cancel();wake();},[wake]);
 useEffect(()=>{
  mounted.current=true;let active=true;receivedEvent.current=false;
  const urlEvent=Linking.addEventListener('url',event=>{receivedEvent.current=true;acceptURL(event.url);});
  const appEvent=AppState.addEventListener('change',state=>{if(state==='active')wake();});
  void Linking.getInitialURL().then(url=>{if(active&&!receivedEvent.current&&url)acceptURL(url);}).catch(()=>{});
  return()=>{active=false;mounted.current=false;queue.current.cancel();urlEvent.remove();appEvent.remove();};
 },[acceptURL,wake]);
 useEffect(()=>{
  const current=latest.current;
  if(!current.ready||!current.accountId||current.blocked||running.current||AppState.currentState!=='active')return;
  const pending=queue.current.claim(current.accountId);if(!pending)return;
  const accountId=current.accountId,isCurrent=()=>mounted.current&&queue.current.isCurrent(pending.id,latest.current.accountId);
  running.current=true;
  void current.onOpen(pending.target,{accountId,isCurrent}).catch(error=>{if(error instanceof StaleSessionError)return;if(isCurrent())latest.current.onError(typeof error?.message==='string'?error.message:'Не удалось открыть процесс. Обновите данные и повторите переход.');}).finally(()=>{queue.current.consume(pending.id);running.current=false;wake();});
 },[options.ready,options.accountId,options.blocked,revision,wake]);
 return {acceptURL,cancelPending,pending:queue.current.pending};
}
