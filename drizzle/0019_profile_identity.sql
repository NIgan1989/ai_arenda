CREATE TABLE profile_preferences (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),bio TEXT NOT NULL DEFAULT '',languages TEXT NOT NULL DEFAULT '',
 avatar_visibility TEXT NOT NULL DEFAULT 'participants' CHECK(avatar_visibility IN ('participants','self')),
 show_presence INTEGER NOT NULL DEFAULT 1 CHECK(show_presence IN (0,1)),
 show_receipts INTEGER NOT NULL DEFAULT 1 CHECK(show_receipts IN (0,1))
);
