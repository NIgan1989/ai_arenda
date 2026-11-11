import {env as workerEnv} from 'cloudflare:workers';
import {redirect,notFound} from 'next/navigation';
import {getAppUser} from '../session';
import {isPlatformAdmin} from '../../lib/account';
import {isolateTestConfig} from '../../lib/test-environment';
import {PlatformAdmin} from '../../components/platform-admin';
export const dynamic='force-dynamic';
export default async function AdminPage(){
 const user=await getAppUser();if(!user)redirect('/signin?next=%2Fadmin');
 const env=isolateTestConfig(workerEnv);if(!isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS))notFound();
 return <PlatformAdmin name={user.fullName||'Администратор'}/>;
}
