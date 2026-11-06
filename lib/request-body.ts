import {DomainError} from './domain';
export async function boundedRequestText(request:Request,maxBytes:number){
 if(Number(request.headers.get('content-length')||0)>maxBytes)throw new DomainError('Слишком большой запрос.',413);
 if(!request.body)return '';const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new DomainError('Слишком большой запрос.',413);}text+=decoder.decode(next.value,{stream:true});}return text+decoder.decode();}
 catch(error){if(error instanceof DomainError)throw error;throw new DomainError('Не удалось прочитать тело запроса.');}
}
