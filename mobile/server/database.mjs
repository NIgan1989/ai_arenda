import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export class Database {
  constructor(filename) {
    this.transactionDepth=0;
    this.raw=new DatabaseSync(filename);
    this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    if (!this.raw.prepare("SELECT name FROM sqlite_master WHERE name='profiles'").get()) {
      this.raw.exec(readFileSync(new URL('./generated/schema.sql',import.meta.url),'utf8'));
    }
    this.raw.exec('CREATE TABLE IF NOT EXISTS rental_migrations (name TEXT PRIMARY KEY)');
    for(const migration of ['0001_rental_operations','0002_assistant_preferences']){
      if(this.raw.prepare('SELECT name FROM rental_migrations WHERE name=?').get(migration))continue;
      this.raw.exec('BEGIN IMMEDIATE');
      try{this.raw.exec(readFileSync(new URL('./generated/'+migration+'.sql',import.meta.url),'utf8'));this.raw.prepare('INSERT INTO rental_migrations VALUES (?)').run(migration);this.raw.exec('COMMIT');}catch(error){this.raw.exec('ROLLBACK');throw error;}
    }
    this.raw.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations (user_id TEXT PRIMARY KEY REFERENCES accounts(id), body TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_conversations (user_id TEXT NOT NULL REFERENCES accounts(id), role TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,role));
      CREATE TABLE IF NOT EXISTS command_receipts (user_id TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(user_id,key));`);
  }
  prepare(sql) {
    const db=this.raw; let args=[];
    return {
      bind(...values){args=values;return this;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      execute(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
      async run(){return this.execute();}
    };
  }
  async batch(statements) {
    const nested=this.transactionDepth>0;
    this.raw.exec(nested?'SAVEPOINT service_batch':'BEGIN IMMEDIATE');
    try {const results=statements.map(s=>s.execute());this.raw.exec(nested?'RELEASE service_batch':'COMMIT');return results;}
    catch(error){this.raw.exec(nested?'ROLLBACK TO service_batch; RELEASE service_batch':'ROLLBACK');throw error;}
  }
  close(){this.raw.close();}
}
