import {DomainError,number,required} from './domain';
type Row=Record<string,any>;
export const defaultPolicy={hourly_price:0,min_hours:2,nightly_price:0,checkin_minutes:840,checkout_minutes:720,deposit:0,house_rules:'',auto_confirm:0,cleaning_fee:0,cleaning_budget:0,version:0};
export function publicPolicy(policy:Row=defaultPolicy){const {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,auto_confirm,version}={...defaultPolicy,...policy};return {hourly_price,min_hours,nightly_price,checkin_minutes,checkout_minutes,deposit,house_rules,auto_confirm,version};}
export function clock(minutes:number){return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
export function minutes(value:unknown){const match=String(value).match(/^(\d{2}):(\d{2})$/);if(!match||+match[1]>23||+match[2]>59)throw new DomainError('Укажите время в формате ЧЧ:ММ.');return +match[1]*60 + +match[2];}
export function policyInput(body:Row){
  const policy={hourly_price:number(body.hourlyPrice,'Цена за час',0,10000000),min_hours:number(body.minHours,'Минимум часов',1,24),nightly_price:number(body.nightlyPrice,'Цена за ночь',0,10000000),checkin_minutes:minutes(body.checkinTime),checkout_minutes:minutes(body.checkoutTime),deposit:number(body.deposit,'Депозит',0,10000000),house_rules:required(body.houseRules,'Правила проживания',2500),auto_confirm:body.autoConfirm===true?1:0,cleaning_fee:number(body.cleaningFee,'Стоимость уборки',0,1000000),cleaning_budget:number(body.cleaningBudget,'Лимит на уборку',0,1000000)};
  if(policy.cleaning_fee>policy.cleaning_budget)throw new DomainError('Стоимость уборки превышает разрешённый владельцем лимит.');
  return policy;
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
