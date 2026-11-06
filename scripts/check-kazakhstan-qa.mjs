import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {performance} from 'node:perf_hooks';import {root,openQaDatabase} from './qa-database.mjs';
const base='http://localhost:5174',accounts=JSON.parse(readFileSync(resolve(root,'outputs/browser-qa/kazakhstan/accounts.json'),'utf8')),geo=JSON.parse(readFileSync(resolve(root,'tests/fixtures/kazakhstan-cities.json'),'utf8')),cities=Object.values(geo.regions).flat();
const db=openQaDatabase();try{
 const counts=db.raw.prepare("SELECT city,COUNT(*) n FROM properties WHERE owner_id LIKE 'kzqa-%' AND published=1 GROUP BY city").all();assert.equal(counts.length,90);assert.ok(counts.every(c=>c.n===10));assert.equal(accounts.length,720);assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length,0);
}finally{db.raw.close();}
const timings=[],checks=[];
async function get(path,headers={}){const start=performance.now(),r=await fetch(base+path,{headers,signal:AbortSignal.timeout(60000)}),b=await r.json();timings.push(Math.round(performance.now()-start));assert.equal(r.status,200,JSON.stringify({path,status:r.status,error:b.error}));return b;}
for(const city of cities){const value=await get('/api/public/catalog?city='+encodeURIComponent(city));assert.equal(value.total,10,city);assert.equal(value.properties.length,10,city);for(const p of value.properties){assert.equal(p.city,city);assert.equal(p.address,undefined);assert.ok(p.title.startsWith('ТЕСТ'));}checks.push({city,count:10});}
for(const role of ['owner','guest','cleaner']){
 const a=accounts.find(a=>a.city==='Павлодар'&&a.role===role);assert.ok(a);
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({phone:a.phone,password:a.password}),signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const cookie=r.headers.getSetCookie()[0].split(';')[0];
 const headers={Cookie:cookie,'X-Workspace-Role':role},state=await get('/api/state',headers),operations=await get('/api/operations/state',headers);
 if(role==='owner'){assert.equal(state.ownProperties.length,5);assert.ok(state.ownProperties.every(p=>p.owner_id===a.id));}
 if(role==='guest'){assert.ok(state.bookings.every(b=>b.guest_id===a.id));assert.equal(state.ownProperties.length,0);}
 if(role==='cleaner'){assert.equal(state.bookings.length,0);assert.ok(state.jobs.filter(j=>j.assigned_to!==a.id).every(j=>!j.address));}
 assert.equal(operations.configured.telegram,false);assert.equal(operations.configured.sms,false);assert.equal(typeof state.integrations.ai,'boolean');
 const forged=await fetch(base+'/api/operations/finance',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({kind:'payment',bookingId:'missing',amount:1,confirmed:true,note:'test',requestKey:'qa-forged'})});assert.equal(forged.status,403);
 checks.push({role,authenticated:true,roleIsolation:true,externalDeliveryAndPaymentsDisabled:true,modelConfigured:state.integrations.ai});
 await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:base},body:'{}'});
}
const report={testedAt:new Date().toISOString(),cities:90,listings:900,accounts:720,checks:checks.length,maxRequestMs:Math.max(...timings),meanRequestMs:Math.round(timings.reduce((a,b)=>a+b,0)/timings.length),passed:true,details:checks};writeFileSync(resolve(root,'outputs/browser-qa/kazakhstan/check-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,details:undefined}));
