import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {ensurePlan} from './autopilot-plans';

// The owner's autopilot for one flat is one choice instead of five switches on two screens:
// quick requests, the AI's instant answer to them, booking confirmation with a cleaning job,
// offers to free cleaners, assignment from those who agreed, and replacement of a no-show.
// Every automatic step still runs through the existing checks: calendar, tariff, policy version,
// mandate expiry, cleaning budget, the cleaner's consent and overlaps.
export type GuestMode='off'|'manual'|'auto';
export const guestModes:GuestMode[]=['off','manual','auto'];

// SQL for one flat's mode; `p` is properties, the other aliases are joined by guestModeJoins.
export const guestModeSql=`CASE WHEN COALESCE(m.enabled,0)=0 THEN 'off' WHEN pp.auto_confirm=1 AND pp.auto_assign=1 AND r.auto_offers=1 AND r.auto_replace=1 AND pp.cleaning_fee>0 AND (pp.mandate_until=0 OR pp.mandate_until>?) THEN 'auto' ELSE 'manual' END`;
export const guestModeJoins='LEFT JOIN matching_preferences m ON m.property_id=p.id LEFT JOIN property_policies pp ON pp.property_id=p.id LEFT JOIN operation_rules r ON r.property_id=p.id';

export async function setGuestMode(s:RentalService,body:Row){
 await s.requireRole('owner');
 const mode=body.mode as GuestMode;
 if(!guestModes.includes(mode))throw new DomainError('Выберите, кто отвечает гостям.');
 const p=await one(s.db,'SELECT id,title FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Квартира',100),s.userId);
 if(!p)throw new DomainError('Объект недоступен.',404);
 const t=epoch(),auto=mode==='auto'?1:0,db=s.db;
 const policy=await one(db,'SELECT * FROM property_policies WHERE property_id=?',p.id),rules=await one(db,'SELECT * FROM operation_rules WHERE property_id=?',p.id);
 let fee=Number(policy?.cleaning_fee||0);
 if(auto){
  if(!policy)throw new DomainError('Сначала заполните тарифы квартиры: по ним ИИ отвечает гостям.',409);
  if(body.cleaningFee!==undefined&&body.cleaningFee!==null&&body.cleaningFee!=='')fee=number(body.cleaningFee,'Стоимость уборки',100,1000000);
  if(fee<100)throw new DomainError('Укажите стоимость уборки: по ней ИИ заказывает уборку после каждого выезда.',422);
  // The same tariff floor savePolicy enforces before any automatic confirmation.
  const daily=Number((await one(db,'SELECT price FROM properties WHERE id=?',p.id))?.price||0);
  if(policy.minimum_rate&&[daily,policy.hourly_price,policy.nightly_price].some(rate=>rate>0&&rate<policy.minimum_rate))throw new DomainError('Один из тарифов ниже минимальной разрешённой ставки. Исправьте тарифы квартиры.',409);
  if(policy.mandate_until&&policy.mandate_until<=t)throw new DomainError('Срок полномочий в правилах квартиры истёк. Продлите его или очистите поле.',409);

  // A check only validates: the plan is paid for the flats that pass, before any is switched.
  if(body.check===true)return {ok:true};
  // «ИИ» is the paid «Автопилот» plan: the first flat starts the free trial, a paused plan pays its month first.
  await ensurePlan(db,s.userId,'owner',t);
 }
 const statements:D1PreparedStatement[]=[q(db,'INSERT INTO matching_preferences VALUES (?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET enabled=excluded.enabled,owner_id=excluded.owner_id,updated_at=excluded.updated_at',p.id,s.userId,mode==='off'?0:1,t)];
 // A new policy version expires answers given under the old one, so bump it only when something changes.
 const policyChanged=!!policy&&(policy.auto_confirm!==auto||policy.auto_assign!==auto||Number(policy.cleaning_fee)!==fee);
 if(policyChanged)statements.push(q(db,'UPDATE property_policies SET auto_confirm=?,auto_assign=?,cleaning_fee=?,cleaning_budget=MAX(cleaning_budget,?),version=version+1,revision=?,updated_at=? WHERE property_id=? AND version=?',auto,auto,fee,fee,uuid(),t,p.id,policy.version));
 if(auto?!rules||!rules.auto_offers||!rules.auto_replace:!!rules&&(!!rules.auto_offers||!!rules.auto_replace))
  statements.push(q(db,'INSERT INTO operation_rules VALUES (?,?,?,0,10,1,?) ON CONFLICT(property_id) DO UPDATE SET auto_offers=excluded.auto_offers,auto_replace=excluded.auto_replace,version=operation_rules.version+1,updated_at=excluded.updated_at',p.id,auto,auto,t));
 statements.push(q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,p.id,JSON.stringify({action:'property.guest_mode',mode,cleaningFee:auto?fee:undefined}),t));
 const result=await db.batch(statements);
 if(policyChanged&&!result[1].meta.changes)throw new DomainError('Правила квартиры уже изменились. Обновите экран.',409);
 return {message:mode==='auto'?'Автопилот включён: ИИ отвечает гостям, подтверждает брони и организует уборку в пределах ваших правил.':mode==='manual'?'Запросы гостей приходят вам, отвечаете вы.':'Быстрые запросы гостей выключены.'};
}

