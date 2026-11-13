-- The week ahead. Once a week the AI administrator looks at the owner's city: which evenings are
-- usually full and which are empty, plus what is already booked. It tells the owner in one message
-- and, when a flat is free on those days, suggests one change: the price or the minimum stay.
-- Nothing changes until the owner presses the button.
CREATE TABLE load_forecasts (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 week_start INTEGER NOT NULL,
 city TEXT NOT NULL,
 days TEXT NOT NULL,
 advice TEXT NOT NULL DEFAULT 'none' CHECK(advice IN ('none','raise','lower','min_hours')),
 property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
 policy_version INTEGER,
 from_value INTEGER NOT NULL DEFAULT 0,
 to_value INTEGER NOT NULL DEFAULT 0,
 from_hourly INTEGER NOT NULL DEFAULT 0,
 to_hourly INTEGER NOT NULL DEFAULT 0,
 from_nightly INTEGER NOT NULL DEFAULT 0,
 to_nightly INTEGER NOT NULL DEFAULT 0,
 percent INTEGER NOT NULL DEFAULT 0,
 reasons TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','declined','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decided_at INTEGER,
 UNIQUE(owner_id,week_start)
);
CREATE INDEX load_forecasts_owner ON load_forecasts(owner_id,status,expires_at);
CREATE TRIGGER account_erased_load_forecasts_insert BEFORE INSERT ON load_forecasts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_load_forecasts_update BEFORE UPDATE ON load_forecasts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
