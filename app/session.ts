import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {sessionUser} from '../lib/native-auth';
export async function getAppUser(request?:Request){if(!env.DB)return null;const h=request?.headers||await headers();return sessionUser(env.DB,h.get('cookie'),request?h.get('authorization'):undefined);}
