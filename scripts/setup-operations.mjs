import './sites-env.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createLocalBackup} from './local-backup.mjs';

let source=readFileSync('.dev.vars','utf8');if(!parseEnv(source).ACCESS_ENCRYPTION_KEY){source=source.trimEnd()+'\nACCESS_ENCRYPTION_KEY='+randomBytes(32).toString('hex')+'\n';writeFileSync('.dev.vars',source);}
console.log(JSON.stringify(await createLocalBackup({force:true})));
mkdirSync('.sites-runtime/migrations',{recursive:true});const config=resolve('.sites-runtime/migrations/wrangler.json');writeFileSync(config,JSON.stringify({name:'arenda-local-migrations',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
const args=['node_modules/wrangler/bin/wrangler.js','d1','execute','site-creator-d1','--config',config,'--local','--persist-to',resolve('.wrangler/state')];
for(const [marker,file] of [['background_jobs','0009_operations_platform.sql'],['booking_calendar_freshness_insert','0010_calendar_freshness.sql'],['delivery_events','0011_delivery_receipts.sql'],['property_imports','0012_property_import.sql'],['pilot_policy','0013_pilot_governance.sql'],['ai_usage_reservations','0014_ai_budget.sql'],['calendar_previews','0015_calendar_preview.sql'],['review_property_bindings','0016_review_binding.sql'],['discussion_rooms','0017_process_discussions.sql'],['discussion_visits','0018_chat_experience.sql'],['profile_preferences','0019_profile_identity.sql'],['property_locations','0020_map_journeys.sql'],['journey_assignment_revoked','0021_journey_invalidation.sql'],['auth_attempt_limits','0022_shared_assistant_limits.sql'],['journey_route_erased','0023_journey_routes.sql'],['evidence_video_chunks','0024_evidence_video.sql'],['deletion_requests','0025_account_safety.sql'],['ai_data_permissions','0026_ai_data_permission.sql'],['auth_mobile_sessions','0027_shared_mobile_api.sql'],['moderated_content','0028_content_moderation.sql'],['account_erasure_fences','0029_account_deletion.sql'],['push_subscriptions','0030_web_push.sql'],['matching_requests','0031_smart_matching.sql'],['platform_commissions','0032_platform_billing.sql'],['property_archived_hidden','0033_property_archive.sql']]){
 const check=spawnSync(process.execPath,[...args,'--command',"SELECT name FROM sqlite_master WHERE name='"+marker+"'",'--json'],{encoding:'utf8'});
 if(check.status!==0){console.error('Could not inspect the local database.');process.exit(1);}
 const state=JSON.parse(check.stdout);if(state.some(item=>item.results?.some(row=>row.name===marker))){console.log(file+' already applied.');continue;}
 const migration=spawnSync(process.execPath,[...args,'--file',resolve('drizzle',file),'--json'],{encoding:'utf8'});if(migration.error)throw migration.error;if(migration.status!==0){console.error('Migration failed: '+file);process.exit(migration.status||1);}console.log(file+' applied successfully.');
}
