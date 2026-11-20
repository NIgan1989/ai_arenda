-- «Предоплата или оплата при заселении» (lib/prepay.ts): the owner's share paid before the arrival, 0 = all at it.
ALTER TABLE property_policies ADD COLUMN prepay_percent INTEGER NOT NULL DEFAULT 0 CHECK(prepay_percent IN (0,10,20,30,50,100));
-- The share in force when the request was made; NULL is an older booking, paid in full in advance as agreed.
ALTER TABLE booking_terms ADD COLUMN prepay_percent INTEGER CHECK(prepay_percent IS NULL OR prepay_percent IN (0,10,20,30,50,100));
