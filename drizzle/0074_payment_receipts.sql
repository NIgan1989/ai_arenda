-- The service cannot see a transfer between two people in their bank, so the payer may attach the bank receipt to
-- «Я оплатил»: the guest for a booking, the customer for a cleaning. The receiver and the service administrator see it.
CREATE TABLE payment_receipts (
 id TEXT PRIMARY KEY,
 booking_id TEXT REFERENCES bookings(id),
 job_id TEXT REFERENCES cleaning_jobs(id),
 user_id TEXT NOT NULL REFERENCES profiles(id),
 data TEXT NOT NULL DEFAULT '',
 object_key TEXT NOT NULL DEFAULT '',
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 CHECK((booking_id IS NULL)<>(job_id IS NULL))
);
CREATE INDEX payment_receipts_booking ON payment_receipts(booking_id);
CREATE INDEX payment_receipts_job ON payment_receipts(job_id);
CREATE TRIGGER account_erased_payment_receipts_insert BEFORE INSERT ON payment_receipts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
