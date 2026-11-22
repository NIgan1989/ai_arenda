import {wordsOf,venueOr,TYPE_SQL} from './stay-words';
import {unreadyNote} from './unready';
import {reliabilityFor} from './reliability';
import {CHECKIN_LEAD_SECONDS,checkinOpensAt,checkinOpensLabel} from './checkin-window';
import {arrivalSteps,arrivalCodes,busyAround} from './arrival-ready';
import {afterReady,allowEarlyCheckin,extendCleaningBefore,shiftedStay,shiftReason,SHIFT_CHOICES,SHIFT_LIMIT} from './arrival-shift';
import {assessBookingRisk,riskSignals,saveRiskSql,riskLabel,riskFromRow} from './booking-risk';
import { DomainError, required, number, interval, quote, roles, assistantReply, type Role } from './domain';
import { ratingsFor } from './stay-reviews';
import { markDeals } from './price-deal';
import { generateAnswer, assistantContext, type AIConfig,type AIToolExecutor } from './ai';
import { operationOverview } from './operations';
import { defaultPolicy,publicPolicy,policyInput,rentalPrice,changeRentalPrice,mandateActive ,withGuests,withRepeatDiscount,tooSoon,prepSeconds,prepWords} from './rental-policy';
import { parseRole,commandRole } from './access';
import {assistantBrief,defaultAssistantSettings} from './assistant';
import {defaultAccountSettings,accountSettingsInput,userSearchInput} from './account';
import {approvalCards} from './approvals';
import {hasContacts,hasContactWays,MIN_PHOTOS} from './listing-rules';
import {phoneOpens} from './chat-guard';
import {listingInput,jpegInput,propertyStatus,cleanerStatus,categories,kindCategory,isBanquet,isBath,occasions,occasionLabel,searchCategory} from './listings';
import {mediaKey,dataUrlBytes,mediaData} from './media-store';
import {CANCELLED_AFTER_ARRIVAL,NOT_LET_IN} from './stay-result';
import {readAdministratorState} from './administrator';
import {recordFinance,migrateFinanceEntity} from './finance';
import {payoutOf,payoutPhoneText} from './payout';
import {prepaySum,prepayLabel,prepayState,dueNow,payoutOpen,prepayOf} from './prepay';
import {placePrepay} from './prepay-db';
import {requireEvidence} from './evidence';
import {hash as operationHash} from './operation-core';
import {assertCalendarAvailable} from './external-calendar';
import {cancellationTerms} from './cancellation';
import {assertPilotAllowed,cleanerAdmission,readPilotPolicy,pilotPropertyVisibleSql} from './pilot-governance';
import {mapCities} from './map-location';
import {publicPoint} from './map-workspace';
import {streetAddress} from './job-place';
import {createAIBudgetLifecycle} from './ai-budget';
import {aiDataPermission} from './ai-data-permission';
import {administratorSearch,isPropertySearch,isSearchRefinement,previousAdministratorSearch} from './administrator-search';
import {readAdministratorProcesses,processReadIntent} from './administrator-process-read';
import {accrueCommission,accrueAiBookingFee,recalcCommission} from './platform-billing';
import {offerPriceAdvice,ownerPriceSuggestions,decidePriceSuggestion} from './price-advice';
import {guestStayOffers,decideStayOffer} from './stay-offers';
import {guestFavorites} from './favorites';
import {staffPlaces} from './staff';
import {homePlaces,homeDeals} from './home-order';
import {homeChecklist,homeOrderOf,homeCancel,tenge,HOME_DAMAGE_WINDOW} from './home-cleaning';
import {venuesFor} from './venue';
import {pickRoom,roomCounts,roomState} from './room-units';
import {ownerForecasts,decideForecast} from './load-forecast';
import {ownerListingTips,decideListingTip} from './listing-quality';
import {ownerCleaningTips,decideCleaningTip} from './cleaning-price';
import {releaseStatements,releaseWindow} from './overdue-cleaning';
import {lateUntil,LATE_OPENS} from './late-arrival';
import {reportNotLetIn,BLOCKED_TEXT} from './account-restrictions';
import {verifiedPlaceSql} from './property-rights';
import {requireIdentity,identityOf} from './identity-docs';
import {ruleFor,minutesLabel} from './decision-rules';
import {ownerWindows,decideCalendarWindow,openWindowFor,openWindowsFor,openWindowsIn,windowAt,windowQuote} from './calendar-windows';
import {languageOf} from './user-language';

