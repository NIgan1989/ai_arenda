-- «Я оплатил» keeps the sum the guest named (audit 2026-11-22): the owner confirms that sum, even after a discount,
-- and a cancellation before the check keeps the transfer «на проверке» with what goes back if the money arrived.
ALTER TABLE booking_terms ADD COLUMN payment_reported_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_terms ADD COLUMN deposit_reported_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_terms ADD COLUMN refund_if_received INTEGER NOT NULL DEFAULT 0;
