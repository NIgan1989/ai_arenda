-- A flat under the AI administrator's autopilot («ИИ») pays its own commission rate:
-- the service does the owner's routine there. Each commission records whether the
-- flat was under autopilot when the booking was confirmed.
ALTER TABLE platform_billing ADD COLUMN ai_rate_bp INTEGER NOT NULL DEFAULT 1000 CHECK(ai_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_commissions ADD COLUMN managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1));
CREATE INDEX platform_commissions_managed ON platform_commissions(managed,created_at);
