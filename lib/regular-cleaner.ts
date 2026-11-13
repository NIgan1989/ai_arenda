import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {cleanerStats,rankCleaners} from './cleaner-match';

// «Моя уборщица»: an owner and a cleaner who work together keep doing it through the service, because the
// service makes it easier than a messenger: her cleanings come to her by themselves, her pay is reserved in
// advance, the pair pays a lower commission, and a replacement is found when she cannot come.

// The owner's free service balance: top-ups minus commissions and cleaning reserves. Same formula as the
// reserve trigger in migration 0044, so the screen and the database agree.
export const availableSql=(owner:string)=>`(COALESCE((SELECT SUM(amount) FROM owner_balance_entries WHERE owner_id=${owner}),0)
 -COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=${owner} AND c.mode='charged' AND (SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')),0)
 -COALESCE((SELECT SUM(amount) FROM cleaning_commissions WHERE owner_id=${owner} AND mode='charged'),0)
 -COALESCE((SELECT SUM(amount) FROM cleaning_holds WHERE owner_id=${owner} AND status IN ('held','due','paid')),0)
 -COALESCE((SELECT SUM(amount) FROM autopilot_charges WHERE user_id=${owner} AND role='owner' AND mode='charged'),0))`;
export async function ownerAvailable(db:D1Database,ownerId:string){return Number((await one(db,`SELECT ${availableSql('?')} n`,ownerId,ownerId,ownerId,ownerId,ownerId))?.n||0);}

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
export type PairTerms={rate:number;pairRate:number;cap:number;active:boolean};
export async function pairTerms(db:D1Database):Promise<PairTerms>{
 const s=await one(db,"SELECT enabled,starts_at,cleaning_rate_bp,pair_rate_bp,pair_month_cap FROM platform_billing WHERE id='global'");
 return {rate:Number(s?.cleaning_rate_bp??1000),pairRate:Number(s?.pair_rate_bp??500),cap:Number(s?.pair_month_cap??2000),active:!!s?.enabled&&Number(s.starts_at)<=epoch()};
}
// One line for both sides about what the pair pays. While the service is free, it says so.
export function pairTermsText(t:PairTerms){
 const pair=t.pairRate<t.rate?`${percent(t.pairRate)} вместо ${percent(t.rate)}`:percent(t.pairRate);
 const fee=`Комиссия за уборку для постоянной пары ${pair}${t.cap>0?`, не больше ${money(t.cap)} в месяц`:''}. Платит владелец, исполнитель получает всю сумму.`;
 return t.active?fee:'Сейчас сервис бесплатный. Когда включится плата: '+fee.charAt(0).toLowerCase()+fee.slice(1);
}

async function ownFlat(service:RentalService,propertyId:string){
 const p=await one(service.db,'SELECT id,title,city,own_staff FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL',propertyId,service.userId);
 if(!p)throw new DomainError('Жильё недоступно.',403);return p;
}

