import { DomainError, roles, type Role } from './domain';

export const roleNames:Record<Role,string>={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель уборки'};
export const rolePages:Record<Role,{id:string;title:string;intent:string}[]>={
  guest:[{id:'overview',title:'Обзор',intent:'workspace'},{id:'catalog',title:'Найти квартиру',intent:'properties'},{id:'bookings',title:'Мои брони',intent:'bookings'},{id:'assistant',title:'Ассистент',intent:'assistant'},{id:'settings',title:'Настройки',intent:'settings'}],
  owner:[{id:'overview',title:'Обзор',intent:'workspace'},{id:'properties',title:'Мои квартиры',intent:'own-properties'},{id:'bookings',title:'Заявки гостей',intent:'owner-bookings'},{id:'cleaning',title:'Уборки',intent:'owner-jobs'},{id:'assistant',title:'Ассистент',intent:'assistant'},{id:'settings',title:'Настройки',intent:'settings'}],
  cleaner:[{id:'overview',title:'Обзор',intent:'workspace'},{id:'jobs',title:'Найти задания',intent:'jobs'},{id:'assignments',title:'Мои задания',intent:'my-jobs'},{id:'assistant',title:'Ассистент',intent:'assistant'},{id:'settings',title:'Настройки',intent:'settings'}],
};
export function parseRole(value:unknown):Role{
  if(!roles.includes(value as Role))throw new DomainError('Сначала выберите роль на экране входа.',403);
  return value as Role;
}
export function intentRole(intent:string):Role|null{
  if(intent.startsWith('book:')||['properties','bookings'].includes(intent))return 'guest';
  if(intent.startsWith('job:')||['property','own-properties','owner-bookings','owner-jobs','job'].includes(intent))return 'owner';
  if(['jobs','my-jobs','cleaner-profile'].includes(intent))return 'cleaner';
  return null;
}
export function commandRole(path:string,body:Record<string,any>):Role[]|null{
  if(path==='profile'||path==='demo'||path==='notifications')return null;
  if(path==='quote'||path==='bookings')return ['guest'];
  if(path==='properties'||path.startsWith('properties/')||path==='jobs')return ['owner'];
  if(path.startsWith('bookings/'))return ['confirm','paid','deposit_received','checkin','checkout'].includes(body.action)?['owner']:body.action==='report_checkout'?['guest']:['owner','guest'];
  if(path.startsWith('jobs/'))return ['apply','start','submit'].includes(body.action)?['cleaner']:body.action==='issue'?['owner','cleaner']:['owner'];
  return null;
}
