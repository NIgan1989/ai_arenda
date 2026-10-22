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
console.log('Exported '+Object.keys(names).length+' library icons for native navigation.');
