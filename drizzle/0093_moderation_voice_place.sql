-- Moderation archives a voice message and a point like a photo, so a hidden one can be restored.
ALTER TABLE moderated_content ADD COLUMN original_audio_data TEXT;
ALTER TABLE moderated_content ADD COLUMN original_place TEXT;
