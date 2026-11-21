import {t} from './i18n';
// One line about the «Автопилот» of one flat, the same on the site and in the app. Since 2026-11-22 the AI is part of
// the one tariff in percent (rate, basis points): it costs nothing extra. price/cap/included are the old tariff.
export type FlatAutopilot={id:string;managed:boolean;ready:boolean;ownStaff:boolean;cleaningFee:number;price:number;cap?:number;included?:boolean;rate?:number;trialDays:number;charge:boolean};
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
export function flatAutopilotNote(f:FlatAutopilot){
 if(!f.managed&&!f.ready)return t('Сначала заполните правила и цены жилья: по ним ИИ отвечает гостям');
 if(f.rate!==undefined)return f.managed?t('ИИ отвечает гостям и заказывает уборки. Входит в тариф {rate} с брони, без доплат',{rate:percent(f.rate)}):t('ИИ будет отвечать гостям и заказывать уборки. Входит в тариф {rate} с брони, без доплат',{rate:percent(f.rate)});
 if(f.included)return f.managed?t('ИИ отвечает гостям и заказывает уборки. Входит в «Всё включено»'):t('ИИ будет отвечать гостям и заказывать уборки. Входит в «Всё включено»');
 const v={sum:money(f.price),cap:money(f.cap||0)};
 if(f.managed)return f.cap
  ?(f.charge?t('ИИ отвечает гостям и заказывает уборки. {sum} за бронь, которую провёл ИИ, не больше {cap} в месяц',v):t('ИИ отвечает гостям и заказывает уборки. {sum} за бронь, которую провёл ИИ, не больше {cap} в месяц, пока бесплатно',v))
  :(f.charge?t('ИИ отвечает гостям и заказывает уборки. {sum} за бронь, которую провёл ИИ',v):t('ИИ отвечает гостям и заказывает уборки. {sum} за бронь, которую провёл ИИ, пока бесплатно',v));
 return f.cap?t('ИИ будет отвечать гостям и заказывать уборки. {sum} за бронь, которую провёл ИИ, не больше {cap} в месяц. Нет броней — нет платы',v):t('ИИ будет отвечать гостям и заказывать уборки. {sum} за бронь, которую провёл ИИ. Нет броней — нет платы',v);
}