// SQL: the flat is under autopilot right now (one ? for the current time). Same conditions as guestModeSql's 'auto'.
export const underAutopilot=(property:string)=>`EXISTS(SELECT 1 FROM property_policies pp JOIN operation_rules r ON r.property_id=pp.property_id JOIN matching_preferences m ON m.property_id=pp.property_id WHERE pp.property_id=${property} AND pp.auto_confirm=1 AND pp.auto_assign=1 AND pp.cleaning_fee>0 AND r.auto_offers=1 AND r.auto_replace=1 AND m.enabled=1 AND (pp.mandate_until=0 OR pp.mandate_until>?))`;

// The AI answers only for a flat shown as «ИИ»: the same conditions as guestModeSql's 'auto'.
const autopilotGate=(property:string,version:string)=>`EXISTS(SELECT 1 FROM property_policies pp JOIN operation_rules r ON r.property_id=pp.property_id JOIN matching_preferences m ON m.property_id=pp.property_id WHERE pp.property_id=${property} AND pp.version=${version} AND pp.auto_confirm=1 AND pp.auto_assign=1 AND pp.cleaning_fee>0 AND r.auto_offers=1 AND r.auto_replace=1 AND m.enabled=1 AND (pp.mandate_until=0 OR pp.mandate_until>?))`;

// Called right after a wave of quick requests is sent. Under an active mandate to confirm bookings,
// the AI answers "ready" for the owner: the same quote check a manual answer runs, done at once.
export async function autoAnswerOffers(s:RentalService,requestId:string){
 const t=epoch();
 const offers=await rows(s.db,`SELECT o.id,o.property_id,o.owner_id,o.amount,o.policy_version,r.filters,r.guest_id,p.title FROM matching_offers o JOIN matching_requests r ON r.id=o.request_id JOIN properties p ON p.id=o.property_id
  WHERE o.request_id=? AND o.status='pending' AND o.expires_at>? AND ${autopilotGate('o.property_id','o.policy_version')} ORDER BY o.created_at,o.id`,requestId,t,t);
 let answered=0;
 for(const offer of offers){
  const filters=JSON.parse(offer.filters);
  let quote:Row;try{quote=await s.bookingQuote({...filters,propertyId:offer.property_id,billingMode:filters.mode});}catch(error){if(error instanceof DomainError)continue;throw error;}
  if(quote.amount!==offer.amount||quote.policy.version!==offer.policy_version)continue;
  const audit=uuid(),result=await s.db.batch([
   q(s.db,`UPDATE matching_offers SET status='accepted',responded_at=?,expires_at=? WHERE id=? AND status='pending' AND expires_at>? AND ${autopilotGate('matching_offers.property_id','matching_offers.policy_version')} AND EXISTS(SELECT 1 FROM matching_requests r WHERE r.id=matching_offers.request_id AND r.status IN ('searching','ready') AND r.expires_at>?)`,t,t+300,offer.id,t,t,t),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',audit,'system:autopilot',offer.property_id,JSON.stringify({action:'matching.auto_answered',offerId:offer.id,onBehalfOf:offer.owner_id,amount:offer.amount,policyVersion:offer.policy_version}),t),
   q(s.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',uuid(),offer.owner_id,'AI администратор ответил гостю за вас: «'+offer.title+'» свободна, '+new Intl.NumberFormat('ru-RU').format(offer.amount)+' ₸ по вашему тарифу. Если гость выберет квартиру, бронь подтвердится по вашим правилам.','owner:matching-auto:'+offer.id,t,audit),
   q(s.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',uuid(),offer.guest_id,'Владелец ответил на ваш подбор. Откройте карту, чтобы посмотреть предложение.','guest:matching-response:'+offer.id,t,audit)
  ]);
  answered+=Number(result[0].meta.changes>0);
 }
 return answered;
}
