import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {buildJourneyRoute}=await load('journey-routing'),{mapSearch,journeyAction}=await load('map-workspace'),{readRouteGeometry}=await load('route-geometry');
async function ready(){const f=await fixture();f.db.raw.prepare('INSERT INTO property_locations VALUES (?,?,?,?,?,?,?)').run(f.property,76.95,52.287,'fixture','Павлодар|Центр|PRIVATE ADDRESS',1,now());return f;}
const body=(f,extra={})=>({kind:'booking',entityId:f.booking,mode:'walking',longitude:76.94,latitude:52.287,accuracy:15,recordedAt:now(),routingConsent:true,...extra});
const payload={code:'Ok',routes:[{distance:900,duration:700,geometry:{type:'LineString',coordinates:[[76.94,52.287],[76.945,52.288],[76.95,52.287]]}}]};
test('private routes require consent, bind destination to the authorised process, and never start sharing implicitly',async()=>{
 const f=await ready(),original=globalThis.fetch;let requests=[];globalThis.fetch=async(url)=>{requests.push(String(url));return Response.json(payload);};
 try{for(const [actor,role,extra] of [[f.guest,'guest',{routingConsent:false}],[f.owner,'owner',{}],[f.other,'guest',{}]])await assert.rejects(buildJourneyRoute(actor,role,body(f,extra)));assert.equal(requests.length,0);
 const result=await buildJourneyRoute(f.guest,'guest',body(f));assert.equal(result.sharing,null);assert.equal(result.route.mode,'walking');assert.match(requests[0],/routed-foot\/route\/v1\/driving/);assert.match(requests[0],/76\.95000,52\.28700/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM journey_sessions').get().n,0);
 await assert.rejects(buildJourneyRoute(f.guest,'guest',body(f)),e=>e.status===429);assert.equal(requests.length,1);
 }finally{globalThis.fetch=original;f.db.close();}
});
test('shared routes reach only the process owner and are erased immediately after cancellation',async()=>{
 const f=await ready(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(payload);
 try{const result=await buildJourneyRoute(f.guest,'guest',body(f,{shareWithOwner:true}));assert.ok(result.sharing.id);assert.ok(f.db.raw.prepare('SELECT route FROM journey_sessions WHERE id=?').get(result.sharing.id).route);
 const owner=await mapSearch(f.owner,'owner',{});assert.equal(owner.journeys[0].route.geometry.type,'LineString');assert.equal((await mapSearch(f.cleaner,'cleaner',{})).journeys.length,0);assert.equal((await mapSearch(f.other,'owner',{})).journeys.length,0);
 await f.guest.bookingAction(f.booking,{action:'cancel',expectedVersion:1});const row=f.db.raw.prepare('SELECT * FROM journey_sessions WHERE id=?').get(result.sharing.id);assert.equal(row.route,null);assert.equal(row.longitude,null);assert.ok(row.stopped_at);
 }finally{globalThis.fetch=original;f.db.close();}
});
test('stale shared positions hide the route; stopping sharing clears geometry',async()=>{
 const f=await ready(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(payload);
 try{const result=await buildJourneyRoute(f.guest,'guest',body(f,{shareWithOwner:true}));f.db.raw.prepare('UPDATE journey_sessions SET received_at=? WHERE id=?').run(now()-91,result.sharing.id);assert.equal((await mapSearch(f.owner,'owner',{})).journeys[0].route,null);await journeyAction(f.guest,'guest','stop',{id:result.sharing.id});assert.equal(f.db.raw.prepare('SELECT route FROM journey_sessions WHERE id=?').get(result.sharing.id).route,null);
 }finally{globalThis.fetch=original;f.db.close();}
});
test('provider failure and a changed process cannot leave a shared route',async()=>{
 const f=await ready(),original=globalThis.fetch;globalThis.fetch=async()=>{await f.guest.bookingAction(f.booking,{action:'cancel',expectedVersion:1});return Response.json(payload);};
 try{await assert.rejects(buildJourneyRoute(f.guest,'guest',body(f,{shareWithOwner:true})),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM journey_sessions').get().n,0);}finally{globalThis.fetch=original;f.db.close();}
 const g=await ready();globalThis.fetch=async()=>Response.json({code:'NoRoute'});try{await assert.rejects(buildJourneyRoute(g.guest,'guest',body(g,{shareWithOwner:true})),e=>e.status===503);assert.equal(g.db.raw.prepare('SELECT COUNT(*) n FROM journey_sessions').get().n,0);}finally{globalThis.fetch=original;g.db.close();}
});
test('route parser rejects invalid, huge and missing geometries instead of drawing a straight line',()=>{for(const p of [{},{code:'NoRoute'},{code:'Ok',routes:[{...payload.routes[0],geometry:{type:'LineString',coordinates:[[NaN,2],[3,4]]}}]},{code:'Ok',routes:[{...payload.routes[0],distance:-1}]}])assert.throws(()=>readRouteGeometry(p));assert.equal(readRouteGeometry(payload).geometry.coordinates.length,3);});
test('assigned cleaner uses the car profile and starting work ends live position and route',async()=>{
 const f=await ready(),original=globalThis.fetch;let requested='';globalThis.fetch=async url=>{requested=String(url);return Response.json(payload);};
 try{f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',booking_id=NULL,start=?,end=? WHERE id=?").run(now()+60,now()+3600,f.job.id);const result=await buildJourneyRoute(f.cleaner,'cleaner',body(f,{kind:'job',entityId:f.job.id,mode:'driving',shareWithOwner:true}));assert.match(requested,/routed-car\/route\/v1\/driving/);assert.equal((await mapSearch(f.owner,'owner',{})).journeys[0].route.mode,'driving');await f.cleaner.jobAction(f.job.id,{action:'start'});const session=f.db.raw.prepare('SELECT * FROM journey_sessions WHERE id=?').get(result.sharing.id);assert.equal(session.route,null);assert.equal(session.longitude,null);assert.ok(session.stopped_at);assert.equal((await mapSearch(f.owner,'owner',{})).journeys.length,0);
 }finally{globalThis.fetch=original;f.db.close();}
});
