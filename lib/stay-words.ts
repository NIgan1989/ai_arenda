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
};

const HOME: StayWords = {
  arrive: 'Заезд', arriveLow: 'заезд', arriveGen: 'заезда', arriveAcc: 'заселение',
  stay: 'Проживание', leave: 'Выезд', leaveLow: 'выезд', leaveGen: 'выезда', ofLeave: 'о выезде', afterLeave: 'после выезда',
  youIn: 'Вы заселились', youAre: 'Вы заселены', guestIn: 'Гость заселился', aiIn: 'ИИ заселил гостя', youInside: 'Вы в жилье', guestInside: 'Гость в жилье',
  leaveOk: 'Выезд подтверждён', aiOut: 'ИИ подтвердил выезд', guestOut: 'Гость выехал', canIn: 'Можно заселяться',
  iAmIn: 'Я заселился', swipeIn: 'я заселился', swipeOut: 'я выехал', swipeGuestOut: 'гость выехал',
  done: 'Проживание завершено', rate: 'Оцените проживание', rateBtn: 'Оценить проживание', ready: 'Жильё готово', readyLow: 'жильё убрано и готово',
};
const BATH_WORDS: StayWords = {
  arrive: 'Приход', arriveLow: 'приход', arriveGen: 'прихода', arriveAcc: 'приход',
  stay: 'Отдых', leave: 'Уход', leaveLow: 'уход', leaveGen: 'ухода', ofLeave: 'об уходе', afterLeave: 'после ухода',
  youIn: 'Вы на месте', youAre: 'Вы на месте', guestIn: 'Гость на месте', aiIn: 'ИИ отметил приход гостя', youInside: 'Вы отдыхаете', guestInside: 'Гость отдыхает',
  leaveOk: 'Уход подтверждён', aiOut: 'ИИ подтвердил уход', guestOut: 'Гость ушёл', canIn: 'Можно приходить',
  iAmIn: 'Я на месте', swipeIn: 'я на месте', swipeOut: 'мы ушли', swipeGuestOut: 'гость ушёл',
  done: 'Отдых завершён', rate: 'Оцените отдых', rateBtn: 'Оценить отдых', ready: 'Баня готова', readyLow: 'баня убрана и готова',
};
const HALL_WORDS: StayWords = {
  arrive: 'Начало', arriveLow: 'начало', arriveGen: 'начала', arriveAcc: 'начало',
  stay: 'Мероприятие', leave: 'Окончание', leaveLow: 'окончание', leaveGen: 'окончания', ofLeave: 'об окончании', afterLeave: 'после мероприятия',
  youIn: 'Вы на месте', youAre: 'Вы на месте', guestIn: 'Гости на месте', aiIn: 'ИИ отметил начало', youInside: 'Мероприятие идёт', guestInside: 'Мероприятие идёт',
  leaveOk: 'Окончание подтверждено', aiOut: 'ИИ подтвердил окончание', guestOut: 'Гости ушли', canIn: 'Можно приходить',
  iAmIn: 'Мы на месте', swipeIn: 'мы на месте', swipeOut: 'мероприятие закончилось', swipeGuestOut: 'гости ушли',
  done: 'Мероприятие завершено', rate: 'Оцените зал', rateBtn: 'Оценить зал', ready: 'Зал готов', readyLow: 'зал убран и готов',
};

export const stayWords = (type?: string | null): StayWords => HALL.includes(type || '') ? HALL_WORDS : BATH.includes(type || '') ? BATH_WORDS : HOME;
// Бронь в ответе сервера несёт тип объекта в property_type.
export const wordsOf = (b?: { property_type?: string | null } | null): StayWords => stayWords(b?.property_type);
