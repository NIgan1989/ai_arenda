import {DomainError,required} from './domain';
import type {RentalService} from './service';
import type {AIConfig} from './ai';
import {askModelJSON,modelReady} from './ai-json';
import {mediaData} from './media-store';
import {one,rows,q,uuid,epoch,type Row} from './operation-core';
import {amenities as AMENITIES} from './listings';
import {RENOVATIONS,STAY_CLASSES,classOfRow,hasClass,isStayClass,suggestClass,type Renovation} from './stay-class';

// The class of a place to stay on the server (lib/stay-class.ts): the AI's guess while the owner adds a place, the
// owner's choice, and an administrator's correction. Every change is written to the audit log.

// The model looks at no more than three of the owner's own photos, at low detail, and says only the renovation:
// the class itself is decided by the rules, so the model cannot raise a place above what its space and amenities allow.
const PHOTOS_LOOKED=3;
const renovationSchema={type:'object',properties:{renovation:{type:['string','null'],enum:[...RENOVATIONS,null],description:'old — старый или советский ремонт, ordinary — обычный, good — свежий современный ремонт, designer — дизайнерский, дорогие материалы. null, если по фото не понять.'}},required:['renovation'],additionalProperties:false};
const renovationInstructions='Ты смотришь фото жилья, которое сдают посуточно в Казахстане, и оцениваешь только ремонт и состояние интерьера. Ничего не придумывай: если на фото не интерьер или не понять, ответь null.';

async function photoRenovation(s:RentalService,ids:string[],config:AIConfig&{BUCKET?:R2Bucket}):Promise<Renovation|null>{
 if(!ids.length||!modelReady(config))return null;
 const media=await rows(s.db,`SELECT id,data,object_key FROM media WHERE kind='property' AND user_id=? AND id IN (SELECT value FROM json_each(?))`,s.userId,JSON.stringify(ids.slice(0,PHOTOS_LOOKED)));
 const images:string[]=[];
 for(const m of media){try{images.push(await mediaData(m,config.BUCKET));}catch{/* a photo the storage cannot give is skipped */}}
 if(!images.length)return null;
 const answer=await askModelJSON(s.db,s.userId,config,{name:'stay_renovation',instructions:renovationInstructions,schema:renovationSchema,maxTokens:60,timeoutMs:20000,
  // A low-detail picture is a fixed small number of tokens: the AI budget counts it, not the size of the file.
  budgetBytes:2000+images.length*1000,
  input:[{role:'user',content:[{type:'input_text',text:'Какой здесь ремонт?'},...images.map(image_url=>({type:'input_image',image_url,detail:'low'}))]}]});
 const v=answer?.renovation;
 return (RENOVATIONS as readonly string[]).includes(v)?v as Renovation:null;
}

/** «Класс» while the owner adds a place: the rules from the facts, the photos when the model may look at them. */
export async function guessStayClass(s:RentalService,body:Row,config:AIConfig&{BUCKET?:R2Bucket}={}){
 await s.requireRole('owner');
 const type=String(body.type||'apartment');
 if(!hasClass(type))return {stayClass:null,reasons:[],from:'rules'};
 const ids=Array.isArray(body.photos)?body.photos.filter((v:unknown)=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v as string)).slice(0,8):[];
 const facts={type,area:Number(body.area)||0,capacity:Number(body.capacity)||1,rooms:Number(body.rooms)||1,
  amenities:Array.isArray(body.amenities)?body.amenities.filter((a:unknown)=>typeof a==='string'&&Object.hasOwn(AMENITIES,a as string)):[],
  text:String(body.text||'').slice(0,2500)};
 let photos:Renovation|null=null;
 try{photos=await photoRenovation(s,ids,config);}catch{/* the rules' guess stays */}
 return suggestClass({...facts,photos});
}

// Who may set the class: the owner of the place ('owner', or 'ai' when he keeps the AI's guess) or a platform administrator.
async function writeClass(s:RentalService,propertyId:string,stayClass:unknown,by:'ai'|'owner'|'admin'){
 if(!isStayClass(stayClass))throw new DomainError('Выберите класс: '+STAY_CLASSES.length+' варианта.');
 const p=await one(s.db,"SELECT p.id,p.owner_id,p.stay_class,p.stay_class_by,json_extract(d.details,'$.type') type FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.archived_at IS NULL",propertyId);
 if(!p||(by!=='admin'&&p.owner_id!==s.userId))throw new DomainError('Жильё не найдено.',404);
 if(!hasClass(p.type||'apartment'))throw new DomainError('Класс есть только у жилья, не у бани и не у зала.');
 if(p.stay_class_by==='admin'&&by!=='admin')throw new DomainError('Класс поправил администратор сервиса. Если не согласны, напишите ИИ-администратору.',409);
 if(p.stay_class===stayClass&&p.stay_class_by===by)return {stayClass,by};
 await s.db.batch([
  q(s.db,'UPDATE properties SET stay_class=?,stay_class_by=? WHERE id=?',stayClass,by,propertyId),
  q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,propertyId,JSON.stringify({action:'property.class',from:p.stay_class||null,to:stayClass,by}),epoch()),
 ]);
 return {stayClass,by};
}

/** The owner keeps the AI's class ('ai') or chooses his own ('owner'). An administrator's class is changed only by him. */
export async function setStayClass(s:RentalService,body:Row){
 await s.requireRole('owner');
 const propertyId=required(body.propertyId,'Жильё',100),by=body.by==='ai'?'ai':'owner';
 return writeClass(s,propertyId,body.stayClass,by);
}

/** «Классы жилья» for the platform administrator: the published places of a city with their class and who set it. */
export async function adminClassList(s:RentalService,params:Row){
 // The administrator's own city by default (the pilot is one city); ?city= names another, ?city=* every city.
 const asked=String(params.city||'').trim().slice(0,80),city=asked==='*'?'':asked||String((await s.profile())?.city||'');
 const list=await rows(s.db,`SELECT p.id,p.title,p.city,p.district,p.price,p.rooms,p.capacity,p.description,p.stay_class,p.stay_class_by,d.details FROM properties p LEFT JOIN property_details d ON d.property_id=p.id
  WHERE p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND (?='' OR p.city=?) ORDER BY CASE WHEN p.stay_class_by='admin' THEN 1 ELSE 0 END,p.created_at DESC LIMIT 100`,city,city);
 return {items:list.filter(p=>hasClass(JSON.parse(p.details||'{}').type||'apartment')).map(p=>({id:p.id,title:p.title,city:p.city,district:p.district,price:p.price,stayClass:classOfRow(p),by:p.stay_class_by||'estimate'}))};
}
export async function adminSetClass(s:RentalService,body:Row){
 return writeClass(s,required(body.propertyId,'Жильё',100),body.stayClass,'admin');
}
