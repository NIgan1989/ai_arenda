-- Flat photos move to object storage (R2). The row keeps a pointer; data is emptied once the
-- object is written. Rows without object_key are still served from data.
ALTER TABLE media ADD COLUMN object_key TEXT NOT NULL DEFAULT '';
CREATE INDEX media_object_key ON media(object_key) WHERE object_key<>'';
