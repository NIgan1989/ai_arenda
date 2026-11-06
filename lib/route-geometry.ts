export type Position=[number,number];
export type JourneyRoute={geometry:{type:'LineString';coordinates:Position[]};distance:number;duration:number;createdAt:number;mode:'walking'|'driving';kind:string;entityId:string;source:'fossgis'};
export function validPosition(value:unknown):value is Position{return Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(value[0])<=180&&Math.abs(value[1])<=85;}
export function readRouteGeometry(value:any){
 const route=value?.routes?.[0],coordinates=route?.geometry?.coordinates;
 if(value?.code!=='Ok'||route?.geometry?.type!=='LineString'||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>20000||!coordinates.every(validPosition)||!Number.isFinite(route.distance)||route.distance<0||route.distance>300000||!Number.isFinite(route.duration)||route.duration<0||route.duration>604800)throw Error('Маршрут по дорогам не найден. Попробуйте позже или откройте навигатор.');
 return {geometry:{type:'LineString' as const,coordinates:coordinates as Position[]},distance:route.distance as number,duration:route.duration as number};
}
