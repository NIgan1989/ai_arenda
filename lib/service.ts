import { DomainError, required, number, interval, quote, roles, assistantReply, type Role } from './domain';
import { generateAnswer, assistantContext, type AIConfig } from './ai';
import { operationOverview } from './operations';
import { defaultPolicy,publicPolicy,policyInput,rentalPrice,changeRentalPrice,mandateActive } from './rental-policy';
import { parseRole,commandRole } from './access';
import {assistantBrief,assistantSettingsInput,defaultAssistantSettings} from './assistant';
import {defaultAccountSettings,accountSettingsInput,userSearchInput} from './account';
import {approvalCards} from './approvals';
import {listingInput,jpegInput,propertyStatus,cleanerStatus} from './listings';

type Row = Record<string, any>;
const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
export class RentalService {
  constructor(public db: D1Database, public userId: string, private execution?:{propertyId:string;policyVersion:number}) {}
  query(sql: string, ...args: any[]) { return this.db.prepare(sql).bind(...args); }
  async one(sql: string, ...args: any[]) { return this.query(sql, ...args).first<Row>(); }
  async all(sql: string, ...args: any[]) { return (await this.query(sql, ...args).all<Row>()).results; }
  async profile() { return this.one('SELECT p.*,d.avatar_id,d.work_status,COALESCE(d.version,0) profile_version FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id WHERE p.id=?', this.userId); }
  async uploadMedia(body:Row){
    if(!await this.profile())throw new DomainError('Сначала заполните профиль.',403);
    if(body.kind==='property')await this.requireRole('owner');
    await this.query("DELETE FROM media WHERE user_id=? AND created_at<? AND NOT EXISTS(SELECT 1 FROM property_details d,json_each(d.photos) f WHERE f.value=media.id) AND NOT EXISTS(SELECT 1 FROM profile_details d WHERE d.avatar_id=media.id)",this.userId,now()-86400).run();
    const image=jpegInput(body.data,body.kind),mediaId=id();
    const r=await this.query('INSERT INTO media SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM media WHERE user_id=?)<100',mediaId,this.userId,body.kind,image.data,image.width,image.height,image.bytes,now(),this.userId).run();
    if(!r.meta.changes)throw new DomainError('Достигнут лимит фотографий. Удалите неиспользуемые снимки.',409);
    return {id:mediaId,width:image.width,height:image.height};
  }
  async readMedia(mediaId:string){
    const m=await this.one(`SELECT m.data,m.width,m.height FROM media m WHERE m.id=? AND (m.user_id=? OR (m.kind='property' AND EXISTS(SELECT 1 FROM property_details d JOIN properties p ON p.id=d.property_id,json_each(d.photos) f WHERE f.value=m.id AND p.published=1 AND (p.demo_owner IS NULL OR p.demo_owner=?))) OR (m.kind='avatar' AND EXISTS(SELECT 1 FROM profile_details d WHERE d.avatar_id=m.id AND (EXISTS(SELECT 1 FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE a.user_id=d.user_id AND j.owner_id=?) OR EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.assigned_to=d.user_id AND j.owner_id=?) OR EXISTS(SELECT 1 FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? AND p.owner_id=d.user_id AND b.status='confirmed')))))`,mediaId,this.userId,this.userId,this.userId,this.userId,this.userId);
    if(!m)throw new DomainError('Фотография недоступна.',404);return m;
  }
  async deleteMedia(mediaId:string){
    if(!await this.one('SELECT id FROM media WHERE id=? AND user_id=?',mediaId,this.userId))throw new DomainError('Фотография недоступна.',404);
    if(await this.one("SELECT d.property_id FROM property_details d,json_each(d.photos) f WHERE f.value=? UNION ALL SELECT user_id FROM profile_details WHERE avatar_id=?",mediaId,mediaId))throw new DomainError('Сначала уберите фотографию из объявления или профиля.',409);
    await this.query('DELETE FROM media WHERE id=? AND user_id=?',mediaId,this.userId).run();return {message:'Неиспользуемая фотография удалена.'};
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
    const revision=id(),r=await this.db.batch([
      this.query('INSERT INTO profile_details VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_id=excluded.avatar_id,work_status=excluded.work_status,version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE profile_details.version=?',this.userId,avatar,body.workStatus,version+1,revision,now(),version),
      this.query('UPDATE profiles SET name=?,contact=?,city=?,districts=?,experience=?,availability=? WHERE id=? AND EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND revision=?)',name,contact,city,districts,experience,availability,this.userId,this.userId,revision)
    ]);
    if(!r[0].meta.changes)throw new DomainError('Профиль уже изменился. Обновите форму.',409);
    await this.audit(this.userId,'profile.form_updated').run();return {message:'Профиль сохранён.'};
  }
  async saveListing(propertyId:string|null,body:Row){
    await this.requireRole('owner');const value=listingInput(body),{p,details,photos,published,expectedVersion}=value;
    await this.checkMedia(photos,'property');
    const current=propertyId?await this.one('SELECT p.*,COALESCE(d.version,0) listing_version FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.owner_id=?',propertyId,this.userId):null;
    if(propertyId&&!current)throw new DomainError('Объявление не найдено.',404);
    if((current?.listing_version||0)!==expectedVersion)throw new DomainError('Объявление уже изменилось. Обновите форму.',409);
    if(current&&await this.one("SELECT id FROM bookings WHERE property_id=? AND guests>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?",propertyId,p.capacity,now(),now()))throw new DomainError('Вместимость меньше числа гостей в действующей брони.',409);
    const currentPolicy=propertyId?await this.one('SELECT * FROM property_policies WHERE property_id=?',propertyId):null;
    const policyVersion=number(body.policyVersion??0,'Версия тарифов',0,10000000);
    if((currentPolicy?.version||0)!==policyVersion)throw new DomainError('Тарифы уже изменились. Обновите форму.',409);
    const rental=body.rental||{},policy=policyInput({...rental,dailyPrice:p.price,autoConfirm:!!currentPolicy?.auto_confirm,cleaningFee:currentPolicy?.cleaning_fee||0,cleaningBudget:currentPolicy?.cleaning_budget||0,maxDiscountPercent:currentPolicy?.max_discount_percent||0,minimumRate:currentPolicy?.minimum_rate||0,repairBudget:currentPolicy?.repair_budget||0,autoExtension:!!currentPolicy?.auto_extension,maxExtensionHours:currentPolicy?.max_extension_hours||0,mandateUntil:currentPolicy?.mandate_until?new Date(currentPolicy.mandate_until*1000).toISOString():'',escalationContact:currentPolicy?.escalation_contact||''});
    const key=propertyId||id(),revision=id(),gate='EXISTS(SELECT 1 FROM property_details WHERE property_id=? AND revision=?)';
    const statements=[];
    if(!propertyId)statements.push(this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',key,this.userId,null,p.title,p.city,p.district,p.address,p.description,p.price,p.rooms,p.capacity,p.cleaningMinutes,published,now()),this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?)',key,now()));
    statements.push(this.query('INSERT INTO property_details SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT version FROM property_policies WHERE property_id=?),0)=? ON CONFLICT(property_id) DO UPDATE SET details=excluded.details,photos=excluded.photos,version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE property_details.version=?',key,JSON.stringify(details),JSON.stringify(photos),expectedVersion+1,revision,now(),key,policyVersion,expectedVersion));
    if(propertyId){
      statements.push(this.query(`UPDATE properties SET title=?,city=?,district=?,address=?,description=?,price=?,rooms=?,capacity=?,cleaning_minutes=?,published=? WHERE id=? AND owner_id=? AND ${gate}`,p.title,p.city,p.district,p.address,p.description,p.price,p.rooms,p.capacity,p.cleaningMinutes,published,key,this.userId,key,revision));
    }
    const keys=Object.keys(policy);
    statements.push(this.query(`INSERT INTO property_policies(property_id,${keys.join(',')},version,revision,updated_at) SELECT ?,${keys.map(()=>'?').join(',')},?,?,? WHERE ${gate} ON CONFLICT(property_id) DO UPDATE SET ${keys.map(k=>`${k}=excluded.${k}`).join(',')},version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at`,key,...Object.values(policy),policyVersion+1,id(),now(),key,revision));
    statements.push(this.query(`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${gate}`,id(),this.userId,key,propertyId?'property.listing_updated':'property.listing_created',now(),key,revision));
    const results=await this.db.batch(statements);if(!results[propertyId?0:2].meta.changes)throw new DomainError('Объявление уже изменилось. Обновите форму.',409);
    return {id:key,message:published?'Объявление опубликовано. Готовность и даты проверяются отдельно.':'Черновик сохранён. Гости его не видят.'};
  }
  async enrichProperties(items:Row[],owner=false):Promise<Row[]>{
    if(!items.length)return [];
    const [details,operations,busy]=await Promise.all([this.all('SELECT * FROM property_details'),this.all('SELECT * FROM property_operations'),this.all("SELECT DISTINCT property_id FROM bookings WHERE (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<=? AND occupied_until>?",now(),now(),now())]);
    return items.map(p=>{const d=details.find(d=>d.property_id===p.id),op=operations.find(o=>o.property_id===p.id);return {...p,details:d?JSON.parse(d.details):{},photos:d?JSON.parse(d.photos):[],listing_version:d?.version||0,display_status:propertyStatus(p,op,busy.some(b=>b.property_id===p.id)),...(owner?{}:{published:undefined})};});
  }
  async workerCard(userId:string){
    const p=await this.one('SELECT p.name,p.city,p.districts,p.experience,p.availability,d.avatar_id,d.work_status FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id WHERE p.id=?',userId);
    if(!p)return null;
    const jobs=await this.all("SELECT start,end,status FROM cleaning_jobs WHERE assigned_to=? AND status IN ('assigned','in_progress','submitted')",userId);
    return {...p,display_status:cleanerStatus(p.work_status,jobs,now())};
  }
  async accountState(){return {profile:await this.profile(),workerStatus:(await this.workerCard(this.userId))?.display_status,settings:await this.one('SELECT payment_provider,payment_notifications,version FROM account_preferences WHERE user_id=?',this.userId)||defaultAccountSettings};}
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
  async roleState(value:unknown){
    const role=await this.authorizeWorkspace(value,'state'),state=await this.state();
    const bookings=state.bookings.filter((b:Row)=>role==='owner'?b.owner_id===this.userId:role==='guest'&&b.guest_id===this.userId).map((b:Row)=>role==='owner'?b:{...b,address:b.status==='confirmed'?b.address:null,owner_contact:b.status==='confirmed'?b.owner_contact:null,guest_name:null,guest_contact:null});
    const jobs=role==='guest'?[]:state.jobs.filter((j:Row)=>role==='owner'?j.owner_id===this.userId:j.assigned_to===this.userId||(j.status==='open'&&j.end>state.serverTime)).map((j:Row)=>role==='owner'||j.assigned_to===this.userId?j:{...j,address:null,owner_contact:null,report:'',checklist:'[]'});
    const jobIds=new Set(jobs.map((j:Row)=>j.id));
    const entityIds=[...bookings,...jobs].map((item:Row)=>item.id);
    const accountPreference=await this.one('SELECT payment_notifications FROM account_preferences WHERE user_id=?',this.userId);
    const notifications=state.notifications.filter((n:Row)=>{
      if(accountPreference?.payment_notifications===0&&/:(paid|payment|deposit):/.test(n.dedupe))return false;
      if(/^(guest|owner|cleaner):/.test(n.dedupe))return n.dedupe.startsWith(role+':');
      const legacyRole=/^(booking|checkout-reported|application|submitted|overdue):/.test(n.dedupe)?'owner':/^(confirmed|paid):/.test(n.dedupe)?'guest':/^(assigned|approved):/.test(n.dedupe)?'cleaner':null;
      return legacyRole===role&&entityIds.some(entityId=>n.dedupe.includes(entityId));
    });
    const workers=new Map<string,Row|null>();if(role==="owner"){for(const userId of new Set([...state.applications.map(a=>a.user_id),...jobs.map(j=>j.assigned_to).filter(Boolean)]))workers.set(userId,await this.workerCard(userId));}
    const result={...state,profile:state.profile?{...state.profile,display_status:cleanerStatus(state.profile.work_status,state.jobs.filter(j=>j.assigned_to===this.userId),state.serverTime)}:null,activeRole:role,properties:role==='guest'?state.properties:[],ownProperties:role==='owner'?state.ownProperties:[],bookings,jobs:jobs.map((j:Row):Row=>({...j,worker:role==='owner'?workers.get(j.assigned_to):null})),
      notifications,applications:state.applications.filter(a=>jobIds.has(a.job_id)&&(role==='owner'||a.user_id===this.userId)).map(a=>({...a,worker:role==='owner'?workers.get(a.user_id):null})),messages:state.messages.filter(m=>m.scope===role)};
    const preference=await this.one('SELECT * FROM assistant_preferences WHERE user_id=? AND role=?',this.userId,role);
    const assistantSettings={...defaultAssistantSettings,...(preference?JSON.parse(preference.settings):{}),version:preference?.version||0};
    return {...result,approvals:approvalCards(result,role,this.userId,state.serverTime),assistantSettings,assistantBrief:assistantBrief(result,role,assistantSettings,state.serverTime),workspaces:{[role]:operationOverview(result,this.userId,role,state.serverTime)}};
  }
  async decideApproval(roleValue:unknown,body:Row){
    const role=parseRole(roleValue),state=await this.roleState(role),card=state.approvals.find(c=>c.id===body.id);
    if(!card)throw new DomainError('Согласование уже закрыто, истекло или недоступно. Обновите карточку.',409);
    if(!card.canDecide)throw new DomainError('Решение должна принять другая сторона.',403);
    if(body.revision!==card.revision)throw new DomainError('Условия изменились. Обновите карточку перед решением.',409);
    if(!['accept','reject'].includes(body.action))throw new DomainError('Выберите принятие или отклонение.');
    const accept=body.action==='accept';
    if(card.kind==='booking')return this.bookingAction(card.entityId,{action:accept?'confirm':'reject',cleaningFee:body.cleaningFee??card.cleaningFee,expectedVersion:state.bookings.find(b=>b.id===card.entityId)?.terms?.version});
    if(card.kind==='change')return this.decideBookingChange(card.entityId,card.id.slice(7),role,{action:body.action});
    if(card.kind==='checkout')return this.bookingAction(card.entityId,{action:accept?'checkout':'dispute_checkout',reason:body.reason,expectedVersion:state.bookings.find(b=>b.id===card.entityId)?.terms?.version});
    const job=state.jobs.find(j=>j.id===card.entityId);
    return this.jobAction(card.entityId,{action:card.kind==='application'?(accept?'assign':'reject_application'):(accept?'approve':'revise'),applicationId:card.id.slice(12),reason:body.reason,expectedVersion:job?.version});
  }
  async saveAssistantSettings(roleValue:unknown,body:Row){
    const role=await this.authorizeWorkspace(roleValue,'assistant-settings'),settings=assistantSettingsInput(body),expected=number(body.expectedVersion,'Версия настроек',0,1000000);
    const r=await this.query('INSERT INTO assistant_preferences VALUES (?,?,?,?,?) ON CONFLICT(user_id,role) DO UPDATE SET settings=excluded.settings,version=excluded.version,updated_at=excluded.updated_at WHERE assistant_preferences.version=?',this.userId,role,JSON.stringify(settings),expected+1,now(),expected).run();
    if(!r.meta.changes)throw new DomainError('Настройки уже изменились. Обновите страницу.',409);
    await this.audit(this.userId,'assistant.settings_updated:'+role).run();
    return {message:'Настройки инициативности сохранены для этой роли.'};
  }
  async requireRole(role: Role) {
    const p = await this.profile();
    if (!p || !JSON.parse(p.roles).includes(role)) throw new DomainError('Заполните профиль и подключите нужную роль.', 403);
    return p;
  }
  audit(entity: string, action: string) { return this.query('INSERT INTO audit_events VALUES (?,?,?,?,?)', id(), this.execution?'system:rental-policy':this.userId, entity, this.execution?JSON.stringify({action,onBehalfOf:this.userId,...this.execution}):action, now()); }
  notify(user: string, body: string, key: string, role:Role) { return this.query('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?)', id(), user, body, role+':'+key, 0, now()); }
  async state() {
    const [profile, properties, ownProperties, bookings, jobs, applications, notifications, messages] = await Promise.all([
      this.profile(),
      this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes,demo_owner,published FROM properties WHERE published=1 AND (demo_owner IS NULL OR demo_owner=?) ORDER BY created_at DESC', this.userId),
      this.all('SELECT * FROM properties WHERE owner_id=? ORDER BY created_at DESC', this.userId),
      this.all(`SELECT b.*,p.title,p.owner_id,p.city,p.district,p.demo_owner,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN p.address ELSE NULL END address,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN o.contact ELSE NULL END owner_contact,
        CASE WHEN p.owner_id=? THEN g.name ELSE NULL END guest_name,
        CASE WHEN p.owner_id=? THEN g.contact ELSE NULL END guest_contact
        FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN profiles o ON o.id=p.owner_id LEFT JOIN profiles g ON g.id=b.guest_id
        WHERE b.guest_id=? OR p.owner_id=? ORDER BY b.start DESC`, ...Array(8).fill(this.userId)),
      this.all(`SELECT j.*,EXISTS(SELECT 1 FROM booking_terms t WHERE t.booking_id=j.booking_id AND t.actual_checkout IS NOT NULL) checkout_confirmed,p.title,p.city,p.district,p.rooms,p.demo_owner,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN p.address ELSE NULL END address,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN o.contact ELSE NULL END owner_contact
        FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN profiles o ON o.id=j.owner_id
        WHERE (j.owner_id=? OR j.assigned_to=? OR (j.status='open' AND j.end>?)) AND (p.demo_owner IS NULL OR p.demo_owner=?) ORDER BY j.start`, this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,now(),this.userId),
      this.all(`SELECT a.*,p.name,p.experience,p.availability,p.districts FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN profiles p ON p.id=a.user_id WHERE a.user_id=? OR j.owner_id=?`, this.userId,this.userId),
      this.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40', this.userId),
      this.all('SELECT * FROM (SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at', this.userId),
    ]);
    const serverTime=now();
    const [policies,operations,terms,changes]=await Promise.all([this.all('SELECT * FROM property_policies'),this.all('SELECT * FROM property_operations'),this.all('SELECT t.* FROM booking_terms t JOIN bookings b ON b.id=t.booking_id JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=?',this.userId,this.userId),this.all('SELECT c.* FROM booking_changes c JOIN bookings b ON b.id=c.booking_id JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=? ORDER BY c.created_at DESC',this.userId,this.userId)]);
    const policyFor=(p:Row)=>policies.find(v=>v.property_id===p.id)||defaultPolicy;
    const state={ profile, properties:await this.enrichProperties(properties.map(p=>({...p,policy:publicPolicy(policyFor(p))}))), ownProperties:await this.enrichProperties(ownProperties.map(p=>({...p,policy:policyFor(p),operation:operations.find(v=>v.property_id===p.id)})),true), bookings:bookings.map(b => ({...b,status:b.status==='requested' && b.expires_at<=serverTime?'expired':b.status,terms:terms.find(t=>t.booking_id===b.id),changes:changes.filter(c=>c.booking_id===b.id).map(c=>({...c,status:c.status==='pending'&&c.expires_at<=serverTime?'expired':c.status})),readiness:operations.find(o=>o.property_id===b.property_id)?.readiness})), jobs:jobs.map((j:Row):Row=>({...j,checkout_confirmed:!j.booking_id||!!j.checkout_confirmed})), applications, notifications, messages, serverTime, integrations:{ai:false,telegram:false,whatsapp:false,payments:false} };
    return {...state,workspaces:Object.fromEntries(roles.map(role=>[role,operationOverview(state,this.userId,role,serverTime)]))};
  }
  async publicCatalog() {
    const properties=await this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes FROM properties WHERE published=1 AND demo_owner IS NULL ORDER BY created_at DESC');
    const policies=await this.all('SELECT * FROM property_policies');
    return {properties:await this.enrichProperties(properties.map(p=>({...p,policy:publicPolicy(policies.find(v=>v.property_id===p.id))})))};
  }
  async publicSearch(filters:Record<string,string>={}){
    const city=String(filters.city||'').trim(),mode=filters.mode||'daily',guests=number(filters.guests||1,'Гости',1,50);
    if(city.length>80||!['daily','hourly'].includes(mode))throw new DomainError('Проверьте город и вид аренды.');
    const catalog=await this.publicCatalog(),cities=[...new Set(catalog.properties.map(p=>String(p.city)))].sort();
    let items=catalog.properties.filter(p=>(!city||p.city.toLocaleLowerCase('ru').includes(city.toLocaleLowerCase('ru')))&&p.capacity>=guests&&(mode!=='hourly'||p.policy.hourly_price>0));
    let range:{start:number;end:number}|null=null;
    if(filters.start||filters.end){
      range=interval(filters.start,filters.end);
      const {start,end}=range;
      const [booked,cleaning]=await Promise.all([
        this.all("SELECT DISTINCT b.property_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?)) AND b.start<?+p.cleaning_minutes*60 AND b.occupied_until>?",now(),end,start),
        this.all("SELECT DISTINCT j.property_id FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status IN ('open','assigned','in_progress','submitted') AND j.start<?+p.cleaning_minutes*60 AND j.end>?",end,start),
      ]);
      const occupied=new Set([...booked,...cleaning].map(p=>p.property_id));
      items=items.filter(p=>!occupied.has(p.id)&&!['maintenance','blocked'].includes(p.display_status.code)&&(start>now()+60||p.display_status.code==='ready'));
      items=items.flatMap(p=>{try{const price=rentalPrice(p.price,p.policy,start,end,mode);return [{...p,estimate:{amount:price.amount,periods:price.periods,rate:price.price,unitLabel:price.unitLabel}}];}catch(error){if(error instanceof DomainError)return [];throw error;}});
    }
    return {properties:items.slice(0,60),total:items.length,cities,filters:{city,mode,guests,...(range?{start:range.start,end:range.end}:{})},availabilityChecked:!!range};
  }
  async publicMedia(mediaId:string){
    const image=await this.one("SELECT m.data,m.width,m.height FROM media m WHERE m.id=? AND m.kind='property' AND EXISTS(SELECT 1 FROM property_details d JOIN properties p ON p.id=d.property_id,json_each(d.photos) f WHERE f.value=m.id AND p.published=1 AND p.demo_owner IS NULL)",required(mediaId,'Фото',100));
    if(!image)throw new DomainError('Фотография недоступна.',404);return image;
  }
  async connectRole(roleValue:unknown,body:Row={}){
    const role=parseRole(roleValue),profile=await this.profile();
    if(!profile)throw new DomainError('Сначала войдите или создайте аккаунт.',403);
    const name=required(role==='guest'?profile.name:body.name??profile.name,'Имя',100),contact=required(role==='guest'?profile.contact:body.contact??profile.contact,'Контакт',120),city=required(role==='guest'?profile.city:body.city??profile.city,'Город',80);
    const districts=String(body.districts??profile.districts??'').trim(),experience=String(body.experience??profile.experience??'').trim(),availability=String(body.availability??profile.availability??'').trim();
    if(role==='cleaner'&&(!districts||!experience||!availability||districts.length>300||experience.length>1000||availability.length>300))throw new DomainError('Для работы на уборках укажите районы, опыт и график.');
    await this.db.batch([
      this.query("UPDATE profiles SET roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(roles) WHERE value='guest') THEN roles ELSE json_insert(roles,'$[#]','guest') END WHERE id=?",this.userId),
      this.query("UPDATE profiles SET name=?,contact=?,city=?,roles=CASE WHEN EXISTS(SELECT 1 FROM json_each(roles) WHERE value=?) THEN roles ELSE json_insert(roles,'$[#]',?) END,districts=CASE WHEN ?='cleaner' THEN ? ELSE districts END,experience=CASE WHEN ?='cleaner' THEN ? ELSE experience END,availability=CASE WHEN ?='cleaner' THEN ? ELSE availability END WHERE id=?",name,contact,city,role,role,role,districts,role,experience,role,availability,this.userId),
      this.query('UPDATE profile_details SET version=version+1,revision=?,updated_at=? WHERE user_id=?',id(),now(),this.userId),
      this.audit(this.userId,'role.connected:'+role),
    ]);
    return {message:'Рабочий профиль подключён.',role,profile:await this.profile()};
  }
  async savePolicy(propertyId:string,body:Row){
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=?',propertyId,this.userId);if(!p)throw new DomainError('Квартира не найдена.',404);
    const current=await this.one('SELECT * FROM property_policies WHERE property_id=?',propertyId),expected=number(body.expectedVersion,'Версия правил',0,1000000);
    if((current?.version||0)!==expected)throw new DomainError('Правила уже изменились. Обновите карточку.',409);
    const policy=policyInput({...body,maxDiscountPercent:body.maxDiscountPercent??current?.max_discount_percent??0,minimumRate:body.minimumRate??current?.minimum_rate??0,repairBudget:body.repairBudget??current?.repair_budget??0,autoExtension:body.autoExtension??!!current?.auto_extension,maxExtensionHours:body.maxExtensionHours??current?.max_extension_hours??0,mandateUntil:body.mandateUntil??(current?.mandate_until?new Date(current.mandate_until*1000).toISOString():''),escalationContact:body.escalationContact??current?.escalation_contact??''}),price=number(body.dailyPrice,'Цена за сутки',100,10000000),revision=id(),keys=Object.keys(policy);
    const result=await this.db.batch([
      this.query(`INSERT INTO property_policies(property_id,${keys.join(',')},version,revision,updated_at) VALUES (?,${keys.map(()=>'?').join(',')},?,?,?) ON CONFLICT(property_id) DO UPDATE SET ${keys.map(k=>`${k}=excluded.${k}`).join(',')},version=excluded.version,revision=excluded.revision,updated_at=excluded.updated_at WHERE property_policies.version=?`,propertyId,...Object.values(policy),expected+1,revision,now(),expected),
      this.query('UPDATE properties SET price=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',price,propertyId,this.userId,propertyId,revision),
      this.query('INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',id(),this.userId,propertyId,JSON.stringify({action:'property.policy_updated',policy,dailyPrice:price,version:expected+1}),now(),propertyId,revision)
    ]);
    if(!result[0].meta.changes)throw new DomainError('Правила уже изменились. Обновите карточку.',409);
    return {message:'Тарифы, правила и полномочия сохранены.',version:expected+1};
  }
  async readinessAction(propertyId:string,body:Row){
    const op=await this.one('SELECT o.* FROM property_operations o JOIN properties p ON p.id=o.property_id WHERE p.id=? AND p.owner_id=?',propertyId,this.userId);if(!op)throw new DomainError('Квартира не найдена.',404);
    const readiness=required(body.readiness,'Состояние',30),note=required(body.note,'Результат проверки или причина',1000);
    if(!['ready','inspection','maintenance','blocked'].includes(readiness))throw new DomainError('Недопустимое состояние.');
    if((readiness==='ready'||readiness==='inspection')&&op.active_booking_id)throw new DomainError('Сначала подтвердите выезд проживающего гостя.',409);
    if(readiness==='ready'&&body.inspected!==true)throw new DomainError('Подтвердите, что уборка и проверка квартиры выполнены.');
    const pending=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND (status IN ('in_progress','submitted') OR (status IN ('open','assigned') AND start<=?))",propertyId,now());
    if(readiness==='ready'&&pending)throw new DomainError('Сначала завершите и примите запланированную уборку.',409);
    const result=await this.db.batch([this.query('UPDATE property_operations SET readiness=?,note=?,version=version+1,updated_at=? WHERE property_id=? AND version=?',readiness,note,now(),propertyId,number(body.expectedVersion,'Версия состояния',1,10000000)),this.audit(propertyId,'property.readiness_requested')]);
    if(!result[0].meta.changes)throw new DomainError('Состояние уже изменилось. Обновите карточку.',409);
    return {message:readiness==='ready'?'Готовность квартиры подтверждена.':'Состояние квартиры сохранено.'};
  }
  async bookingQuote(body:Row) {
    const p=await this.one('SELECT * FROM properties WHERE id=? AND published=1 AND (demo_owner IS NULL OR demo_owner=?)',required(body.propertyId,'Квартира',100),this.userId);
    if(!p) throw new DomainError('Квартира недоступна.',404);
    const {start,end}=interval(body.start,body.end), guests=number(body.guests,'Гости',1,p.capacity), occupiedUntil=end+p.cleaning_minutes*60;
    const policy={...defaultPolicy,...await this.one('SELECT * FROM property_policies WHERE property_id=?',p.id)},op=await this.one('SELECT readiness FROM property_operations WHERE property_id=?',p.id);
    if(op&&(['maintenance','blocked'].includes(op.readiness)||(start<=now()+60&&op.readiness!=='ready')))throw new DomainError('Квартира сейчас не готова к новым заездам.',409);
    const pricing=rentalPrice(p.price,policy,start,end,body.billingMode||'daily');
    const occupied=await this.one("SELECT id FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?",p.id,now(),occupiedUntil,start);
    const cleaning=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",p.id,occupiedUntil,start);
    if(occupied||cleaning) throw new DomainError('Этот интервал уже занят, включая время уборки. Выберите другое время.',409);
    return {propertyId:p.id,title:p.title,start,end,guests,...pricing,cleaningMinutes:p.cleaning_minutes,occupiedUntil,currency:'KZT',quotedAt:now(),policy:publicPolicy(policy)};
  }
  async saveProfile(body: Row) {
    const name=required(body.name,'Имя',100), contact=required(body.contact,'Контакт',120), city=required(body.city,'Город',80);
    const selected=Array.isArray(body.roles)?body.roles.filter((r:Role)=>roles.includes(r)):[];
    if (!selected.length) throw new DomainError('Выберите хотя бы одну роль.');
    const districts=String(body.districts||'').slice(0,300), experience=String(body.experience||'').slice(0,1000), availability=String(body.availability||'').slice(0,300);
    if(selected.includes('cleaner') && (!districts.trim()||!experience.trim()||!availability.trim())) throw new DomainError('Для анкеты исполнителя укажите районы, опыт и график.');
    await this.db.batch([this.query(`INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact=excluded.contact,city=excluded.city,roles=excluded.roles,districts=excluded.districts,experience=excluded.experience,availability=excluded.availability`,this.userId,name,contact,city,JSON.stringify(selected),districts,experience,availability,now()),this.query('UPDATE profile_details SET version=version+1,revision=?,updated_at=? WHERE user_id=?',id(),now(),this.userId),this.audit(this.userId,'profile.updated')]);
    return {message:'Профиль сохранён. Роли подключены.'};
  }
  async createProperty(body:Row) {
    await this.requireRole('owner');
    const propertyId=id();
    await this.db.batch([this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',propertyId,this.userId,null,required(body.title,'Название',120),required(body.city,'Город',80),required(body.district,'Район',120),required(body.address,'Точный адрес',300),required(body.description,'Описание и правила',2500),number(body.price,'Цена за сутки',100,10000000),number(body.rooms,'Комнаты',1,20),number(body.capacity,'Вместимость',1,50),number(body.cleaningMinutes,'Время уборки',30,1440),1,now()),this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?)',propertyId,now()),this.audit(propertyId,'property.created')]);
    return {id:propertyId,message:'Квартира добавлена в каталог. Точный адрес скрыт до подтверждения брони.'};
  }
  async createBooking(body:Row) {
    await this.requireRole('guest');
    const key=required(body.requestKey,'Ключ запроса',100), existing=await this.one('SELECT id FROM bookings WHERE guest_id=? AND request_key=?',this.userId,key);
    if(existing) return {id:existing.id,message:'Эта заявка уже сохранена.'};
    const checked=await this.bookingQuote(body), {start,end,guests,amount}=checked;
    if(body.expectedAmount!==undefined && body.expectedAmount!==amount) throw new DomainError('Стоимость изменилась. Проверьте новый расчёт перед отправкой заявки.',409);
    if(body.expectedPolicyVersion!==undefined&&body.expectedPolicyVersion!==checked.policy.version)throw new DomainError('Условия проживания изменились. Проверьте новый расчёт.',409);
    if(checked.policy.version>0&&body.acceptTerms!==true)throw new DomainError('Подтвердите согласие с показанными правилами проживания.');
    const bookingId=id(), p={id:checked.propertyId,cleaning_minutes:checked.cleaningMinutes};
    const owner=await this.one('SELECT owner_id FROM properties WHERE id=?',p.id);
    await this.db.batch([
      this.query('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',bookingId,p.id,this.userId,start,end,end+p.cleaning_minutes*60,guests,amount,'requested',now()+1800,'unpaid',key,now()),
      this.query('INSERT INTO booking_terms(booking_id,billing_mode,rate,units,amount,deposit,deposit_status,house_rules,policy_version,original_end) VALUES (?,?,?,?,?,?,?,?,?,?)',bookingId,checked.billingMode,checked.price,checked.periods,amount,checked.policy.deposit,checked.policy.deposit?'pending':'not_required',checked.policy.house_rules,checked.policy.version,end),
      this.notify(owner!.owner_id,`Новая заявка на «${checked.title}». Подтвердите её в течение 30 минут.`,`booking:${bookingId}`,'owner'),this.audit(bookingId,'booking.requested')
    ]);
    const policy=await this.one('SELECT * FROM property_policies WHERE property_id=?',p.id);
    if(policy?.auto_confirm&&mandateActive(policy)&&policy.version===checked.policy.version){await new RentalService(this.db,owner!.owner_id,{propertyId:p.id,policyVersion:policy.version}).bookingAction(bookingId,{action:'confirm',cleaningFee:policy.cleaning_fee});return {id:bookingId,amount,message:'Бронь подтверждена автоматически по правилам владельца. Оплата и депозит учитываются отдельно.'};}
    return {id:bookingId,amount,message:'Заявка отправлена. Интервал зарезервирован на 30 минут до решения владельца.'};
  }
  async bookingAction(bookingId:string,body:Row) {
    const b=await this.one('SELECT b.*,p.owner_id,p.cleaning_minutes,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND (b.guest_id=? OR p.owner_id=?)',bookingId,this.userId,this.userId);
    if(!b) throw new DomainError('Бронь не найдена.',404);
    if(this.execution){
      const mandate=await this.one('SELECT * FROM property_policies WHERE property_id=?',b.property_id);
      if(body.action!=='confirm'||this.execution.propertyId!==b.property_id||!mandate?.auto_confirm||!mandateActive(mandate)||mandate.version!==this.execution.policyVersion||body.cleaningFee!==mandate.cleaning_fee||body.cleaningFee>mandate.cleaning_budget)throw new DomainError('Автоматическое действие выходит за полномочия владельца.',403);
    }
    const owner=b.owner_id===this.userId;
    const terms=await this.one('SELECT * FROM booking_terms WHERE booking_id=?',bookingId),op=await this.one('SELECT * FROM property_operations WHERE property_id=?',b.property_id);
    if(body.expectedVersion!==undefined&&body.expectedVersion!==terms?.version)throw new DomainError('Бронь изменилась. Обновите карточку.',409);
    if(body.action==='deposit_received'){
      if(!owner)throw new DomainError('Депозит подтверждает владелец.',403);
      if(b.status!=='confirmed'||!terms?.deposit)throw new DomainError('Для этой брони депозит не ожидается.',409);
      await this.db.batch([this.query("UPDATE booking_terms SET deposit_status='owner_verified',version=version+1 WHERE booking_id=? AND deposit_status='pending'",bookingId),this.audit(bookingId,'deposit.owner_verified')]);return {message:'Владелец подтвердил поступление депозита. Банковская операция не выполнялась.'};
    }
    if(body.action==='report_checkout'){
      if(b.guest_id!==this.userId)throw new DomainError('Сообщить о выезде может гость.',403);
      if(b.status!=='confirmed'||b.start>now())throw new DomainError('Проживание ещё не началось или уже завершено.',409);
      await this.db.batch([this.query('UPDATE booking_terms SET checkout_reported_at=?,version=version+1 WHERE booking_id=? AND checkout_reported_at IS NULL',now(),bookingId),this.notify(b.owner_id,'Гость сообщил о выезде. Проверьте освобождение квартиры.','checkout-reported:'+bookingId,'owner'),this.audit(bookingId,'booking.checkout_reported')]);return {message:'Сообщение о выезде сохранено. Ожидаем подтверждения освобождения квартиры.'};
    }
    if(body.action==='checkin'){
      if(!owner)throw new DomainError('Заселение подтверждает владелец.',403);
      if(terms?.actual_checkin&&!terms.actual_checkout&&op?.active_booking_id===bookingId)return {message:'Заселение уже подтверждено.'};
      if(b.status!=='confirmed'||b.start>now()||b.end<=now()||terms?.actual_checkout)throw new DomainError('Сейчас нельзя подтвердить заселение по этой брони.',409);
      if(b.payment_status!=='owner_verified'||terms?.deposit_status==='pending')throw new DomainError('Сначала проверьте оплату проживания и предусмотренный депозит.',409);
      const result=await this.db.batch([this.query("UPDATE property_operations SET readiness='occupied',active_booking_id=?,version=version+1,updated_at=? WHERE property_id=? AND readiness='ready' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND b.status='confirmed' AND b.start<=? AND b.end>? AND b.payment_status='owner_verified' AND t.deposit_status<>'pending' AND t.actual_checkout IS NULL)",bookingId,now(),b.property_id,bookingId,now(),now()),this.query('UPDATE booking_terms SET actual_checkin=?,version=version+1 WHERE booking_id=? AND actual_checkin IS NULL AND EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)',now(),bookingId,b.property_id,bookingId),this.audit(bookingId,'booking.checkin_requested')]);
      if(!result[0].meta.changes)throw new DomainError('Квартира не готова или в ней ещё проживает другой гость.',409);return {message:'Фактическое заселение подтверждено.'};
    }
    if(body.action==='dispute_checkout'){
      if(!owner)throw new DomainError('Освобождение квартиры проверяет владелец.',403);
      const reason=required(body.reason,'Причина',1000);
      const r=await this.query("UPDATE booking_terms SET checkout_reported_at=NULL,version=version+1 WHERE booking_id=? AND checkout_reported_at IS NOT NULL AND actual_checkout IS NULL AND version=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed')",bookingId,body.expectedVersion??terms?.version,bookingId).run();
      if(!r.meta.changes)throw new DomainError('Сообщение уже рассмотрено. Обновите данные.',409);
      await this.db.batch([this.notify(b.guest_id,'Выезд пока не подтверждён: '+reason,'checkout-disputed:'+bookingId+':'+(terms?.version||0),'guest'),this.audit(bookingId,'booking.checkout_disputed:'+reason)]);
      return {message:'Гостю передана причина. Квартира остаётся занятой до подтверждения выезда.'};
    }
    if(body.action==='checkout'){
      if(!owner)throw new DomainError('Освобождение квартиры подтверждает владелец.',403);
      if(terms?.actual_checkout)return {message:'Выезд уже подтверждён.'};
      if(b.status!=='confirmed'||b.start>now()||(op?.active_booking_id&&op.active_booking_id!==bookingId))throw new DomainError('Сейчас нельзя подтвердить выезд по этой брони.',409);
      const t=now(),result=await this.db.batch([
        this.query("UPDATE bookings SET status='completed' WHERE id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND actual_checkout IS NULL AND version=?)",bookingId,bookingId,body.expectedVersion??terms?.version),
        this.query("UPDATE property_operations SET readiness=CASE WHEN readiness IN ('maintenance','blocked') THEN readiness ELSE 'awaiting_cleaning' END,active_booking_id=NULL,version=version+1,updated_at=? WHERE property_id=? AND (active_booking_id IS NULL OR active_booking_id=?) AND EXISTS(SELECT 1 FROM booking_terms t JOIN bookings b ON b.id=t.booking_id WHERE b.id=? AND b.status='completed' AND t.actual_checkout IS NULL)",t,b.property_id,bookingId,bookingId),
        this.query("UPDATE cleaning_jobs SET start=?,end=? WHERE booking_id=? AND status IN ('open','assigned') AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND actual_checkout IS NULL)",t,t+b.cleaning_minutes*60,bookingId,bookingId),
        this.query('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=? AND actual_checkout IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status=\'completed\')',t,bookingId,bookingId),this.audit(bookingId,'booking.checkout_confirmed')]);
      if(!result[0].meta.changes)throw new DomainError('Выезд уже обрабатывается. Обновите данные.',409);await this.notify(b.guest_id,'Владелец подтвердил освобождение квартиры. Проживание завершено.','checkout-confirmed:'+bookingId,'guest').run();return {message:'Выезд подтверждён. Квартира ожидает уборки и проверки.'};
    }
    if(body.action==='confirm') {
      if(!owner) throw new DomainError('Подтвердить может только владелец.',403);
      const fee=number(body.cleaningFee||0,'Стоимость уборки',0,1000000);
      if(b.status!=='requested'||b.expires_at<=now()) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      const statements=[this.query("UPDATE bookings SET status='confirmed' WHERE id=? AND status='requested' AND expires_at>? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=?)",bookingId,now(),bookingId,terms?.version),this.notify(b.guest_id,`Бронь «${b.title}» подтверждена. Адрес доступен в карточке.`,`confirmed:${bookingId}`,'guest'),this.audit(bookingId,'booking.confirmed')];
      if(fee>0) statements.push(this.query("INSERT OR IGNORE INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) SELECT ?,property_id,?,?,end,occupied_until,?,?,'open',NULL,'[]','',? FROM bookings WHERE id=? AND status='confirmed'",id(),this.userId,bookingId,fee,'Уборка после выезда: сменить бельё, проверить санузел и кухню, вынести мусор.',now(),bookingId));
      const results=await this.db.batch(statements);
      if(!results[0].meta.changes) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
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
      await this.db.batch([this.query("UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('requested','confirmed')",bookingId),this.query("UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned')",bookingId),this.notify(owner?b.guest_id:b.owner_id,`Бронь «${b.title}» отменена. Если была оплата, согласуйте возврат.`,`cancelled:${bookingId}`,owner?'guest':'owner'),this.audit(bookingId,'booking.cancelled')]);
      return {message:'Бронь отменена. Возврат средств, если необходим, согласуется отдельно.'};
    }
    if(body.action==='paid'&&owner) {
      if(b.status!=='confirmed') throw new DomainError('Сначала подтвердите бронь.');
      if(body.expectedAmount!==undefined&&body.expectedAmount!==b.amount)throw new DomainError('Стоимость брони изменилась. Проверьте сумму заново.',409);
      const result=await this.db.batch([this.query("UPDATE bookings SET payment_status='owner_verified' WHERE id=? AND status='confirmed' AND amount=? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=?)",bookingId,b.amount,bookingId,terms?.version),this.query("UPDATE booking_terms SET paid_amount=?,version=version+1 WHERE booking_id=? AND version=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND amount=? AND status='confirmed' AND payment_status='owner_verified')",b.amount,bookingId,terms?.version,bookingId,b.amount),this.query("INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=? AND paid_amount=?)",id(),this.userId,bookingId,'payment.owner_verified',now(),bookingId,terms?.version+1,b.amount)]);
      if(!result[0].meta.changes||!result[1].meta.changes)throw new DomainError('Бронь изменилась. Проверьте сумму оплаты заново.',409);
      await this.notify(b.guest_id,`Владелец отметил оплату брони «${b.title}».`,`paid:${bookingId}:${b.amount}`,'guest').run();
      return {message:'Оплата отмечена как проверенная владельцем.'};
    }
    if(body.action==='issue') {
      const issue=required(body.issue,'Описание проблемы',1500);
      await this.db.batch([this.notify(owner?b.guest_id:b.owner_id,`Обращение по «${b.title}»: ${issue}`,id(),owner?'guest':'owner'),this.audit(bookingId,'booking.issue')]);
      return {message:'Обращение сохранено в уведомлениях получателя. Для срочной связи используйте контакт в брони.'};
    }
    throw new DomainError('Действие недоступно.',403);
  }
  async changeContext(bookingId:string,roleValue:unknown){
    const role=parseRole(roleValue);if(role==='cleaner')throw new DomainError('Изменения проживания доступны гостю и владельцу.',403);await this.requireRole(role);
    const b=await this.one(`SELECT b.*,p.owner_id,p.price,p.cleaning_minutes FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND ${role==='owner'?'p.owner_id':'b.guest_id'}=?`,bookingId,this.userId);
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
    const mode=body.billingMode||terms.billing_mode,pricing=changeRentalPrice(b.price,policy,start,end,mode);
    const discount=number(body.discountPercent??terms.discount_percent??0,'Скидка, %',0,50);
    if(role==='guest'&&discount!==(terms.discount_percent||0))throw new DomainError('Скидку предлагает владелец.',403);
    if(discount>policy.max_discount_percent)throw new DomainError('Скидка превышает установленный владельцем предел.');
    const amount=Math.ceil(pricing.amount*(100-discount)/100);
    if(policy.minimum_rate&&amount<policy.minimum_rate*pricing.periods)throw new DomainError('Стоимость ниже минимальной разрешённой ставки.');
    if(amount<terms.paid_amount)throw new DomainError('Новая сумма меньше подтверждённой оплаты. Сначала согласуйте возврат с владельцем; автоматический возврат не подключён.',409);
    if(start===b.start&&end===b.end&&amount===b.amount&&mode===terms.billing_mode)throw new DomainError('Условия не изменились.');
    const occupiedUntil=end+b.cleaning_minutes*60;
    const occupied=await this.one("SELECT id FROM bookings WHERE property_id=? AND id<>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?",b.property_id,bookingId,t,occupiedUntil,start);
    const cleaning=await this.one("SELECT id FROM cleaning_jobs WHERE property_id=? AND (booking_id IS NULL OR booking_id<>?) AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",b.property_id,bookingId,occupiedUntil,start);
    const started=await this.one("SELECT id FROM cleaning_jobs WHERE booking_id=? AND status IN ('in_progress','submitted','completed')",bookingId);
    if(occupied||cleaning||started)throw new DomainError('Изменение пересекает другую бронь или уборку.',409);
    const op=await this.one('SELECT * FROM property_operations WHERE property_id=?',b.property_id);
    if(op&&['maintenance','blocked'].includes(op.readiness))throw new DomainError('Заезды в квартиру закрыты.',409);
    const automatic=role==='guest'&&!!policy.auto_extension&&mandateActive(policy)&&terms.policy_version===policy.version&&start===b.start&&end>b.end&&end-(terms.original_end||b.end)<=policy.max_extension_hours*3600&&mode===terms.billing_mode&&discount===(terms.discount_percent||0);
    return {bookingId,start,end,occupiedUntil,billingMode:pricing.billingMode,rate:pricing.price,units:pricing.periods,extraHours:pricing.extraHours,extraRate:pricing.extraRate,discountPercent:discount,amount,previousAmount:b.amount,paidAmount:terms.paid_amount,amountDue:Math.max(0,amount-terms.paid_amount),baseVersion:terms.version,policyVersion:policy.version,automatic,cleanerReconfirmation:end!==b.end&&!!await this.one("SELECT id FROM cleaning_jobs WHERE booking_id=? AND assigned_to IS NOT NULL AND status='assigned'",bookingId),currency:'KZT'};
  }
  async proposeBookingChange(bookingId:string,roleValue:unknown,body:Row){
    const role=parseRole(roleValue);await this.changeContext(bookingId,role);
    const key=required(body.requestKey,'Ключ запроса',100),existing=await this.one('SELECT id,booking_id FROM booking_changes WHERE proposed_by=? AND request_key=?',this.userId,key);
    if(existing){if(existing.booking_id!==bookingId)throw new DomainError('Ключ уже использован.',409);return {id:existing.id,message:'Это предложение уже сохранено.'};}
    const q=await this.bookingChangeQuote(bookingId,role,body);
    if(body.expectedAmount!==q.amount||body.baseVersion!==q.baseVersion||body.policyVersion!==q.policyVersion)throw new DomainError('Условия изменились. Повторите расчёт.',409);
    if(body.acceptTerms!==true)throw new DomainError('Подтвердите согласие с рассчитанными условиями.');
    const reason=required(body.reason,'Причина изменения',1000),changeId=id(),{b}=await this.changeContext(bookingId,role);
    await this.db.batch([
      this.query('INSERT INTO booking_changes(id,booking_id,proposed_by,proposer_role,request_key,base_version,policy_version,start,end,occupied_until,billing_mode,rate,units,discount_percent,amount,reason,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',changeId,bookingId,this.userId,role,key,q.baseVersion,q.policyVersion,q.start,q.end,q.occupiedUntil,q.billingMode,q.rate,q.units,q.discountPercent,q.amount,reason,now()+1800,now()),
      this.notify(role==='owner'?b.guest_id:b.owner_id,'Предложено изменение проживания. Проверьте даты и стоимость в брони.','change:'+changeId,role==='owner'?'guest':'owner'),this.audit(bookingId,'booking.change_proposed:'+changeId)
    ]);
    if(q.automatic){try{const result=await new RentalService(this.db,b.owner_id).decideBookingChange(bookingId,changeId,'owner',{action:'accept'},true);return {id:changeId,...result};}catch(error){if(!(error instanceof DomainError))throw error;}}
    return {id:changeId,message:'Предложение сохранено на 30 минут. Текущие даты действуют до согласия второй стороны; новый интервал пока не зарезервирован.'};
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
    const q=await new RentalService(this.db,c.proposed_by).bookingChangeQuote(bookingId,c.proposer_role,{start:new Date(c.start*1000).toISOString(),end:new Date(c.end*1000).toISOString(),billingMode:c.billing_mode,discountPercent:c.discount_percent});
    if(q.amount!==c.amount||q.baseVersion!==c.base_version||q.policyVersion!==c.policy_version)throw new DomainError('Стоимость изменилась. Нужен новый расчёт.',409);
    if(automatic&&(!q.automatic||role!=='owner'))throw new DomainError('Автоматическое изменение выходит за полномочия владельца.',403);
    const job=await this.one("SELECT * FROM cleaning_jobs WHERE booking_id=? AND status IN ('open','assigned')",bookingId),movesCleaning=b.end!==c.end;
    const gate="EXISTS(SELECT 1 FROM booking_changes c JOIN booking_terms t ON t.booking_id=c.booking_id WHERE c.id=? AND c.status='accepted' AND t.version=c.base_version)";
    const statements=[
      this.query("UPDATE booking_changes SET status='accepted',decided_at=? WHERE id=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND version=? AND actual_checkout IS NULL AND checkout_reported_at IS NULL AND paid_amount<=?) AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND version=? AND (?=0 OR mandate_until=0 OR mandate_until>?)) AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed')",now(),changeId,now(),bookingId,c.base_version,c.amount,b.property_id,c.policy_version,automatic?1:0,now(),bookingId),
      this.query(`UPDATE bookings SET start=?,end=?,occupied_until=?,amount=?,payment_status=CASE WHEN ?>=(SELECT paid_amount FROM booking_terms WHERE booking_id=?) AND ?>(SELECT paid_amount FROM booking_terms WHERE booking_id=?) THEN 'unpaid' ELSE payment_status END WHERE id=? AND ${gate}`,c.start,c.end,c.occupied_until,c.amount,c.amount,bookingId,c.amount,bookingId,bookingId,changeId)
    ];
    if(job&&movesCleaning){
      statements.push(this.query(`UPDATE cleaning_jobs SET start=?,end=?,assigned_to=NULL,status='open' WHERE id=? AND status IN ('open','assigned') AND ${gate}`,c.end,c.occupied_until,job.id,changeId),this.query(`UPDATE applications SET status='rejected' WHERE job_id=? AND ${gate}`,job.id,changeId));
      if(job.assigned_to)statements.push(this.query(`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE ${gate}`,id(),job.assigned_to,'Время уборки изменилось. Назначение снято: проверьте новое время и откликнитесь повторно.','cleaner:reschedule:'+changeId,0,now(),changeId));
    }
    statements.push(
      this.query(`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${gate}`,id(),automatic?'system:rental-policy':this.userId,bookingId,JSON.stringify({action:'booking.change_accepted',changeId,onBehalfOf:automatic?b.owner_id:null,policyVersion:policy.version,pricing:{rate:q.rate,units:q.units,extraHours:q.extraHours,extraRate:q.extraRate,discountPercent:q.discountPercent,amount:q.amount}}),now(),changeId),
      this.query(`UPDATE booking_terms SET amount=?,rate=?,units=?,billing_mode=?,discount_percent=?,version=version+1 WHERE booking_id=? AND ${gate}`,c.amount,c.rate,c.units,c.billing_mode,c.discount_percent,bookingId,changeId)
    );
    const result=await this.db.batch(statements);if(!result[0].meta.changes||!result[1].meta.changes)throw new DomainError('Предложение уже изменилось. Обновите данные.',409);
    await this.db.batch([this.notify(b.guest_id,'Изменение проживания согласовано. Проверьте новые даты и остаток к оплате.','change-accepted:'+changeId,'guest'),this.notify(b.owner_id,'Календарь обновлён по согласованному изменению проживания.'+(job&&movesCleaning?' Исполнителя уборки нужно согласовать заново.':''),'change-accepted:'+changeId,'owner')]);
    return {id:changeId,message:automatic?'Продление применено автоматически в пределах полномочий владельца. Доплата учитывается отдельно.':'Изменение согласовано и применено. Проверьте остаток к оплате.'};
  }
  async createJob(body:Row) {
    await this.requireRole('owner');
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Квартира',100),this.userId);
    if(!p) throw new DomainError('Выберите свою квартиру.',403);
    const {start,end}=interval(body.start,body.end), jobId=id();
    await this.db.batch([this.query('INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',jobId,p.id,this.userId,null,start,end,number(body.fee,'Вознаграждение',100,1000000),required(body.description,'Условия',2000),'open',null,'[]','',now()),this.audit(jobId,'job.created')]);
    return {id:jobId,message:'Задание опубликовано. Исполнители могут откликаться.'};
  }
  async jobAction(jobId:string,body:Row) {
    const j=await this.one('SELECT j.*,p.demo_owner,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=? AND (p.demo_owner IS NULL OR p.demo_owner=?)',jobId,this.userId);
    if(!j) throw new DomainError('Задание не найдено.',404);
    if(body.expectedVersion!==undefined&&body.expectedVersion!==j.version)throw new DomainError('Задание изменилось. Обновите карточку перед решением.',409);
    if(body.action==='apply') {
      await this.requireRole('cleaner');
      if((await this.profile())?.work_status==='away')throw new DomainError('В профиле выключен приём заданий. Включите его перед откликом.',409);
      if(j.status!=='open'||j.end<=now()) throw new DomainError('Задание уже недоступно.',409);
      const results=await this.db.batch([this.query("INSERT INTO applications SELECT ?,id,?,'pending',? FROM cleaning_jobs WHERE id=? AND status='open' AND end>? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND work_status='away') ON CONFLICT(job_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at WHERE applications.status='rejected'",id(),this.userId,now(),jobId,now(),this.userId),this.notify(j.owner_id,'Новый отклик на уборку. Посмотрите анкету исполнителя.','application:'+jobId+':'+this.userId+':'+j.start,'owner'),this.audit(jobId,'job.application')]);
      if(!results[0].meta.changes && !await this.one('SELECT id FROM applications WHERE job_id=? AND user_id=?',jobId,this.userId)) throw new DomainError('Задание больше недоступно.',409);
      return {message:'Отклик отправлен. Назначение появится после подтверждения заказчиком.'};
    }
    if(body.action==='reject_application'&&j.owner_id===this.userId){
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a)throw new DomainError('Отклик уже рассмотрен.',409);
      const r=await this.query("UPDATE applications SET status='rejected' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=? AND end>?)",a.id,jobId,j.version,now()).run();
      if(!r.meta.changes)throw new DomainError('Условия задания изменились. Обновите карточку.',409);
      await this.db.batch([this.notify(a.user_id,'Ваш отклик на уборку «'+(j.title||'квартира')+'» отклонён.','application-rejected:'+a.id+':'+a.created_at,'cleaner'),this.audit(jobId,'job.application_rejected:'+a.id)]);
      return {message:'Отклик отклонён. Исполнитель уведомлён в приложении.'};
    }
    if(body.action==='assign' && j.owner_id===this.userId) {
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a) throw new DomainError('Отклик недоступен.',409);
      if((await this.one('SELECT work_status FROM profile_details WHERE user_id=?',a.user_id))?.work_status==='away')throw new DomainError('Исполнитель сейчас не принимает новые задания.',409);
      const results=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=? AND status='open' AND end>? AND version=? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND work_status='away')",a.user_id,jobId,now(),j.version,a.user_id),
        this.query("UPDATE applications SET status=CASE WHEN user_id=(SELECT assigned_to FROM cleaning_jobs WHERE id=?) THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND (SELECT status FROM cleaning_jobs WHERE id=?)='assigned'",jobId,jobId,jobId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,?,?,0,? FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned'",id(),'Вас назначили на уборку. Адрес и контакт заказчика доступны в задании.','cleaner:assigned:'+jobId+':'+a.user_id+':'+j.start,now(),jobId,a.user_id),this.audit(jobId,'job.assigned')
      ]);
      if(!results[0].meta.changes) throw new DomainError('Исполнитель уже назначен или задание истекло.',409);
      return {message:'Исполнитель назначен.'};
    }
    if(body.action==='start' && j.assigned_to===this.userId) {
      if(j.start>now()+3600) throw new DomainError('Начать работу можно не раньше чем за час до задания.');
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND assigned_to=? AND status='assigned' AND version=?",jobId,this.userId,j.version),this.query("UPDATE property_operations SET readiness='cleaning',version=version+1,updated_at=? WHERE property_id=? AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='in_progress')",now(),j.property_id,jobId),this.audit(jobId,'job.start_requested')]);
      if(!r[0].meta.changes) throw new DomainError('Статус задания изменился.',409);return {message:'Начало работы отмечено.'};
    }
    if(body.action==='submit' && j.assigned_to===this.userId) {
      const checklist=Array.isArray(body.checklist)?body.checklist:[];
      if(checklist.length!==4||checklist.some((v:any)=>v!==true)) throw new DomainError('Подтвердите все пункты чек-листа.');
      const report=required(body.report,'Отчёт о работе',1500);
      if(j.status!=='in_progress')throw new DomainError('Сначала отметьте начало работы.',409);
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='submitted',checklist=?,report=? WHERE id=? AND assigned_to=? AND status='in_progress' AND version=?",JSON.stringify(checklist),report,jobId,this.userId,j.version),this.query("UPDATE property_operations SET readiness='inspection',version=version+1,updated_at=? WHERE property_id=? AND readiness='cleaning' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='submitted')",now(),j.property_id,jobId),this.notify(j.owner_id,'Уборка отправлена на проверку. Прочитайте отчёт и примите работу.','submitted:'+jobId+':'+j.version,'owner'),this.audit(jobId,'job.submitted')]);
      if(!r[0].meta.changes) throw new DomainError('Статус задания изменился.',409);
      return {message:'Отчёт отправлен заказчику на проверку.'};
    }
    if(body.action==='revise'&&j.owner_id===this.userId){
      const reason=required(body.reason,'Что нужно доработать',1000);
      const r=await this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND status='submitted' AND version=?",jobId,j.version).run();
      if(!r.meta.changes)throw new DomainError('Отчёт уже рассмотрен. Обновите карточку.',409);
      await this.db.batch([this.query("UPDATE property_operations SET readiness='cleaning',version=version+1,updated_at=? WHERE property_id=? AND active_booking_id IS NULL AND readiness='inspection' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='in_progress' AND version=?)",now(),j.property_id,jobId,j.version+1),this.notify(j.assigned_to,'Доработайте уборку: '+reason,'revision:'+jobId+':'+j.version,'cleaner'),this.audit(jobId,'job.revision_requested:'+reason)]);
      return {message:'Отчёт возвращён на доработку. Квартира не отмечена готовой.'};
    }
    if(body.action==='approve' && j.owner_id===this.userId) {
      const r=await this.db.batch([this.query("UPDATE cleaning_jobs SET status='completed' WHERE id=? AND status='submitted' AND version=?",jobId,j.version),this.query("UPDATE property_operations SET readiness='ready',version=version+1,updated_at=? WHERE property_id=? AND readiness='inspection' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND (status IN ('in_progress','submitted') OR (status IN ('open','assigned') AND start<=?)))",now(),j.property_id,jobId,j.property_id,now()),this.notify(j.assigned_to,'Заказчик принял уборку. Расчёт производится с заказчиком отдельно.','approved:'+jobId,'cleaner'),this.audit(jobId,'job.completed')]);
      if(!r[0].meta.changes) throw new DomainError('Нет отчёта для приёмки.',409);
      return {message:'Работа принята. Денежные расчёты выполняются отдельно.'};
    }
    if(body.action==='cancel'&&j.owner_id===this.userId){const reason=required(body.reason,'Причина отмены',1000);const r=await this.query("UPDATE cleaning_jobs SET status='cancelled' WHERE id=? AND status IN ('open','assigned')",jobId).run();if(!r.meta.changes)throw new DomainError('Начатую работу нельзя отменить этим действием.',409);await this.audit(jobId,'job.cancelled:'+reason).run();return {message:'Задание отменено. Готовность квартиры нужно проверить отдельно.'};}
    if(body.action==='issue' && (j.owner_id===this.userId||j.assigned_to===this.userId)) {
      await this.db.batch([this.notify(j.owner_id===this.userId?j.assigned_to:j.owner_id,'Проблема по уборке: '+required(body.issue,'Описание',1500),id(),j.owner_id===this.userId?'cleaner':'owner'),this.audit(jobId,'job.issue')]);
      return {message:'Обращение записано в уведомлениях. Статус работы не изменён.'};
    }
    throw new DomainError('Нет доступа к этому действию.',403);
  }
  async chat(body:Row,config:AIConfig={}) {
    const text=required(body.text,'Сообщение',2000), role=await this.authorizeWorkspace(body.role,'chat');
    const reply=assistantReply(text,role,!!await this.profile()), ts=Date.now();
    let mode='scenario',errorCode:string|undefined;
    if(body.aiConsent===true&&config.OPENAI_API_KEY&&config.OPENAI_MODEL){
      const history=await this.all('SELECT sender,body FROM (SELECT sender,body,created_at FROM messages WHERE user_id=? AND scope=? ORDER BY created_at DESC LIMIT 8) ORDER BY created_at',this.userId,role);
      const context=assistantContext(await this.roleState(role),role);
      const generated=await generateAnswer(config,text,role,history as {sender:string;body:string}[],reply.text,context);
      reply.text=generated.text;
      mode=generated.mode;errorCode=generated.errorCode;
    }
    await this.db.batch([
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',id(),this.userId,role,'user',text,ts),
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',id(),this.userId,role,'assistant',reply.text,ts+1)
    ]);
    return {...reply,mode,...(errorCode?{errorCode}:{})};
  }
  async demo() {
    const existing=await this.one('SELECT id FROM properties WHERE demo_owner=? LIMIT 1',this.userId);
    if(existing) return {message:'Учебные данные уже добавлены. Они видны только вам.'};
    const p1=id(),p2=id(),job=id(), t=now(), tomorrow=Math.ceil((t+86400)/3600)*3600;
    const statements=[
      this.query('INSERT OR IGNORE INTO profiles VALUES (?,?,?,?,?,?,?,?,?)',this.userId,'Тестовый пользователь','Тестовый контакт','Павлодар',JSON.stringify(roles),'Центр, Набережная','Учебная анкета','По согласованию',t),
      this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p1,this.userId,this.userId,'Светлая квартира у набережной','Павлодар','Набережная','Учебный адрес, квартира 12','Демонстрационный объект. Одна спальня, кухня, Wi-Fi. Без курения. Реальное заселение невозможно.',18500,2,4,90,1,t),
      this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p2,this.userId,this.userId,'Уютная студия в центре','Павлодар','Центр','Учебный адрес, квартира 24','Демонстрационный объект. Студия для двоих с рабочим местом. Реальное заселение невозможно.',14000,1,2,60,1,t+1),
      this.query('INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',job,p1,this.userId,null,tomorrow,tomorrow+5400,4500,'Учебное задание: уборка после выезда, смена белья. Средства на объекте.','open',null,'[]','',t),
      this.audit(p1,'demo.created')
    ];
    statements.push(this.query('INSERT INTO property_operations(property_id,updated_at) VALUES (?,?),(?,?)',p1,t,p2,t));
    await this.db.batch(statements);
    return {message:'Добавлены учебные квартиры и уборка. Данные изолированы от других пользователей.'};
  }
  async maintenance() {
    await this.query("UPDATE bookings SET status='expired' WHERE status='requested' AND expires_at<=?",now()).run();
    const overdue=await this.all("SELECT id,owner_id,assigned_to FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress') AND end<?",now());
    if(overdue.length) await this.db.batch(overdue.map(j=>this.notify(j.owner_id,'Срок уборки истёк. Проверьте выполнение и при необходимости найдите замену.','overdue:'+j.id,'owner')));
    return {message:'Сроки проверены.', overdue:overdue.length};
  }
}
