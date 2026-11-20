import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';

// {name:acc} asks for a form of the same value: the name is what must match.
const slots=text=>[...new Set((text.match(/\{\w+(?::\w+)*\}/g)||[]).map(v=>v.replace(/:[\w:]+\}$/,'}')))].sort().join(' ');

test('every translation keeps the variable parts of its Russian line',async()=>{
  const {WORDS}=await load('i18n-words');
  assert.ok(Object.keys(WORDS).length>300);
  for(const [ru,row] of Object.entries(WORDS)){
    assert.equal(row.length,2,ru);
    for(const text of row){assert.ok(text.trim(),'empty translation: '+ru);assert.equal(slots(text),slots(ru),ru);}
    // A line that starts or ends with a space is a piece of a sentence: the space is part of it.
    for(const text of row){assert.equal(/^\s/.test(text),/^\s/.test(ru),ru);assert.equal(/\s$/.test(text),/\s$/.test(ru),ru);}
  }
});

test('texts follow the language and stay Russian without a translation',async()=>{
  const {t,tIn,tParts,setLang,lang,langOf,plural,L,onLang}=await load('i18n');
  assert.equal(lang(),'ru');
  assert.equal(t('Войти'),'Войти');
  assert.equal(tIn('kk','Войти'),'Кіру');
  assert.equal(tIn('en','Найдено: {n}',{n:3}),'Found: 3');
  const names=L({guest:'Гость',pages:[{id:'map',title:'Карта'}]});
  let heard='';const stop=onLang(v=>{heard=v;});
  setLang('kk');
  assert.equal(heard,'kk');
  assert.equal(t('Войти'),'Кіру');
  assert.equal(t('Такой строки в таблице нет'),'Такой строки в таблице нет');
  assert.equal(names.guest,'Қонақ');
  assert.deepEqual(names.pages.map(p=>p.id+':'+p.title),['map:Карта']);
  assert.equal(plural(5,['гость','гостя','гостей'],['guest','guests'],'қонақ'),'қонақ');
  assert.deepEqual(tParts('Принимаю {terms} и даю {consent}').filter(p=>typeof p!=='string').map(p=>p.slot),['terms','consent']);
  setLang('en');
  assert.equal(names.pages[0].title,'Map');
  assert.equal(plural(1,['гость','гостя','гостей'],['guest','guests'],'қонақ'),'guest');
  assert.equal(plural(2,['гость','гостя','гостей'],['guest','guests'],'қонақ'),'guests');
  setLang('ru');stop();
  assert.equal(plural(22,['гость','гостя','гостей'],['guest','guests'],'қонақ'),'гостя');
  assert.equal(plural(11,['гость','гостя','гостей'],['guest','guests'],'қонақ'),'гостей');
  assert.equal(langOf('kk-KZ'),'kk');assert.equal(langOf('ru_RU'),'ru');assert.equal(langOf('en-US'),'en');assert.equal(langOf('de'),'en');assert.equal(langOf('uz'),'ru');assert.equal(langOf(''),'ru');
});

test('Kazakh endings follow the last sound and the vowels of the word',async()=>{
  const {kkCase}=await load('i18n');
  const forms=(word,list)=>assert.deepEqual(['acc','dat','gen','abl','loc','ins'].map(c=>kkCase(word,c)),list.split(' '),word);
  forms('шығу','шығуды шығуға шығудың шығудан шығуда шығумен');
  forms('кіру','кіруді кіруге кірудің кіруден кіруде кірумен');
  forms('қонақ','қонақты қонаққа қонақтың қонақтан қонақта қонақпен');
  forms('иесі','иесіні иесіге иесінің иесіден иесіде иесімен');
  forms('баспана','баспананы баспанаға баспананың баспанадан баспанада баспанамен');
  forms('тазалау','тазалауды тазалауға тазалаудың тазалаудан тазалауда тазалаумен');
  forms('бронь','броньды броньға броньның броньнан броньда броньмен');
  forms('депозит','депозитті депозитке депозиттің депозиттен депозитте депозитпен');
  assert.equal(kkCase('14:00','dat'),'14:00');
});

test('a date keeps its Kazakh names on a device that has none', async () => {
  const {kkDateNames,kkCase}=await load('i18n');
  assert.equal(kkDateNames('20 нояб., 23:30'),'20 қар., 23:30');
  assert.equal(kkDateNames('пятница, 20 ноября'),'жұма, 20 қараша');
  assert.equal(kkDateNames('воскресенье, 5 мая 2026 г.'),'жексенбі, 5 мамыр 2026 ж.');
  assert.equal(kkDateNames('вс, 3 сент.'),'жс, 3 қыр.');
  // «its»: the guest's check-in, arrival, start.
  assert.deepEqual(['кіру','келу','басталу','шығу'].map(w=>kkCase(w,'poss')),['кіруі','келуі','басталуы','шығуы']);
});

test('a Russian line of the server with numbers is found by its pattern', async () => {
  const {tLine,setLang}=await load('i18n');
  assert.equal(tLine('отвечает на 67% заявок'),'отвечает на 67% заявок');
  setLang('kk');
  assert.equal(tLine('отвечает на 67% заявок'),'өтінімдердің 67%-ына жауап береді');
  assert.equal(tLine('Отвечает в среднем за 1 минуту'),'Орташа 1 минутта жауап береді');
  assert.equal(tLine('оценка гостей 4,8'),'қонақтардың бағасы 4,8');
  assert.equal(tLine('Строка, которой нет в таблицах: 5'),'Строка, которой нет в таблицах: 5');
  setLang('en');
  assert.equal(tLine('оценка гостей 4,8'),'guest rating 4.8');
  assert.equal(tLine('телефон подтверждён'),'phone confirmed');
  setLang('ru');
});

