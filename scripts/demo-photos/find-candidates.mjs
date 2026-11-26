// Picks openly licensed photos (Openverse API: StockSnap and rawpixel, CC0) for the test listings by their kind, and
// prints the pick as photos.json plus one small contact sheet (base64 JPEG) to check it by eye.
// Runs in GitHub Actions: the cloud sandbox cannot reach Openverse.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const KINDS={
 apartment:{q:['apartment interior','bedroom interior','kitchen interior'],want:/living|bedroom|kitchen|bathroom|apartment|interior|sofa|couch|bed/},
 studio:{q:['studio apartment'],want:/studio|loft|apartment|bedroom|interior|bed|kitchen|living/},
 room:{q:['bedroom'],want:/bedroom|room|bed/},
 house:{q:['house exterior','cottage interior'],want:/house|home|cottage|cabin|villa|interior|living|bedroom/},
 guesthouse:{q:['wooden cabin'],want:/guest|house|cabin|cottage|room|bedroom|interior|wood/},
 hostel:{q:['bunk bed'],want:/hostel|bunk|dorm|bed/},
 hotel:{q:['hotel room','hotel lobby'],want:/hotel|lobby|room|bedroom|suite/},
 aparthotel:{q:['modern apartment'],want:/apartment|suite|kitchen|living|interior|room/},
 banya:{q:['sauna'],want:/sauna|bath|steam|banya|wood/},
 sauna:{q:['spa pool'],want:/sauna|spa|pool|swimming|wellness/},
 banquet:{q:['banquet hall','wedding reception'],want:/banquet|wedding|reception|hall|event|table|chandelier/},
 cafe:{q:['restaurant interior'],want:/cafe|café|restaurant|coffee|bar|dining|table|interior/},
};
const AVOID=/person|people|woman|\bman\b|men|girl|boy|child|face|portrait|painting|art\b|drawing|illustration|vintage|antique|engraving|poster|map|dance|band|food|meal|dish|drink|mug|cup|dog|cat|car|christmas|halloween|sign|text|logo|museum|church|castle|palace/;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const out='outputs/demo-candidates';mkdirSync(out,{recursive:true});
const PER=8,result={},rows=[];
for(const [kind,{q,want}] of Object.entries(KINDS)){
 const seen=new Set(),pool=[];
 for(const query of q){
  const u='https://api.openverse.org/v1/images/?page_size=50&source=stocksnap,rawpixel&license=cc0,pdm&category=photograph&size=large&mature=false&q='+encodeURIComponent(query);
  // Openverse lets an anonymous client ask only a little per minute: one search every ~15 s, and a minute's rest on 429.
  let r=null;for(let i=0;i<2;i++){try{r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000)});}catch(e){console.log(kind,query,'search failed',e.message);r=null;}await pause(15000);if(r?.status!==429)break;console.log(kind,query,'429, waiting');await pause(20000);}
  if(!r)continue;
  if(!r.ok){console.log(kind,query,'search',r.status);continue;}
  for(const p of (await r.json()).results||[]){
   if(seen.has(p.id))continue;seen.add(p.id);
   const words=((p.title||'')+' '+(p.tags||[]).map(t=>t.name).join(' ')).toLowerCase();
   if(AVOID.test(words)||!want.test(words))continue;
   if(!p.width||!p.height||p.width/p.height<1.25||p.width/p.height>1.9||p.width<1600)continue;
   pool.push({id:p.id,url:p.url,license:p.license,creator:p.creator||'',source:p.source,page:p.foreign_landing_url,title:p.title||'',query});
  }
 }
 // Too few from Openverse (it limits anonymous use hard): Wikimedia Commons, only free licences, the author kept.
 if(pool.length<PER)for(const query of q){
  const u='https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&gsrsearch='+encodeURIComponent(query+' filetype:bitmap');
  let body=null;try{const r=await fetch(u,{headers:{'user-agent':'ai-arenda-demo-photos/1.0 (https://github.com/NIgan1989/ai_arenda)'},signal:AbortSignal.timeout(30000)});if(r.ok)body=await r.json();else console.log(kind,query,'commons',r.status);}catch(e){console.log(kind,query,'commons failed',e.message);}
  await pause(1500);
  for(const page of Object.values(body?.query?.pages||{})){
   const info=page.imageinfo?.[0],meta=info?.extmetadata||{};if(!info?.thumburl)continue;
   const licence=String(meta.LicenseShortName?.value||''),author=String(meta.Artist?.value||'').replace(/<[^>]+>/g,'').trim();
   if(!/^(CC0|Public domain|CC BY(-SA)? [0-9.]+)/i.test(licence))continue;
   const words=(page.title+' '+String(meta.ImageDescription?.value||'').replace(/<[^>]+>/g,' ')+' '+String(meta.Categories?.value||'')).toLowerCase();
   if(AVOID.test(words)||!want.test(words))continue;
   if(!info.width||!info.height||info.width/info.height<1.25||info.width/info.height>1.9||info.width<1600)continue;
   if(seen.has(page.title))continue;seen.add(page.title);
   pool.push({id:'commons:'+page.pageid,url:info.thumburl,license:licence,creator:author.slice(0,120),source:'wikimedia',page:info.descriptionurl,title:page.title,query});
  }
 }
 // Different queries take turns, so a kind shows several rooms and not eight photos of one.
 const byQuery=q.map(x=>pool.filter(p=>p.query===x)),pick=[];
 for(let i=0;pick.length<PER&&i<30;i++)for(const list of byQuery)if(list[i]&&pick.length<PER)pick.push(list[i]);
 result[kind]=[];
 for(const [i,p] of pick.entries()){
  const f=`${out}/${kind}-${i}.jpg`;
  try{const r=await fetch(p.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)continue;writeFileSync(f+'.src',Buffer.from(await r.arrayBuffer()));
   execFileSync('convert',[f+'.src[0]','-resize','150x100^','-gravity','center','-extent','150x100','-quality','55',f]);
   result[kind].push(p);rows.push(f);}catch{}
 }
 console.log(kind,'pool',pool.length,'picked',result[kind].length);
}
writeFileSync(`${out}/photos.json`,JSON.stringify({kinds:result},null,1));
// One sheet: a row per kind, labelled with the kind and the photo's place in the list.
const lines=[];for(const kind of Object.keys(result)){const files=result[kind].map((_,i)=>`${out}/${kind}-${i}.jpg`);
 if(!files.length)continue;execFileSync('montage',[...files,'-tile',PER+'x1','-geometry','150x100+2+2','-background','white',`${out}/row-${kind}.jpg`]);
 execFileSync('convert',[`${out}/row-${kind}.jpg`,'-gravity','west','-splice','90x0','-pointsize','14','-annotate','+4+0',kind,`${out}/row-${kind}.jpg`]);lines.push(`${out}/row-${kind}.jpg`);}
if(lines.length)execFileSync('convert',[...lines,'-append','-quality','50',`${out}/sheet.jpg`]);
console.log('PHOTOS_JSON '+JSON.stringify({kinds:result}));
if(!lines.length)process.exit(1);
const b64=readFileSync(`${out}/sheet.jpg`).toString('base64');
console.log('SHEET_BEGIN');for(let i=0;i<b64.length;i+=4000)console.log('SHEET '+b64.slice(i,i+4000));console.log('SHEET_END');