// What the owner sees on «Моя уборщица»: the pinned cleaner or the best candidates to pin, the guarantee and the terms.
export async function regularState(service:RentalService,propertyId:string){
 await service.requireRole('owner');const p=await ownFlat(service,propertyId),db=service.db,at=epoch();
 const pinned=await one(db,'SELECT r.cleaner_id id,r.created_at since,c.name FROM regular_cleaners r JOIN profiles c ON c.id=r.cleaner_id WHERE r.property_id=?',p.id);
 // Candidates: cleaners who already worked for this owner or answered this flat's cleanings.
 const known=pinned?[]:await rows(db,`SELECT DISTINCT c.id,c.name FROM profiles c WHERE EXISTS(SELECT 1 FROM json_each(c.roles) WHERE value='cleaner') AND c.id<>? AND (
  EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.assigned_to=c.id AND j.owner_id=? AND j.status IN ('assigned','in_progress','submitted','completed'))
  OR EXISTS(SELECT 1 FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE a.user_id=c.id AND j.property_id=?)) LIMIT 20`,service.userId,service.userId,p.id);
 const stats=await cleanerStats(db,pinned?[{id:pinned.id,name:pinned.name}]:known,p.id,at);
 const ranked=rankCleaners(stats).map(c=>({id:c.id,name:c.name,here:c.here,completed:c.completed,noShows:c.noShows,reasons:c.reasons}));
 const [available,next,terms,month]=await Promise.all([
  ownerAvailable(db,service.userId),
  // The next cleaning's fee, or the last one's when nothing is planned yet.
  one(db,"SELECT fee FROM cleaning_jobs WHERE property_id=? AND fee>0 ORDER BY status IN ('open','assigned') AND end>? DESC,start DESC LIMIT 1",p.id,at),
  pairTerms(db),
  pinned?one(db,"SELECT COUNT(*) n,COALESCE(SUM(amount),0) paid FROM cleaning_commissions WHERE owner_id=? AND cleaner_id=? AND pair=1 AND created_at>=CAST(strftime('%s',date('now','+5 hours','start of month')) AS INTEGER)-18000",service.userId,pinned.id):null,
 ]);
 const fee=Number(next?.fee||0);
 return {
  property:{id:p.id,title:p.title},
  regular:pinned?{...ranked[0],since:pinned.since}:null,
  candidates:pinned?[]:ranked.slice(0,5),
  guarantee:{available,fee,covered:fee>0?Math.floor(Math.max(0,available)/fee):0},
  terms:{...terms,text:pairTermsText(terms),monthCommission:Number(month?.paid||0)},
 };
}

export async function pinRegular(service:RentalService,body:Row){
 await service.requireRole('owner');const p=await ownFlat(service,required(body.propertyId,'Жильё',100)),cleanerId=required(body.cleanerId,'Исполнитель',100),at=epoch();
 const c=await one(service.db,"SELECT id,name FROM profiles WHERE id=? AND id<>? AND EXISTS(SELECT 1 FROM json_each(roles) WHERE value='cleaner')",cleanerId,service.userId);
 if(Number(p.own_staff))throw new DomainError('Здесь убирает свой персонал: постоянный исполнитель не нужен.',409);
 if(!c)throw new DomainError('Исполнитель не найден.',404);
 const before=await one(service.db,'SELECT cleaner_id FROM regular_cleaners WHERE property_id=?',p.id);
 if(before?.cleaner_id===c.id)return {message:`${c.name} уже ваш постоянный исполнитель.`};
 const terms=await pairTerms(service.db),statements=[
  q(service.db,'INSERT INTO regular_cleaners(property_id,owner_id,cleaner_id,created_at) VALUES (?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET cleaner_id=excluded.cleaner_id,created_at=excluded.created_at',p.id,service.userId,c.id,at),
  service.audit(p.id,JSON.stringify({action:'regular_cleaner.pinned',cleanerId:c.id,previous:before?.cleaner_id||null})),
  service.notify(c.id,`Вы постоянный исполнитель объекта «${p.title}». Все уборки этого жилья сначала приходят вам, ваше «да» сразу назначает вас. Если на балансе владельца есть деньги, оплата резервируется заранее и приходит после приёмки. ${pairTermsText(terms)}`,'regular:'+p.id+':'+at,'cleaner'),
 ];
 if(before)statements.push(service.notify(before.cleaner_id,`Владелец закрепил за объектом «${p.title}» другого исполнителя. Уже назначенные вам уборки остаются за вами.`,'regular-ended:'+p.id+':'+at,'cleaner'));
 await service.db.batch(statements);
 return {message:`${c.name} теперь ваш постоянный исполнитель. Уборки «${p.title}» будут приходить сначала к нему.`};
}

