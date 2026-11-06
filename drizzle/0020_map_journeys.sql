CREATE TABLE property_locations (
 property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
 longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 latitude REAL NOT NULL CHECK(latitude BETWEEN -85 AND 85),
 source TEXT NOT NULL CHECK(source IN ('owner','fixture')),
 address_fingerprint TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE journey_sessions (
 id TEXT PRIMARY KEY,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('booking','job')),
 entity_id TEXT NOT NULL,
 sender_id TEXT NOT NULL REFERENCES profiles(id),
 sender_role TEXT NOT NULL CHECK(sender_role IN ('guest','cleaner')),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 mode TEXT NOT NULL CHECK(mode IN ('walking','driving')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 stopped_at INTEGER,
 longitude REAL,
 latitude REAL,
 accuracy REAL,
 recorded_at INTEGER,
 received_at INTEGER
);
CREATE INDEX journey_active ON journey_sessions(sender_id,entity_kind,entity_id,expires_at);
CREATE TRIGGER property_location_address_changed AFTER UPDATE OF address,city,district ON properties
WHEN OLD.address<>NEW.address OR OLD.city<>NEW.city OR OLD.district<>NEW.district
BEGIN DELETE FROM property_locations WHERE property_id=NEW.id; END;
