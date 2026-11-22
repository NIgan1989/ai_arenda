-- «Скидка постоянного гостя» (2026-11-22): a guest who already stayed with the owner through the service gets the
-- owner's discount when they book again in the app. Holds regular guests in the service instead of WhatsApp.
-- 0 is off; the owner picks 5, 10 or 15 percent (lib/rental-policy.ts REPEAT_CHOICES).
ALTER TABLE property_policies ADD COLUMN repeat_discount INTEGER NOT NULL DEFAULT 0 CHECK(repeat_discount BETWEEN 0 AND 30);
