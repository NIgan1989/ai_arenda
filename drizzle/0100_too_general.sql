-- The business is a ТОО on the general regime (decision of 2026-11-20), not an ИП on the simplified one.
-- Only settings nobody has edited yet (version 1) are switched; the administrator's own choice stays.
UPDATE company_finance_settings SET entity='too',tax_regime='general',version=version+1,updated_at=CAST(strftime('%s','now') AS INTEGER) WHERE id='global' AND version=1 AND entity='ip' AND tax_regime='simplified';
