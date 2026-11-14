// One line about the «Автопилот» plan of one flat, the same on the site and in the app.
export type FlatAutopilot={id:string;managed:boolean;ready:boolean;ownStaff:boolean;cleaningFee:number;price:number;trialDays:number;charge:boolean};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
export function flatAutopilotNote(f:FlatAutopilot){
 if(f.managed)return 'ИИ отвечает гостям и заказывает уборки. '+money(f.price)+' в месяц за это жильё'+(f.charge?'':', пока бесплатно');
 if(!f.ready)return 'Сначала заполните правила и цены жилья: по ним ИИ отвечает гостям';
 return 'ИИ будет отвечать гостям и заказывать уборки. '+(f.trialDays?f.trialDays+' дней бесплатно, потом ':'')+money(f.price)+' в месяц';
}
