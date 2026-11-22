import {DomainError} from './domain';
import {epoch,q,rows,type Row} from './operation-core';

// «Автопилот: решения и сроки». Every question the AI administrator waits on a person for, with two settings the person
// chooses: whether the AI decides by itself when nobody answers, and how long it waits. The defaults are what the
// service did before the settings existed, so nothing changes for a person who never opens them.
export type RuleRole='guest'|'owner'|'cleaner';
export type RuleKey='request'|'assign'|'accept'|'accept_fast'|'accept_day'|'unpaid'|'no_show'|'overdue_job'|'checkout'|'pay_remind';
type Rule={key:RuleKey;role:RuleRole;title:string;auto?:string;off?:string;note:string;time:string;options:number[];minutes:number;on:boolean};

export const DECISION_RULES:Rule[]=[
 {key:'request',role:'owner',title:'Заявка гостя',note:'Без ответа заявка истекает, а гостю ИИ предлагает похожее свободное жильё. В режиме «ИИ» заявки подтверждаются сразу.',time:'Время на решение',options:[10,15,30,60],minutes:15,on:true},
 {key:'assign',off:'Выключено: ИИ только предложит исполнителя, назначаете вы.',role:'owner',title:'Выбор исполнителя',auto:'ИИ назначает первого откликнувшегося',note:'Работает для жилья в режиме «ИИ». Если до уборки меньше часа, ИИ назначает сразу.',time:'Время на ваш выбор',options:[15,30,60],minutes:15,on:true},
 {key:'accept',off:'Выключено: ИИ проверит отчёт, а принимаете уборку вы.',role:'owner',title:'Приёмка уборки',auto:'ИИ принимает уборку по фотоотчёту',note:'Работает для жилья в режиме «ИИ»: если за это время вы не приняли уборку и не вернули её на доработку, ИИ примет отчёт без замечаний сам. Отчёт с замечаниями всегда решаете вы.',time:'Время на проверку',options:[30,60,120],minutes:60,on:true},
 // Asked by the audit of 2026-11-22: accepting at once before a near arrival is a separate permission, off unless the
 // owner turns it on. The check sees the photos, their time and the marks of problems, not how well the place is cleaned.
 {key:'accept_fast',off:'Выключено: перед близким заездом ИИ сразу пишет вам, а принимаете уборку вы.',role:'owner',title:'Быстрая приёмка перед заездом',auto:'ИИ принимает отчёт без замечаний сразу',note:'Работает для жилья в режиме «ИИ», если включена «Приёмка уборки», и только перед подтверждённой бронью; о заявке ИИ просто напишет вам. ИИ проверяет, что есть фото «до» и «после», что они загружены во время уборки и что нет отметок о проблемах. Насколько чисто, ИИ по фото не оценивает.',time:'Если до заезда меньше',options:[60,120],minutes:120,on:false},
 // Shown so the owner knows every way a report can be accepted without them; it has no switch (lib/owner-silence.ts).
 {key:'accept_day',role:'owner',title:'Отчёт ждёт сутки',note:'В любом режиме, даже «Я сам»: отчёт без замечаний, который сутки ждал вашего ответа, ИИ принимает, чтобы исполнитель не ждал. Отчёт с замечаниями передаётся администратору сервиса.',time:'ИИ примет через',options:[1440],minutes:1440,on:true},
 {key:'unpaid',off:'Выключено: ИИ сообщит, что срок оплаты прошёл, а решаете вы.',role:'owner',title:'Гость не оплатил',auto:'ИИ снимает неоплаченную бронь',note:'Частично оплаченную бронь ИИ не снимает никогда, это решаете вы.',time:'Ждать после срока оплаты',options:[30,60,120],minutes:30,on:true},
 {key:'no_show',off:'Выключено: ИИ спросит гостя и сообщит вам, а бронь снимаете вы.',role:'owner',title:'Гость не приехал',auto:'ИИ снимает бронь при неявке',note:'Только для жилья в режиме «ИИ»; без него решаете вы. Для почасовой брони ИИ ждёт не дольше 30 минут.',time:'Ждать после заезда',options:[60,120,240],minutes:120,on:true},
 {key:'overdue_job',off:'Выключено: ИИ напомнит исполнителю и сообщит вам, а замену ищете вы.',role:'owner',title:'Исполнитель не начал уборку',auto:'ИИ возвращает уборку в поиск',note:'Если жильё свободно и исполнитель не ответил на напоминание.',time:'Ждать после срока',options:[15,30,60],minutes:30,on:true},
 {key:'checkout',off:'Выключено: администратор сервиса не подключается, решаете вы.',role:'owner',title:'Гость не выехал',auto:'ИИ передаёт задержку администратору сервиса',note:'Через 30 минут после выезда ИИ в любом случае сообщит вам и исполнителю.',time:'Передать через',options:[60,120,240],minutes:120,on:true},
 {key:'pay_remind',off:'Выключено: ИИ не напоминает об оплате заранее.',role:'guest',title:'Оплата брони',auto:'Напоминать об оплате заранее',note:'Неоплаченная бронь снимается после срока оплаты, ИИ предупредит вас.',time:'Напомнить за',options:[60,180,720],minutes:180,on:true}
];
const byKey=new Map(DECISION_RULES.map(r=>[r.key,r]));

