-- Direct settlements: the guest pays the owner, the owner pays the performer, outside the service.
-- The service only shows where to pay and keeps the marks of both sides; its own money is the balance.
-- Where a participant receives transfers: a Kaspi phone, the name the sender sees and an optional pay link.
CREATE TABLE payout_details (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 phone TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TRIGGER account_erased_payout_details_insert BEFORE INSERT ON payout_details WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_payout_details_update BEFORE UPDATE ON payout_details WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- «Я оплатил»: the guest says the transfer is sent; the owner checks the bank and confirms.
ALTER TABLE booking_terms ADD COLUMN payment_reported_at INTEGER;
ALTER TABLE booking_terms ADD COLUMN deposit_reported_at INTEGER;
-- Guests no longer pay through the service, so the simulated payment is off for good.
UPDATE platform_billing SET test_payments=0 WHERE id='global';
