import {DomainError,number,roles} from './domain';
export const defaultAccountSettings={payment_provider:'undecided',payment_notifications:1,version:0};
// Server configuration only. A declared owner role or a request body cannot grant this right.
export function isPlatformAdmin(userId:string,configuredIds:unknown){return typeof configuredIds==='string'&&configuredIds.split(',').map(v=>v.trim()).filter(Boolean).includes(userId);}
export function accountSettingsInput(body:Record<string,any>){
 if(!['undecided','kaspi','halyk'].includes(body.paymentProvider)||typeof body.paymentNotifications!=='boolean')throw new DomainError('Проверьте настройки оплаты.');
 return {provider:body.paymentProvider,notifications:body.paymentNotifications?1:0,version:number(body.expectedVersion,'Версия настроек аккаунта',0,1000000)};
}
export function userSearchInput(body:Record<string,any>){
 const role=String(body.role||''),search=String(body.search||'').trim();if(role&&!roles.includes(role as any)||search.length>100)throw new DomainError('Проверьте фильтры пользователей.');
 return {role,search:search.replace(/[\\%_]/g,'\\$&'),page:number(body.page??0,'Страница',0,100000),limit:25};
}
