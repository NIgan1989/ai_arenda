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
