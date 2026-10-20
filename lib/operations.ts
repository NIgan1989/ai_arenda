import {DomainError} from './domain';
import {RentalService} from './service';
export async function runOperations(db:D1Database,t=Math.floor(Date.now()/1000)){
 const system=new RentalService(db,'system:assistant');
 const pending=await system.all("SELECT b.id,p.owner_id,s.cleaning_fee FROM bookings b JOIN properties p ON p.id=b.property_id JOIN account_settings s ON s.user_id=p.owner_id WHERE b.status='requested' AND b.expires_at>? AND s.auto_confirm=1 LIMIT 10",t);
 for(const b of pending)try{const host=new RentalService(db,b.owner_id);await host.bookingAction(b.id,{action:'confirm',cleaningFee:b.cleaning_fee});await system.audit(b.id,'assistant.booking_confirmed').run();}catch(error){console.error('Assistant booking dispatch failed',b.id);}
 const matching=await system.all("SELECT j.id,j.owner_id FROM cleaning_jobs j JOIN account_settings s ON s.user_id=j.owner_id WHERE j.status='open' AND j.end>? AND s.auto_assign=1 LIMIT 10",t);
 for(const j of matching){const candidates=await system.all("SELECT a.id,a.user_id,c.city,p.city AS job_city FROM applications a JOIN profiles c ON c.id=a.user_id JOIN cleaning_jobs j ON j.id=a.job_id JOIN properties p ON p.id=j.property_id WHERE a.job_id=? AND a.status='pending' AND instr(c.roles,'\"cleaner\"')>0 ORDER BY a.created_at,a.id LIMIT 50",j.id);for(const a of candidates.filter(a=>a.city.toLowerCase()===a.job_city.toLowerCase()).slice(0,10))try{await new RentalService(db,j.owner_id).jobAction(j.id,{action:'assign',applicationId:a.id});await system.audit(j.id,'assistant.cleaner_assigned').run();break;}catch(error:any){if(!(error instanceof DomainError)&&!/cleaner_overlap/.test(String(error?.message)))throw error;}}
 const expiring=await system.all("SELECT b.id,b.guest_id,p.owner_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.status='requested' AND b.expires_at<=? LIMIT 100",t);
 for(const b of expiring)await db.batch([
  system.query("UPDATE bookings SET status='expired' WHERE id=? AND status='requested' AND expires_at<=?",b.id,t),
  system.notify(b.guest_id,`Срок подтверждения заявки «${b.title}» истёк. Можно выбрать другое время или жильё.`,'expired:guest:'+b.id),
  system.notify(b.owner_id,`Заявка на «${b.title}» истекла без подтверждения. Интервал освобождён.`,'expired:owner:'+b.id),
  system.query('INSERT OR IGNORE INTO audit_events VALUES (?,?,?,?,?)','assistant-expired:'+b.id,'system:assistant',b.id,'assistant.booking_expired',t)
 ]);
 const due=await system.all("SELECT b.id,b.guest_id,p.owner_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.status='confirmed' AND b.start>? AND b.start<=? AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe='arrival:guest:'||b.id) LIMIT 50",t,t+3600);
 for(const b of due)await db.batch([system.notify(b.guest_id,`Скоро заезд в «${b.title}». Адрес и контакт владельца доступны в брони.`,'arrival:guest:'+b.id),system.notify(b.owner_id,`Скоро заезд в «${b.title}». Проверьте готовность объекта.`,'arrival:owner:'+b.id)]);
 const jobs=await system.all("SELECT id,owner_id,assigned_to,status FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress','submitted') AND end<? AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe='overdue:'||cleaning_jobs.id) LIMIT 50",t);
 for(const j of jobs){const statements=[system.notify(j.owner_id,j.status==='submitted'?'Отчёт об уборке ждёт вашей приёмки.':'Срок уборки истёк. Нужна проверка или замена исполнителя.','overdue:'+j.id)];if(j.assigned_to&&j.status!=='submitted')statements.push(system.notify(j.assigned_to,'Срок задания истёк. Сообщите о результате или проблеме.','late:cleaner:'+j.id));await db.batch(statements);}
 const departures=await system.all("SELECT b.id,b.guest_id,p.owner_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.status='confirmed' AND b.end<=? AND b.end>? AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe='departure:guest:'||b.id) LIMIT 50",t,t-3600);
 for(const b of departures)await db.batch([system.notify(b.guest_id,`Время проживания в «${b.title}» закончилось. Проверьте порядок выезда с владельцем.`,'departure:guest:'+b.id),system.notify(b.owner_id,`Выезд из «${b.title}». Проверьте статус подготовки и уборки.`,'departure:owner:'+b.id)]);
 await db.prepare("UPDATE bookings SET status='completed' WHERE status='confirmed' AND occupied_until<=? AND NOT EXISTS (SELECT 1 FROM cleaning_jobs j WHERE j.booking_id=bookings.id AND j.status IN ('open','assigned','in_progress','submitted'))").bind(t).run();
 await db.batch([db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(t),db.prepare('DELETE FROM auth_limits WHERE reset_at<=?').bind(t)]);
 return {expired:expiring.length,arrivals:due.length,overdue:jobs.length};
}