export type RuleValue={on:boolean;minutes:number};
export function ruleDefault(key:RuleKey):RuleValue{const r=byKey.get(key)!;return {on:r.on,minutes:r.minutes};}

// The person's choice for one question, or the service's default.
export async function ruleFor(db:D1Database,userId:string,key:RuleKey):Promise<RuleValue>{
 const r=byKey.get(key)!,row=await q(db,'SELECT auto,minutes FROM decision_rules WHERE user_id=? AND role=? AND rule=?',userId,r.role,key).first<Row>().catch(()=>null);
 return row?{on:r.auto?!!Number(row.auto):true,minutes:r.options.includes(Number(row.minutes))?Number(row.minutes):r.minutes}:ruleDefault(key);
}

// The settings screen: every question of the role with its choices.
export async function rulesState(db:D1Database,userId:string,role:RuleRole){
 const saved=new Map((await rows(db,'SELECT rule,auto,minutes FROM decision_rules WHERE user_id=? AND role=?',userId,role)).map((r:Row)=>[r.rule,r]));
 return {rules:DECISION_RULES.filter(r=>r.role===role).map(r=>{const s=saved.get(r.key);return {key:r.key,title:r.title,auto:r.auto||null,off:r.off||null,note:r.note,time:r.time,options:r.options,choices:r.options.map(m=>[m,minutesLabel(m)] as [number,string]),on:s&&r.auto?!!Number(s.auto):r.on,minutes:s&&r.options.includes(Number(s.minutes))?Number(s.minutes):r.minutes};})};
}

export async function saveRule(db:D1Database,userId:string,role:RuleRole,body:Row){
 const r=byKey.get(body.rule as RuleKey);
 if(!r||r.role!==role)throw new DomainError('Такой настройки нет.',404);
 const current=await ruleFor(db,userId,r.key);
 const on=r.auto&&typeof body.on==='boolean'?body.on:current.on,minutes=body.minutes===undefined?current.minutes:Number(body.minutes);
 if(!r.options.includes(minutes))throw new DomainError('Выберите время из предложенных.',400);
 await q(db,'INSERT INTO decision_rules(user_id,role,rule,auto,minutes,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,role,rule) DO UPDATE SET auto=excluded.auto,minutes=excluded.minutes,updated_at=excluded.updated_at',userId,role,r.key,on?1:0,minutes,epoch()).run();
 return {message:'Сохранено.',...await rulesState(db,userId,role)};
}

// «15 мин», «1 ч», «12 ч»: the label of a choice.
export function minutesLabel(m:number){return m<60?m+' мин':m%60===0?m/60+' ч':Math.floor(m/60)+' ч '+m%60+' мин';}
