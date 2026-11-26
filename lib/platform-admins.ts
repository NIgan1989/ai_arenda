import {DomainError,required} from './domain';
import {normalizePhone} from './native-auth';
import {epoch,q,rows,type Row} from './operation-core';
import type {RentalService} from './service';

// Administrators of the platform (migration 0105). The main ones are in the Worker's secret PLATFORM_ADMIN_IDS and stay
// there; the main administrator adds more in «Управление сервисом» → «Администраторы». Every request reads the added ones
// into PLATFORM_ADMIN_IDS, so all the checks of the service (requirePlatformAdmin, the code from Telegram, the notices to
// administrators, the sweeps) see them without a change. PLATFORM_OWNER_IDS keeps the secret's list: only they manage
// the list of administrators, and nobody can remove them from the app.
type AdminsConfig={PLATFORM_ADMIN_IDS?:string;PLATFORM_OWNER_IDS?:string;DB?:D1Database};
const split=(v:unknown)=>typeof v==='string'?v.split(',').map(x=>x.trim()).filter(Boolean):[];

/** The configuration with the added administrators. A missing table (before the migration) leaves it as it is. */
export async function withAdmins<T extends AdminsConfig>(config:T,db:D1Database|undefined=config.DB):Promise<T>{
 if(!db||config.PLATFORM_OWNER_IDS!==undefined)return config;
 const owners=split(config.PLATFORM_ADMIN_IDS);
 let added:string[]=[];
 try{added=(await rows(db,'SELECT user_id FROM platform_admins')).map(r=>String(r.user_id));}catch{added=[];}
 return {...config,PLATFORM_OWNER_IDS:owners.join(','),PLATFORM_ADMIN_IDS:[...new Set([...owners,...added])].join(',')};
}
export const isMainAdmin=(userId:string,config:AdminsConfig)=>split(config.PLATFORM_OWNER_IDS??config.PLATFORM_ADMIN_IDS).includes(userId);

export async function adminList(service:RentalService,config:AdminsConfig){
 const owners=split(config.PLATFORM_OWNER_IDS??config.PLATFORM_ADMIN_IDS);
 const added=await rows(service.db,'SELECT a.user_id,a.added_at,p.name,u.phone FROM platform_admins a LEFT JOIN profiles p ON p.id=a.user_id LEFT JOIN auth_accounts u ON u.id=a.user_id ORDER BY a.added_at').catch(()=>[] as Row[]);
 const main=owners.length?await rows(service.db,`SELECT p.id user_id,p.name FROM profiles p WHERE p.id IN (${owners.map(()=>'?').join(',')})`,...owners):[];
 const masked=(phone:unknown)=>{const d=String(phone||'').replace(/\D/g,'');return d.length>=4?'+'+d.slice(0,1)+' ••• '+d.slice(-4,-2)+' '+d.slice(-2):'';};
 return {
  canManage:isMainAdmin(service.userId,config),
  main:owners.map(id=>({userId:id,name:main.find(m=>m.user_id===id)?.name||'Администратор',you:id===service.userId})),
  added:added.map(r=>({userId:r.user_id,name:r.name||'Участник',phone:masked(r.phone),addedAt:Number(r.added_at),you:r.user_id===service.userId})),
 };
}

export async function addAdmin(service:RentalService,body:Row,config:AdminsConfig){
 if(!isMainAdmin(service.userId,config))throw new DomainError('Добавлять администраторов может только главный администратор.',403);
 if(body.confirmed!==true)throw new DomainError('Подтвердите, что даёте этому человеку доступ ко всему управлению сервисом.');
 const phone=normalizePhone(body.phone);
 const account=(await rows(service.db,'SELECT id FROM auth_accounts WHERE phone=?',phone))[0];
 if(!account)throw new DomainError('С этим номером ещё нет аккаунта. Пусть человек сначала войдёт в приложение.',404);
 const id=String(account.id);
 if(split(config.PLATFORM_OWNER_IDS??config.PLATFORM_ADMIN_IDS).includes(id))throw new DomainError('Это уже главный администратор.',409);
 const at=epoch(),r=await service.db.batch([
  q(service.db,'INSERT OR IGNORE INTO platform_admins(user_id,added_by,added_at) VALUES (?,?,?)',id,service.userId,at),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),service.userId,'platform-admin:'+id,'admin.added',at),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Этот человек уже администратор.',409);
 return {message:'Администратор добавлен. Управление откроется ему после кода из Telegram.'};
}

export async function removeAdmin(service:RentalService,body:Row,config:AdminsConfig){
 if(!isMainAdmin(service.userId,config))throw new DomainError('Убирать администраторов может только главный администратор.',403);
 const id=required(body.userId,'Администратор',100),at=epoch();
 // The confirmed sessions of the removed one end at once: their next request is no longer an administrator's.
 const r=await service.db.batch([
  q(service.db,'DELETE FROM platform_admins WHERE user_id=?',id),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),service.userId,'platform-admin:'+id,'admin.removed',at),
  q(service.db,'DELETE FROM admin_factor WHERE user_id=?',id),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Этого администратора уже нет в списке.',404);
 return {message:'Администратор убран, его вход в управление закрыт.'};
}
