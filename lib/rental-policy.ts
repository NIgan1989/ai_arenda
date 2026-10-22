import {DomainError,number,required} from './domain';
type Row=Record<string,any>;
export const defaultPolicy={hourly_price:0,min_hours:2,nightly_price:0,checkin_minutes:840,checkout_minutes:720,deposit:0,house_rules:'',auto_confirm:0,cleaning_fee:0,cleaning_budget:0,max_discount_percent:0,minimum_rate:0,repair_budget:0,auto_extension:0,max_extension_hours:0,mandate_until:0,escalation_contact:'',version:0};
export function mandateActive(policy:Row,t=Math.floor(Date.now()/1000)){return !policy.mandate_until||policy.mandate_until>t;}
export function publicPolicy(policy:Row=defaultPolicy){const {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,auto_confirm,version}={...defaultPolicy,...policy};return {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,auto_confirm:mandateActive(policy)?auto_confirm:0,version};}
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
  return {...policy,...mandate};
}
export function rentalPrice(dailyPrice:number,policy:Row,start:number,end:number,mode:unknown='daily'){
  let units:number,price:number,label:string;
  if(mode==='daily'){units=Math.ceil((end-start)/86400);price=dailyPrice;label='начатые сутки (24 часа)';}
  else if(mode==='hourly'){
    if(!policy.hourly_price)throw new DomainError('Почасовая аренда для этой квартиры выключена.');
    if(end-start<policy.min_hours*3600)throw new DomainError(`Минимальная почасовая аренда — ${policy.min_hours} ч.`);
    units=Math.ceil((end-start)/3600);price=policy.hourly_price;label='начатый час';
  }else if(mode==='nightly'){
    if(!policy.nightly_price)throw new DomainError('Тариф по ночам для этой квартиры выключен.');
    const localStart=start+18000,localEnd=end+18000;
    if(localStart%86400!==policy.checkin_minutes*60||localEnd%86400!==policy.checkout_minutes*60)throw new DomainError(`По тарифу за ночь заезд в ${clock(policy.checkin_minutes)}, выезд в ${clock(policy.checkout_minutes)}. Время Казахстана.`);
    units=Math.floor(localEnd/86400)-Math.floor(localStart/86400);if(units<1)throw new DomainError('По тарифу за ночь нужен выезд на следующий день или позже.');
    price=policy.nightly_price;label='ночь';
  }else throw new DomainError('Выберите доступный тариф.');
  return {billingMode:String(mode),periods:units,price,amount:units*price,unitLabel:label};
}
// Amendments keep the nightly tariff and add started hours outside its clock times.
export function changeRentalPrice(dailyPrice:number,policy:Row,start:number,end:number,mode:unknown){
  if(mode!=='nightly')return {...rentalPrice(dailyPrice,policy,start,end,mode),extraHours:0,extraRate:0};
  const coreStart=Math.floor((start+18000)/86400)*86400-18000+policy.checkin_minutes*60;
  const coreEnd=Math.floor((end+18000)/86400)*86400-18000+policy.checkout_minutes*60;
  const base=rentalPrice(dailyPrice,policy,coreStart,coreEnd,'nightly');
  const earlyHours=Math.max(0,Math.ceil((coreStart-start)/3600)),lateHours=Math.max(0,Math.ceil((end-coreEnd)/3600)),extraHours=earlyHours+lateHours;
  if(extraHours&&!policy.hourly_price)throw new DomainError('Для раннего заезда или позднего выезда по ночному тарифу владелец должен настроить стоимость часа.');
  return {...base,amount:base.amount+extraHours*policy.hourly_price,extraHours,extraRate:policy.hourly_price,earlyHours,lateHours};
}
