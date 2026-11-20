import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';

const slots=text=>(text.match(/\{\w+\}/g)||[]).sort().join(' ');

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