test('a Russian word with two meanings has a line for each', async () => {
  const {t,tc,setLang}=await load('i18n');
  assert.equal(tc('Загрузка','occupancy'),'Загрузка');
  setLang('kk');assert.equal(t('Загрузка'),'Жүктелуде');assert.equal(tc('Загрузка','occupancy'),'Жүктеме');
  setLang('en');assert.equal(tc('Загрузка','occupancy'),'Occupancy');assert.equal(tc('Слово без второй строки','x'),'Слово без второй строки');
  setLang('ru');
});

test('the shared lines of the owner are whole sentences in each language', async () => {
  const {setLang}=await load('i18n');
  const {planPrice,ownerHandoff,rulesLine}=await load('autopilot-handoff'),{calendarStatus}=await load('flat-calendars'),{regularSince}=await load('regular-cleaner-text');
  const {dayLine}=await load('calendar-days'),{activity}=await load('activity'),{hubLine}=await load('property-hub'),{answerBy}=await load('now-card'),{repeatLabel}=await load('home-repeat-text');
  const settings={price:4900,charge:true,trialDays:14},now=1795000000,source={enabled:1,automatic:1,last_success:now-7200,busy:3};
  const entry={key:'job:1',kind:'job',id:'1',title:'Дом',start:now,end:now+3600,planned:now+3600,tone:'cleaning',status:'Нужен исполнитель'};
  const lines=()=>[planPrice(settings,2,'owner'),ownerHandoff({flats:[{title:'Дом'},{title:'Баня'}],settings:{}}).title,rulesLine({districts:[],days:127,fromMinute:600,toMinute:1140,maxPerDay:4,minFee:0}),
    calendarStatus(source,now).text,regularSince({here:5,noShows:1}),dayLine({...entry,planned:now+3*86400},Math.floor((now+18000)/86400)*86400-18000),
    activity('booking',{status:'confirmed',end:now+3600,terms:{},property_type:'banya'},now).label,hubLine([{...entry,waiting:true,status:'Откликов: 2'}],now),answerBy(now+86400,now).replace(/\d\d:\d\d/,'T'),repeatLabel(14)].map(v=>v.replace(/\u00a0|\u202f/g,' '));
  assert.deepEqual(lines(),['Первые 14 дней бесплатно, потом 9 800 ₸ в месяц с привязанной карты.','Вы сами ведёте 2 объекта','Любой район · каждый день · 10:00–19:00 · до 4 уборок в день',
    'Не обновляется с 2 ч. Новые заявки на это жильё остановлены','5 уборок здесь · 1 срыв','С 16:06','Ожидаем прихода','Уборка: откликов: 2','ответить до завтра в T','Раз в 2 недели']);
  setLang('kk');
  assert.deepEqual(lines().slice(0,5),['Алғашқы 14 күн тегін, одан кейін байланған картадан айына 9 800 ₸.','2 нысанды өзіңіз жүргізесіз','Кез келген аудан · күн сайын · 10:00–19:00 · күніне 4 тазалауға дейін',
    '2 сағ бойы жаңармай тұр. Осы баспанаға жаңа өтінімдер тоқтатылды','осы жерде 5 тазалау · 1 рет келмеді']);
  assert.deepEqual(lines().slice(6,7).concat(lines().slice(8)),['Келуді күтудеміз','ертең T дейін жауап беру','2 аптада бір рет']);
  setLang('en');
  assert.deepEqual(lines().slice(0,5),['First 14 days free, then 9 800 ₸ a month from the linked card.','You run 2 properties yourself','Any district · every day · 10:00–19:00 · up to 4 cleanings a day',
    'Not updated for 2 h. New requests for this place are stopped','5 cleanings here · 1 no-show']);
  assert.deepEqual(lines().slice(6,7).concat(lines().slice(8)),['Waiting for arrival','answer by tomorrow T','Every 2 weeks']);
  setLang('ru');
});

test('the documents the server asks an owner for have a line in each language',async()=>{
  const {WORDS}=await load('i18n-words'),{RIGHT_DOCS}=await load('property-rights');
  for(const text of Object.values(RIGHT_DOCS))assert.ok(WORDS[text],text);
});

test('the cleaner reads the place and the next step in the chosen language',async()=>{
  const {setLang}=await load('i18n'),{jobPlace,cleaningTime}=await load('job-place'),{cleanerLine,cleanerStep}=await load('job-steps'),{cleanerNext}=await load('cleaner-next');
  const job={status:'open',rooms:2,property_details:JSON.stringify({type:'apartment',area:37,bathrooms:1,floor:2,floors:12})};
  const lines=()=>{const v=jobPlace(job);return [v.floor,v.facts.map(f=>f.value+' '+f.label).join(', '),cleaningTime(90),cleanerStep(job,undefined,'me').label,cleanerLine({status:'assigned',booking_id:'b'}),cleanerNext({status:'open'},{status:'pending'},'approved','me').title];};
  assert.deepEqual(lines(),['2 этаж из 12','2 комнаты, 37 м² площадь, 1 санузел','≈ 1 ч 30 мин','Откликнуться','Ждём выезда гостя','Отклик у владельца']);
  setLang('kk');
  assert.deepEqual(lines(),['12 қабаттың 2-қабаты','2 бөлме, 37 м² ауданы, 1 санторап','≈ 1 сағ 30 мин','Өтінім беру','Қонақтың шығуын күтудеміз','Өтінім иесінде']);
  setLang('en');
  assert.deepEqual(lines(),['floor 2 of 12','2 rooms, 37 m² area, 1 bathroom','≈ 1 h 30 min','Apply','Waiting for the guest to check out','The application is with the owner']);
  setLang('ru');
});
