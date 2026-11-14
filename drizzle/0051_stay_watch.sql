-- How far the AI administrator has gone with a stay that waits for a person (lib/stay-watch.ts): one row per stay,
-- one step per deadline. pay_step: 1 reminded, 2 warned, 3 released or handed to the owner. arrival_step: 1 asked
-- the guest, 2 released or handed to the owner; «Задерживаюсь на час» starts it over. checkout_step: 1 reminded the
-- guest, 2 told the owner and the cleaner, 3 handed to the service admin.
CREATE TABLE stay_watch (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 pay_step INTEGER NOT NULL DEFAULT 0,
 arrival_step INTEGER NOT NULL DEFAULT 0,
 checkout_step INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
-- The later arrival a guest gave with «Задерживаюсь на час», and how many times.
ALTER TABLE booking_terms ADD COLUMN arrival_eta INTEGER;
ALTER TABLE booking_terms ADD COLUMN late_count INTEGER NOT NULL DEFAULT 0;
