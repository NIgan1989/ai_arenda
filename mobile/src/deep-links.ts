import type {Role,Row} from './model';

export type ProcessLink={role:Role;section:string;entityId?:string};
export type ProcessLinkView={section:string;block?:'bookings'|'jobs'|'properties';payload?:{ids:string[];role:Role;mode:'owner'|'guest'}};
const sections:Record<Role,Record<string,'booking'|'job'|'property'|null>>={
 guest:{map:null,bookings:'booking',calendar:null,account:null},
 owner:{map:null,bookings:'booking',cleaning:'job',properties:'property',calendar:null,account:null},
 cleaner:{map:null,jobs:'job',assignments:'job',calendar:null,account:null}
};
const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
const owns=(object:object,key:string)=>Object.prototype.hasOwnProperty.call(object,key);

// Links select a read-only screen. They never carry commands, credentials or content.
export function parseProcessLink(value:unknown,apiUrl:string):ProcessLink|null{
 if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020\\]/.test(value)||/(?:^|\/)(?:\.|%2e){1,2}(?:\/|%2f|$)/i.test(value.split(/[?#]/)[0]))return null;
 let url:URL;try{url=new URL(value);}catch{return null;}
 if(url.username||url.password||url.hash)return null;
 let pathname:string;
 if(url.protocol==='aiarenda:'){
  if(url.port)return null;
  if(url.hostname==='workspace')pathname='/workspace'+url.pathname;
  else if(!url.hostname)pathname=url.pathname;
  else return null;
 }else{
  let server:URL;try{server=new URL(apiUrl);}catch{return null;}
  if(url.protocol!=='https:'||server.protocol!=='https:'||url.origin!==server.origin)return null;
  pathname=url.pathname;
 }
 const parts=pathname.split('/');
 if(parts.length!==4||parts[0]!==''||parts[1]!=='workspace')return null;
 const role=parts[2] as Role,section=parts[3];
 if(!owns(sections,role)||!owns(sections[role],section))return null;
 const entries=[...url.searchParams];if(entries.some(([key])=>key!=='entity')||entries.length>1)return null;
 const entityId=url.searchParams.get('entity');
 if(entityId!==null&&(!idPattern.test(entityId)||sections[role][section]===null))return null;
 return {role,section,...(entityId?{entityId}:{})};
}

function connectedRoles(profile:Row){try{const value=typeof profile.roles==='string'?JSON.parse(profile.roles):profile.roles;return Array.isArray(value)?value:[];}catch{return [];}}
const denied=()=>new Error('Этот процесс недоступен в выбранной роли. Откройте актуальный список после входа.');

// Call only with fresh /api/state fetched for link.role. URL data is not authority.
export function resolveProcessLink(link:ProcessLink,state:Row,accountId:string):ProcessLinkView{
 if(!accountId||state.user?.id!==accountId||state.profile?.id!==accountId||state.activeRole!==link.role||!connectedRoles(state.profile).includes(link.role))throw denied();
 if(!owns(sections,link.role)||!owns(sections[link.role],link.section))throw denied();
 if(!link.entityId)return {section:link.section};
 if(!idPattern.test(link.entityId))throw denied();
 const kind=sections[link.role][link.section];let item:Row|undefined;
 if(kind==='booking'){
  item=(state.bookings||[]).find((b:Row)=>b.id===link.entityId);
  if(!item||(link.role==='owner'?item.owner_id!==accountId:item.guest_id!==accountId))throw denied();
 }else if(kind==='property'){
  item=(state.ownProperties||[]).find((p:Row)=>p.id===link.entityId);
  if(link.role!=='owner'||!item||item.owner_id!==accountId)throw denied();
 }else if(kind==='job'){
  item=(state.jobs||[]).find((j:Row)=>j.id===link.entityId);if(!item)throw denied();
  if(link.role==='owner'&&item.owner_id!==accountId)throw denied();
  if(link.role==='cleaner'){
   const assigned=item.assigned_to===accountId,applied=(state.applications||[]).some((a:Row)=>a.job_id===item!.id&&a.user_id===accountId);
   if(link.section==='assignments'&&!assigned&&!applied)throw denied();
   if(!assigned&&!(item.status==='open'&&item.end>state.serverTime))throw denied();
  }
 }else throw denied();
 return {section:link.section,block:kind==='booking'?'bookings':kind==='job'?'jobs':'properties',payload:{ids:[item.id],role:link.role,mode:link.role==='owner'?'owner':'guest'}};
}

type Pending={id:number;target:ProcessLink;accountId:string|null;receivedAt:number};
export class ProcessLinkQueue{
 private value:Pending|null=null;
 private nextId=0;
 private last:{key:string;at:number}|null=null;
 constructor(private lifetimeMs=15*60*1000){}
 offer(url:unknown,apiUrl:string,accountId:string|null,now=Date.now()){
  const target=parseProcessLink(url,apiUrl);if(!target)return false;
  const key=JSON.stringify(target);
  if(this.last?.key===key&&now-this.last.at<2000)return false;
  this.last={key,at:now};this.value={id:++this.nextId,target,accountId,receivedAt:now};return true;
 }
 claim(accountId:string,now=Date.now()){
  if(!this.value||!accountId)return null;
  if(now-this.value.receivedAt>this.lifetimeMs||now<this.value.receivedAt||this.value.accountId&&this.value.accountId!==accountId){this.cancel();return null;}
  this.value.accountId=accountId;return {...this.value};
 }
 isCurrent(id:number,accountId:string|null,now=Date.now()){
  return !!accountId&&!!this.value&&this.value.id===id&&this.value.accountId===accountId&&now>=this.value.receivedAt&&now-this.value.receivedAt<=this.lifetimeMs;
 }
 consume(id:number){if(this.value?.id===id)this.value=null;}
 cancel(){this.value=null;}
 get pending(){return !!this.value;}
}
