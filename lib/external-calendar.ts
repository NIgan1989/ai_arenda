import {DomainError,required,number} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,hash,randomToken,httpsEndpoint,type Row,type OperationConfig} from './operation-core';

type CalendarBlock={uid:string;start:number;end:number};
export async function assertCalendarAvailable(db:D1Database,propertyId:string,start:number,end:number){
 const stale=await one(db,"SELECT id FROM calendar_sources WHERE property_id=? AND enabled=1 AND url<>'' AND (last_success IS NULL OR last_success<? OR last_error<>'') LIMIT 1",propertyId,epoch()-3600);if(stale)throw new DomainError('Актуальность внешнего календаря не подтверждена. Владелец должен обновить источник.',409);
 if(await one(db,'SELECT x.id FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=? AND s.enabled=1 AND x.start<? AND x.end>? LIMIT 1',propertyId,end,start))throw new DomainError('Интервал занят во внешнем календаре.',409);
}
function calendarTime(line:string){
 const separator=line.indexOf(':'),key=line.slice(0,separator),value=line.slice(separator+1).trim();
 if(/TZID=/.test(key)&&!/TZID=(Asia\/Almaty|Asia\/Qostanay|UTC)(;|$)/.test(key))throw new DomainError('Часовой пояс календаря не поддержан. Экспортируйте события в UTC.');
 let text:string;
 if(/^\d{8}$/.test(value))text=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00+05:00`;
 else if(/^\d{8}T\d{6}Z$/.test(value))text=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(9,11)}:${value.slice(11,13)}:${value.slice(13,15)}Z`;
 else if(/^\d{8}T\d{6}$/.test(value)&&/TZID=(Asia\/Almaty|Asia\/Qostanay|UTC)(;|$)/.test(key))text=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(9,11)}:${value.slice(11,13)}:${value.slice(13,15)}${/TZID=UTC/.test(key)?'Z':'+05:00'}`;
 else throw new DomainError('Календарь должен содержать однозначное время UTC или дату.');
 const time=Date.parse(text);if(!Number.isFinite(time))throw new DomainError('Некорректная дата в календаре.');
 const utc=value.endsWith('Z')||/TZID=UTC/.test(key),roundTrip=new Date(time+(utc?0:18000000)).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'');
 if(value.length===8?roundTrip.slice(0,8)!==value:roundTrip!==value.replace(/Z$/,''))throw new DomainError('В календаре указана несуществующая дата.');
 return Math.floor(time/1000);
}
export function parseCalendar(input:string):CalendarBlock[]{
 if(input.length>512000||!input.includes('BEGIN:VCALENDAR')||!input.includes('END:VCALENDAR'))throw new DomainError('Нужен файл iCalendar до 512 КБ.');
 const lines=input.replace(/^\uFEFF/,'').replace(/\r?\n[ \t]/g,'').split(/\r?\n/),events:CalendarBlock[]=[],ids=new Set<string>();let current:Row|null=null;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){if(current)throw new DomainError('Повреждён календарь.');current={};continue;}
  if(line==='END:VEVENT'){
   if(!current)throw new DomainError('Повреждён календарь.');
   if(!current.cancelled&&!current.transparent){if(!current.uid||!current.start||!current.end||current.end<=current.start)throw new DomainError('Событие должно иметь UID, начало и окончание.');if(ids.has(current.uid))throw new DomainError('Повторяется UID события.');ids.add(current.uid);events.push({uid:current.uid,start:current.start,end:current.end});}
   current=null;continue;
  }
  if(!current)continue;
  if(/^(RRULE|RDATE|EXDATE|RECURRENCE-ID|DURATION)[;:]/.test(line))throw new DomainError('Повторяющиеся события нужно развернуть в отдельные интервалы до импорта.');
  if(line.startsWith('UID:'))current.uid=required(line.slice(4),'UID события',300);
  if(/^DTSTART[;:]/.test(line))current.start=calendarTime(line);
  if(/^DTEND[;:]/.test(line))current.end=calendarTime(line);
  if(line==='STATUS:CANCELLED')current.cancelled=true;
  if(line==='TRANSP:TRANSPARENT')current.transparent=true;
 }
 if(current||events.length>1000)throw new DomainError('Календарь повреждён или содержит более 1000 событий.');return events;
}
export async function importCalendar(db:D1Database,source:Row,text:string){
 const events=parseCalendar(text),statements=[q(db,'DELETE FROM external_blocks WHERE source_id=? AND EXISTS(SELECT 1 FROM calendar_sources WHERE id=? AND enabled=1 AND version=?)',source.id,source.id,source.version)];
 for(const event of events)statements.push(q(db,'INSERT INTO external_blocks SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM calendar_sources WHERE id=? AND enabled=1 AND version=?)',uuid(),source.id,source.property_id,event.uid,event.start,event.end,source.id,source.version));
 statements.push(q(db,"UPDATE calendar_sources SET last_attempt=?,last_success=?,last_error='',content_hash=?,version=version+1 WHERE id=? AND enabled=1 AND version=?",epoch(),epoch(),await hash(text),source.id,source.version));
 const result=await db.batch(statements);if(!result.at(-1)?.meta.changes)throw new DomainError('Источник изменился во время импорта.',409);
 const conflict=await one(db,"SELECT COUNT(DISTINCT b.id) n FROM bookings b JOIN external_blocks x ON x.property_id=b.property_id WHERE x.source_id=? AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?)) AND x.start<b.occupied_until AND x.end>b.start",source.id,epoch());
 return {count:events.length,conflicts:conflict?.n||0,message:conflict?.n?'Календарь импортирован. Есть пересечения с действующими бронями — требуется решение владельца.':'Календарь импортирован, интервалы закрыты для новых заявок.'};
}
// Hosts that publish availability links. Subdomains count (admin.booking.com, www.airbnb.ru),
// so the link an owner copies from the platform works as is.
const calendarHosts=['airbnb.com','airbnb.ru','airbnb.kz','booking.com','calendar.google.com','outlook.office365.com','outlook.live.com','vrbo.com','sutochno.ru','avito.ru','ostrovok.ru','yandex.ru','icloud.com'];
const allowedHost=(host:string,list:string[])=>list.some(h=>host===h||host.endsWith('.'+h));
function allowedCalendarUrl(value:string,config:OperationConfig){const url=httpsEndpoint(value);const allowed=config.CALENDAR_ALLOWED_HOSTS?config.CALENDAR_ALLOWED_HOSTS.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean):calendarHosts;if(!allowedHost(url.hostname.toLowerCase(),allowed))throw new DomainError('Ссылки с этого сайта пока не принимаются. Подойдут Airbnb, Booking, Суточно, Авито, Google и Outlook. Можно загрузить файл .ics в разделе «Управление».');return url;}
export function calendarProvider(value:string){const host=(()=>{try{return new URL(value).hostname.toLowerCase();}catch{return '';}})();
 const known:[string,string,string][]=[['airbnb','airbnb','Airbnb'],['booking.com','booking','Booking.com'],['vrbo.com','vrbo','Vrbo'],['sutochno.ru','other','Суточно'],['avito.ru','other','Авито'],['ostrovok.ru','other','Островок'],['google.com','other','Google Календарь'],['outlook','other','Outlook'],['yandex.ru','other','Яндекс Календарь'],['icloud.com','other','iCloud']];
 const hit=known.find(([part])=>host.includes(part));return {provider:hit?.[1]||'other',label:hit?.[2]||host||'Другая площадка'};}
export async function refreshCalendar(db:D1Database,sourceId:string,config:OperationConfig){
 const source=await one(db,'SELECT * FROM calendar_sources WHERE id=? AND enabled=1',sourceId);if(!source||!source.url)return {skipped:true};
 try{const url=allowedCalendarUrl(source.url,config),response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'text/calendar'}});if(!response.ok)throw new Error('Calendar source unavailable');if(Number(response.headers.get('content-length')||0)>512000)throw new Error('Calendar source too large');
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty source');let size=0,text='';const decoder=new TextDecoder();for(;;){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>512000){await reader.cancel();throw new Error('Source too large');}text+=decoder.decode(result.value,{stream:true});}text+=decoder.decode();return await importCalendar(db,source,text);
 }catch(error){await q(db,"UPDATE calendar_sources SET last_attempt=?,last_error='Не удалось подтвердить актуальность календаря' WHERE id=? AND version=?",epoch(),source.id,source.version).run();throw new DomainError('Синхронизация не завершена. Прежние блокировки сохранены; проверьте источник.',503);}
}
export async function calendarSources(service:RentalService){await service.requireRole('owner');return rows(service.db,"SELECT s.id,s.property_id,s.label,s.provider,s.external_property_id,s.enabled,s.last_success,s.last_attempt,s.last_error,s.version,CASE WHEN s.url<>'' THEN 1 ELSE 0 END automatic,(SELECT COUNT(*) FROM external_blocks WHERE source_id=s.id) blockCount,(SELECT COUNT(DISTINCT b.id) FROM bookings b JOIN external_blocks x ON x.property_id=b.property_id WHERE x.source_id=s.id AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>unixepoch())) AND x.start<b.occupied_until AND x.end>b.start) conflicts FROM calendar_sources s WHERE s.owner_id=? ORDER BY s.created_at DESC",service.userId);}
export async function saveCalendarSource(service:RentalService,body:Row,config:OperationConfig){
 await service.requireRole('owner');const propertyId=required(body.propertyId,'Квартира',100);if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Квартира недоступна.',403);
 const label=required(body.label,'Название источника',100),url=body.url?allowedCalendarUrl(required(body.url,'Ссылка календаря',2000),config).href:'';
 if(body.id){const r=await q(service.db,'UPDATE calendar_sources SET enabled=?,version=version+1 WHERE id=? AND owner_id=? AND property_id=? AND version=?',body.enabled===true?1:0,body.id,service.userId,propertyId,number(body.expectedVersion,'Версия',1,10000000)).run();if(!r.meta.changes)throw new DomainError('Источник уже изменился.',409);return {id:body.id,message:'Состояние источника сохранено.'};}
 if(body.ics)parseCalendar(required(body.ics,'Содержимое ICS',512000));
 const provider=String(body.provider||'manual');if(!['manual','booking','airbnb','vrbo','other'].includes(provider))throw new DomainError('Выберите площадку календаря.');
 const externalId=body.externalPropertyId?required(body.externalPropertyId,'Номер объекта на площадке',160):'';
 const id=uuid();await q(service.db,'INSERT INTO calendar_sources(id,property_id,owner_id,label,url,created_at,provider,external_property_id) VALUES (?,?,?,?,?,?,?,?)',id,propertyId,service.userId,label,url,epoch(),provider,externalId).run();
 if(body.ics){const source=await one(service.db,'SELECT * FROM calendar_sources WHERE id=?',id);return {id,...await importCalendar(service.db,source!,required(body.ics,'Содержимое ICS',512000))};}
 return {id,message:url?'Источник сохранён. До первого успешного обновления новые заявки по объекту приостановлены.':'Источник создан. Загрузите ICS для блокировки интервалов.'};
}
const icalDate=(seconds:number)=>new Date(seconds*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export async function previewCalendarImport(service:RentalService,body:Row){
 await service.requireRole('owner');const source=await one(service.db,'SELECT s.*,p.title FROM calendar_sources s JOIN properties p ON p.id=s.property_id WHERE s.id=? AND s.owner_id=? AND s.enabled=1',required(body.sourceId,'Источник',100),service.userId);
 if(!source)throw new DomainError('Источник недоступен.',403);
 const text=required(body.ics,'Содержимое ICS',512000),events=parseCalendar(text),old=await rows(service.db,'SELECT event_uid uid,start,end FROM external_blocks WHERE source_id=?',source.id),existing=new Map(old.map(e=>[e.uid,e]));
 const bookings=await rows(service.db,"SELECT id,start,occupied_until end FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?))",source.property_id,epoch());
 const conflicts=bookings.filter(b=>events.some(e=>e.start<b.end&&e.end>b.start)).map(b=>({id:b.id,start:b.start,end:b.end}));
 const id=uuid(),digest=await hash(text),at=epoch();await q(service.db,'INSERT INTO calendar_previews VALUES (?,?,?,?,?,?,?)',id,service.userId,source.id,source.version,digest,at+900,at).run();
 return {preview:{id,sourceVersion:source.version,sourceId:source.id,propertyTitle:source.title,sourceLabel:source.label,count:events.length,added:events.filter(e=>!existing.has(e.uid)).length,changed:events.filter(e=>existing.has(e.uid)&&(existing.get(e.uid)!.start!==e.start||existing.get(e.uid)!.end!==e.end)).length,removed:old.filter(e=>!events.some(n=>n.uid===e.uid)).length,conflicts,expiresAt:at+900,intervals:events.slice(0,10)}};
}
export async function commitCalendarImport(service:RentalService,body:Row){
 await service.requireRole('owner');if(body.confirmed!==true)throw new DomainError('Подтвердите замену интервалов после предпросмотра.');
 const preview=await one(service.db,'SELECT * FROM calendar_previews WHERE id=? AND user_id=?',required(body.previewId,'Предпросмотр',100),service.userId);if(!preview)throw new DomainError('Предпросмотр недоступен.',403);
 const text=required(body.ics,'Содержимое ICS',512000);if(await hash(text)!==preview.content_hash)throw new DomainError('Файл изменился. Подготовьте предпросмотр заново.',409);
 const source=await one(service.db,'SELECT * FROM calendar_sources WHERE id=? AND owner_id=? AND enabled=1',preview.source_id,service.userId);if(!source)throw new DomainError('Источник недоступен.',403);
 if(source.version===preview.source_version+1&&source.content_hash===preview.content_hash)return {message:'Этот импорт уже сохранён.',count:parseCalendar(text).length};
 if(preview.expires_at<=epoch()||source.version!==preview.source_version)throw new DomainError('Предпросмотр истёк или источник изменился. Проверьте файл заново.',409);
 return importCalendar(service.db,source,text);
}
export async function createCalendarExport(service:RentalService,body:Row,config:OperationConfig){await service.requireRole('owner');const propertyId=required(body.propertyId,'Квартира',100);if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Квартира недоступна.',403);const token=randomToken(),expires=epoch()+EXPORT_SECONDS;await q(service.db,'INSERT INTO calendar_exports VALUES (?,?,?,?,?,NULL)',await hash(token),propertyId,service.userId,epoch(),expires).run();const base=config.SITE_PUBLIC_URL?httpsEndpoint(config.SITE_PUBLIC_URL).origin:'';return {url:base+'/api/calendar/feed/'+token+'.ics',expiresAt:expires,message:'Ссылка показывает только занятые даты, без имён и адресов. Вставьте её в календарь другой площадки. Она работает, пока вы её не отзовёте.'};}
export async function exportCalendar(db:D1Database,token:string){token=token.replace(/\.ics$/,'');const feed=await one(db,'SELECT * FROM calendar_exports WHERE hash=? AND revoked_at IS NULL AND expires_at>?',await hash(token),epoch());if(!feed)throw new DomainError('Календарь недоступен.',404);const blocks=await rows(db,"SELECT id,start,occupied_until end FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) UNION ALL SELECT id,start,end FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted')",feed.property_id,epoch(),feed.property_id);return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AI Arenda//Availability//RU','CALSCALE:GREGORIAN',...blocks.flatMap(b=>['BEGIN:VEVENT','UID:'+b.id+'@ai-arenda','DTSTAMP:'+icalDate(epoch()),'DTSTART:'+icalDate(b.start),'DTEND:'+icalDate(b.end),'SUMMARY:Reserved','END:VEVENT']),'END:VCALENDAR',''].join('\r\n');}

// Platforms poll the link for as long as the flat is listed there, so it lives until revoked.
export const EXPORT_SECONDS=10*365*86400;

// The flat editor's calendar screen: the sources of one flat and whether each is up to date.
export async function flatCalendars(service:RentalService,body:Row){
 await service.requireRole('owner');const propertyId=required(body.propertyId,'Квартира',100);
 if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Квартира недоступна.',403);
 const sources=await rows(service.db,"SELECT s.id,s.label,s.provider,s.enabled,s.version,s.last_success,s.last_attempt,s.last_error,CASE WHEN s.url<>'' THEN 1 ELSE 0 END automatic,(SELECT COUNT(*) FROM external_blocks WHERE source_id=s.id AND end>unixepoch()) busy FROM calendar_sources s WHERE s.property_id=? AND s.owner_id=? ORDER BY s.enabled DESC,s.created_at DESC",propertyId,service.userId);
 const exports=await one(service.db,'SELECT COUNT(*) n FROM calendar_exports WHERE property_id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>?',propertyId,service.userId,epoch());
 return {sources,exportLinks:exports?.n||0};
}

// One step for the owner: paste the platform's calendar link, the service names the source and
// loads it right away. A failed first load keeps the source, which blocks new requests until it works.
export async function connectCalendar(service:RentalService,body:Row,config:OperationConfig){
 const url=required(body.url,'Ссылка календаря',2000).trim().replace(/^webcal:\/\//i,'https://');
 if(!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url))throw new DomainError('Вставьте ссылку на календарь целиком, она начинается с https://');
 const {provider,label}=calendarProvider(url);
 const saved=await saveCalendarSource(service,{propertyId:body.propertyId,url,provider,label},config) as Row;
 try{const result=await refreshCalendar(service.db,saved.id,config) as Row;return {id:saved.id,label,...result,message:label+' подключён. '+(result.count?'Занятых периодов: '+result.count+'.':'Занятых дат пока нет.')+(result.conflicts?' Есть пересечения с бронями здесь, проверьте их.':'')};}
 catch{return {id:saved.id,label,message:label+' добавлен, но календарь пока не загрузился. Проверьте ссылку: пока календарь не обновится, новые заявки на эту квартиру не принимаются.',failed:true};}
}
