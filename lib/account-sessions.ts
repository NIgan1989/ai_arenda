import {DomainError} from './domain';
import type {RentalService} from './service';
import {requestSessionIdentity} from './native-auth';
export async function accountSessions(s:RentalService,request:Request,body?:Record<string,any>){
 const identity=await requestSessionIdentity(request);if(!identity)throw new DomainError('Обновите вход в общий аккаунт.',401);
 const time=Math.floor(Date.now()/1000);
 if(body){
  if(body.confirmed!==true||!['others','one'].includes(body.action))throw new DomainError('Подтвердите завершение выбранных сеансов.');
  if(body.action==='others'){
   await s.db.batch(['web','mobile'].map(kind=>s.query(`DELETE FROM ${kind==='web'?'auth_sessions':'auth_mobile_sessions'} WHERE user_id=? AND hash<>?`,s.userId,kind===identity.kind?identity.hash:'')));
  }else{
   if(!['web','mobile'].includes(body.kind)||typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))throw new DomainError('Выберите сеанс.');
   const r=await s.query(`DELETE FROM ${body.kind==='web'?'auth_sessions':'auth_mobile_sessions'} WHERE hash=? AND user_id=?`,body.id,s.userId).run();if(!r.meta.changes)throw new DomainError('Сеанс уже завершён или недоступен.',404);
  }
  await s.audit(s.userId,'account.sessions_revoked').run();
  return {message:'Выбранные сеансы завершены.',currentRevoked:body.action==='one'&&body.kind===identity.kind&&body.id===identity.hash};
 }
 const rows=await s.all(`SELECT s.hash id,'web' kind,s.expires_at FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.user_id=? AND s.expires_at>? UNION ALL SELECT s.hash id,'mobile' kind,s.expires_at FROM auth_mobile_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.user_id=? AND s.expires_at>? ORDER BY expires_at DESC LIMIT 100`,s.userId,time,s.userId,time);
 return {sessions:rows.map(row=>({...row,current:row.kind===identity.kind&&row.id===identity.hash}))};
}
