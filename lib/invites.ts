import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {INVITE_CODE,INVITE_DAYS,INVITER_YEAR_CAP,codeStem,normalizeInviteCode} from './invite-text';
export * from './invite-text';

// Приглашения и промокоды (2026-11-27, migration 0106). An owner shares a personal code; a partner company gets a code from
// the administrator. The one who came enters it once, before their first booking through the service; from that booking
// they have the code's days without the commission, and with a friend's code the friend has the same days from the same
// moment (the trigger invite_bonus_start, lib/platform-billing.ts freshSql). Nothing is paid out.
const DAY=86400,YEAR=365*DAY;
const firstName=(v:unknown)=>String(v||'').trim().split(/\s+/)[0]||'';
const nameOf="COALESCE(NULLIF((SELECT name FROM profiles WHERE id=%s),''),(SELECT name FROM auth_accounts WHERE id=%s),'')";
const nameSql=(id:string)=>nameOf.split('%s').join(id);

/** The owner's own code: made on the first look, the same afterwards. */
export async function friendCode(db:D1Database,userId:string){
 const mine=async()=>(await one(db,"SELECT code FROM invite_codes WHERE kind='friend' AND user_id=? AND role='owner'",userId))?.code as string|undefined;
 const found=await mine();if(found)return found;
 const stem=codeStem((await one(db,`SELECT ${nameSql('?1')} name`,userId))?.name);
 for(let i=0;i<8;i++){
  const digits=String(100+(crypto.getRandomValues(new Uint32Array(1))[0]%(i<4?900:9000)));
  await q(db,"INSERT OR IGNORE INTO invite_codes(code,kind,user_id,role,days,created_by,created_at) VALUES (?,'friend',?,'owner',?,?,?)",stem+digits,userId,INVITE_DAYS,userId,epoch()).run();
  const code=await mine();if(code)return code;
 }
 throw new DomainError('Не удалось выдать код. Откройте экран ещё раз.',503);
}

type Bonus={days:number;from:number|null;until:number|null};
const bonusOf=(r:Row):Bonus=>{const from=r.starts_at==null?null:Number(r.starts_at);return {days:Number(r.days),from,until:from==null?null:from+Number(r.days)*DAY};};

export async function inviteState(service:RentalService){
 const db=service.db,me=service.userId,at=epoch(),code=await friendCode(db,me);
 const [came,friends,booked,used]=await Promise.all([
  one(db,`SELECT r.code,r.inviter_id,c.kind,c.label,${nameSql('r.inviter_id')} inviter,b.days,b.starts_at FROM invite_redemptions r LEFT JOIN invite_codes c ON c.code=r.code LEFT JOIN invite_bonuses b ON b.user_id=r.user_id AND b.role=r.role AND b.source_id=r.user_id WHERE r.user_id=? AND r.role='owner'`,me),
  rows(db,`SELECT r.user_id,r.redeemed_at,${nameSql('r.user_id')} name,b.days,b.starts_at,b.user_id bonus FROM invite_redemptions r LEFT JOIN invite_bonuses b ON b.user_id=r.inviter_id AND b.role='owner' AND b.source_id=r.user_id WHERE r.inviter_id=? AND r.role='owner' ORDER BY r.redeemed_at DESC LIMIT 50`,me),
  one(db,'SELECT 1 x FROM platform_commissions WHERE owner_id=? LIMIT 1',me),
  one(db,"SELECT COUNT(*) n FROM invite_bonuses WHERE user_id=? AND role='owner' AND source_id<>user_id AND created_at>?",me,at-YEAR),
 ]);
 return {
  code,days:INVITE_DAYS,now:at,
  // The people who came by my code: whether my days for them are waiting for their first booking, running or over.
  friends:friends.map(f=>{const b=f.bonus?bonusOf(f):null;return {name:firstName(f.name)||'Владелец',redeemedAt:Number(f.redeemed_at),bonus:b,state:!b?'limit':b.from==null?'waiting':b.until!>at?'active':'used'};}),
  came:came?{code:String(came.code),by:came.kind==='friend'?firstName(came.inviter):String(came.label||''),partner:came.kind==='partner',bonus:came.days==null?null:bonusOf(came)}:null,
  canRedeem:!came&&!booked,
  limit:{used:Number(used?.n||0),max:INVITER_YEAR_CAP},
 };
}

