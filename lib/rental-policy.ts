import {t as tr} from './i18n';
import {DomainError,number,required} from './domain';
import {prepayChoice} from './prepay';
import {servicesOf} from './venue-services';
type Row=Record<string,any>;
export const defaultPolicy={hourly_price:0,min_hours:2,nightly_price:0,checkin_minutes:840,checkout_minutes:720,deposit:0,house_rules:'',auto_confirm:0,auto_assign:0,cleaning_fee:0,cleaning_budget:0,max_discount_percent:0,minimum_rate:0,repair_budget:0,auto_extension:0,max_extension_hours:0,mandate_until:0,escalation_contact:'',included_guests:0,extra_guest_price:0,prep_minutes:0,prepay_percent:0,repeat_discount:0,venue_hours:'',version:0};
export function mandateActive(policy:Row,t=Math.floor(Date.now()/1000)){return !policy.mandate_until||policy.mandate_until>t;}
export function publicPolicy(policy:Row=defaultPolicy){const {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,auto_confirm,included_guests,extra_guest_price,prep_minutes,prepay_percent,repeat_discount,venue_hours,version}={...defaultPolicy,...policy};return {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,included_guests,extra_guest_price,prep_minutes,prepay_percent,repeat_discount,venue_hours,auto_confirm:mandateActive(policy)?auto_confirm:0,version};}
export function clock(minutes:number){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
export function minutes(value:unknown){const match=String(value).match(/^(\d{2}):(\d{2})$/);if(!match||+match[1]>23||+match[2]>59)throw new DomainError('Укажите время в формате ЧЧ:ММ.');return +match[1]*60 + +match[2];}
export function policyInput(body:Row){
  const policy={hourly_price:number(body.hourlyPrice,'Цена за час',0,10000000),min_hours:number(body.minHours,'Минимум часов',1,24),nightly_price:number(body.nightlyPrice,'Цена за ночь',0,10000000),checkin_minutes:minutes(body.checkinTime),checkout_minutes:minutes(body.checkoutTime),deposit:number(body.deposit,'Депозит',0,10000000),house_rules:required(body.houseRules,'Правила проживания',2500),auto_confirm:body.autoConfirm===true?1:0,cleaning_fee:number(body.cleaningFee,'Стоимость уборки',0,1000000),cleaning_budget:number(body.cleaningBudget,'Лимит на уборку',0,1000000)};
  if(policy.cleaning_fee>policy.cleaning_budget)throw new DomainError('Стоимость уборки превышает разрешённый владельцем лимит.');
  const mandate={max_discount_percent:number(body.maxDiscountPercent??0,'Лимит скидки, %',0,50),minimum_rate:number(body.minimumRate??0,'Минимальная ставка',0,10000000),repair_budget:number(body.repairBudget??0,'Бюджет одного ремонта',0,10000000),auto_extension:body.autoExtension===true?1:0,max_extension_hours:number(body.maxExtensionHours??0,'Предел продления, ч.',0,168),mandate_until:body.mandateUntil?Math.floor(Date.parse(String(body.mandateUntil))/1000):0,escalation_contact:String(body.escalationContact||'').trim()};
  if(!Number.isFinite(mandate.mandate_until)||mandate.mandate_until<0||mandate.escalation_contact.length>200)throw new DomainError('Проверьте срок полномочий и контакт ответственного.');
  if(mandate.auto_extension&&!mandate.max_extension_hours)throw new DomainError('Укажите предел автоматического продления.');
  if((policy.auto_confirm||mandate.auto_extension)&&mandate.mandate_until&&!mandateActive(mandate))throw new DomainError('Срок автоматических полномочий уже истёк.');
  if((policy.auto_confirm||mandate.auto_extension)&&mandate.minimum_rate&&[number(body.dailyPrice,'Цена за сутки',100,10000000),policy.hourly_price,policy.nightly_price].some(rate=>rate>0&&rate<mandate.minimum_rate))throw new DomainError('Один из тарифов ниже минимальной разрешённой ставки.');
  if(body.autoAssign===true&&mandate.mandate_until&&!mandateActive(mandate))throw new DomainError('Срок автоматических полномочий уже истёк.');
  // The guest surcharge and the reminder to get ready (a bath is heated before the guests). An older app sends none
  // of them: the keys are then left out, so saving keeps what is stored.
  const extra:Row={};
  if(body.includedGuests!==undefined)extra.included_guests=number(body.includedGuests,'Гостей в цене',0,1000);
  if(body.extraGuestPrice!==undefined)extra.extra_guest_price=number(body.extraGuestPrice,'Доплата за гостя',0,1000000);
  if(body.prepMinutes!==undefined)extra.prep_minutes=number(body.prepMinutes,'Подготовка, минут',0,720);
  // «Предоплата или оплата при заселении» (lib/prepay.ts): 0, 10, 20, 30, 50 or 100 percent paid before the arrival.
  if(body.prepayPercent!==undefined){const share=prepayChoice(body.prepayPercent);if(share===null)throw new DomainError('Выберите предоплату: при заселении, 10, 20, 30, 50 или 100%.');extra.prepay_percent=share;}
  // «Скидка постоянного гостя»: 0 (off), 5, 10 or 15 percent for a guest who already stayed with this owner.
  if(body.repeatDiscount!==undefined){const v=Number(body.repeatDiscount);if(!REPEAT_CHOICES.includes(v))throw new DomainError('Выберите скидку постоянного гостя: нет, 5, 10 или 15%.');extra.repeat_discount=v;}
  return {...policy,...mandate,auto_assign:body.autoAssign===true?1:0,...extra};
}
export const REPEAT_CHOICES=[0,5,10,15];
/** The price of a unit for a regular guest: the owner's percent off, the amount stays periods × price. */
export function withRepeatDiscount<T extends {periods:number;price:number;amount:number}>(pricing:T,percent:number):T&{repeat?:{percent:number;regular:number}}{
  const pct=Math.floor(Number(percent)||0);if(pct<=0||pct>30)return pricing;
  const price=Math.max(0,Math.round(pricing.price*(100-pct)/100));
  return price<pricing.price?{...pricing,price,amount:price*pricing.periods,repeat:{percent:pct,regular:pricing.price}}:pricing;
}
// Guests above the number the price covers pay extra for every hour (or day): «2 000 ₸ в час с человека сверх шести».
// The surcharge is part of the rate, so the amount stays periods × price everywhere (terms, cancellation, changes).
export function guestSurcharge(policy:Row,guests:number){
  const included=Number(policy?.included_guests)||0,extra=Number(policy?.extra_guest_price)||0;
  return included>0&&extra>0?Math.max(0,Math.floor(Number(guests)||0)-included)*extra:0;
}
export function withGuests<T extends {periods:number;price:number;amount:number}>(pricing:T,policy:Row,guests:number){
  const add=guestSurcharge(policy,guests);
  return add?{...pricing,price:pricing.price+add,amount:pricing.amount+add*pricing.periods,guestSurcharge:add,extraGuests:Math.floor(guests)-Number(policy.included_guests)}:pricing;
}
// The night a nightly stay starts on, as a Kazakhstan day number: from the check-in time to midnight it is that
// day's night, and a late arrival after midnight, before the check-out time, still belongs to the night before.
// null between the check-out and the check-in time: that is an early check-in, not a night.
function nightOf(policy:Row,start:number){
  const local=start+18000,day=Math.floor(local/86400),time=local%86400;
  if(time>=policy.checkin_minutes*60)return day;
  if(time<policy.checkout_minutes*60&&policy.checkout_minutes<policy.checkin_minutes)return day-1;
  return null;
}
// The names of the units as the app shows them through t(quote.unitLabel): listed for scripts/i18n-missing.mjs.
export const UNIT_LABELS=/* i18n */['начатые сутки (24 часа)','начатый час','ночь','услуга'] as const;
export type RentalPrice={billingMode:string;periods:number;price:number;amount:number;unitLabel:string};
/** The price a search shows for a place (simulation of 2026-11-28): a car place sells services, so its card shows the
 * cheapest service («от 3 000 ₸ за услугу») whatever time was asked, never the hour price and never «nothing found»
 * for half an hour. Every other place is priced by its tariff. */
export function placePrice(p:Row,start:number,end:number,mode:unknown='daily'):RentalPrice{
  const services=servicesOf(p.details);
  if(services.length&&mode==='hourly'){const least=Math.min(...services.map(s=>s.price));return {billingMode:'hourly',periods:1,price:least,amount:least,unitLabel:'услуга'};}
  return rentalPrice(p.price,p.policy,start,end,mode);
}
export function rentalPrice(dailyPrice:number,policy:Row,start:number,end:number,mode:unknown='daily'):RentalPrice{
  let units:number,price:number,label:string;
  if(mode==='daily'){units=Math.ceil((end-start)/86400);price=dailyPrice;label='начатые сутки (24 часа)';}
  else if(mode==='hourly'){
    if(!policy.hourly_price)throw new DomainError('Почасовая аренда для этого жилья выключена.');
    if(end-start<policy.min_hours*3600)throw new DomainError(`Минимальная почасовая аренда — ${policy.min_hours} ч.`);
    units=Math.ceil((end-start)/3600);price=policy.hourly_price;label='начатый час';
  }else if(mode==='nightly'){
    if(!policy.nightly_price)throw new DomainError('Тариф по ночам для этого жилья выключен.');
    const localEnd=end+18000,night=nightOf(policy,start);
    if(night===null||localEnd%86400!==policy.checkout_minutes*60)throw new DomainError(`По тарифу за ночь заезд с ${clock(policy.checkin_minutes)}, выезд в ${clock(policy.checkout_minutes)}. Время Казахстана.`);
    units=Math.floor(localEnd/86400)-night;if(units<1)throw new DomainError('По тарифу за ночь нужен выезд на следующий день или позже.');
    price=policy.nightly_price;label='ночь';
  }else if(mode==='night'){
    // «На ночь»: the owner's nightly tariff where it applies and is cheaper, otherwise started days.
    const daily=rentalPrice(dailyPrice,policy,start,end,'daily');
    if(!(policy.nightly_price>0))return daily;
    try{const nightly=rentalPrice(dailyPrice,policy,start,end,'nightly');return nightly.amount<=daily.amount?nightly:daily;}catch(error){if(error instanceof DomainError)return daily;throw error;}
  }else throw new DomainError('Выберите доступный тариф.');
  return {billingMode:String(mode),periods:units,price,amount:units*price,unitLabel:label};
}
// Amendments keep the nightly tariff and add started hours outside its clock times.
export function changeRentalPrice(dailyPrice:number,policy:Row,start:number,end:number,mode:unknown){
  if(mode!=='nightly')return {...rentalPrice(dailyPrice,policy,start,end,mode),extraHours:0,extraRate:0};
  // A late arrival keeps its night; only a check-in before the check-in time adds hours.
  const night=nightOf(policy,start),coreStart=night===null?Math.floor((start+18000)/86400)*86400-18000+policy.checkin_minutes*60:start;
  const coreEnd=Math.floor((end+18000)/86400)*86400-18000+policy.checkout_minutes*60;
  const base=rentalPrice(dailyPrice,policy,coreStart,coreEnd,'nightly');
  const earlyHours=Math.max(0,Math.ceil((coreStart-start)/3600)),lateHours=Math.max(0,Math.ceil((end-coreEnd)/3600)),extraHours=earlyHours+lateHours;
  if(extraHours&&!policy.hourly_price)throw new DomainError('Для раннего заезда или позднего выезда по ночному тарифу владелец должен настроить стоимость часа.');
  return {...base,amount:base.amount+extraHours*policy.hourly_price,extraHours,extraRate:policy.hourly_price,earlyHours,lateHours};
}
// The place is made ready before the guests (a bath is heated, a hall is laid): a stay cannot start sooner than
// prep_minutes from now. 0 = the place needs no time.
export const prepSeconds=(policy:Row)=>Math.max(0,Number(policy?.prep_minutes)||0)*60;
export const tooSoon=(policy:Row,start:number,at:number)=>prepSeconds(policy)>0&&start<at+prepSeconds(policy);
/** "1 ч", "30 мин", "1 ч 30 мин". */
export function prepWords(minutes:number){const h=Math.floor(minutes/60),m=minutes%60;return [h?tr('{h} ч',{h}):'',m?tr('{m} мин',{m}):''].filter(Boolean).join(' ');}
