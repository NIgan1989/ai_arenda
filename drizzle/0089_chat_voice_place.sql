-- Chat like a messenger (2026-11-22): a voice message and a point on the map, so the participants keep talking in the
-- service instead of WhatsApp. audio_data is a data URI of a short recording (up to 60 s), audio_ms its length;
-- place is JSON {"lat":..,"lon":..}. Empty strings mean a plain text or photo message.
ALTER TABLE discussion_messages ADD COLUMN audio_data TEXT NOT NULL DEFAULT '';
ALTER TABLE discussion_messages ADD COLUMN audio_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discussion_messages ADD COLUMN place TEXT NOT NULL DEFAULT '';
