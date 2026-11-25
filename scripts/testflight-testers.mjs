#!/usr/bin/env node
// Opens the latest iPhone build to the outside testers of TestFlight through the App Store Connect API
// (docs/TESTFLIGHT.md, "Тестировщики"): the beta description and feedback email, the details for Apple's beta review
// (contact and the demo guest account), "what to test" for the build, the external group «Павлодар бета» with its
// public link, the build in that group and the build sent to Apple's beta review.
//
//   node scripts/testflight-testers.mjs --check   read only: the key works, shows what is there and what would change
//   node scripts/testflight-testers.mjs           makes the changes; every step is safe to repeat
//
// Environment: ASC_KEY_P8 (text of the .p8 file) or ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID;
// for the changes also BETA_DEMO_PASSWORD (password of the demo guest) and BETA_CONTACT_PHONE (phone for Apple).
// Optional: BUILD_NUMBER (wait for this build instead of taking the latest), BETA_DEMO_LOGIN, BETA_GROUP,
// BUILD_WAIT_MINUTES.
import {createSign} from 'node:crypto';
import {readFileSync,appendFileSync} from 'node:fs';

const check=process.argv.includes('--check');
const env=process.env;
const GROUP=env.BETA_GROUP||'Павлодар бета';
const DEMO_LOGIN=env.BETA_DEMO_LOGIN||'+77000000301';
const WAIT_MINUTES=Number(env.BUILD_WAIT_MINUTES||45);
const API='https://api.appstoreconnect.apple.com';

const DESCRIPTION='AiQonaq — аренда жилья посуточно и по часам в Павлодаре. Гость ищет жильё на карте и бронирует, '+
  'владелец сдаёт жильё и заказывает уборку, исполнитель берёт уборки, а ИИ-администратор ведёт всё в чате. '+
  'Оплата в бета-версии ненастоящая: деньги не списываются.';
const WHATS_NEW='Что проверить: поиск жилья на карте, бронь, заселение и выезд, заказ уборки, чат с ИИ-администратором. '+
  'Пишите обо всём, что непонятно или неудобно: скриншот в TestFlight или сообщение в группу беты.';
const REVIEW_NOTES='AiQonaq is a marketplace for short-term rentals (by the day or by the hour) in Pavlodar, Kazakhstan. '+
  'Sign in with the demo guest account above: enter the phone number and the password on the sign-in screen. '+
  'The app follows the device language (English, Russian or Kazakh). '+
  'Payments in this beta are simulated: no real card is charged and no money moves.';

function summary(line){
  console.log(line);
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,line+'\n');
}
function fail(message){
  console.log(`::error::${message}`);
  process.exit(1);
}

const keyText=env.ASC_KEY_P8||(env.ASC_KEY_PATH?readFileSync(env.ASC_KEY_PATH,'utf8'):'');
const missing=['ASC_KEY_ID','ASC_ISSUER_ID','ASC_APP_ID'].filter(name=>!env[name]);
if(!keyText)missing.unshift('ASC_KEY_P8');
if(missing.length)fail(`Нет: ${missing.join(', ')}. См. docs/TESTFLIGHT.md.`);
const betaMissing=['BETA_DEMO_PASSWORD','BETA_CONTACT_PHONE'].filter(name=>!env[name]);
if(betaMissing.length&&!check)fail(`Нет секретов: ${betaMissing.join(', ')}. См. docs/TESTFLIGHT.md, «Тестировщики».`);
const appId=env.ASC_APP_ID;

