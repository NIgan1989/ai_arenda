import { DomainError, required, number, interval, quote, roles, assistantReply, type Role } from './domain';
import { generateAnswer, type AIConfig } from './ai';

type Row = Record<string, any>;
const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
export class RentalService {
  constructor(public db: D1Database, public userId: string) {}
  query(sql: string, ...args: any[]) { return this.db.prepare(sql).bind(...args); }
  async one(sql: string, ...args: any[]) { return this.query(sql, ...args).first<Row>(); }
  async all(sql: string, ...args: any[]) { return (await this.query(sql, ...args).all<Row>()).results; }
  async profile() { return this.one('SELECT * FROM profiles WHERE id=?', this.userId); }
  async requireRole(role: Role) {
    const p = await this.profile();
    if (!p || !JSON.parse(p.roles).includes(role)) throw new DomainError('Заполните профиль и подключите нужную роль.', 403);
    return p;
  }
  audit(entity: string, action: string) { return this.query('INSERT INTO audit_events VALUES (?,?,?,?,?)', id(), this.userId, entity, action, now()); }
  notify(user: string, body: string, key: string) { return this.query('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?,?,?)', id(), user, body, key, 0, now()); }
  broadcastJob(jobId:string){return this.query(`INSERT OR IGNORE INTO notifications SELECT ?||c.id,c.id,'Доступна уборка: '||p.title||', '||p.district||'. Откройте задания, чтобы посмотреть условия.','job-open:'||j.id||':'||c.id,0,? FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id JOIN profiles c ON lower(trim(c.city))=lower(trim(p.city)) WHERE j.id=? AND j.status='open' AND instr(c.roles,'"cleaner"')>0 AND c.id<>j.owner_id AND (p.demo_owner IS NULL OR p.demo_owner=c.id)`,id()+':',now(),jobId);}
  async state() {
    const [profile, properties, ownProperties, bookings, jobs, applications, notifications, messages, settings, activity] = await Promise.all([
      this.profile(),
      this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes,property_type,rate_unit,demo_owner FROM properties WHERE published=1 AND (demo_owner IS NULL OR demo_owner=?) ORDER BY created_at DESC', this.userId),
      this.all('SELECT * FROM properties WHERE owner_id=? ORDER BY created_at DESC', this.userId),
      this.all(`SELECT b.*,p.title,p.owner_id,p.city,p.district,p.demo_owner,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN p.address ELSE NULL END address,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN o.contact ELSE NULL END owner_contact,
        CASE WHEN p.owner_id=? THEN g.name ELSE NULL END guest_name,
        CASE WHEN p.owner_id=? THEN g.contact ELSE NULL END guest_contact
        FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN profiles o ON o.id=p.owner_id LEFT JOIN profiles g ON g.id=b.guest_id
        WHERE b.guest_id=? OR p.owner_id=? ORDER BY b.start DESC`, ...Array(8).fill(this.userId)),
      this.all(`SELECT j.*,p.title,p.city,p.district,p.rooms,p.demo_owner,
        CASE WHEN j.owner_id=? OR (j.assigned_to=? AND j.status<>'cancelled') THEN p.address ELSE NULL END address,
        CASE WHEN j.owner_id=? OR (j.assigned_to=? AND j.status<>'cancelled') THEN o.contact ELSE NULL END owner_contact
        FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN profiles o ON o.id=j.owner_id
        WHERE (j.owner_id=? OR j.assigned_to=? OR (j.status='open' AND j.end>?)) AND (p.demo_owner IS NULL OR p.demo_owner=?) ORDER BY j.start`, this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,now(),this.userId),
      this.all(`SELECT a.*,p.name,p.experience,p.availability,p.districts FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN profiles p ON p.id=a.user_id WHERE a.user_id=? OR j.owner_id=?`, this.userId,this.userId),
      this.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40', this.userId),
      this.all('SELECT * FROM (SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at', this.userId),
      this.one('SELECT * FROM account_settings WHERE user_id=?',this.userId),
      this.all(`SELECT DISTINCT a.id,a.action,a.entity_id,a.created_at FROM audit_events a WHERE a.actor_id=? OR a.entity_id IN (SELECT b.id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? OR p.owner_id=?) OR a.entity_id IN (SELECT id FROM cleaning_jobs WHERE owner_id=? OR assigned_to=?) ORDER BY a.created_at DESC LIMIT 30`,...Array(5).fill(this.userId)),
    ]);
    const activeRole=settings?.active_role||(profile?JSON.parse(profile.roles)[0]:'guest');
    return { profile, settings:settings||{active_role:profile?JSON.parse(profile.roles)[0]:'guest',auto_confirm:0,auto_assign:0,cleaning_fee:4000}, activity, properties:activeRole==='guest'?properties:[], ownProperties:activeRole==='owner'?ownProperties:[], bookings:bookings.filter(b=>activeRole==='owner'?b.owner_id===this.userId:activeRole==='guest'?b.guest_id===this.userId:false).map(b => ({...b,status:b.status==='requested' && b.expires_at<=now()?'expired':b.status})), jobs:activeRole==='cleaner'?jobs.filter(j=>j.assigned_to===this.userId||(j.status==='open'&&j.city.toLowerCase()===profile?.city.toLowerCase())):jobs.filter(j=>j.owner_id===this.userId), applications:activeRole==='cleaner'?applications.filter(a=>a.user_id===this.userId):activeRole==='owner'?applications:[], notifications, messages:messages.filter(m=>m.scope===activeRole), serverTime:now(), integrations:{ai:false,telegram:false,whatsapp:false,payments:false} };
  }
  async saveProfile(body: Row) {
    const name=required(body.name,'Имя',100), contact=required(body.contact,'Контакт',120), city=required(body.city,'Город',80);
    const selected=Array.isArray(body.roles)?body.roles.filter((r:Role)=>roles.includes(r)):[];
    if (!selected.length) throw new DomainError('Выберите хотя бы одну роль.');
    const districts=String(body.districts||'').slice(0,300), experience=String(body.experience||'').slice(0,1000), availability=String(body.availability||'').slice(0,300);
    if(selected.includes('cleaner') && (!districts.trim()||!experience.trim()||!availability.trim())) throw new DomainError('Для анкеты исполнителя укажите районы, опыт и график.');
    await this.db.batch([this.query(`INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact=excluded.contact,city=excluded.city,roles=excluded.roles,districts=excluded.districts,experience=excluded.experience,availability=excluded.availability`,this.userId,name,contact,city,JSON.stringify(selected),districts,experience,availability,now()),this.audit(this.userId,'profile.updated')]);
    return {message:'Профиль сохранён. Роли подключены.'};
  }
  async createProperty(body:Row) {
    await this.requireRole('owner');
    const propertyId=id(),propertyType=body.propertyType||'apartment',rateUnit=body.rateUnit||'day';
    if(!['apartment','hostel','hotel','house','other'].includes(propertyType)||!['hour','day'].includes(rateUnit))throw new DomainError('Проверьте тип объекта и тариф.');
    await this.db.batch([this.query('INSERT INTO properties (id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at,property_type,rate_unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',propertyId,this.userId,null,required(body.title,'Название',120),required(body.city,'Город',80),required(body.district,'Район',120),required(body.address,'Точный адрес',300),required(body.description,'Описание и правила',2500),number(body.price,'Цена за сутки',100,10000000),number(body.rooms,'Комнаты',1,20),number(body.capacity,'Вместимость',1,50),number(body.cleaningMinutes,'Время уборки',30,1440),1,now(),propertyType,rateUnit),this.audit(propertyId,'property.created')]);
    return {id:propertyId,message:'Квартира добавлена в каталог. Точный адрес скрыт до подтверждения брони.'};
  }
  async updateProperty(propertyId:string, body:Row) {
    await this.requireRole('owner');
    const property=await this.one('SELECT * FROM properties WHERE id=?',propertyId);
    if(!property || property.owner_id!==this.userId) throw new DomainError('Квартира не найдена или недоступна.',404);
    if(body.action==='visibility') {
      if(typeof body.published!=='boolean') throw new DomainError('Укажите видимость квартиры.');
      await this.db.batch([this.query('UPDATE properties SET published=? WHERE id=?',body.published?1:0,propertyId),this.audit(propertyId,body.published?'property.published':'property.hidden')]);
      return {message:body.published?'Квартира возвращена в каталог.':'Квартира скрыта из каталога. Текущие брони и уборки сохранены.'};
    }
    if(body.action!=='update') throw new DomainError('Неизвестное действие с квартирой.');
    const propertyType=body.propertyType||property.property_type,rateUnit=body.rateUnit||property.rate_unit;
    if(!['apartment','hostel','hotel','house','other'].includes(propertyType)||!['hour','day'].includes(rateUnit))throw new DomainError('Проверьте тип объекта и тариф.');
    const values=[required(body.title,'Название',120),required(body.city,'Город',80),required(body.district,'Район',120),required(body.address,'Точный адрес',300),required(body.description,'Описание и правила',2500),number(body.price,'Цена за сутки',100,10000000),number(body.rooms,'Комнаты',1,20),number(body.capacity,'Вместимость',1,50),number(body.cleaningMinutes,'Время уборки',30,1440)];
    // Reservations and cleaning jobs retain the timing agreed when they were created.
    if(values[8]!==property.cleaning_minutes) {
      const active=await this.one(`SELECT id FROM bookings WHERE property_id=? AND occupied_until>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) LIMIT 1`,propertyId,now(),now());
      if(active) throw new DomainError('Время уборки нельзя изменить при активных бронях. Остальные сведения можно сохранить с прежним временем уборки.',409);
    }
    await this.db.batch([this.query('UPDATE properties SET title=?,city=?,district=?,address=?,description=?,price=?,rooms=?,capacity=?,cleaning_minutes=?,property_type=?,rate_unit=? WHERE id=?',...values,propertyType,rateUnit,propertyId),this.audit(propertyId,'property.updated')]);
    return {message:'Изменения квартиры сохранены. Стоимость существующих броней не изменена.'};
  }
  async createBooking(body:Row) {
    await this.requireRole('guest');
    const key=required(body.requestKey,'Ключ запроса',100), existing=await this.one('SELECT id FROM bookings WHERE guest_id=? AND request_key=?',this.userId,key);
    if(existing) return {id:existing.id,message:'Эта заявка уже сохранена.'};
    const p=await this.one('SELECT * FROM properties WHERE id=? AND published=1 AND (demo_owner IS NULL OR demo_owner=?)',required(body.propertyId,'Квартира',100),this.userId);
    if(!p) throw new DomainError('Квартира недоступна.',404);
    const {start,end}=interval(body.start,body.end), guests=number(body.guests,'Гости',1,p.capacity);
    if(p.owner_id===this.userId&&!p.demo_owner)throw new DomainError('Нельзя бронировать собственный объект.');
    const bookingId=id(), amount=quote(p.price,start,end,p.rate_unit);
    await this.db.batch([
      this.query('INSERT INTO bookings (id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at,rate_unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',bookingId,p.id,this.userId,start,end,end+p.cleaning_minutes*60,guests,amount,'requested',now()+1800,'unpaid',key,now(),p.rate_unit),
      this.notify(p.owner_id,`Новая заявка на «${p.title}». Подтвердите её в течение 30 минут.`,`booking:${bookingId}`),this.audit(bookingId,'booking.requested')
    ]);
    const policy=await this.one('SELECT * FROM account_settings WHERE user_id=?',p.owner_id);
    if(policy?.auto_confirm){await new RentalService(this.db,p.owner_id).bookingAction(bookingId,{action:'confirm',cleaningFee:policy.cleaning_fee});await this.audit(bookingId,'assistant.booking_confirmed').run();return {id:bookingId,amount,message:'Бронь автоматически подтверждена по правилам владельца. Адрес доступен в бронировании.'};}
    return {id:bookingId,amount,message:'Заявка отправлена. Интервал зарезервирован на 30 минут до решения владельца.'};
  }
  async bookingAction(bookingId:string,body:Row) {
    const b=await this.one('SELECT b.*,p.owner_id,p.cleaning_minutes,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND (b.guest_id=? OR p.owner_id=?)',bookingId,this.userId,this.userId);
    if(!b) throw new DomainError('Бронь не найдена.',404);
    const owner=b.owner_id===this.userId;
    if(body.action==='confirm') {
      if(!owner) throw new DomainError('Подтвердить может только владелец.',403);
      const fee=number(body.cleaningFee||0,'Стоимость уборки',0,1000000);
      if(b.status!=='requested'||b.expires_at<=now()) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      const statements=[this.query("UPDATE bookings SET status='confirmed' WHERE id=? AND status='requested' AND expires_at>?",bookingId,now()),this.notify(b.guest_id,`Бронь «${b.title}» подтверждена. Адрес доступен в карточке.`,`confirmed:${bookingId}`),this.audit(bookingId,'booking.confirmed'),this.notify(this.userId,`Бронь «${b.title}» подтверждена. Проверьте заезд и подготовку объекта.`,'owner-confirmed:'+bookingId)];
      if(fee>0) statements.push(this.query("INSERT OR IGNORE INTO cleaning_jobs SELECT ?,property_id,?,?,end,occupied_until,?,?,'open',NULL,'[]','',? FROM bookings WHERE id=? AND status='confirmed'",id(),this.userId,bookingId,fee,'Уборка после выезда: сменить бельё, проверить санузел и кухню, вынести мусор.',now(),bookingId));
      if(fee>0)statements.push(this.query(`INSERT OR IGNORE INTO notifications SELECT ?||c.id,c.id,'Доступна уборка после выезда. Откройте задания для просмотра условий.','job-open:'||j.id||':'||c.id,0,? FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id JOIN profiles c ON lower(trim(c.city))=lower(trim(p.city)) WHERE j.booking_id=? AND j.status='open' AND instr(c.roles,'"cleaner"')>0 AND c.id<>j.owner_id AND (p.demo_owner IS NULL OR p.demo_owner=c.id)`,id()+':',now(),bookingId));
      const results=await this.db.batch(statements);
      if(!results[0].meta.changes) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      return {message:fee>0?'Бронь подтверждена, задание на уборку опубликовано.':'Бронь подтверждена.'};
    }
    if(body.action==='cancel') {
      if(!['requested','confirmed'].includes(b.status))throw new DomainError('Эта бронь больше не может быть отменена.',409);
      if(await this.one("SELECT id FROM cleaning_jobs WHERE booking_id=? AND status IN ('in_progress','submitted')",bookingId))throw new DomainError('Работа по уборке уже начата. Сначала согласуйте ситуацию через обращение.',409);
      await this.db.batch([this.query(`INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,'Связанная бронь отменена. Назначенная уборка отменена.','job-cancelled:'||id||':'||assigned_to,0,? FROM cleaning_jobs WHERE booking_id=? AND assigned_to IS NOT NULL AND status='assigned'`,id(),now(),bookingId),this.query("UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('requested','confirmed')",bookingId),this.query("UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned')",bookingId),this.notify(owner?b.guest_id:b.owner_id,`Бронь «${b.title}» отменена. Если была оплата, согласуйте возврат.`,`cancelled:${bookingId}`),this.audit(bookingId,'booking.cancelled')]);
      return {message:'Бронь отменена. Возврат средств, если необходим, согласуется отдельно.'};
    }
    if(body.action==='paid'&&owner) {
      if(b.status!=='confirmed') throw new DomainError('Сначала подтвердите бронь.');
      await this.db.batch([this.query("UPDATE bookings SET payment_status='owner_verified' WHERE id=?",bookingId),this.notify(b.guest_id,`Владелец отметил оплату брони «${b.title}».`,`paid:${bookingId}`),this.audit(bookingId,'payment.owner_verified')]);
      return {message:'Оплата отмечена как проверенная владельцем.'};
    }
    if(body.action==='issue') {
      const issue=required(body.issue,'Описание проблемы',1500);
      await this.db.batch([this.notify(owner?b.guest_id:b.owner_id,`Обращение по «${b.title}»: ${issue}`,id()),this.audit(bookingId,'booking.issue')]);
      return {message:'Обращение сохранено в уведомлениях получателя. Для срочной связи используйте контакт в брони.'};
    }
    throw new DomainError('Действие недоступно.',403);
  }
  async createJob(body:Row) {
    await this.requireRole('owner');
    const p=await this.one('SELECT * FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Квартира',100),this.userId);
    if(!p) throw new DomainError('Выберите свою квартиру.',403);
    const {start,end}=interval(body.start,body.end), jobId=id();
    await this.db.batch([this.query('INSERT INTO cleaning_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',jobId,p.id,this.userId,null,start,end,number(body.fee,'Вознаграждение',100,1000000),required(body.description,'Условия',2000),'open',null,'[]','',now()),this.audit(jobId,'job.created'),this.broadcastJob(jobId)]);
    return {id:jobId,message:'Задание опубликовано. Исполнители могут откликаться.'};
  }
  async jobAction(jobId:string,body:Row) {
    const j=await this.one('SELECT j.*,p.demo_owner,p.city FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=? AND (p.demo_owner IS NULL OR p.demo_owner=?)',jobId,this.userId);
    if(!j) throw new DomainError('Задание не найдено.',404);
    if(body.action==='apply') {
      const cleaner=await this.requireRole('cleaner');
      const property=await this.one('SELECT city FROM properties WHERE id=?',j.property_id);
      if(cleaner.city.toLowerCase()!==property?.city.toLowerCase())throw new DomainError('Задание находится в другом городе. Измените город в анкете, если готовы работать там.');
      if(j.status!=='open'||j.end<=now()) throw new DomainError('Задание уже недоступно.',409);
      const results=await this.db.batch([this.query("INSERT INTO applications SELECT ?,id,?,'pending',? FROM cleaning_jobs WHERE id=? AND status='open' AND end>? ON CONFLICT(job_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at WHERE applications.status IN ('rejected','withdrawn')",id(),this.userId,now(),jobId,now()),this.notify(j.owner_id,'Новый отклик на уборку. Посмотрите анкету исполнителя.','application:'+jobId+':'+this.userId),this.audit(jobId,'job.application')]);
      if(!results[0].meta.changes && !await this.one('SELECT id FROM applications WHERE job_id=? AND user_id=?',jobId,this.userId)) throw new DomainError('Задание больше недоступно.',409);
      const policy=await this.one('SELECT * FROM account_settings WHERE user_id=?',j.owner_id);
      if(policy?.auto_assign){
        const application=await this.one("SELECT id FROM applications WHERE job_id=? AND user_id=? AND status='pending'",jobId,this.userId);
        if(application)try{await new RentalService(this.db,j.owner_id).jobAction(jobId,{action:'assign',applicationId:application.id});await this.audit(jobId,'assistant.cleaner_assigned').run();return {message:'Вы назначены по правилу владельца: первый отклик без пересечения заданий. Адрес открыт в задании.'};}catch(error:any){if(!(error instanceof DomainError)&&!/cleaner_overlap/.test(String(error?.message)))throw error;}
      }
      return {message:'Отклик отправлен. Назначение появится после подтверждения заказчиком.'};
    }
    if(body.action==='assign' && j.owner_id===this.userId) {
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a) throw new DomainError('Отклик недоступен.',409);
      const candidate=await this.one('SELECT roles,city FROM profiles WHERE id=?',a.user_id);
      if(!candidate||!JSON.parse(candidate.roles).includes('cleaner')||candidate.city.toLowerCase()!==j.city.toLowerCase())throw new DomainError('Анкета исполнителя больше не соответствует заданию.',409);
      const results=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=? AND status='open' AND end>?",a.user_id,jobId,now()),
        this.query("UPDATE applications SET status=CASE WHEN user_id=(SELECT assigned_to FROM cleaning_jobs WHERE id=?) THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND (SELECT status FROM cleaning_jobs WHERE id=?)='assigned'",jobId,jobId,jobId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,?,?,0,? FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned'",id(),'Вас назначили на уборку. Адрес и контакт заказчика доступны в задании.','assigned:'+jobId+':'+a.user_id,now(),jobId,a.user_id),this.query(`INSERT OR IGNORE INTO notifications SELECT ?||user_id,user_id,'На уборку назначен другой исполнитель. Вы можете выбрать другие задания.','not-selected:'||job_id||':'||user_id,0,? FROM applications WHERE job_id=? AND status='rejected'`,id()+':',now(),jobId),this.audit(jobId,'job.assigned')
      ]);
      if(!results[0].meta.changes) throw new DomainError('Исполнитель уже назначен или задание истекло.',409);
      return {message:'Исполнитель назначен.'};
    }
    if(body.action==='decline' && j.assigned_to===this.userId){
      if(j.status!=='assigned')throw new DomainError('Отказ доступен до начала работы.',409);
      await this.db.batch([this.query("UPDATE cleaning_jobs SET status='open',assigned_to=NULL WHERE id=? AND status='assigned' AND assigned_to=?",jobId,this.userId),this.query("UPDATE applications SET status='withdrawn' WHERE job_id=? AND user_id=?",jobId,this.userId),this.query("UPDATE applications SET status='pending' WHERE job_id=? AND status='rejected'",jobId),this.notify(j.owner_id,'Исполнитель отказался до начала уборки. Задание снова открыто.','declined:'+jobId+':'+this.userId),this.audit(jobId,'job.declined')]);
      return {message:'Вы отказались от назначения. Задание снова открыто, владелец уведомлён.'};
    }
    if(body.action==='revise' && j.owner_id===this.userId){
      const issue=required(body.issue,'Что доработать',1500);
      if(j.status!=='submitted')throw new DomainError('Доработка доступна после получения отчёта.',409);
      await this.db.batch([this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND status='submitted'",jobId),this.notify(j.assigned_to,'Нужна доработка уборки: '+issue,'revision:'+jobId+':'+id()),this.audit(jobId,'job.revision_requested')]);
      return {message:'Замечания переданы исполнителю. Работа возвращена на доработку.'};
    }
    if(body.action==='start' && j.assigned_to===this.userId) {
      if(j.start>now()+3600) throw new DomainError('Начать работу можно не раньше чем за час до задания.');
      const r=await this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND assigned_to=? AND status='assigned'",jobId,this.userId).run();
      if(!r.meta.changes) throw new DomainError('Статус задания изменился.',409);
      await this.db.batch([this.audit(jobId,'job.started'),this.notify(j.owner_id,'Исполнитель начал уборку.','started:'+jobId)]); return {message:'Начало работы отмечено.'};
    }
    if(body.action==='submit' && j.assigned_to===this.userId) {
      const checklist=Array.isArray(body.checklist)?body.checklist:[];
      if(checklist.length!==4||checklist.some((v:any)=>v!==true)) throw new DomainError('Подтвердите все пункты чек-листа.');
      const report=required(body.report,'Отчёт о работе',1500);
      const r=await this.query("UPDATE cleaning_jobs SET status='submitted',checklist=?,report=? WHERE id=? AND assigned_to=? AND status='in_progress'",JSON.stringify(checklist),report,jobId,this.userId).run();
      if(!r.meta.changes) throw new DomainError('Сначала отметьте начало работы.',409);
      await this.db.batch([this.notify(j.owner_id,'Уборка отправлена на проверку. Прочитайте отчёт и примите работу.','submitted:'+jobId),this.audit(jobId,'job.submitted')]);
      return {message:'Отчёт отправлен заказчику на проверку.'};
    }
    if(body.action==='approve' && j.owner_id===this.userId) {
      const r=await this.query("UPDATE cleaning_jobs SET status='completed' WHERE id=? AND status='submitted'",jobId).run();
      if(!r.meta.changes) throw new DomainError('Нет отчёта для приёмки.',409);
      await this.db.batch([this.notify(j.assigned_to,'Заказчик принял уборку. Расчёт производится с заказчиком отдельно.','approved:'+jobId),this.audit(jobId,'job.completed')]);
      return {message:'Работа принята. Денежные расчёты выполняются отдельно.'};
    }
    if(body.action==='issue' && (j.owner_id===this.userId||j.assigned_to===this.userId)) {
      await this.db.batch([this.notify(j.owner_id===this.userId?j.assigned_to:j.owner_id,'Проблема по уборке: '+required(body.issue,'Описание',1500),id()),this.audit(jobId,'job.issue')]);
      return {message:'Обращение записано в уведомлениях. Статус работы не изменён.'};
    }
    throw new DomainError('Нет доступа к этому действию.',403);
  }
  async saveSettings(body:Row){
    const profile=await this.profile();if(!profile)throw new DomainError('Сначала заполните профиль.');
    if(body.activeRole){if(!roles.includes(body.activeRole)||!JSON.parse(profile.roles).includes(body.activeRole))throw new DomainError('Эта роль не подключена к аккаунту.',403);await this.query('INSERT INTO account_settings(user_id,active_role) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET active_role=excluded.active_role',this.userId,body.activeRole).run();return {message:'Кабинет переключён.'};}
    await this.requireRole('owner');
    if(typeof body.autoConfirm!=='boolean'||typeof body.autoAssign!=='boolean')throw new DomainError('Укажите правила автоматизации.');
    const fee=number(body.cleaningFee,'Вознаграждение за уборку',100,1000000);
    await this.db.batch([this.query('INSERT INTO account_settings(user_id,active_role,auto_confirm,auto_assign,cleaning_fee) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET auto_confirm=excluded.auto_confirm,auto_assign=excluded.auto_assign,cleaning_fee=excluded.cleaning_fee',this.userId,'owner',body.autoConfirm?1:0,body.autoAssign?1:0,fee),this.audit(this.userId,'assistant.policy_updated')]);
    return {message:'Правила ассистента сохранены. Новые заявки обрабатываются по этим правилам.'};
  }
  async chat(body:Row,config:AIConfig={}) {
    const text=required(body.text,'Сообщение',2000), role=roles.includes(body.role)?body.role:'guest';
    await this.requireRole(role);
    const reply=assistantReply(text,role,!!await this.profile()), ts=Date.now();
    if(body.aiConsent===true&&config.OPENAI_API_KEY&&config.OPENAI_MODEL){
      const history=await this.all('SELECT sender,body FROM (SELECT sender,body,created_at FROM messages WHERE user_id=? AND scope=? ORDER BY created_at DESC LIMIT 8) ORDER BY created_at',this.userId,role);
      const generated=await generateAnswer(config,text,role,history as {sender:string;body:string}[],reply.text);
      reply.text=generated.text;
    }
    await this.db.batch([
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',id(),this.userId,role,'user',text,ts),
      this.query('INSERT INTO messages VALUES (?,?,?,?,?,?)',id(),this.userId,role,'assistant',reply.text,ts+1)
    ]);
    return reply;
  }
  async demo() {
    const existing=await this.one('SELECT id FROM properties WHERE demo_owner=? LIMIT 1',this.userId);
    if(existing) return {message:'Учебные данные уже добавлены. Они видны только вам.'};
    const p1=id(),p2=id(),job=id(), t=now(), tomorrow=Math.ceil((t+86400)/3600)*3600;
    const statements=[
      this.query('INSERT OR IGNORE INTO profiles VALUES (?,?,?,?,?,?,?,?,?)',this.userId,'Тестовый пользователь','Тестовый контакт','Павлодар',JSON.stringify(roles),'Центр, Набережная','Учебная анкета','По согласованию',t),
      this.query('INSERT INTO properties (id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p1,this.userId,this.userId,'Светлая квартира у набережной','Павлодар','Набережная','Учебный адрес, квартира 12','Демонстрационный объект. Одна спальня, кухня, Wi-Fi. Без курения. Реальное заселение невозможно.',18500,2,4,90,1,t),
      this.query('INSERT INTO properties (id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p2,this.userId,this.userId,'Уютная студия в центре','Павлодар','Центр','Учебный адрес, квартира 24','Демонстрационный объект. Студия для двоих с рабочим местом. Реальное заселение невозможно.',14000,1,2,60,1,t+1),
      this.query('INSERT INTO cleaning_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',job,p1,this.userId,null,tomorrow,tomorrow+5400,4500,'Учебное задание: уборка после выезда, смена белья. Средства на объекте.','open',null,'[]','',t),
      this.audit(p1,'demo.created')
    ];
    await this.db.batch(statements);
    return {message:'Добавлены учебные квартиры и уборка. Данные изолированы от других пользователей.'};
  }
  async maintenance() {
    await this.query("UPDATE bookings SET status='expired' WHERE status='requested' AND expires_at<=?",now()).run();
    const overdue=await this.all("SELECT id,owner_id,assigned_to FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress') AND end<?",now());
    if(overdue.length) await this.db.batch(overdue.map(j=>this.notify(j.owner_id,'Срок уборки истёк. Проверьте выполнение и при необходимости найдите замену.','overdue:'+j.id)));
    return {message:'Сроки проверены.', overdue:overdue.length};
  }
}
