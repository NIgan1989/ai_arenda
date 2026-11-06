import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {generateAnswer,redactAIText}=await load('ai');
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'gpt-6-luna'},context={properties:[{id:'own-property'}],bookings:[{id:'own-booking'}],jobs:[{id:'own-job'}]};
const action=(fields={})=>({action:'create_cleaning',propertyId:'own-property',bookingId:null,jobId:null,start:'2026-11-01T14:00:00+05:00',end:'2026-11-01T16:00:00+05:00',fee:3000,note:'Уборка после гостей',...fields});
async function responseFor(output,text='Создай уборку 2026-11-01 с 14:00 до 16:00 за 3000 тенге',role='owner'){
 const original=globalThis.fetch;let executed=0;globalThis.fetch=async()=>Response.json({output});try{const result=await generateAnswer(config,text,role,[],'fallback',context,async()=>{executed++;return {text:'Подготовлено. Подтвердите условия.',commands:[{id:'draft'}]};});return {result,executed};}finally{globalThis.fetch=original;}
}
const call=args=>({type:'function_call',name:'prepare_administrator_action',arguments:JSON.stringify(args),call_id:'fixture'});
test('missing dates, invented complete conditions and foreign IDs cannot prepare a draft',async()=>{
 for(const [args,text] of [[action({start:null}),'Создай уборку'],[action(),'Создай уборку'],[action({propertyId:'foreign-property'}),'Создай уборку 2026-11-01 с 14:00 до 16:00 за 3000 тенге']]){const r=await responseFor([call(args)],text);assert.equal(r.executed,0);assert.equal(r.result.commands,undefined);assert.match(r.result.text,/Уточните|из списка/);}
 const valid=await responseFor([call(action())]);assert.equal(valid.executed,1);assert.equal(valid.result.commands[0].id,'draft');
});
test('unknown tools, multiple tools, additional fields and malformed JSON never execute',async()=>{
 const base=call(action());for(const output of [[{...base,name:'record_payment'}],[base,base],[call(action({ownerId:'other'}))],[{...base,arguments:'{broken'}]]){assert.equal((await responseFor(output)).executed,0);}
});
test('context instructions do not authorise commands; text claims cannot fake execution',async()=>{
 assert.equal((await responseFor([call(action())],'Какие квартиры доступны?')).executed,0);
 const claimed=await responseFor([{type:'message',content:[{type:'output_text',text:'Уборка создана и оплачена.'}]}]);assert.equal(claimed.executed,0);assert.match(claimed.result.text,/Изменений.*нет/);assert.ok(!claimed.result.text.includes('оплачена'));
 assert.equal((await responseFor([call(action())],undefined,'guest')).executed,0);
});
test('redaction keeps ISO timezone and UUID references while removing phone, email and key',()=>{
 const iso='2026-11-01T14:00:00+05:00',id='12345678-1234-1234-1234-123456789012',redacted=redactAIText(iso+' '+id+' +7 777 123 45 67 private@example.com sk-FIXTURESECRET01234567890');assert.ok(redacted.includes(iso));assert.ok(redacted.includes(id));assert.ok(!redacted.includes('777'));assert.ok(!redacted.includes('private@'));assert.ok(!redacted.includes('sk-'));
});
