-- «Я оплатил» keeps the sum the guest named (audit 2026-11-22): the owner confirms that sum, even after a discount,
-- and a cancellation before the check keeps the transfer «на проверке» with what goes back if the money arrived.
ALTER TABLE booking_terms ADD COLUMN payment_reported_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_terms ADD COLUMN deposit_reported_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_terms ADD COLUMN refund_if_received INTEGER NOT NULL DEFAULT 0;
-- Reports made before this migration: what was still owed when the guest said «Я оплатил».
UPDATE booking_terms SET payment_reported_amount=MAX(0,amount-COALESCE(paid_amount,0)) WHERE payment_reported_at IS NOT NULL;
UPDATE booking_terms SET deposit_reported_amount=MAX(0,deposit-COALESCE((SELECT SUM(amount) FROM finance_entries f WHERE f.booking_id=booking_terms.booking_id AND f.kind='deposit'),0)) WHERE deposit_reported_at IS NOT NULL;
