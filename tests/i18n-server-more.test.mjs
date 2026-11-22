import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';

// Lines the server writes after stage 5 of the languages (lib/i18n-server-more.ts): the app and Telegram show them
// in Kazakh and English, the name of the place stays as the owner wrote it.
test('new server lines and notices of the AI administrator are read in Kazakh and English',async()=>{
  const {tServerIn}=await load('i18n'),{noticeIn}=await load('notice-feed');
  const notices=[
    'ИИ-администратор: бронь «Дом у реки» не оплачена. Оплатите до 18:00, иначе бронь снимется и жильё станет свободным.',
    'ИИ-администратор: вы не заселились в «Дом у реки» и не ответили, бронь снята. Оплаты не было, возвращать нечего.',
    'ИИ-администратор подтвердил выезд гостя из «Дом у реки»: гость сообщил о выезде, полчаса ответа не было. Проверьте жильё и верните депозит или удержите часть с причиной.',
    'Администратор проверил «Дом у реки». Чтобы жильё появилось у гостей на карте, осталось: дописать описание до 80 знаков; добавить фото: нужно не меньше 3, сейчас 1. Как только это будет готово, жильё покажется само.',
    'Вы на месте в «Дом у реки». Переведите владельцу оплату по реквизитам из карточки брони и нажмите «Я оплатил». Когда владелец увидит деньги, ИИ-администратор подтвердит заселение.',
  ];
  const lines=['Сообщить о заселении можно за 15 минут до заезда: в 13:45.','Уборка уже начата, отменить её нельзя. Если работа сделана, закройте уборку как выполненную; если исполнитель не справляется, передайте её другому, тогда оплату сделанной части обсудите в обращении.','Быстрая приёмка перед заездом'];
  const russian=/[а-яё]{3,}/i,place=/Дом у реки/g;
  for(const l of ['kk','en'])for(const [text,read] of [...notices.map(n=>[n,noticeIn]),...lines.map(n=>[n,tServerIn])]){
    const out=read(l,text);
    assert.notEqual(out,text,text);
    if(l==='en')assert.doesNotMatch(out.replace(place,''),russian,out);
    if(text.includes('Дом у реки'))assert.match(out,/«Дом у реки»/);
  }
});
