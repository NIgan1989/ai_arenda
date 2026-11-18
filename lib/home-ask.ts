// «Новый объект» у владельца: человек может написать не про сдачу, а про уборку своего жилья
// («нужна уборка в моей двушке на Торайгырова 64»). Тогда это заказ уборки (lib/home-order.ts), а не объявление:
// из текста берём адрес, комнаты, вид уборки и окна (текст целиком в пожелания не кладём: там мог быть адрес, а пожелания исполнители видят до назначения), остальное человек поправит в форме заказа.
import {readListingText,emptyDraft} from './listing-draft';
import {HOME_MAX_ROOMS,HOME_MAX_WINDOWS,type HomeKind} from './home-cleaning';

export type HomeAsk={address:string;rooms?:number;kind:HomeKind;windows:number};

const CLEAN=/(?:^|[^а-яё])(?:уборк|убрать|убраться|убир[аи]|клининг|уборщ|помыть|вымыть|генералк)/i;
// Слова сдачи: цена за сутки или час, гости, «сдаю». С ними это объявление, даже если уборка упомянута.
const RENT=/сда[юёв]|сдат|посуточ|почасов|в\s+сутки|за\s+сутки|\/\s*сут|за\s+ночь|в\s+час(?![а-яё])|за\s+час(?![а-яё])|\/\s*ч(?![а-яё])|гост[ея]|бронир|жильц|арендатор/i;

export function homeAskFromText(text:string):HomeAsk|null{
 const t=String(text||'').trim();
 if(!t||!CLEAN.test(t)||RENT.test(t))return null;
 const {draft,found}=readListingText(t,emptyDraft(''));
 const lower=t.toLowerCase();
 const kind:HomeKind=/ремонт|стройк/.test(lower)?'renovation':/генеральн|генералк/.test(lower)?'general':'regular';
 const w=/(\d{1,2})\s*(?:окн|окон)/.exec(lower)||/окн\S*\s*(\d{1,2})/.exec(lower);
 const windows=w?Math.min(HOME_MAX_WINDOWS,Number(w[1])):/окн|окон/.test(lower)?1:0;
 const rooms=found.includes('rooms')?Math.min(HOME_MAX_ROOMS,Math.max(1,draft.rooms)):undefined;
 return {address:found.includes('address')?draft.address.slice(0,300):'',rooms,kind,windows};
}
