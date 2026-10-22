import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {roles,type Role} from '../../../../lib/domain';
import {rolePages} from '../../../../lib/access';
import {RentalService} from '../../../../lib/service';
import Chat from '../../../chat';
export const dynamic='force-dynamic';
export default async function Workspace({params}:{params:Promise<{role:string;section:string}>}){
  const {role,section}=await params;
  if(!roles.includes(role as Role)||!rolePages[role as Role].some(p=>p.id===section))notFound();
  const user=await getChatGPTUser();if(!user)redirect('/');
  if(!env.DB)redirect('/');
  const profile=await new RentalService(env.DB,user.userId).profile();
  if(!profile||!JSON.parse(profile.roles).includes(role))redirect('/');
  return <Chat key={role+':'+section} workspaceRole={role as Role} section={section}/>;
}
