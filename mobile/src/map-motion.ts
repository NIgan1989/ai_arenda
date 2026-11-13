// What the map does when something happens on it. Pure functions, covered by mobile/tests/map-motion.test.mjs.
// The map never explains an event in words: the sheet does. The motion only says where it happened and of what kind,
// the way a taxi app shows a car that has been found. With "reduce motion" on, none of it plays (see TileMap).

export type PinTone='home'|'pending'|'offer'|'job'|'booking'|'booked'|'active';
export type PinState={tone:PinTone;label:string};
// appear: a new pin drops onto the map; ask: a flat is asked (or an owner gets a request); answer: an owner or a job said yes;
// celebrate: a booking is made; start: work has begun; settle: a request ended without a yes; update: the same thing, a new label.
export type PinEvent='appear'|'ask'|'answer'|'celebrate'|'start'|'settle'|'update'|'none';

export function pinEvent(before:PinState|undefined,after:PinState):PinEvent{
 if(!before)return 'appear';
 if(before.tone===after.tone)return before.label===after.label?'none':'update';
 if(after.tone==='booked')return 'celebrate';
 if(after.tone==='pending')return 'ask';
 if(after.tone==='offer')return 'answer';
 if(after.tone==='active')return 'start';
 if(before.tone==='pending'||before.tone==='offer')return 'settle';
 return 'update';
}

// Pins of one new set appear from the middle of the visible map outwards, like a wave, within 360ms.
export function appearDelay(x:number,y:number,originX:number,originY:number){
 return Math.round(Math.min(360,Math.hypot(x-originX,y-originY)*.8));
}

// A change of view flies instead of jumping: the new view is drawn at once and starts from where the old one was.
// k: how much bigger the new picture is drawn at the start (zooming in starts small); d: the shift of the old centre, in new pixels.
// arc: how far the camera backs off half-way, so a longer trip reads as a flight over the city and not as a slide (0: none).
// ms: how long the flight lasts, longer for a longer trip. One step of zoom at most is shown, so a jump over several levels
// never leaves the edges of the screen empty.
export type Flight={k:number;dx:number;dy:number;arc:number;ms:number};
export const FLIGHT_MIN_MS=320,FLIGHT_MAX_MS=900;
// maxShift: the new picture is drawn this far beyond the screen at most, so a longer trip (another city, «show all» far away)
// starts only that far out, in the right direction, instead of starting from an empty screen. tile: the size that counts as «far».
export function flight(from:{x:number;y:number;zoom:number},to:{x:number;y:number;zoom:number},maxShift=Infinity,tile=256):Flight|null{
 const k=Math.max(.5,Math.min(2,2**(from.zoom-to.zoom))),scale=2**(to.zoom-from.zoom);
 // The old centre, projected at the new zoom.
 let dx=to.x-from.x*scale,dy=to.y-from.y*scale;
 const far=Math.hypot(dx,dy);if(far>maxShift){dx*=maxShift/far;dy*=maxShift/far;}
 if(k===1&&Math.abs(dx)<1&&Math.abs(dy)<1)return null;
 // A trip shorter than a quarter of a tile only slides; from there the arc grows up to a fifth of the picture.
 const reach=Math.min(1,far/(2*tile)),arc=far<tile/4?0:Math.round(Math.min(.2,far/(5*tile))*1000)/1000;
 return {k,dx,dy,arc,ms:Math.round(FLIGHT_MIN_MS+(FLIGHT_MAX_MS-FLIGHT_MIN_MS)*reach)};
}
// The layer transform at progress u (1: the old view, 0: the new one), as a scale around the view's centre (cx,cy)
// followed by a shift. The point (ox,oy) is the centre of the visible part of the map, where both views are anchored.
export function flightFrame(f:Flight,u:number,cx:number,cy:number,ox:number,oy:number){
 const s=(1+(f.k-1)*u)*(1-(f.arc||0)*Math.sin(Math.PI*u));
 return {scale:s,x:(1-s)*(ox-cx)+s*f.dx*u,y:(1-s)*(oy-cy)+s*f.dy*u};
}
// Animated.interpolate draws straight lines between points; this many points make the curve above smooth enough.
export function flightSteps(f:Flight,cx:number,cy:number,ox:number,oy:number,count=f.arc?16:8){
 const input:number[]=[],scale:number[]=[],x:number[]=[],y:number[]=[];
 for(let i=0;i<=count;i++){const u=i/count,frame=flightFrame(f,u,cx,cy,ox,oy);input.push(u);scale.push(frame.scale);x.push(frame.x);y.push(frame.y);}
 return {input,scale,x,y};
}

// An owner has this long to answer a quick request (lib/smart-matching.ts); the ring of a waiting pin runs down over it.
export const ANSWER_WINDOW=120;
// The share of the answer time still left, from 1 (just asked) to 0 (time is up), for the ring around a waiting pin.
export function answerLeft(until:number,now:number,window=ANSWER_WINDOW){
 if(!Number.isFinite(until)||!Number.isFinite(now)||window<=0)return 0;
 return Math.max(0,Math.min(1,(until-now)/window));
}

