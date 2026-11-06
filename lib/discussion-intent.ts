export function discussionIntent(text:string){
 if(!/(?:открой|открыть|подключ|создай|включ|покажи|нужен|хочу|давай).{0,90}(?:чат|переписк|обсуждени)|(?:написать|связаться|обсудить).{0,65}(?:гост|владельц|исполнител|уборк|брон)|^чат(?:\s|$)/i.test(text))return null;
 return {channel:/исполнител|уборк/i.test(text)?'cleaning':/гост|владельц|прожив/i.test(text)?'stay':undefined};
}
