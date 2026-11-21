// The language a person chose in the app, kept by the server (drizzle/0084_user_language.sql). The app tells it after
// sign-in and on every change (mobile/src/lang.ts); the server uses it where it speaks to the person alone: Telegram,
// SMS and push (lib/delivery.ts) and the answers of the AI administrator (lib/ai.ts). No row means Russian.
import {DomainError} from './domain';
import {isLang,type Lang} from './i18n';
import {epoch,one,q} from './operation-core';

export async function saveLanguage(db:D1Database,userId:string,value:unknown):Promise<{lang:Lang}>{
  if(!isLang(value))throw new DomainError('Выберите язык.');
  await q(db,'INSERT INTO user_language(user_id,lang,updated_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE id=?) ON CONFLICT(user_id) DO UPDATE SET lang=excluded.lang,updated_at=excluded.updated_at WHERE user_language.lang<>excluded.lang',userId,value,epoch(),userId).run();
  return {lang:value};
}
export async function languageOf(db:D1Database,userId:string):Promise<Lang>{
  const row=await one(db,'SELECT lang FROM user_language WHERE user_id=?',userId).catch(()=>null);
  return isLang(row?.lang)?row.lang:'ru';
}