// ---------- Stage 2: the guest's live map ----------
// A beam is a line from the guest's search point to a flat whose owner is asked (ask, dashed) or has said yes (answer, solid).
// A route line (stage 4) joins the cleaner's stops of the day in order: one calm solid line, without a search point.
// A nav line (navigation on our map) is the road route from the person's place to the destination: path holds its points.
export type BeamTone='ask'|'answer'|'route'|'nav';
export type MapLine={key:string;from:[number,number];to:[number,number];tone:BeamTone;path?:[number,number][]};
const okPoint=(p:unknown):p is [number,number]=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export function beams(origin:unknown,pins:{key:string;point:unknown;tone?:PinTone}[]):MapLine[]{
 if(!okPoint(origin))return [];
 return pins.flatMap(p=>{const tone:BeamTone|null=p.tone==='pending'?'ask':p.tone==='offer'?'answer':null;return tone&&okPoint(p.point)?[{key:'beam:'+p.key,from:origin,to:p.point,tone}]:[];});
}
// Where the round search-point mark stands: the start of the beams; a route has none.
export function lineOrigin(lines:MapLine[]):[number,number]|null{const beam=lines.find(l=>l.tone==='ask'||l.tone==='answer');return beam&&okPoint(beam.from)?beam.from:null;}
// The card of the carousel that a swipe stopped on: the nearest one, never outside the list.
export function carouselIndex(offset:number,step:number,count:number){
 if(!(count>0)||!(step>0)||!Number.isFinite(offset))return 0;
 return Math.max(0,Math.min(count-1,Math.round(offset/step)));
}
// A beam drawn as one straight line on the screen: from the middle of the line, its length and its angle in degrees.
export function beamBox(a:{x:number;y:number},b:{x:number;y:number}){
 const dx=b.x-a.x,dy=b.y-a.y;
 return {cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,length:Math.hypot(dx,dy),angle:Math.atan2(dy,dx)*180/Math.PI};
}

// Every event the map shows, by role, for the documentation and the preview.
export const MAP_EVENTS:{role:'guest'|'owner'|'cleaner'|'all';event:string;motion:string}[]=[
 {role:'all',event:'Новый набор меток (город, результаты, задания)',motion:'Метки падают на карту волной от центра'},
 {role:'all',event:'Смена вида (найдено, группа меток, «показать всё», +/−)',motion:'Карта перелетает по дуге: дальше цель, дольше полёт и выше подъём'},
 {role:'all',event:'Метка выбрана',motion:'Метка приподнимается и становится тёмной'},
 {role:'all',event:'Метка больше не нужна',motion:'Метка тает и опускается'},
 {role:'all',event:'Ждём ответа владельца',motion:'Под меткой убывает полоска времени на ответ'},
 {role:'guest',event:'Идёт поиск жилья',motion:'Волны радара из центра карты'},
 {role:'guest',event:'Выбор точки «рядом»',motion:'Метка-булавка поднимается, пока карту двигают, и ставится с кругом'},
 {role:'guest',event:'Найдены варианты',motion:'Лучший выбор ИИ отмечен на карте значком ✦ и цветным кольцом'},
 {role:'guest',event:'Листание карусели вариантов',motion:'Карта перелетает к метке этого варианта, метка приподнимается'},
 {role:'guest',event:'Запрос ушёл владельцам',motion:'От точки поиска к вариантам тянутся пунктирные лучи; варианты вздрагивают и пульсируют, остальные уходят'},
 {role:'guest',event:'Владелец подтвердил',motion:'Метка становится синей с подскоком и вспышкой, луч к ней сплошной'},
 {role:'guest',event:'Владелец отказал или не успел',motion:'Метка тает'},
 {role:'guest',event:'Бронь создана',motion:'Зелёная метка «Бронь» с подскоком и двойной вспышкой, лучи гаснут'},
 {role:'guest',event:'Подбор пуст, истёк или отменён',motion:'Метки тают, радар гаснет'},
 {role:'owner',event:'Состояние объекта',motion:'Метка объекта говорит главное: «Гость до 12:00», «Уборка идёт», «Заезд 21:00», «Уборка на приёмке», «Выезд не подтверждён» или цену'},
 {role:'owner',event:'Совет ИИ по цене',motion:'На метке «11 → 13 тыс.» в цветном кольце ИИ'},
 {role:'owner',event:'Спрос в городе',motion:'Теплокарта: ярче там, где гости чаще спрашивают и бронируют; искры, пока гости ищут жильё или ждут ответа владельцев'},
 {role:'owner',event:'Исполнитель или гость в пути',motion:'Синяя дышащая метка «Исполнитель в пути» или «Гость в пути»'},
 {role:'owner',event:'Пришёл быстрый запрос гостя',motion:'Объект вздрагивает, метка «Запрос» пульсирует'},
 {role:'owner',event:'Владелец ответил «Готов»',motion:'Метка «Ответ отправлен» со вспышкой'},
 {role:'owner',event:'Отказ или время ответа вышло',motion:'Метка спокойно возвращается к цене'},
 {role:'cleaner',event:'Новое задание рядом',motion:'Метка «Уборка» падает на карту'},
 {role:'cleaner',event:'Отклик отправлен',motion:'Метка «Отклик ✓» коротко подпрыгивает'},
 {role:'cleaner',event:'Задание назначено',motion:'Метка со временем уборки и номером в маршруте, со вспышкой'},
 {role:'cleaner',event:'Маршрут дня',motion:'Уборки дня пронумерованы по порядку и соединены линией; в шторке число уборок, километры и сумма'},
 {role:'cleaner',event:'Гость выехал',motion:'Метка следующей уборки меняется на «Начинайте» с подскоком'},
 {role:'cleaner',event:'Поехали',motion:'На нашей карте: маршрут по дорогам до следующей уборки, точка «Вы», в шторке ближайший поворот, остаток пути и времени'},
 {role:'cleaner',event:'Уборка началась',motion:'Метка «Уборка до 14:00» мягко дышит, полоска на ней заполняется к сроку'},
 {role:'cleaner',event:'Отчёт на приёмке',motion:'Метка «На приёмке» без движения'}
];
