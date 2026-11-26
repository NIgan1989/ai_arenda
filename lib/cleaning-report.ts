import {homeChecklist,homeOrderOf} from './home-cleaning';
// What the performer confirms in the report. Shared by the app (the list it shows) and the server (the list it accepts),
// so the two never drift apart: until 2026-11-26 the room list lived only in the app and the server refused it with
// «Чек-лист изменился», and a report after guests could not be sent at all.
// A bath, a sauna or a hall keeps the usual four points; the app sends them as plain ticks, without their names.
export const REPORT_ITEMS:string[]=/* i18n */['Постельное бельё заменено','Санузел и кухня убраны','Мусор вынесен','Жильё проверено перед заездом'];
// A home after guests is cleaned room by room (concept of 2026-11-25, «Уборка по списку»): the points stand under the room
// they belong to. The server keeps the ticks of 4 to 12 points, so the longer list goes as it is.
export const REPORT_ROOMS:[string,string[]][]=/* i18n */[['Спальня',['Сменить бельё','Пыль и пол']],['Кухня',['Посуда и плита','Мусор вынести']],['Санузел',['Сантехника','Полотенца']],['Перед заездом',['Жильё проверено перед заездом']]];
export const ROOM_ITEMS:string[]=REPORT_ROOMS.flatMap(([,list])=>list);
/** The named lists a report of this job may come with: a home order has its own by its kind, any other job the room list. */
export function reportLists(description:unknown):string[][]{
 const order=homeOrderOf(description);
 return order?[homeChecklist(order)]:[ROOM_ITEMS];
}
/** Whether the names the app sent are exactly one of the lists this job may show. */
export function reportNamesFit(description:unknown,named:string[]):boolean{
 return reportLists(description).some(list=>list.length===named.length&&list.join('|')===named.join('|'));
}
