// Pure part of the reliability rating: shared by the server, the site and the app.
export type ReliabilityLevel='new'|'excellent'|'good'|'attention';
export type Reliability={score:number|null;level:ReliabilityLevel;label:string;facts:string[]};
export const reliabilityLabels:Record<ReliabilityLevel,string>={new:'Новый участник',excellent:'Надёжность отличная',good:'Надёжность хорошая',attention:'Есть замечания'};
export const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<12||b>14)?few:many);};
// ok: things done as promised; bad: weighted failures. A prior of four good events keeps one
// early slip from sinking a newcomer and one good stay from making anyone perfect.
export function reliabilityScore(ok:number,bad:number,facts:string[]):Reliability{
 if(ok+bad===0)return {score:null,level:'new',label:reliabilityLabels.new,facts};
 const score=Math.round((1+4*(ok+4)/(ok+bad+4.5))*10)/10;
 const level:ReliabilityLevel=score>=4.7?'excellent':score>=4.3?'good':'attention';
 return {score,level,label:reliabilityLabels[level],facts};
}
export const reliabilityShort=(r:Reliability)=>r.score===null?'новый участник':'★ '+r.score.toFixed(1).replace('.',',');
