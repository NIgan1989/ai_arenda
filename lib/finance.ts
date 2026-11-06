import {DomainError,number,required,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,boundedKey,amountInput,hash,httpsEndpoint,type Row,type OperationConfig} from './operation-core';

const bookingKinds=['payment','deposit','refund','deposit_return','compensation'];
export async function migrateFinanceEntity(service:Pick<RentalService,'db'|'userId'>,kind:'booking'|'job',entityId:string){
 const db=service.db,key=kind+':'+entityId;
 if(await one(db,'SELECT entity_key FROM finance_backfill_receipts WHERE entity_key=?',key))return;
 const gate='NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key=?)',statements:D1PreparedStatement[]=[];
 if(kind==='booking'){
  const definitions=[['payment','t.paid_amount',"t.paid_amount>0",'b.created_at'],['deposit','t.deposit',"t.deposit_status='owner_verified' AND t.deposit>0",'b.created_at'],['refund','t.paid_amount',"t.refund_recorded_at IS NOT NULL AND t.paid_amount>0",'t.refund_recorded_at'],['deposit_return','t.deposit',"t.deposit_returned_at IS NOT NULL AND t.deposit>0",'t.deposit_returned_at']];
  for(const [entry,amount,condition,at] of definitions)statements.push(q(db,`INSERT OR IGNORE INTO finance_entries SELECT 'legacy:'||?||':'||b.id,p.owner_id,b.property_id,b.id,NULL,?,${amount},'KZT','legacy','','Перенесённая отметка расчёта',p.owner_id,'legacy:'||?||':'||b.id,${at} FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND p.owner_id=? AND ${condition} AND ${gate}`,entry,entry,entry,entityId,service.userId,key));
 }else statements.push(q(db,`INSERT OR IGNORE INTO finance_entries SELECT 'legacy:job_payment:'||id,owner_id,property_id,NULL,id,'job_payment',fee,'KZT','legacy','','Перенесённая отметка расчёта',owner_id,'legacy:job_payment:'||id,settled_at FROM cleaning_jobs WHERE id=? AND owner_id=? AND settled_at IS NOT NULL AND fee>0 AND ${gate}`,entityId,service.userId,key));
 statements.push(q(db,'INSERT OR IGNORE INTO finance_backfill_receipts VALUES (?,?)',key,epoch()));await db.batch(statements);
}

