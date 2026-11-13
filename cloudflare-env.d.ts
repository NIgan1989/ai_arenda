declare namespace Cloudflare {
  interface Env {
    TEST_DATA_ONLY?: string;
    TEST_AI_ENABLED?: string;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    AI_PRICE_MODEL?: string;
    AI_INPUT_USD_PER_MILLION?: string;
    AI_OUTPUT_USD_PER_MILLION?: string;
    AI_GLOBAL_DAILY_REQUEST_LIMIT?: string;
    AI_GLOBAL_DAILY_TOKEN_LIMIT?: string;
    AI_GLOBAL_DAILY_USD_CAP?: string;
    ADMINISTRATOR_RUNNER_SECRET?: string;
    SITE_PUBLIC_URL?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    TELEGRAM_BOT_TOKEN?: string;
    STADIA_API_KEY?: string;
    TELEGRAM_BOT_USERNAME?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    SMS_GATEWAY_URL?: string;
    SMS_GATEWAY_TOKEN?: string;
    WHATSAPP_GATEWAY_URL?: string;
    WHATSAPP_GATEWAY_TOKEN?: string;
    DELIVERY_WEBHOOK_SECRET?: string;
    PAYMENT_GATEWAY_URL?: string;
    PAYMENT_GATEWAY_TOKEN?: string;
    PAYMENT_WEBHOOK_SECRET?: string;
    ACCESS_ENCRYPTION_KEY?: string;
    CALENDAR_ALLOWED_HOSTS?: string;
    PLATFORM_ADMIN_IDS?: string;
    ADMIN_LOGIN_EMAIL?: string;
    ADMIN_LOGIN_PHONE?: string;
  }
}
