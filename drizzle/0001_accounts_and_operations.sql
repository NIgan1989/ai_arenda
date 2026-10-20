CREATE TABLE accounts (
 id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES accounts(id),
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sessions_user ON sessions(user_id);
--> statement-breakpoint
CREATE TABLE auth_limits (key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE account_settings (
 user_id TEXT PRIMARY KEY NOT NULL, active_role TEXT NOT NULL DEFAULT 'guest',
 auto_confirm INTEGER NOT NULL DEFAULT 0, auto_assign INTEGER NOT NULL DEFAULT 0,
 cleaning_fee INTEGER NOT NULL DEFAULT 4000
);
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN property_type TEXT NOT NULL DEFAULT 'apartment';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day';
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day';
