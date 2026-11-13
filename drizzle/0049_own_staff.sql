-- Kinds of housing: a hotel, a hostel or an apart-hotel has its own staff for cleaning.
-- With own_staff=1 the AI administrator does not look for executors for this property:
-- no cleaning jobs, no responses, no executor commission; after checkout the property is ready at once.
ALTER TABLE properties ADD COLUMN own_staff INTEGER NOT NULL DEFAULT 0 CHECK(own_staff IN (0,1));
