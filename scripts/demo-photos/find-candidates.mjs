// Finds openly licensed photos (Openverse API, licences that allow commercial use) for the test listings and
// draws numbered contact sheets to choose from. Runs in GitHub Actions: prints the list and keeps the sheets as a run artifact.
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const QUERIES={
 apartment:['apartment living room','bedroom interior','kitchen interior apartment','bathroom interior'],
 studio:['studio apartment','loft interior bed'],
 room:['hotel single room','bedroom bed window'],
 house:['country house','wooden house interior','cottage garden'],
 guesthouse:['guest house','guesthouse room'],
 hostel:['hostel dormitory','bunk beds'],
 hotel:['hotel room','hotel lobby','hotel bathroom'],
 aparthotel:['serviced apartment','apartment kitchen living room'],
 banya:['banya','sauna wooden','bathhouse'],
 sauna:['sauna','spa pool','swimming pool indoor'],
 banquet:['banquet hall','wedding hall','ballroom'],
 cafe:['cafe interior','restaurant interior'],
};
const out='outputs/demo-candidates';mkdirSync(out+'/thumbs',{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const [kind,queries] of Object.entries(QUERIES)){
 const list=[],seen=new Set();
 for(const q of queries){
  const u='https://api.openverse.org/v1/images/?page_size=20&license_type=commercial,modification&category=photograph&aspect_ratio=wide&size=large&mature=false&q='+encodeURIComponent(q);
  const r=await fetch(u,{headers:{accept:'application/json'}});await pause(1500);
  if(!r.ok){console.log(kind,q,'search',r.status);continue;}
  let n=0;for(const p of (await r.json()).results||[]){
   if(seen.has(p.id)||n>=10)continue;seen.add(p.id);n++;
   list.push({id:p.id,query:q,title:p.title,url:p.url,thumb:p.thumbnail,w:p.width,h:p.height,license:p.license,version:p.license_version,creator:p.creator,source:p.source,page:p.foreign_landing_url,tags:(p.tags||[]).slice(0,6).map(t=>t.name)});
  }
 }
 const files=[];
 for(const [i,p] of list.entries()){
  const f=`${out}/thumbs/${kind}-${String(i).padStart(2,'0')}.jpg`;
  try{const r=await fetch(p.thumb);if(!r.ok)continue;writeFileSync(f,Buffer.from(await r.arrayBuffer()));execFileSync('convert',[f+'[0]','-resize','300x200^','-gravity','center','-extent','300x200',f]);files.push(f);p.n=i;}catch{}
 }
 writeFileSync(`${out}/${kind}.json`,JSON.stringify(list,null,1));
 if(files.length)execFileSync('montage',['-label','%t',...files,'-tile','8x','-geometry','300x200+3+3','-pointsize','16',`${out}/${kind}.jpg`]);
 for(const p of list)console.log([kind,p.n??'-',p.id,p.w+'x'+p.h,p.license+p.version,p.source,JSON.stringify(p.title),p.tags.join('|')].join('\t'));
}
