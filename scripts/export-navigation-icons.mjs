// Rasterize the installed Lucide library for React Native, preserving the same icons.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=new URL('../mobile/assets/navigation/',import.meta.url);await mkdir(output,{recursive:true});
const names={overview:'House',catalog:'Search',properties:'Building2',bookings:'CalendarCheck',cleaning:'Brush',jobs:'ClipboardList',assignments:'ClipboardCheck',calendar:'CalendarDays',assistant:'MessagesSquare',settings:'SlidersHorizontal',account:'CircleUserRound',more:'Ellipsis',close:'X'};
for(const [name,icon] of Object.entries(names)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:72,strokeWidth:1.75,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',output)));
}
// The menu rows of the app carry the same icons as the site's menu (components/account-control.tsx, safety-controls.tsx).
const menu=new URL('../mobile/assets/menu/',import.meta.url);await mkdir(menu,{recursive:true});
const rows={user:'UserRound',star:'Star',sparkles:'Sparkles',briefcase:'BriefcaseBusiness',bell:'Bell',lock:'LockKeyhole',plus:'Plus',sliders:'SlidersHorizontal',messages:'MessagesSquare',shield:'ShieldCheck',logout:'LogOut',users:'Users',camera:'Camera',key:'KeyRound',flag:'Flag',file:'FileText',alert:'ShieldAlert',trash:'Trash2',wallet:'Wallet',bank:'Landmark',eye:'Eye',dot:'CircleDot',read:'CheckCheck',send:'Send',chevron:'ChevronRight',back:'ArrowLeft',languages:'Languages',pin:'MapPin',map:'Map',clock:'Clock',badge:'BadgeCheck',phone:'Phone',check:'CheckCircle2',zap:'Zap',building:'Building2'};
for(const [name,icon] of Object.entries(rows)){
 const svg=renderToStaticMarkup(React.createElement(icons[icon],{size:60,strokeWidth:2,color:'#000000'}));
 await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(new URL(name+'.png',menu)));
}
console.log('Exported '+Object.keys(names).length+' navigation and '+Object.keys(rows).length+' menu icons for the app.');
