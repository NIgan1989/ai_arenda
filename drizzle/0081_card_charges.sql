-- Safe card charges (lib/service-dues.ts). Every attempt to take money from a card is written down BEFORE the bank is
-- asked, under its own operation number; the number goes to the bank, so a repeated request is refused there. The ledger
-- entry is written only after the bank said yes. An attempt whose answer was lost stays «unknown»: it is never repeated
-- automatically, it blocks new charges for that person and waits for the bank's status (or the administrator).
-- «held»: the week's sum is above the confirmation threshold, so it waits for the person to press «Оплатить сейчас».
CREATE TABLE card_charges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 request_key TEXT NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount>0),
 status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','unknown','held')),
 reason TEXT NOT NULL CHECK(reason IN ('week','now')),
 card_mask TEXT NOT NULL DEFAULT '',
 test INTEGER NOT NULL DEFAULT 0 CHECK(test IN (0,1)),
 bank_ref TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT '',
 resolved_by TEXT,
 created_at INTEGER NOT NULL,
 finished_at INTEGER
);
CREATE INDEX card_charges_user ON card_charges(user_id,created_at);
CREATE INDEX card_charges_status ON card_charges(status,created_at);
-- One attempt in flight per person: a second one cannot start while the first has no answer.
CREATE UNIQUE INDEX card_charges_one_open ON card_charges(user_id) WHERE status IN ('started','unknown');
CREATE TRIGGER account_erased_card_charges_insert BEFORE INSERT ON card_charges WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_card_charges_update BEFORE UPDATE ON card_charges WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- The administrator's stop switch for all card charges, and the limits of the automatic Monday round.
ALTER TABLE platform_billing ADD COLUMN charges_stopped_at INTEGER;
ALTER TABLE platform_billing ADD COLUMN charges_stopped_by TEXT;
ALTER TABLE platform_billing ADD COLUMN charge_confirm_above INTEGER NOT NULL DEFAULT 100000 CHECK(charge_confirm_above>0);
ALTER TABLE platform_billing ADD COLUMN charge_daily_limit INTEGER NOT NULL DEFAULT 5000000 CHECK(charge_daily_limit>0);