// Either side can end the pair: the owner from the flat, the cleaner from her list.
export async function unpinRegular(service:RentalService,role:string,body:Row){
 const propertyId=required(body.propertyId,'Жильё',100);
 const r=await one(service.db,'SELECT r.*,p.title,c.name FROM regular_cleaners r JOIN properties p ON p.id=r.property_id JOIN profiles c ON c.id=r.cleaner_id WHERE r.property_id=?',propertyId);
 const mine=role==='owner'?r?.owner_id===service.userId:role==='cleaner'&&r?.cleaner_id===service.userId;
 if(!r||!mine)throw new DomainError('Закрепление не найдено.',404);
 const at=epoch(),other=role==='owner'?r.cleaner_id:r.owner_id;
 await service.db.batch([
  q(service.db,'DELETE FROM regular_cleaners WHERE property_id=? AND cleaner_id=?',propertyId,r.cleaner_id),
  service.audit(propertyId,JSON.stringify({action:'regular_cleaner.unpinned',by:role,cleanerId:r.cleaner_id})),
  service.notify(other,role==='owner'?`Владелец снял закрепление объекта «${r.title}». Уже назначенные уборки остаются за вами.`:`${r.name} больше не постоянный исполнитель «${r.title}». Уборки этого жилья AI администратор будет предлагать лучшим свободным исполнителям.`,'regular-ended:'+propertyId+':'+at,role==='owner'?'cleaner':'owner'),
 ]);
 return {message:role==='owner'?'Закрепление снято.':'Вы больше не постоянный исполнитель этого объекта.'};
}

// The cleaner's side: her regular flats and her money from the service.
export async function cleanerRegulars(service:RentalService){
 const db=service.db,[flats,money,terms]=await Promise.all([
  rows(db,'SELECT r.property_id,r.created_at since,p.title,p.city,p.district,o.name owner_name,(SELECT COUNT(*) FROM cleaning_jobs j WHERE j.property_id=r.property_id AND j.assigned_to=r.cleaner_id AND j.status=\'completed\') done FROM regular_cleaners r JOIN properties p ON p.id=r.property_id JOIN profiles o ON o.id=r.owner_id WHERE r.cleaner_id=? ORDER BY r.created_at DESC',service.userId),
  one(db,"SELECT COALESCE(SUM(CASE WHEN status='held' THEN amount END),0) held,COALESCE(SUM(CASE WHEN status='due' THEN amount END),0) due,COALESCE(SUM(CASE WHEN status='paid' THEN amount END),0) paid FROM cleaning_holds WHERE cleaner_id=?",service.userId),
  pairTerms(db),
 ]);
 return {flats,money:{held:Number(money?.held||0),due:Number(money?.due||0),paid:Number(money?.paid||0)},terms:pairTermsText(terms)};
}

// Platform admin: reserves due to cleaners and the payout mark. Until bank payouts exist the service pays by hand
// (Kaspi) and marks it here; the mark settles the cleaning in the owner's journal and tells the cleaner.
export async function cleanerPayouts(db:D1Database){
 const [due,totals]=await Promise.all([
  rows(db,"SELECT h.job_id,h.amount,h.due_at,h.cleaner_id,c.name cleaner_name,c.contact cleaner_contact,o.name owner_name,p.title FROM cleaning_holds h JOIN profiles c ON c.id=h.cleaner_id JOIN profiles o ON o.id=h.owner_id JOIN properties p ON p.id=h.property_id WHERE h.status='due' ORDER BY h.due_at,h.job_id LIMIT 50"),
  one(db,"SELECT COALESCE(SUM(CASE WHEN status='held' THEN amount END),0) held,COALESCE(SUM(CASE WHEN status='due' THEN amount END),0) due,COALESCE(SUM(CASE WHEN status='paid' AND paid_at>=? THEN amount END),0) paid30 FROM cleaning_holds",epoch()-30*86400),
 ]);
 const commissions=await one(db,"SELECT COUNT(*) n,COALESCE(SUM(amount),0) amount,COALESCE(SUM(CASE WHEN pair=1 THEN 1 END),0) pairs,COALESCE(SUM(CASE WHEN mode='charged' THEN amount END),0) charged FROM cleaning_commissions WHERE created_at>=?",epoch()-30*86400);
 const pairs=await one(db,'SELECT COUNT(*) n FROM regular_cleaners');
 for(const d of due)d.withhold=(await withholdPlan(db,d.cleaner_id,d.amount)).total;
 return {due,held:Number(totals?.held||0),dueTotal:Number(totals?.due||0),paid30:Number(totals?.paid30||0),commissions30:{count:Number(commissions?.n||0),amount:Number(commissions?.amount||0),pairs:Number(commissions?.pairs||0),charged:Number(commissions?.charged||0)},pairs:Number(pairs?.n||0)};
}

