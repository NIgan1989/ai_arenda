export type BrowserLocationFix={longitude:number;latitude:number;accuracy:number;recordedAt:number};
export function locationFailure(error:{code?:number}|null){
 if(error?.code===1)return 'Доступ к геопозиции запрещён. Разрешите местоположение для этого сайта в настройках браузера и включите геолокацию устройства.';
 if(error?.code===3)return 'Не удалось определить положение за отведённое время. Проверьте доступ к геолокации. Во встроенном окне попробуйте открыть сервис в Chrome, Edge или Safari.';
 return 'Браузер не получил координаты. Проверьте геолокацию устройства. Если открыли сервис во встроенном окне, попробуйте Chrome, Edge или Safari.';
}
export function browserLocationFix(position:GeolocationPosition):BrowserLocationFix|null{
 const {longitude,latitude,accuracy}=position.coords;
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>85||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(position.timestamp))return null;
 if(Date.now()-position.timestamp>90000||position.timestamp>Date.now()+60000)return null;
 return {longitude,latitude,accuracy,recordedAt:position.timestamp/1000};
}
// A second deadline also covers embedded browsers which never invoke either callback.
export function requestBrowserLocation(geo:Pick<Geolocation,'getCurrentPosition'>|undefined,secure:boolean,timeoutMs=10000):Promise<BrowserLocationFix>{
 if(!secure)return Promise.reject(Error('Для геолокации откройте сервис по HTTPS. На этом компьютере также подходит localhost.'));
 if(!geo)return Promise.reject(Error('Этот браузер не поддерживает геолокацию. Откройте сервис в Chrome, Edge или Safari либо выберите город вручную.'));
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fix:BrowserLocationFix|null,message?:string)=>{if(settled)return;settled=true;clearTimeout(timer);if(fix)resolve(fix);else reject(Error(message));};
  const timer=setTimeout(()=>finish(null,locationFailure({code:3})),timeoutMs+1000);
  try{geo.getCurrentPosition(position=>{const fix=browserLocationFix(position);finish(fix,locationFailure(null));},error=>finish(null,locationFailure(error)),{enableHighAccuracy:false,maximumAge:30000,timeout:timeoutMs});}
  catch{finish(null,locationFailure(null));}
 });
}