export async function recordFinance(service:RentalService,body:Row,provider?:{eventId:string;intentId:string;payloadHash:string}){
 const db=service.db,kind=required(body.kind,'Тип расчёта',40),requestKey=boundedKey(body),amount=provider?number(body.amount,'Сумма',1,100000000):amountInput(body),note=required(body.note,'Основание расчёта',1000);
 if(![...bookingKinds,'job_payment','expense'].includes(kind))throw new DomainError('Неизвестный вид расчёта.');
 if(!provider)await service.requireRole('owner');
 const actor=provider?'system:payment-provider':service.userId;
 const previous=await one(db,'SELECT * FROM finance_entries WHERE actor_id=? AND request_key=?',actor,requestKey);
 const bookingId=bookingKinds.includes(kind)?required(body.bookingId,'Бронь',100):null,jobId=kind==='job_payment'?required(body.jobId,'Задание',100):null;
 if(previous){if(previous.kind!==kind||previous.amount!==amount||previous.booking_id!==bookingId||previous.job_id!==jobId)throw new DomainError('Ключ расчёта уже использован с другими данными.',409);return {id:previous.id,message:'Этот расчёт уже записан.'};}
 const entity=bookingId?await one(db,'SELECT b.*,p.owner_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND p.owner_id=?',bookingId,service.userId):jobId?await one(db,'SELECT * FROM cleaning_jobs WHERE id=? AND owner_id=?',jobId,service.userId):await one(db,'SELECT id property_id,owner_id FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Квартира',100),service.userId);
 if(!entity)throw new DomainError('Запись недоступна этому владельцу.',403);
 const propertyId=entity.property_id;
 if(bookingId)await migrateFinanceEntity(service,'booking',bookingId);if(jobId)await migrateFinanceEntity(service,'job',jobId);
 if(['payment','deposit'].includes(kind)&&!(provider?['confirmed','cancelled','expired','completed']:['confirmed']).includes(entity.status))throw new DomainError('Поступление недоступно для этой брони.',409);
 if(kind==='job_payment'&&entity.status!=='completed')throw new DomainError('Сначала примите результат работы.',409);
 if(['refund','compensation'].includes(kind)&&!['confirmed','cancelled','completed','expired'].includes(entity.status))throw new DomainError('Для этой брони такой расчёт недоступен.',409);
 if(kind==='deposit_return'&&entity.status!=='completed')throw new DomainError('Сначала подтвердите освобождение квартиры.',409);
 const entryId=uuid(),at=epoch(),reference=String(body.externalReference||'').trim();if(reference.length>200)throw new DomainError('Слишком длинный номер операции.');
 const balance=(positive:string,negative:string)=>`COALESCE((SELECT SUM(CASE WHEN kind='${positive}' THEN amount WHEN kind='${negative}' THEN -amount ELSE 0 END) FROM finance_entries WHERE booking_id=?),0)`;
 let guard='1=1',args:any[]=[];
 if(kind==='refund'){guard=balance('payment','refund')+'>=?';args=[bookingId,amount];}
 if(kind==='deposit_return'){guard=balance('deposit','deposit_return')+'>=?';args=[bookingId,amount];}
 if(kind==='job_payment'){guard='COALESCE((SELECT SUM(amount) FROM finance_entries WHERE job_id=? AND kind=\'job_payment\'),0)+?<=?';args=[jobId,amount,entity.fee];}
 if(kind==='payment'&&!provider){guard=balance('payment','refund')+'+?<=?';args=[bookingId,amount,entity.amount];}
 if(kind==='deposit'&&!provider){guard=balance('deposit','deposit_return')+'+?<=COALESCE((SELECT deposit FROM booking_terms WHERE booking_id=?),0)';args=[bookingId,amount,bookingId];}
 // Checking the balance in INSERT makes concurrent partial refunds safe.
 const statements=[q(db,`INSERT INTO finance_entries(id,owner_id,property_id,booking_id,job_id,kind,amount,currency,source,external_reference,note,actor_id,request_key,created_at) SELECT ?,?,?,?,?,?,?,'KZT',?,?,?,?,?,? WHERE ${guard}`,entryId,service.userId,propertyId,bookingId,jobId,kind,amount,provider?'provider':'owner',reference,note,actor,requestKey,at,...args)];
 if(provider){
  // Provider event uniqueness rolls back the entire batch on concurrent delivery.
  statements.push(q(db,"INSERT INTO provider_events(provider,event_id,intent_id,payload_hash,created_at) SELECT 'gateway',?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",provider.eventId,provider.intentId,provider.payloadHash,at,entryId));
  statements.push(q(db,"UPDATE payment_intents SET status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",provider.intentId,entryId));
 }
 if(bookingId){
  const netPayment="COALESCE((SELECT SUM(CASE WHEN kind='payment' THEN amount WHEN kind='refund' THEN -amount ELSE 0 END) FROM finance_entries WHERE booking_id=booking_terms.booking_id),0)",deposits="COALESCE((SELECT SUM(amount) FROM finance_entries WHERE booking_id=booking_terms.booking_id AND kind='deposit'),0)",returned="COALESCE((SELECT SUM(amount) FROM finance_entries WHERE booking_id=booking_terms.booking_id AND kind='deposit_return'),0)";
  statements.push(q(db,`UPDATE booking_terms SET paid_amount=${netPayment},deposit_status=CASE WHEN deposit=0 THEN 'not_required' WHEN ${deposits}>=deposit THEN 'owner_verified' ELSE 'pending' END,deposit_returned_at=CASE WHEN ${deposits}>0 AND ${returned}>=${deposits} THEN ? ELSE NULL END,refund_recorded_at=CASE WHEN EXISTS(SELECT 1 FROM finance_entries WHERE booking_id=booking_terms.booking_id AND kind='refund') AND ${netPayment}=0 THEN ? ELSE NULL END,version=version+1 WHERE booking_id=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)`,at,at,bookingId,entryId));
  statements.push(q(db,"UPDATE bookings SET payment_status=CASE WHEN (SELECT paid_amount FROM booking_terms WHERE booking_id=bookings.id)>=amount THEN 'owner_verified' ELSE 'unpaid' END WHERE id=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",bookingId,entryId));
 }
 if(jobId)statements.push(q(db,"UPDATE cleaning_jobs SET settled_at=CASE WHEN COALESCE((SELECT SUM(amount) FROM finance_entries WHERE job_id=cleaning_jobs.id AND kind='job_payment'),0)>=fee THEN ? ELSE NULL END WHERE id=? AND EXISTS(SELECT 1 FROM finance_entries WHERE id=?)",at,jobId,entryId));
 statements.push(q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)',uuid(),actor,bookingId||jobId||propertyId,JSON.stringify({action:'finance.recorded',entryId,kind,amount,source:provider?'provider':'owner'}),at,entryId));
 const recipient=bookingId?entity.guest_id:jobId?entity.assigned_to:null,role=jobId?'cleaner':'guest';
 if(recipient)statements.push(q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_entries WHERE id=?)',uuid(),recipient,'В журнале расчётов записана операция на '+amount+' ₸. Проверьте сведения в карточке и фактическое поступление.',role+':finance:'+entryId,0,at,entryId));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw new DomainError('Сумма превышает остаток расчёта или операция уже изменилась.',409);
 return {id:entryId,message:provider?'Подтверждённое событие провайдера учтено.':'Фактическая операция записана в журнал. Сервис не выполнял перевод.'};
}

