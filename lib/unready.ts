// A request for a home that is not ready and whose arrival is close. The owner sees it in the request itself,
// and the autopilot does not confirm such a request alone: only the owner knows whether the home will be ready in time.
export const SOON=6*3600;
const STATE:Record<string,string>={awaiting_cleaning:'ждёт уборки',cleaning:'на уборке',inspection:'не отмечено готовым'};
const inTime=(seconds:number)=>{const m=Math.max(0,Math.round(seconds/60));return m<1?'уже сейчас':m<60?'через '+m+' мин':m%60===0?'через '+m/60+' ч':'через '+Math.floor(m/60)+' ч '+m%60+' мин';};
export function unreadyNote(readiness:string|null|undefined,start:number,at:number){
 const state=STATE[readiness||''];
 return state&&start<=at+SOON?'Жильё '+state+', а заезд '+inTime(start-at):'';
}
// The same rule inside SQL, for the autopilot's list of requests to confirm (alias b for bookings).
export const UNREADY_SQL=`EXISTS(SELECT 1 FROM property_operations uo WHERE uo.property_id=b.property_id AND uo.readiness IN ('awaiting_cleaning','cleaning','inspection')) AND b.start<=?+${SOON}`;
