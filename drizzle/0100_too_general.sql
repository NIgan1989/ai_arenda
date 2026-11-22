-- The business is a ТОО on the general regime (decision of 2026-11-20), not an ИП on the simplified one.
-- Only settings nobody has edited yet (version 1) are switched; the administrator's own choice stays.
UPDATE company_finance_settings SET entity='too',tax_regime='general',version=version+1,updated_at=CAST(strftime('%s','now') AS INTEGER) WHERE id='global' AND version=1 AND entity='ip' AND tax_regime='simplified';
-- The day a tax or a cost was really paid (the bank date), apart from the moment it was entered.
ALTER TABLE company_tax_payments ADD COLUMN paid_on TEXT NOT NULL DEFAULT '';
ALTER TABLE company_cost_payments ADD COLUMN paid_on TEXT NOT NULL DEFAULT '';
