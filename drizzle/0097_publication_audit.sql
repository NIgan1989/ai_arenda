-- Publication audit 2026-11-22.
-- The address a guest agreed to: written when the owner changes the address of a flat with a booking ahead. The guest
-- keeps seeing it until the new address is checked by a person and the guest accepts it (or cancels for free).
CREATE TABLE booking_addresses (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 city TEXT NOT NULL,district TEXT NOT NULL DEFAULT '',address TEXT NOT NULL,
 longitude REAL,latitude REAL,
 state TEXT NOT NULL CHECK(state IN ('review','offered')),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
-- A flat approved by a person but not yet ready for the map (no point for its address, fewer than three photos):
-- it is shown by itself as soon as it is ready (lib/show-waiting.ts).
CREATE TABLE show_waiting (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 review_id TEXT NOT NULL,created_at INTEGER NOT NULL
);
-- The proof of the right to let belongs to the address it was given for: a new address needs its own proof.
ALTER TABLE property_right_docs ADD COLUMN address_revision INTEGER NOT NULL DEFAULT 0;
UPDATE property_right_docs SET address_revision=COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=property_right_docs.property_id),0);
