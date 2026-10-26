'use client';
export function AIConnection({enabled,configured,busy,onChange}:{enabled:boolean;configured:boolean;busy:boolean;onChange:(value:boolean)=>void}){
 if(!configured)return <div className="ai-connection inactive"><span>Сценарный режим · OpenAI не настроен</span></div>;
 return enabled?<div className="ai-connection"><span>OpenAI включён для этого чата</span><button disabled={busy} onClick={()=>onChange(false)}>Выключить</button></div>:<div className="ai-consent"><div><strong>Подключить OpenAI к этому чату?</strong><p>В OpenAI будут передаваться текст сообщения, до 8 предыдущих реплик и краткие сведения о жилье, бронях и заданиях вашей роли. Телефоны и email маскируются. Не отправляйте пароли и другие секреты.</p></div><button className="inline-button" disabled={busy} onClick={()=>onChange(true)}>Включить OpenAI</button></div>;
}
