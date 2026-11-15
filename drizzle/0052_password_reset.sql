-- «Забыли пароль?» without a backup code (lib/native-auth.ts): one six-digit code per account, sent to the person's own
-- Telegram chat with the bot, by SMS when a provider is connected, or to the platform administrator, who calls the number
-- and dictates it. Only a digest is kept; five wrong tries or 30 minutes end the code.
CREATE TABLE auth_reset_codes (
 user_id TEXT PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
