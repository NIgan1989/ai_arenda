-- Indexes for the questions the service asks every minute (lib/background.ts) and on every refresh of the app.
-- Without them each question read a whole table, and the free daily limit of rows read in D1 ran out on 2026-11-21.
CREATE INDEX IF NOT EXISTS audit_events_entity ON audit_events(entity_id,created_at);
CREATE INDEX IF NOT EXISTS properties_owner ON properties(owner_id,created_at);
CREATE INDEX IF NOT EXISTS properties_city ON properties(city,published);
CREATE INDEX IF NOT EXISTS cleaning_jobs_owner ON cleaning_jobs(owner_id,status);
CREATE INDEX IF NOT EXISTS cleaning_jobs_property ON cleaning_jobs(property_id,status);
CREATE INDEX IF NOT EXISTS cleaning_jobs_status ON cleaning_jobs(status,start);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings(status,start);
CREATE INDEX IF NOT EXISTS bookings_guest ON bookings(guest_id,start);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
CREATE INDEX IF NOT EXISTS profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS cleaning_offers_job ON cleaning_offers(job_id,status);
-- The background check of each owner runs every two minutes instead of every 30 seconds (lib/background.ts, OWNER_EVERY).
UPDATE background_jobs SET repeat_seconds=120 WHERE kind='owner' AND repeat_seconds=30;
