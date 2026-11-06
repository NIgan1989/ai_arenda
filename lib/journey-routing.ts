import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
import {q,one,epoch,httpsEndpoint,type Row,type OperationConfig} from './operation-core';
import {journeyContext,journeyAction,coordinate} from './map-workspace';
import {geoDistance} from './map-location';
import {readRouteGeometry,type JourneyRoute} from './route-geometry';
async function destination(s:RentalService,context:Row){const p=await one(s.db,'SELECT p.*,l.longitude,l.latitude,l.address_fingerprint FROM properties p JOIN property_locations l ON l.property_id=p.id WHERE p.id=?',context.entity.property_id);if(!p||p.address_fingerprint!==[p.city,p.district,p.address].join('|'))throw new DomainError('Владелец ещё не подтвердил точку объекта.',409);return [p.longitude,p.latitude] as [number,number];}
async function reserve(s:RentalService,key:string,seconds:number,limit:number){const t=epoch(),r=await q(s.db,`INSERT INTO auth_attempt_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,key,t+seconds,t,t).first<Row>();if(!r||r.attempts>limit)throw new DomainError('Маршрут недавно рассчитывался. Подождите перед повтором.',429);}
export async function buildJourneyRoute(s:RentalService,role:Role,b:Row,config:OperationConfig={}){
 await s.authorizeWorkspace(role,'operations');
 if(!['guest','cleaner'].includes(role)||b.routingConsent!==true||!['walking','driving'].includes(b.mode))throw new DomainError('Для расчёта разрешите передачу координат сервису маршрутов и выберите способ пути.',403);
 const context=await journeyContext(s,String(b.kind),String(b.entityId));if(context.sender!==s.userId||context.role!==role)throw new DomainError('Маршрут недоступен.',403);
 const t=epoch(),origin:[number,number]=[coordinate(b.longitude,-180,180),coordinate(b.latitude,-85,85)],accuracy=coordinate(b.accuracy,0,500),recordedAt=coordinate(b.recordedAt,t-60,t+10),target=await destination(s,context);
 if(geoDistance(origin,target)>150000)throw new DomainError('Для такого расстояния откройте внешний навигатор.',400);
 await reserve(s,'route:user:'+s.userId,3600,30);await reserve(s,'route:global',2,1);
 const base=httpsEndpoint(b.mode==='walking'?config.ROUTING_FOOT_URL||'https://routing.openstreetmap.de/routed-foot/route/v1':config.ROUTING_CAR_URL||'https://routing.openstreetmap.de/routed-car/route/v1');
 const url=new URL(base.href.replace(/\/$/,'')+'/driving/'+origin.map(v=>v.toFixed(5)).join(',')+';'+target.map(v=>v.toFixed(5)).join(','));url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false'}).toString();
 let parsed:ReturnType<typeof readRouteGeometry>;
 try{const response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'AIArenda-Pilot/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok||Number(response.headers.get('content-length')||0)>2000000)throw Error();const raw=await response.text();if(raw.length>2000000)throw Error();parsed=readRouteGeometry(JSON.parse(raw));if(geoDistance(origin,parsed.geometry.coordinates[0])>Math.max(500,accuracy*2)||geoDistance(target,parsed.geometry.coordinates.at(-1)!)>300)throw Error();}catch{throw new DomainError('Не удалось рассчитать маршрут по дорогам. Карта и действия по процессу доступны; попробуйте позже.',503);}
 const current=await journeyContext(s,String(b.kind),String(b.entityId)),freshTarget=await destination(s,current);if(current.sender!==s.userId||current.role!==role||current.owner!==context.owner||geoDistance(target,freshTarget)>1)throw new DomainError('Процесс или точка объекта изменились. Откройте актуальную карточку.',409);
 const route:JourneyRoute={...parsed,mode:b.mode,createdAt:epoch(),kind:b.kind,entityId:b.entityId,source:'fossgis'};let sharing:Row|null=null;
 if(b.shareWithOwner===true){sharing=await journeyAction(s,role,'start',{kind:b.kind,entityId:b.entityId,mode:b.mode,consent:true});await journeyAction(s,role,'point',{id:sharing.id,longitude:origin[0],latitude:origin[1],accuracy,recordedAt});const stored=await q(s.db,'UPDATE journey_sessions SET route=?,route_recorded_at=? WHERE id=? AND stopped_at IS NULL AND expires_at>?',JSON.stringify(route),route.createdAt,sharing.id,epoch()).run();if(!stored.meta.changes)throw new DomainError('Передача уже завершена.',409);}
 return {route,sharing};
}
