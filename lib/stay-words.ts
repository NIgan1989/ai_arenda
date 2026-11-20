import {L} from './i18n';
// Слова брони по виду объекта. В жильё заезжают и из него выезжают, в баню приходят на несколько часов,
// в зале проходит мероприятие. Шаги брони одни и те же (lib/guest-trips.ts, lib/owner-steps.ts), меняются только слова.
// Списки типов повторяют категории bath и banquet из lib/listings.ts: файл остаётся без зависимостей, его читает и приложение.
const BATH = ['banya', 'sauna'], HALL = ['banquet', 'cafe'];

export type StayWords = {
  arrive: string; arriveLow: string; arriveGen: string; arriveAcc: string;
  stay: string; leave: string; leaveLow: string; leaveGen: string; ofLeave: string; afterLeave: string;
  youIn: string; youAre: string; guestIn: string; aiIn: string; youInside: string; guestInside: string;
  leaveOk: string; aiOut: string; guestOut: string; canIn: string;
  iAmIn: string; swipeIn: string; swipeOut: string; swipeGuestOut: string;
  done: string; rate: string; rateBtn: string; ready: string; readyLow: string;
  ofArrive: string; arriveOk: string; leaveNotOk: string; notIn: string; notOut: string;
};

const HOME: StayWords = L({
  arrive: 'Заезд', arriveLow: 'заезд', arriveGen: 'заезда', arriveAcc: 'заселение',
  stay: 'Проживание', leave: 'Выезд', leaveLow: 'выезд', leaveGen: 'выезда', ofLeave: 'о выезде', afterLeave: 'после выезда',
  youIn: 'Вы заселились', youAre: 'Вы заселены', guestIn: 'Гость заселился', aiIn: 'ИИ заселил гостя', youInside: 'Вы в жилье', guestInside: 'Гость в жилье',
  leaveOk: 'Выезд подтверждён', aiOut: 'ИИ подтвердил выезд', guestOut: 'Гость выехал', canIn: 'Можно заселяться',
  iAmIn: 'Я заселился', swipeIn: 'я заселился', swipeOut: 'я выехал', swipeGuestOut: 'гость выехал',
  done: 'Проживание завершено', rate: 'Оцените проживание', rateBtn: 'Оценить проживание', ready: 'Жильё готово', readyLow: 'жильё убрано и готово',
  ofArrive: 'о заселении', arriveOk: 'Заселение подтверждено', leaveNotOk: 'Выезд пока не подтверждён', notIn: 'гость ещё не заселился', notOut: 'гость не выехал',
});
const BATH_WORDS: StayWords = L({
  arrive: 'Приход', arriveLow: 'приход', arriveGen: 'прихода', arriveAcc: 'приход',
  stay: 'Отдых', leave: 'Уход', leaveLow: 'уход', leaveGen: 'ухода', ofLeave: 'об уходе', afterLeave: 'после ухода',
  youIn: 'Вы на месте', youAre: 'Вы на месте', guestIn: 'Гость на месте', aiIn: 'ИИ отметил приход гостя', youInside: 'Вы отдыхаете', guestInside: 'Гость отдыхает',
  leaveOk: 'Уход подтверждён', aiOut: 'ИИ подтвердил уход', guestOut: 'Гость ушёл', canIn: 'Можно приходить',
  iAmIn: 'Я на месте', swipeIn: 'я на месте', swipeOut: 'мы ушли', swipeGuestOut: 'гость ушёл',
  done: 'Отдых завершён', rate: 'Оцените отдых', rateBtn: 'Оценить отдых', ready: 'Баня готова', readyLow: 'баня убрана и готова',
  ofArrive: 'о приходе', arriveOk: 'Приход подтверждён', leaveNotOk: 'Уход пока не подтверждён', notIn: 'гость ещё не пришёл', notOut: 'гость не ушёл',
});
const HALL_WORDS: StayWords = L({
  arrive: 'Начало', arriveLow: 'начало', arriveGen: 'начала', arriveAcc: 'начало',
  stay: 'Мероприятие', leave: 'Окончание', leaveLow: 'окончание', leaveGen: 'окончания', ofLeave: 'об окончании', afterLeave: 'после мероприятия',
  youIn: 'Вы на месте', youAre: 'Вы на месте', guestIn: 'Гости на месте', aiIn: 'ИИ отметил начало', youInside: 'Мероприятие идёт', guestInside: 'Мероприятие идёт',
  leaveOk: 'Окончание подтверждено', aiOut: 'ИИ подтвердил окончание', guestOut: 'Гости ушли', canIn: 'Можно приходить',
  iAmIn: 'Мы на месте', swipeIn: 'мы на месте', swipeOut: 'мероприятие закончилось', swipeGuestOut: 'гости ушли',
  done: 'Мероприятие завершено', rate: 'Оцените зал', rateBtn: 'Оценить зал', ready: 'Зал готов', readyLow: 'зал убран и готов',
  ofArrive: 'о начале мероприятия', arriveOk: 'Начало подтверждено', leaveNotOk: 'Окончание пока не подтверждено', notIn: 'гости ещё не пришли', notOut: 'гости не ушли',
});

export const stayWords = (type?: string | null): StayWords => HALL.includes(type || '') ? HALL_WORDS : BATH.includes(type || '') ? BATH_WORDS : HOME;
// Бронь в ответе сервера несёт тип объекта в property_type.
export const wordsOf = (b?: { property_type?: string | null } | null): StayWords => stayWords(b?.property_type);
// Жильё говорит прежними словами, баня и зал своими: venueOr(b, 'текст для жилья', 'текст для бани и зала').
export const isHome = (b?: { property_type?: string | null } | null) => wordsOf(b) === HOME;
export const venueOr = (b: { property_type?: string | null } | null | undefined, home: string, venue: string) => isHome(b) ? home : venue;
// Тип объекта рядом с бронью в запросе, где properties идёт как p.
export const TYPE_SQL = "(SELECT json_extract(details,'$.type') FROM property_details WHERE property_id=p.id) property_type";
