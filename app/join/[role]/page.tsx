import {notFound} from 'next/navigation';
import RoleEntry from '../../../components/role-entry';
export default async function Join({params,searchParams}:{params:Promise<{role:string}>;searchParams:Promise<{next?:string}>}){const {role}=await params;if(!['guest','owner','cleaner'].includes(role))notFound();const {next}=await searchParams;return <RoleEntry target={role as 'guest'|'owner'|'cleaner'} returnTo={next}/>;}
