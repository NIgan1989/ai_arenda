// Finds openly licensed photos (Openverse API, licences that allow commercial use) for the test listings and
// prints them as lines to choose from. Runs in GitHub Actions (the cloud sandbox cannot reach Openverse).
import {mkdirSync,writeFileSync} from 'node:fs';
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
const out='outputs/demo-candidates';mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const [kind,queries] of Object.entries(QUERIES)){
 const list=[],seen=new Set();
 for(const q of queries){
  const u='https://api.openverse.org/v1/images/?page_size=20&license_type=commercial,modification&category=photograph&aspect_ratio=wide&size=large&mature=false&q='+encodeURIComponent(q);
  let r;try{r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000)});}catch(e){console.log(kind,q,'search failed',e.message);continue;}await pause(1500);
  if(!r.ok){console.log(kind,q,'search',r.status);continue;}
  let n=0;for(const p of (await r.json()).results||[]){
   if(seen.has(p.id)||n>=10)continue;seen.add(p.id);n++;
   list.push({id:p.id,query:q,title:p.title,url:p.url,thumb:p.thumbnail,w:p.width,h:p.height,license:p.license,version:p.license_version,creator:p.creator,source:p.source,page:p.foreign_landing_url,tags:(p.tags||[]).slice(0,6).map(t=>t.name)});
  }
 }
 for(const p of list)console.log('CANDIDATE '+JSON.stringify({kind,...p}));
}
