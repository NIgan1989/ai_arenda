export class StaleSessionError extends Error {
 constructor(){super('Вход изменился. Ответ предыдущего сеанса не используется.');this.name='StaleSessionError';}
}
type Persistence={read:()=>Promise<string|null>;write:(record:string|null)=>Promise<void>};
export type SessionSnapshot={generation:number;token:string|null;transitioning:boolean};
// The current session changes at intent time, before an asynchronous Keychain call.
// Storage operations serialize; superseded queued writes never replace a new login.
export class SessionState {
 private generation=0;
 private token:string|null=null;
 private transitioning=false;
 private queue:Promise<void>=Promise.resolve();
 constructor(private persistence:Persistence){}
 currentGeneration(){return this.generation;}
 snapshot():SessionSnapshot{return {generation:this.generation,token:this.token,transitioning:this.transitioning};}
 assertCurrent(snapshot:Pick<SessionSnapshot,'generation'>){if(snapshot.generation!==this.generation)throw new StaleSessionError();}
 private begin(){this.generation++;this.token=null;this.transitioning=true;return {generation:this.generation};}
 private enqueue<T>(work:()=>Promise<T>){const result=this.queue.then(work);this.queue=result.then(()=>{},()=>{});return result;}
 async restore(origin:string){
  const snapshot=this.begin();
  return this.enqueue(async()=>{
   try{
    this.assertCurrent(snapshot);const raw=await this.persistence.read();this.assertCurrent(snapshot);
    let token:string|null=null;
    try{const saved=JSON.parse(raw||'null');if(saved?.origin===origin&&typeof saved.token==='string'&&/^[a-f0-9]{64}$/.test(saved.token))token=saved.token;}catch{}
    this.token=token;this.transitioning=false;return token;
   }catch(error){this.assertCurrent(snapshot);this.transitioning=false;throw error;}
  });
 }
 async save(value:string|null,origin:string){
  if(value!==null&&(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw Error('Обновите вход в общий аккаунт.');
  const snapshot=this.begin();
  return this.enqueue(async()=>{
   try{
    this.assertCurrent(snapshot);await this.persistence.write(value?JSON.stringify({origin,token:value}):null);this.assertCurrent(snapshot);
    this.token=value;this.transitioning=false;
   }catch(error){this.assertCurrent(snapshot);this.transitioning=false;throw error;}
  });
 }
}
