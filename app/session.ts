import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {sessionUser} from '../lib/native-auth';
export async function getAppUser(){return env.DB?sessionUser(env.DB,(await headers()).get('cookie')):null;}
