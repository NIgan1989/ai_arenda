-- Cleaning price. When cleaners keep refusing a flat's cleaning at its price, or the price is well below
-- what owners of similar flats in the city pay, the AI administrator suggests a new price once. The price
-- changes only by the owner's button; open cleanings are then offered again at the new price.
CREATE TABLE cleaning_fee_tips (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 from_fee INTEGER NOT NULL,
 to_fee INTEGER NOT NULL,
 typical INTEGER NOT NULL DEFAULT 0,
 samples INTEGER NOT NULL DEFAULT 0,
 refused INTEGER NOT NULL DEFAULT 0,
 policy_version INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','declined','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decided_at INTEGER
);
CREATE INDEX cleaning_fee_tips_owner ON cleaning_fee_tips(owner_id,status,created_at);
CREATE INDEX cleaning_fee_tips_property ON cleaning_fee_tips(property_id,status,decided_at);
CREATE TRIGGER account_erased_cleaning_fee_tips_insert BEFORE INSERT ON cleaning_fee_tips WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_fee_tips_update BEFORE UPDATE ON cleaning_fee_tips WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