export async function financeState(service:RentalService,role:Role){
 await service.requireRole(role);
 const where=role==='owner'?'f.owner_id=?':role==='guest'?'EXISTS(SELECT 1 FROM bookings b WHERE b.id=f.booking_id AND b.guest_id=?)':"f.kind='job_payment' AND EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.id=f.job_id AND j.assigned_to=?)";
 const entries=await rows(service.db,`SELECT f.id,f.property_id,f.booking_id,f.job_id,f.kind,f.amount,f.currency,f.source,f.created_at,CASE WHEN ?='owner' THEN f.note ELSE '' END note,p.title FROM finance_entries f JOIN properties p ON p.id=f.property_id WHERE ${where} ORDER BY f.created_at DESC,f.id LIMIT 200`,role,service.userId);
 const totals=await one(service.db,`SELECT COALESCE(SUM(${role==='cleaner'?'f.amount':"CASE WHEN f.kind='payment' THEN f.amount WHEN f.kind IN ('refund','job_payment','expense','compensation') THEN -f.amount ELSE 0 END"}),0) operatingBalance,COALESCE(SUM(CASE WHEN f.kind='deposit' THEN f.amount WHEN f.kind='deposit_return' THEN -f.amount ELSE 0 END),0) heldDeposits,COUNT(*) entryCount FROM finance_entries f WHERE ${where}`,service.userId);
 const breakdown=await rows(service.db,`SELECT kind,SUM(amount) amount FROM finance_entries f WHERE ${where} GROUP BY kind`,service.userId);
 const history=role==='owner'?await one(service.db,"SELECT (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='booking:'||b.id))+(SELECT COUNT(*) FROM cleaning_jobs j WHERE owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='job:'||j.id)) pending",service.userId,service.userId):null;
 return {entries,totals,breakdown,historyPending:history?.pending||0,currency:'KZT',note:'Учёт записанных операций; банковская выписка сверяется отдельно. Депозиты не включены в поступления минус расходы.'};
}

