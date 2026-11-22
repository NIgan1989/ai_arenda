import {required} from './domain';
import type {RentalService} from './service';
import {redactAIText,type AIConfig} from './ai';
import {askModelJSON,modelReady} from './ai-json';
import {aiDataPermission} from './ai-data-permission';
import type {Row} from './operation-core';
import {propertyTypes,amenities,checkinMethods} from './listings';
import {cleanModelListing} from './listing-draft';

// «Расскажите — ИИ заполнит»: the owner's own words about a place become the fields of the listing. The model only reads:
// it never saves or publishes, the owner checks every field, and what it says is checked by cleanModelListing
// (lib/listing-draft.ts). No model, no permission or no answer: the app keeps what the rules read.
export const LISTING_TEXT_MAX=2000;
const num={type:['integer','null']},str={type:['string','null']},flag={type:['boolean','null']};
const fields:Row={
 type:{type:['string','null'],enum:[...Object.keys(propertyTypes),null],description:'Тип объекта.'},
 rooms:num,capacity:{...num,description:'Сколько гостей вмещает.'},beds:{...num,description:'Спальных мест.'},bathrooms:num,area:{...num,description:'Площадь, м².'},floor:num,floors:{...num,description:'Этажей в доме.'},
 city:str,district:{...str,description:'Район или микрорайон без слова «район».'},address:{...str,description:'Улица и дом, номер квартиры, как написал владелец, без города.'},
 price:{...num,description:'Цена за сутки в тенге; у банкетного зала и кафе — цена на одного гостя.'},hourlyPrice:{...num,description:'Цена за час в тенге.'},minHours:{...num,description:'Минимум часов при почасовой аренде.'},nightlyPrice:{...num,description:'Цена за ночь в тенге.'},
 deposit:{...num,description:'Депозит/залог в тенге; 0 если сказано «без депозита».'},cleaningFee:{...num,description:'Сколько владелец платит за уборку, тенге.'},
 leastGuests:{...num,description:'Зал: минимум гостей.'},includedGuests:{...num,description:'Баня: гостей входит в цену.'},extraGuestPrice:{...num,description:'Баня: доплата за гостя сверх входящих, тенге.'},prepMinutes:{...num,description:'Баня: минут на растопку.'},
 amenities:{type:'array',items:{type:'string',enum:Object.keys(amenities)},description:'Только то, что прямо названо как имеющееся.'},
 pets:{...flag,description:'Можно ли с питомцами.'},smoking:{...flag,description:'Разрешено ли курить.'},parties:{...flag,description:'Разрешены ли шумные мероприятия.'},
 checkinMethod:{type:['string','null'],enum:[...Object.keys(checkinMethods),null],description:'meet — встреча, lockbox — сейф для ключей, smartlock — кодовый замок, reception — стойка регистрации.'},
 checkinTime:{...str,description:'Время заезда ЧЧ:ММ.'},checkoutTime:{...str,description:'Время выезда ЧЧ:ММ.'},
 ownStaff:{...flag,description:'Убирает свой персонал или сам владелец.'},name:{...str,description:'Собственное название бани, сауны или зала, без кавычек.'},
};
const schema={type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false};
const instructions=`Ты читаешь рассказ владельца об объекте для сдачи на часы и сутки в Казахстане (квартира, дом, баня, сауна, банкетный зал и т.п.) и раскладываешь его по полям анкеты. Владельцу не отвечай.
Пиши в поле только то, что владелец сказал прямо или однозначно: «двушка» — 2 комнаты, «15 тыс» — 15000, «3/9 этаж» — этаж 3 из 9. Чего нет в рассказе — null (для amenities — пустой список). Ничего не придумывай и не угадывай: цену, адрес, район, площадь без слов владельца не ставь.
Рассказ может быть на русском, казахском или английском; название района и адрес пиши как в рассказе. Суммы — целые числа в тенге.`;

/** status: 'ok' with `fields`, 'off' (no model), 'permission' (no consent to send text to the model) or 'busy'. */
export async function understandListing(s:RentalService,body:Row,config:AIConfig={}){
 await s.requireRole('owner');
 const text=required(body.text,'Рассказ',LISTING_TEXT_MAX);
 if(!modelReady(config))return {status:'off' as const};
 if(!(await aiDataPermission(s)).allowed)return {status:'permission' as const};
 const parsed=await askModelJSON(s.db,s.userId,config,{name:'listing_fields',instructions,input:[{role:'user',content:redactAIText(text)}],schema,maxTokens:600,timeoutMs:20000});
 return parsed?{status:'ok' as const,fields:cleanModelListing(parsed)}:{status:'busy' as const};
}
