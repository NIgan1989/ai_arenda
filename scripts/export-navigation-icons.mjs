// Rasterize the installed Lucide library for React Native, preserving the same icons.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLYPH_RING,GLYPH_BARS} from '../lib/brand.ts';
const output=new URL('../mobile/assets/navigation/',import.meta.url);await mkdir(output,{recursive:true});
const names={overview:'House',catalog:'Search',properties:'Building2',bookings:'CalendarCheck',cleaning:'Brush',jobs:'ClipboardList',assignments:'ClipboardCheck',calendar:'CalendarDays',assistant:'MessagesSquare',settings:'SlidersHorizontal',account:'CircleUserRound',more:'Ellipsis',close:'X'};
for(const [name,icon] of Object.entries(names)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:72,strokeWidth:1.75,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',output)));
}
// The menu rows of the app carry the same icons as the site's menu (components/account-control.tsx, safety-controls.tsx).
const menu=new URL('../mobile/assets/menu/',import.meta.url);await mkdir(menu,{recursive:true});
const rows={face:'ScanFace',fingerprint:'FingerprintPattern',user:'UserRound',star:'Star',sparkles:'Sparkles',briefcase:'BriefcaseBusiness',bell:'Bell',lock:'LockKeyhole',plus:'Plus',sliders:'SlidersHorizontal',messages:'MessagesSquare',shield:'ShieldCheck',logout:'LogOut',users:'Users',camera:'Camera',key:'KeyRound',flag:'Flag',file:'FileText',alert:'ShieldAlert',trash:'Trash2',wallet:'Wallet',bank:'Landmark',eye:'Eye',dot:'CircleDot',read:'CheckCheck',send:'Send',chevron:'ChevronRight',back:'ArrowLeft',languages:'Languages',pin:'MapPin',map:'Map',clock:'Clock',badge:'BadgeCheck',phone:'Phone',check:'CheckCircle2',zap:'Zap',building:'Building2',chart:'ChartColumn',brush:'Brush'};
for(const [name,icon] of Object.entries(rows)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:60,strokeWidth:2,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',menu)));
}
// The AI administrator's mark in the rows of the app: the crown of the sign (lib/brand.ts), drawn at the size and
// stroke of a Lucide icon so it stands in one column with them. It replaces the sparkles every generated app uses.
{const k=10/GLYPH_RING,w=n=>(n/k).toFixed(2);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24"><g transform="translate(12 12) scale(${k.toFixed(4)}) translate(-50 -50)" fill="none" stroke="#000000" stroke-linecap="round"><circle cx="50" cy="50" r="${GLYPH_RING}" stroke-width="${w(2)}"/><path d="${GLYPH_BARS}" stroke-width="${w(1.6)}"/></g></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL('shanyrak.png',menu)));}
// The types of objects and their categories (lib/listings.ts): the guest's category picker and the owner's type picker.
const kinds=new URL('../mobile/assets/kinds/',import.meta.url);await mkdir(kinds,{recursive:true});
const types={any:'LayoutGrid',stay:'House',bath:'Flame',apartment:'Building2',studio:'Sofa',room:'DoorOpen',house:'House',guesthouse:'TreePine',hostel:'BedDouble',hotel:'Hotel',aparthotel:'Building',banya:'FlameKindling',sauna:'Heater',banquet:'Utensils',cafe:'Coffee',cleaning:'Sparkles'};
for(const [name,icon] of Object.entries(types)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:72,strokeWidth:1.75,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',kinds)));
}
// The guest's wishes (mobile/src/ai-request.ts WISHES, BATH_WISHES, BANQUET_WISHES): thin black icons on the chips of the form.
const wishes=new URL('../mobile/assets/wishes/',import.meta.url);await mkdir(wishes,{recursive:true});
const wishIcons={parking:'SquareParking',wifi:'Wifi',kitchen:'CookingPot',workspace:'Laptop',pets:'PawPrint',aircon:'AirVent',washer:'WashingMachine',tv:'Tv',balcony:'Fence',elevator:'ArrowUpDown',crib:'Baby',hairdryer:'Wind',iron:'Shirt',linen:'BedDouble',towels:'Layers',jacuzzi:'Waves',selfcheckin:'KeyRound',nodeposit:'BadgeCheck',smoking:'Cigarette',parties:'Music',steam:'CloudFog',pool:'WavesLadder',plunge:'Droplets',brooms:'Leaf',karaoke:'MicVocal',grill:'Flame',billiards:'Circle',halal:'BadgeCheck',prayer:'Moon',stage:'Presentation',sound:'Speaker',dancefloor:'Disc3',ownfood:'ShoppingBasket',kidsroom:'Blocks'};
for(const [name,icon] of Object.entries(wishIcons)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:54,strokeWidth:1.75,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',wishes)));
}
console.log('Exported '+Object.keys(names).length+' navigation and '+Object.keys(rows).length+' menu icons for the app.');
