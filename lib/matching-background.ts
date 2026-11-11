import {epoch,rows,type OperationConfig} from './operation-core';
// Each matching request runs in a separate authenticated invocation. This keeps
// the existing scheduler's database budget independent of catalogue ranking.
export async function advanceMatchingRequests(db:D1Database,config:OperationConfig,transport:typeof fetch=fetch){
 if(config.TEST_DATA_ONLY==='1'||!config.SITE_PUBLIC_URL||!config.ADMINISTRATOR_RUNNER_SECRET)return {configured:false,advanced:0};
 const origin=new URL(config.SITE_PUBLIC_URL);if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Matching runner needs the configured HTTPS application origin.');
 const pending=await rows(db,"SELECT r.id FROM matching_requests r WHERE (r.status='booking' AND r.lease_until<?) OR (r.status IN ('searching','ready') AND r.expires_at>? AND NOT EXISTS(SELECT 1 FROM matching_offers o WHERE o.request_id=r.id AND o.status IN ('pending','accepted') AND o.expires_at>?)) ORDER BY r.created_at,r.id LIMIT 3",epoch(),epoch(),epoch());
 const results=await Promise.allSettled(pending.map(async request=>{const response=await transport(new URL('/api/internal/matching-advance',origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.ADMINISTRATOR_RUNNER_SECRET},body:JSON.stringify({id:request.id}),redirect:'error',signal:AbortSignal.timeout(20000)});await response.body?.cancel();if(!response.ok)throw Error('Matching continuation failed.');}));
 if(results.some(r=>r.status==='rejected'))throw Error('Some matching continuations failed. They remain eligible for retry.');return {configured:true,advanced:pending.length};
}
