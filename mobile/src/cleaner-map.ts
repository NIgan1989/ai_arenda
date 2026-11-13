// What the cleaner's live map says: the day's route in order, each stop's pin, how far the cleaning under way has gone,
// and the links that hand the way to a navigator. Pure functions, covered by mobile/tests/cleaner-map.test.mjs.
// Times are Kazakhstan time (UTC+5), as everywhere on the map.
import type {MapLine,PinTone} from './map-motion';
import {soon} from './owner-map';

type Row=Record<string,any>;
type Point=[number,number];
const ZONE=5*3600;
const day=(at:number)=>Math.floor((at+ZONE)/86400);
const ok=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v));

// The day's route: the cleaning under way first, then the assigned ones that start today (or are already late), by time.
// A cleaning sent for acceptance is done for the cleaner; tomorrow's work is not on today's route.
export type Stop={id:string;order:number;start:number;end:number;status:string};
export function dayRoute(jobs:Row[],userId:string,now:number):Stop[]{
 return jobs.filter(j=>j.assigned_to===userId&&(j.status==='in_progress'||j.status==='assigned'&&day(Number(j.start))<=day(now)&&Number(j.end)>now))
  .sort((a,b)=>(a.status==='in_progress'?0:1)-(b.status==='in_progress'?0:1)||Number(a.start)-Number(b.start))
  .map((j,i)=>({id:String(j.id),order:i+1,start:Number(j.start),end:Number(j.end),status:String(j.status)}));
}

// How far a cleaning has gone, from its start to the end of its window (the next guest): 0 at the start, 1 at the deadline.
export function progress(startedAt:unknown,end:unknown,now:number){
 const a=Number(startedAt),b=Number(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=a)return undefined;
 return Math.max(0,Math.min(1,(now-a)/(b-a)));
}

// One job's pin. On the route a stop carries its number; the cleaning under way says until when and fills its strip.
export type CleanerPin={label:string;tone:PinTone;order?:number;progress?:number};
export function cleanerPin(job:Row,stop:Stop|undefined,now:number,applied:boolean):CleanerPin{
 const status=String(job.status);
 if(status==='in_progress'){const until=soon(Number(job.end),now);return {label:until?'Уборка до '+until:'Уборка идёт',tone:'active',order:stop?.order,progress:progress(job.startedAt??job.started_at,job.end,now)};}
 if(status==='submitted')return {label:'На приёмке',tone:'booking'};
 if(status==='assigned'){
  if(!stop)return {label:soon(Number(job.start),now)||'Моё задание',tone:'offer'};
  // A guest already gone: the flat is free, the cleaning can start now.
  const ready=job.checkout_confirmed===true||job.checkout_confirmed===1;
  return {label:Number(job.start)<=now?(ready?'Начинайте':'Ждём выезда'):soon(Number(job.start),now)||'Сегодня',tone:'offer',order:stop.order};
 }
 return applied?{label:'Отклик ✓',tone:'job'}:{label:'Уборка',tone:'job'};
}

// The route as lines from one stop to the next, in order; stops without a point on the map are skipped.
export function routeLines(points:(Point|null|undefined)[]):MapLine[]{
 const shown=points.filter(ok);
 return shown.slice(1).map((to,i)=>({key:'route:'+i+':'+shown[i].join(',')+'>'+to.join(','),from:shown[i],to,tone:'route' as const}));
}

// Straight-line distance between the stops, in metres: the route's length as a crow flies, for the summary.
export function distance(a:Point,b:Point){
 const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad,h=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
// «3 уборки · 12 км · 13 500 ₸»: what the day holds, in one line.
export function routeSummary(stops:{fee?:number;point?:Point|null}[]){
 const n=stops.length;if(!n)return '';
 const pts=stops.map(s=>s.point).filter(ok),km=pts.slice(1).reduce((sum,p,i)=>sum+distance(pts[i],p),0)/1000;
 const fee=stops.reduce((sum,s)=>sum+(Number(s.fee)||0),0);
 const word=n%10===1&&n%100!==11?'уборка':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'уборки':'уборок';
 return [n+' '+word,pts.length>1?(km<10?km.toFixed(1).replace('.',','):String(Math.round(km)))+' км':'',fee>0?fee.toLocaleString('ru-RU').replace(/\s/g,' ')+' ₸':''].filter(Boolean).join(' · ');
}

// Links that open the way to a stop in a navigator: 2GIS (the usual one in Kazakhstan), Yandex, and the phone's own maps.
// The https links open the app when it is installed and the site otherwise.
export function navigatorLinks([lon,lat]:Point,platform:string){
 const to=lon.toFixed(6)+','+lat.toFixed(6),ll=lat.toFixed(6)+','+lon.toFixed(6);
 return {
  dgis:'https://2gis.kz/routeSearch/rsType/car/to/'+to,
  yandex:'https://yandex.kz/maps/?rtext=~'+ll+'&rtt=auto',
  system:platform==='ios'?'https://maps.apple.com/?daddr='+ll+'&dirflg=d':'geo:'+ll+'?q='+ll
 };
}