type Row = Record<string, any>;
const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
const clockLabel=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const HISTORY_TABLES=['bookings','cleaning_jobs','finance_entries','platform_commissions','access_receipts','administrator_issues','administrator_tasks','matching_offers','review_property_bindings'];
const SETTINGS_TABLES=['property_details','property_locations','property_operations','property_policies','operation_rules','matching_preferences','property_access','calendar_exports','property_import_links','guest_favorites','property_staff','venue_halls','room_units'];
// How far a stay may move its cleaning while the assigned cleaner keeps it: a late checkout or a few extra hours, not another day.
const KEEP_SHIFT=3*3600;
// The owner's Kaspi number is the owner's phone as a rule. Before the phone opens (a day before the check-in) a guest
// who prepays gets only the Kaspi pay link when the owner gave one; without a link the number is needed to pay at all.
const guestPayout=(pay:Row,open:boolean)=>open||!pay.link?pay:{...pay,phone:''};
// The phone of the other side of a booking opens a day before the check-in of a confirmed booking (lib/chat-guard.ts phoneOpens).
const PHONE_OPEN_SQL="(b.status='completed' OR (b.status='confirmed' AND CAST(strftime('%s','now') AS INTEGER)>=b.start-86400))";
const PROFILE_CONTACTS='Уберите из профиля телефон, ссылки и мессенджеры: участники связываются через чат сервиса, а телефон открывается за сутки до заезда.';
// What a kind of place is sold by, the same for a new booking and for a change of one (audit of 2026-11-22): a bath or
// a sauna by the hour only, a banquet hall or a cafe only by the lunch or the evening of one day, by the Kazakhstan clock.
// One card per lead (lib/room-units.ts): the first of its rooms found stands for it, with the count of rooms found.
export function collapseRooms(items:Row[],leads:Map<string,string>,counts:Map<string,number>,timed:boolean){
  const seen=new Map<string,Row>(),out:Row[]=[];
  for(const row of items){
    const {room_lead:_lead,...p}=row,lead=leads.get(String(p.id))||String(p.id),total=counts.get(lead)||1;
    if(total<2){out.push(p);continue;}
    const first=seen.get(lead);
    if(first){if(timed)first.units.free++;continue;}
    const card={...p,units:timed?{total,free:1}:{total}};seen.set(lead,card);out.push(card);
  }
  return out;
}
/** The guest said «Я оплатил» and the owner has not answered yet: the transfer is «на проверке». */
export const onReview=(terms:Row|null|undefined)=>!!(terms?.payment_reported_at||terms?.deposit_reported_at);
export function kindMode(kind:string,mode:unknown,start:number,end:number){
  if(isBath(kind)){
    if(mode!==undefined&&mode!==null&&mode!==''&&mode!=='hourly')throw new DomainError('Баню и сауну бронируют по часам.');
    return 'hourly';
  }
  if(isBanquet(kind)){
    const slotStart=(start+18000)%86400,slot=slotStart===12*3600?5:slotStart===18*3600?6:0;
    if((mode!==undefined&&mode!==null&&mode!==''&&mode!=='daily')||!slot||end-start!==slot*3600)throw new DomainError('Банкетный зал бронируют на обед или на вечер одного дня: 12:00–17:00 или 18:00–00:00.');
    return 'daily';
  }
  return mode||'daily';
}
export class RentalService {
  constructor(public db: D1Database, public userId: string, private execution?:{propertyId:string;policyVersion:number}) {}
  query(sql: string, ...args: any[]) { return this.db.prepare(sql).bind(...args); }
  async one(sql: string, ...args: any[]) { return this.query(sql, ...args).first<Row>(); }
  async all(sql: string, ...args: any[]) { return (await this.query(sql, ...args).all<Row>()).results; }
  async profile() { return this.one(`SELECT p.*,d.avatar_id,d.work_status,COALESCE(d.version,0) profile_version,COALESCE(x.bio,'') bio,COALESCE(x.languages,'') languages,COALESCE(x.avatar_visibility,'participants') avatar_visibility,COALESCE(x.show_presence,1) show_presence,COALESCE(x.show_receipts,1) show_receipts,(SELECT kind FROM account_restrictions r WHERE r.user_id=p.id) restriction FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id LEFT JOIN profile_preferences x ON x.user_id=p.id WHERE p.id=?`, this.userId); }
  async uploadMedia(body:Row,bucket?:R2Bucket){
    if(!await this.profile())throw new DomainError('Сначала заполните профиль.',403);
    if(body.kind==='property')await this.requireRole('owner');
    await this.query("DELETE FROM media WHERE user_id=? AND created_at<? AND NOT EXISTS(SELECT 1 FROM property_details d,json_each(d.photos) f WHERE f.value=media.id) AND NOT EXISTS(SELECT 1 FROM profile_details d WHERE d.avatar_id=media.id)",this.userId,now()-86400).run();
    const image=jpegInput(body.data,body.kind),mediaId=id(),key=bucket&&body.kind==='property'?mediaKey(mediaId):'';
    if(key)await bucket!.put(key,dataUrlBytes(image.data),{httpMetadata:{contentType:'image/jpeg'}});
    const r=await this.query('INSERT INTO media(id,user_id,kind,data,width,height,bytes,created_at,object_key) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM media WHERE user_id=?)<100',mediaId,this.userId,body.kind,key?'':image.data,image.width,image.height,image.bytes,now(),key,this.userId).run();
    if(!r.meta.changes){if(key)await bucket!.delete(key);throw new DomainError('Достигнут лимит фотографий. Удалите неиспользуемые снимки.',409);}
    return {id:mediaId,width:image.width,height:image.height};
  }
  async readMedia(mediaId:string,activeRole?:Role,bucket?:R2Bucket){
    const role=activeRole||(JSON.parse((await this.profile())?.roles||'[]').includes('owner')?'owner':JSON.parse((await this.profile())?.roles||'[]').includes('cleaner')?'cleaner':'guest');
    const m=await this.one(`SELECT m.data,m.object_key,m.width,m.height FROM media m WHERE m.id=? AND (m.user_id=? OR (m.kind='property' AND EXISTS(SELECT 1 FROM property_details d JOIN properties p ON p.id=d.property_id,json_each(d.photos) f WHERE f.value=m.id AND (p.demo_owner IS NULL OR p.demo_owner=?) AND ((p.published=1 AND ${pilotPropertyVisibleSql('p')}) OR (?='cleaner' AND EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.property_id=p.id AND (j.assigned_to=? OR (j.status='open' AND j.end>?))))))) OR (m.kind='avatar' AND EXISTS(SELECT 1 FROM profile_details d LEFT JOIN profile_preferences x ON x.user_id=d.user_id WHERE d.avatar_id=m.id AND COALESCE(x.avatar_visibility,'participants')='participants' AND (
      (?='owner' AND (EXISTS(SELECT 1 FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE a.user_id=d.user_id AND j.owner_id=?) OR EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.assigned_to=d.user_id AND j.owner_id=?))) OR
      (?='guest' AND EXISTS(SELECT 1 FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? AND p.owner_id=d.user_id AND b.status='confirmed')) OR
      (?='cleaner' AND EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.assigned_to=? AND j.owner_id=d.user_id))
    ))))`,mediaId,this.userId,this.userId,role,this.userId,now(),role,this.userId,this.userId,role,this.userId,role,this.userId);
    if(!m)throw new DomainError('Фотография недоступна.',404);return this.mediaBody(m,bucket);
  }
  async mediaBody(m:Row,bucket?:R2Bucket){
    try{return {data:await mediaData(m,bucket),width:m.width,height:m.height};}catch{throw new DomainError('Хранилище фото сейчас недоступно.',503);}
  }
  async deleteMedia(mediaId:string,bucket?:R2Bucket){
    if(!await this.one('SELECT id FROM media WHERE id=? AND user_id=?',mediaId,this.userId))throw new DomainError('Фотография недоступна.',404);
    if(await this.one("SELECT d.property_id FROM property_details d,json_each(d.photos) f WHERE f.value=? UNION ALL SELECT user_id FROM profile_details WHERE avatar_id=?",mediaId,mediaId))throw new DomainError('Сначала уберите фотографию из объявления или профиля.',409);
    const gone=await this.query('DELETE FROM media WHERE id=? AND user_id=? RETURNING object_key',mediaId,this.userId).first<Row>();if(gone?.object_key)await bucket?.delete(gone.object_key).catch(()=>{});return {message:'Неиспользуемая фотография удалена.'};
  }
  async checkMedia(photoIds:string[],kind:string){for(const photoId of photoIds)if(!await this.one('SELECT id FROM media WHERE id=? AND user_id=? AND kind=?',photoId,this.userId,kind))throw new DomainError('Фотография не принадлежит вашему аккаунту или имеет другой тип.',403);}
  async editProfile(body:Row){
    const p=await this.profile();if(!p)throw new DomainError('Профиль не найден.',404);
    const version=number(body.expectedVersion,'Версия профиля',0,10000000),avatar=body.avatarId||null;
    if(p.profile_version!==version)throw new DomainError('Профиль уже изменился. Обновите форму.',409);
    if(avatar)await this.checkMedia([required(avatar,'Фото профиля',100)],'avatar');
    if(!['available','away'].includes(body.workStatus))throw new DomainError('Выберите доступность для заданий.');
    const name=required(body.name,'Имя',100),contact=required(body.contact,'Контакт',120),city=required(body.city,'Город',80),districts=String(body.districts||'').trim(),experience=String(body.experience||'').trim(),availability=String(body.availability||'').trim();
    if(districts.length>300||experience.length>1000||availability.length>300)throw new DomainError('Проверьте длину полей анкеты.');
    if(JSON.parse(p.roles).includes('cleaner')&&(!districts||!experience||!availability))throw new DomainError('Заполните районы, опыт и график исполнителя.');
    const bio=String(body.bio??p.bio??'').trim(),languages=String(body.languages??p.languages??'').trim(),visibility=body.avatarVisibility??p.avatar_visibility??'participants';
    if(bio.length>500||languages.length>100||!['participants','self'].includes(visibility))throw new DomainError('Проверьте описание, языки и видимость профиля.');
    // Other participants read «О себе» and the cleaner's form: no phone, links or messengers there (lib/chat-guard.ts).
    if([bio,experience,availability,districts].some(hasContactWays))throw new DomainError(PROFILE_CONTACTS,422);
    const presence=body.showPresence===undefined?(p.show_presence??1):body.showPresence===true?1:0,receipts=body.showReceipts===undefined?(p.show_receipts??1):body.showReceipts===true?1:0;
    const revision=id(),r=await this.db.batch([
      this.query('INSERT INTO profile_details VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_id=excluded.avatar_id,work_status=excluded.work_status,version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE profile_details.version=?',this.userId,avatar,body.workStatus,version+1,revision,now(),version),
      this.query('UPDATE profiles SET name=?,contact=?,city=?,districts=?,experience=?,availability=? WHERE id=? AND EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND revision=?)',name,contact,city,districts,experience,availability,this.userId,this.userId,revision),
      this.query('INSERT INTO profile_preferences SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND revision=?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,languages=excluded.languages,avatar_visibility=excluded.avatar_visibility,show_presence=excluded.show_presence,show_receipts=excluded.show_receipts',this.userId,bio,languages,visibility,presence,receipts,this.userId,revision)
    ]);
    if(!r[0].meta.changes)throw new DomainError('Профиль уже изменился. Обновите форму.',409);
    await this.audit(this.userId,'profile.form_updated').run();return {message:'Профиль сохранён.'};
  }
  async saveListing(propertyId:string|null,body:Row){
    await this.requireRole('owner');
    // A private address of a home cleaning (lib/home-order.ts) is never a listing.
    if(propertyId&&await this.one("SELECT 1 FROM property_details WHERE property_id=? AND json_extract(details,'$.type')='home'",propertyId))throw new DomainError('Это частный адрес для уборки на дом, он не сдаётся. Чтобы сдавать жильё, добавьте объект.',409);
    const value=listingInput(body),{p,details,photos,published,expectedVersion}=value;
    await this.checkMedia(photos,'property');
    const current=propertyId?await this.one('SELECT p.*,COALESCE(d.version,0) listing_version FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.owner_id=? AND p.archived_at IS NULL',propertyId,this.userId):null;
    if(propertyId&&!current)throw new DomainError('Объявление не найдено.',404);
    if((current?.listing_version||0)!==expectedVersion)throw new DomainError('Объявление уже изменилось. Обновите форму.',409);
    if(current&&await this.one("SELECT id FROM bookings WHERE property_id=? AND guests>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?",propertyId,p.capacity,now(),now()))throw new DomainError('Вместимость меньше числа гостей в действующей брони.',409);
    const currentPolicy=propertyId?await this.one('SELECT * FROM property_policies WHERE property_id=?',propertyId):null;
    const policyVersion=number(body.policyVersion??0,'Версия тарифов',0,10000000);
    if((currentPolicy?.version||0)!==policyVersion)throw new DomainError('Тарифы уже изменились. Обновите форму.',409);
    const shownBefore=!!current&&Number(current.published)===1&&!!published,moved=!!current&&(current.address!==p.address||current.city!==p.city||current.district!==p.district);
    // What guests read is checked on every save of a shown flat, by the same rules as the first review.
    if(shownBefore){
      const rules=String(body.rental?.houseRules||'');
      if((p.title!==current.title||p.description!==current.description||rules!==String(currentPolicy?.house_rules||''))&&hasContacts(p.title+' '+p.description+' '+rules)||hasContacts(String((details as Row).menu||'')))throw new DomainError('Уберите из названия, описания и правил телефон, ссылки и просьбы оплатить напрямую: гости бронируют и платят через сервис.',409);
      const before=JSON.parse((await this.one('SELECT photos FROM property_details WHERE property_id=?',propertyId))?.photos||'[]').length;
      if(photos.length<MIN_PHOTOS&&photos.length<before)throw new DomainError('Гости видят это жильё: оставьте не меньше '+MIN_PHOTOS+' фото или сначала скройте жильё.',409);
    }
    if(published){
      const admission=await readPilotPolicy(this.db);
      // A flat guests already see stays «shown» through an address change: the catalogue hides it by itself until the new
      // address is checked, and the request for that check is sent from the server. Only a first publication needs the pass.
      if(propertyId){if(!shownBefore)await assertPilotAllowed(this,'publish',propertyId);}else if(admission.require_owner_review||admission.require_phone)throw new DomainError('Сначала сохраните черновик, затем пройдите проверку в разделе «Управление → Допуск».',409);
    }
    // An older app does not send «Свой персонал»: the property keeps what it had.
    if(typeof body.ownStaff!=='boolean'&&current)p.ownStaff=Number(current.own_staff)?1:0;
    // Own staff cleans: the AI does not order cleanings, so there is no cleaning fee to pay an executor.
    const staffOn=!!p.ownStaff&&!Number(current?.own_staff);
    // Back to executors: there is no cleaning fee yet, so automatic confirmation stops until the owner sets one
    // (with no fee a confirmed booking would get no cleaning). The owner turns «ИИ» on again with the fee.
    const staffOff=!p.ownStaff&&!!Number(current?.own_staff)&&!(Number(currentPolicy?.cleaning_fee)>0);
    if(staffOn&&current&&await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted')",propertyId))throw new DomainError('Сейчас идёт уборка исполнителем. Включите «Свой персонал» после её приёмки.',409);
    if(staffOn&&current&&await this.one('SELECT 1 FROM regular_cleaners WHERE property_id=?',propertyId))throw new DomainError('Сначала открепите постоянного исполнителя, потом включите «Свой персонал».',409);
    const rental=body.rental||{},policy=policyInput({...rental,dailyPrice:p.price,autoConfirm:!staffOff&&!!currentPolicy?.auto_confirm,autoAssign:!staffOff&&!!currentPolicy?.auto_assign,cleaningFee:p.ownStaff?0:currentPolicy?.cleaning_fee||0,cleaningBudget:currentPolicy?.cleaning_budget||0,maxDiscountPercent:currentPolicy?.max_discount_percent||0,minimumRate:currentPolicy?.minimum_rate||0,repairBudget:currentPolicy?.repair_budget||0,autoExtension:!!currentPolicy?.auto_extension,maxExtensionHours:currentPolicy?.max_extension_hours||0,mandateUntil:currentPolicy?.mandate_until?new Date(currentPolicy.mandate_until*1000).toISOString():'',escalationContact:currentPolicy?.escalation_contact||''});
    const key=propertyId||id(),revision=id(),gate='EXISTS(SELECT 1 FROM property_details WHERE property_id=? AND revision=?)';
    const statements=[];
    if(!propertyId)statements.push(this.query('INSERT INTO properties(id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at,own_staff) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',key,this.userId,null,p.title,p.city,p.district,p.address,p.description,p.price,p.rooms,p.capacity,p.cleaningMinutes,published,now(),p.ownStaff),this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?)',key,now()));
    statements.push(this.query('INSERT INTO property_details SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT version FROM property_policies WHERE property_id=?),0)=? ON CONFLICT(property_id) DO UPDATE SET details=excluded.details,photos=excluded.photos,version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE property_details.version=?',key,JSON.stringify(details),JSON.stringify(photos),expectedVersion+1,revision,now(),key,policyVersion,expectedVersion));
    if(propertyId){
      statements.push(this.query(`UPDATE properties SET title=?,city=?,district=?,address=?,description=?,price=?,rooms=?,capacity=?,cleaning_minutes=?,${shownBefore?'':'published=?,'}own_staff=? WHERE id=? AND owner_id=? AND ${gate}`,p.title,p.city,p.district,p.address,p.description,p.price,p.rooms,p.capacity,p.cleaningMinutes,...(shownBefore?[]:[published]),p.ownStaff,key,this.userId,key,revision));
      // «Свой персонал» switched on: planned cleanings by executors are cancelled and the assigned executor is told.
      if(staffOn){
        statements.push(this.query(`INSERT OR IGNORE INTO notifications SELECT ?||id,assigned_to,?,'cleaner:own-staff:'||id,0,? FROM cleaning_jobs WHERE property_id=? AND status='assigned' AND assigned_to IS NOT NULL AND ${gate}`,id()+':','Владелец перевёл «'+p.title+'» на свой персонал. Назначенная уборка отменена, оплата за неё не удерживается.',now(),key,key,revision));
        statements.push(this.query(`UPDATE applications SET status='rejected' WHERE status='pending' AND job_id IN (SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned')) AND ${gate}`,key,key,revision));
        statements.push(this.query(`UPDATE cleaning_jobs SET status='cancelled' WHERE property_id=? AND status IN ('open','assigned') AND ${gate}`,key,key,revision));
      }
    }
    const keys=Object.keys(policy);
    statements.push(this.query(`INSERT INTO property_policies(property_id,${keys.join(',')},version,revision,updated_at) SELECT ?,${keys.map(()=>'?').join(',')},?,?,? WHERE ${gate} ON CONFLICT(property_id) DO UPDATE SET ${keys.map(k=>`${k}=excluded.${k}`).join(',')},version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at`,key,...Object.values(policy),policyVersion+1,id(),now(),key,revision));
    statements.push(this.query(`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${gate}`,id(),this.userId,key,propertyId?'property.listing_updated':'property.listing_created',now(),key,revision));
    const results=await this.db.batch(statements);if(!results[propertyId?0:2].meta.changes)throw new DomainError('Объявление уже изменилось. Обновите форму.',409);
    const paused=staffOff&&!!currentPolicy?.auto_confirm?' Автопилот приостановлен: укажите цену уборки и снова включите «ИИ».':'';
    // Guests who already booked hear about the new address; their bookings stay in force.
    // The exact address goes to confirmed guests only, as everywhere else.
    if(shownBefore&&moved){const ahead=await this.all("SELECT id,guest_id,status FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?",key,now(),now());
      if(ahead.length)await this.db.batch(ahead.map((b:Row)=>this.query('INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',id(),b.guest_id,b.status==='confirmed'?'Владелец уточнил адрес «'+p.title+'»: '+[p.city,p.address].filter(Boolean).join(', ')+'. Ваша бронь в силе.':'Владелец уточнил адрес «'+p.title+'». Ваша заявка в силе, точный адрес откроется после подтверждения брони.','guest:address:'+b.id+':'+revision,now())));}
    return {id:key,moved:shownBefore&&moved,message:(shownBefore&&moved?'Адрес изменён. Действующие брони в силе.':published?'Объявление опубликовано. Готовность и даты проверяются отдельно.':'Черновик сохранён. Гости его не видят.')+paused};
  }
  // Removing a flat: one with no history at all is deleted; otherwise it is archived (hidden from guests and
  // from the owner's lists) so bookings, cleanings and money records keep pointing at it.
  async removeProperty(propertyId:string){
    await this.requireRole('owner');
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=? AND demo_owner IS NULL AND archived_at IS NULL',propertyId,this.userId);if(!p)throw new DomainError('Жильё не найдено.',404);
    const time=now(),ahead=await this.one("SELECT COUNT(*) n FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?",propertyId,time,time);
    if(ahead?.n)throw new DomainError('У жилья есть будущие брони ('+ahead.n+'). Сначала отмените их, затем удалите жильё.',409);
    // «Номера одного типа»: the card goes with its rooms, so the owner first leaves one room (lib/room-units.ts).
    if(await this.one('SELECT 1 x FROM room_units u JOIN properties r ON r.id=u.property_id WHERE u.lead_id=? AND r.archived_at IS NULL LIMIT 1',propertyId))throw new DomainError('В карточке несколько номеров. Сначала оставьте один номер, затем удалите её.',409);
    if(await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') LIMIT 1",propertyId))throw new DomainError('По жилью есть незавершённая уборка. Отмените или завершите её, затем удалите жильё.',409);
    const history=await this.one(`SELECT ${HISTORY_TABLES.map(t=>`EXISTS(SELECT 1 FROM ${t} WHERE property_id=?)`).join(' OR ')} OR EXISTS(SELECT 1 FROM participant_reviews WHERE property_id=? AND status<>'pending') OR EXISTS(SELECT 1 FROM calendar_sources WHERE property_id=?) found`,...Array(HISTORY_TABLES.length+2).fill(propertyId));
    if(!history?.found){
     try{await this.db.batch([...SETTINGS_TABLES.map(t=>this.query(`DELETE FROM ${t} WHERE property_id=?`,propertyId)),this.query("DELETE FROM participant_reviews WHERE property_id=? AND status='pending'",propertyId),this.query('DELETE FROM properties WHERE id=? AND owner_id=?',propertyId,this.userId),this.audit(propertyId,'property.deleted')]);
      return {removed:'deleted',message:'Объявление «'+p.title+'» удалено.'};}
     catch(e:any){if(!/FOREIGN KEY|constraint/i.test(String(e?.message||e)))throw e;}
    }
    // The archive re-checks future stays and unfinished cleanings in the same write, and the rest only follows it,
    // so a booking or cleaning made after the checks above stops the removal instead of being orphaned.
    const archived='EXISTS(SELECT 1 FROM properties WHERE id=? AND archived_at=?)';
    const r=await this.db.batch([this.query(`UPDATE properties SET published=0,archived_at=? WHERE id=? AND owner_id=? AND archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?) AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted'))`,time,propertyId,this.userId,propertyId,time,time,propertyId),
     this.query(`UPDATE matching_preferences SET enabled=0,updated_at=? WHERE property_id=? AND ${archived}`,time,propertyId,propertyId,time),this.query(`UPDATE calendar_sources SET enabled=0 WHERE property_id=? AND ${archived}`,propertyId,propertyId,time),this.query(`UPDATE calendar_exports SET revoked_at=? WHERE property_id=? AND revoked_at IS NULL AND ${archived}`,time,propertyId,propertyId,time),this.query(`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${archived}`,id(),this.userId,propertyId,'property.archived',time,propertyId,time)]);
    if(!r[0].meta.changes)throw new DomainError('Пока жильё удаляли, у него появилась бронь или уборка. Обновите данные и попробуйте снова.',409);
    return {removed:'archived',message:'Объявление «'+p.title+'» убрано: гости его больше не видят, история броней и оплат сохранена.'};
  }
  async enrichProperties(items:Row[],owner=false):Promise<Row[]>{
    if(!items.length)return [];
    // The owner's reliability travels with each flat; the owner's id itself stays private.
    const owners=owner?[]:await this.all('SELECT id,owner_id FROM properties WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(items.slice(0,500).map(p=>p.id))),hosts=await reliabilityFor(this.db,'owner',owners.map(o=>o.owner_id));
    const hostOf=(id:string)=>hosts.get(owners.find(o=>o.id===id)?.owner_id);
    const [ratings,details,operations,busy]=await Promise.all([ratingsFor(this.db,items.map(p=>p.id)),this.all(`SELECT d.*,${verifiedPlaceSql('d.property_id')} verified FROM property_details d WHERE d.property_id IN (SELECT value FROM json_each(?))`,JSON.stringify(items.map(p=>p.id))),this.all('SELECT * FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(items.map(p=>p.id))),this.all("SELECT DISTINCT property_id FROM bookings WHERE (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<=? AND occupied_until>?",now(),now(),now())]);
    // The owner sees whether the flat's pin still matches its address (a pin from an old address does not count).
    const pins=owner?await this.all('SELECT property_id,address_fingerprint FROM property_locations WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(items.slice(0,500).map(p=>p.id))):[];
    // Only the version of the check-in instruction travels to the owner (it says whether one is saved); the text stays encrypted.
    const access=owner?await this.all('SELECT property_id,version FROM property_access WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(items.slice(0,500).map(p=>p.id))):[];
    // A shown flat waiting for the check of a new address: the owner sees why new guests do not find it yet.
    const unchecked=owner?await this.all("SELECT a.id FROM pilot_property_admissions a WHERE a.owner_reviewed=0 AND COALESCE((SELECT require_owner_review FROM pilot_policy WHERE id='global'),0)=1 AND a.id IN (SELECT value FROM json_each(?))",JSON.stringify(items.slice(0,500).map(p=>p.id))):[];
    // Approved by a person at the platform: the owner's proof of the right to let it is settled (lib/property-rights.ts).
    const approvedIds=owner?new Set((await this.all('SELECT id FROM pilot_property_admissions WHERE owner_reviewed=1 AND id IN (SELECT value FROM json_each(?))',JSON.stringify(items.slice(0,500).map(p=>p.id)))).map(a=>a.id)):new Set();
    // «Заведение»: the halls of one place carry its name, for the guest and for the owner (lib/venue.ts).
    const venues=await venuesFor(this.db);
    return items.map(p=>{const d=details.find(d=>d.property_id===p.id),op=operations.find(o=>o.property_id===p.id);return {...p,...(venues.has(p.id)?{venue:venues.get(p.id)}:{}),...(owner?{address_check:Number(p.published)===1&&!p.demo_owner&&unchecked.some(u=>u.id===p.id),mapped:pins.some(l=>l.property_id===p.id&&l.address_fingerprint===[p.city,p.district,p.address].join('|')),access_version:access.find(a=>a.property_id===p.id)?.version||0,approved:approvedIds.has(p.id)}:{host:hostOf(p.id)||null}),details:d?JSON.parse(d.details):{},photos:d?JSON.parse(d.photos):[],listing_version:d?.version||0,rating:ratings.get(p.id)||null,verified:!!d?.verified,display_status:propertyStatus(p,op,busy.some(b=>b.property_id===p.id)),...(owner?{}:{published:undefined})};});
  }
  async workerCard(userId:string){
    const p=await this.one('SELECT p.name,p.city,p.districts,p.experience,p.availability,d.avatar_id,d.work_status FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id WHERE p.id=?',userId);
    if(!p)return null;
    const jobs=await this.all("SELECT start,end,status FROM cleaning_jobs WHERE assigned_to=? AND status IN ('assigned','in_progress','submitted')",userId);
    return {...p,display_status:cleanerStatus(p.work_status,jobs,now()),admission:await cleanerAdmission(this.db,userId),reliability:(await reliabilityFor(this.db,'cleaner',[userId])).get(userId)};
  }
  async accountState(role?:Role){return {identity:await identityOf(this.db,this.userId),reliability:role?(await reliabilityFor(this.db,role,[this.userId])).get(this.userId):undefined,profile:await this.profile(),workerStatus:(await this.workerCard(this.userId))?.display_status,settings:await this.one('SELECT payment_provider,payment_notifications,version FROM account_preferences WHERE user_id=?',this.userId)||defaultAccountSettings};}
  async saveAccountSettings(body:Row){
    const {provider,notifications,version}=accountSettingsInput(body);if(!await this.profile())throw new DomainError('Сначала заполните профиль.',403);
    if(!await this.one('SELECT user_id FROM account_preferences WHERE user_id=?',this.userId)&&version!==0)throw new DomainError('Обновите настройки аккаунта.',409);
    const r=await this.query('INSERT INTO account_preferences VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET payment_provider=excluded.payment_provider,payment_notifications=excluded.payment_notifications,version=excluded.version,updated_at=excluded.updated_at WHERE account_preferences.version=?',this.userId,provider,notifications,version+1,now(),version).run();
    if(!r.meta.changes)throw new DomainError('Настройки уже изменились. Обновите страницу.',409);
    await this.audit(this.userId,'account.preferences_updated').run();return {message:'Предпочтения оплаты сохранены. Подключение банка выполняется отдельно.',version:version+1};
  }
  async listUsers(platformAdmin:boolean,body:Row={}){
    if(!platformAdmin)throw new DomainError('Список всех пользователей доступен только администратору платформы.',403);
    const {role,search,page,limit}=userSearchInput(body),where="(?='' OR EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value=?)) AND (?='' OR p.name LIKE ? ESCAPE '\\' OR p.contact LIKE ? ESCAPE '\\')",args=[role,role,search,'%'+search+'%','%'+search+'%'];
    const total=await this.one(`SELECT COUNT(*) count FROM profiles p WHERE ${where}`,...args);
    const users=await this.all(`SELECT p.id,p.name,p.contact,p.city,p.roles,p.created_at,(SELECT COUNT(*) FROM properties WHERE owner_id=p.id AND demo_owner IS NULL) property_count,(SELECT COUNT(*) FROM bookings WHERE guest_id=p.id) booking_count,(SELECT COUNT(*) FROM cleaning_jobs WHERE assigned_to=p.id) assignment_count FROM profiles p WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?`,...args,limit,page*limit);
    await this.audit(this.userId,JSON.stringify({action:'admin.users_viewed',role,page})).run();
    return {users:users.map(p=>({...p,roles:JSON.parse(p.roles)})),total:total?.count||0,page,limit};
  }
  async authorizeWorkspace(value:unknown,path:string,body:Row={}){
    const role=parseRole(value);await this.requireRole(role);
    const allowed=commandRole(path,body);
    if(allowed&&!allowed.includes(role))throw new DomainError('Действие недоступно в этой роли. Переключите роль на экране входа.',403);
    return role;
  }
  async roleState(value:unknown,options:{catalog?:boolean}={}){
    const role=await this.authorizeWorkspace(value,'state'),state=await this.state(options.catalog!==false);
    const bookings=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===this.userId:role==='guest'&&b.guest_id===this.userId).map((b:Row):Row=>role==='owner'?{...b,stay_check:0}:{...b,address:b.status==='confirmed'?b.address:null,owner_contact:phoneOpens(b,state.serverTime)?b.owner_contact:null,stay_check:b.guest_id===this.userId?b.stay_check:0,guest_name:null,guest_contact:null});
    const jobs=role==='guest'?[]:state.jobs.filter((j:Row)=>role==='owner'?j.owner_id===this.userId:j.assigned_to===this.userId||(j.status==='open'&&j.end>state.serverTime)).map((j:Row)=>role==='owner'||j.assigned_to===this.userId&&j.status!=='cancelled'?j:{...j,address:null,owner_contact:null,report:'',checklist:'[]'});
    const jobIds=new Set(jobs.map((j:Row)=>j.id));
    const entityIds=[...bookings,...jobs].map((item:Row)=>item.id);
    const accountPreference=await this.one('SELECT payment_notifications FROM account_preferences WHERE user_id=?',this.userId);
    const notifications=state.notifications.filter((n:Row)=>{
      if(accountPreference?.payment_notifications===0&&/:(paid|payment|deposit):/.test(n.dedupe))return false;
      if(/^(guest|owner|cleaner):/.test(n.dedupe))return n.dedupe.startsWith(role+':');
      // The service's own notices to the person (fees, warnings about deals outside the service): every role but the guest.
      if(n.dedupe.startsWith('service:'))return role!=='guest';
      const legacyRole=/^(booking|checkout-reported|application|submitted|overdue):/.test(n.dedupe)?'owner':/^(confirmed|paid):/.test(n.dedupe)?'guest':/^(assigned|approved):/.test(n.dedupe)?'cleaner':null;
      return legacyRole===role&&entityIds.some(entityId=>n.dedupe.includes(entityId));
    });
    const ownAdmission=role==='cleaner'?await cleanerAdmission(this.db,this.userId):undefined;
    const workers=new Map<string,Row|null>();if(role==="owner"){for(const userId of new Set([...state.applications.map(a=>a.user_id),...jobs.map(j=>j.assigned_to).filter(Boolean)]))workers.set(userId,await this.workerCard(userId));}
    const result={...state,profile:state.profile?{...state.profile,display_status:cleanerStatus(state.profile.work_status,state.jobs.filter(j=>j.assigned_to===this.userId),state.serverTime),...(role==='cleaner'?{admission:ownAdmission}:{})}:null,activeRole:role,properties:role==='guest'?state.properties:[],ownProperties:role==='owner'?state.ownProperties:[],bookings,jobs:jobs.map((j:Row):Row=>({...j,worker:role==='owner'?workers.get(j.assigned_to):null})),
      notifications,applications:state.applications.filter(a=>jobIds.has(a.job_id)&&(role==='owner'||a.user_id===this.userId)).map(a=>({...a,worker:role==='owner'?workers.get(a.user_id):null,
      // Training flats skip the platform check on the server, so their responses never wait for it.
      admission:a.job_demo?'not_required':role==='owner'?workers.get(a.user_id)?.admission:ownAdmission})),messages:state.messages.filter(m=>m.scope===role)};
    if(role==='owner'){(result as Row).priceSuggestions=await ownerPriceSuggestions(this.db,this.userId,state.serverTime);(result as Row).calendarWindows=await ownerWindows(this.db,this.userId,state.serverTime);(result as Row).loadForecasts=await ownerForecasts(this.db,this.userId,state.serverTime);(result as Row).listingTips=await ownerListingTips(this.db,this.userId,state.serverTime);(result as Row).cleaningTips=await ownerCleaningTips(this.db,this.userId,state.serverTime);}
    if(role==='guest'){(result as Row).stayOffers=await guestStayOffers(this.db,this.userId,state.serverTime);Object.assign(result,await guestFavorites(this.db,this.userId));}
    // «Смена»: how many objects this person marks guests for (lib/staff.ts), in any role.
    (result as Row).staffPlaces=await staffPlaces(this.db,this.userId);
    // The private addresses of home cleanings (lib/home-order.ts): a repeated order takes two taps, in any role.
    (result as Row).homePlaces=await homePlaces(this);
    // What executors of the city really took home orders for: the price advice of a new order leans on it.
    if(role!=='cleaner')(result as Row).homeDeals=await homeDeals(this,String((result as Row).profile?.city||'Павлодар'));
    const assistantSettings={...defaultAssistantSettings};
    const administrator=await readAdministratorState(this.db,this.userId,role);
    return {...result,administrator,approvals:approvalCards(result,role,this.userId,state.serverTime),assistantSettings,assistantBrief:assistantBrief(result,role,assistantSettings,state.serverTime),workspaces:{[role]:operationOverview(result,this.userId,role,state.serverTime)}};
  }
  async resolveAdministratorIssue(roleValue:unknown,body:Row){
    const role=await this.authorizeWorkspace(roleValue,'administrator/issues'),issue=await this.one('SELECT * FROM administrator_issues WHERE id=?',required(body.id,'Обращение',100));
    if(!issue||!(role==='owner'&&issue.owner_id===this.userId||issue.other_user===this.userId&&issue.other_role===role))throw new DomainError('Обращение недоступно для решения в этой роли.',403);
    // «Меня не заселили» is decided by a person at the platform (lib/pilot-governance.ts), never by the owner it is about:
    // its outcome decides the commission (lib/stay-result.ts) and the hold of the owner's places.
    if(String(issue.description).startsWith(NOT_LET_IN))throw new DomainError('Жалобу «Меня не заселили» разбирает администратор сервиса. Ответьте в обращении, решение примет он.',403);
    const resolution=required(body.resolution,'Как решено обращение',1500),version=number(body.expectedVersion,'Версия обращения',1,10000000);
    const auditId=id(),r=await this.db.batch([
      this.query("UPDATE administrator_issues SET status='resolved',resolution=?,resolved_at=?,version=version+1 WHERE id=? AND status='open' AND version=?",resolution,now(),issue.id,version),
      this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',auditId,this.userId,issue.entity_id,JSON.stringify({action:'administrator.issue_resolved',issueId:issue.id,resolution}),now()),
      this.query('INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',id(),issue.opened_by,'ИИ-администратор: по вашему обращению записано решение: '+resolution,issue.opened_role+':issue-resolved:'+issue.id,0,now(),auditId)
    ]);
    if(!r[0].meta.changes)throw new DomainError('Обращение уже изменилось. Обновите карточку.',409);
    return {message:'Решение сохранено, участник получит уведомление внутри сервиса.'};
  }
  administratorIssueStatement(entity:Row,kind:'booking'|'job',description:string){
    const owner=entity.owner_id===this.userId,role:Role=owner?'owner':kind==='booking'?'guest':'cleaner',other=owner?(kind==='booking'?entity.guest_id:entity.assigned_to):entity.owner_id;
    if(!other)throw new DomainError('У задания пока нет второго участника. Укажите проблему в состоянии жилья.',409);
    const issueId=id();
    return this.query('INSERT INTO administrator_issues(id,owner_id,property_id,entity_kind,entity_id,opened_by,opened_role,other_user,other_role,description,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',issueId,entity.owner_id,entity.property_id,kind,entity.id,this.userId,role,other,owner?(kind==='booking'?'guest':'cleaner'):'owner',description,now());
  }
  // One open issue per pair of participants and booking or cleaning: pressing «Есть проблема» again adds to it instead of
  // opening a second one, so the other side and the AI administrator follow a single thread. A cleaning that passed
  // to another cleaner gets a new thread: the next cleaner never reads, and is never sent into, the previous one's.
  async issueWrite(entity:Row,kind:'booking'|'job',description:string){
    const other=entity.owner_id===this.userId?(kind==='booking'?entity.guest_id:entity.assigned_to):entity.owner_id;
    const open=await this.one("SELECT id FROM administrator_issues WHERE entity_kind=? AND entity_id=? AND opened_by=? AND other_user IS ? AND status='open' ORDER BY created_at DESC LIMIT 1",kind,entity.id,this.userId,other??null);
    // The other side already has an open appeal on the same booking or cleaning: the answer joins it, signed, so the
    // administrator reads both accounts of one transfer in one place instead of two appeals.
    const theirs=!open&&other?await this.one("SELECT id FROM administrator_issues WHERE entity_kind=? AND entity_id=? AND opened_by=? AND other_user=? AND status='open' ORDER BY created_at DESC LIMIT 1",kind,entity.id,other,this.userId):null;
    if(theirs){const who=entity.owner_id===this.userId?'владелец':kind==='booking'?'гость':'исполнитель';return {added:true,statement:this.query("UPDATE administrator_issues SET description=substr(description||char(10)||?||?,1,6000),version=version+1 WHERE id=? AND status='open'",'Ответ второй стороны ('+who+', '+new Date(now()*1000).toISOString().slice(0,16).replace('T',' ')+' UTC): ',description,theirs.id)};}
    if(!open)return {added:false,statement:this.administratorIssueStatement(entity,kind,description)};
    return {added:true,statement:this.query("UPDATE administrator_issues SET description=substr(description||char(10)||'Дополнение: '||?,1,6000),version=version+1 WHERE id=? AND status='open'",description,open.id)};
  }
  // Nobody took the cleaning in its time: the owner looks again on a new window, or says the flat was cleaned without a cleaner.
  async unclaimedAction(j:Row,body:Row){
    const t=now();
    if(j.status!=='open'||j.assigned_to||Number(j.end)>t)throw new DomainError('Срок уборки ещё не прошёл или исполнитель уже есть. Обновите карточку.',409);
    const version=body.expectedVersion===undefined?j.version:number(body.expectedVersion,'Версия задания',1,10000000);
    if(version!==j.version)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
    if(body.action==='repost'){
      const window=await releaseWindow(this.db,j,t);
      if(!window)throw new DomainError('Новое время не найти: гость уже в жилье или следующий заезд меньше чем через полчаса. Закройте уборку, если убрали, или отмените её.',409);
      const r=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET start=?,end=?,overdue_step=0 WHERE id=? AND version=? AND status='open' AND assigned_to IS NULL",window.start,window.end,j.id,j.version),
        // Cleaners answered the old time, not this one: they answer again, nobody is assigned to dates they did not agree to.
        this.query("UPDATE applications SET status='rejected' WHERE job_id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND start=? AND end=?)",j.id,j.id,window.start,window.end),
        this.audit(j.id,'job.reposted')]);
      if(!r[0].meta.changes)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
      return {message:'Уборка снова в поиске до '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(window.end*1000))+'. Отклики появятся в карточке.'};
    }
    if(body.confirmed!==true)throw new DomainError('Подтвердите, что уборка выполнена.');
    const r=await this.db.batch([
      this.query("UPDATE cleaning_jobs SET status='completed',completed_at=?,report=CASE WHEN report='' THEN ? ELSE report END WHERE id=? AND version=? AND status='open' AND assigned_to IS NULL",t,'Убрано без исполнителя, закрыто владельцем.',j.id,j.version),
      this.query("UPDATE property_operations SET readiness='ready',version=version+1,updated_at=? WHERE property_id=? AND readiness IN ('cleaning','inspection','awaiting_cleaning') AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted'))",t,j.property_id,j.id,j.property_id),
      this.query("UPDATE applications SET status='rejected' WHERE job_id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='completed')",j.id,j.id),
      this.audit(j.id,'job.closed_without_cleaner')]);
    if(!r[0].meta.changes)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
    return {message:'Уборка закрыта.'+(r[1].meta.changes?' Жильё отмечено готовым.':'')};
  }
  // An overdue cleaning (or one about to be): more time, a new cleaner, or the owner closes work that was done.
  async overdueAction(j:Row,body:Row){
    const owner=j.owner_id===this.userId,t=now(),title=j.title||'жильё';
    if(!['assigned','in_progress'].includes(j.status)||!j.assigned_to)throw new DomainError('Задание уже не в работе. Обновите карточку.',409);
    const version=body.expectedVersion===undefined?j.version:number(body.expectedVersion,'Версия задания',1,10000000);
    if(version!==j.version)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
    if(body.action==='extend'){
      const minutes=Number(body.minutes);if(![30,60,120].includes(minutes))throw new DomainError('Выберите 30 минут, 1 или 2 часа.');
      if(!owner&&j.end>t+1800)throw new DomainError('Продлить срок можно за полчаса до окончания уборки или позже.',409);
      const end=Math.max(Number(j.end),t)+minutes*60;
      const next=await this.one("SELECT start FROM bookings WHERE property_id=? AND status='confirmed' AND start>=? AND start<? AND (? IS NULL OR id<>?) ORDER BY start LIMIT 1",j.property_id,j.start,end,j.booking_id,j.booking_id);
      if(next)throw new DomainError('Следующий заезд в '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(next.start*1000))+', продлить уборку дальше нельзя.',409);
      // A stay booked in an outside calendar (Airbnb, Booking…) counts the same as ours, as for «Опаздываю».
      const outside=await this.one('SELECT x.start FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=? AND c.enabled=1 AND x.start<? AND x.end>? ORDER BY x.start LIMIT 1',j.property_id,end,Math.max(Number(j.end),t));
      if(outside)throw new DomainError('По внешнему календарю заезд в '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(Number(outside.start)*1000))+', продлить уборку дальше нельзя.',409);
      const label=minutes<60?minutes+' мин':minutes/60+' ч';
      const r=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET end=?,overdue_step=0 WHERE id=? AND version=? AND status IN ('assigned','in_progress')",end,j.id,j.version),
        this.notify(owner?j.assigned_to:j.owner_id,owner?'Владелец продлил срок уборки «'+title+'» на '+label+'.':'Исполнитель попросил ещё '+label+' на уборку «'+title+'». Срок продлён, если не согласны, найдите замену в карточке уборки.','extended:'+j.id+':'+end,owner?'cleaner':'owner'),
        this.audit(j.id,'job.extended:'+minutes)
      ]);
      if(!r[0].meta.changes)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
      return {message:'Срок продлён на '+label+'.'};
    }
    if(body.action==='release'){
      if(owner&&j.end>t&&j.status==='in_progress')throw new DomainError('Исполнитель ещё в отведённом времени. Найти замену можно после срока.',409);
      const window=await releaseWindow(this.db,j,t);if(!window)throw new DomainError('До следующего заезда меньше получаса: нового исполнителя не найти. Продлите срок или закройте уборку.',409);
      // The owner takes a started cleaning away: the part already done is not lost, an issue with both sides records it.
      const started=owner&&j.status==='in_progress',issue=started?await this.issueWrite(j,'job','Начатая уборка передана другому исполнителю. Договоритесь об оплате сделанной части: исполнитель описывает, что успел, владелец отмечает, сколько перевёл.'):null;
      const r=await this.db.batch([...releaseStatements(this.db,j,window,t),
        ...(issue?[issue.statement]:[]),
        this.notify(owner?j.assigned_to:j.owner_id,owner?'Владелец передал уборку «'+title+'» другому исполнителю.'+(started?' Вы уже начали работу: напишите в обращении по уборке, что успели сделать, чтобы договориться об оплате.':''):'Исполнитель отказался от уборки «'+title+'». Уборка снова в поиске, выберите нового исполнителя из откликов.','released:'+j.id+':'+j.version,owner?'cleaner':'owner'),
        this.audit(j.id,owner?'job.reassign_requested':'job.released_by_cleaner')]);
      if(!r[0].meta.changes)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
      return {message:owner?'Уборка снова в поиске. Новые отклики появятся в карточке.':'Вы отказались от задания. Владелец получит уведомление.'};
    }
    if(j.status!=='in_progress')throw new DomainError('Закрыть можно только начатую уборку.',409);
    if(body.confirmed!==true)throw new DomainError('Подтвердите, что уборка выполнена.');
    const note=typeof body.note==='string'&&body.note.trim()?body.note.trim().slice(0,500):'';
    const r=await this.db.batch([
      this.query("UPDATE cleaning_jobs SET status='completed',completed_at=?,report=CASE WHEN report='' THEN ? ELSE report END WHERE id=? AND version=? AND status='in_progress'",t,'Закрыто владельцем без отчёта исполнителя.'+(note?' '+note:''),j.id,j.version),
      this.query("UPDATE property_operations SET readiness='ready',version=version+1,updated_at=? WHERE property_id=? AND readiness IN ('cleaning','inspection','awaiting_cleaning') AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted'))",t,j.property_id,j.id,j.property_id),
      this.notify(j.assigned_to,'Владелец закрыл уборку «'+title+'» как выполненную.','closed:'+j.id,'cleaner'),
      this.audit(j.id,'job.closed_by_owner')
    ]);
    if(!r[0].meta.changes)throw new DomainError('Задание уже изменилось. Обновите карточку.',409);
    return {message:'Уборка закрыта как выполненная, жильё отмечено готовым.'};
  }
  async decideApproval(roleValue:unknown,body:Row){
    const role=parseRole(roleValue),state=await this.roleState(role),card=state.approvals.find(c=>c.id===body.id);
    if(!card)throw new DomainError('Согласование уже закрыто, истекло или недоступно. Обновите карточку.',409);
    if(!card.canDecide)throw new DomainError('Решение должна принять другая сторона.',403);
    if(body.revision!==card.revision)throw new DomainError('Условия изменились. Обновите карточку перед решением.',409);
    if(!['accept','reject','deposit'].includes(body.action)||body.action==='deposit'&&!card.depositLabel)throw new DomainError('Выберите принятие или отклонение.');
    const accept=body.action!=='reject';
    if(card.kind==='booking')return this.bookingAction(card.entityId,{action:accept?'confirm':'reject',withDeposit:body.action==='deposit',cleaningFee:body.cleaningFee??card.cleaningFee,expectedVersion:state.bookings.find(b=>b.id===card.entityId)?.terms?.version});
    if(card.kind==='change')return this.decideBookingChange(card.entityId,card.id.slice(7),role,{action:body.action});
    if(card.kind==='price')return decidePriceSuggestion(this,card.id.slice(6),accept);
    if(card.kind==='window')return decideCalendarWindow(this,card.id.slice(7),accept);
    if(card.kind==='forecast')return decideForecast(this,card.id.slice(9),accept);
    if(card.kind==='listing')return decideListingTip(this,card.id.slice(8),accept);
    if(card.kind==='cleaning-fee')return decideCleaningTip(this,card.id.slice(13),accept);
    if(card.kind==='stay')return decideStayOffer(this,card.id.slice(5),accept);
    // «Вы заселились?» (lib/approvals.ts): the guest's answer about a cancelled booking. The owner never sees it;
    // the administrator's morning summary counts the «yes» answers by owner (lib/admin-digest.ts).
    if(card.kind==='stay-check'){await this.audit(card.entityId,accept?'stay.checked:yes':'stay.checked:no').run();return {message:accept?'Спасибо, ответ записан. Владелец его не видит.':'Спасибо, ответ записан.'};}
    if(card.kind==='checkout')return this.bookingAction(card.entityId,{action:accept?'checkout':'dispute_checkout',reason:body.reason,expectedVersion:state.bookings.find(b=>b.id===card.entityId)?.terms?.version});
    const job=state.jobs.find(j=>j.id===card.entityId);
    return this.jobAction(card.entityId,{action:card.kind==='application'?(accept?'assign':'reject_application'):(accept?'approve':'revise'),applicationId:card.id.slice(12),reason:body.reason,expectedVersion:job?.version});
  }
  async saveAssistantSettings(roleValue:unknown,_body:Row){
    await this.authorizeWorkspace(roleValue,'assistant-settings');
    throw new DomainError('Настройки помощника управляются сервисом.',410);
  }

