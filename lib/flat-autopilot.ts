import {t} from './i18n';
// One line about the «Автопилот» plan of one flat, the same on the site and in the app.
export type FlatAutopilot={id:string;managed:boolean;ready:boolean;ownStaff:boolean;cleaningFee:number;price:number;trialDays:number;charge:boolean};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
export function flatAutopilotNote(f:FlatAutopilot){
 if(f.managed)return t(f.charge?'ИИ отвечает гостям и заказывает уборки. {sum} в месяц за это жильё':'ИИ отвечает гостям и заказывает уборки. {sum} в месяц за это жильё, пока бесплатно',{sum:money(f.price)});
 if(!f.ready)return t('Сначала заполните правила и цены жилья: по ним ИИ отвечает гостям');
 return f.trialDays?t('ИИ будет отвечать гостям и заказывать уборки. {days} дней бесплатно, потом {sum} в месяц',{days:f.trialDays,sum:money(f.price)}):t('ИИ будет отвечать гостям и заказывать уборки. {sum} в месяц',{sum:money(f.price)});
}
