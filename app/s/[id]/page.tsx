import {env} from 'cloudflare:workers';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import Link from 'next/link';
import {readShareStay,shareCard,shareDates,sharePriceLine,SHARE_ID,type ShareStay} from '../../../lib/stay-share';

// The page a friend opens from a shared link (lib/stay-share.ts): the photo, the name, the price and one button
// into the app. The address, the owner and the chat stay inside the app, after a booking.
export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>};

async function load(props:Props){
 const {id}=await props.params;if(!SHARE_ID.test(id))return null;
 const query=new URLSearchParams(Object.entries(await props.searchParams).filter((e):e is [string,string]=>typeof e[1]==='string'));
 const card=env.DB?await shareCard(env.DB,id):null;
 return card?{card,stay:readShareStay(query)}:null;
}
const appLink=(id:string,stay:ShareStay|null)=>'aiarenda://stay/'+encodeURIComponent(id)+(stay?'?d='+stay.start+'~'+stay.end+(stay.guests>1?'&g='+stay.guests:''):'');

export async function generateMetadata(props:Props):Promise<Metadata>{
 const found=await load(props);if(!found)return {title:'AiQonaq'};
 const {card,stay}=found,line=[sharePriceLine(card),shareDates(stay)].filter(Boolean).join(' · ');
 // WhatsApp and Telegram need the full address of the photo: the host the link was opened on.
 const h=await headers(),host=h.get('x-forwarded-host')||h.get('host')||'',origin=host?(h.get('x-forwarded-proto')||'https')+'://'+host:'';
 const image=card.photo?[{url:origin+'/api/public/stay/'+encodeURIComponent(card.id)+'/photo'}]:undefined;
 return {title:card.title+' · AiQonaq',description:line,openGraph:{title:card.title,description:line,siteName:'AiQonaq',type:'website',...(image?{images:image}:{})},robots:{index:false}};
}

const css=`.share{min-height:100dvh;background:#fff;color:#0E1116;font-family:Inter,system-ui,-apple-system,sans-serif;display:flex;justify-content:center}
.share main{width:100%;max-width:440px;padding:20px 18px 32px;display:flex;flex-direction:column;gap:12px}
.share .brand{font-size:16px;font-weight:600;letter-spacing:.2px}
.share img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:16px;background:#F1F1EE;display:block}
.share h1{font-size:21px;font-weight:600;line-height:1.25;margin:4px 0 0}
.share .ln{font-size:15px;color:#5B616B;line-height:1.4;margin:0}
.share .price{font-size:22px;font-weight:600;margin:6px 0 0}
.share .price span{font-size:14px;color:#5B616B;font-weight:500}
.share .go{display:flex;align-items:center;justify-content:center;height:52px;border-radius:26px;background:#0E1116;color:#fff;font-size:16px;font-weight:600;text-decoration:none;margin-top:10px}
.share .side{display:flex;align-items:center;justify-content:center;height:48px;border-radius:24px;border:1px solid #D5D6D2;color:#0E1116;font-size:15px;font-weight:600;text-decoration:none}
.share .note{font-size:13px;color:#6B717B;line-height:1.4;margin:6px 0 0}`;

export default async function SharedStay(props:Props){
 const found=await load(props);if(!found)notFound();
 const {card,stay}=found,dates=shareDates(stay),place=[card.city,card.district].filter(Boolean).join(' · ');
 const [amount,...rest]=sharePriceLine({...card,city:''}).split(' за ');
 return <div className="share"><style>{css}</style><main>
  <div className="brand">AiQonaq</div>
  {/* A plain image: the photo is already sized when it is saved, and the preview robots read the same URL. */}
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {card.photo?<img src={'/api/public/stay/'+encodeURIComponent(card.id)+'/photo'} alt={card.title}/>:null}
  <h1>{card.title}</h1>
  <p className="ln">{place}{stay&&stay.guests>1?' · '+stay.guests+' '+(stay.guests%10>=2&&stay.guests%10<=4&&(stay.guests%100<12||stay.guests%100>14)?'гостя':'гостей'):''}</p>
  {card.rating?<p className="ln">★ {String(card.rating.average).replace('.',',')} · {card.rating.count} {card.rating.count%10===1&&card.rating.count%100!==11?'отзыв':card.rating.count%10>=2&&card.rating.count%10<=4&&(card.rating.count%100<12||card.rating.count%100>14)?'отзыва':'отзывов'}</p>:null}
  {card.price>0?<p className="price">{amount} <span>за {rest.join(' за ')}{dates?', '+dates:''}</span></p>:dates?<p className="ln">{dates}</p>:null}
  <a className="go" href={appLink(card.id,stay)}>Открыть в приложении</a>
  <Link className="side" href="/">Открыть сайт AiQonaq</Link>
  <p className="note">Точный адрес и чат с владельцем появятся после брони в приложении.</p>
 </main></div>;
}
