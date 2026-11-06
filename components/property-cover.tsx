'use client';
import {Photo} from './media';
type Row=Record<string,any>;
export function PropertyCover({property,role,publicView=false}:{property:Row;role:string;publicView?:boolean}){
 const synthetic=property.synthetic===true||String(property.description||'').startsWith('СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ');
 const palette=['#a35f45','#638d82','#738caa'][Number(property.rooms||1)%3];
 const illustration=<><svg viewBox="0 0 160 130" aria-hidden="true"><rect width="160" height="130" fill="#e8e5dc"/><circle cx="125" cy="25" r="17" fill="#edcf90"/><path d="M0 100Q60 82 160 104V130H0Z" fill="#bccab6"/><path d="M31 46 80 18l49 28v66H31Z" fill={palette}/><path d="m25 49 55-33 55 33" fill="none" stroke="#f8f2e7" strokeWidth="7" strokeLinecap="round"/><rect x="45" y="53" width="25" height="22" rx="3" fill="#f8e8bb"/><rect x="89" y="53" width="25" height="22" rx="3" fill="#f8e8bb"/><path d="M57 53v22m44-22v22" stroke={palette} strokeWidth="3"/><rect x="68" y="84" width="24" height="28" rx="3" fill="#f8f2e7"/><path d="M55 117h50" stroke="#f8f2e7" strokeWidth="5" strokeLinecap="round"/></svg><small>Учебная иллюстрация</small></>;
 return <Photo id={property.photos?.[0]} role={role} publicView={publicView} alt={property.title} rejectTiny={synthetic} fallback={synthetic?illustration:undefined}/>;
}
