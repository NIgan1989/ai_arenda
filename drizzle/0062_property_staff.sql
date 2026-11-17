-- «Сотрудник» объекта (lib/staff.ts): the owner names one person by phone in the settings of an object. That
-- person sees today's stays of the object and marks them (затоплено, гости пришли, гости ушли, готово) and can
-- mark the object busy. No money, no settings. The owner takes it back at any time.
CREATE TABLE property_staff (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 staff_id TEXT NOT NULL REFERENCES profiles(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL
);
CREATE INDEX property_staff_person ON property_staff(staff_id);
-- An erased account is not named as staff again (lib/account-deletion-inventory.ts).
CREATE TRIGGER account_erased_property_staff_insert BEFORE INSERT ON property_staff WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.staff_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- «Затоплено»: when the object was made ready for this stay, before the guests came.
ALTER TABLE booking_terms ADD COLUMN prepared_at INTEGER;
