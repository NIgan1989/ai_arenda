import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base=new URL('../',import.meta.url),version=JSON.parse(readFileSync(new URL('node_modules/maplibre-gl/package.json',base),'utf8')).version;
if(version!=='6.16.0')throw Error('Update the pinned map worker URL alongside MapLibre.');
mkdirSync(new URL('public/map-assets/',base),{recursive:true});
// Serve the official standalone worker unchanged: Vite's dev client assumes window and cannot run inside this worker.
copyFileSync(new URL('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',base),new URL('public/map-assets/maplibre-worker-v6.16.0.mjs',base));
copyFileSync(new URL('node_modules/maplibre-gl/LICENSE.txt',base),new URL('public/map-assets/LICENSE.txt',base));
