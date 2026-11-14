-- How far the AI administrator has gone with a stay that waits for a person (lib/stay-watch.ts): one row per stay,
-- one step per deadline. pay_step: 1 reminded, 2 warned, 3 released or handed to the owner. arrival_step: 1 asked
-- the guest, 2 released or handed to the owner; «Задерживаюсь на час» starts it over. checkout_step: 1 reminded the
-- guest, 2 told the owner and the cleaner, 3 handed to the service admin. pay_for, arrival_for, checkout_for: the
-- deadline each step was taken for, so a stay moved to another time starts that step over.
CREATE TABLE stay_watch (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 pay_step INTEGER NOT NULL DEFAULT 0,
 arrival_step INTEGER NOT NULL DEFAULT 0,
 checkout_step INTEGER NOT NULL DEFAULT 0,
 pay_for INTEGER, arrival_for INTEGER, checkout_for INTEGER,
 updated_at INTEGER NOT NULL
);
-- The later arrival a guest gave with «Задерживаюсь на час», and how many times.
ALTER TABLE booking_terms ADD COLUMN arrival_eta INTEGER;
ALTER TABLE booking_terms ADD COLUMN late_count INTEGER NOT NULL DEFAULT 0;
-- «Автопилот: решения и сроки» (lib/decision-rules.ts): for each question the AI waits on a person for, whether the AI
-- decides by itself when nobody answers (auto) and how long it waits (minutes). No row means the service's default.
CREATE TABLE decision_rules (
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 rule TEXT NOT NULL,
 auto INTEGER NOT NULL DEFAULT 1 CHECK(auto IN (0,1)),
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role,rule)
);
