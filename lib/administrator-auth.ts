// Compare fixed-size digests; the runner secret is server-only and is never accepted from a cookie.
export async function administratorRunnerAuthorized(request:Request,secret?:string,method:'POST'|'GET'='POST'){
 if(request.method!==method||!secret||secret.length<32)return false;
 const header=request.headers.get('authorization')||'';
 if(!header.startsWith('Bearer ')||header.length>512)return false;
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(secret)),crypto.subtle.digest('SHA-256',encoder.encode(header.slice(7)))]);
 const left=new Uint8Array(a),right=new Uint8Array(b);let difference=0;
 for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
 return difference===0;
}
