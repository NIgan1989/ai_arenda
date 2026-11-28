-- «Время работы» (2026-11-28): every hall, cafe, bath and sauna sets its own hours, and a hall its own times of events
-- (lib/venue-hours.ts). JSON {open,close,sessions:[{label,from,to}]} in minutes of the day; empty = the kind's default.
ALTER TABLE property_policies ADD COLUMN venue_hours TEXT NOT NULL DEFAULT '';
