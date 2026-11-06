import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,openQaDatabase,qaModule} from './qa-database.mjs';
import {createLocalBackup} from './local-backup.mjs';
export async function prepareQaWorkflows(){
 if(!existsSync(resolve(root,'outputs/browser-qa/state/v3/d1/miniflare-D1DatabaseObject')))return {skipped:true,reason:'QA storage not yet created'};
 const db=openQaDatabase();try{
  if(!db.raw.prepare("SELECT name FROM sqlite_master WHERE name='pilot_policy'").get())return {skipped:true,reason:'QA schema not yet created'};
  const before=db.raw.prepare("SELECT * FROM pilot_policy WHERE id='global'").get();
  if(!before.require_owner_review&&!before.require_cleaner_review&&!before.require_phone)return {changed:false,testWorkflowsReady:true};
  if(!db.raw.prepare("SELECT id FROM profiles WHERE id='qa-owner'").get())throw Error('Expected isolated QA fixture account; admission policy was not changed');
  // openQaDatabase verifies the resolved path stays inside outputs/browser-qa, never .wrangler/state.
  const filename=db.raw.prepare('PRAGMA database_list').get().file;
  const backup=await createLocalBackup({filename,force:true});
  const {RentalService}=await qaModule('service'),{savePilotPolicy}=await qaModule('pilot-governance');
  await savePilotPolicy(new RentalService(db,'qa-owner'),{requireOwnerReview:false,requireCleanerReview:false,requirePhone:false,expectedVersion:before.version,confirmed:true},true);
  return {changed:true,testWorkflowsReady:true,previous:{owner:!!before.require_owner_review,cleaner:!!before.require_cleaner_review,phone:!!before.require_phone},backup:backup.file};
 }finally{db.raw.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.slice(2).join(' ')!=='--confirm-isolated')throw Error('Use --confirm-isolated; only outputs/browser-qa storage can be changed');
 console.log(JSON.stringify(await prepareQaWorkflows()));
}
