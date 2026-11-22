// Server lines without a Kazakh or English translation, among the lines of lib/ changed since a git ref.
// node scripts/i18n-server-missing.mjs [ref=origin/main] [ctx]
// A line is a string a person may read: a literal or a sum of literals («…» + title + «…»), with the parts that change
// as {v}, {v1}… and the place's name in «» as {title}. It counts as translated when the app would show it in English
// (tServer for errors and answers, noticeText for notices: lib/notice-feed.ts drops «ИИ-администратор: »).
// «ctx» keeps only what reaches a person (DomainError, notify/notice/tell, notifications, message/title/note… fields).
// Heuristic: the parts of a sentence built by a function stay as {v}; a hit is a line to look at, not always a bug.
// Translations go to lib/i18n-server-more.ts (or lib/i18n-server.ts, lib/i18n-notices.ts).
import fs from 'node:fs';import {execSync} from 'node:child_process';
import ts from 'typescript';
import {load} from '../tests/helpers/platform.mjs';
const {tServerIn}=await load('i18n');const {noticeIn}=await load('notice-feed');
const known=x=>tServerIn('en',x)!==x||noticeIn('en',x)!==x;
const CYR=/[А-Яа-яЁё]/;
const [base='origin/main',ctx]=process.argv.slice(2);
const skip=/^lib\/(legal-documents|address-text|map-search-request|admin-|platform-admin|company-finance|web-push|admin|i18n|account-deletion|ai-budget|property-import|content-moderation|pilot-governance|platform-billing|domain|listing-draft)/;
const files=execSync(`git diff --name-only ${base} -- lib`).toString().trim().split('\n').filter(f=>/\.ts$/.test(f)&&!skip.test(f)&&fs.existsSync(f));
const keys=new Map();
for(const file of files){
  const diff=execSync(`git diff -U0 ${base} -- '${file}'`).toString();
  const added=new Set();for(const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)){const s=+m[1],n=m[2]===undefined?1:+m[2];for(let i=0;i<n;i++)added.add(s+i);}
  const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true);
  const isPlus=n=>ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken;
  const userFacing=n=>{for(let p=n.parent;p;p=p.parent){
    if(ts.isCallExpression(p)||ts.isNewExpression(p)){const e=p.expression;const name=ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?e.name.text:'';if(/^(DomainError|notify|notice|tell)$/.test(name))return true;if((p.arguments||[]).some(x=>ts.isStringLiteralLike(x)&&/notifications/.test(x.text)))return true;}
    if(ts.isPropertyAssignment(p)&&ts.isIdentifier(p.name)&&/^(message|error|reason|note|text|title|label|detail|advice|body|summary|off|auto|time|to|from|subject)$/.test(p.name.text))return true;
    if(ts.isFunctionLike(p))return false;}return false;};
  const build=(n,slots,extra)=>{
    if(ts.isParenthesizedExpression(n))return build(n.expression,slots,extra);
    if(isPlus(n))return build(n.left,slots,extra)+build(n.right,slots,extra);
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
    if(ts.isTemplateExpression(n)){let s=n.head.text;for(const sp of n.templateSpans){s+=slot(sp.expression,slots,extra,s);s+=sp.literal.text;}return s;}
    return slot(n,slots,extra,null);
  };
  const slot=(n,slots,extra,prev)=>{
    if(ts.isConditionalExpression(n)){for(const b of [n.whenTrue,n.whenFalse])collect(b,extra);}
    const name='{v'+(slots.n++||'')+'}';return name;
  };
  const collect=(n,extra)=>{ // a branch: its own key
    const s={n:0};const sub=[];const text=build(n,s,sub);if(CYR.test(text))extra.push(text);for(const x of sub)extra.push(x);};
  const seen=new Set();
  (function walk(n){
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)){
      let top=n;while(top.parent&&(isPlus(top.parent)||ts.isParenthesizedExpression(top.parent)))top=top.parent;
      if(!seen.has(top)){seen.add(top);
        const line=sf.getLineAndCharacterOfPosition(top.getStart(sf)).line+1;
        const s={n:0},extra=[];const text=build(top,s,extra);
        const inSql=/\b(SELECT|INSERT|UPDATE|WHERE|DELETE)\b/.test(text);
        if(added.has(line)&&!inSql&&(ctx!=='ctx'||userFacing(top)))for(const k of [text,...extra]){
          if(!CYR.test(k))continue;
          // title slots: «{v}» → «{title}»
          let i=0;const key=k.replace(/«\{v\d*\}»/g,()=>'«{title'+(i++||'')+'}»');
          const sample=key.replace(/\{title\d*\}/g,'Дом').replace(/\{v\d*\}/g,'5');
          if(!known(sample)&&!known(key)&&!keys.has(key))keys.set(key,file+':'+line);
        }
      }
    }
    n.forEachChild(walk);
  })(sf);
}
for(const [k,w] of keys)console.log(w+'  '+k);
process.exitCode=keys.size?1:0;
