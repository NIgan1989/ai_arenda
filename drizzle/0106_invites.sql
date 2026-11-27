-- Приглашения и промокоды (2026-11-27). An owner invites another owner with a personal code; a partner company gets a code
-- from the administrator. The one who came by a code gets days without the commission on bookings, starting from their
-- first booking confirmed through the service; with a friend's code the friend who invited gets the same days from the
-- same moment (lib/invites.ts). The days only add a free window to the commission (lib/platform-billing.ts freshSql):
-- nothing is paid out and nothing is exchanged for money.
CREATE TABLE IF NOT EXISTS invite_codes (
 code TEXT PRIMARY KEY CHECK(length(code) BETWEEN 4 AND 24 AND code=upper(code)),
 kind TEXT NOT NULL CHECK(kind IN ('friend','partner')),
 user_id TEXT REFERENCES profiles(id),
 role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner')),
 days INTEGER NOT NULL DEFAULT 30 CHECK(days BETWEEN 1 AND 180),
 label TEXT NOT NULL DEFAULT '' CHECK(length(label)<=80),
 expires_at INTEGER,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 CHECK((kind='friend')=(user_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_friend ON invite_codes(user_id,role) WHERE kind='friend';
-- One code per participant and role, once, before their first booking through the service. The code is kept as text:
-- the record stays when the friend's code goes with the friend's account.
CREATE TABLE IF NOT EXISTS invite_redemptions (
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner')),
 code TEXT NOT NULL,
 inviter_id TEXT,
 redeemed_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role)
);
CREATE INDEX IF NOT EXISTS invite_redemptions_code ON invite_redemptions(code);
CREATE INDEX IF NOT EXISTS invite_redemptions_inviter ON invite_redemptions(inviter_id);
-- The free days themselves: for the one who came (source_id = user_id) and for the friend who invited. starts_at stays
-- empty until the first commission of source_id that is not a forecast, so a code alone, without a real booking, gives
-- nothing to anyone.
CREATE TABLE IF NOT EXISTS invite_bonuses (
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner')),
 source_id TEXT NOT NULL,
 code TEXT NOT NULL,
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 180),
 starts_at INTEGER,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role,source_id)
);
CREATE INDEX IF NOT EXISTS invite_bonuses_source ON invite_bonuses(source_id) WHERE starts_at IS NULL;
-- The days start with that commission, but never inside the owner's «14 дней бесплатно» or another invite's days: they
-- follow them, so a month is always a whole month.
DROP TRIGGER IF EXISTS invite_bonus_start;
CREATE TRIGGER invite_bonus_start AFTER INSERT ON platform_commissions
WHEN NEW.mode<>'shadow' AND EXISTS(SELECT 1 FROM invite_bonuses WHERE source_id=NEW.owner_id AND starts_at IS NULL)
BEGIN
 UPDATE invite_bonuses SET starts_at=MAX(NEW.created_at,
   COALESCE((SELECT MAX(b.starts_at+b.days*86400) FROM invite_bonuses b WHERE b.user_id=invite_bonuses.user_id AND b.role=invite_bonuses.role AND b.starts_at IS NOT NULL),0),
   COALESCE((SELECT MAX(s.starts_at,(SELECT MIN(p.created_at) FROM properties p WHERE p.owner_id=invite_bonuses.user_id AND p.demo_owner IS NULL))+s.free_days*86400 FROM platform_billing s WHERE s.id='global'),0))
 WHERE source_id=NEW.owner_id AND starts_at IS NULL;
END;
