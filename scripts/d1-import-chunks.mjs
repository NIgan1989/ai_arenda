// D1 exports can contain a single image INSERT larger than D1's SQL limit.
// Split only long INSERT rows using values from a locally parsed trusted export.
const ident=s=>'"'+s.replace(/"/g,'""')+'"';
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):typeof value==='string'?"'"+value.replace(/'/g,"''")+"'":value instanceof Uint8Array?"X'"+Buffer.from(value).toString('hex')+"'":(()=>{throw Error('Unsupported SQL value');})();
export function chunkD1Import(sql,db){
 const positions=new Map(),cache=new Map();let splitRows=0;
 const result=sql.split('\n').map(line=>{
  const match=line.match(/^INSERT INTO "([\w]+)"\s*(?:\([^)]*\)\s*)?VALUES/i);if(!match)return line;
  const table=match[1],index=positions.get(table)||0;positions.set(table,index+1);
  if(Buffer.byteLength(line)<64000)return line;
  if(!cache.has(table))cache.set(table,db.prepare('SELECT * FROM '+ident(table)).all());
  const row=cache.get(table)[index],info=db.prepare('PRAGMA table_info('+ident(table)+')').all(),pk=info.filter(c=>c.pk),columns=Object.keys(row||{});
  if(!row||pk.length!==1)throw Error('Large export rows require a single primary key.');
  const large=columns.filter(c=>typeof row[c]==='string'&&Buffer.byteLength(row[c])>8000);
  if(!large.length)throw Error('Large non-text export row needs a dedicated importer.');
  const statements=['INSERT INTO '+ident(table)+'('+columns.map(ident).join(',')+') VALUES ('+columns.map(c=>literal(large.includes(c)?'':row[c])).join(',')+');'];
  for(const column of large){const chars=Array.from(row[column]);for(let i=0;i<chars.length;i+=8000)statements.push('UPDATE '+ident(table)+' SET '+ident(column)+'='+ident(column)+'||'+literal(chars.slice(i,i+8000).join(''))+' WHERE '+ident(pk[0].name)+'='+literal(row[pk[0].name])+';');}
  if(statements.some(s=>Buffer.byteLength(s)>=64000))throw Error('Chunked statement exceeds safe size.');splitRows++;return statements.join('\n');
 }).join('\n');return {sql:result,splitRows};
}
