import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {getAppUser} from '../../../session';
import {roles,type Role} from '../../../../lib/domain';
import {rolePages} from '../../../../lib/access';
import {RentalService} from '../../../../lib/service';
import Chat from '../../../chat';
export const dynamic='force-dynamic';
export default async function Workspace({params,searchParams}:{params:Promise<{role:string;section:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {role,section}=await params;
  if(!roles.includes(role as Role)||!rolePages[role as Role].some(p=>p.id===section))notFound();
  const search=await searchParams,query=new URLSearchParams();for(const key of ['book','city','start','end','guests','mode','new'])if(typeof search[key]==='string')query.set(key,search[key] as string);
  const path='/workspace/'+role+'/'+section+(query.size?'?'+query.toString():'');
  const user=await getAppUser();if(!user)redirect('/signin?next='+encodeURIComponent(path));
  if(!env.DB)redirect('/');
  const profile=await new RentalService(env.DB,user.userId).profile();
  if(!profile||!JSON.parse(profile.roles).includes(role))redirect('/join/'+role+'?next='+encodeURIComponent(path));
  return <Chat key={role+':'+section} workspaceRole={role as Role} section={section}/>;
}
