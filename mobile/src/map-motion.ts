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
// One step of zoom at most is shown, so a jump over several levels never leaves the edges of the screen empty.
export type Flight={k:number;dx:number;dy:number};
export function flight(from:{x:number;y:number;zoom:number},to:{x:number;y:number;zoom:number}):Flight|null{
 const k=Math.max(.5,Math.min(2,2**(from.zoom-to.zoom))),scale=2**(to.zoom-from.zoom);
 // The old centre, projected at the new zoom.
 const dx=to.x-from.x*scale,dy=to.y-from.y*scale;
 if(k===1&&Math.abs(dx)<1&&Math.abs(dy)<1)return null;
 return {k,dx,dy};
}
// The layer transform at progress u (1: the old view, 0: the new one), as a scale around the view's centre (cx,cy)
// followed by a shift. The point (ox,oy) is the centre of the visible part of the map, where both views are anchored.
export function flightFrame(f:Flight,u:number,cx:number,cy:number,ox:number,oy:number){
 const s=1+(f.k-1)*u;
 return {scale:s,x:(1-s)*(ox-cx)+s*f.dx*u,y:(1-s)*(oy-cy)+s*f.dy*u};
}
// Animated.interpolate draws straight lines between points; this many points make the curve above smooth enough.
export function flightSteps(f:Flight,cx:number,cy:number,ox:number,oy:number,count=8){
 const input:number[]=[],scale:number[]=[],x:number[]=[],y:number[]=[];
 for(let i=0;i<=count;i++){const u=i/count,frame=flightFrame(f,u,cx,cy,ox,oy);input.push(u);scale.push(frame.scale);x.push(frame.x);y.push(frame.y);}
 return {input,scale,x,y};
}

// Every event the map shows, by role, for the documentation and the preview.
export const MAP_EVENTS:{role:'guest'|'owner'|'cleaner'|'all';event:string;motion:string}[]=[
 {role:'all',event:'Новый набор меток (город, результаты, задания)',motion:'Метки падают на карту волной от центра'},
 {role:'all',event:'Смена вида (найдено, группа меток, «показать всё», +/−)',motion:'Карта плавно перелетает, а не прыгает'},
 {role:'all',event:'Метка выбрана',motion:'Метка приподнимается и становится тёмной'},
 {role:'all',event:'Метка больше не нужна',motion:'Метка тает и опускается'},
 {role:'guest',event:'Идёт поиск квартир',motion:'Волны радара из центра карты'},
 {role:'guest',event:'Выбор точки «рядом»',motion:'Метка-булавка поднимается, пока карту двигают, и ставится с кругом'},
 {role:'guest',event:'Запрос ушёл владельцам',motion:'Квартиры, которых спросили, вздрагивают и пульсируют, остальные уходят'},
 {role:'guest',event:'Владелец подтвердил',motion:'Метка становится синей с подскоком и вспышкой'},
 {role:'guest',event:'Владелец отказал или не успел',motion:'Метка тает'},
 {role:'guest',event:'Бронь создана',motion:'Зелёная метка «Бронь» с подскоком и вспышкой'},
 {role:'guest',event:'Подбор пуст, истёк или отменён',motion:'Метки тают, радар гаснет'},
 {role:'owner',event:'Пришёл быстрый запрос гостя',motion:'Квартира вздрагивает, метка «Запрос» пульсирует'},
 {role:'owner',event:'Владелец ответил «Готов»',motion:'Метка «Ответ отправлен» со вспышкой'},
 {role:'owner',event:'Отказ или время ответа вышло',motion:'Метка спокойно возвращается к цене'},
 {role:'cleaner',event:'Новое задание рядом',motion:'Метка «Уборка» падает на карту'},
 {role:'cleaner',event:'Отклик отправлен',motion:'Метка «Отклик ✓» коротко подпрыгивает'},
 {role:'cleaner',event:'Задание назначено',motion:'Метка «Моё задание» со вспышкой'},
 {role:'cleaner',event:'Уборка началась',motion:'Метка «Уборка идёт» мягко дышит'},
 {role:'cleaner',event:'Отчёт на приёмке',motion:'Метка «На приёмке» без движения'}
];
