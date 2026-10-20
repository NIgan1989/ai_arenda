CREATE TABLE property_photos (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 property_id TEXT REFERENCES properties(id),
 content_type TEXT NOT NULL,
 data BLOB NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX photos_property ON property_photos(property_id,sort_order);
--> statement-breakpoint
CREATE INDEX photos_owner ON property_photos(owner_id,created_at);
