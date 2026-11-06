import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,q,one,uuid,type Row} from './operation-core';

// This is permission to transmit data, never an assistant activation preference.
export const AI_DATA_POLICY_VERSION='2026-10-30';
export async function aiDataPermission(s:RentalService){
 const record=await one(s.db,'SELECT * FROM ai_data_permissions WHERE user_id=?',s.userId);
 return {allowed:record?.allowed===1&&record.policy_version===AI_DATA_POLICY_VERSION,decided:!!record&&record.policy_version===AI_DATA_POLICY_VERSION,version:record?.version||0,policyVersion:AI_DATA_POLICY_VERSION,updatedAt:record?.updated_at||null};
}
export async function saveAIDataPermission(s:RentalService,b:Row){
 if(typeof b.allowed!=='boolean'||b.policyVersion!==AI_DATA_POLICY_VERSION||!Number.isInteger(b.expectedVersion)||b.expectedVersion<0)throw new DomainError('Ознакомьтесь с актуальными условиями передачи данных и подтвердите выбор.');
 const version=b.expectedVersion+1,time=epoch();
 // CAS prevents another tab or role from silently overwriting a newer decision.
 const [changed]=await s.db.batch([
  q(s.db,`INSERT INTO ai_data_permissions SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM ai_data_permissions WHERE user_id=? AND version=?) ON CONFLICT(user_id) DO UPDATE SET allowed=excluded.allowed,policy_version=excluded.policy_version,version=excluded.version,updated_at=excluded.updated_at WHERE ai_data_permissions.version=?`,s.userId,Number(b.allowed),AI_DATA_POLICY_VERSION,version,time,b.expectedVersion,s.userId,b.expectedVersion,b.expectedVersion),
  q(s.db,'INSERT INTO ai_data_permission_events SELECT ?,?,?,?,?,? WHERE changes()=1',uuid(),s.userId,Number(b.allowed),AI_DATA_POLICY_VERSION,version,time)
 ]);
 if(!changed.meta.changes)throw new DomainError('Выбор уже изменился в другом окне. Обновите состояние и повторите.',409);
 return {permission:await aiDataPermission(s),message:b.allowed?'Передача разрешена для всех ваших ролей. Теперь можно отправить запрос администратору.':'Новые обращения не передаются внешнему AI. Поиск, правила и формы продолжают работать.'};
}
