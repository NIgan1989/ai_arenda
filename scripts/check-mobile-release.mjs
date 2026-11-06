import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {isIP} from 'node:net';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const mobileDeviceCases=['sharedAccountAndRoles','nativeMapChatsProfiles','processLinksAndPush','offlineRetryAndLifecycle','accountDeletion','moderationAndAppeals','accessibility'];
export const mobileOperatorChecks=['legalAndRetentionApproved','dataDisclosureReviewed','supportAndReviewerAccountsReady','productionRecoveryVerified'];
const readJson=path=>{try{return JSON.parse(readFileSync(path,'utf8'));}catch{return null;}};
const inside=(root,path)=>{try{const base=realpathSync(root),target=realpathSync(resolve(base,path));return target.startsWith(base+sep)?target:null;}catch{return null;}};
function publicOrigin(value){
 try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|lan|test|example|invalid)$/.test(host)||host.endsWith('.home.arpa')||/^(?:example\.(?:com|net|org)|.*\.example\.(?:com|net|org))$/.test(host))return null;return url.origin;}catch{return null;}
}
export function mobileSourceFingerprint(root=process.cwd()){
 const files=['mobile/App.tsx','mobile/app.json','mobile/eas.json','mobile/package.json','mobile/package-lock.json'];
 const scan=directory=>{const target=inside(root,directory);if(!target)return;for(const entry of readdirSync(target,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.isSymbolicLink())continue;const name=directory+'/'+entry.name;if(entry.isDirectory())scan(name);else if(entry.isFile())files.push(name);}};
 scan('mobile/src');scan('mobile/assets');
 const hash=createHash('sha256');for(const name of [...new Set(files)].sort()){const path=inside(root,name);hash.update(name+'\0');hash.update(path?readFileSync(path):'MISSING');hash.update('\0');}return hash.digest('hex');
}
async function artifactMatches(root,item,platform){
 const path=typeof item?.artifact==='string'?inside(root,item.artifact):null;
 if(!path||extname(path)!==(platform==='android'?'.aab':'.ipa')||!/^[a-f0-9]{64}$/.test(item?.sha256||''))return false;
 const hash=createHash('sha256');try{for await(const part of createReadStream(path))hash.update(part);return hash.digest('hex')===item.sha256;}catch{return false;}
}
export async function checkMobileRelease({root=process.cwd(),env={},profile='production',evidencePath}={}){
 if(!['preview','production','simulator'].includes(profile))throw Error('Profile must be preview, simulator or production');
 const checks={},missing=[],warnings=[],attestations=[];
 const required=(key,valid)=>{checks[key]=!!valid;if(!valid)missing.push(key);};
 const app=readJson(resolve(root,'mobile/app.json'))?.expo,pkg=readJson(resolve(root,'mobile/package.json')),eas=readJson(resolve(root,'mobile/eas.json')),build=eas?.build?.[profile];
 required('mobile_configuration',!!app&&!!pkg);required('build_profile',!!build);
 const inherited=build?.extends?eas?.build?.[build.extends]:null,settings={...inherited,...build,ios:{...inherited?.ios,...build?.ios},android:{...inherited?.android,...build?.android}};
 required('ios_bundle_identifier',typeof app?.ios?.bundleIdentifier==='string'&&/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*){2,}$/.test(app.ios.bundleIdentifier));
 required('android_package',typeof app?.android?.package==='string'&&/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*){2,}$/.test(app.android.package));
 required('app_version',typeof app?.version==='string'&&/^\d+\.\d+\.\d+$/.test(app.version));
 required('custom_scheme',app?.scheme==='aiarenda');
 required('development_client_dependency',!settings.developmentClient||!!pkg?.dependencies?.['expo-dev-client']);
 required('no_unsigned_profile',settings.withoutCredentials!==true&&settings.android.withoutCredentials!==true&&settings.ios.withoutCredentials!==true);
 const apiOrigin=publicOrigin(env.EXPO_PUBLIC_API_URL),siteOrigin=publicOrigin(env.SITE_PUBLIC_URL);
 required('EXPO_PUBLIC_API_URL',!!apiOrigin);required('SITE_PUBLIC_URL',!!siteOrigin);required('shared_api_origin',!!apiOrigin&&apiOrigin===siteOrigin);
 const imagePicker=app?.plugins?.find(item=>Array.isArray(item)&&item[0]==='expo-image-picker')?.[1];
 required('camera_permission_explanation',typeof imagePicker?.cameraPermission==='string'&&imagePicker.cameraPermission.trim().length>=20);
 required('photos_permission_explanation',typeof imagePicker?.photosPermission==='string'&&imagePicker.photosPermission.trim().length>=20);
 required('no_unneeded_microphone',imagePicker?.microphonePermission===false);
 const fingerprint=mobileSourceFingerprint(root);
 if(profile==='production'){
  required('store_distribution',settings.distribution==='store');required('production_environment',settings.environment==='production');required('production_aab',settings.android.buildType==='app-bundle');required('production_physical_ios',settings.ios.simulator!==true);
  required('automatic_build_version',eas?.cli?.appVersionSource==='remote'&&settings.autoIncrement===true);
  required('expo_project_link',typeof app?.extra?.eas?.projectId==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(app.extra.eas.projectId)&&!/^0{8}-/.test(app.extra.eas.projectId));
  required('operator_name',typeof env.SERVICE_OPERATOR_NAME==='string'&&env.SERVICE_OPERATOR_NAME.trim().length>=3&&!/example|placeholder|тестовый/i.test(env.SERVICE_OPERATOR_NAME));
  required('support_contact',typeof env.SUPPORT_EMAIL==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL)&&!!publicOrigin('https://'+env.SUPPORT_EMAIL.split('@')[1]));
  const evidenceFile=evidencePath&&inside(root,evidencePath),evidence=evidenceFile?readJson(evidenceFile):null;
  required('release_evidence',!!evidence);
  required('evidence_source_fingerprint',evidence?.sourceFingerprint===fingerprint);
  required('evidence_app_version',evidence?.appVersion===app?.version&&!!app?.version);
  required('evidence_api_origin',!!apiOrigin&&evidence?.apiOrigin===apiOrigin);
  for(const key of mobileOperatorChecks){required('operator_'+key,evidence?.operatorChecks?.[key]===true);attestations.push('operator_'+key);}
  for(const platform of ['android','ios']){
   const item=evidence?.[platform];required(platform+'_artifact_hash',await artifactMatches(root,item,platform));
   const tested=Date.parse(item?.testedAt||'');required(platform+'_physical_test_record',typeof item?.device==='string'&&item.device.trim().length>=3&&!/simulator|emulator|симулятор|эмулятор/i.test(item.device)&&typeof item?.osVersion==='string'&&item.osVersion.trim().length>0&&Number.isFinite(tested)&&tested<=Date.now()+60000);
   required(platform+'_signing_review',item?.signingReviewed===true);attestations.push(platform+'_physical_test_record',platform+'_signing_review');
   for(const key of mobileDeviceCases){required(platform+'_'+key,item?.cases?.[key]===true);attestations.push(platform+'_'+key);}
  }
  warnings.push('Store_accounts_signing_keys_and_app_identifier_ownership_require_operator_access','Public_policies_support_links_and_shared_API_are_not_checked_over_network','Platform_signature_and_device_test_claims_are_operator_attestations_not_independent_verification');
 }else{
  required('internal_distribution',settings.distribution==='internal');required('preview_apk',settings.android.buildType==='apk');required('ios_profile_target',profile==='simulator'?settings.ios.simulator===true:settings.ios.simulator!==true);
  warnings.push('Internal_profile_does_not_mean_store_readiness','Standalone_preview_needs_a_reachable_HTTPS_shared_API');
 }
 return {ok:missing.length===0,profile,checks,missing,warnings,attestations,sourceFingerprint:fingerprint,storeSubmissionApproved:false,notice:'Offline configuration and artifact hash inspection. Operator attestations are listed separately. No credentials, source URLs or contact values are printed. No build, deployment, store upload, signature verification, policy approval or remote availability check is performed.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:undefined;};
 if(args.includes('--fingerprint'))console.log(mobileSourceFingerprint(root));
 else{const result=await checkMobileRelease({root,env:process.env,profile:option('--profile')||'production',evidencePath:option('--evidence')});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
}
