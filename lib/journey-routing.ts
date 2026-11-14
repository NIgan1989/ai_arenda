import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
import {q,one,epoch,httpsEndpoint,type Row,type OperationConfig} from './operation-core';
import {journeyContext,journeyAction,coordinate,publicPoint} from './map-workspace';
import {geoDistance} from './map-location';
import {readRouteGeometry,type JourneyRoute} from './route-geometry';
async function destination(s:RentalService,context:Row){const p=await one(s.db,'SELECT p.*,l.longitude,l.latitude,l.address_fingerprint FROM properties p JOIN property_locations l ON l.property_id=p.id WHERE p.id=?',context.entity.property_id);if(!p||p.address_fingerprint!==[p.city,p.district,p.address].join('|'))throw new DomainError('Владелец ещё не подтвердил точку объекта.',409);return [p.longitude,p.latitude] as [number,number];}
async function reserve(s:RentalService,key:string,seconds:number,limit:number){const t=epoch(),r=await q(s.db,`INSERT INTO auth_attempt_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,key,t+seconds,t,t).first<Row>();if(!r||r.attempts>limit)throw new DomainError('Маршрут недавно рассчитывался. Подождите перед повтором.',429);}
export async function buildJourneyRoute(s:RentalService,role:Role,b:Row,config:OperationConfig={}){
 await s.authorizeWorkspace(role,'operations');
 if(!['guest','cleaner'].includes(role)||b.routingConsent!==true||!['walking','driving'].includes(b.mode))throw new DomainError('Для расчёта разрешите передачу координат сервису маршрутов и выберите способ пути.',403);
 const context=await journeyContext(s,String(b.kind),String(b.entityId));if(context.sender!==s.userId||context.role!==role)throw new DomainError('Маршрут недоступен.',403);
 const t=epoch(),origin:[number,number]=[coordinate(b.longitude,-180,180),coordinate(b.latitude,-85,85)],accuracy=coordinate(b.accuracy,0,500),recordedAt=coordinate(b.recordedAt,t-60,t+10),target=await destination(s,context);
 if(geoDistance(origin,target)>150000)throw new DomainError('Объект дальше 150 км: маршрут на карте строится для поездок по городу.',400);
 // Stadia Maps (paid, commercial use allowed) when its key is set; otherwise the public FOSSGIS router, kept to one route per two seconds.
 const stadia=typeof config.STADIA_API_KEY==='string'&&/^[A-Za-z0-9-]{8,128}$/.test(config.STADIA_API_KEY)?config.STADIA_API_KEY:'';
 await reserve(s,'route:user:'+s.userId,3600,30);if(!stadia)await reserve(s,'route:global',2,1);
 // fetch gets a URL and its options, as everywhere in the service (tests replace fetch by the address).
 let url:URL,init:RequestInit;
 if(stadia){
  url=new URL('https://api.stadiamaps.com/route/v1');url.searchParams.set('api_key',stadia);
  init={method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({locations:[{lon:origin[0],lat:origin[1],type:'break'},{lon:target[0],lat:target[1],type:'break'}],costing:b.mode==='walking'?'pedestrian':'auto',format:'osrm',shape_format:'polyline6',units:'kilometers',language:'ru-RU',directions_options:{language:'ru-RU',units:'kilometers'}})};
 }else{
  const base=httpsEndpoint(b.mode==='walking'?config.ROUTING_FOOT_URL||'https://routing.openstreetmap.de/routed-foot/route/v1':config.ROUTING_CAR_URL||'https://routing.openstreetmap.de/routed-car/route/v1');
  url=new URL(base.href.replace(/\/$/,'')+'/driving/'+origin.map(v=>v.toFixed(5)).join(',')+';'+target.map(v=>v.toFixed(5)).join(','));url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true',alternatives:'false'}).toString();
  init={headers:{'Accept':'application/json','User-Agent':'AIArenda-Pilot/1.0'}};
 }
 let parsed:ReturnType<typeof readRouteGeometry>;
 try{const response=await fetch(url,{...init,signal:AbortSignal.timeout(12000),redirect:'manual'});if(!response.ok||Number(response.headers.get('content-length')||0)>2000000)throw Error();const raw=await response.text();if(raw.length>2000000)throw Error();parsed=readRouteGeometry(JSON.parse(raw),stadia?6:5);if(geoDistance(origin,parsed.geometry.coordinates[0])>Math.max(500,accuracy*2)||geoDistance(target,parsed.geometry.coordinates.at(-1)!)>300)throw Error();}catch{throw new DomainError('Не удалось рассчитать маршрут по дорогам. Карта и действия по процессу доступны; попробуйте позже.',503);}
 const current=await journeyContext(s,String(b.kind),String(b.entityId)),freshTarget=await destination(s,current);if(current.sender!==s.userId||current.role!==role||current.owner!==context.owner||geoDistance(target,freshTarget)>1)throw new DomainError('Процесс или точка объекта изменились. Откройте актуальную карточку.',409);
 const route:JourneyRoute={...parsed,mode:b.mode,createdAt:epoch(),kind:b.kind,entityId:b.entityId,source:stadia?'stadia':'fossgis'};let sharing:Row|null=null;
 if(b.shareWithOwner===true){sharing=await journeyAction(s,role,'start',{kind:b.kind,entityId:b.entityId,mode:b.mode,consent:true});await journeyAction(s,role,'point',{id:sharing.id,longitude:origin[0],latitude:origin[1],accuracy,recordedAt});const stored=await q(s.db,'UPDATE journey_sessions SET route=?,route_recorded_at=? WHERE id=? AND stopped_at IS NULL AND expires_at>?',JSON.stringify(route),route.createdAt,sharing.id,epoch()).run();if(!stored.meta.changes)throw new DomainError('Передача уже завершена.',409);}
 return {route,sharing};
}

// The beam of a search drawn along the roads: from about where the guest is to the public point of a home being asked.
// The guest's place comes rounded to 0.001° (about a hundred metres) and nothing is stored; the home's point is the public
// one (the middle of its 0.01° cell), never its address. Counted apart from the routes of a trip.
export async function buildBeamRoute(s:RentalService,role:Role,b:Row,config:OperationConfig={}){
 await s.authorizeWorkspace(role,'operations');
 if(role!=='guest')throw new DomainError('Маршрут недоступен.',403);
 const round=(v:number)=>Math.round(v*1000)/1000,origin:[number,number]=[round(coordinate(b.longitude,-180,180)),round(coordinate(b.latitude,-85,85))];
 const p=await one(s.db,'SELECT p.city,p.district,p.address,l.longitude,l.latitude,l.address_fingerprint,l.source FROM properties p JOIN property_locations l ON l.property_id=p.id WHERE p.id=? AND p.published=1',String(b.propertyId||''));
 if(!p||p.address_fingerprint!==[p.city,p.district,p.address].join('|'))throw new DomainError('Жильё недоступно.',404);
 const shown=publicPoint(p),target:[number,number]=[shown.longitude,shown.latitude];
 if(geoDistance(origin,target)>60000)throw new DomainError('Жильё слишком далеко для линии по дорогам.',400);
 const stadia=typeof config.STADIA_API_KEY==='string'&&/^[A-Za-z0-9-]{8,128}$/.test(config.STADIA_API_KEY)?config.STADIA_API_KEY:'';
 // Only the paid router draws beams: the public one allows a route every two seconds for the whole service,
 // and that is kept for the way of a trip. Without the key the beam stays straight.
 if(!stadia)throw new DomainError('Линия по дорогам недоступна.',503);
 await reserve(s,'beam:user:'+s.userId,3600,40);
 const url=new URL('https://api.stadiamaps.com/route/v1');url.searchParams.set('api_key',stadia);
 const init:RequestInit={method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({locations:[{lon:origin[0],lat:origin[1],type:'break'},{lon:target[0],lat:target[1],type:'break'}],costing:'auto',format:'osrm',shape_format:'polyline6',units:'kilometers'})};
 try{
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(8000),redirect:'manual'});if(!response.ok)throw Error();const raw=await response.text();if(raw.length>2000000)throw Error();
  const parsed=readRouteGeometry(JSON.parse(raw),6),line=parsed.geometry.coordinates;
  // A road that starts or ends far from the two points is not the way between them.
  if(geoDistance(origin,line[0])>1000||geoDistance(target,line.at(-1)!)>1000)throw Error();
  // The line is only drawn, so a few hundred points are enough.
  const step=Math.max(1,Math.ceil(line.length/300)),path=line.filter((_,i)=>i%step===0||i===line.length-1).map(c=>[Math.round(c[0]*1e5)/1e5,Math.round(c[1]*1e5)/1e5]);
  return {path,distance:parsed.distance,duration:parsed.duration};
 }catch{throw new DomainError('Не удалось построить линию по дорогам.',503);}
}
