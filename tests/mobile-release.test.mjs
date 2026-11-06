import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {checkMobileRelease,mobileSourceFingerprint,mobileDeviceCases,mobileOperatorChecks} from '../scripts/check-mobile-release.mjs';
function fixture(){
 mkdirSync('outputs',{recursive:true});const root=mkdtempSync(resolve('outputs/mobile-release-test-'));
 const write=(path,value)=>{const target=resolve(root,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
 const app={expo:{name:'Fixture',scheme:'aiarenda',version:'1.0.0',ios:{bundleIdentifier:'app.company.rental'},android:{package:'app.company.rental'},extra:{eas:{projectId:'11111111-1111-4111-8111-111111111111'}},plugins:[['expo-image-picker',{cameraPermission:'Разрешите снять фото объекта по вашему запросу.',photosPermission:'Разрешите выбрать фотографию объекта по вашему запросу.',microphonePermission:false}]]}};
 write('mobile/app.json',app);write('mobile/eas.json',readFileSync('mobile/eas.json'));write('mobile/package.json',{dependencies:{expo:'~57.0.0'}});write('mobile/package-lock.json',{});write('mobile/App.tsx','// Fixture mobile source');write('mobile/src/api.ts','// Fixture shared API');
 const env={EXPO_PUBLIC_API_URL:'https://rent.company.kz',SITE_PUBLIC_URL:'https://rent.company.kz',SERVICE_OPERATOR_NAME:'Fixture Operator',SUPPORT_EMAIL:'support@company.kz',SECRET_KEY:'never-print-this-secret'};
 const bytes=Buffer.from('fixture artifact, not a real signed native archive');
 write('outputs/app.aab',bytes);write('outputs/app.ipa',bytes);
 const evidence={sourceFingerprint:mobileSourceFingerprint(root),appVersion:'1.0.0',apiOrigin:env.EXPO_PUBLIC_API_URL,operatorChecks:Object.fromEntries(mobileOperatorChecks.map(key=>[key,true]))};
 for(const platform of ['android','ios'])evidence[platform]={artifact:'outputs/app.'+(platform==='android'?'aab':'ipa'),sha256:createHash('sha256').update(bytes).digest('hex'),device:platform==='android'?'Physical Android fixture':'Physical iPhone fixture',osVersion:'fixture OS',testedAt:new Date().toISOString(),signingReviewed:true,cases:Object.fromEntries(mobileDeviceCases.map(key=>[key,true]))};
 write('outputs/evidence.json',evidence);
 return {root,write,env,app,evidence,check:extra=>checkMobileRelease({root,env,evidencePath:'outputs/evidence.json',...extra})};
}

test('release inspection separates configuration checks and attestations from store approval and never prints secrets',async()=>{
 const f=fixture(),result=await f.check();assert.equal(result.ok,true);assert.equal(result.storeSubmissionApproved,false);assert.ok(result.attestations.includes('ios_nativeMapChatsProfiles'));assert.match(result.notice,/No build, deployment/);assert.ok(!JSON.stringify(result).includes(f.env.SECRET_KEY));assert.ok(!JSON.stringify(result).includes(f.env.EXPO_PUBLIC_API_URL));assert.ok(!JSON.stringify(result).includes(f.env.SUPPORT_EMAIL));
});
test('production fails closed for local, private, credential-bearing, placeholder or non-root API and mismatched shared origin',async()=>{
 const f=fixture();for(const url of ['http://rent.company.kz','https://localhost.','https://127.0.0.1','https://[::1]','https://2130706433','https://api.internal','https://example.com','https://demo.example.com','https://user:password@rent.company.kz','https://rent.company.kz/api','https://rent.company.kz/?token=secret']){const r=await f.check({env:{...f.env,EXPO_PUBLIC_API_URL:url}});assert.equal(r.checks.EXPO_PUBLIC_API_URL,false,url);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('password'));}
 const other=await f.check({env:{...f.env,EXPO_PUBLIC_API_URL:'https://other.company.kz'}});assert.equal(other.checks.shared_api_origin,false);
});
test('current source and artifact changes invalidate previously recorded physical-device evidence',async()=>{
 const f=fixture();f.write('outputs/unrelated.log','output only');assert.equal((await f.check()).ok,true);
 f.write('mobile/src/api.ts','// Changed API routing');const changed=await f.check();assert.equal(changed.checks.evidence_source_fingerprint,false);
 f.evidence.sourceFingerprint=mobileSourceFingerprint(f.root);f.write('outputs/evidence.json',f.evidence);f.write('outputs/app.aab','modified archive');const archive=await f.check();assert.equal(archive.checks.android_artifact_hash,false);assert.equal(archive.checks.ios_artifact_hash,true);
});
test('missing functional checks, a simulator, wrong signing/profile and escaped artifacts cannot be presented as ready',async()=>{
 const f=fixture();delete f.evidence.android.cases.accountDeletion;f.evidence.ios.device='iOS Simulator';f.evidence.android.artifact='../outside.aab';f.write('outputs/evidence.json',f.evidence);
 const r=await f.check();assert.equal(r.checks.android_accountDeletion,false);assert.equal(r.checks.ios_physical_test_record,false);assert.equal(r.checks.android_artifact_hash,false);
 const eas=JSON.parse(readFileSync(resolve(f.root,'mobile/eas.json'),'utf8'));eas.build.production.developmentClient=true;eas.build.production.withoutCredentials=true;eas.build.production.ios.simulator=true;eas.build.production.android.buildType='apk';f.write('mobile/eas.json',eas);
 const invalid=await f.check();for(const key of ['development_client_dependency','no_unsigned_profile','production_physical_ios','production_aab'])assert.equal(invalid.checks[key],false,key);
});
test('preview/simulator remain internal build profiles and cannot bypass the HTTPS shared API requirement',async()=>{
 const f=fixture();const preview=await f.check({profile:'preview'}),simulator=await f.check({profile:'simulator'});assert.equal(preview.ok,true);assert.equal(simulator.ok,true);assert.equal(preview.storeSubmissionApproved,false);
 const local=await f.check({profile:'preview',env:{}});assert.equal(local.ok,false);assert.ok(local.missing.includes('EXPO_PUBLIC_API_URL'));
 const actual=await checkMobileRelease({root:process.cwd(),env:{},profile:'production'});assert.equal(actual.ok,false);assert.ok(actual.missing.includes('release_evidence'));assert.ok(actual.missing.includes('EXPO_PUBLIC_API_URL'));
});
