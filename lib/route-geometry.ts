export type Position=[number,number];
// A step of the way: where a turn is, what to do there, in Russian, and how far the step goes.
export type RouteStep={at:Position;type:string;modifier?:string;name?:string;distance:number;text:string};
export type JourneyRoute={geometry:{type:'LineString';coordinates:Position[]};distance:number;duration:number;createdAt:number;mode:'walking'|'driving';kind:string;entityId:string;source:'fossgis'|'stadia';steps?:RouteStep[]};
export function validPosition(value:unknown):value is Position{return Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(value[0])<=180&&Math.abs(value[1])<=85;}

// An encoded polyline (Google's format) into [lon,lat] points: OSRM uses precision 5, Valhalla (Stadia) precision 6.
export function decodePolyline(text:string,precision=6):Position[]{
 const factor=10**precision,out:Position[]=[];let i=0,lat=0,lon=0;
 const next=()=>{let shift=0,result=0,b:number;do{if(i>=text.length)throw Error('bad polyline');b=text.charCodeAt(i++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;};
 while(i<text.length){lat+=next();lon+=next();out.push([lon/factor,lat/factor]);}
 return out;
}

const turn:Record<string,string>={left:'налево','slight left':'плавно налево','sharp left':'резко налево',right:'направо','slight right':'плавно направо','sharp right':'резко направо',straight:'прямо',uturn:'разворот'};
// What to do at a step, in Russian, from the OSRM maneuver: the router's own words when it gives them (Stadia), otherwise built here.
export function stepText(type:string,modifier?:string,name?:string,given?:unknown){
 if(typeof given==='string'&&given.trim()&&given.length<=200)return given.trim();
 const street=name?' на '+name:'',way=modifier&&turn[modifier]?turn[modifier]:'';
 if(type==='depart')return 'Начните движение'+(name?' по '+name:'');
 if(type==='arrive')return 'Вы на месте';
 if(type==='roundabout'||type==='rotary')return 'На кольце'+(way&&way!=='прямо'?' держитесь '+way:'')+' и съезжайте'+street;
 if(modifier==='uturn')return 'Развернитесь'+street;
 if(type==='continue'||type==='new name'||way==='прямо')return 'Продолжайте прямо'+(name?' по '+name:'');
 if(type==='merge')return 'Перестройтесь'+(way?' '+way:'')+street;
 if(type==='fork')return 'Держитесь '+(way||'прямо')+street;
 return way?'Поверните '+way+street:'Продолжайте'+(name?' по '+name:'');
}

export function readRouteGeometry(value:any,precision=6){
 const route=value?.routes?.[0],raw=route?.geometry;
 let coordinates:unknown=raw?.coordinates;
 if(typeof raw==='string'){try{coordinates=decodePolyline(raw,precision);}catch{coordinates=null;}}
 const shapeOk=typeof raw==='string'||raw?.type==='LineString';
 if(value?.code!=='Ok'||!shapeOk||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>20000||!coordinates.every(validPosition)||!Number.isFinite(route.distance)||route.distance<0||route.distance>300000||!Number.isFinite(route.duration)||route.duration<0||route.duration>604800)throw Error('Маршрут по дорогам не найден. Попробуйте позже.');
 // Turn-by-turn steps, when the router sent them; a route without them still draws and leads.
 const steps:RouteStep[]=[];
 for(const leg of Array.isArray(route.legs)?route.legs:[])for(const s of Array.isArray(leg?.steps)?leg.steps:[]){
  const m=s?.maneuver,at=m?.location,type=typeof m?.type==='string'?m.type:'';
  if(!validPosition(at)||!type||steps.length>=300)continue;
  const modifier=typeof m.modifier==='string'?m.modifier:undefined,name=typeof s.name==='string'&&s.name.length<=120&&s.name.trim()?s.name.trim():undefined;
  steps.push({at,type,...(modifier?{modifier}:{}),...(name?{name}:{}),distance:Number.isFinite(s.distance)&&s.distance>=0?Math.round(s.distance):0,text:stepText(type,modifier,name,m.instruction)});
 }
 return {geometry:{type:'LineString' as const,coordinates:coordinates as Position[]},distance:route.distance as number,duration:route.duration as number,...(steps.length?{steps}:{})};
}
