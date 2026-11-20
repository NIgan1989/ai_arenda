// One line about the «Автопилот» of one flat, the same on the site and in the app. Hybrid tariff (2026-11-20):
// the AI is paid per booking it took through (price), or is part of «Всё включено» (included).
export type FlatAutopilot={id:string;managed:boolean;ready:boolean;ownStaff:boolean;cleaningFee:number;price:number;cap?:number;included?:boolean;trialDays:number;charge:boolean};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
export function flatAutopilotNote(f:FlatAutopilot){
 const pay=f.included?'входит в «Всё включено»':money(f.price)+' за бронь, которую провёл ИИ'+(f.cap?', не больше '+money(f.cap)+' в месяц':'');
 if(f.managed)return 'ИИ отвечает гостям и заказывает уборки. '+pay.charAt(0).toUpperCase()+pay.slice(1)+(f.charge||f.included?'':', пока бесплатно');
 if(!f.ready)return 'Сначала заполните правила и цены жилья: по ним ИИ отвечает гостям';
 return 'ИИ будет отвечать гостям и заказывать уборки. '+pay.charAt(0).toUpperCase()+pay.slice(1)+(f.included?'':'. Нет броней — нет платы');
}