export async function createPaymentIntent(service:RentalService,body:Row,config:OperationConfig){
 await service.requireRole('guest');const key=boundedKey(body),bookingId=required(body.bookingId,'Бронь',100),kind=body.kind==='deposit'?'deposit':'payment';
 const b=await one(service.db,"SELECT b.*,p.owner_id,t.paid_amount,t.deposit FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND b.guest_id=? AND b.status='confirmed'",bookingId,service.userId);if(!b)throw new DomainError('Подтверждённая бронь недоступна.',403);
 if(!config.PAYMENT_GATEWAY_TOKEN||!config.PAYMENT_WEBHOOK_SECRET)throw new DomainError('Платёжный провайдер ещё не подключён. Оплата согласуется с владельцем.',503);
 await migrateFinanceEntity({db:service.db,userId:b.owner_id},'booking',bookingId);
 const endpoint=httpsEndpoint(config.PAYMENT_GATEWAY_URL),origin=httpsEndpoint(config.SITE_PUBLIC_URL).origin;
 const received=await one(service.db,"SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='deposit_return' THEN -amount ELSE 0 END),0) n FROM finance_entries WHERE booking_id=?",bookingId);
 const amount=kind==='payment'?Math.max(0,b.amount-b.paid_amount):Math.max(0,b.deposit-(received?.n||0));if(!amount)throw new DomainError('Эта сумма уже учтена.',409);
 let intent=await one(service.db,'SELECT * FROM payment_intents WHERE user_id=? AND request_key=?',service.userId,key);
 if(intent&&(intent.booking_id!==bookingId||intent.kind!==kind))throw new DomainError('Ключ оплаты уже использован.',409);
 if(intent?.status==='ready')return {id:intent.id,url:intent.checkout_url,amount:intent.amount};
 if(intent?.status==='paid')return {id:intent.id,message:'Оплата уже учтена.'};
 if(!intent){const id=uuid();await q(service.db,'INSERT INTO payment_intents(id,booking_id,user_id,kind,amount,request_key,created_at) VALUES (?,?,?,?,?,?,?)',id,bookingId,service.userId,kind,amount,key,epoch()).run();intent=await one(service.db,'SELECT * FROM payment_intents WHERE id=?',id);}
 if(intent!.amount!==amount)throw new DomainError('Остаток изменился. Создайте новую попытку оплаты.',409);
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+config.PAYMENT_GATEWAY_TOKEN,'Content-Type':'application/json','Idempotency-Key':intent!.id},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({intentId:intent!.id,amount,currency:'KZT',kind,returnUrl:origin+'/workspace/guest/bookings'})});
 if(!response.ok)throw new DomainError('Провайдер не подтвердил создание оплаты. Повторите с тем же ключом.',503);
 const value=await response.json() as Row,url=httpsEndpoint(value.checkoutUrl);if(value.intentId!==intent!.id||typeof value.reference!=='string'||value.reference.length>200)throw new DomainError('Ответ провайдера не прошёл проверку.',502);
 await q(service.db,"UPDATE payment_intents SET status='ready',checkout_url=?,provider_reference=? WHERE id=? AND status<>'paid'",url.href,value.reference,intent!.id).run();return {id:intent!.id,url:url.href,amount};
}

export async function acceptPaymentEvent(db:D1Database,raw:string,serviceForOwner:(id:string)=>RentalService){
 let body:Row;try{body=JSON.parse(raw);}catch{throw new DomainError('Неверный формат события.');}
 const eventId=required(body.eventId,'Событие',120),intentId=required(body.intentId,'Платёж',100),payloadHash=await hash(raw),old=await one(db,"SELECT * FROM provider_events WHERE provider='gateway' AND event_id=?",eventId);
 if(old){if(old.payload_hash!==payloadHash)throw new DomainError('Повторное событие содержит другие данные.',409);return {duplicate:true};}
 if(body.type!=='payment.succeeded'||body.currency!=='KZT')throw new DomainError('Неподдерживаемое платёжное событие.');
 const intent=await one(db,'SELECT i.*,p.owner_id FROM payment_intents i JOIN bookings b ON b.id=i.booking_id JOIN properties p ON p.id=b.property_id WHERE i.id=?',intentId);
 if(!intent||intent.amount!==body.amount)throw new DomainError('Событие не соответствует ожидаемой оплате.',409);
 if(intent.status==='paid')throw new DomainError('Платёж уже закрыт другим событием. Нужна сверка.',409);
 return recordFinance(serviceForOwner(intent.owner_id),{kind:intent.kind,bookingId:intent.booking_id,amount:intent.amount,note:'Подтверждённое событие платёжного провайдера',externalReference:intent.provider_reference,requestKey:'provider:'+intent.id},{eventId,intentId,payloadHash});
}
