-- The AI administrator's price advice. After the owner accepts a cleaning and the flat is
-- ready for the next guest, the service compares demand and supply right now and may suggest
-- raising or lowering the guest price. Nothing changes until the owner presses the button:
-- the suggestion stores the tariffs it was made for and applies only to that policy version.
CREATE TABLE price_suggestions (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 direction TEXT NOT NULL CHECK(direction IN ('up','down')),
 percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 50),
 policy_version INTEGER NOT NULL,
 from_daily INTEGER NOT NULL, to_daily INTEGER NOT NULL,
 from_hourly INTEGER NOT NULL, to_hourly INTEGER NOT NULL,
 from_nightly INTEGER NOT NULL, to_nightly INTEGER NOT NULL,
 signals TEXT NOT NULL DEFAULT '{}',
 reasons TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decided_at INTEGER
);
CREATE INDEX price_suggestions_property ON price_suggestions(property_id,created_at);
CREATE INDEX price_suggestions_owner ON price_suggestions(owner_id,status,expires_at);
CREATE TRIGGER account_erased_price_suggestions_insert BEFORE INSERT ON price_suggestions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_price_suggestions_update BEFORE UPDATE ON price_suggestions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
