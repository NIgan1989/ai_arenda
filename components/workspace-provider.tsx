'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
export function WorkspaceProvider({children}:{children:ReactNode}){
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:10000,refetchOnWindowFocus:false,retry:1},mutations:{retry:false}}}));
 useEffect(()=>{const changed=()=>{void client.invalidateQueries({queryKey:['discussion-inbox']});};window.addEventListener('discussion-changed',changed);return()=>window.removeEventListener('discussion-changed',changed);},[client]);
 return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
