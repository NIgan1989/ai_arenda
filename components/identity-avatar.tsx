'use client';
import {useEffect,useState} from 'react';
import {avatarInitials} from '../lib/avatar';
import './profile-identity.css';
type Person={id:string;name:string;avatar_id?:string|null};
const avatarRequests=new Map<string,{expires:number;value:Promise<string>}>();
function avatarImage(key:string,request:()=>Promise<string>){
 const cached=avatarRequests.get(key);if(cached&&cached.expires>Date.now())return cached.value;
 if(avatarRequests.size>=64)avatarRequests.delete(avatarRequests.keys().next().value!);
 const value=request().catch(error=>{avatarRequests.delete(key);throw error;});avatarRequests.set(key,{expires:Date.now()+30000,value});return value;
}
export function IdentityAvatar({person,role,roomId,size='normal'}:{person:Person;role:string;roomId:string;size?:'normal'|'small'|'large'}){
 const [uri,setUri]=useState('');
 useEffect(()=>{let live=true;setUri('');if(person.avatar_id)avatarImage([roomId,role,person.id,person.avatar_id].join(':'),()=>fetch('/api/operations/discussion/avatar',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':role},body:JSON.stringify({roomId,userId:person.id}),cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{data:string}>;}).then(v=>v.data)).then(uri=>live&&setUri(uri)).catch(()=>{});return()=>{live=false;};},[person.avatar_id,person.id,role,roomId]);
 return <span className={'identity-avatar '+size} role="img" aria-label={'Аватар: '+person.name}>{uri?<img src={uri} alt="" onError={()=>setUri('')}/>:avatarInitials(person.name)}</span>;
}
