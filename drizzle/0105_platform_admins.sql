-- More administrators of the platform (2026-11-26): the main administrator (PLATFORM_ADMIN_IDS, a secret of the Worker)
-- adds another account by its phone in «Управление сервисом» → «Администраторы» and can remove it. An added one manages
-- the service with the same code from Telegram but cannot add or remove administrators (lib/platform-admins.ts).
CREATE TABLE IF NOT EXISTS platform_admins (
 user_id TEXT PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE CASCADE,
 added_by TEXT NOT NULL,
 added_at INTEGER NOT NULL
);
