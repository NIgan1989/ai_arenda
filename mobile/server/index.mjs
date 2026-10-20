import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
mkdirSync(new URL('../data/',import.meta.url),{recursive:true});
const app=createApp({filename:process.env.DATABASE_PATH||fileURLToPath(new URL('../data/rental.sqlite',import.meta.url)),origins:(process.env.ALLOWED_ORIGINS||'http://localhost:8081,http://127.0.0.1:8081').split(',')});
const port=Number(process.env.PORT||8788), host=process.env.HOST||'127.0.0.1';
app.server.listen(port,host,()=>console.log(`AI Аренда pilot API: http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
