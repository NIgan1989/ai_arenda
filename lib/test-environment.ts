// Live model access on fixtures requires an explicit server switch; other providers stay disabled.
export function isolateTestConfig<T extends {TEST_DATA_ONLY?:string;TEST_AI_ENABLED?:string}>(config:T):T{
 if(config.TEST_DATA_ONLY!=='1')return config;
 return {...config,VAPID_PRIVATE_KEY:undefined,VAPID_PUBLIC_KEY:undefined,VAPID_SUBJECT:undefined,OPENAI_API_KEY:config.TEST_AI_ENABLED==='1'?(config as Record<string,unknown>).OPENAI_API_KEY:undefined,OPENAI_MODEL:config.TEST_AI_ENABLED==='1'?(config as Record<string,unknown>).OPENAI_MODEL:undefined,TELEGRAM_BOT_TOKEN:undefined,TELEGRAM_BOT_USERNAME:undefined,TELEGRAM_WEBHOOK_SECRET:undefined,SMS_GATEWAY_URL:undefined,SMS_GATEWAY_TOKEN:undefined,WHATSAPP_GATEWAY_URL:undefined,WHATSAPP_GATEWAY_TOKEN:undefined,PAYMENT_GATEWAY_URL:undefined,PAYMENT_GATEWAY_TOKEN:undefined,PAYMENT_WEBHOOK_SECRET:undefined,DELIVERY_WEBHOOK_SECRET:undefined,BUCKET:undefined};
}
