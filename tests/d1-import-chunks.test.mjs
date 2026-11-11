import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {chunkD1Import} from '../scripts/d1-import-chunks.mjs';
test('large D1 image exports restore in bounded statements, preserving quoted unicode and all rows',()=>{
 const source=new DatabaseSync(':memory:'),copy=new DatabaseSync(':memory:');try{
  const large="🤝'".repeat(50000),escaped=large.replace(/'/g,"''"),sql='CREATE TABLE media(id TEXT PRIMARY KEY,data TEXT,width INTEGER);\nINSERT INTO "media" VALUES(\'small\',\'first\',1);\nINSERT INTO "media" ("id","data","width") VALUES(\'big\',\''+escaped+'\',640);\n';
  source.exec(sql);const transformed=chunkD1Import(sql,source);assert.equal(transformed.splitRows,1);assert.ok(transformed.sql.split('\n').every(l=>Buffer.byteLength(l)<64000));copy.exec(transformed.sql);assert.deepEqual(copy.prepare('SELECT * FROM media ORDER BY id').all(),source.prepare('SELECT * FROM media ORDER BY id').all());
 }finally{source.close();copy.close();}
});
