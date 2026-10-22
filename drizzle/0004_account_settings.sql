CREATE TABLE account_preferences (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 payment_provider TEXT NOT NULL DEFAULT 'undecided' CHECK(payment_provider IN ('undecided','kaspi','halyk')),
 payment_notifications INTEGER NOT NULL DEFAULT 1 CHECK(payment_notifications IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
