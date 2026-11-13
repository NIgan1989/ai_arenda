-- Free hours between two stays. The AI administrator finds a gap of a few hours between bookings
-- and suggests letting it by the hour at a discount. Nothing is offered to guests until the owner
-- presses the button; an open window only lowers the hourly price for stays that fit inside it.
CREATE TABLE calendar_windows (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 start INTEGER NOT NULL,
 end INTEGER NOT NULL CHECK(end>start),
 percent INTEGER NOT NULL CHECK(percent BETWEEN 5 AND 40),
 hourly_from INTEGER NOT NULL,
 hourly_to INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','open','declined','expired')),
 created_at INTEGER NOT NULL,
 decided_at INTEGER,
 UNIQUE(property_id,start)
);
CREATE INDEX calendar_windows_owner ON calendar_windows(owner_id,status,start);
CREATE INDEX calendar_windows_open ON calendar_windows(property_id,status,start,end);
CREATE TRIGGER account_erased_calendar_windows_insert BEFORE INSERT ON calendar_windows WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_windows_update BEFORE UPDATE ON calendar_windows WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
