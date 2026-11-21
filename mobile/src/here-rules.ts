import {t} from '../../lib/i18n';
import {mapCities,type MapPoint} from './map-math';

// Where the person is, as the phone told us (here.ts), and what the map says about it.
// searching: the phone is being asked; found: we have a point; idle: nobody asked yet (no prompt was shown);
// denied: the person said no, the app may ask again; blocked: the phone will not ask again, only Settings can allow it;
// off: geolocation is switched off on the phone; failed: allowed and on, but no point came in time.
export type HereStatus='idle'|'searching'|'found'|'denied'|'blocked'|'off'|'failed';
// rough: a point the phone remembered (last known) or an approximate one, not a fresh measurement.
export type HereFix={point:MapPoint;accuracy:number;at:number;rough:boolean};
export type HereAction='settings'|'retry'|'pick';
export type HereNote={text:string;actions:HereAction[]};

// A point younger than this is used without asking the phone again.
export const FRESH_FIX=10*60000;
// A route needs to know the street: an approximate point (iOS «Приблизительно», a cell tower) is not enough for it.
export const ROUTE_ACCURACY=1500;
// The route server takes positions measured within the last 60 seconds (lib/journey-routing.ts); a margin for the trip there.
export const ROUTE_MAX_AGE=45000;

export function distanceKm(a:MapPoint,b:MapPoint){
 const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad;
 const s=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;
 return 2*6371*Math.asin(Math.min(1,Math.sqrt(s)));
}
// The city of the service the person is in: the nearest one within reach of a city's suburbs, otherwise none.
export function nearestCity(point:MapPoint,maxKm=60):string|null{
 let best:string|null=null,bestKm=Infinity;
 for(const [name,center] of Object.entries(mapCities)){const km=distanceKm(point,center);if(km<bestKm){best=name;bestKm=km;}}
 return bestKm<=maxKm?best:null;
}
// A new point replaces the one we have when it is better or the old one is no longer fresh.
export function betterFix(old:HereFix|null,next:HereFix){
 if(!old)return true;
 if(next.at<old.at)return false;
 if(old.rough&&!next.rough)return true;
 return next.accuracy<=old.accuracy*1.5||next.at-old.at>60000;
}
export const isFresh=(fix:HereFix|null,now=Date.now())=>!!fix&&!fix.rough&&now-fix.at<FRESH_FIX;
// How far the accuracy circle reaches on the map, in screen points, at a zoom of map-math (256px tiles).
export function accuracyRadius(accuracy:number,latitude:number,zoom:number){
 const metresPerPoint=156543.03392*Math.cos(latitude*Math.PI/180)/Math.pow(2,zoom);
 return Math.max(0,Math.min(240,accuracy/metresPerPoint));
}
// What the map says when the person asked to be found and the phone could not tell where they are.
// city: what the map shows instead. canPick: the guest can put the point on the map by hand.
export function hereNote(status:HereStatus,city:string,canPick:boolean,platform:'ios'|'android'|string):HereNote|null{
 const pick:HereAction[]=canPick?['pick']:[];
 if(status==='blocked')return {text:platform==='ios'?t('Доступ к геопозиции запрещён. Разрешите его в настройках (Геопозиция → При использовании). Пока показываем {city}.',{city}):t('Доступ к геопозиции запрещён. Разрешите его в настройках. Пока показываем {city}.',{city}),actions:['settings',...pick]};
 if(status==='denied')return {text:t('Без доступа к геопозиции не найдём вас на карте. Пока показываем {city}.',{city}),actions:['retry',...pick]};
 if(status==='off')return {text:platform==='ios'?t('Геолокация на телефоне выключена. Включите её в Настройках → Конфиденциальность → Службы геолокации. Пока показываем {city}.',{city}):t('Геолокация на телефоне выключена. Включите её. Пока показываем {city}.',{city}),actions:['settings',...pick]};
 if(status==='failed')return {text:t('Телефон пока не знает, где вы. Выйдите ближе к окну или попробуйте ещё раз. Пока показываем {city}.',{city}),actions:['retry',...pick]};
 return null;
}
