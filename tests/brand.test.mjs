import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';

// The brand is drawn once, in lib/brand.ts, and painted with the colours of design/tokens.json. These tests keep
// everything made from the two in step: the generated stylesheet, the splash that paints before the stylesheets,
// the images the app refers to, and the name itself.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const color=JSON.parse(read('design/tokens.json')).color;
const brand=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(read('lib/brand.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));

test('the stylesheet with the small sign and the ornament is the one the brand script makes',()=>{
 assert.equal(read('app/brand-images.css'),brand.brandCss(color.accent),'run: node scripts/build-brand-assets.mjs');
 assert.match(read('app/layout.tsx'),/import "\.\/brand-images\.css";/);
});

test('the splash of the site paints with the colours of the tokens before the stylesheets arrive',()=>{
 const splash=read('components/entry-splash.tsx'),named=Object.fromEntries([...splash.matchAll(/\b([A-Z_]+)='(#[0-9A-Fa-f]{6})'/g)].map(m=>[m[1],m[2]]));
 assert.deepEqual(named,{NIGHT:color.night,GLOW:color.nightGlow,GOLD:color.gold,DOME_FROM:color.domeFrom,DOME_TO:color.domeTo});
});

test('the app starts on the same night plate and every image it names is there',()=>{
 const app=JSON.parse(read('mobile/app.json')).expo,splash=app.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1];
 assert.equal(splash.backgroundColor,color.night);
 assert.equal(app.name,brand.BRAND_NAME);
 for(const file of [app.icon,splash.image,...Object.values(app.android.adaptiveIcon).filter(v=>typeof v==='string'&&v.endsWith('.png'))])assert.ok(existsSync(new URL('../mobile/'+file,import.meta.url)),file);
 // An image the app shows at a fixed size comes in three densities.
 const used=new Set(['mobile/App.tsx',...readdirSync(new URL('../mobile/src',import.meta.url)).filter(f=>f.endsWith('.tsx')).map(f=>'mobile/src/'+f)].flatMap(f=>[...read(f).matchAll(/require\('\.\.?\/assets\/brand\/([\w-]+)\.png'\)/g)].map(m=>m[1])));
 assert.ok(used.has('dome-glyph')&&used.has('ornament')&&used.has('wordmark'));
 for(const name of used){assert.ok(existsSync(new URL(`../mobile/assets/brand/${name}.png`,import.meta.url)),name);if(name!=='glow')for(const k of [2,3])assert.ok(existsSync(new URL(`../mobile/assets/brand/${name}@${k}x.png`,import.meta.url)),name+'@'+k+'x');}
});

test('the site and the app draw the same sign on a pin, the same waiting sign and the same ornament',()=>{
 const pills=read('components/map-pills.tsx'),pins=read('mobile/src/MapPins.tsx'),css=read('components/map-pills.css');
 for(const source of [pills,pins])assert.match(source,/pinBoxWidth\(pin\.label,pin\.order\)/);
 assert.match(pills,/className="map-pill-sign"/);assert.match(css,/\.map-pill-sign\{[^}]*var\(--brand-sign\)/);assert.match(pins,/dome-glyph\.png/);
 // A booking made flashes the gold rays on both.
 assert.match(pills,/celebrate:[^\n]*rays\.current\?\.animate/);assert.match(css,/\.map-pill-rays\{[^}]*var\(--t-gold\)/);assert.match(pins,/m\.rays[^\n]*flash2/);
 assert.match(read('app/loader.css'),/\.thinking-sign::before\{[^}]*var\(--brand-sign\)/);assert.match(read('mobile/src/Thinking.tsx'),/dome-glyph\.png/);
 assert.match(read('components/map-home.css'),/\.map-home-handle::before \{[^}]*var\(--brand-ornament\)/);assert.match(read('mobile/src/SheetParts.tsx'),/ornament\.png/);
 const [width,height]=brand.ORNAMENT_SIZE;assert.match(read('mobile/src/SheetParts.tsx'),new RegExp(`ornament:\\{width:${width},[^}]*height:${height},`));
});

test('the service is called by its new name everywhere a person reads it',()=>{
 const sources=(dir,ext)=>readdirSync(new URL('../'+dir,import.meta.url),{recursive:true}).filter(f=>ext.some(e=>String(f).endsWith(e))&&!String(f).includes('node_modules')).map(f=>dir+'/'+f);
 const files=[...sources('app',['.ts','.tsx','.css']),...sources('components',['.ts','.tsx']),...sources('lib',['.ts']),...sources('mobile/src',['.ts','.tsx']),'mobile/App.tsx','mobile/app.json','public/manifest.webmanifest','public/sw.js'];
 for(const file of files)assert.equal(/AI\s?Аренда/iu.test(read(file)),false,file);
 assert.equal(JSON.parse(read('public/manifest.webmanifest')).name.startsWith(brand.BRAND_NAME),true);
 assert.match(read('app/layout.tsx'),/BRAND_NAME|AiQonaq/);
});
