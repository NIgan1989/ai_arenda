import {DomainError,required,number} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,hash,q,one,rows,type Row} from './operation-core';

const MAX_ROWS=25,MAX_BYTES=280000;
const sourceNames=['manual','krisha','booking','airbnb','other'];
const columns:Record<string,string>={title:'title',название:'title',city:'city',город:'city',district:'district',район:'district',address:'address',адрес:'address',description:'description',описание:'description',price:'price',цена:'price',rooms:'rooms',комнаты:'rooms',capacity:'capacity',гости:'capacity',cleaningminutes:'cleaningMinutes',уборкамин:'cleaningMinutes',externalid:'externalId',внешнийid:'externalId',photos:'photos',фото:'photos'};
const norm=(value:unknown)=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s.,;]+/g,' ').trim();
const addressKey=(value:Row)=>norm(value.city)+'|'+norm(value.address);

// RFC-style escaped fields, BOM, CRLF and quoted newlines; no network or formula evaluation.
export function parsePropertyCSV(content:string){
 const text=content.replace(/^\uFEFF/,'');let separator=',',quoted=false;
 const first=text.split(/\r?\n/,1)[0];let commas=0,semicolons=0;
 for(let i=0;i<first.length;i++){if(first[i]==='"'){if(first[i+1]==='"'&&quoted)i++;else quoted=!quoted;}else if(!quoted){if(first[i]===',')commas++;if(first[i]===';')semicolons++;}}
 if(semicolons>commas)separator=';';
 const records:string[][]=[];let record:string[]=[],field='',inside=false,closed=false;
 const cell=()=>{record.push(field);field='';closed=false;};const line=()=>{cell();if(record.some(v=>v.trim()!==''))records.push(record);record=[];if(records.length>MAX_ROWS+1)throw new DomainError('За один импорт можно подготовить до 25 квартир.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(inside){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{inside=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new DomainError('CSV: кавычки должны начинаться в начале поля.');inside=true;}
  else if(c===separator)cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
  else if(closed){if(c!==' '&&c!=='\t')throw new DomainError('CSV: после закрывающей кавычки нужен разделитель.');}
  else field+=c;
 }
 if(inside)throw new DomainError('CSV: поле в кавычках не закрыто.');if(field||record.length||closed)line();
 if(records.length<2)throw new DomainError('В CSV нужны заголовок и хотя бы одна квартира.');
 const headers=records.shift()!.map(h=>{const key=h.trim().toLocaleLowerCase('ru-RU').replace(/[\s_-]/g,'');return Object.hasOwn(columns,key)?columns[key]:undefined;});
 if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new DomainError('CSV: неизвестные или повторяющиеся столбцы. Используйте шаблон.');
 return records.map((cells,index)=>{if(cells.length!==headers.length)throw new DomainError('CSV: число полей не совпадает с заголовком в строке '+(index+2)+'.');return Object.fromEntries(headers.map((h,i)=>[h!,cells[i]]));});
}
function inputRows(body:Row){
 const content=required(body.content,'Файл импорта',MAX_BYTES);if(new TextEncoder().encode(content).length>MAX_BYTES)throw new DomainError('Файл должен быть не больше 280 КБ.',413);
 let values:unknown;if(body.format==='csv')values=parsePropertyCSV(content);else if(body.format==='json'){try{values=JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw new DomainError('Не удалось прочитать JSON.');}if(values&&typeof values==='object'&&!Array.isArray(values))values=(values as Row).properties;}else throw new DomainError('Выберите CSV или JSON.');
 if(!Array.isArray(values)||!values.length||values.length>MAX_ROWS)throw new DomainError('В файле должно быть от 1 до 25 квартир.');return values;
}
function validate(raw:unknown):Row{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DomainError('Квартира должна быть объектом с полями.');const row=raw as Row;
 // Publishing, ownership, readiness and automation permissions never come from an import.
 if(Object.keys(row).some(k=>!Object.values(columns).includes(k)))throw new DomainError('Неизвестное поле. Импорт принимает только столбцы шаблона и photos.');
 for(const key of ['price','rooms','capacity','cleaningMinutes'])if(row[key]!==undefined&&row[key]!==null&&!['number','string'].includes(typeof row[key]))throw new DomainError('Числовые поля принимают число или строку с числом.');
 if(row.externalId!==undefined&&row.externalId!==null&&typeof row.externalId!=='string'&&!(typeof row.externalId==='number'&&Number.isSafeInteger(row.externalId)&&row.externalId>=0))throw new DomainError('Внешний ID должен быть строкой или целым безопасным числом.');
 const value={title:required(row.title,'Название',120),city:required(row.city,'Город',80),district:required(row.district,'Район',120),address:required(row.address,'Адрес',300),description:required(row.description,'Описание',2500),price:number(row.price,'Цена за сутки',100,10000000),rooms:number(row.rooms,'Комнаты',1,20),capacity:number(row.capacity,'Гости',1,50),cleaningMinutes:number(row.cleaningMinutes??90,'Время уборки',30,1440),externalId:String(row.externalId??'').trim(),photos:row.photos??[]};
 if(value.externalId.length>150||/[\u0000-\u001f\u007f]/.test(value.externalId))throw new DomainError('Внешний ID — до 150 символов, без управляющих знаков.');
 if(typeof value.photos==='string'){try{value.photos=JSON.parse(value.photos);}catch{throw new DomainError('photos — JSON-массив ID ваших ранее загруженных фотографий.');}}
 if(!Array.isArray(value.photos)||value.photos.length>8||value.photos.some((p:unknown)=>typeof p!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(p))||new Set(value.photos).size!==value.photos.length)throw new DomainError('Можно указать до 8 ID своих фотографий. Ссылки на внешние фото не скачиваются.');
 return value;
}
export async function importState(service:RentalService){
 await service.requireRole('owner');return {previews:(await rows(service.db,'SELECT id,source,status,version,created_at,expires_at,result FROM property_imports WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 20',service.userId)).map(p=>({...p,result:p.result?JSON.parse(p.result):null})),sources:sourceNames,maxRows:MAX_ROWS,maxBytes:MAX_BYTES};
}
export async function previewPropertyImport(service:RentalService,body:Row){
 await service.requireRole('owner');
 if(body.id){const saved=await one(service.db,'SELECT * FROM property_imports WHERE id=? AND owner_id=?',required(body.id,'Предпросмотр',100),service.userId);if(!saved)throw new DomainError('Предпросмотр недоступен.',403);if(saved.status!=='prepared'||saved.expires_at<=epoch())throw new DomainError('Предпросмотр завершён или срок истёк. Загрузите файл заново.',409);const values=JSON.parse(saved.rows_json);return {preview:{id:saved.id,version:saved.version,payloadHash:saved.payload_hash,expiresAt:saved.expires_at,source:saved.source,rows:values,readyCount:values.filter((v:Row)=>v.status==='ready').length},message:'Сохранённый предпросмотр открыт.'};}
 const source=required(body.source||'manual','Источник',40);if(!sourceNames.includes(source))throw new DomainError('Выберите источник из списка.');
 const recent=await one(service.db,'SELECT COUNT(*) n FROM property_imports WHERE owner_id=? AND created_at>?',service.userId,epoch()-60);if(recent?.n>=5)throw new DomainError('Слишком много предпросмотров. Подождите минуту.',429);
 const values=inputRows(body),existing=await rows(service.db,'SELECT id,city,address FROM properties WHERE owner_id=? ORDER BY id',service.userId),links=await rows(service.db,'SELECT source,external_id,address_key,property_id FROM property_import_links WHERE owner_id=?',service.userId),ownPhotos=new Set((await rows(service.db,"SELECT id FROM media WHERE user_id=? AND kind='property'",service.userId)).map(p=>p.id)),seenAddresses=new Set<string>(),seenExternal=new Set<string>();
 const prepared:Row[]=[];
 for(let i=0;i<values.length;i++){
  let value:Row|undefined;try{
   value=validate(values[i]);if(value.photos.some((id:string)=>!ownPhotos.has(id)))throw new DomainError('Фотография недоступна вашему аккаунту.',403);const address=addressKey(value),external=value.externalId||'address:'+await hash(address),duplicate=links.find(l=>l.source===source&&l.external_id===external)||links.find(l=>l.address_key===address),property=existing.find(p=>addressKey(p)===address),repeated=seenAddresses.has(address)||seenExternal.has(external);
   const duplicateId=duplicate?.property_id||property?.id;prepared.push({number:i+1,status:duplicateId||repeated?'duplicate':'ready',value:{...value,externalId:external},addressKey:address,errors:duplicateId?['У вас уже есть квартира с этим адресом или внешним ID.']:repeated?['Этот объект повторяется внутри файла.']:[],...(duplicateId?{duplicateId}:{})});seenAddresses.add(address);seenExternal.add(external);
  }catch(error){if(!(error instanceof DomainError))throw error;prepared.push({number:i+1,status:'invalid',value:value?{title:value.title,city:value.city,address:value.address}:null,errors:[error.status===403?'Фотография недоступна вашему аккаунту.':error.message]});}
 }
 const id=uuid(),at=epoch(),payloadHash=await hash(JSON.stringify({source,rows:prepared}));
 const saved=await service.db.batch([q(service.db,'DELETE FROM property_imports WHERE owner_id=? AND status=\'prepared\' AND expires_at<=?',service.userId,at),q(service.db,"INSERT INTO property_imports(id,owner_id,source,payload_hash,rows_json,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM property_imports WHERE owner_id=? AND created_at>?)<5 AND (SELECT COUNT(*) FROM property_imports WHERE owner_id=? AND status='prepared' AND expires_at>?)<20",id,service.userId,source,payloadHash,JSON.stringify(prepared),at,at+900,service.userId,at-60,service.userId,at)]);
 if(!saved[1].meta.changes)throw new DomainError('Достигнут лимит предпросмотров. Подождите минуту или завершите подготовленные импорты.',429);
 return {preview:{id,version:1,payloadHash,expiresAt:at+900,source,rows:prepared,readyCount:prepared.filter(r=>r.status==='ready').length},message:'Предпросмотр готов. Квартиры ещё не созданы.'};
}
export async function commitPropertyImport(service:RentalService,body:Row){
 await service.requireRole('owner');if(body.confirmed!==true)throw new DomainError('Подтвердите создание выбранных черновиков.');
 const id=required(body.id,'Предпросмотр',100),preview=await one(service.db,'SELECT * FROM property_imports WHERE id=? AND owner_id=?',id,service.userId);if(!preview)throw new DomainError('Предпросмотр недоступен.',403);
 if(!Array.isArray(body.rowNumbers)||!body.rowNumbers.length||body.rowNumbers.length>MAX_ROWS||body.rowNumbers.some((v:unknown)=>!Number.isInteger(v)||Number(v)<1||Number(v)>MAX_ROWS)||new Set(body.rowNumbers).size!==body.rowNumbers.length)throw new DomainError('Выберите строки для импорта.');
 const numbers=[...body.rowNumbers].sort((a,b)=>a-b),commitHash=await hash(JSON.stringify(numbers));
 if(preview.payload_hash!==required(body.payloadHash,'Проверка предпросмотра',64))throw new DomainError('Предпросмотр изменился. Подготовьте его заново.',409);
 if(preview.status==='committed'){if(preview.commit_hash!==commitHash)throw new DomainError('Этот предпросмотр уже выполнен с другим набором строк.',409);return JSON.parse(preview.result);}
 if(preview.version!==number(body.expectedVersion,'Версия',1,1000000)||preview.expires_at<=epoch())throw new DomainError('Срок или версия предпросмотра изменились. Загрузите файл заново.',409);
 const prepared=JSON.parse(preview.rows_json) as Row[],selected=numbers.map(n=>prepared.find(r=>r.number===n));if(selected.some(r=>!r||r.status!=='ready'))throw new DomainError('Можно импортировать только строки без ошибок и дублей.',409);
 const existing=await rows(service.db,'SELECT id,city,address FROM properties WHERE owner_id=? ORDER BY id',service.userId),links=await rows(service.db,'SELECT * FROM property_import_links WHERE owner_id=?',service.userId),ownPhotos=new Set((await rows(service.db,"SELECT id FROM media WHERE user_id=? AND kind='property'",service.userId)).map(p=>p.id));
 for(const row of selected as Row[]){if(row.value.photos.some((id:string)=>!ownPhotos.has(id)))throw new DomainError('Фотография недоступна вашему аккаунту.',403);if(existing.some(p=>addressKey(p)===row.addressKey)||links.some(l=>l.address_key===row.addressKey||l.source===preview.source&&l.external_id===row.value.externalId)){const winner=await one(service.db,'SELECT status,commit_hash,result FROM property_imports WHERE id=? AND owner_id=?',id,service.userId);if(winner?.status==='committed'&&winner.commit_hash===commitHash)return JSON.parse(winner.result);throw new DomainError('После предпросмотра появился совпадающий объект. Загрузите файл заново.',409);}}
 const propertyIds=selected.map(()=>uuid()),at=epoch(),result={id,propertyIds,message:'Создано черновиков: '+propertyIds.length+'. Проверьте фото, характеристики, тарифы и правила перед публикацией.'},gate="EXISTS(SELECT 1 FROM property_imports WHERE id=? AND owner_id=? AND status='committed' AND commit_hash=? AND result=?)",gateArgs=[id,service.userId,commitHash,JSON.stringify(result)];
 const statements=[q(service.db,"UPDATE property_imports SET status='committed',commit_hash=?,result=?,version=version+1 WHERE id=? AND owner_id=? AND status='prepared' AND version=? AND expires_at>? AND (SELECT COALESCE(json_group_array(json_object('id',id,'city',city,'address',address)),'[]') FROM (SELECT id,city,address FROM properties WHERE owner_id=? ORDER BY id))=?",commitHash,JSON.stringify(result),id,service.userId,preview.version,at,service.userId,JSON.stringify(existing.map(p=>({id:p.id,city:p.city,address:p.address}))))];
 // Group rows per table while keeping each SQL statement at most 100 bound parameters.
 // A 25-property import uses fewer than 25 statements, rather than 151 queries.
 const values=selected.map((row,i)=>({row:row!,v:row!.value,key:propertyIds[i],revision:uuid()}));
 const insert=(table:string,columns:string[],entries:any[][])=>{
  const perChunk=Math.floor(100/(columns.length+gateArgs.length));
  for(let offset=0;offset<entries.length;offset+=perChunk){const chunk=entries.slice(offset,offset+perChunk),sql='INSERT INTO '+table+'('+columns.join(',')+') '+chunk.map(()=>('SELECT '+columns.map(()=>'?').join(',')+' WHERE '+gate)).join(' UNION ALL ');statements.push(q(service.db,sql,...chunk.flatMap(entry=>[...entry,...gateArgs])));}
 };
 insert('properties',['id','owner_id','demo_owner','title','city','district','address','description','price','rooms','capacity','cleaning_minutes','published','created_at'],values.map(({v,key})=>[key,service.userId,null,v.title,v.city,v.district,v.address,v.description,v.price,v.rooms,v.capacity,v.cleaningMinutes,0,at]));
 insert('property_details',['property_id','details','photos','version','revision','updated_at'],values.map(({v,key,revision})=>[key,'{}',JSON.stringify(v.photos),1,revision,at]));
 insert('property_operations',['property_id','updated_at'],values.map(({key})=>[key,at]));
 insert('property_policies',['property_id','revision','updated_at'],values.map(({key,revision})=>[key,revision,at]));
 insert('property_import_links',['owner_id','source','external_id','address_key','property_id','created_at'],values.map(({row,v,key})=>[service.userId,preview.source,v.externalId,row.addressKey,key,at]));
 insert('audit_events',['id','actor_id','entity_id','action','created_at'],values.map(({row,key})=>[uuid(),service.userId,key,JSON.stringify({action:'property.imported_draft',importId:id,source:preview.source,row:row.number}),at]));
 try{const changes=await service.db.batch(statements);if(!changes[0].meta.changes){const winner=await one(service.db,'SELECT status,commit_hash,result FROM property_imports WHERE id=? AND owner_id=?',id,service.userId);if(winner?.status==='committed'&&winner.commit_hash===commitHash)return JSON.parse(winner.result);throw new DomainError('Объекты или предпросмотр изменились. Обновите предпросмотр.',409);}}
 catch(error){if(error instanceof DomainError)throw error;if(/UNIQUE constraint failed/.test((error as Error).message))throw new DomainError('Совпадающий объект уже добавлен. Обновите предпросмотр.',409);throw error;}
 return result;
}
