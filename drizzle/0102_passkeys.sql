-- Sign-in with Face ID or a fingerprint in the phone app (passkeys, WebAuthn; lib/passkeys.ts). The private key stays on
-- the phone, in iCloud Keychain or Google Password Manager; the server keeps the public key and checks each signature.
-- A password reset removes the account's passkeys (lib/native-auth.ts).
CREATE TABLE auth_passkeys (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 public_key TEXT NOT NULL,
 counter INTEGER NOT NULL DEFAULT 0,
 transports TEXT NOT NULL DEFAULT '',
 device TEXT NOT NULL DEFAULT '',
 backed_up INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 last_used_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX auth_passkeys_user ON auth_passkeys(user_id);
-- One use, five minutes: the random question the phone signs. A sign-in question belongs to nobody yet.
CREATE TABLE auth_passkey_challenges (
 id TEXT PRIMARY KEY,
 user_id TEXT REFERENCES auth_accounts(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('login','register')),
 challenge TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_passkey_challenges_expiry ON auth_passkey_challenges(expires_at);
