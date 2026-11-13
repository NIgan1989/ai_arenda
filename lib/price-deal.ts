// «Цена выгодная»: a flat whose price for the guest's dates is clearly below what similar free flats
// in the same city ask for the same dates. Pure, shared by the server (which marks the search results)
// and by the site and the app (which show the badge).
type Row=Record<string,any>;
export const DEAL_PERCENT=20,DEAL_MIN_SIMILAR=3;
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);};
// Similar: the same city and one room more or fewer. The flat itself is never its own comparison.
const cityOf=(p:Row)=>String(p.city||'').trim().toLocaleLowerCase('ru');
export function dealFor(flat:Row,all:Row[]){
 const amount=flat.estimate?.amount;if(!Number.isInteger(amount)||amount<=0)return null;
 const rooms=Number(flat.rooms)||0,city=cityOf(flat);
 const others=all.filter(p=>p.id!==flat.id&&!p.test_preview&&cityOf(p)===city&&Number.isInteger(p.estimate?.amount)&&Math.abs((Number(p.rooms)||0)-rooms)<=1).map(p=>p.estimate.amount);
 if(others.length<DEAL_MIN_SIMILAR)return null;
 const typical=median(others),percent=Math.round((1-amount/typical)*100);
 return percent>=DEAL_PERCENT?{percent,typical,similar:others.length}:null;
}
export function markDeals<T extends Row>(items:T[]):T[]{
 return items.map(p=>{const deal=dealFor(p,items);return deal?{...p,estimate:{...p.estimate,deal}}:p;});
}
// «Цена выгодная · −18%»
export function dealBadge(deal:{percent?:number}|null|undefined){return deal?.percent?'Цена выгодная · −'+deal.percent+'%':'';}
export function dealNote(deal:{typical?:number;similar?:number}|null|undefined,money:(n:number)=>string){
 return deal?.typical?'Похожие свободные объекты на эти даты стоят около '+money(deal.typical):'';
}
