// How the address book reads names: one plain form for «улица Абая», «Абая көшесі», «ул.Абая» and «abaya»,
// so that the owner finds the street however he types it. Used by the server and by the script that builds the book.

const LETTERS:Record<string,string>={'ё':'е','й':'и','ә':'а','ғ':'г','қ':'к','ң':'н','ө':'о','ұ':'у','ү':'у','һ':'х','і':'и','ъ':'','ь':''};
// Latin typed by habit or by the Kazakh Latin alphabet, turned into Cyrillic letters close enough to find the name.
const LATIN:[RegExp,string][]=[[/shch/g,'щ'],[/sh/g,'ш'],[/ch/g,'ч'],[/zh/g,'ж'],[/kh/g,'х'],[/ts/g,'ц'],[/ya/g,'я'],[/yu/g,'ю'],[/yo/g,'е'],[/ye/g,'е'],[/a/g,'а'],[/b/g,'б'],[/c/g,'к'],[/d/g,'д'],[/e/g,'е'],[/f/g,'ф'],[/g/g,'г'],[/h/g,'х'],[/i/g,'и'],[/j/g,'ж'],[/k/g,'к'],[/l/g,'л'],[/m/g,'м'],[/n/g,'н'],[/o/g,'о'],[/p/g,'п'],[/q/g,'к'],[/r/g,'р'],[/s/g,'с'],[/t/g,'т'],[/u/g,'у'],[/v/g,'в'],[/w/g,'у'],[/x/g,'кс'],[/y/g,'ы'],[/z/g,'з']];
// Words that say what kind of street or settlement it is, in Russian and Kazakh, full and short.
const STREET_WORDS=new Set('улица ул улицы проспект пр пр-т просп пркт даңгылы дангылы даңг данг микрорайон мкр мкрн мкр-н м-н шагын шагынаудан ауданы переулок пер тупик туп бульвар б-р бул шоссе тас жолы площадь пл алаңы аланы набережная наб тракт аллея проезд пр-д квартал кв-л тупыгы тупик коше кошеси кош тыюык жилмассив жм дом д уи'.split(' ').map(w=>plain(w)));
const PLACE_WORDS=new Set('город г гор село с поселок пос п пгт аул а станция ст кент каласы кала ауылы ауыл деревня д с/о'.split(' ').map(w=>plain(w)));

function plain(text:string){return text.toLocaleLowerCase('ru').replace(/[ёйәғқңөұүһіъь]/g,c=>LETTERS[c]??c);}
function latin(text:string){if(!/[a-z]/.test(text))return text;let out=text;for(const [from,to] of LATIN)out=out.replace(from,to);return out;}
// The words of a name in the plain form, without the kind of street or settlement.
export function nameTokens(text:unknown,kind:'street'|'place'='street'){
 const words=latin(plain(String(text??''))).replace(/(\d)\s*-\s*(?=[а-я])/g,'$1').split(/[^a-zа-я0-9]+/).filter(Boolean),drop=kind==='street'?STREET_WORDS:PLACE_WORDS;
 const kept=words.filter(w=>!drop.has(w));return kept.length?kept:words.filter(w=>/\d/.test(w));
}
export function plainName(text:unknown,kind:'street'|'place'='street'){return nameTokens(text,kind).join(' ');}
// Which part of the book holds a word: digits by the number itself («5», «12»), letters by the first two.
export function shardKey(token:string){const digits=/^\d+/.exec(token);return digits?digits[0].slice(0,3):token.slice(0,2);}
export function shardFile(key:string){return Array.from(key).map(c=>c.codePointAt(0)!.toString(36)).join('-');}

// «12 а», «12a», «12-А» → «12А»; «12/1» stays.
export function houseNumber(text:unknown){return String(text??'').trim().replace(/\s+/g,'').replace(/[a-z]/gi,c=>({a:'А',b:'Б',v:'В',g:'Г',d:'Д',e:'Е'} as Record<string,string>)[c.toLowerCase()]||c.toUpperCase()).replace(/(\d)-(?=[а-яё]$)/i,'$1').toLocaleUpperCase('ru').slice(0,20);}

const SHORT:[RegExp,string][]=[[/^улица\s+/i,'ул. '],[/^проспект\s+/i,'пр. '],[/^микрорайон\s+/i,'мкр '],[/^переулок\s+/i,'пер. '],[/^бульвар\s+/i,'бул. '],[/^площадь\s+/i,'пл. '],[/^набережная\s+/i,'наб. '],[/^проезд\s+/i,'пр-д '],[/^тупик\s+/i,'туп. '],[/\s+улица$/i,''],[/\s+проспект$/i,'']];
// «улица Абая» → «ул. Абая», the way addresses are written on a door and in an announcement.
export function shortStreet(name:unknown){let out=String(name??'').replace(/\s+/g,' ').trim();for(const [from,to] of SHORT)if(from.test(out)){out=out.replace(from,to);break;}return out;}

export type AddressParts={street:string;house:string;flat:string};
// «Торайгырова 64 кв 12» → street «Торайгырова», house «64», flat «12». A street that is only a number («мкр 5») keeps it.
export function splitAddress(text:unknown):AddressParts{
 let rest=String(text??'').replace(/\s+/g,' ').trim(),flat='',house='';
 const f=/(?:,|\s)\s*(?:кв\.?|квартира|оф\.?|офис|пом\.?|помещение)\s*(\d+[а-яa-z]?)\s*$/i.exec(rest);if(f){flat=f[1];rest=rest.slice(0,f.index).trim();}
 const h=/(?:^|,|\s)\s*(?:д\.?|дом|уй|үй)?\s*(\d+\s*[а-яёa-z]?(?:\s*[/]\s*\d+[а-яёa-z]?)?)\s*,?\s*$/i.exec(rest);
 if(h){const street=rest.slice(0,h.index).replace(/[,\s]+$/,'').trim();if(nameTokens(street).some(w=>!/^\d+$/.test(w))||(street&&/^(?:мкр|микрорайон|квартал)/i.test(street)&&nameTokens(street).length)){house=houseNumber(h[1]);rest=street;}}
 return {street:rest.replace(/[,\s]+$/,''),house,flat};
}
export function joinAddress(street:string,house='',flat=''){return [street,house,flat?'кв. '+flat:''].filter(Boolean).join(', ');}

// How far apart two short words are (letters swapped count as one), to forgive a typo in a city or a street.
export function typoDistance(a:string,b:string,limit=2){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 const d:number[][]=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i?j?0:i:j));
 for(let i=1;i<=a.length;i++){let best=limit+1;for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);best=Math.min(best,d[i][j]);}if(best>limit)return limit+1;}
 return d[a.length][b.length];
}
// How well typed words fit a name: 3 the same name, 2 every word starts a word of the name, 1 with one typo, 0 no.
export function nameFit(query:string[],name:string[]){
 if(!query.length||!name.length)return 0;
 if(query.join(' ')===name.join(' '))return 3;
 const joined=name.join('');
 if(query.every(q=>name.some(w=>w.startsWith(q)))||joined.startsWith(query.join('')))return 2;
 const last=query[query.length-1],head=query.slice(0,-1);
 if(head.every(q=>name.some(w=>w.startsWith(q)))&&last.length>=4&&name.some(w=>typoDistance(last,w.slice(0,Math.max(last.length,Math.min(w.length,last.length+1))),last.length>=8?2:1)<=(last.length>=8?2:1)))return 1;
 return 0;
}
