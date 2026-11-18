-- How many times a place's card was shown to guests in the search, per day in Kazakhstan time.
-- Only a count per object: nothing about who looked. The owner sees the sum of the last seven days on the object's card.
CREATE TABLE property_views (
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 day INTEGER NOT NULL, shown INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(property_id,day)
);