// A cleaner's «Автопилот» months are withheld from the cleaner's payouts, oldest first; a payout smaller than a
// month takes what it can and the rest comes from the next one.
async function withholdPlan(db:D1Database,cleaner:string,amount:number){
 const owed=await rows(db,"SELECT id,amount,withheld FROM autopilot_charges WHERE user_id=? AND role='cleaner' AND mode='charged' AND settled_at IS NULL ORDER BY created_at,id",cleaner);
 const parts:{id:string;take:number;withheld:number;done:boolean}[]=[];let total=0;
 for(const c of owed){const left=Number(c.amount)-Number(c.withheld),take=Math.min(left,amount-total);if(take<=0)break;parts.push({id:c.id,take,withheld:Number(c.withheld),done:take===left});total+=take;}
 return {parts,total};
}
export async function markCleanerPayout(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите, что деньги отправлены исполнителю.');
 const jobId=required(body.jobId,'Уборка',100),note=String(body.note||'').trim().slice(0,300),at=epoch();
 const h=await one(service.db,"SELECT h.*,p.title FROM cleaning_holds h JOIN properties p ON p.id=h.property_id WHERE h.job_id=? AND h.status='due'",jobId);
 if(!h)throw new DomainError('Выплата уже отмечена или ещё не положена.',409);
 const plan=await withholdPlan(service.db,h.cleaner_id,h.amount),net=h.amount-plan.total;
 // The administrator transferred the net amount shown on the sheet: refuse if the deduction changed since.
 if(Number(body.withhold||0)!==plan.total)throw new DomainError(`Удержание за автопилот изменилось: теперь ${money(plan.total)}, к выплате ${money(net)}. Обновите раздел и проверьте сумму перевода.`,409);
 const entry=uuid(),r=await service.db.batch([
  q(service.db,"UPDATE cleaning_holds SET status='paid',paid_at=?,paid_by=?,payout_note=? WHERE job_id=? AND status='due'",at,service.userId,note,jobId),
  q(service.db,"INSERT INTO finance_entries(id,owner_id,property_id,booking_id,job_id,kind,amount,currency,source,external_reference,note,actor_id,request_key,created_at) SELECT ?,owner_id,property_id,NULL,job_id,'job_payment',amount,'KZT','provider','',?,'system:cleaner-payout',?,? FROM cleaning_holds WHERE job_id=? AND status='paid' AND paid_at=? AND changes()>0",entry,'Выплата через сервис из резерва'+(note?': '+note:''),'hold-payout:'+jobId,at,jobId,at),
  q(service.db,"UPDATE cleaning_jobs SET settled_at=? WHERE id=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",at,jobId,entry),
  // The service-paid row is the job's ledger entry: mark the job migrated so the legacy backfill does not add a second one.
  q(service.db,"INSERT OR IGNORE INTO finance_backfill_receipts SELECT ?,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",'job:'+jobId,at,entry),
  q(service.db,"INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",uuid(),service.userId,jobId,JSON.stringify({action:'cleaning.payout_marked',amount:h.amount}),at,entry),
  q(service.db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",uuid(),h.cleaner_id,`Сервис отправил вам ${money(net)} за уборку «${h.title}»`+(plan.total?`: ${money(h.amount)} минус ${money(plan.total)} за автопилот.`:'.'),'cleaner:payout:'+jobId,at,entry),
  q(service.db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",uuid(),h.owner_id,`Исполнитель получил ${money(h.amount)} за уборку «${h.title}» из резерва на вашем балансе. Рассчитываться отдельно не нужно.`,'owner:payout:'+jobId,at,entry),
  ...plan.parts.map(c=>q(service.db,'UPDATE autopilot_charges SET withheld=withheld+?,settled_at=?,settled_job=? WHERE id=? AND settled_at IS NULL AND withheld=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)',c.take,c.done?at:null,jobId,c.id,c.withheld,entry))
 ]);
 if(!r[0].meta.changes)throw new DomainError('Выплата уже отмечена.',409);
 return {message:`Выплата ${money(net)} отмечена`+(plan.total?` (удержано ${money(plan.total)} за автопилот)`:'')+'. Исполнитель получил уведомление.'};
}