  async requireRole(role: Role) {
    const p = await this.profile();
    if (!p || !JSON.parse(p.roles).includes(role)) throw new DomainError('Заполните профиль и подключите нужную роль.', 403);
    // An account the platform administrator blocked does nothing (lib/account-restrictions.ts).
    if(p.restriction==='blocked')throw new DomainError(BLOCKED_TEXT,403);
    return p;
  }
  audit(entity: string, action: string) { return this.query('INSERT INTO audit_events VALUES (?,?,?,?,?)', id(), this.execution?'system:rental-policy':this.userId, entity, this.execution?JSON.stringify({action,onBehalfOf:this.userId,...this.execution}):action, now()); }
  notify(user: string, body: string, key: string, role:Role) { return this.query('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?)', id(), user, body, role+':'+key, 0, now()); }
  async operationReceipt(kind:string,body:Row,payload:unknown){const key=body.requestKey?required(body.requestKey,'Ключ операции',120):id(),digest=await operationHash(JSON.stringify(payload)),previous=await this.one('SELECT * FROM operation_receipts WHERE user_id=? AND kind=? AND request_key=?',this.userId,kind,key);if(previous&&previous.payload_hash!==digest)throw new DomainError('Ключ операции уже использован с другими данными.',409);return {key,digest,previous:previous?JSON.parse(previous.result):null};}
  async state(includeCatalog=true) {
    const [profile, properties, ownProperties, bookings, jobs, applications, notifications, messages] = await Promise.all([
      this.profile(),
      includeCatalog?this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes,demo_owner,published FROM properties p WHERE published=1 AND (demo_owner IS NULL OR demo_owner=?) AND '+pilotPropertyVisibleSql('p')+' AND NOT EXISTS(SELECT 1 FROM room_units u WHERE u.property_id=p.id) ORDER BY created_at DESC', this.userId):Promise.resolve([]),
      this.all('SELECT p.*,(SELECT c.name FROM regular_cleaners r JOIN profiles c ON c.id=r.cleaner_id WHERE r.property_id=p.id) regular_cleaner_name,(SELECT a.name FROM property_staff x JOIN auth_accounts a ON a.id=x.staff_id WHERE x.property_id=p.id) staff_name,(SELECT MAX(x.end) FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=p.id AND c.external_property_id=\'aiqonaq:busy\' AND x.start<=unixepoch() AND x.end>unixepoch()) busy_until,(SELECT COALESCE(SUM(v.shown),0) FROM property_views v WHERE v.property_id=p.id AND v.day>CAST((unixepoch()+18000)/86400 AS INTEGER)-7) views_week FROM properties p WHERE p.owner_id=? AND p.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM room_units u WHERE u.property_id=p.id) ORDER BY p.created_at DESC', this.userId),
      this.all(`SELECT b.*,p.title,(SELECT json_extract(details,'$.type') FROM property_details WHERE property_id=p.id) property_type,p.owner_id,p.city,p.district,p.demo_owner,(SELECT photos FROM property_details WHERE property_id=p.id) property_photos,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN p.address ELSE NULL END address,
        (SELECT rating FROM stay_reviews r WHERE r.booking_id=b.id) review_rating,
        (SELECT json_object('verdict',verdict,'issues',json(issues),'note',note,'cleaner_photos',cleaner_photos,'created_at',created_at) FROM stay_handovers h WHERE h.booking_id=b.id) handover_row,
        (SELECT COUNT(*) FROM stay_photos f WHERE f.booking_id=b.id AND f.phase='checkin') checkin_photos,
        (SELECT COUNT(*) FROM payment_receipts r WHERE r.booking_id=b.id) receipts,
        (SELECT COUNT(*) FROM stay_photos f WHERE f.booking_id=b.id AND f.phase='handover' AND EXISTS(SELECT 1 FROM stay_handovers x WHERE x.booking_id=b.id)) handover_photos,
        CASE WHEN p.owner_id=? THEN (SELECT COUNT(*) FROM job_evidence e JOIN cleaning_jobs j ON j.id=e.job_id WHERE j.booking_id=b.id AND e.phase IN ('before','damage')) ELSE 0 END cleaner_photos,
        CASE WHEN p.owner_id=? THEN (SELECT COUNT(*) FROM job_evidence e JOIN cleaning_jobs j ON j.id=e.job_id WHERE j.booking_id=b.id AND e.phase='damage') ELSE 0 END cleaner_damage,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND ${PHONE_OPEN_SQL}) THEN o.contact ELSE NULL END owner_contact,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN (SELECT json_object('phone',phone,'recipient',recipient,'link',link,'changed_at',changed_at) FROM payout_details d WHERE d.user_id=p.owner_id AND d.phone<>'') ELSE NULL END owner_pay_row,
        CASE WHEN p.owner_id=? THEN g.name ELSE NULL END guest_name,
        CASE WHEN p.owner_id=? AND ${PHONE_OPEN_SQL} THEN g.contact ELSE NULL END guest_contact,
        CASE WHEN p.owner_id=? THEN (SELECT json_object('level',level,'score',score,'reasons',reasons,'deposit_advice',deposit_advice,'phone_verified',phone_verified,'held',held) FROM booking_risks WHERE booking_id=b.id) ELSE NULL END risk_row,
        CASE WHEN b.status='cancelled' AND EXISTS(SELECT 1 FROM platform_commissions pc WHERE pc.booking_id=b.id) AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=b.id AND a.action LIKE 'stay.checked:%') THEN 1 ELSE 0 END stay_check
        FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN profiles o ON o.id=p.owner_id LEFT JOIN profiles g ON g.id=b.guest_id
        WHERE b.guest_id=? OR p.owner_id=? ORDER BY b.start DESC`, ...Array(13).fill(this.userId)),
      this.all(`SELECT j.*,EXISTS(SELECT 1 FROM regular_cleaners rc WHERE rc.property_id=j.property_id AND rc.cleaner_id=COALESCE(j.assigned_to,?)) regular,CASE WHEN j.owner_id=? OR j.assigned_to=? THEN (SELECT status FROM cleaning_holds h WHERE h.job_id=j.id AND h.cleaner_id=j.assigned_to AND h.status<>'returned') END guarantee,(j.booking_id IS NULL OR EXISTS(SELECT 1 FROM booking_terms t WHERE t.booking_id=j.booking_id AND t.actual_checkout IS NOT NULL)) checkout_confirmed,COALESCE((SELECT require_photos FROM operation_rules r WHERE r.property_id=j.property_id),0) photos_required,p.title,p.city,p.district,p.rooms,p.capacity,p.cleaning_minutes,p.demo_owner,(SELECT photos FROM property_details WHERE property_id=p.id) property_photos,(SELECT details FROM property_details WHERE property_id=p.id) property_details,CASE WHEN j.status='open' THEN p.address END open_address,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN p.address ELSE NULL END address,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN o.contact ELSE NULL END owner_contact,
        (SELECT COUNT(*) FROM payment_receipts r WHERE r.job_id=j.id) receipts,
        CASE WHEN j.owner_id=? AND j.assigned_to IS NOT NULL THEN (SELECT json_object('phone',phone,'recipient',recipient,'link',link,'changed_at',changed_at) FROM payout_details d WHERE d.user_id=j.assigned_to AND d.phone<>'') ELSE NULL END cleaner_pay_row
        FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN profiles o ON o.id=j.owner_id
        WHERE (j.owner_id=? OR j.assigned_to=? OR (j.status='open' AND j.end>?)) AND (p.demo_owner IS NULL OR p.demo_owner=?) ORDER BY j.start`, this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,now(),this.userId),
      this.all(`SELECT a.*,p.name,p.experience,p.availability,p.districts,(SELECT pr.demo_owner FROM properties pr WHERE pr.id=j.property_id) job_demo FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN profiles p ON p.id=a.user_id WHERE a.user_id=? OR j.owner_id=?`, this.userId,this.userId),
      this.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40', this.userId),
      this.all('SELECT * FROM (SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at', this.userId),
    ]);
    const serverTime=now();
    // Only the rules of the places this person sees: the whole table would be read on every refresh of the app.
    const placeIds=JSON.stringify([...new Set([...properties,...ownProperties].map(p=>p.id).concat(bookings.map(b=>b.property_id)))]);
    const [policies,operations,terms,changes]=await Promise.all([this.all('SELECT * FROM property_policies WHERE property_id IN (SELECT value FROM json_each(?))',placeIds),this.all('SELECT * FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?))',placeIds),this.all('SELECT t.* FROM booking_terms t JOIN bookings b ON b.id=t.booking_id JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=?',this.userId,this.userId),this.all('SELECT c.* FROM booking_changes c JOIN bookings b ON b.id=c.booking_id JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=? ORDER BY c.created_at DESC',this.userId,this.userId)]);
    const [financeBalances,jobPayments]=await Promise.all([
      this.all("SELECT f.booking_id,SUM(CASE WHEN f.kind='deposit' THEN f.amount ELSE 0 END) deposit_received,SUM(CASE WHEN f.kind='deposit_return' THEN f.amount ELSE 0 END) deposit_returned,SUM(CASE WHEN f.kind='refund' THEN f.amount ELSE 0 END) refunded FROM finance_entries f JOIN bookings b ON b.id=f.booking_id JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=? GROUP BY f.booking_id",this.userId,this.userId),
      this.all("SELECT f.job_id,SUM(f.amount) paid FROM finance_entries f JOIN cleaning_jobs j ON j.id=f.job_id WHERE f.kind='job_payment' AND (j.owner_id=? OR j.assigned_to=?) GROUP BY f.job_id",this.userId,this.userId)
    ]);
    const enrichedTerms:Row[]=terms.map(t=>{const f=financeBalances.find(f=>f.booking_id===t.booking_id),received=f?.deposit_received??(t.deposit_status==='owner_verified'?t.deposit:0),returned=f?.deposit_returned??(t.deposit_returned_at?t.deposit:0);return {...t,deposit_received_amount:received,deposit_returned_amount:returned,deposit_balance:Math.max(0,received-returned-(Number(t.deposit_kept)||0)),refunded_amount:f?.refunded||0};});
    const policyFor=(p:Row)=>policies.find(v=>v.property_id===p.id)||defaultPolicy;
    // What cancelling right now would cost, for the card: the same rule the cancel action applies.
    const cancelFor=(b:Row)=>{const t=enrichedTerms.find(v=>v.booking_id===b.id);if(!t||!['requested','confirmed'].includes(b.status)||t.actual_checkin)return null;return cancellationTerms({by:b.owner_id===this.userId?'owner':'guest',status:b.status,mode:t.billing_mode,rate:t.rate,units:t.units,amount:b.amount,paid:t.paid_amount,deposit:t.deposit_status==='owner_verified'?t.deposit:0,start:b.start,minHours:t.min_hours||policies.find(v=>v.property_id===b.property_id)?.min_hours||1,at:serverTime,banquet:!!t.occasion});};
    // Completed stays per own place: prepayments open after five of them (lib/prepay.ts).
    const stays=new Map<string,number>((ownProperties.length?await this.all("SELECT b.property_id,COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE p.owner_id=? AND b.status='completed' AND t.actual_checkout IS NOT NULL AND b.guest_id<>p.owner_id GROUP BY b.property_id",this.userId):[]).map(r=>[r.property_id,Number(r.n)]));
    const guests=await reliabilityFor(this.db,'guest',bookings.filter(b=>b.owner_id===this.userId&&b.status==='requested').map(b=>b.guest_id));
    const roomCountsOwn=ownProperties.length?await roomCounts(this.db):new Map<string,number>();
    const state={ profile, properties:await this.enrichProperties(properties.map(p=>({...p,policy:publicPolicy(policyFor(p))}))), ownProperties:await this.enrichProperties(await Promise.all(ownProperties.map(async p=>({...p,...(roomCountsOwn.has(p.id)?{units:await roomState(this.db,p.id)}:{}),policy:policyFor(p),operation:operations.find(v=>v.property_id===p.id),prepay:prepayState(policyFor(p).prepay_percent,stays.get(p.id)||0)}))),true), bookings:bookings.map(({risk_row,handover_row,owner_pay_row,...b}) => ({...b,owner_pay:owner_pay_row&&(b.owner_id===this.userId||payoutOpen({...b,terms:enrichedTerms.find(t=>t.booking_id===b.id)},serverTime))?guestPayout(JSON.parse(owner_pay_row),b.owner_id===this.userId||phoneOpens(b,serverTime)):null,risk:riskFromRow(risk_row?JSON.parse(risk_row):null),handover:handover_row?JSON.parse(handover_row):null,...(b.owner_id===this.userId?{guest_reliability:guests.get(b.guest_id)}:{}),status:b.status==='requested' && b.expires_at<=serverTime?'expired':b.status,terms:enrichedTerms.find(t=>t.booking_id===b.id),cancel_terms:cancelFor(b),changes:changes.filter(c=>c.booking_id===b.id).map(c=>({...c,status:c.status==='pending'&&c.expires_at<=serverTime?'expired':c.status})),readiness:operations.find(o=>o.property_id===b.property_id)?.readiness})), jobs:jobs.map(({open_address,cleaner_pay_row,...j}:Row):Row=>({...j,cleaner_pay:cleaner_pay_row?JSON.parse(cleaner_pay_row):null,street:streetAddress(open_address),settlement_paid:jobPayments.find(p=>p.job_id===j.id)?.paid??(j.settled_at?j.fee:0),checkout_confirmed:!j.booking_id||!!j.checkout_confirmed})), applications, notifications, messages, serverTime, integrations:{ai:false,telegram:false,whatsapp:false,payments:false} };
    return {...state,workspaces:Object.fromEntries(roles.map(role=>[role,operationOverview(state,this.userId,role,serverTime)]))};
  }
  async publicCatalog(options:{syntheticPreview?:boolean;rooms?:boolean}={}) {
    const visible=pilotPropertyVisibleSql('p'),visibility=options.syntheticPreview?"("+visible+" OR p.description LIKE 'СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ%')":visible;
    // The rooms of a card (lib/room-units.ts) are searched one by one, but listed only as their card.
    const rooms=options.rooms?'':' AND NOT EXISTS(SELECT 1 FROM room_units u WHERE u.property_id=p.id)';
    const properties=await this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes,CASE WHEN '+visible+' THEN 0 ELSE 1 END test_preview'+(options.rooms?',(SELECT u.lead_id FROM room_units u WHERE u.property_id=p.id) room_lead':'')+' FROM properties p WHERE published=1 AND demo_owner IS NULL AND '+visibility+rooms+' ORDER BY created_at DESC');
    const policies=await this.all('SELECT * FROM property_policies WHERE property_id IN (SELECT value FROM json_each(?))',JSON.stringify(properties.map(p=>p.id)));
    return {properties:await this.enrichProperties(properties.map(p=>({...p,policy:publicPolicy(policies.find(v=>v.property_id===p.id))})))};
  }
  async publicSearch(filters:Record<string,string>={},options:{syntheticPreview?:boolean;matching?:boolean;ignorePrep?:boolean;readyIds?:string[];arrival?:{around:number|null}}={}){
    const city=String(filters.city||'').trim(),mode=filters.mode||'daily',guests=number(filters.guests||1,'Гости',1,1000);
    if(city.length>80||!['daily','hourly','night'].includes(mode))throw new DomainError('Проверьте город и вид аренды.');
    const catalog=await this.publicCatalog({...options,rooms:true}),cities=[...new Set(catalog.properties.map(p=>String(p.city)))].sort();
    const cityKey=city.toLocaleLowerCase('ru'),exactCity=catalog.properties.some(p=>String(p.city).toLocaleLowerCase('ru')===cityKey);
    // Homes unless the bath category is asked for by name or by its types: a bath never shows among homes.
    const kinds=Array.isArray(filters.kinds)?filters.kinds:[],category=categories[filters.category]?filters.category:searchCategory(kinds);
    let items=catalog.properties.filter(p=>(!city||(exactCity?String(p.city).toLocaleLowerCase('ru')===cityKey:String(p.city).toLocaleLowerCase('ru').includes(cityKey)))&&p.capacity>=guests&&(mode!=='hourly'||p.policy.hourly_price>0)&&kindCategory(p.details?.type)===category);
    let range:{start:number;end:number}|null=null,later:Row[]=[],arrivalSet:{steps:number[];at:number}|null=null;
    const arrivalOf=new Map<string,string>();
    if(filters.start||filters.end){
      range=interval(filters.start,filters.end);
      const {start,end}=range;
      // The arrival strip (lib/arrival-ready.ts): the same stays, cleanings and blocks, fetched once for every step of it.
      const steps=options.arrival?arrivalSteps(start,options.arrival.around,now()):[];
      const strip=options.arrival?await busyAround(this.db,steps[0],steps[steps.length-1]+end-start,now()):null;
      const [booked,cleaning,external,stale]=strip?[strip.filter(b=>{const p=items.find(p=>p.id===b.property_id);return !!p&&b.start<end+(Number(p.cleaning_minutes)||0)*60&&b.until>start;}),[],[],await this.all("SELECT DISTINCT property_id FROM calendar_sources WHERE enabled=1 AND url<>'' AND (last_success IS NULL OR last_success<? OR last_error<>'')",now()-3600)]:await Promise.all([
        this.all("SELECT DISTINCT b.property_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?)) AND b.start<?+p.cleaning_minutes*60 AND b.occupied_until>?",now(),end,start),
        this.all("SELECT DISTINCT j.property_id FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status IN ('open','assigned','in_progress','submitted') AND j.start<?+p.cleaning_minutes*60 AND j.end>?",end,start),
        this.all('SELECT DISTINCT x.property_id FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id JOIN properties p ON p.id=x.property_id WHERE s.enabled=1 AND x.start<?+p.cleaning_minutes*60 AND x.end>?',end,start),
        this.all("SELECT DISTINCT property_id FROM calendar_sources WHERE enabled=1 AND url<>'' AND (last_success IS NULL OR last_success<? OR last_error<>'')",now()-3600),
      ]);
      const occupied=new Set([...booked,...cleaning,...external,...stale].map(p=>p.property_id));
      // Every home of the city that passes all but the time, with its code for each step; the ones not free at the asked
      // time are priced at their first free step, so the guest sees «С 19:00» and what it costs.
      if(strip){
        const staleIds=new Set(stale.map(p=>p.property_id)),length=end-start,stripWindows=mode==='hourly'?await openWindowsIn(this.db,steps[0],steps[steps.length-1]+length):[];
        later=items.filter(p=>!staleIds.has(p.id)&&!['maintenance','blocked'].includes(p.display_status.code)).flatMap(p=>{
          const codes=arrivalCodes(p,strip.filter(b=>b.property_id===p.id),steps,length,now(),options.readyIds?.includes(p.id));
          // The first free step after the asked arrival; else the latest before it (the strip counts it at its own steps).
          let first=steps.findIndex((t,i)=>codes[i]!=='-'&&t>start);
          if(first<0)first=[...codes].map((c,i)=>c!=='-'?i:-1).filter(i=>i>=0).pop()??-1;
          arrivalOf.set(p.id,codes);
          if(first<0)return [];
          try{const at=steps[first],price=withGuests(windowQuote(rentalPrice(p.price,p.policy,at,at+length,mode),p.policy.hourly_price,windowAt(stripWindows,p.id,at,at+length)),p.policy,guests);return [{...p,arrival:codes,arrivalFrom:at,estimate:{amount:price.amount,periods:price.periods,rate:price.price,unitLabel:price.unitLabel,billingMode:price.billingMode,surcharge:Number((price as Row).guestSurcharge)||0,...(price.window?{window:price.window}:{})}}];}catch(error){if(error instanceof DomainError)return [];throw error;}
        });
        arrivalSet={steps,at:start};
      }
      items=items.filter(p=>!occupied.has(p.id)&&!['maintenance','blocked'].includes(p.display_status.code)&&(start>now()+60||p.display_status.code==='ready')
        // A place that is made ready before the guests is not offered sooner than that takes.
        &&(options.ignorePrep||options.readyIds?.includes(p.id)||!tooSoon(p.policy,start,now())));
      const windows=mode==='hourly'?await openWindowsFor(this.db,start,end):new Map();
      items=items.flatMap(p=>{try{const price=withGuests(windowQuote(rentalPrice(p.price,p.policy,start,end,mode),p.policy.hourly_price,windows.get(p.id)),p.policy,guests);return [{...p,estimate:{amount:price.amount,periods:price.periods,rate:price.price,unitLabel:price.unitLabel,billingMode:price.billingMode,surcharge:Number((price as Row).guestSurcharge)||0,...(price.window?{window:price.window}:{})}}];}catch(error){if(error instanceof DomainError)return [];throw error;}});
      // «Цена выгодная»: compared with the other free flats of the city for the same dates, before any budget or page cuts them.
      items=markDeals(items);
    }
    // Open calendar windows: guests see the discounted hourly price and until when it lasts.
    if(!range){const windows=await openWindowsFor(this.db,null,null);if(windows.size)items=items.map(p=>{const w=windows.get(p.id);return w&&w.hourly_to<p.policy.hourly_price?{...p,window:{percent:Math.round((1-w.hourly_to/p.policy.hourly_price)*100),start:w.start,end:w.end,hourly:w.hourly_to}}:p;});}
    const pageInput=number(filters.page||1,'Страница',1,100000),limit=number(filters.limit||24,'На странице',1,60),minPrice=number(filters.minPrice||0,'Минимальная цена',0,100000000),maxPrice=number(filters.maxPrice||100000000,'Максимальная цена',0,100000000),rooms=number(filters.rooms||0,'Комнаты',0,20),sort=filters.sort||'recommended';
    if(minPrice>maxPrice||!['recommended','price-asc','price-desc'].includes(sort)||filters.roomsExact&&!['0','1'].includes(filters.roomsExact))throw new DomainError('Проверьте цену, число комнат и сортировку.');
    const rate=(p:Row)=>range?p.estimate?.amount:(mode==='hourly'?p.policy.hourly_price:p.price);
    items=items.filter(p=>(!rooms||(filters.roomsExact==='1'?p.rooms===rooms:p.rooms>=rooms))&&rate(p)>=minPrice&&rate(p)<=maxPrice);
    if(sort!=='recommended')items.sort((a,b)=>(sort==='price-asc'?1:-1)*(rate(a)-rate(b))||String(a.id).localeCompare(String(b.id)));
    // «Номера одного типа»: one card per type of room, saying how many of its rooms are free at the asked time.
    {const leads=new Map<string,string>(catalog.properties.filter(p=>p.room_lead).map(p=>[String(p.id),String(p.room_lead)]));if(leads.size){const counts=new Map<string,number>();for(const lead of leads.values())counts.set(lead,(counts.get(lead)||1)+1);items=collapseRooms(items,leads,counts,!!range);later=collapseRooms(later,leads,counts,!!range);}}
    const total=items.length,totalPages=Math.max(1,Math.ceil(total/limit)),page=Math.min(pageInput,totalPages);
    let pageItems:Row[]=options.matching?items:items.slice((page-1)*limit,page*limit);
    // The strip: each found home carries its codes; the others free later are kept apart, off the found list.
    if(arrivalSet){const found=new Set(pageItems.map(p=>p.id));pageItems=pageItems.map(p=>({...p,arrival:arrivalOf.get(p.id)||''}));later=later.filter(p=>!found.has(p.id));}
    if(filters.map==='1'&&(pageItems.length||later.length)){const locations=options.matching?await this.all('SELECT l.*,p.city,p.district,p.address FROM property_locations l JOIN properties p ON p.id=l.property_id WHERE p.published=1'):await this.all('SELECT l.*,p.city,p.district,p.address FROM property_locations l JOIN properties p ON p.id=l.property_id WHERE p.id IN ('+pageItems.map(()=>'?').join(',')+')',...pageItems.map(p=>p.id));const placed=(p:Row)=>{const l=locations.find(l=>l.property_id===p.id);return {...p,location:l&&l.address_fingerprint===[l.city,l.district,l.address].join('|')?publicPoint(l):null};};pageItems=pageItems.map(placed);later=later.map(placed);}
    return {...(arrivalSet?{arrival:arrivalSet,later}:{}),properties:pageItems,total,page,limit,totalPages,cities,filters:{city,mode,guests,minPrice,maxPrice,rooms,sort,...(range?{start:range.start,end:range.end}:{})},availabilityChecked:!!range,...(filters.map==='1'?{center:mapCities[Object.keys(mapCities).find(c=>c.toLocaleLowerCase('ru')===city.toLocaleLowerCase('ru'))||'']||[67,48]}:{})};
  }
  async publicMedia(mediaId:string,bucket?:R2Bucket){
    const image=await this.one(`SELECT m.data,m.object_key,m.width,m.height FROM media m WHERE m.id=? AND m.kind='property' AND EXISTS(SELECT 1 FROM property_details d JOIN properties p ON p.id=d.property_id,json_each(d.photos) f WHERE f.value=m.id AND p.published=1 AND p.demo_owner IS NULL AND ${pilotPropertyVisibleSql('p')})`,required(mediaId,'Фото',100));
    if(!image)throw new DomainError('Фотография недоступна.',404);return this.mediaBody(image,bucket);
  }
  async connectRole(roleValue:unknown,body:Row={}){
    const role=parseRole(roleValue),profile=await this.profile();
    if(!profile)throw new DomainError('Сначала войдите или создайте аккаунт.',403);
    const name=required(role==='guest'?profile.name:body.name??profile.name,'Имя',100),contact=required(role==='guest'?profile.contact:body.contact??profile.contact,'Контакт',120),city=required(role==='guest'?profile.city:body.city??profile.city,'Город',80);
    const districts=String(body.districts??profile.districts??'').trim(),experience=String(body.experience??profile.experience??'').trim(),availability=String(body.availability??profile.availability??'').trim();
    if(role==='cleaner'&&(!districts||!experience||!availability||districts.length>300||experience.length>1000||availability.length>300))throw new DomainError('Для работы на уборках укажите районы, опыт и график.');
    if(role==='cleaner'&&[districts,experience,availability].some(hasContactWays))throw new DomainError(PROFILE_CONTACTS,422);
    await this.db.batch([
      this.query("UPDATE profiles SET roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(roles) WHERE value='guest') THEN roles ELSE json_insert(roles,'$[#]','guest') END WHERE id=?",this.userId),
      this.query("UPDATE profiles SET name=?,contact=?,city=?,roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(roles) WHERE value=?) THEN roles ELSE json_insert(roles,'$[#]',?) END,districts=CASE WHEN ?='cleaner' THEN ? ELSE districts END,experience=CASE WHEN ?='cleaner' THEN ? ELSE experience END,availability=CASE WHEN ?='cleaner' THEN ? ELSE availability END WHERE id=?",name,contact,city,role,role,role,districts,role,experience,role,availability,this.userId),
      this.query('UPDATE profile_details SET version=version+1,revision=?,updated_at=? WHERE user_id=?',id(),now(),this.userId),
      this.audit(this.userId,'role.connected:'+role),
    ]);
    return {message:'Рабочий профиль подключён.',role,profile:await this.profile()};
  }
  async savePolicy(propertyId:string,body:Row){
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=?',propertyId,this.userId);if(!p)throw new DomainError('Жильё не найдено.',404);
    const current=await this.one('SELECT * FROM property_policies WHERE property_id=?',propertyId),expected=number(body.expectedVersion,'Версия правил',0,1000000);
    if((current?.version||0)!==expected)throw new DomainError('Правила уже изменились. Обновите карточку.',409);
    // Own staff cleans: no cleaning fee for executors, whatever the form sends.
    const policy=policyInput({...body,...(Number(p.own_staff)?{cleaningFee:0}:{}),autoAssign:body.autoAssign??!!current?.auto_assign,maxDiscountPercent:body.maxDiscountPercent??current?.max_discount_percent??0,minimumRate:body.minimumRate??current?.minimum_rate??0,repairBudget:body.repairBudget??current?.repair_budget??0,autoExtension:body.autoExtension??!!current?.auto_extension,maxExtensionHours:body.maxExtensionHours??current?.max_extension_hours??0,mandateUntil:body.mandateUntil??(current?.mandate_until?new Date(current.mandate_until*1000).toISOString():''),escalationContact:body.escalationContact??current?.escalation_contact??''}),price=number(body.dailyPrice,'Цена за сутки',100,10000000),revision=id(),keys=Object.keys(policy);
    const result=await this.db.batch([
      this.query(`INSERT INTO property_policies(property_id,${keys.join(',')},version,revision,updated_at) VALUES (?,${keys.map(()=>'?').join(',')},?,?,?) ON CONFLICT(property_id) DO UPDATE SET ${keys.map(k=>`${k}=excluded.${k}`).join(',')},version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE property_policies.version=?`,propertyId,...Object.values(policy),expected+1,revision,now(),expected),
      this.query('UPDATE properties SET price=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',price,propertyId,this.userId,propertyId,revision),
      this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',id(),this.userId,propertyId,JSON.stringify({action:'property.policy_updated',policy,dailyPrice:price,version:expected+1}),now(),propertyId,revision)
    ]);
    if(!result[0].meta.changes)throw new DomainError('Правила уже изменились. Обновите карточку.',409);
    return {message:'Тарифы, правила и полномочия сохранены.',version:expected+1};
  }
  async readinessAction(propertyId:string,body:Row){
    const op=await this.one('SELECT o.* FROM property_operations o JOIN properties p ON p.id=o.property_id WHERE p.id=? AND p.owner_id=?',propertyId,this.userId);if(!op)throw new DomainError('Жильё не найдено.',404);
    // «Жильё готово» in one tap: the owner's confirmation is the note, no text to type.
    const readiness=required(body.readiness,'Состояние',30),note=readiness==='ready'&&!String(body.note||'').trim()?'Владелец отметил: жильё убрано и готово к заезду.':required(body.note,'Результат проверки или причина',1000);
    if(!['ready','inspection','maintenance','blocked'].includes(readiness))throw new DomainError('Недопустимое состояние.');
    if((readiness==='ready'||readiness==='inspection')&&op.active_booking_id)throw new DomainError('Сначала подтвердите выезд проживающего гостя.',409);
    if(readiness==='ready'&&body.inspected!==true)throw new DomainError('Подтвердите, что уборка и проверка жилья выполнены.');
    // Closing a home that guests already booked: the owner decides about those stays first. Kept stays remain valid
    // (the home has to be ready again by the arrival); cancelled ones follow the owner's cancellation rule, a full refund.
    const closing=readiness==='maintenance'||readiness==='blocked';
    const upcoming=closing?await this.all("SELECT b.id,b.start FROM bookings b LEFT JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?)) AND b.end>? AND t.actual_checkin IS NULL ORDER BY b.start",propertyId,now(),now()):[];
    const day=(v:number)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(v*1000));
    if(upcoming.length&&body.bookings!=='keep'&&body.bookings!=='cancel')throw new DomainError('У жилья есть брони: '+upcoming.length+', ближайший заезд '+day(upcoming[0].start)+'. Решите, оставить их в силе или отменить с полным возвратом гостям.',409);
    const pending=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND (status IN ('in_progress','submitted') OR (status IN ('open','assigned') AND start<=?))",propertyId,now());
    if(readiness==='ready'&&pending)throw new DomainError('Сначала завершите и примите запланированную уборку.',409);
    const result=await this.db.batch([this.query('UPDATE property_operations SET readiness=?,note=?,version=version+1,updated_at=? WHERE property_id=? AND version=?',readiness,note,now(),propertyId,body.expectedVersion===undefined?op.version:number(body.expectedVersion,'Версия состояния',1,10000000)),this.audit(propertyId,'property.readiness_requested')]);
    if(!result[0].meta.changes)throw new DomainError('Состояние уже изменилось. Обновите карточку.',409);
    if(upcoming.length){
      let cancelled=0;
      if(body.bookings==='cancel')for(const b of upcoming){try{await this.bookingAction(b.id,{action:'cancel',reason:note});cancelled++;}catch(error){if(!(error instanceof DomainError))throw error;}}
      const kept=upcoming.length-cancelled;
      return {message:'Состояние жилья сохранено.'+(cancelled?' Отменено броней: '+cancelled+', гости получили сообщение о полном возврате.':'')+(kept?' Броней в силе: '+kept+'. К заезду '+day(upcoming.find((_,i)=>i>=cancelled)?.start||upcoming[0].start)+' снова отметьте «Жильё готово», иначе гость не сможет заселиться.':''),priceSuggestion:null};
    }
    // Cleaned early: the rest of the cleaning time is free again, and the owner may let the next guest in early.
    if(readiness==='ready')await afterReady(this.db,propertyId);
    const advice=readiness==='ready'?await this.priceAdviceAfterReady(propertyId):null;
    return {message:readiness==='ready'?'Готовность жилья подтверждена.'+(advice?' ИИ-администратор предлагает новую цену, решение за вами.':''):'Состояние жилья сохранено.',priceSuggestion:advice};
  }
  // The flat is ready for the next guest: the moment for the AI administrator's price advice.
  // The advice is optional, so a failure here never undoes the owner's action.
  async priceAdviceAfterReady(propertyId:string){
    try{return await offerPriceAdvice(this.db,propertyId);}catch(error){console.error('Price advice failed',error instanceof Error?error.message:'');return null;}
  }
  async bookingQuote(body:Row,options:{ownerReady?:boolean}={}) {
    // «Номера одного типа» (lib/room-units.ts): a card of many rooms books its first free room.
    const asked=required(body.propertyId,'Жильё',100),card=await this.one('SELECT cleaning_minutes FROM properties WHERE id=?',asked);
    const span=card?interval(body.start,body.end):null,room=span?await pickRoom(this.db,asked,span.start,span.end+(Number(card!.cleaning_minutes)||0)*60):asked;
    const p=await this.one('SELECT p.*,EXISTS(SELECT 1 FROM account_restrictions r WHERE r.user_id=p.owner_id) restricted FROM properties p WHERE p.id=? AND p.published=1 AND (p.demo_owner IS NULL OR p.demo_owner=?)',room,this.userId);
    if(!p) throw new DomainError('Жильё недоступно.',404);
    await assertPilotAllowed(this,'booking',p.id);
    // An owner on hold after a guest's «Меня не заселили», or blocked, takes no new bookings.
    if(p.restricted)throw new DomainError('Это жильё временно не принимает новые брони. Выберите другое.',409);
    const {start,end}=interval(body.start,body.end), guests=number(body.guests,'Гости',1,p.capacity), occupiedUntil=end+p.cleaning_minutes*60;
    const policy={...defaultPolicy,...await this.one('SELECT * FROM property_policies WHERE property_id=?',p.id)},op=await this.one('SELECT readiness FROM property_operations WHERE property_id=?',p.id);
    if(op&&(['maintenance','blocked'].includes(op.readiness)||(start<=now()+60&&op.readiness!=='ready')))throw new DomainError('Жильё сейчас не готово к новым заездам.',409);
    // The owner needs time to get the place ready (to heat a bath): nothing starts sooner, unless the owner says it is ready.
    if(!options.ownerReady&&tooSoon(policy,start,now()))throw new DomainError('Это место готовят к приходу гостей '+prepWords(Number(policy.prep_minutes))+'. Ближайшее начало — '+clockLabel(Math.ceil((now()+prepSeconds(policy))/1800)*1800)+'.',409);
    const kind=(await this.one("SELECT json_extract(details,'$.type') type FROM property_details WHERE property_id=?",p.id))?.type||'apartment';
    const base=rentalPrice(p.price,policy,start,end,kindMode(kind,body.billingMode,start,end)),guestPricing=withGuests(windowQuote(base,policy.hourly_price,base.billingMode==='hourly'?await openWindowFor(this.db,p.id,start,end):null),policy,guests);
    // «Скидка постоянного гостя»: the guest already stayed with this owner through the service (lib/rental-policy.ts).
    const regular=Number(policy.repeat_discount)>0&&!!this.userId&&this.userId!==p.owner_id&&!!await this.one("SELECT b.id FROM bookings b JOIN properties x ON x.id=b.property_id WHERE b.guest_id=? AND x.owner_id=? AND b.status='completed' LIMIT 1",this.userId,p.owner_id);
    const pricing=regular?withRepeatDiscount(guestPricing,policy.repeat_discount):guestPricing;
    await assertCalendarAvailable(this.db,p.id,start,occupiedUntil);
    const occupied=await this.one("SELECT id FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?",p.id,now(),occupiedUntil,start);
    const cleaning=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",p.id,occupiedUntil,start);
    if(occupied||cleaning) throw new DomainError('Этот интервал уже занят, включая время уборки. Выберите другое время.',409);
    // How this guest pays the owner (lib/prepay.ts): the owner's share, or at the arrival while the place is new.
    const prepay=await placePrepay(this.db,p.id,policy.prepay_percent),payment={prepayPercent:prepay.percent,prepay:prepaySum(pricing.amount,prepay.percent),label:prepayLabel(prepay.percent),newPlace:prepay.left>0};
    return {propertyId:p.id,title:p.title,kind,start,end,guests,...pricing,cleaningMinutes:p.cleaning_minutes,occupiedUntil,currency:'KZT',quotedAt:now(),policy:publicPolicy(policy),payment};
  }
  async saveProfile(body: Row) {
    const name=required(body.name,'Имя',100), contact=required(body.contact,'Контакт',120), city=required(body.city,'Город',80);
    const selected=Array.isArray(body.roles)?body.roles.filter((r:Role)=>roles.includes(r)):[];
    if (!selected.length) throw new DomainError('Выберите хотя бы одну роль.');
    const districts=String(body.districts||'').slice(0,300), experience=String(body.experience||'').slice(0,1000), availability=String(body.availability||'').slice(0,300);
    if(selected.includes('cleaner') && (!districts.trim()||!experience.trim()||!availability.trim())) throw new DomainError('Для анкеты исполнителя укажите районы, опыт и график.');
    if([districts,experience,availability].some(hasContactWays))throw new DomainError(PROFILE_CONTACTS,422);
    await this.db.batch([this.query(`INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact=excluded.contact,city=excluded.city,roles=excluded.roles,districts=excluded.districts,experience=excluded.experience,availability=excluded.availability`,this.userId,name,contact,city,JSON.stringify(selected),districts,experience,availability,now()),this.query('UPDATE profile_details SET version=version+1,revision=?,updated_at=? WHERE user_id=?',id(),now(),this.userId),this.audit(this.userId,'profile.updated')]);
    return {message:'Профиль сохранён. Роли подключены.'};
  }
  async createProperty(body:Row) {
    await this.requireRole('owner');
    const propertyId=id(),admission=await readPilotPolicy(this.db),published=admission.require_owner_review||admission.require_phone?0:1;
    await this.db.batch([this.query('INSERT INTO properties(id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',propertyId,this.userId,null,required(body.title,'Название',120),required(body.city,'Город',80),required(body.district,'Район',120),required(body.address,'Точный адрес',300),required(body.description,'Описание и правила',2500),number(body.price,'Цена за сутки',100,10000000),number(body.rooms,'Комнаты',1,20),number(body.capacity,'Вместимость',1,50),number(body.cleaningMinutes,'Время уборки',30,1440),published,now()),this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?)',propertyId,now()),this.audit(propertyId,'property.created')]);
    return {id:propertyId,message:published?'Жильё добавлено в каталог. Точный адрес скрыт до подтверждения брони.':'Жильё сохранено черновиком. Пройдите проверку перед публикацией.'};
  }
  // `ownerReady`: the owner has already said the place will be ready for this start (an accepted quick request),
  // so the preparation time no longer stops the booking. Set only by the server, never from the request body.
  async createBooking(body:Row,options:{ownerReady?:boolean}={}) {
    // Two guests send a request for the same type of room at once: both are given the same first free room and one
    // write loses (booking_overlap). A card of many rooms then tries its next free room, so the second guest is refused
    // only when no room is left (audit «Запуск», point 2).
    for(let attempt=0;;attempt++){
      try{return await this.createBookingOnce(body,options);}
      catch(error){
        const pid=String(body?.propertyId||'');
        if(attempt<3&&/booking_overlap/.test(String((error as Error)?.message??error))&&await this.one('SELECT 1 x FROM room_units WHERE lead_id=? OR property_id=? LIMIT 1',pid,pid))continue;
        throw error;
      }
    }
  }
  private async createBookingOnce(body:Row,options:{ownerReady?:boolean}={}) {
    await this.requireRole('guest');
    const key=required(body.requestKey,'Ключ запроса',100), existing=await this.one('SELECT id FROM bookings WHERE guest_id=? AND request_key=?',this.userId,key);
    if(existing) return {id:existing.id,message:'Эта заявка уже сохранена.'};
    // A guest sends a request only with a photo of the ID attached (lib/identity-docs.ts); a person checks it later.
    await requireIdentity(this.db,this.userId,'Перед первой заявкой приложите фото удостоверения личности в профиле. Его видит только администратор сервиса, после проверки фото удаляется.');
    const checked=await this.bookingQuote(body,{ownerReady:options.ownerReady===true}), {start,end,guests,amount}=checked;
    // An owner who has not paid the service for over a week takes no new bookings (lib/service-dues.ts).
    if(await this.one('SELECT 1 x FROM service_billing sb JOIN properties p ON p.owner_id=sb.user_id WHERE p.id=? AND sb.paused_at IS NOT NULL',String(body.propertyId||'')))throw new DomainError('Это жильё временно не принимает новые брони. Выберите другое.',409);
    if(body.expectedAmount!==undefined && body.expectedAmount!==amount) throw new DomainError('Стоимость изменилась. Проверьте новый расчёт перед отправкой заявки.',409);
    if(body.expectedPolicyVersion!==undefined&&body.expectedPolicyVersion!==checked.policy.version)throw new DomainError('Условия проживания изменились. Проверьте новый расчёт.',409);
    if(checked.policy.version>0&&body.acceptTerms!==true)throw new DomainError('Подтвердите согласие с показанными правилами проживания.');
    const bookingId=id(), p={id:checked.propertyId,cleaning_minutes:checked.cleaningMinutes};
    const owner=await this.one('SELECT owner_id,price FROM properties WHERE id=?',p.id);
    if(owner?.owner_id===this.userId)throw new DomainError('Это ваше жильё: забронировать его как гость нельзя. Чтобы закрыть даты, нажмите «Закрыть заезды» в правилах жилья.',403);
    // One guest does not hold the same time in two homes without paying: the first request is paid or cancelled first.
    const held=await this.one("SELECT p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? AND b.property_id<>? AND b.start<? AND b.end>? AND ((b.status='requested' AND b.expires_at>?) OR (b.status='confirmed' AND b.payment_status<>'owner_verified')) LIMIT 1",this.userId,p.id,end,start,now());
    if(held)throw new DomainError('На это время у вас уже есть неоплаченная бронь: «'+held.title+'». Оплатите или отмените её, затем бронируйте другое жильё.',409);
    const policyNow=await this.one('SELECT * FROM property_policies WHERE property_id=?',p.id),autoConfirm=!!policyNow?.auto_confirm&&mandateActive(policyNow)&&policyNow.version===checked.policy.version;
    // The owner's own time to answer a request («Автопилот: решения и сроки»).
    const answer=(await ruleFor(this.db,owner!.owner_id,'request')).minutes;
    const risk=assessBookingRisk(await riskSignals(this.db,this.userId,{start,end,billingMode:checked.billingMode,price:Number(owner!.price||0),deposit:checked.policy.deposit}));
    // Under autopilot a high risk is not confirmed automatically: the owner decides.
    risk.held=autoConfirm&&risk.level==='high';
    // A home not ready with the arrival close: the owner is told in the request, the autopilot leaves the decision to them.
    const unready=unreadyNote((await this.one('SELECT readiness FROM property_operations WHERE property_id=?',p.id))?.readiness,start,now());
    // A banquet always has an occasion: it marks the booking as a banquet and tells the owner what to get ready for.
    const occasion=isBanquet(checked.kind)?(Object.hasOwn(occasions,String(body.occasion))?String(body.occasion):'other'):'',event=occasion?' '+(occasion==='other'?'Банкет':occasionLabel(occasion))+', гостей: '+guests+'.':'';
    // «Принял бронь» is said only once the confirmation is written: the autopilot may be switched off in between (audit 2026-11-22).
    const accepting=autoConfirm&&!risk.held&&!unready;
    await this.db.batch([
      this.query('INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',bookingId,p.id,this.userId,start,end,end+p.cleaning_minutes*60,guests,amount,'requested',now()+answer*60,'unpaid',key,now()),
      this.query('INSERT INTO booking_terms(booking_id,billing_mode,rate,units,amount,deposit,deposit_status,house_rules,policy_version,original_end,min_hours,occasion,prepay_percent,discount_percent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',bookingId,checked.billingMode,checked.price,checked.periods,amount,checked.policy.deposit,checked.policy.deposit?'pending':'not_required',checked.policy.house_rules,checked.policy.version,end,Math.max(1,Number(checked.policy.min_hours)||1),occasion,checked.payment.prepayPercent,Number((checked as Row).repeat?.percent)||0),
      ...(accepting?[]:[this.notify(owner!.owner_id,risk.held?`ИИ-администратор не подтвердил заявку на «${checked.title}» сам: ${riskLabel.high.toLowerCase()} (${risk.reasons.slice(0,2).join(', ')}).${unready?' '+unready+'.':''} Решите в течение ${minutesLabel(answer)}.`:autoConfirm&&unready?`ИИ-администратор не подтвердил заявку на «${checked.title}» сам: ${unready[0].toLowerCase()+unready.slice(1)}. Отметьте «Жильё готово», если успеете, или решите сами в течение ${minutesLabel(answer)}.`:autoConfirm?`ИИ-администратор принял бронь на «${checked.title}» по вашим правилам.${event} ${riskLabel[risk.level]}.`:`Новая заявка на «${checked.title}».${event} ${riskLabel[risk.level]}.${unready?' '+unready+'.':''} Подтвердите её в течение ${minutesLabel(answer)}.`,`booking:${bookingId}`,'owner')]),this.audit(bookingId,'booking.requested'),
      saveRiskSql(this.db,bookingId,p.id,this.userId,owner!.owner_id,risk),
      ...(!risk.phone&&risk.level!=='low'&&!(autoConfirm&&!risk.held&&!unready)?[this.notify(this.userId,'Подтвердите телефон в профиле: владельцу так спокойнее, и заявку на «'+checked.title+'» подтвердят быстрее.','phone-ask:'+bookingId,'guest')]:[])
    ]);
    const policy=policyNow!;
    if(autoConfirm&&!risk.held&&!unready){
      // The owner was told the AI accepted it; if the confirmation fails after all, the owner decides and is told so.
      try{await new RentalService(this.db,owner!.owner_id,{propertyId:p.id,policyVersion:policy.version}).bookingAction(bookingId,{action:'confirm',cleaningFee:policy.cleaning_fee});
        await this.notify(owner!.owner_id,`ИИ-администратор принял бронь на «${checked.title}» по вашим правилам.${event} ${riskLabel[risk.level]}.`,`booking:${bookingId}`,'owner').run();}
      catch(error){if(!(error instanceof DomainError))throw error;await this.notify(owner!.owner_id,`ИИ-администратор не смог подтвердить заявку на «${checked.title}» сам: ${error.message} Решите в течение ${minutesLabel(answer)}.`,`booking-held:${bookingId}`,'owner').run();return {id:bookingId,amount,message:'Заявка отправлена. Интервал зарезервирован на '+minutesLabel(answer)+' до решения владельца.'};}
      return {id:bookingId,amount,message:'Бронь подтверждена автоматически по правилам владельца. Оплата и депозит учитываются отдельно.'};}
    return {id:bookingId,amount,message:'Заявка отправлена. Интервал зарезервирован на '+minutesLabel(answer)+' до решения владельца.'};
  }
  /** What came in as deposit for a booking, by the journal. */
  async depositIn(bookingId:string){return Number((await this.one("SELECT COALESCE(SUM(amount),0) n FROM finance_entries WHERE booking_id=? AND kind='deposit'",bookingId))?.n)||0;}
  /** «Деньги получены» on a cancelled booking: the transfer the guest reported before cancelling did arrive. It is
   *  recorded as named, and what the cancellation rules return of it is added to what the owner gives back. */
  async receivedAfterCancel(b:Row,terms:Row){
    const pay=terms.payment_reported_at?Number(terms.payment_reported_amount)||0:0,deposit=terms.deposit_reported_at?Number(terms.deposit_reported_amount)||0:0;
    await migrateFinanceEntity(this,'booking',b.id);
    if(pay)await recordFinance(this,{kind:'payment',bookingId:b.id,amount:Math.min(pay,b.amount),confirmed:true,note:'Перевод гостя до отмены найден владельцем',requestKey:'paid-after-cancel:'+b.id+':'+terms.version});
    if(deposit)await recordFinance(this,{kind:'deposit',bookingId:b.id,amount:Math.min(deposit,Number(terms.deposit)||deposit),confirmed:true,note:'Депозит гостя до отмены найден владельцем',requestKey:'deposit-after-cancel:'+b.id+':'+terms.version});
    const back=Number(terms.refund_if_received)||0,sum=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸',total=back+deposit;
    await this.db.batch([
      this.query('UPDATE booking_terms SET refund_due=COALESCE(refund_due,0)+refund_if_received,refund_recorded_at=CASE WHEN refund_if_received>0 THEN NULL ELSE refund_recorded_at END,refund_if_received=0,payment_reported_at=NULL,deposit_reported_at=NULL,payment_reported_amount=0,deposit_reported_amount=0,version=version+1 WHERE booking_id=?',b.id),
      this.notify(b.guest_id,'Владелец нашёл ваш перевод '+sum(pay+deposit)+' за «'+b.title+'».'+(total?' По правилам отмены вам вернут '+sum(total)+'.':' По правилам отмены он остаётся владельцу.'),'paid-after-cancel:'+b.id,'guest'),
      this.audit(b.id,'booking.paid_after_cancel')]);
    return {message:'Перевод учтён.'+(total?' Верните гостю '+sum(total)+(deposit?' (из них депозит '+sum(deposit)+')':'')+' и отметьте возврат в брони.':'')};
  }
  async bookingAction(bookingId:string,body:Row) {
    const b=await this.one('SELECT b.*,p.owner_id,p.cleaning_minutes,p.title,'+TYPE_SQL+' FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND (b.guest_id=? OR p.owner_id=?)',bookingId,this.userId,this.userId);
    if(!b) throw new DomainError('Бронь не найдена.',404);
    if(this.execution){
      const mandate=await this.one('SELECT * FROM property_policies WHERE property_id=?',b.property_id);
      const scoped=this.execution.propertyId===b.property_id&&!!mandate?.auto_confirm&&mandateActive(mandate)&&mandate.version===this.execution.policyVersion;
      // Under autopilot the guest's own report of leaving frees the flat; the owner is told and keeps the deposit decision.
      const checkout=body.action==='checkout'&&!!mandate?.auto_assign&&!!(await this.one('SELECT checkout_reported_at FROM booking_terms WHERE booking_id=? AND checkout_reported_at IS NOT NULL',bookingId));
      // The guest's report of arrival lets the AI confirm the check-in; payment and deposit are still checked below.
      const checkin=body.action==='checkin'&&!!mandate?.auto_assign&&!!(await this.one('SELECT checkin_reported_at FROM booking_terms WHERE booking_id=? AND checkin_reported_at IS NOT NULL',bookingId));
      if(!scoped||!(checkout||checkin||body.action==='confirm'&&body.cleaningFee===mandate.cleaning_fee&&body.cleaningFee<=mandate.cleaning_budget))throw new DomainError('Автоматическое действие выходит за полномочия владельца.',403);
    }
    const owner=b.owner_id===this.userId;
    const terms=await this.one('SELECT * FROM booking_terms WHERE booking_id=?',bookingId),op=await this.one('SELECT * FROM property_operations WHERE property_id=?',b.property_id);
    if(body.expectedVersion!==undefined&&body.expectedVersion!==terms?.version)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
    if(['record_deposit_return','record_refund'].includes(body.action)){
      if(!owner)throw new DomainError('Фактический расчёт отмечает владелец.',403);
      if(body.confirmed!==true)throw new DomainError('Подтвердите, что перевод уже выполнен вне сервиса.');
      number(body.expectedVersion,'Версия брони',1,10000000);
      const deposit=body.action==='record_deposit_return';
      if(deposit?!['completed','cancelled','expired'].includes(b.status)||(await migrateFinanceEntity(this,'booking',bookingId),!await this.depositIn(bookingId)):!['cancelled','expired'].includes(b.status)||!terms?.paid_amount)throw new DomainError('Для этой брони такой расчёт не ожидается.',409);
      const note=required(body.note||(deposit?'Владелец отметил возврат депозита':'Владелец отметил возврат оплаты'),'Основание отметки расчёта',1000);await migrateFinanceEntity(this,'booking',bookingId);
      const balance=await this.one("SELECT COALESCE(SUM(CASE WHEN kind=? THEN amount WHEN kind=? THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",deposit?'deposit':'payment',deposit?'deposit_return':'refund',bookingId),remaining=balance?.n||0;
      // After a cancellation the guest is owed what the offer's rules left, not always everything paid.
      const refunded=deposit||terms?.refund_due==null?0:(await this.one("SELECT COALESCE(SUM(amount),0) n FROM finance_entries WHERE booking_id=? AND kind='refund'",bookingId))?.n||0;
      const due=deposit?Math.max(0,remaining-(Number(terms?.deposit_kept)||0)):terms?.refund_due==null?remaining:Math.min(remaining,Math.max(0,terms.refund_due-refunded));
      if(!due)return {message:'Расчёт уже полностью отмечен.'};
      return recordFinance(this,{kind:deposit?'deposit_return':'refund',bookingId,amount:due,confirmed:true,note,requestKey:body.action+':'+bookingId+':'+terms?.version});
    }
    // Damage found after the stay: the owner keeps a part of the deposit once, says why, and returns the rest.
    // The guest sees the sum and the reason and can object through «Есть проблема».
    if(body.action==='keep_deposit'){
      if(!owner)throw new DomainError('Удержание из депозита отмечает владелец.',403);
      if(b.status!=='completed'||terms?.deposit_status!=='owner_verified')throw new DomainError('Удержать часть депозита можно после выезда гостя, пока депозит у вас.',409);
      if(terms.deposit_kept)throw new DomainError('Удержание по этой брони уже отмечено.',409);
      await migrateFinanceEntity(this,'booking',bookingId);
      const left=(await this.one("SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='deposit_return' THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",bookingId))?.n||0;
      if(!left)throw new DomainError('Депозит уже возвращён полностью.',409);
      const amount=number(body.amount,'Сумма удержания',1,left),reason=required(body.reason,'Причина удержания',1000),t=now(),money=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸';
      const r=await this.db.batch([
        this.query("UPDATE booking_terms SET deposit_kept=?,deposit_kept_note=?,deposit_returned_at=CASE WHEN ?>=? THEN ? ELSE deposit_returned_at END,version=version+1 WHERE booking_id=? AND deposit_kept=0 AND version=?",amount,reason,amount,left,t,bookingId,terms.version),
        this.notify(b.guest_id,'Владелец удержал из депозита за «'+b.title+'» '+money(amount)+'. Причина: '+reason+(left>amount?' Остальное, '+money(left-amount)+', он вернёт.':'')+' Если не согласны, нажмите «Есть проблема» в брони.',`deposit-kept:${bookingId}`,'guest'),
        this.audit(bookingId,'booking.deposit_kept:'+amount)]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
      return {message:'Удержание '+money(amount)+' отмечено, гость видит причину.'+(left>amount?' Верните гостю остаток: '+money(left-amount)+'.':'')};
    }
    if(body.action==='deposit_received'){
      if(!owner)throw new DomainError('Депозит подтверждает владелец.',403);
      if(b.status!=='confirmed'||!terms?.deposit)throw new DomainError('Для этой брони депозит не ожидается.',409);
      await migrateFinanceEntity(this,'booking',bookingId);const balance=await this.one("SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='deposit_return' THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",bookingId),remaining=Math.max(0,terms.deposit-(balance?.n||0));if(!remaining)return {message:'Депозит уже учтён.'};
      const amount=body.upTo!==undefined?Math.min(remaining,number(body.upTo,'Сумма',1,remaining)):remaining;
      return recordFinance(this,{kind:'deposit',bookingId,amount,confirmed:true,note:'Поступление депозита проверено владельцем',requestKey:'deposit:'+bookingId+':'+terms.version});
    }
    if(body.action==='report_checkout'){
      if(b.guest_id!==this.userId)throw new DomainError(venueOr(b,'Сообщить о выезде может гость.','Сообщить '+wordsOf(b).ofLeave+' может гость.'),403);
      if(b.status!=='confirmed'||b.start>now())throw new DomainError(venueOr(b,'Проживание ещё не началось или уже завершено.','Бронь ещё не началась или уже завершена.'),409);
      await this.db.batch([this.query('UPDATE booking_terms SET checkout_reported_at=?,version=version+1 WHERE booking_id=? AND checkout_reported_at IS NULL',now(),bookingId),this.notify(b.owner_id,venueOr(b,'Гость сообщил о выезде. Проверьте освобождение жилья.','Гость сообщил '+wordsOf(b).ofLeave+' в «'+b.title+'». Проверьте и подтвердите.'),'checkout-reported:'+bookingId,'owner'),this.audit(bookingId,'booking.checkout_reported')]);return {message:venueOr(b,'Спасибо, выезд отмечен. Владелец подтвердит его; если он не ответит за полчаса, ИИ-администратор подтвердит сам.','Спасибо, отметили. Владелец подтвердит; если он не ответит за полчаса, ИИ-администратор подтвердит сам.')};
    }
    if(body.action==='report_late'){
      if(b.guest_id!==this.userId)throw new DomainError('Сообщить о задержке может гость.',403);
      if(b.status!=='confirmed'||terms?.actual_checkin||terms?.checkin_reported_at||b.end<=now())throw new DomainError('Сейчас нельзя перенести заезд по этой брони.',409);
      if(b.start-LATE_OPENS>now())throw new DomainError('Сообщить о задержке можно за 3 часа до заезда.',409);
      const until=lateUntil({start:b.start,end:b.end,arrival_eta:terms?.arrival_eta,late_count:terms?.late_count},now());
      if(!until)throw new DomainError('Больше переносить заезд нельзя. Напишите владельцу в чате брони.',409);
      const r=await this.db.batch([
        this.query('UPDATE booking_terms SET arrival_eta=?,late_count=late_count+1,version=version+1 WHERE booking_id=? AND late_count=? AND actual_checkin IS NULL',until,bookingId,terms?.late_count||0),
        // A new arrival time starts the AI's questions about the arrival over.
        this.query('UPDATE stay_watch SET arrival_step=0,updated_at=? WHERE booking_id=? AND changes()>0',now(),bookingId),
        this.notify(b.owner_id,'Гость задерживается: приедет в «'+b.title+'» к '+clockLabel(until)+'. Бронь сохраняется.','guest-late:'+bookingId+':'+((terms?.late_count||0)+1),'owner'),
        this.audit(bookingId,'booking.guest_late')]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
      return {message:'Владелец предупреждён: вы приедете к '+clockLabel(until)+'. Бронь сохраняется.'};
    }
    // «Не могу попасть»: the guest is at the door, said «Я оплатил», and the owner has not checked the transfer yet.
    // The owner hears it at once and the service administrator sees it as an appeal; the access stays closed until
    // the money is confirmed (audit «Запуск», point 1). Lighter than «Меня не заселили»: nothing is hidden from the map.
    if(body.action==='door_help'){
      if(b.guest_id!==this.userId)throw new DomainError('Позвать на помощь может гость.',403);
      if(b.status!=='confirmed'||terms?.actual_checkin||b.end<=now())throw new DomainError('По этой брони заселение уже отмечено или бронь не подтверждена.',409);
      if(now()<checkinOpensAt(b.start,terms?.early_checkin_at))throw new DomainError('Позвать на помощь можно с 15 минут до заезда.',409);
      if(b.payment_status==='owner_verified'&&terms?.deposit_status!=='pending')throw new DomainError('Оплата уже подтверждена. Если вас не пускают, нажмите «Меня не заселили».',409);
      if(!onReview(terms)||!dueNow({...b,terms},now()).reported)throw new DomainError('Сначала переведите владельцу всё, что осталось, и нажмите «Я оплатил». Если вас не пускают, нажмите «Меня не заселили».',409);
      const sum=(Number(terms?.payment_reported_amount)||0)+(Number(terms?.deposit_reported_amount)||0),money=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸';
      const asked=await this.one('SELECT 1 x FROM notifications WHERE user_id=? AND dedupe=?',b.owner_id,'owner:door-help:'+bookingId+':'+terms?.payment_reported_at+':'+terms?.deposit_reported_at);
      if(asked)return {message:'Владелец и администратор сервиса уже знают, что вы ждёте. Доступ откроется, когда владелец подтвердит перевод.'};
      const write=await this.issueWrite(b,'booking','Гость у двери и не может попасть: перевод '+money(sum)+' на проверке, владелец ещё не подтвердил деньги.');
      await this.db.batch([write.statement,
        this.query('UPDATE booking_terms SET checkin_reported_at=COALESCE(checkin_reported_at,?),version=version+1 WHERE booking_id=? AND actual_checkin IS NULL',now(),bookingId),
        this.notify(b.owner_id,'Срочно: гость ждёт у «'+b.title+'» и не может попасть. Он сообщил о переводе '+money(sum)+'. Проверьте банк и нажмите в брони «Деньги получены» или «Перевод не пришёл».','door-help:'+bookingId+':'+terms?.payment_reported_at+':'+terms?.deposit_reported_at,'owner'),
        this.audit(bookingId,'booking.door_help')]);
      return {message:'Владелец получил срочное сообщение, администратор сервиса видит обращение. Доступ откроется, когда владелец подтвердит перевод. Платить заново не нужно.'};
    }
    // «Меня не заселили»: the guest is at the door and nobody lets them in (lib/account-restrictions.ts).
    if(body.action==='not_let_in'){
      if(b.guest_id!==this.userId)throw new DomainError('Сообщить об этом может гость.',403);
      if(b.status!=='confirmed'||terms?.actual_checkin)throw new DomainError('По этой брони заселение уже отмечено или бронь не подтверждена. Если что-то не так, нажмите «Есть проблема».',409);
      if(now()<checkinOpensAt(b.start,terms?.early_checkin_at))throw new DomainError('Сообщить, что вас не заселили, можно с 15 минут до заезда.',409);
      if(now()>b.end+86400)throw new DomainError('Бронь уже закончилась. Нажмите «Есть проблема» в брони.',409);
      return reportNotLetIn(this,b,terms,String(body.text||''));
    }
    // The home is ready before the next guest: «Можно заселиться раньше» (lib/arrival-shift.ts).
    if(body.action==='early_checkin'){
      if(!owner)throw new DomainError('Пустить гостя раньше может владелец.',403);
      return allowEarlyCheckin(this.db,b,terms,op);
    }
    // The cleaning runs late: the owner asks the guest to come later. A booking change the guest accepts or declines.
    if(body.action==='shift_arrival'){
      if(!owner)throw new DomainError('Сдвинуть заезд может владелец.',403);
      const by=Number(body.minutes)*60;
      if(!SHIFT_CHOICES.includes(by/60))throw new DomainError('Выберите, на сколько сдвинуть заезд.');
      if(b.status!=='confirmed'||terms?.actual_checkin||b.start<=now())throw new DomainError('Сдвинуть можно только заезд, который ещё не начался.',409);
      const next=shiftedStay(b,terms?.billing_mode||'daily',by),iso=(v:number)=>new Date(v*1000).toISOString();
      const q=await this.bookingChangeQuote(bookingId,'owner',{start:iso(next.start),end:iso(next.end)});
      return this.proposeBookingChange(bookingId,'owner',{start:iso(next.start),end:iso(next.end),expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true,reason:shiftReason(b.title||'жильё',by,next.start),requestKey:'shift:'+bookingId+':'+b.start+':'+by});
    }
    // Direct settlement: the guest transfers the stay and the deposit to the owner outside the service and says so here.
    // Nothing is counted as paid until the owner has seen the money and confirmed («received»).
    if(body.action==='report_paid'){
      if(b.guest_id!==this.userId)throw new DomainError('Сообщить об оплате может гость.',403);
      if(b.status!=='confirmed')throw new DomainError('Оплата нужна после подтверждения брони.',409);
      // What is due now (lib/prepay.ts): the prepayment before the arrival, the rest and the deposit at it.
      const due=dueNow({...b,terms:{...terms,deposit_received_amount:await this.depositIn(bookingId)}},now()),left=due.left,deposit=due.deposit,sum=(n:number)=>n.toLocaleString('ru-RU').replace(/ | /g,' ')+' ₸';
      if(!left&&!deposit&&due.phase==='prepay'&&b.amount>(Number(terms?.paid_amount)||0))throw new DomainError((prepayOf(terms)?'Предоплата уже учтена, остальное':'По этой брони оплата')+' — при заселении: реквизиты откроются за 15 минут до '+wordsOf(b).arriveGen+'.',409);
      if(!left&&!deposit)return {message:'Владелец уже подтвердил оплату.'};
      if((!left||terms?.payment_reported_at)&&(!deposit||terms?.deposit_reported_at))return {message:'Владелец уже знает о переводе. Он проверит поступление и подтвердит.'};
      const what=left&&deposit?sum(left+deposit)+' ('+wordsOf(b).stay.toLowerCase()+' '+sum(left)+' и депозит '+sum(deposit)+')':left?sum(left):'депозит '+sum(deposit),t=now();
      const r=await this.db.batch([
        this.query('UPDATE booking_terms SET payment_reported_at=CASE WHEN ?>0 THEN COALESCE(payment_reported_at,?) ELSE payment_reported_at END,payment_reported_amount=CASE WHEN ?>0 AND payment_reported_at IS NULL THEN ? ELSE payment_reported_amount END,deposit_reported_at=CASE WHEN ?>0 THEN COALESCE(deposit_reported_at,?) ELSE deposit_reported_at END,deposit_reported_amount=CASE WHEN ?>0 AND deposit_reported_at IS NULL THEN ? ELSE deposit_reported_amount END,version=version+1 WHERE booking_id=? AND version=?',left,t,left,left,deposit,t,deposit,deposit,bookingId,terms?.version),
        this.notify(b.owner_id,'Гость сообщил, что перевёл вам '+what+' за «'+b.title+'»'+((await this.one('SELECT 1 x FROM payment_receipts WHERE booking_id=?',bookingId))?' и приложил чек':'')+'. Проверьте поступление в банке и подтвердите в брони.',`paid-reported:${bookingId}:${terms?.version}`,'owner'),
        this.audit(bookingId,'booking.paid_reported')]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
      return {message:'Владелец получил сообщение о переводе. Когда он увидит деньги, оплата подтвердится.'};
    }
    // «Деньги получены»: the stay and the deposit confirmed in one swipe, each as its own journal entry.
    if(body.action==='received'){
      if(!owner)throw new DomainError('Получение денег подтверждает владелец.',403);
      // A transfer the guest reported before cancelling is still checked: it is recorded, and what goes back is added.
      if(b.status==='cancelled'&&onReview(terms))return this.receivedAfterCancel(b,terms!);
      if(b.status!=='confirmed')throw new DomainError('Сначала подтвердите бронь.');
      const done:string[]=[];
      // Before the arrival only the prepayment is due (lib/prepay.ts): that much is recorded, the rest at the door.
      // A sum the guest named («Я оплатил») is recorded as named, even after the price moved (lib/prepay.ts).
      const due=dueNow({...b,terms:{...terms,deposit_received_amount:await this.depositIn(bookingId)}},now()),upTo=due.phase==='prepay'||Number(terms?.payment_reported_amount)>0?due.left:undefined;
      for(const action of ['paid','deposit_received']){
        if(action==='deposit_received'&&(!terms?.deposit||!due.deposit))continue;
        if(action==='paid'&&upTo===0)continue;
        const r=await this.bookingAction(bookingId,{action,...(upTo!==undefined&&action==='paid'?{upTo}:{}),...(action==='deposit_received'?{upTo:due.deposit}:{})}) as Row;if(r?.id)done.push(action);
      }
      return {message:done.length?'Оплата подтверждена, гость это видит.':'Оплата уже была подтверждена.'};
    }
    // The owner looked at the bank and the transfer is not there: the guest is told and can say «Я оплатил» again.
    if(body.action==='not_received'){
      if(!owner)throw new DomainError('Ответить на сообщение об оплате может владелец.',403);
      const cancelled=b.status==='cancelled'&&onReview(terms);
      if(!cancelled&&(b.status!=='confirmed'||!terms?.payment_reported_at&&!terms?.deposit_reported_at))throw new DomainError('Гость не сообщал о переводе по этой брони.',409);
      // Paying again is offered only when the money has not left the guest's bank: a late bank would take it twice.
      const r=await this.db.batch([
        this.query('UPDATE booking_terms SET payment_reported_at=NULL,deposit_reported_at=NULL,payment_reported_amount=0,deposit_reported_amount=0,refund_if_received=0,version=version+1 WHERE booking_id=? AND version=?',bookingId,terms!.version),
        this.notify(b.guest_id,cancelled?'Владелец проверил банк и не видит ваш перевод за «'+b.title+'». Бронь отменена, переводить заново не нужно. Если деньги списались, сверьте номер получателя по чеку и напишите владельцу в чат брони.':'Владелец проверил банк и не видит перевод за «'+b.title+'». Сверьте номер получателя и сумму по чеку и напишите владельцу в чат. Переводите заново, только если деньги не списались с вашего счёта.',`not-received:${bookingId}:${terms!.version}`,'guest'),
        this.audit(bookingId,'booking.payment_not_received')]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
      return {message:'Гость получил сообщение, что перевод не пришёл.'};
    }
    if(body.action==='report_checkin'){
      if(b.guest_id!==this.userId)throw new DomainError(venueOr(b,'Сообщить о заселении может гость.','Сообщить '+wordsOf(b).ofArrive+' может гость.'),403);
      if(b.status!=='confirmed'||b.end<=now()||terms?.actual_checkin)throw new DomainError(venueOr(b,'Сейчас нельзя сообщить о заселении по этой брони.','Сейчас нельзя сообщить '+wordsOf(b).ofArrive+' по этой брони.'),409);
      if(checkinOpensAt(b.start,terms?.early_checkin_at)>now())throw new DomainError(venueOr(b,'Сообщить о заселении можно за 15 минут до заезда: ','Сообщить '+wordsOf(b).ofArrive+' можно за 15 минут до '+wordsOf(b).arriveGen+': ')+checkinOpensLabel(b.start,now(),terms?.early_checkin_at)+'.',409);
      await this.db.batch([this.query('UPDATE booking_terms SET checkin_reported_at=?,version=version+1 WHERE booking_id=? AND checkin_reported_at IS NULL AND actual_checkin IS NULL',now(),bookingId),this.notify(b.owner_id,venueOr(b,'Гость сообщил, что заселился в «'+b.title+'».','Гость сообщил '+wordsOf(b).ofArrive+' в «'+b.title+'».'),'checkin-reported:'+bookingId,'owner'),this.audit(bookingId,'booking.checkin_reported')]);
      // The answer says what is really awaited: the guest's payment, or only the owner's word (the AI gives it after ten minutes).
      const unpaid=b.payment_status!=='owner_verified'?venueOr(b,'проживание','бронь'):terms?.deposit_status==='pending'?'депозит':'';
      const arrival=venueOr(b,'заселение',wordsOf(b).arriveAcc);
      // The guest already said «Я оплатил»: they are not asked to pay again (audit «Запуск», point 1).
      if(unpaid&&dueNow({...b,terms},now()).reported)return {message:'Спасибо! Ваш перевод на проверке: владелец сверяет банк. Платить заново не нужно. Доступ откроется, когда владелец подтвердит деньги. Если ответа долго нет, нажмите в брони «Не могу попасть».'};
      return {message:unpaid?'Спасибо! Осталось перевести владельцу '+(unpaid==='депозит'?'депозит':'оплату')+' по реквизитам из карточки брони и нажать «Я оплатил»: когда владелец увидит деньги, '+arrival+' подтвердится.':'Спасибо! Владелец подтвердит '+arrival+'. Если он не ответит за 10 минут, ИИ-администратор подтвердит сам.'};
    }
    if(body.action==='checkin'){
      if(!owner)throw new DomainError(venueOr(b,'Заселение подтверждает владелец.',wordsOf(b).arrive+' подтверждает владелец.'),403);
      if(terms?.actual_checkin&&!terms.actual_checkout&&op?.active_booking_id===bookingId)return {message:'Заселение уже подтверждено.'};
      if(b.status!=='confirmed'||b.end<=now()||terms?.actual_checkout)throw new DomainError(venueOr(b,'Сейчас нельзя подтвердить заселение по этой брони.','Сейчас нельзя подтвердить '+wordsOf(b).arriveAcc+' по этой брони.'),409);
      if(checkinOpensAt(b.start,terms?.early_checkin_at)>now())throw new DomainError(venueOr(b,'Подтвердить заселение можно за 15 минут до заезда: ','Подтвердить '+wordsOf(b).arriveAcc+' можно за 15 минут до '+wordsOf(b).arriveGen+': ')+checkinOpensLabel(b.start,now(),terms?.early_checkin_at)+'.',409);
      if(b.payment_status!=='owner_verified'||terms?.deposit_status==='pending')throw new DomainError(venueOr(b,'Сначала проверьте оплату проживания и предусмотренный депозит.','Сначала проверьте оплату брони и предусмотренный депозит.'),409);
      // Under execution the mandate and the guest's report are checked again inside the write.
      const checkinGate=this.execution?" AND t.checkin_reported_at IS NOT NULL AND EXISTS(SELECT 1 FROM property_policies pp WHERE pp.property_id=b.property_id AND pp.version=? AND pp.auto_confirm=1 AND pp.auto_assign=1 AND (pp.mandate_until=0 OR pp.mandate_until>?))":'';
      const result=await this.db.batch([this.query("UPDATE property_operations SET readiness='occupied',active_booking_id=?,version=version+1,updated_at=? WHERE property_id=? AND readiness='ready' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND b.status='confirmed' AND MIN(b.start-"+CHECKIN_LEAD_SECONDS+",COALESCE(t.early_checkin_at,b.start))<=? AND b.end>? AND b.payment_status='owner_verified' AND t.deposit_status<>'pending' AND t.actual_checkout IS NULL"+checkinGate+")",bookingId,now(),b.property_id,bookingId,now(),now(),...(this.execution?[this.execution.policyVersion,now()]:[])),this.query('UPDATE booking_terms SET actual_checkin=?,version=version+1 WHERE booking_id=? AND actual_checkin IS NULL AND EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)',now(),bookingId,b.property_id,bookingId),this.audit(bookingId,'booking.checkin_requested')]);
      if(!result[0].meta.changes)throw new DomainError(venueOr(b,'Жильё не готово или в нём ещё проживает другой гость.','Объект не готов или в нём ещё другие гости.'),409);return {message:venueOr(b,'Фактическое заселение подтверждено.',wordsOf(b).arriveOk+'.')};
    }
    if(body.action==='dispute_checkout'){
      if(!owner)throw new DomainError('Освобождение жилья проверяет владелец.',403);
      const reason=required(body.reason,'Причина',1000);
      const r=await this.query("UPDATE booking_terms SET checkout_reported_at=NULL,version=version+1 WHERE booking_id=? AND checkout_reported_at IS NOT NULL AND actual_checkout IS NULL AND version=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed')",bookingId,body.expectedVersion??terms?.version,bookingId).run();
      if(!r.meta.changes)throw new DomainError('Сообщение уже рассмотрено. Обновите данные.',409);
      await this.db.batch([this.notify(b.guest_id,venueOr(b,'Выезд пока не подтверждён: ',wordsOf(b).leaveNotOk+': ')+reason,'checkout-disputed:'+bookingId+':'+(terms?.version||0),'guest'),this.audit(bookingId,'booking.checkout_disputed:'+reason)]);
      return {message:'Гостю передана причина. Жильё остаётся занятым до подтверждения выезда.'};
    }
    if(body.action==='checkout'){
      if(!owner)throw new DomainError('Освобождение жилья подтверждает владелец.',403);
      if(terms?.actual_checkout)return {message:'Выезд уже подтверждён.'};
      if(b.status!=='confirmed'||b.start>now()||(op?.active_booking_id&&op.active_booking_id!==bookingId))throw new DomainError(venueOr(b,'Сейчас нельзя подтвердить выезд по этой брони.','Сейчас нельзя подтвердить '+wordsOf(b).leaveLow+' по этой брони.'),409);
      const t=now(),checkedOut="EXISTS(SELECT 1 FROM booking_terms bt JOIN bookings b ON b.id=bt.booking_id WHERE b.id=? AND b.status='completed' AND bt.actual_checkout IS NULL)";
      const keepCleaner=`booking_id=? AND status='assigned' AND assigned_to IS NOT NULL AND start<? AND start>=? AND NOT EXISTS(SELECT 1 FROM cleaning_jobs o WHERE o.id<>cleaning_jobs.id AND o.assigned_to=cleaning_jobs.assigned_to AND o.status IN ('assigned','in_progress','submitted') AND o.start<?+(cleaning_jobs.end-cleaning_jobs.start) AND o.end>?) AND NOT EXISTS(SELECT 1 FROM bookings nb WHERE nb.property_id=cleaning_jobs.property_id AND nb.id<>? AND (nb.status='confirmed' OR (nb.status='requested' AND nb.expires_at>?)) AND nb.start<?+(cleaning_jobs.end-cleaning_jobs.start) AND nb.occupied_until>?) AND ${checkedOut}`;
      const keepArgs=[bookingId,t-60,t-KEEP_SHIFT,t,t,bookingId,t,t,t,bookingId];
      const result=await this.db.batch([
        // Under execution the mandate and the guest's report are checked again inside the batch,
        // so a revoked autopilot or a disputed report stops the automatic checkout.
        this.query("UPDATE bookings SET status='completed' WHERE id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND actual_checkout IS NULL AND version=? AND (?=0 OR checkout_reported_at IS NOT NULL)) AND (?=0 OR EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND version=? AND auto_confirm=1 AND auto_assign=1 AND (mandate_until=0 OR mandate_until>?)))",bookingId,bookingId,body.expectedVersion??terms?.version,this.execution?1:0,this.execution?1:0,b.property_id,this.execution?.policyVersion??0,t),
        this.query("UPDATE property_operations SET readiness=CASE WHEN readiness IN ('maintenance','blocked') THEN readiness ELSE 'awaiting_cleaning' END,active_booking_id=NULL,version=version+1,updated_at=? WHERE property_id=? AND (active_booking_id IS NULL OR active_booking_id=?) AND EXISTS(SELECT 1 FROM booking_terms t JOIN bookings b ON b.id=t.booking_id WHERE b.id=? AND b.status='completed' AND t.actual_checkout IS NULL)",t,b.property_id,bookingId,bookingId),
        // Own staff cleans here: nobody reports the cleaning in the service, so the flat is ready only when the owner says so
        // (one tap, «Жильё готово»), never by itself right after the guest leaves.
        this.query(`INSERT OR IGNORE INTO notifications SELECT ?,owner_id,?,'owner:own-staff-clean:'||?,0,? FROM properties WHERE id=? AND own_staff=1 AND ${checkedOut}`,id(),venueOr(b,'Гость выехал из «'+b.title+'». Когда ваш персонал уберёт, нажмите «Жильё готово», и следующего гостя можно будет заселить.',wordsOf(b).guestOut+' из «'+b.title+'». Когда ваш персонал уберёт, нажмите «'+wordsOf(b).ready+'», и можно будет принимать следующих гостей.'),bookingId,t,b.property_id,bookingId),
        // The guest left after the cleaning's planned start: the assigned cleaner keeps the job and it simply moves to now,
        // with the same length. Only when the new time clashes with the cleaner's other work or the next stay is the
        // assignment released below, as before.
        this.query(`INSERT OR IGNORE INTO notifications SELECT ?||id,assigned_to,?,'cleaner:checkout-shift:'||id||':'||version,0,? FROM cleaning_jobs WHERE ${keepCleaner}`,id()+':','Гость освободил «'+b.title+'» позже плана. Уборка остаётся за вами и начинается сейчас. Если не успеваете, откажитесь в карточке задания.',t,...keepArgs),
        this.query(`UPDATE cleaning_jobs SET end=?+(end-start),start=? WHERE ${keepCleaner}`,t,t,...keepArgs),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,?,'cleaner:checkout-reschedule:'||id||':'||version,0,? FROM cleaning_jobs WHERE booking_id=? AND status='assigned' AND start<? AND EXISTS(SELECT 1 FROM booking_terms bt JOIN bookings b ON b.id=bt.booking_id WHERE b.id=? AND b.status='completed' AND bt.actual_checkout IS NULL)",id(),'ИИ-администратор: гость освободил жильё позже начала уборки. Прежнее назначение снято; проверьте новое время и откликнитесь заново.',t,bookingId,t-60,bookingId),
        this.query("UPDATE applications SET status='rejected' WHERE job_id IN(SELECT id FROM cleaning_jobs WHERE booking_id=? AND status IN ('open','assigned') AND start<?) AND EXISTS(SELECT 1 FROM booking_terms bt JOIN bookings b ON b.id=bt.booking_id WHERE b.id=? AND b.status='completed' AND bt.actual_checkout IS NULL)",bookingId,t-60,bookingId),
        this.query("UPDATE cleaning_jobs SET start=?,end=?,assigned_to=NULL,status='open' WHERE booking_id=? AND status IN ('open','assigned') AND start<? AND EXISTS(SELECT 1 FROM booking_terms bt JOIN bookings b ON b.id=bt.booking_id WHERE b.id=? AND b.status='completed' AND bt.actual_checkout IS NULL)",t,t+b.cleaning_minutes*60,bookingId,t-60,bookingId),
        this.query('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=? AND actual_checkout IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status=\'completed\')',t,bookingId,bookingId),this.audit(bookingId,'booking.checkout_confirmed')]);
      if(!result[0].meta.changes)throw new DomainError('Выезд уже обрабатывается. Обновите данные.',409);await this.notify(b.guest_id,this.execution?venueOr(b,'Выезд подтверждён. Спасибо, что выбрали нас.',wordsOf(b).leaveOk+'. Спасибо, что выбрали нас.'):venueOr(b,'Владелец подтвердил освобождение жилья. Проживание завершено.','Владелец подтвердил '+wordsOf(b).leaveLow+'. '+wordsOf(b).done+'.'),'checkout-confirmed:'+bookingId,'guest').run();
      // «Как гость оставил жильё?»: one tap for the owner, the executor's photos come in by themselves (lib/stay-handover.ts).
      await this.notify(b.owner_id,venueOr(b,'Гость выехал из «'+b.title+'». Как он оставил жильё? Отметьте приёмку в карточке брони: «Всё хорошо» или замечания с фото.',wordsOf(b).guestOut+' из «'+b.title+'». Отметьте приёмку в карточке брони: «Всё хорошо» или замечания с фото.'),'handover-ask:'+bookingId,'owner').run();return {message:venueOr(b,'Выезд подтверждён. Жильё ожидает уборки и проверки.',wordsOf(b).leaveOk+'. Объект ожидает уборки и проверки.')};
    }
    if(body.action==='confirm') {
      await assertPilotAllowed(this,'booking',b.property_id,undefined,true);
      if(!owner) throw new DomainError('Подтвердить может только владелец.',403);
      await assertCalendarAvailable(this.db,b.property_id,b.start,b.occupied_until);
      // Own staff cleans this property: no cleaning job for executors after the stay.
      const ownStaff=!!Number((await this.one('SELECT own_staff FROM properties WHERE id=?',b.property_id))?.own_staff);
      const fee=ownStaff?0:number(body.cleaningFee||0,'Стоимость уборки',0,1000000);
      if(b.status!=='requested'||b.expires_at<=now()) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      // A high booking risk is never confirmed on the owner's behalf: the owner decides.
      const policyGate=this.execution?" AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=bookings.property_id AND version=? AND auto_confirm=1 AND cleaning_fee=? AND cleaning_fee<=cleaning_budget AND (mandate_until=0 OR mandate_until>?)) AND NOT EXISTS(SELECT 1 FROM booking_risks WHERE booking_id=bookings.id AND level='high')":'';
      const auditId=id(),auditAction=this.execution?JSON.stringify({action:'booking.confirmed',onBehalfOf:this.userId,...this.execution}):'booking.confirmed';
      const statements=[this.query("UPDATE bookings SET status='confirmed' WHERE id=? AND status='requested' AND expires_at>? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=?)"+policyGate,bookingId,now(),bookingId,terms?.version,...(this.execution?[this.execution.policyVersion,fee,now()]:[])),this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',auditId,this.execution?'system:rental-policy':this.userId,bookingId,auditAction,now()),this.query("INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)",id(),b.guest_id,`Бронь «${b.title}» подтверждена. Адрес доступен в карточке.`+(b.payment_status!=='owner_verified'?(prepayOf(terms)>=100?' Переведите владельцу '+venueOr(b,'оплату проживания','оплату брони')+(terms?.deposit?' и депозит':'')+' по реквизитам из карточки брони до '+wordsOf(b).arriveGen+' и нажмите «Я оплатил».':prepayOf(terms)?' Переведите владельцу предоплату '+prepayOf(terms)+'% по реквизитам из карточки брони и нажмите «Я оплатил». Остальное'+(terms?.deposit?' и депозит':'')+' — при заселении.':' Оплата при заселении: реквизиты владельца откроются в карточке брони за 15 минут до '+wordsOf(b).arriveGen+'. Не переводите деньги заранее и по другим реквизитам.'):''),'guest:confirmed:'+bookingId,0,now(),auditId)];
      statements.push(accrueCommission(this.db,bookingId,auditId,now()));
      // «Автопилот» is paid per booking the AI confirmed itself (hybrid tariff, lib/platform-billing.ts).
      if(this.execution)statements.push(accrueAiBookingFee(this.db,bookingId,auditId,now()));
      // «С депозитом»: the owner follows the AI's risk advice and asks for a refundable deposit.
      const depositAsked=body.withDeposit===true&&!this.execution?Number((await this.one('SELECT deposit_advice FROM booking_risks WHERE booking_id=?',bookingId))?.deposit_advice||0):0;
      if(body.withDeposit===true&&(!depositAsked||terms?.deposit))throw new DomainError('Для этой заявки депозит уже предусмотрен или не нужен.',409);
      if(depositAsked)statements.push(
        this.query("UPDATE booking_terms SET deposit=?,deposit_status='pending',version=version+1 WHERE booking_id=? AND deposit=0 AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",depositAsked,bookingId,auditId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)",id(),b.guest_id,`Владелец «${b.title}» просит возвратный депозит ${new Intl.NumberFormat('ru-RU').format(depositAsked)} ₸. Он вернётся после выезда, если всё в порядке. Не согласны — отмените бронь до оплаты.`,'guest:deposit-asked:'+bookingId,0,now(),auditId));
      if(fee>0) statements.push(this.query("INSERT OR IGNORE INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) SELECT ?,property_id,?,?,end,occupied_until,?,?,'open',NULL,'[]','',? FROM bookings WHERE id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",id(),this.userId,bookingId,fee,'Уборка после выезда: сменить бельё, проверить санузел и кухню, вынести мусор.',now(),bookingId,auditId));
      const results=await this.db.batch(statements);
      if(!results[0].meta.changes) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      if(depositAsked)return {message:'Бронь подтверждена с депозитом '+new Intl.NumberFormat('ru-RU').format(depositAsked)+' ₸. Гость получил уведомление.'+(fee>0?' Задание на уборку опубликовано.':'')};
      return {message:fee>0?'Бронь подтверждена, задание на уборку опубликовано.':'Бронь подтверждена.'};
    }
    if(body.action==='reject'){
      if(!owner)throw new DomainError('Заявку рассматривает владелец.',403);
      const r=await this.query("UPDATE bookings SET status='cancelled' WHERE id=? AND status='requested' AND expires_at>? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=?)",bookingId,now(),bookingId,terms?.version).run();
      if(!r.meta.changes)throw new DomainError('Заявка уже рассмотрена или срок истёк.',409);
      await this.db.batch([this.notify(b.guest_id,'Владелец отклонил заявку на «'+b.title+'». Выберите другой вариант.','booking-rejected:'+bookingId,'guest'),this.audit(bookingId,'booking.rejected')]);
      return {message:'Заявка отклонена. Гость уведомлён в приложении.'};
    }
    if(body.action==='cancel') {
      if(op?.active_booking_id===bookingId)throw new DomainError('Сначала подтвердите фактический выезд гостя.',409);
      if(!['requested','confirmed'].includes(b.status))throw new DomainError('Эта бронь уже закрыта.',409);
      // The money side is fixed by the guest offer at the moment of cancelling and told to both sides in tenge.
      const policy=terms?.min_hours?null:await this.one('SELECT min_hours FROM property_policies WHERE property_id=?',b.property_id),t=now();
      if(terms?.paid_amount||terms?.deposit)await migrateFinanceEntity(this,'booking',bookingId);
      // The deposit goes back as far as it really came in, a part of it too, less what was already returned or kept.
      const depositHeld=terms?.deposit?Math.max(0,(await this.one("SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='deposit_return' THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",bookingId))?.n-(Number(terms.deposit_kept)||0)):0;
      const rules={by:(owner?'owner':'guest') as 'owner'|'guest',status:b.status,mode:terms?.billing_mode||'daily',rate:terms?.rate||0,units:terms?.units||1,amount:b.amount,paid:terms?.paid_amount||0,deposit:depositHeld,start:b.start,minHours:terms?.min_hours||policy?.min_hours||1,at:t,banquet:!!terms?.occasion};
      const c=cancellationTerms(rules);
      // «Я оплатил» not yet checked: the transfer stays «на проверке». If the owner finds it, it goes back by the same rules.
      const toldPay=terms?.payment_reported_at?Number(terms.payment_reported_amount)||0:0,toldDeposit=terms?.deposit_reported_at?Number(terms.deposit_reported_amount)||0:0;
      const ifReceived=toldPay?cancellationTerms({...rules,paid:rules.paid+toldPay}).refund-c.refund:0;
      const money=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸',deposit=c.deposit?' Депозит '+money(c.deposit)+' возвращается полностью.':'';
      const told=toldPay+toldDeposit,backIfIn=ifReceived+toldDeposit;
      const reviewGuest=told?' Вы сообщили о переводе '+money(told)+': владелец проверит поступление. Если деньги пришли, он вернёт '+money(backIfIn)+'. Переводить заново не нужно.':'';
      const reviewOwner=told?' Гость сообщил о переводе '+money(told)+' до отмены. Проверьте банк: если деньги пришли, нажмите в брони «Деньги получены» и верните гостю '+money(backIfIn)+'; если нет, нажмите «Перевод не пришёл».':'';
      const who=owner?'Владелец отменил бронь':'Гость отменил бронь',title='«'+b.title+'»';
      // The guest said they came in, the owner did not confirm it and cancels: the settling-in stays owed
      // (lib/stay-result.ts); if the guest was not there, the owner disputes the charge and a person decides.
      const afterArrival=owner&&b.status==='confirmed'&&!!terms?.checkin_reported_at&&!terms?.actual_checkin;
      const tariffNote=afterArrival?' Гость сообщил, что заселился, поэтому заселение учитывается в тарифе. Если гостя не было, оспорьте начисление в «Мои данные и обращения»: решение примет сотрудник сервиса.':'';
      const forGuest0=!terms?.paid_amount&&!c.deposit?(told?reviewGuest.trim():'Оплаты не было, возвращать нечего.'):c.withheld?'Отмена позже бесплатного срока: по правилам сервиса владельцу остаётся '+money(c.withheld)+', вам вернут '+money(c.refund)+'.'+deposit:'Вам вернут всю оплату: '+money(c.refund)+'.'+deposit;
      const forOwner0=!terms?.paid_amount&&!c.deposit?(told?reviewOwner.trim():'Оплаты не было, возвращать нечего.'):c.withheld?'По правилам отмены у вас остаётся '+money(c.withheld)+(c.refund?', гостю нужно вернуть '+money(c.refund):'')+'.'+deposit:'Верните гостю всю оплату: '+money(c.refund)+'.'+deposit;
      const forGuest=forGuest0+(terms?.paid_amount||c.deposit?reviewGuest:''),forOwner=forOwner0+(terms?.paid_amount||c.deposit?reviewOwner:'');
      const jobText='Бронь '+title+' отменена, уборка после неё не нужна. Задание снято.';
      const r=await this.db.batch([
        this.query("UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('requested','confirmed')",bookingId),
        // Only when this request did the cancelling (a guest who cancelled a moment earlier keeps it free); written
        // right after the update, so changes() is still its count and the next statement sees the same answer.
        ...(afterArrival?[this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',id(),this.userId,bookingId,CANCELLED_AFTER_ARRIVAL,t)]:[]),
        // Written once, by the request that cancelled (a concurrent second cancel finds it set). The target is cumulative:
        // refunds recorded before the cancellation count towards it, because paid_amount is already net of them.
        this.query("UPDATE booking_terms SET refund_due=?+COALESCE((SELECT SUM(amount) FROM finance_entries WHERE booking_id=booking_terms.booking_id AND kind='refund'),0),refund_recorded_at=CASE WHEN ?=0 THEN ? ELSE NULL END,refund_if_received=? WHERE booking_id=? AND refund_due IS NULL AND changes()>0",c.refund,c.refund,t,ifReceived,bookingId),
        // Whoever was going to clean after this stay hears about it: the assigned cleaner and everyone still waiting for an answer.
        this.query("INSERT OR IGNORE INTO notifications SELECT ?||j.id,j.assigned_to,?,'cleaner:booking-cancelled:'||j.id,0,? FROM cleaning_jobs j WHERE j.booking_id=? AND j.status='assigned' AND j.assigned_to IS NOT NULL",id()+':',jobText,t,bookingId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?||a.id,a.user_id,?,'cleaner:booking-cancelled:'||j.id||':'||a.user_id,0,? FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE j.booking_id=? AND j.status='open' AND a.status='pending'",id()+':',jobText,t,bookingId),
        this.query("UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned')",bookingId),
        this.notify(b.guest_id,(owner?who+' '+title+'. ':'Бронь '+title+' отменена. ')+forGuest,`cancelled:${bookingId}`,'guest'),
        this.notify(b.owner_id,(owner?'Бронь '+title+' отменена. ':who+' '+title+'. ')+forOwner+tariffNote,`cancelled:${bookingId}`,'owner'),
        this.audit(bookingId,'booking.cancelled')]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
      return {message:'Бронь отменена. '+(owner?forOwner+tariffNote:forGuest),cancel:c};
    }
    if(body.action==='paid'&&owner) {
      if(b.status!=='confirmed') throw new DomainError('Сначала подтвердите бронь.');
      if(body.expectedAmount!==undefined&&body.expectedAmount!==b.amount)throw new DomainError('Стоимость брони изменилась. Проверьте сумму заново.',409);
      await migrateFinanceEntity(this,'booking',bookingId);const balance=await this.one("SELECT COALESCE(SUM(CASE WHEN kind='payment' THEN amount WHEN kind='refund' THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",bookingId),remaining=Math.max(0,b.amount-(balance?.n||0));if(!remaining)return {message:'Полная оплата уже учтена.'};
      // «Деньги получены» before the arrival records only the prepayment (lib/prepay.ts).
      const amount=body.upTo!==undefined?Math.min(remaining,number(body.upTo,'Сумма',1,remaining)):remaining;
      return recordFinance(this,{kind:'payment',bookingId,amount,confirmed:true,note:'Поступление проживания проверено владельцем',requestKey:'paid:'+bookingId+':'+terms?.version});
    }
    // After a refund or a returned deposit the guest closes the money in one tap, or says it did not arrive: the second
    // opens an appeal on this transfer that the service administrator sees (audit 2026-11-22, «Возвраты и споры»).
    if(body.action==='refund_received'||body.action==='refund_missing'){
      if(b.guest_id!==this.userId)throw new DomainError('Ответить о возврате может гость.',403);
      const back=await this.one("SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN amount ELSE 0 END),0) refund,COALESCE(SUM(CASE WHEN kind='deposit_return' THEN amount ELSE 0 END),0) deposit,MAX(CASE WHEN kind IN ('refund','deposit_return') THEN created_at END) at FROM finance_entries WHERE booking_id=?",bookingId);
      const total=(Number(back?.refund)||0)+(Number(back?.deposit)||0),sum=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸';
      if(!total)throw new DomainError('Владелец ещё не отмечал возврат по этой брони.',409);
      if(body.action==='refund_received'){
        await this.db.batch([this.query('UPDATE booking_terms SET refund_confirmed_at=?,version=version+1 WHERE booking_id=?',now(),bookingId),
          this.notify(b.owner_id,'Гость подтвердил, что получил возврат '+sum(total)+' за «'+b.title+'».','refund-confirmed:'+bookingId+':'+back?.at,'owner'),this.audit(bookingId,'booking.refund_confirmed')]);
        return {message:'Спасибо! Расчёт по брони закрыт.'};
      }
      const issue='Гость не получил возврат '+sum(total)+': владелец отметил его в сервисе, но денег нет.'+(body.issue?' '+required(body.issue,'Пояснение',1000):'');
      const write=await this.issueWrite(b,'booking',issue);
      await this.db.batch([write.statement,this.query('UPDATE booking_terms SET refund_confirmed_at=NULL,version=version+1 WHERE booking_id=?',bookingId),
        this.notify(b.owner_id,'Гость пишет, что не получил возврат '+sum(total)+' за «'+b.title+'». Проверьте перевод и приложите чек возврата в брони.','refund-missing:'+bookingId+':'+now(),'owner'),this.audit(bookingId,'booking.refund_missing')]);
      return {message:'Обращение по возврату открыто. Владелец получил сообщение, администратор сервиса видит его.'};
    }
    if(body.action==='issue') {
      const issue=required(body.issue,'Описание проблемы',1500);
      const receipt=await this.operationReceipt('booking_issue',body,[bookingId,issue]);if(receipt.previous)return receipt.previous;
      const issueWrite=await this.issueWrite(b,'booking',issue),result={message:issueWrite.added?'Дополнение записано в открытое обращение.':'Обращение сохранено в уведомлениях получателя. Для срочной связи используйте контакт в брони.'};
      await this.db.batch([issueWrite.statement,this.notify(owner?b.guest_id:b.owner_id,`Обращение по «${b.title}»: ${issue}`,id(),owner?'guest':'owner'),this.audit(bookingId,'booking.issue'),this.query('INSERT INTO operation_receipts VALUES (?,?,?,?,?,?)',this.userId,'booking_issue',receipt.key,receipt.digest,JSON.stringify(result),now())]);
      return result;
    }
    throw new DomainError('Действие недоступно.',403);
  }
  async changeContext(bookingId:string,roleValue:unknown){
    const role=parseRole(roleValue);if(role==='cleaner')throw new DomainError('Изменения проживания доступны гостю и владельцу.',403);await this.requireRole(role);
    const b=await this.one(`SELECT b.*,p.owner_id,p.price,p.cleaning_minutes,p.title,p.capacity FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND ${role==='owner'?'p.owner_id':'b.guest_id'}=?`,bookingId,this.userId);
    if(!b)throw new DomainError('Бронь не найдена.',404);
    const terms=await this.one('SELECT * FROM booking_terms WHERE booking_id=?',bookingId),policy=await this.one('SELECT * FROM property_policies WHERE property_id=?',b.property_id);
    if(b.status!=='confirmed'||!terms||terms.actual_checkout||terms.checkout_reported_at)throw new DomainError('Изменение доступно только для действующего проживания до сообщения о выезде.',409);
    if(!policy)throw new DomainError('Сначала владелец должен настроить тарифы.',409);
    return {role,b,terms,policy};
  }
  async bookingChangeQuote(bookingId:string,roleValue:unknown,body:Row){
    const {role,b,terms,policy}=await this.changeContext(bookingId,roleValue);
    const start=Math.floor(Date.parse(String(body.start))/1000),end=Math.floor(Date.parse(String(body.end))/1000),t=now();
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<=t||end-start>90*86400)throw new DomainError('Проверьте даты проживания: выезд должен быть в будущем, срок — до 90 дней.');
    if(terms.actual_checkin&&start!==b.start)throw new DomainError('После заселения время заезда изменить нельзя.');
    if(!terms.actual_checkin&&start<t-60&&start!==b.start)throw new DomainError('Новый заезд должен быть в будущем.');
    // The same rule as at the booking: a bath stays by the hour, a hall moves only to another lunch or evening (kindMode).
    const kind=(await this.one("SELECT json_extract(details,'$.type') type FROM property_details WHERE property_id=?",b.property_id))?.type||'apartment';
    // A new number of guests is agreed in the same change: checked against the capacity and priced like at the booking.
    const guests=body.guests===undefined||body.guests===null||body.guests===''?Number(b.guests):number(body.guests,'Гости',1,Math.max(1,Number(b.capacity)||1));
    const mode=kindMode(kind,body.billingMode||terms.billing_mode,start,end),pricing=withGuests(changeRentalPrice(b.price,policy,start,end,mode),policy,guests);
    const discount=number(body.discountPercent??terms.discount_percent??0,'Скидка, %',0,50);
    if(role==='guest'&&discount!==(terms.discount_percent||0))throw new DomainError('Скидку предлагает владелец.',403);
    // The discount already in the terms (a regular guest's, lib/rental-policy.ts) stays with the booking whatever the owner's limit.
    if(discount>policy.max_discount_percent&&discount!==(terms.discount_percent||0))throw new DomainError('Скидка превышает установленный владельцем предел.');
    // An owner asking the guest to come a little later (a late cleaning, «Сдвинуть заезд») keeps the agreed price: the
    // guest pays nothing more and gets nothing less for the owner's delay. The rule depends only on the terms, so the
    // proposal and the guest's acceptance compute the same amount.
    const ownerDelay=role==='owner'&&guests===Number(b.guests)&&start>b.start&&start-b.start<=SHIFT_LIMIT&&mode===terms.billing_mode&&discount===(terms.discount_percent||0)&&(end===b.end||end-start===b.end-b.start);
    const amount=ownerDelay?Number(b.amount):Math.ceil(pricing.amount*(100-discount)/100);
    if(!ownerDelay&&policy.minimum_rate&&amount<policy.minimum_rate*pricing.periods)throw new DomainError('Стоимость ниже минимальной разрешённой ставки.');
    if(amount<terms.paid_amount)throw new DomainError('Новая сумма меньше подтверждённой оплаты. Сначала согласуйте возврат с владельцем; автоматический возврат не подключён.',409);
    // A transfer the guest reported and the owner has not checked yet counts too: a lower price would make the owner
    // confirm less than the guest sent (audit «Запуск», point 8). The owner checks the bank first.
    const told=terms.payment_reported_at?Number(terms.paid_amount||0)+Number(terms.payment_reported_amount||0):0;
    if(amount<told)throw new DomainError('Гость сообщил о переводе '+Number(terms.payment_reported_amount).toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸, а новая сумма меньше уже отправленных денег. Сначала владелец проверяет перевод, затем согласуйте изменение.',409);
    if(start===b.start&&end===b.end&&amount===b.amount&&mode===terms.billing_mode&&guests===Number(b.guests))throw new DomainError('Условия не изменились.');
    const occupiedUntil=end+b.cleaning_minutes*60;
    await assertCalendarAvailable(this.db,b.property_id,start,occupiedUntil);
    const occupied=await this.one("SELECT id FROM bookings WHERE property_id=? AND id<>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?",b.property_id,bookingId,t,occupiedUntil,start);
    const cleaning=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND (booking_id IS NULL OR booking_id<>?) AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",b.property_id,bookingId,occupiedUntil,start);
    const started=await this.one("SELECT id FROM cleaning_jobs WHERE booking_id=? AND status IN ('in_progress','submitted','completed')",bookingId);
    if(occupied||cleaning||started)throw new DomainError('Изменение пересекает другую бронь или уборку.',409);
    const op=await this.one('SELECT * FROM property_operations WHERE property_id=?',b.property_id);
    if(op&&['maintenance','blocked'].includes(op.readiness))throw new DomainError('Заезды в это жильё закрыты.',409);
    const automatic=role==='guest'&&guests===Number(b.guests)&&!!policy.auto_extension&&mandateActive(policy)&&terms.policy_version===policy.version&&start===b.start&&end>b.end&&end-(terms.original_end||b.end)<=policy.max_extension_hours*3600&&mode===terms.billing_mode&&discount===(terms.discount_percent||0);
    return {bookingId,guests,start,end,occupiedUntil,billingMode:pricing.billingMode,rate:pricing.price,units:pricing.periods,extraHours:pricing.extraHours,extraRate:pricing.extraRate,discountPercent:discount,amount,previousAmount:b.amount,paidAmount:terms.paid_amount,amountDue:Math.max(0,amount-terms.paid_amount),baseVersion:terms.version,policyVersion:policy.version,automatic,cleanerReconfirmation:end!==b.end&&!!await this.one("SELECT id FROM cleaning_jobs WHERE booking_id=? AND assigned_to IS NOT NULL AND status='assigned' AND abs(start-?)>?",bookingId,end,KEEP_SHIFT),currency:'KZT'};
  }
  async proposeBookingChange(bookingId:string,roleValue:unknown,body:Row){
    const role=parseRole(roleValue);await this.changeContext(bookingId,role);
    const key=required(body.requestKey,'Ключ запроса',100),existing=await this.one('SELECT id,booking_id FROM booking_changes WHERE proposed_by=? AND request_key=?',this.userId,key);
    if(existing){if(existing.booking_id!==bookingId)throw new DomainError('Ключ уже использован.',409);return {id:existing.id,message:'Это предложение уже сохранено.'};}
    const q=await this.bookingChangeQuote(bookingId,role,body);
    if(body.expectedAmount!==q.amount||body.baseVersion!==q.baseVersion||body.policyVersion!==q.policyVersion)throw new DomainError('Условия изменились. Повторите расчёт.',409);
    if(body.acceptTerms!==true)throw new DomainError('Подтвердите согласие с рассчитанными условиями.');
    const reason=required(body.reason,'Причина изменения',1000),changeId=id(),{b}=await this.changeContext(bookingId,role);
    // The other side gets the same time to answer as the owner has for a booking request (15 minutes unless the owner chose another).
    const wait=(await ruleFor(this.db,b.owner_id,'request')).minutes;
    await this.db.batch([
      this.query('INSERT INTO booking_changes(id,booking_id,proposed_by,proposer_role,request_key,base_version,policy_version,start,end,occupied_until,billing_mode,rate,units,discount_percent,amount,reason,expires_at,created_at,guests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',changeId,bookingId,this.userId,role,key,q.baseVersion,q.policyVersion,q.start,q.end,q.occupiedUntil,q.billingMode,q.rate,q.units,q.discountPercent,q.amount,reason,now()+wait*60,now(),q.guests===Number(b.guests)?null:q.guests),
      this.notify(role==='owner'?b.guest_id:b.owner_id,'Предложено изменение проживания. Проверьте даты и стоимость в брони.','change:'+changeId,role==='owner'?'guest':'owner'),this.audit(bookingId,'booking.change_proposed:'+changeId)
    ]);
    if(q.automatic){try{const result=await new RentalService(this.db,b.owner_id).decideBookingChange(bookingId,changeId,'owner',{action:'accept'},true);return {id:changeId,...result};}catch(error){if(!(error instanceof DomainError))throw error;}}
    return {id:changeId,message:'Предложение отправлено, ответ ждём '+minutesLabel(wait)+'. Пока вторая сторона не согласилась, действуют прежние даты.'};
  }
  async decideBookingChange(bookingId:string,changeId:string,roleValue:unknown,body:Row,automatic=false){
    const {role,b,terms,policy}=await this.changeContext(bookingId,roleValue),c=await this.one('SELECT * FROM booking_changes WHERE id=? AND booking_id=?',changeId,bookingId);
    if(!c)throw new DomainError('Предложение не найдено.',404);
    if(c.proposer_role===role)throw new DomainError('Предложение должна подтвердить другая сторона.',403);
    if(c.status==='accepted'&&body.action==='accept')return {id:changeId,message:'Изменение уже применено.'};
    if(c.status!=='pending'||c.expires_at<=now())throw new DomainError('Предложение уже закрыто или срок истёк.',409);
    if(body.action==='reject'){const r=await this.query("UPDATE booking_changes SET status='rejected',decided_at=? WHERE id=? AND status='pending' AND expires_at>?",now(),changeId,now()).run();if(!r.meta.changes)throw new DomainError('Предложение уже рассмотрено или срок истёк.',409);await this.db.batch([this.audit(bookingId,'booking.change_rejected:'+changeId),this.notify(c.proposed_by,'Предложение изменить проживание отклонено. Действуют прежние условия.','change-rejected:'+changeId,c.proposer_role)]);return {message:'Предложение отклонено. Прежние условия сохранены.'};}
    if(body.action!=='accept')throw new DomainError('Выберите принятие или отклонение.');
    if(c.base_version!==terms.version||c.policy_version!==policy.version)throw new DomainError('Условия брони или правила владельца изменились. Нужен новый расчёт.',409);
    // Validate as the proposer, so only an owner can originate a discount.
    const q=await new RentalService(this.db,c.proposed_by).bookingChangeQuote(bookingId,c.proposer_role,{start:new Date(c.start*1000).toISOString(),end:new Date(c.end*1000).toISOString(),billingMode:c.billing_mode,discountPercent:c.discount_percent,...(c.guests?{guests:c.guests}:{})});
    if(q.amount!==c.amount||q.baseVersion!==c.base_version||q.policyVersion!==c.policy_version)throw new DomainError('Стоимость изменилась. Нужен новый расчёт.',409);
    if(automatic&&(!q.automatic||role!=='owner'))throw new DomainError('Автоматическое изменение выходит за полномочия владельца.',403);
    const job=await this.one("SELECT * FROM cleaning_jobs WHERE booking_id=? AND status IN ('open','assigned')",bookingId),movesCleaning=b.end!==c.end;
    const gate="EXISTS(SELECT 1 FROM booking_changes c JOIN booking_terms t ON t.booking_id=c.booking_id WHERE c.id=? AND c.status='accepted' AND t.version=c.base_version)";
    const statements=[
      this.query("UPDATE booking_changes SET status='accepted',decided_at=? WHERE id=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=? AND actual_checkout IS NULL AND checkout_reported_at IS NULL AND paid_amount<=?) AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND version=? AND (?=0 OR mandate_until=0 OR mandate_until>?)) AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed')",now(),changeId,now(),bookingId,c.base_version,c.amount,b.property_id,c.policy_version,automatic?1:0,now(),bookingId),
      this.query(`UPDATE bookings SET guests=COALESCE((SELECT guests FROM booking_changes WHERE id=?),guests),start=?,end=?,occupied_until=?,amount=?,payment_status=CASE WHEN ?>=(SELECT paid_amount FROM booking_terms WHERE booking_id=?) AND ?>(SELECT paid_amount FROM booking_terms WHERE booking_id=?) THEN 'unpaid' ELSE payment_status END WHERE id=? AND ${gate}`,changeId,c.start,c.end,c.occupied_until,c.amount,c.amount,bookingId,c.amount,bookingId,bookingId,changeId)
    ];
    // The service's commission follows the agreed price (audit «Оплата услуг», point 4).
    statements.push(...recalcCommission(this.db,bookingId,c.amount,changeId,this.userId,now()));
    // A later arrival gives the cleaning before it the time it needs (lib/arrival-shift.ts).
    if(c.start>b.start)statements.push(extendCleaningBefore(this.db,b,c.start,gate,changeId));
    // The assigned cleaner keeps the job at its new time unless that time clashes with the cleaner's other work;
    // the cleaner is told and can step back in the job card. A clash, or a move of more than three hours, still asks again.
    const keeps=!!job?.assigned_to&&movesCleaning&&job.status==='assigned'&&Math.abs(c.end-job.start)<=KEEP_SHIFT&&!await this.one("SELECT id FROM cleaning_jobs WHERE id<>? AND assigned_to=? AND status IN ('assigned','in_progress','submitted') AND start<? AND end>?",job.id,job.assigned_to,c.occupied_until,c.end);
    if(job&&movesCleaning&&keeps){
      const at=(v:number)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(v*1000));
      statements.push(this.query(`UPDATE cleaning_jobs SET start=?,end=? WHERE id=? AND status='assigned' AND assigned_to=? AND ${gate}`,c.end,c.occupied_until,job.id,job.assigned_to,changeId),
        this.query(`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE ${gate}`,id(),job.assigned_to,'Гость изменил даты: уборка «'+(b.title||'жильё')+'» теперь с '+at(c.end)+' до '+at(c.occupied_until)+'. Вы остаётесь назначены. Если время не подходит, откажитесь в карточке задания.','cleaner:reschedule:'+changeId,0,now(),changeId));
    }else if(job&&movesCleaning){
      statements.push(this.query(`UPDATE cleaning_jobs SET start=?,end=?,assigned_to=NULL,status='open' WHERE id=? AND status IN ('open','assigned') AND ${gate}`,c.end,c.occupied_until,job.id,changeId),this.query(`UPDATE applications SET status='rejected' WHERE job_id=? AND ${gate}`,job.id,changeId));
      if(job.assigned_to)statements.push(this.query(`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE ${gate}`,id(),job.assigned_to,'Время уборки изменилось и совпало с другой вашей уборкой. Назначение снято: проверьте новое время и откликнитесь повторно.','cleaner:reschedule:'+changeId,0,now(),changeId));
    }
    statements.push(
      this.query(`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${gate}`,id(),automatic?'system:rental-policy':this.userId,bookingId,JSON.stringify({action:'booking.change_accepted',changeId,onBehalfOf:automatic?b.owner_id:null,policyVersion:policy.version,pricing:{rate:q.rate,units:q.units,extraHours:q.extraHours,extraRate:q.extraRate,discountPercent:q.discountPercent,amount:q.amount}}),now(),changeId),
      this.query(`UPDATE booking_terms SET payment_reported_at=CASE WHEN ?>amount THEN NULL ELSE payment_reported_at END,amount=?,rate=?,units=?,billing_mode=?,discount_percent=?,version=version+1 WHERE booking_id=? AND ${gate}`,c.amount,c.amount,c.rate,c.units,c.billing_mode,c.discount_percent,bookingId,changeId)
    );
    const result=await this.db.batch(statements);if(!result[0].meta.changes||!result[1].meta.changes)throw new DomainError('Предложение уже изменилось. Обновите данные.',409);
    await this.db.batch([this.notify(b.guest_id,'Изменение проживания согласовано. Проверьте новые даты и остаток к оплате.','change-accepted:'+changeId,'guest'),this.notify(b.owner_id,'Календарь обновлён по согласованному изменению проживания.'+(job&&movesCleaning?(keeps?' Уборка перенесена, исполнитель остаётся тот же.':' Исполнителя уборки нужно согласовать заново.'):''),'change-accepted:'+changeId,'owner')]);
    return {id:changeId,message:automatic?'Продление применено автоматически в пределах полномочий владельца. Доплата учитывается отдельно.':'Изменение согласовано и применено. Проверьте остаток к оплате.'};
  }
  async createJob(body:Row) {
    await this.requireRole('owner');
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Жильё',100),this.userId);
    if(!p) throw new DomainError('Выберите своё жильё.',403);
    if(Number(p.own_staff))throw new DomainError('Здесь убирает свой персонал. Чтобы заказать исполнителя, выключите «Свой персонал» в настройках жилья.',409);
    const fee=number(body.fee,'Вознаграждение',100,1000000),description=required(body.description,'Условия',2000),requestKey=body.requestKey?required(body.requestKey,'Ключ операции',120):id(),digest=await operationHash(JSON.stringify([p.id,Date.parse(body.start),Date.parse(body.end),fee,description]));
    const previous=await this.one("SELECT * FROM operation_receipts WHERE user_id=? AND kind='create_job' AND request_key=?",this.userId,requestKey);if(previous){if(previous.payload_hash!==digest)throw new DomainError('Ключ задания уже использован с другими условиями.',409);return JSON.parse(previous.result);}
    const {start,end}=interval(body.start,body.end), jobId=id(),result={id:jobId,message:'Задание опубликовано. Исполнители могут откликаться.'};
    await assertCalendarAvailable(this.db,p.id,start,end);
    if(await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",p.id,end,start))throw new DomainError('У жилья уже есть уборка на это время.',409);
    await this.db.batch([this.query('INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',jobId,p.id,this.userId,null,start,end,fee,description,'open',null,'[]','',now()),this.audit(jobId,'job.created'),this.query('INSERT INTO operation_receipts VALUES (?,?,?,?,?,?)',this.userId,'create_job',requestKey,digest,JSON.stringify(result),now())]);
    return result;
  }
  async jobAction(jobId:string,body:Row) {
    const j=await this.one('SELECT j.*,p.demo_owner,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=? AND (p.demo_owner IS NULL OR p.demo_owner=?)',jobId,this.userId);
    if(!j) throw new DomainError('Задание не найдено.',404);
    if(this.execution){
      const policy=await this.one('SELECT * FROM property_policies WHERE property_id=?',j.property_id);
      // Under autopilot (both automations on) the AI may also accept a report it checked.
      const allowed=body.action==='assign'||body.action==='approve'&&!!policy?.auto_confirm;
      if(!allowed||j.owner_id!==this.userId||this.execution.propertyId!==j.property_id||policy?.version!==this.execution.policyVersion||!policy.auto_assign||!mandateActive(policy)||j.fee>policy.cleaning_budget)throw new DomainError('Автоназначение выходит за полномочия владельца.',403);
    }
    if(body.expectedVersion!==undefined&&body.expectedVersion!==j.version)throw new DomainError('Задание изменилось. Обновите карточку перед решением.',409);
    // «Деньги получены»: the performer confirms the transfer the owner marked.
    if(body.action==='payment_received'){
      if(j.assigned_to!==this.userId)throw new DomainError('Получение оплаты подтверждает исполнитель.',403);
      if(!j.settled_at)throw new DomainError('Заказчик ещё не отметил оплату этой уборки.',409);
      if(j.payment_received_at)return {message:'Получение оплаты уже подтверждено.'};
      await this.db.batch([this.query('UPDATE cleaning_jobs SET payment_received_at=? WHERE id=? AND payment_received_at IS NULL',now(),jobId),this.notify(j.owner_id,'Исполнитель подтвердил, что получил оплату за уборку «'+j.title+'».','payment-received:'+jobId,'owner'),this.audit(jobId,'job.payment_received')]);
      return {message:'Спасибо! Заказчик видит, что деньги дошли.'};
    }
    if(body.action==='record_job_payment'){
      if(j.owner_id!==this.userId)throw new DomainError('Оплату исполнителю отмечает владелец.',403);
      // A late cancellation of a home order leaves a part of the sum owed to the performer (cancel_fee).
      const late=j.status==='cancelled'&&j.cancel_fee>0,due=late?j.cancel_fee:j.fee;
      if(j.status!=='completed'&&!late||body.confirmed!==true)throw new DomainError('Сначала примите работу и подтвердите выполненный перевод.',409);
      number(body.expectedVersion,'Версия задания',1,10000000);await migrateFinanceEntity(this,'job',jobId);
      const balance=await this.one("SELECT COALESCE(SUM(amount),0) n FROM finance_entries WHERE job_id=? AND kind='job_payment'",jobId),remaining=Math.max(0,due-(balance?.n||0));if(!remaining)return {message:'Оплата уборки уже полностью отмечена.'};
      return recordFinance(this,{kind:'job_payment',jobId,amount:remaining,confirmed:true,note:required(body.note||(late?'Заказчик отметил оплату за позднюю отмену':'Владелец отметил оплату уборки'),'Основание отметки расчёта',1000),requestKey:'job-paid:'+jobId+':'+j.version});
    }
    if(body.action==='apply') {
      await this.requireRole('cleaner');
      if((await this.profile())?.work_status==='away')throw new DomainError('В профиле выключен приём заданий. Включите его перед откликом.',409);
      if(j.status!=='open'||j.end<=now()) throw new DomainError('Задание уже недоступно.',409);
      const results=await this.db.batch([this.query("INSERT INTO applications SELECT ?,id,?,'pending',? FROM cleaning_jobs WHERE id=? AND status='open' AND end>? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND work_status='away') ON CONFLICT(job_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at WHERE applications.status='rejected'",id(),this.userId,now(),jobId,now(),this.userId),this.notify(j.owner_id,'Новый отклик на уборку «'+j.title+'». Посмотрите анкету исполнителя.','application:'+jobId+':'+this.userId+':'+j.start,'owner'),this.audit(jobId,'job.application')]);
      if(!results[0].meta.changes && !await this.one('SELECT id FROM applications WHERE job_id=? AND user_id=?',jobId,this.userId)) throw new DomainError('Задание больше недоступно.',409);
      return {message:'Отклик отправлен. Назначение появится после подтверждения заказчиком.'};
    }
    // Changed their mind before the owner answered: the application is taken back, nothing counts against the cleaner.
    if(body.action==='withdraw'){
      const r=await this.db.batch([
        this.query("UPDATE applications SET status='rejected' WHERE job_id=? AND user_id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",jobId,this.userId,jobId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",id(),j.owner_id,'Исполнитель отозвал отклик на уборку «'+j.title+'». Остальные отклики на месте.','owner:application-withdrawn:'+jobId+':'+this.userId+':'+now(),now()),
        this.audit(jobId,'job.application_withdrawn')]);
      if(!r[0].meta.changes)throw new DomainError(j.assigned_to===this.userId?'Вас уже назначили. Если не сможете прийти, откажитесь от задания.':'Отклик уже рассмотрен или отозван.',409);
      return {message:'Отклик отозван.'};
    }
    if(body.action==='reject_application'&&j.owner_id===this.userId){
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a)throw new DomainError('Отклик уже рассмотрен.',409);
      const r=await this.query("UPDATE applications SET status='rejected' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=? AND end>?)",a.id,jobId,j.version,now()).run();
      if(!r.meta.changes)throw new DomainError('Условия задания изменились. Обновите карточку.',409);
      await this.db.batch([this.notify(a.user_id,'Ваш отклик на уборку «'+(j.title||'жильё')+'» отклонён.','application-rejected:'+a.id+':'+a.created_at,'cleaner'),this.audit(jobId,'job.application_rejected:'+a.id)]);
      return {message:'Отклик отклонён. Исполнитель уведомлён в приложении.'};
    }
    if(body.action==='assign' && j.owner_id===this.userId) {
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a) throw new DomainError('Отклик недоступен.',409);
      if((await this.one('SELECT work_status FROM profile_details WHERE user_id=?',a.user_id))?.work_status==='away')throw new DomainError('Исполнитель сейчас не принимает новые задания.',409);
      await assertPilotAllowed(this,'assignment',j.property_id,a.user_id);
      const mandateGate=this.execution?" AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=cleaning_jobs.property_id AND version=? AND auto_assign=1 AND cleaning_jobs.fee<=cleaning_budget AND (mandate_until=0 OR mandate_until>?))":'';
      const auditId=id(),auditAction=this.execution?JSON.stringify({action:'job.assigned',onBehalfOf:this.userId,...this.execution}):'job.assigned';
      const results=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=? AND status='open' AND end>? AND version=? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND work_status='away') AND EXISTS(SELECT 1 FROM applications WHERE id=? AND job_id=cleaning_jobs.id AND user_id=? AND status='pending')"+mandateGate,a.user_id,jobId,now(),j.version,a.user_id,a.id,a.user_id,...(this.execution?[this.execution.policyVersion,now()]:[])),
        this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',auditId,this.execution?'system:rental-policy':this.userId,jobId,auditAction,now()),
        this.query("UPDATE applications SET status=CASE WHEN user_id=(SELECT assigned_to FROM cleaning_jobs WHERE id=?) THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",jobId,jobId,auditId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,?,?,0,? FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned' AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",id(),'Вас назначили на уборку «'+j.title+'». Адрес и контакт заказчика доступны в задании.','cleaner:assigned:'+jobId+':'+a.user_id+':'+j.start,now(),jobId,a.user_id,auditId)
      ]);
      if(!results[0].meta.changes) throw new DomainError('Исполнитель уже назначен или задание истекло.',409);
      return {message:'Исполнитель назначен.'};
    }
    // The cleaner is at the door and the guest is gone, but nobody pressed «Я выехал»: the cleaner says so. It counts as a
    // report of leaving: the owner's autopilot confirms the checkout at once, without it the owner confirms in one tap.
    if(body.action==='vacant'&&j.assigned_to===this.userId){
      if(j.status!=='assigned'||!j.booking_id)throw new DomainError('Сообщить, что жильё свободно, можно по назначенной уборке после выезда гостя.',409);
      const b=await this.one('SELECT b.id,b.guest_id,b.end,b.status,t.checkout_reported_at,t.actual_checkout FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=?',j.booking_id);
      if(b?.status==='completed'||b?.actual_checkout)return {message:'Выезд уже подтверждён, можно начинать уборку.'};
      if(!b||b.status!=='confirmed')throw new DomainError('Бронь уже закрыта. Обновите задание.',409);
      if(now()<Number(b.end)-1800)throw new DomainError('Гость живёт до '+clockLabel(Number(b.end))+'. Сообщить, что жильё свободно, можно за полчаса до этого времени.',409);
      if(b.checkout_reported_at)return {message:'Выезд уже отмечен, ждём подтверждения. Начните уборку, как только кнопка станет активной.'};
      // Before the end of the stay the performer's word is not the guest's: the guest may be out for a walk. It is told
      // to the owner and the guest; the checkout is confirmed by the guest («Сообщить о выезде») or the owner, never by
      // the autopilot on the performer's word (audit of 2026-11-22). From the end of the stay it counts as a report.
      if(now()<Number(b.end)){
        const title=j.title||'жильё';
        await this.db.batch([
          this.notify(j.owner_id,'Исполнитель на месте в «'+title+'»: говорит, что гостя нет и жильё свободно. Бронь идёт до '+clockLabel(Number(b.end))+'. Если гость выехал, подтвердите выезд, и уборка начнётся.','cleaner-vacant:'+b.id,'owner'),
          this.notify(b.guest_id,'Исполнитель пришёл на уборку «'+title+'» и видит, что жильё свободно. Если вы уже выехали, нажмите «Сообщить о выезде» в брони. Если вы ещё здесь, ничего делать не нужно: бронь идёт до '+clockLabel(Number(b.end))+'.','cleaner-vacant:'+b.id,'guest'),
          this.audit(b.id,'booking.vacant_seen_by_cleaner')]);
        return {message:'Владелец и гость получили сообщение. Начать уборку можно, когда гость или владелец подтвердят выезд.'};
      }
      const r=await this.db.batch([
        this.query('UPDATE booking_terms SET checkout_reported_at=?,version=version+1 WHERE booking_id=? AND checkout_reported_at IS NULL AND actual_checkout IS NULL',now(),b.id),
        this.notify(j.owner_id,'Исполнитель на месте в «'+(j.title||'жильё')+'»: гостя нет, жильё свободно. Подтвердите выезд, чтобы началась уборка.','cleaner-vacant:'+b.id,'owner'),
        this.notify(b.guest_id,'Исполнитель пришёл на уборку «'+(j.title||'жильё')+'» и отметил, что вы выехали. Если вы ещё в жилье, напишите в чат брони.','cleaner-vacant:'+b.id,'guest'),
        this.audit(b.id,'booking.checkout_reported_by_cleaner')]);
      if(!r[0].meta.changes)throw new DomainError('Бронь изменилась. Обновите задание.',409);
      return {message:'Владелец получил сообщение. Как только выезд подтвердится, кнопка «Начать уборку» станет активной.'};
    }
    // «Опаздываю на 30 минут»: once per cleaning, before the cleaner is overdue to start; the job moves by half an hour
    // when the next guest leaves room for it, and the owner is told the new time.
    if(body.action==='late'&&j.assigned_to===this.userId){
      const t=now(),shift=1800;
      if(j.status!=='assigned')throw new DomainError('Предупредить об опоздании можно до начала уборки.',409);
      if(t<Number(j.start)-3*3600||t>Number(j.start)+45*60)throw new DomainError('Предупредить об опоздании можно за 3 часа до начала уборки и до 45 минут после.',409);
      if(await this.one('SELECT id FROM notifications WHERE dedupe=?','owner:cleaner-late:'+jobId))throw new DomainError('Об опоздании на эту уборку вы уже предупреждали. Если не успеваете, откажитесь от задания.',409);
      const start=Math.max(Number(j.start),t)+shift,end=start+(Number(j.end)-Number(j.start));
      const next=await this.one("SELECT start FROM bookings WHERE property_id=? AND id<>COALESCE(?,'') AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>? ORDER BY start LIMIT 1",j.property_id,j.booking_id,t,end,start);
      if(next)throw new DomainError('Следующий гость заезжает в '+clockLabel(Number(next.start))+': опоздать на полчаса нельзя. Если не успеваете, откажитесь от задания, и ИИ найдёт замену.',409);
      // A stay from another site's calendar counts as a next guest too (only the stretch the cleaning moves into).
      if(await this.one('SELECT x.id FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=? AND c.enabled=1 AND x.start<? AND x.end>? LIMIT 1',j.property_id,end,Number(j.end)))throw new DomainError('Следующий гость по внешнему календарю заезжает раньше: опоздать на полчаса нельзя. Если не успеваете, откажитесь от задания, и ИИ найдёт замену.',409);
      let r;
      try{r=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET start=?,end=?,overdue_step=0 WHERE id=? AND version=? AND status='assigned' AND assigned_to=?",start,end,jobId,j.version,this.userId),
        this.notify(j.owner_id,'Исполнитель опаздывает на уборку «'+(j.title||'жильё')+'»: начнёт к '+clockLabel(start)+'. Время уборки сдвинуто.','cleaner-late:'+jobId,'owner'),
        this.audit(jobId,'job.cleaner_late')]);}
      catch(error){if(/cleaner_overlap/.test(String((error as Error)?.message)))throw new DomainError('Новое время совпадает с другой вашей уборкой. Если не успеваете, откажитесь от одного задания.',409);throw error;}
      if(!r[0].meta.changes)throw new DomainError('Задание изменилось. Обновите карточку.',409);
      return {message:'Владелец предупреждён: вы начнёте к '+clockLabel(start)+'.'};
    }
    // «Выезжаю» и «Я на месте»: уборка без брони (заказ на дом, своя уборка владельца). Заказчик дома и ждёт:
    // он узнаёт об этом сразу и видит на карте. После гостей приезд отмечает «Гостя нет, жильё свободно».
    if((body.action==='on_way'||body.action==='arrived')&&j.assigned_to===this.userId){
      const arrived=body.action==='arrived',t=now();
      if(j.booking_id)throw new DomainError('Для уборки после гостей отметьте «Гостя нет, жильё свободно» или начните уборку.',409);
      if(j.status!=='assigned')throw new DomainError('Отметить приезд можно по назначенной уборке до её начала.',409);
      if(arrived?j.arrived_at:j.on_way_at||j.arrived_at)return {message:arrived?'Заказчик уже знает, что вы на месте.':'Заказчик уже знает, что вы выехали.'};
      if(t<Number(j.start)-(arrived?3600:3*3600))throw new DomainError(arrived?'Отметить «Я на месте» можно не раньше чем за час до уборки.':'Отметить выезд можно не раньше чем за 3 часа до уборки.',409);
      const r=await this.db.batch([
        this.query(arrived?"UPDATE cleaning_jobs SET arrived_at=? WHERE id=? AND assigned_to=? AND status='assigned' AND version=? AND arrived_at IS NULL":"UPDATE cleaning_jobs SET on_way_at=? WHERE id=? AND assigned_to=? AND status='assigned' AND version=? AND on_way_at IS NULL",t,jobId,this.userId,j.version),
        this.notify(j.owner_id,arrived?'Исполнитель на месте: «'+(j.title||'уборка')+'». Откройте дверь, уборка начнётся с вашего согласия.':'Исполнитель выехал на уборку «'+(j.title||'уборка')+'». Начало в '+clockLabel(Number(j.start))+'.',(arrived?'cleaner-arrived:':'cleaner-on-way:')+jobId+':'+j.version,'owner'),
        this.audit(jobId,arrived?'job.cleaner_arrived':'job.cleaner_on_way')]);
      if(!r[0].meta.changes)throw new DomainError('Задание изменилось. Обновите карточку.',409);
      return {message:arrived?'Заказчик знает, что вы на месте. Начните уборку, когда вас впустят.':'Заказчик знает, что вы выехали.'};
    }
    if(body.action==='start' && j.assigned_to===this.userId) {
      if(j.start>now()+3600) throw new DomainError('Начать работу можно не раньше чем за час до задания.');
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='in_progress',arrived_at=CASE WHEN booking_id IS NULL THEN COALESCE(arrived_at,?) ELSE arrived_at END WHERE id=? AND assigned_to=? AND status='assigned' AND version=?",now(),jobId,this.userId,j.version),this.query("UPDATE property_operations SET readiness='cleaning',version=version+1,updated_at=? WHERE property_id=? AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='in_progress')",now(),j.property_id,jobId),this.audit(jobId,'job.start_requested')]);
      if(!r[0].meta.changes) throw new DomainError('Статус задания изменился.',409);return {message:'Начало работы отмечено.'};
    }
    if(body.action==='submit' && j.assigned_to===this.userId) {
      await requireEvidence(this,jobId);
      const checklist=Array.isArray(body.checklist)?body.checklist:[];
      // A home cleaning has its own list by its kind (lib/home-cleaning.ts homeChecklist), never shorter than the usual four.
      if(checklist.length<4||checklist.length>12||checklist.some((v:any)=>v!==true)) throw new DomainError('Подтвердите все пункты чек-листа.');
      // The app sends the names of the points it showed (a home cleaning has its own list): they are kept as they were
      // confirmed, so the customer reads exactly what the performer ticked. The site's four ticks stay four ticks.
      const order=homeOrderOf(j.description),named=Array.isArray(body.items)?body.items.map(String):null;
      if(named&&(!order||named.length!==checklist.length||named.join('|')!==homeChecklist(order).join('|')))throw new DomainError('Чек-лист изменился. Откройте отчёт заново.',409);
      const kept=named||checklist;
      const report=required(body.report,'Отчёт о работе',1500);
      if(j.status!=='in_progress')throw new DomainError('Сначала отметьте начало работы.',409);
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='submitted',checklist=?,report=? WHERE id=? AND assigned_to=? AND status='in_progress' AND version=?",JSON.stringify(kept),report,jobId,this.userId,j.version),this.query("UPDATE property_operations SET readiness='inspection',version=version+1,updated_at=? WHERE property_id=? AND readiness='cleaning' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='submitted')",now(),j.property_id,jobId),this.notify(j.owner_id,'Уборка отправлена на проверку. Прочитайте отчёт и примите работу.','submitted:'+jobId+':'+j.version,'owner'),this.audit(jobId,'job.submitted')]);
      if(!r[0].meta.changes) throw new DomainError('Статус задания изменился.',409);
      return {message:'Отчёт отправлен заказчику на проверку.'};
    }
    if(body.action==='revise'&&j.owner_id===this.userId){
      const reason=required(body.reason,'Что нужно доработать',1000);
      const r=await this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND status='submitted' AND version=?",jobId,j.version).run();
      if(!r.meta.changes)throw new DomainError('Отчёт уже рассмотрен. Обновите карточку.',409);
      await this.db.batch([this.query("UPDATE property_operations SET readiness='cleaning',version=version+1,updated_at=? WHERE property_id=? AND active_booking_id IS NULL AND readiness='inspection' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='in_progress' AND version=?)",now(),j.property_id,jobId,j.version+1),this.notify(j.assigned_to,'Доработайте уборку: '+reason,'revision:'+jobId+':'+j.version,'cleaner'),this.audit(jobId,'job.revision_requested:'+reason)]);
      return {message:'Отчёт возвращён на доработку. Жильё не отмечено готовым.'};
    }
    if(body.action==='approve' && j.owner_id===this.userId) {
      await requireEvidence(this,jobId);
      // The owner pays the performer directly; the service only shows where to transfer and keeps both marks.
      const tenge=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸',payTo=j.assigned_to?await payoutOf(this.db,j.assigned_to):null;
      const approveGate=this.execution?" AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=cleaning_jobs.property_id AND version=? AND auto_assign=1 AND auto_confirm=1 AND (mandate_until=0 OR mandate_until>?))":'';
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='completed' WHERE id=? AND status='submitted' AND version=?"+approveGate,jobId,j.version,...(this.execution?[this.execution.policyVersion,now()]:[])),this.query("UPDATE property_operations SET readiness='ready',version=version+1,updated_at=? WHERE property_id=? AND readiness='inspection' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND (status IN ('in_progress','submitted') OR (status IN ('open','assigned') AND start<=?)))",now(),j.property_id,jobId,j.property_id,now()),this.notify(j.assigned_to,(this.execution?'ИИ-администратор принял уборку по фотоотчёту.':'Заказчик принял уборку.')+(j.fee>0?' Заказчик переведёт вам '+tenge(j.fee)+' напрямую и отметит оплату.'+(payTo?'':' Укажите номер Kaspi в «Настройках», «Реквизиты для оплаты», чтобы он знал, куда платить.'):''),'approved:'+jobId,'cleaner'),this.audit(jobId,'job.completed')]);
      if(!r[0].meta.changes) throw new DomainError('Нет отчёта для приёмки.',409);
      if((await this.one('SELECT readiness FROM property_operations WHERE property_id=?',j.property_id))?.readiness==='ready')await afterReady(this.db,j.property_id);
      const advice=await this.priceAdviceAfterReady(j.property_id);
      return {message:'Работа принята.'+(j.fee>0&&j.assigned_to&&j.assigned_to!==j.owner_id?' Переведите исполнителю '+tenge(j.fee)+' напрямую'+(payTo?' на Kaspi '+payoutPhoneText(payTo.phone)+' ('+payTo.recipient+')':'')+' и отметьте «Оплатил уборку».':'')+(advice?' ИИ-администратор посмотрел спрос и предлагает новую цену, решение за вами.':''),priceSuggestion:advice};
    }
    if(body.action==='cancel'&&j.owner_id===this.userId){
      // A home order has terms the customer read before confirming (lib/home-cleaning.ts homeCancel): free until two
      // hours before the start or while nobody took it, later the performer is owed a part of the sum.
      const home=j.booking_id===null&&!!homeOrderOf(j.description),t=now(),terms=home?homeCancel(j,t):{fee:0};
      const reason=home?String(body.reason||'').trim().slice(0,1000)||'Заказчик отменил заказ':required(body.reason,'Причина отмены',1000);
      if(home&&body.expectedFee!==undefined&&Number(body.expectedFee)!==terms.fee)throw new DomainError(terms.fee?'Бесплатный срок отмены уже прошёл: исполнителю положено '+tenge(terms.fee)+'. Подтвердите отмену ещё раз.':'Условия отмены изменились. Обновите карточку.',409);
      // Started work is never cancelled (audit of 2026-11-22: the performer lost the report and the pay). The owner
      // closes it as done, gives it to another performer (the started part is then settled in an issue), or extends it.
      if(j.status==='in_progress')throw new DomainError('Уборка уже начата, отменить её нельзя. Если работа сделана, закройте уборку как выполненную; если исполнитель не справляется, передайте её другому, тогда оплату сделанной части обсудите в обращении.',409);
      const r=await this.query("UPDATE cleaning_jobs SET status='cancelled',cancel_fee=?,cancelled_at=? WHERE id=? AND status IN ('open','assigned')"+(home?' AND version=?':''),terms.fee,t,jobId,...(home?[j.version]:[])).run();
      if(!r.meta.changes)throw new DomainError(home&&['open','assigned'].includes(j.status)?'Заказ изменился. Обновите карточку.':'Начатую работу нельзя отменить этим действием.',409);
      const said=home?'Заказчик отменил уборку «'+(j.title||'дом')+'». '+(terms.fee?'Отмена позже бесплатного срока: вам положено '+tenge(terms.fee)+' за отложенное время.':'Отмена в бесплатный срок.'):'Владелец отменил уборку «'+(j.title||'жильё')+'». Причина: '+reason;
      await this.db.batch([this.audit(jobId,'job.cancelled:'+reason),...(j.assigned_to?[this.notify(j.assigned_to,said,'cancelled:'+jobId,'cleaner')]:[])]);
      return {message:home?(terms.fee?'Заказ отменён. Исполнителю положено '+tenge(terms.fee)+': переведите и отметьте оплату в карточке.':'Заказ отменён бесплатно.'):'Задание отменено. Готовность жилья нужно проверить отдельно.',cancelFee:terms.fee};
    }
    // After the work is accepted the customer rates the performer once: the average is shown to the next customers.
    if(body.action==='rate'&&j.owner_id===this.userId){
      const rating=number(body.rating,'Оценка',1,5),note=String(body.note??'').trim();
      if(note.length>1000)throw new DomainError('Сократите отзыв до 1000 знаков.');
      if(j.status!=='completed'||!j.assigned_to||j.assigned_to===j.owner_id)throw new DomainError('Оценить исполнителя можно после приёмки работы.',409);
      const r=await this.query("UPDATE cleaning_jobs SET rating=?,rating_note=?,rated_at=? WHERE id=? AND status='completed' AND rating IS NULL",rating,note,now(),jobId).run();
      if(!r.meta.changes)throw new DomainError('Вы уже оценили эту уборку.',409);
      await this.db.batch([this.notify(j.assigned_to,'Заказчик оценил уборку «'+(j.title||'жильё')+'»: '+'★'.repeat(rating)+'☆'.repeat(5-rating)+(note?' «'+note+'»':''),'rated:'+jobId,'cleaner'),this.audit(jobId,'job.rated:'+rating)]);
      return {message:'Спасибо за оценку! Её увидят следующие заказчики.'};
    }
    // Damage found at the acceptance or within two days after it: the photos are already saved (operations/evidence,
    // phase damage), the complaint opens an issue both the performer and the AI administrator see.
    if(body.action==='damage'&&j.owner_id===this.userId){
      const text=required(body.text,'Что повреждено',1500);
      if(!j.assigned_to||j.assigned_to===j.owner_id||!['submitted','completed'].includes(j.status))throw new DomainError('Сообщить об ущербе можно после отчёта исполнителя.',409);
      if(j.status==='completed'&&j.completed_at&&j.completed_at<now()-HOME_DAMAGE_WINDOW)throw new DomainError('Срок прошёл: об ущербе можно сообщить в течение двух суток после приёмки.',409);
      const photos=Number((await this.one("SELECT COUNT(*) n FROM job_evidence WHERE job_id=? AND user_id=? AND phase='damage'",jobId,this.userId))?.n||0);
      if(!photos)throw new DomainError('Добавьте хотя бы одно фото повреждения.');
      const issue='Ущерб при уборке: '+text+' (фото: '+photos+')';
      const receipt=await this.operationReceipt('job_issue',body,[jobId,issue]);if(receipt.previous)return receipt.previous;
      const issueWrite=await this.issueWrite(j,'job',issue),result={message:'Жалоба отправлена исполнителю. ИИ-администратор следит за ответом и подключит администратора сервиса, если вы не договоритесь.'};
      await this.db.batch([issueWrite.statement,this.notify(j.assigned_to,'Заказчик сообщил об ущербе при уборке «'+(j.title||'жильё')+'»: '+text+'. Фото в карточке задания.',id(),'cleaner'),this.audit(jobId,'job.damage_claimed'),this.query('INSERT INTO operation_receipts VALUES (?,?,?,?,?,?)',this.userId,'job_issue',receipt.key,receipt.digest,JSON.stringify(result),now())]);
      return result;
    }
    if(body.action==='repost'&&j.owner_id===this.userId||j.status==='open'&&body.action==='close'&&j.owner_id===this.userId)return this.unclaimedAction(j,body);
    if(['extend','release','close'].includes(body.action)&&(j.owner_id===this.userId||j.assigned_to===this.userId&&body.action!=='close'))return this.overdueAction(j,body);
    if(body.action==='issue' && (j.owner_id===this.userId||j.assigned_to===this.userId)) {
      const issue=required(body.issue,'Описание',1500);
      const receipt=await this.operationReceipt('job_issue',body,[jobId,issue]);if(receipt.previous)return receipt.previous;
      const issueWrite=await this.issueWrite(j,'job',issue),result={message:issueWrite.added?'Дополнение записано в открытое обращение. Статус работы не изменён.':'Обращение записано в уведомлениях. Статус работы не изменён.'};
      await this.db.batch([issueWrite.statement,this.notify(j.owner_id===this.userId?j.assigned_to:j.owner_id,'Проблема по уборке: '+issue,id(),j.owner_id===this.userId?'cleaner':'owner'),this.audit(jobId,'job.issue'),this.query('INSERT INTO operation_receipts VALUES (?,?,?,?,?,?)',this.userId,'job_issue',receipt.key,receipt.digest,JSON.stringify(result),now())]);
      return result;
    }
    throw new DomainError('Нет доступа к этому действию.',403);
  }
  async chat(body:Row,config:AIConfig={},toolExecutor?:AIToolExecutor) {
    const text=required(body.text,'Сообщение',2000), role=await this.authorizeWorkspace(body.role,'chat');
    const reply=assistantReply(text,role,!!await this.profile()), ts=Date.now();
    const permission=await aiDataPermission(this);
    let search:Record<string,any>|undefined;
    const previous=role==='guest'?await previousAdministratorSearch(this):null;
    const current=body.searchFilters&&typeof body.searchFilters==='object'?body.searchFilters:{};
    const readSearch=async()=>{
      const inherited=previous&&!isPropertySearch(text)?{...previous.filters}:null;
      if(inherited?.start&&Date.parse(inherited.start+(inherited.start.length===16?'+05:00':''))<=Date.now()){delete inherited.start;delete inherited.end;}
      return administratorSearch(this,text,inherited||current,{syntheticPreview:config.TEST_DATA_ONLY==='1'});
    };
    let mode='scenario',errorCode:string|undefined,commands:Row[]=[],fromAccount=false;
    if(role==='guest'&&(isPropertySearch(text)||previous&&isSearchRefinement(text))){
      const found=await readSearch();
      reply.text=found.text;reply.action='properties';search=found.result;
    }else if(processReadIntent(text,role)){
      // Answered from the person's own bookings and cleaning jobs: no model is needed and none is asked.
      reply.text=(await readAdministratorProcesses(this,role,text)).text;reply.action=role==='cleaner'?'jobs':'bookings';fromAccount=true;
    }else if(permission.allowed&&config.OPENAI_API_KEY&&config.OPENAI_MODEL){
      const history=await this.all('SELECT sender,body FROM (SELECT sender,body,created_at FROM messages WHERE user_id=? AND scope=? ORDER BY created_at DESC LIMIT 8) ORDER BY created_at',this.userId,role);
      const context=assistantContext(await this.roleState(role),role);
      const budget=createAIBudgetLifecycle(this.db,this.userId,config);
      const generated=await generateAnswer(config,text,role,history as {sender:string;body:string}[],reply.text,context,toolExecutor,{...budget,beforeRequest:async body=>{if(!(await aiDataPermission(this)).allowed)throw new DomainError('Передача данных отозвана. Поиск и формы доступны.');await budget.beforeRequest(body);}},role==='guest'?readSearch:undefined,()=>readAdministratorProcesses(this,role),await languageOf(this.db,this.userId));
      reply.text=generated.text;
      mode=generated.mode;errorCode=generated.errorCode;commands=generated.commands||[];
      if(generated.search){search=generated.search;reply.action='properties';}
    }
    const answerId=id();
    await this.db.batch([
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',id(),this.userId,role,'user',text,ts),
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',answerId,this.userId,role,'assistant',reply.text,ts+1),
      ...(search?[this.query('INSERT INTO administrator_search_results VALUES (?,?)',answerId,JSON.stringify(search))]:[])
    ]);
    return {...reply,mode,commands,permissionRequired:!permission.allowed,...(fromAccount?{fromAccount}:{}),...(search?{search}:{}),...(errorCode?{errorCode}:{})};
  }
  async demo() {
    const existing=await this.one('SELECT id FROM properties WHERE demo_owner=? LIMIT 1',this.userId);
    if(existing) return {message:'Учебные данные уже добавлены. Они видны только вам.'};
    const p1=id(),p2=id(),job=id(), t=now(), tomorrow=Math.ceil((t+86400)/3600)*3600;
    const statements=[
      this.query('INSERT OR IGNORE INTO profiles VALUES (?,?,?,?,?,?,?,?,?)',this.userId,'Тестовый пользователь','Тестовый контакт','Павлодар',JSON.stringify(roles),'Центр, Набережная','Учебная анкета','По согласованию',t),
      this.query('INSERT INTO properties(id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p1,this.userId,this.userId,'Светлая квартира у набережной','Павлодар','Набережная','Учебный адрес, квартира 12','Демонстрационный объект. Одна спальня, кухня, Wi-Fi. Без курения. Реальное заселение невозможно.',18500,2,4,90,1,t),
      this.query('INSERT INTO properties(id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p2,this.userId,this.userId,'Уютная студия в центре','Павлодар','Центр','Учебный адрес, квартира 24','Демонстрационный объект. Студия для двоих с рабочим местом. Реальное заселение невозможно.',14000,1,2,60,1,t+1),
      this.query('INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',job,p1,this.userId,null,tomorrow,tomorrow+5400,4500,'Учебное задание: уборка после выезда, смена белья. Средства на объекте.','open',null,'[]','',t),
      this.audit(p1,'demo.created')
    ];
    statements.push(this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?),(?,?)',p1,t,p2,t));
    await this.db.batch(statements);
    return {message:'Добавлены учебные объекты и уборка. Данные изолированы от других пользователей.'};
  }
  async maintenance() {
    await this.query("UPDATE bookings SET status='expired' WHERE status='requested' AND expires_at<=?",now()).run();
    const overdue=await this.all("SELECT id,owner_id,assigned_to FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress') AND end<?",now());
    if(overdue.length) await this.db.batch(overdue.map(j=>this.notify(j.owner_id,'Срок уборки истёк. Проверьте выполнение и при необходимости найдите замену.','overdue:'+j.id,'owner')));
    return {message:'Сроки проверены.', overdue:overdue.length};
  }
}
