import fs from 'node:fs';import {groups} from '../design/figma/screens.mjs';
const template=fs.readFileSync('design/preview.template.html','utf8'),render=fs.readFileSync('design/preview-render.js','utf8'),css=fs.readFileSync('design/preview.css','utf8');
const output=template.replace('/*SCREEN_DATA*/','const groups='+JSON.stringify(groups).replaceAll('<','\\u003c')+';').replace('/*RENDER_CODE*/',render).replace('/*DESIGN_CSS*/',css);
fs.writeFileSync('public/design-review.html',output);console.log(JSON.stringify({screens:Object.values(groups).flat().length,viewports:2,output:'public/design-review.html',bytes:Buffer.byteLength(output)}));
