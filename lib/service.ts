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
  async state() {
    const [profile, properties, ownProperties, bookings, jobs, applications, notifications, messages] = await Promise.all([
      this.profile(),
      this.all('SELECT id,title,city,district,description,price,rooms,capacity,cleaning_minutes,demo_owner FROM properties WHERE published=1 AND (demo_owner IS NULL OR demo_owner=?) ORDER BY created_at DESC', this.userId),
      this.all('SELECT * FROM properties WHERE owner_id=? ORDER BY created_at DESC', this.userId),
      this.all(`SELECT b.*,p.title,p.owner_id,p.city,p.district,p.demo_owner,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN p.address ELSE NULL END address,
        CASE WHEN p.owner_id=? OR (b.guest_id=? AND b.status='confirmed') THEN o.contact ELSE NULL END owner_contact,
        CASE WHEN p.owner_id=? THEN g.name ELSE NULL END guest_name,
        CASE WHEN p.owner_id=? THEN g.contact ELSE NULL END guest_contact
        FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN profiles o ON o.id=p.owner_id LEFT JOIN profiles g ON g.id=b.guest_id
        WHERE b.guest_id=? OR p.owner_id=? ORDER BY b.start DESC`, ...Array(8).fill(this.userId)),
      this.all(`SELECT j.*,p.title,p.city,p.district,p.rooms,p.demo_owner,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN p.address ELSE NULL END address,
        CASE WHEN j.owner_id=? OR j.assigned_to=? THEN o.contact ELSE NULL END owner_contact
        FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN profiles o ON o.id=j.owner_id
        WHERE (j.owner_id=? OR j.assigned_to=? OR (j.status='open' AND j.end>?)) AND (p.demo_owner IS NULL OR p.demo_owner=?) ORDER BY j.start`, this.userId,this.userId,this.userId,this.userId,this.userId,this.userId,now(),this.userId),
      this.all(`SELECT a.*,p.name,p.experience,p.availability,p.districts FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN profiles p ON p.id=a.user_id WHERE a.user_id=? OR j.owner_id=?`, this.userId,this.userId),
      this.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40', this.userId),
      this.all('SELECT * FROM (SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at', this.userId),
    ]);
    return { profile, properties, ownProperties, bookings:bookings.map(b => ({...b,status:b.status==='requested' && b.expires_at<=now()?'expired':b.status})), jobs, applications, notifications, messages, serverTime:now(), integrations:{ai:false,telegram:false,whatsapp:false,payments:false} };
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
    const propertyId=id();
    await this.db.batch([this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',propertyId,this.userId,null,required(body.title,'Название',120),required(body.city,'Город',80),required(body.district,'Район',120),required(body.address,'Точный адрес',300),required(body.description,'Описание и правила',2500),number(body.price,'Цена за сутки',100,10000000),number(body.rooms,'Комнаты',1,20),number(body.capacity,'Вместимость',1,50),number(body.cleaningMinutes,'Время уборки',30,1440),1,now()),this.audit(propertyId,'property.created')]);
    return {id:propertyId,message:'Квартира добавлена в каталог. Точный адрес скрыт до подтверждения брони.'};
  }
  async createBooking(body:Row) {
    await this.requireRole('guest');
    const key=required(body.requestKey,'Ключ запроса',100), existing=await this.one('SELECT id FROM bookings WHERE guest_id=? AND request_key=?',this.userId,key);
    if(existing) return {id:existing.id,message:'Эта заявка уже сохранена.'};
    const p=await this.one('SELECT * FROM properties WHERE id=? AND published=1 AND (demo_owner IS NULL OR demo_owner=?)',required(body.propertyId,'Квартира',100),this.userId);
    if(!p) throw new DomainError('Квартира недоступна.',404);
    const {start,end}=interval(body.start,body.end), guests=number(body.guests,'Гости',1,p.capacity);
    const bookingId=id(), amount=quote(p.price,start,end);
    await this.db.batch([
      this.query('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',bookingId,p.id,this.userId,start,end,end+p.cleaning_minutes*60,guests,amount,'requested',now()+1800,'unpaid',key,now()),
      this.notify(p.owner_id,`Новая заявка на «${p.title}». Подтвердите её в течение 30 минут.`,`booking:${bookingId}`),this.audit(bookingId,'booking.requested')
    ]);
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
      const statements=[this.query("UPDATE bookings SET status='confirmed' WHERE id=? AND status='requested' AND expires_at>?",bookingId,now()),this.notify(b.guest_id,`Бронь «${b.title}» подтверждена. Адрес доступен в карточке.`,`confirmed:${bookingId}`),this.audit(bookingId,'booking.confirmed')];
      if(fee>0) statements.push(this.query("INSERT OR IGNORE INTO cleaning_jobs SELECT ?,property_id,?,?,end,occupied_until,?,?,'open',NULL,'[]','',? FROM bookings WHERE id=? AND status='confirmed'",id(),this.userId,bookingId,fee,'Уборка после выезда: сменить бельё, проверить санузел и кухню, вынести мусор.',now(),bookingId));
      const results=await this.db.batch(statements);
      if(!results[0].meta.changes) throw new DomainError('Срок заявки истёк или статус уже изменился.',409);
      return {message:fee>0?'Бронь подтверждена, задание на уборку опубликовано.':'Бронь подтверждена.'};
    }
    if(body.action==='cancel') {
      await this.db.batch([this.query("UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('requested','confirmed')",bookingId),this.query("UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned')",bookingId),this.notify(owner?b.guest_id:b.owner_id,`Бронь «${b.title}» отменена. Если была оплата, согласуйте возврат.`,`cancelled:${bookingId}`),this.audit(bookingId,'booking.cancelled')]);
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
    await this.db.batch([this.query('INSERT INTO cleaning_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',jobId,p.id,this.userId,null,start,end,number(body.fee,'Вознаграждение',100,1000000),required(body.description,'Условия',2000),'open',null,'[]','',now()),this.audit(jobId,'job.created')]);
    return {id:jobId,message:'Задание опубликовано. Исполнители могут откликаться.'};
  }
  async jobAction(jobId:string,body:Row) {
    const j=await this.one('SELECT j.*,p.demo_owner FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=? AND (p.demo_owner IS NULL OR p.demo_owner=?)',jobId,this.userId);
    if(!j) throw new DomainError('Задание не найдено.',404);
    if(body.action==='apply') {
      await this.requireRole('cleaner');
      if(j.status!=='open'||j.end<=now()) throw new DomainError('Задание уже недоступно.',409);
      const results=await this.db.batch([this.query("INSERT INTO applications SELECT ?,id,?,'pending',? FROM cleaning_jobs WHERE id=? AND status='open' AND end>? ON CONFLICT(job_id,user_id) DO NOTHING",id(),this.userId,now(),jobId,now()),this.notify(j.owner_id,'Новый отклик на уборку. Посмотрите анкету исполнителя.','application:'+jobId+':'+this.userId),this.audit(jobId,'job.application')]);
      if(!results[0].meta.changes && !await this.one('SELECT id FROM applications WHERE job_id=? AND user_id=?',jobId,this.userId)) throw new DomainError('Задание больше недоступно.',409);
      return {message:'Отклик отправлен. Назначение появится после подтверждения заказчиком.'};
    }
    if(body.action==='assign' && j.owner_id===this.userId) {
      const a=await this.one("SELECT * FROM applications WHERE id=? AND job_id=? AND status='pending'",required(body.applicationId,'Отклик',100),jobId);
      if(!a) throw new DomainError('Отклик недоступен.',409);
      const results=await this.db.batch([
        this.query("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=? AND status='open' AND end>?",a.user_id,jobId,now()),
        this.query("UPDATE applications SET status=CASE WHEN user_id=(SELECT assigned_to FROM cleaning_jobs WHERE id=?) THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND (SELECT status FROM cleaning_jobs WHERE id=?)='assigned'",jobId,jobId,jobId),
        this.query("INSERT OR IGNORE INTO notifications SELECT ?,assigned_to,?,?,0,? FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned'",id(),'Вас назначили на уборку. Адрес и контакт заказчика доступны в задании.','assigned:'+jobId+':'+a.user_id,now(),jobId,a.user_id),this.audit(jobId,'job.assigned')
      ]);
      if(!results[0].meta.changes) throw new DomainError('Исполнитель уже назначен или задание истекло.',409);
      return {message:'Исполнитель назначен.'};
    }
    if(body.action==='start' && j.assigned_to===this.userId) {
      if(j.start>now()+3600) throw new DomainError('Начать работу можно не раньше чем за час до задания.');
      const r=await this.query("UPDATE cleaning_jobs SET status='in_progress' WHERE id=? AND assigned_to=? AND status='assigned'",jobId,this.userId).run();
      if(!r.meta.changes) throw new DomainError('Статус задания изменился.',409);
      await this.audit(jobId,'job.started').run(); return {message:'Начало работы отмечено.'};
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
  async chat(body:Row,config:AIConfig={}) {
    const text=required(body.text,'Сообщение',2000), role=roles.includes(body.role)?body.role:'guest';
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
      this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p1,this.userId,this.userId,'Светлая квартира у набережной','Павлодар','Набережная','Учебный адрес, квартира 12','Демонстрационный объект. Одна спальня, кухня, Wi-Fi. Без курения. Реальное заселение невозможно.',18500,2,4,90,1,t),
      this.query('INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',p2,this.userId,this.userId,'Уютная студия в центре','Павлодар','Центр','Учебный адрес, квартира 24','Демонстрационный объект. Студия для двоих с рабочим местом. Реальное заселение невозможно.',14000,1,2,60,1,t+1),
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
