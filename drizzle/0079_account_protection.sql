-- Protection of the money and of the administration (lib/payout.ts, lib/admin-factor.ts).
-- A change of payout details waits 24 hours: until then the payer still sees the old details, and the person
-- gets a notice with a way to cancel. `changed_at` lets the payer see that the details changed recently.
ALTER TABLE payout_details ADD COLUMN pending_phone TEXT;
ALTER TABLE payout_details ADD COLUMN pending_recipient TEXT;
ALTER TABLE payout_details ADD COLUMN pending_link TEXT;
ALTER TABLE payout_details ADD COLUMN pending_role TEXT;
ALTER TABLE payout_details ADD COLUMN pending_until INTEGER;
ALTER TABLE payout_details ADD COLUMN changed_at INTEGER;
CREATE INDEX payout_details_pending ON payout_details(pending_until) WHERE pending_until IS NOT NULL;
-- The platform administrator's second factor: one row per sign-in session (the session's hash), with the code sent
-- to the administrator's Telegram and, once it is typed, how long the session may manage the service.
CREATE TABLE admin_factor (
 session_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 code_hash TEXT,
 code_sent_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 verified_at INTEGER,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX admin_factor_user ON admin_factor(user_id);
CREATE INDEX admin_factor_expiry ON admin_factor(expires_at);
CREATE TRIGGER account_erased_admin_factor_insert BEFORE INSERT ON admin_factor WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_admin_factor_update BEFORE UPDATE ON admin_factor WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