/** The one who came enters a code: once, as the owner, before the first booking through the service. */
export async function redeemInvite(service:RentalService,body:Row){
 const code=normalizeInviteCode(body.code);
 if(!INVITE_CODE.test(code))throw new DomainError('Проверьте код: латинские буквы и цифры, от 4 до 24 знаков.');
 const db=service.db,me=service.userId,at=epoch();
 const c=await one(db,'SELECT code,kind,user_id,days,active,expires_at FROM invite_codes WHERE code=?',code);
 if(!c||Number(c.active)!==1||(c.expires_at!=null&&Number(c.expires_at)<=at))throw new DomainError('Такого кода нет или он больше не действует.',404);
 if(c.user_id===me)throw new DomainError('Это ваш код. Его вводит владелец, которого вы пригласили.');
 if(await one(db,"SELECT 1 x FROM invite_redemptions WHERE user_id=? AND role='owner'",me))throw new DomainError('Код уже введён. Ввести можно один раз.',409);
 if(await one(db,'SELECT 1 x FROM platform_commissions WHERE owner_id=? LIMIT 1',me))throw new DomainError('Код вводят до первой брони через приложение. У вас брони уже были.',409);
 const inviter=c.kind==='friend'?String(c.user_id):null;
 // Two owners cannot swap codes: the one who invited me does not get a month for my code too.
 if(inviter&&await one(db,"SELECT 1 x FROM invite_redemptions WHERE user_id=? AND inviter_id=? AND role='owner'",inviter,me))throw new DomainError('Этот владелец пришёл по вашему коду. Обменяться кодами нельзя.',409);
 const capped=!!inviter&&Number((await one(db,"SELECT COUNT(*) n FROM invite_bonuses WHERE user_id=? AND role='owner' AND source_id<>user_id AND created_at>?",inviter,at-YEAR))?.n||0)>=INVITER_YEAR_CAP;
 const days=Number(c.days)||INVITE_DAYS;
 // The gate is in the batch too: a booking confirmed or a code entered meanwhile leaves everything as it was.
 const mine="EXISTS(SELECT 1 FROM invite_redemptions WHERE user_id=? AND role='owner' AND code=? AND redeemed_at=?)";
 const r=await db.batch([
  q(db,"INSERT OR IGNORE INTO invite_redemptions(user_id,role,code,inviter_id,redeemed_at) SELECT ?,'owner',?,?,? WHERE NOT EXISTS(SELECT 1 FROM platform_commissions WHERE owner_id=?) AND EXISTS(SELECT 1 FROM invite_codes WHERE code=? AND active=1)",me,code,inviter,at,me,code),
  q(db,`INSERT OR IGNORE INTO invite_bonuses(user_id,role,source_id,code,days,starts_at,created_at) SELECT ?,'owner',?,?,?,NULL,? WHERE ${mine}`,me,me,code,days,at,me,code,at),
  // The yearly cap is counted again here: two owners entering one code at once cannot both take the sixth month.
  ...(inviter&&!capped?[q(db,`INSERT OR IGNORE INTO invite_bonuses(user_id,role,source_id,code,days,starts_at,created_at) SELECT ?,'owner',?,?,?,NULL,? WHERE ${mine} AND (SELECT COUNT(*) FROM invite_bonuses WHERE user_id=? AND role='owner' AND source_id<>user_id AND created_at>?)<?`,inviter,me,code,days,at,me,code,at,inviter,at-YEAR,INVITER_YEAR_CAP)]:[]),
  ...(inviter?[q(db,`INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM invite_bonuses WHERE user_id=? AND role='owner' AND source_id=?) THEN ? ELSE ? END,?,0,? WHERE ${mine}`,uuid(),inviter,inviter,me,
   'По вашему коду пришёл новый владелец. С его первой брони через приложение у вас обоих начнётся месяц без комиссии.','По вашему коду пришёл новый владелец. Ваш лимит приглашений на этот год исчерпан: месяц без комиссии получит только он.',
   'owner:invite:'+me,at,me,code,at)]:[]),
  q(db,`INSERT INTO audit_events SELECT ?,?,?,CASE WHEN ? AND NOT EXISTS(SELECT 1 FROM invite_bonuses WHERE user_id=? AND role='owner' AND source_id=?) THEN ? ELSE ? END,? WHERE ${mine}`,uuid(),me,'invite:'+code,inviter?1:0,inviter,me,JSON.stringify({action:'invite.redeemed',code,kind:c.kind,inviter,capped:true,days}),JSON.stringify({action:'invite.redeemed',code,kind:c.kind,inviter,capped:false,days}),at,me,code,at),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Код не применён: у вас уже есть бронь через приложение или код только что отключили.',409);
 return {message:`Код принят. ${days} дней без комиссии начнутся с первой брони через приложение.`,state:await inviteState(service)};
}

// «Промокоды» for the administrator: partner codes with what they brought, and the friends' codes in sum.
export async function adminInvites(service:RentalService){
 const db=service.db;
 const counts="(SELECT COUNT(*) FROM invite_redemptions r WHERE r.code=c.code) came,(SELECT COUNT(*) FROM invite_bonuses b WHERE b.code=c.code AND b.source_id=b.user_id AND b.starts_at IS NOT NULL) booked,(SELECT COUNT(*) FROM properties p WHERE p.demo_owner IS NULL AND p.archived_at IS NULL AND p.owner_id IN (SELECT r.user_id FROM invite_redemptions r WHERE r.code=c.code)) places";
 const [partners,friends]=await Promise.all([
  rows(db,`SELECT c.code,c.label,c.days,c.active,c.expires_at,c.created_at,${counts} FROM invite_codes c WHERE c.kind='partner' ORDER BY c.active DESC,c.created_at DESC LIMIT 200`),
  one(db,"SELECT COUNT(DISTINCT r.inviter_id) inviters,COUNT(*) came,(SELECT COUNT(*) FROM invite_bonuses b JOIN invite_codes c ON c.code=b.code WHERE c.kind='friend' AND b.source_id=b.user_id AND b.starts_at IS NOT NULL) booked,(SELECT COUNT(*) FROM properties p WHERE p.demo_owner IS NULL AND p.archived_at IS NULL AND p.owner_id IN (SELECT r2.user_id FROM invite_redemptions r2 WHERE r2.inviter_id IS NOT NULL)) places FROM invite_redemptions r WHERE r.inviter_id IS NOT NULL"),
 ]);
 await service.audit(service.userId,'admin.invites_viewed').run();
 const n=(v:unknown)=>Number(v||0);
 return {
  partners:partners.map(p=>({code:String(p.code),label:String(p.label||''),days:n(p.days),active:n(p.active)===1,expiresAt:p.expires_at==null?null:n(p.expires_at),came:n(p.came),booked:n(p.booked),places:n(p.places)})),
  friends:{inviters:n(friends?.inviters),came:n(friends?.came),booked:n(friends?.booked),places:n(friends?.places)},
 };
}

export async function createPartnerCode(service:RentalService,body:Row){
 const code=normalizeInviteCode(body.code),label=String(body.label??'').trim(),days=Number(body.days??INVITE_DAYS);
 if(!INVITE_CODE.test(code))throw new DomainError('Код: латинские буквы и цифры, от 4 до 24 знаков.');
 if(!label||label.length>80)throw new DomainError('Напишите, чей это код: компания или акция, до 80 знаков.');
 if(!Number.isInteger(days)||days<1||days>180)throw new DomainError('Дней без комиссии: от 1 до 180.');
 let expires:number|null=null;
 if(body.until!=null&&body.until!==''){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.until));if(!m)throw new DomainError('Дата окончания: ГГГГ-ММ-ДД.');
  // The end of that day in Kazakhstan (UTC+5).
  expires=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+1)/1000-18000;
  if(!Number.isFinite(expires)||expires<=epoch())throw new DomainError('Дата окончания уже прошла.');
 }
 const at=epoch(),r=await service.db.batch([
  q(service.db,"INSERT OR IGNORE INTO invite_codes(code,kind,user_id,role,days,label,expires_at,created_by,created_at) VALUES (?,'partner',NULL,'owner',?,?,?,?,?)",code,days,label,expires,service.userId,at),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),service.userId,'invite:'+code,JSON.stringify({action:'invite.partner_created',code,label,days,expires}),at),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Такой код уже есть. Придумайте другой.',409);
 return {message:`Код ${code} создан.`,...await adminInvites(service)};
}

