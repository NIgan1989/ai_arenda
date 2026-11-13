-- Test payments until a bank is connected: the guest goes through payment and deposit without money moving.
-- The platform administrator turns it off in «Доход». A real gateway always takes over when configured.
ALTER TABLE platform_billing ADD COLUMN test_payments INTEGER NOT NULL DEFAULT 1 CHECK(test_payments IN (0,1));
ALTER TABLE payment_intents ADD COLUMN test INTEGER NOT NULL DEFAULT 0 CHECK(test IN (0,1));
