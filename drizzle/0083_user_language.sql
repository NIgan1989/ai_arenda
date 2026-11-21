-- The language a person chose in the app (lib/user-language.ts): Telegram messages, push and the answers of the AI
-- administrator come in it. One row per person; no row means Russian, as before.
CREATE TABLE user_language (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 lang TEXT NOT NULL CHECK(lang IN ('ru','kk','en')),
 updated_at INTEGER NOT NULL
);
CREATE TRIGGER account_erased_user_language_insert BEFORE INSERT ON user_language WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_user_language_update BEFORE UPDATE ON user_language WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
