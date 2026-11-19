-- Paying the service for its own work (booking commission, cleaning match fee, «Автопилот»): no virtual balance and
-- no top-ups. A participant links a card once; the service takes what was accrued once a week. Without a paid
-- week the participant gets seven days, then new bookings and «Автопилот» pause until the debt is paid.
-- The card itself lives at the bank: only its mask and the bank's token are kept here.
CREATE TABLE service_billing (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 card_mask TEXT NOT NULL DEFAULT '', card_token TEXT NOT NULL DEFAULT '', card_test INTEGER NOT NULL DEFAULT 0 CHECK(card_test IN (0,1)), card_at INTEGER,
 last_charge_at INTEGER, failed_at INTEGER, paused_at INTEGER,
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TRIGGER account_erased_service_billing_insert BEFORE INSERT ON service_billing WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_service_billing_update BEFORE UPDATE ON service_billing WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