export async function setPartnerCodeActive(service:RentalService,body:Row){
 const code=normalizeInviteCode(body.code),active=body.active===true?1:0,at=epoch();
 const r=await service.db.batch([
  q(service.db,"UPDATE invite_codes SET active=? WHERE code=? AND kind='partner' AND active<>?",active,code,active),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),service.userId,'invite:'+code,JSON.stringify({action:active?'invite.partner_enabled':'invite.partner_disabled',code}),at),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Код не найден или уже в этом состоянии.',404);
 return {message:active?`Код ${code} снова действует.`:`Код ${code} отключён. Кто уже ввёл его, дни сохраняют.`,...await adminInvites(service)};
}

/** The page of the link (app/i/[code]): who gives the code and how many days, while it still works. */
export async function inviteCard(db:D1Database,raw:string){
 const code=normalizeInviteCode(raw);if(!INVITE_CODE.test(code))return null;
 const c=await one(db,`SELECT code,kind,days,label,expires_at,${nameSql('user_id')} name FROM invite_codes WHERE code=? AND active=1`,code);
 if(!c||(c.expires_at!=null&&Number(c.expires_at)<=epoch()))return null;
 return {code:String(c.code),days:Number(c.days),friend:c.kind==='friend',by:c.kind==='friend'?firstName(c.name):String(c.label||'')};
}
