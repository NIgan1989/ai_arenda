import {env} from 'cloudflare:workers';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {inviteCard} from '../../../lib/invites';

// The page of an invite link (lib/invites.ts): who invites, the terms in three steps and one button into the app, where
// the code is already filled in on «Пригласить владельца».
export const dynamic='force-dynamic';
type Props={params:Promise<{code:string}>};
const load=async(props:Props)=>{const {code}=await props.params;return env.DB?inviteCard(env.DB,decodeURIComponent(code)):null;};

export async function generateMetadata(props:Props):Promise<Metadata>{
 const card=await load(props);if(!card)return {title:'AiQonaq'};
 const line=`Код ${card.code}: ${card.days} дней без комиссии с первой брони. Для владельцев жилья, бань и залов.`;
 return {title:'Месяц без комиссии · AiQonaq',description:line,openGraph:{title:card.friend&&card.by?`${card.by} приглашает сдавать жильё в AiQonaq`:'Сдавайте жильё в AiQonaq',description:line,siteName:'AiQonaq',type:'website'},robots:{index:false}};
}

const css=`.inv{min-height:100dvh;background:#fff;color:#0E1116;font-family:Inter,system-ui,-apple-system,sans-serif;display:flex;justify-content:center}
.inv main{width:100%;max-width:440px;padding:20px 18px 32px;display:flex;flex-direction:column;gap:12px}
.inv .brand{font-size:16px;font-weight:600;letter-spacing:.2px}
.inv h1{font-size:26px;font-weight:600;line-height:1.2;margin:12px 0 0}
.inv .ln{font-size:15px;color:#5B616B;line-height:1.4;margin:0}
.inv ol{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:12px}
.inv li{display:flex;gap:12px;align-items:flex-start;font-size:15px;line-height:1.4}
.inv li b{flex:none;width:26px;height:26px;border-radius:13px;border:1px solid #D5D6D2;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
.inv .code{margin-top:8px;padding:14px 16px;border-radius:14px;background:#F4F4F1;font-size:22px;font-weight:600;letter-spacing:1px}
.inv .code small{display:block;font-size:12px;color:#6B717B;font-weight:500;letter-spacing:0;margin-bottom:2px}
.inv .go{display:flex;align-items:center;justify-content:center;height:52px;border-radius:26px;background:#0E1116;color:#fff;font-size:16px;font-weight:600;text-decoration:none;margin-top:10px}
.inv .side{display:flex;align-items:center;justify-content:center;height:48px;border-radius:24px;border:1px solid #D5D6D2;color:#0E1116;font-size:15px;font-weight:600;text-decoration:none}
.inv .note{font-size:13px;color:#6B717B;line-height:1.4;margin:6px 0 0}`;

export default async function Invite(props:Props){
 const card=await load(props);if(!card)notFound();
 return <div className="inv"><style>{css}</style><main>
  <div className="brand">AiQonaq</div>
  <h1>{card.days} дней без комиссии</h1>
  <p className="ln">{card.friend&&card.by?`${card.by} приглашает вас сдавать жильё через AiQonaq.`:card.by?`Код «${card.by}» для владельцев жилья.`:'Код для владельцев жилья.'} Для квартир, домов, бань и залов.</p>
  <ol>
   <li><b>1</b><span>Откройте приложение и войдите как владелец.</span></li>
   <li><b>2</b><span>Добавьте жильё. Код уже будет вписан в «Пригласить владельца».</span></li>
   <li><b>3</b><span>С первой брони через приложение {card.days} дней без комиссии{card.friend?' у вас обоих':''}.</span></li>
  </ol>
  <div className="code"><small>Код</small>{card.code}</div>
  <a className="go" href={'aiarenda://invite/'+encodeURIComponent(card.code)}>Открыть в приложении</a>
  <Link className="side" href="/">Открыть сайт AiQonaq</Link>
  <p className="note">Код вводят один раз, до первой брони. Дни не меняются на деньги.</p>
 </main></div>;
}
