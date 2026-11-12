import type {RentalService} from './service';
import {mapSearchFilters,mapSearchRequest} from './map-search-request';
import {mapCities} from './map-location';

// A search for a flat is "Найди квартиру…" or a request with no search verb that names when or for whom:
// "квартира в Астане на сутки завтра на троих", "хочу снять квартиру". A question about how things work
// ("Как снять жильё?") is not a search: it is answered, not turned into a list of flats.
const SEARCH_VERB = /(?:най[дт]|подб[ео]р|покаж|ищ[уи]|поиск|свободн|доступн)/iu;
const SEARCH_NEED = /(?:снять|сниму|нужн[ао]|хочу|сегодня|завтра|выходн|посуточ|почасов|на\s+(?:сутки|ночь|неделю|двоих|троих|четверых|\d+\s*(?:сут|час|дн|ноч|гост|чел)))/iu;
const SEARCH_SUBJECT = /(?:квартир|жиль|недвиж|студи|апартамент|(?:^|\s)кв(?:[.\s?!,]|$))/iu;
const NOT_A_SEARCH = /(?:мои|мою|моих|моей|отмен|оплат|продл|забронир|оформи|уборк|заезд|выезд|заселен)/iu;
const HOW_QUESTION = /^\s*(?:как|что|почему|зачем|можно\s+ли|сколько\s+стоит)(?:\s|$)/iu;

export function isPropertySearch(text: string) {
  if (!SEARCH_SUBJECT.test(text) || NOT_A_SEARCH.test(text)) return false;
  return SEARCH_VERB.test(text) || SEARCH_NEED.test(text) && !HOW_QUESTION.test(text);
}
export function isSearchRefinement(text:string){
 return /(?:дешевле|подешевле|дороже|завтра|сегодня|до\s+\d|[1-9]\s*[-–]?\s*комнат|однокомнат|двухкомнат|трехкомнат|для\s+\d|на\s+\d+\s*(?:сут|час|дн))/iu.test(text)&&!/(?:отмен|оплат|продл|заброни|оформи|уборк|чек|проблем|жалоб)/iu.test(text);
}
export async function previousAdministratorSearch(s:RentalService){
 const previous=await s.one("SELECT r.result FROM administrator_search_results r JOIN messages m ON m.id=r.message_id WHERE m.user_id=? AND m.scope='guest' AND m.sender='assistant' ORDER BY m.created_at DESC,m.id DESC LIMIT 1",s.userId);
 if(!previous)return null;
 const value=JSON.parse(previous.result);
 return value.checkedAt>Date.now()/1000-1800?value:null;
}
// Local read operation: no model, GPS lookup or business mutation is required.
export async function administratorSearch(s:RentalService,text:string,current:Record<string,unknown>={},options:{syntheticPreview?:boolean}={}){
 const profile=await s.profile();
 const catalog=await s.publicSearch({limit:'1'},options);
 const parsed=mapSearchRequest(text,mapSearchFilters({...current,city:typeof current.city==='string'?current.city:profile?.city||''}),[...Object.keys(mapCities),...catalog.cities]);
 const filters={...parsed.filters},queryFilters={...filters};
 // datetime-local is explicitly interpreted as Kazakhstan time, on every host.
 for(const key of ['start','end'])if(queryFilters[key]&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(queryFilters[key]))queryFilters[key]+='+05:00';
 const found=await s.publicSearch({...queryFilters,limit:'6'},options);
 const result={filters,checkedAt:Math.floor(Date.now()/1000),total:found.total,availabilityChecked:found.availabilityChecked,properties:found.properties.map(p=>({id:p.id,title:p.title,city:p.city,testPreview:p.test_preview===1,amount:p.estimate?.amount??(filters.mode==='hourly'?p.policy.hourly_price:p.price),unit:found.availabilityChecked?'за выбранный период':filters.mode==='hourly'?'за час':'за сутки',status:p.display_status}))};
 const lines=result.properties.map(p=>`${p.title} · ${p.amount.toLocaleString('ru-RU')} ₸ ${p.unit}${p.status?.label?' · '+p.status.label:''}${p.testPreview?' · учебный просмотр':''}`);
 const scope=filters.city||'все города';
 let answer=found.total?`${found.availabilityChecked?'Проверена занятость на выбранные даты':'Найдены варианты без проверки дат'} · ${scope}. Найдено: ${found.total}.\n${lines.join('\n')}`:`По указанным условиям в опубликованном каталоге вариантов нет · ${scope}. Измените город, даты или бюджет.`;
 const conditions=[filters.rooms&&+filters.rooms>0?(filters.roomsExact==='1'?'ровно ':'от ')+filters.rooms+' комн.':'',filters.guests+' гостей',filters.mode==='hourly'?'на часы':'на сутки',filters.minPrice?'от '+filters.minPrice+' ₸':'',filters.maxPrice?'до '+filters.maxPrice+' ₸'+(found.availabilityChecked?' за весь период':''):'',filters.start&&filters.end?filters.start.replace('T',' ')+' → '+filters.end.replace('T',' '):'',filters.sort==='price-asc'?'сначала дешевле':filters.sort==='price-desc'?'сначала дороже':''].filter(Boolean);
 answer+='\nУсловия: '+conditions.join(' · ')+'.';
 if(!found.availabilityChecked)answer+='\nУкажите заезд и выезд — проверим свободные интервалы и стоимость.';
 else answer+='\nПроверено сейчас. До подтверждения заявки доступность и стоимость могут измениться; форма бронирования проверит их повторно.';
 if(result.properties.some(p=>p.testPreview))answer+='\nУчебный просмотр не подтверждает допуск объекта к бронированию. Реального жилья по синтетическому объявлению нет.';
 if(parsed.nearby)answer+='\nПоиск выполнен по городу. Геопозиция не запрашивалась: для выбора рядом с вами используйте кнопку местоположения на карте.';
 return {text:answer,result};
}
