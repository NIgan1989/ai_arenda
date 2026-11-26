import {env as workerEnv} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {getAppUser} from '../session';
import {isPlatformAdmin} from '../../lib/account';
import {isolateTestConfig} from '../../lib/test-environment';
import {withAdmins} from '../../lib/platform-admins';
import {requestSessionIdentity} from '../../lib/native-auth';
import {adminFactorState} from '../../lib/admin-factor';
import {PlatformAdmin} from '../../components/platform-admin';
import {AdminFactorGate} from '../../components/admin-factor';
export const dynamic='force-dynamic';
export default async function AdminPage(){
 const user=await getAppUser();if(!user)redirect('/signin?next=%2Fadmin');
 const env=await withAdmins(isolateTestConfig(workerEnv));if(!isPlatformAdmin(user.userId,env.PLATFORM_ADMIN_IDS))notFound();
 // The password opened the account; the management needs this session's code from Telegram too (lib/admin-factor.ts).
 const cookie=(await headers()).get('cookie')||'',session=(await requestSessionIdentity(new Request('https://admin.local/',{headers:{cookie}})))?.hash||'';
 const factor=await adminFactorState(env.DB,user.userId,session,env);
 if(!factor.verified)return <AdminFactorGate name={user.fullName||'Администратор'} telegram={!!factor.telegram}/>;
 return <PlatformAdmin name={user.fullName||'Администратор'}/>;
}