const b64url=value=>Buffer.from(value).toString('base64url');
let token='',tokenAt=0;
function bearer(){
  const now=Math.floor(Date.now()/1000);
  if(token&&now-tokenAt<600)return token;
  const head=b64url(JSON.stringify({alg:'ES256',kid:env.ASC_KEY_ID,typ:'JWT'}));
  const body=b64url(JSON.stringify({iss:env.ASC_ISSUER_ID,iat:now,exp:now+1100,aud:'appstoreconnect-v1'}));
  const signer=createSign('SHA256');
  signer.update(`${head}.${body}`);
  token=`${head}.${body}.${signer.sign({key:keyText,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
  tokenAt=now;
  return token;
}

async function api(method,path,data,{allow=[]}={}){
  const response=await fetch(API+path,{
    method,
    headers:{authorization:`Bearer ${bearer()}`,...(data?{'content-type':'application/json'}:{})},
    body:data?JSON.stringify({data}):undefined,
  });
  if(response.status===204)return null;
  const json=await response.json().catch(()=>({}));
  if(!response.ok){
    if(allow.includes(response.status))return {error:json,status:response.status};
    const detail=(json.errors||[]).map(e=>`${e.title}: ${e.detail}`).join('; ')||response.statusText;
    fail(`App Store Connect ${method} ${path.split('?')[0]}: ${response.status} ${detail}`);
  }
  return json;
}
const ref=(type,id)=>({data:{type,id}});

// 1. The app and who answers for it.
const app=(await api('GET',`/v1/apps/${appId}?fields[apps]=name,bundleId,primaryLocale`)).data;
const locale=app.attributes.primaryLocale||'ru';
summary(`Приложение: ${app.attributes.name} (${app.attributes.bundleId}), основной язык ${locale}.`);
const users=(await api('GET','/v1/users?filter[roles]=ACCOUNT_HOLDER&limit=5')).data;
const holder=users[0]?.attributes;
if(!holder)fail('Не нашёл владельца аккаунта (роль Account Holder). Ключу App Store Connect нужна роль Admin.');
const contact={first:holder.firstName,last:holder.lastName,email:holder.username};
console.log(`Контакт для Apple: ${contact.first} ${contact.last}.`);

// 2. The latest build, once Apple has processed it.
// A build that was just uploaded appears in App Store Connect only after a few minutes, so BUILD_NUMBER waits for it.
const wanted=env.BUILD_NUMBER&&env.BUILD_NUMBER!=='null'?env.BUILD_NUMBER:'';
async function latestBuild(){
  const only=wanted?`&filter[version]=${encodeURIComponent(wanted)}`:'';
  const list=await api('GET',`/v1/builds?filter[app]=${appId}${only}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState,expired,uploadedDate`);
  return list.data[0];
}
let build=await latestBuild();
for(let waited=0;!check&&(!build||build.attributes.processingState==='PROCESSING');waited++){
  const name=wanted||build?.attributes.version;
  if(waited>=WAIT_MINUTES)fail(`Сборка ${name} не готова в App Store Connect за ${WAIT_MINUTES} минут. Запустите «TestFlight testers» позже.`);
  if(waited%5===0)console.log(`Сборка ${name}: ${build?'Apple ещё обрабатывает':'ещё не появилась'}, жду…`);
  await new Promise(resolve=>setTimeout(resolve,60_000));
  build=await latestBuild();
}
if(!build)fail('В App Store Connect ещё нет ни одной сборки. Сначала запустите «iPhone to TestFlight».');
const state=build.attributes.processingState;
summary(`Сборка ${build.attributes.version}: ${state}${build.attributes.expired?', истекла':''}.`);
if(!check&&(state!=='VALID'||build.attributes.expired))fail(`Сборку ${build.attributes.version} нельзя дать тестерам: ${state}.`);

// 3. The beta description and the feedback email.
const appLocalizations=(await api('GET',`/v1/apps/${appId}/betaAppLocalizations`)).data;
const appText={description:DESCRIPTION,feedbackEmail:contact.email};
const appLocalization=appLocalizations.find(l=>l.attributes.locale===locale);
if(check)console.log(`Описание беты (${locale}): ${appLocalization?'есть, обновлю':'нет, создам'}.`);
else if(appLocalization)await api('PATCH',`/v1/betaAppLocalizations/${appLocalization.id}`,{type:'betaAppLocalizations',id:appLocalization.id,attributes:appText});
else await api('POST','/v1/betaAppLocalizations',{type:'betaAppLocalizations',attributes:{locale,...appText},relationships:{app:ref('apps',appId)}});

// 4. What Apple's beta review needs: contact, demo account, notes.
const review=(await api('GET',`/v1/apps/${appId}/betaAppReviewDetail`)).data;
if(check)console.log(`Данные для проверки Apple: вход ${review.attributes.demoAccountRequired?'указан':'не указан'}; секреты: ${betaMissing.length?`нет ${betaMissing.join(', ')}`:'есть'}.`);
else await api('PATCH',`/v1/betaAppReviewDetails/${review.id}`,{type:'betaAppReviewDetails',id:review.id,attributes:{
  contactFirstName:contact.first,contactLastName:contact.last,contactEmail:contact.email,contactPhone:env.BETA_CONTACT_PHONE,
  demoAccountRequired:true,demoAccountName:DEMO_LOGIN,demoAccountPassword:env.BETA_DEMO_PASSWORD,notes:REVIEW_NOTES,
}});

// 5. "What to test" for this build.
const buildLocalizations=(await api('GET',`/v1/builds/${build.id}/betaBuildLocalizations`)).data;
const buildLocalization=buildLocalizations.find(l=>l.attributes.locale===locale);
if(check)console.log(`«Что проверить» у сборки: ${buildLocalization?'есть, обновлю':'нет, создам'}.`);
else if(buildLocalization)await api('PATCH',`/v1/betaBuildLocalizations/${buildLocalization.id}`,{type:'betaBuildLocalizations',id:buildLocalization.id,attributes:{whatsNew:WHATS_NEW}});
else await api('POST','/v1/betaBuildLocalizations',{type:'betaBuildLocalizations',attributes:{locale,whatsNew:WHATS_NEW},relationships:{build:ref('builds',build.id)}});

// 6. The external group, the build in it and the build sent to Apple's beta review.
const groups=(await api('GET',`/v1/apps/${appId}/betaGroups?limit=200`)).data;
const external=groups.filter(g=>!g.attributes.isInternalGroup);
// The group made by hand in App Store Connect is kept when it is the only outside group, so there are no two of them.
let group=external.find(g=>g.attributes.name===GROUP)||(external.length===1?external[0]:undefined);
const submission=await api('GET',`/v1/builds/${build.id}/betaAppReviewSubmission`,undefined,{allow:[404]});
const reviewState=submission?.data?.attributes?.betaReviewState||null;
if(check){
  console.log(`Внешняя группа: ${group?`«${group.attributes.name}»`:`нет, создам «${GROUP}»`}. Все группы: ${groups.map(g=>`${g.attributes.name}${g.attributes.isInternalGroup?' (внутр.)':''}`).join(', ')||'нет'}.`);
  summary(`Проверка Apple для этой сборки: ${reviewState||'ещё не отправлена'}.`);
  summary('Только чтение: ничего не изменено.');
  process.exit(0);
}
if(!group)group=(await api('POST','/v1/betaGroups',{type:'betaGroups',
  attributes:{name:GROUP,feedbackEnabled:true},relationships:{app:ref('apps',appId)}})).data;
await api('POST',`/v1/betaGroups/${group.id}/relationships/builds`,[{type:'builds',id:build.id}]);
summary(`Сборка ${build.attributes.version} в группе «${group.attributes.name}».`);

if(reviewState)summary(`Проверка Apple: ${reviewState}.`);
else{
  await api('POST','/v1/betaAppReviewSubmissions',{type:'betaAppReviewSubmissions',relationships:{build:ref('builds',build.id)}});
  summary('Сборка отправлена на проверку Apple (обычно до суток).');
}

// 7. The public link. Apple may refuse it until the first build of the group is approved; then run this again later.
if(!group.attributes.publicLinkEnabled){
  const turned=await api('PATCH',`/v1/betaGroups/${group.id}`,{type:'betaGroups',id:group.id,
    attributes:{publicLinkEnabled:true,publicLinkLimitEnabled:false}},{allow:[409,422]});
  if(turned?.error){
    const why=(turned.error.errors||[]).map(e=>e.detail).join('; ');
    summary(`Публичную ссылку Apple пока не дал (${why}). Запустите эту сборку ещё раз после одобрения.`);
  }else group=turned.data;
}
if(group.attributes.publicLink)summary(`Публичная ссылка для тестеров: ${group.attributes.publicLink}`);
