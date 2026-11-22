-- «Возврат получен»: the guest says the money the owner returned has arrived (audit 2026-11-22, «Возвраты и споры»).
ALTER TABLE booking_terms ADD COLUMN refund_confirmed_at INTEGER;
