-- Категория «Баня» (lib/listings.ts categories): a bath or a sauna taken whole for a few hours.
-- included_guests: how many guests the hourly (or daily) price covers; 0 = the price does not depend on guests.
-- extra_guest_price: added to the price of each hour (or day) for every guest above included_guests.
-- prep_minutes: how long before the guests the owner is reminded to get the place ready («Затопить к 19:00»); 0 = no reminder.
ALTER TABLE property_policies ADD COLUMN included_guests INTEGER NOT NULL DEFAULT 0 CHECK(included_guests BETWEEN 0 AND 50);
ALTER TABLE property_policies ADD COLUMN extra_guest_price INTEGER NOT NULL DEFAULT 0 CHECK(extra_guest_price>=0);
ALTER TABLE property_policies ADD COLUMN prep_minutes INTEGER NOT NULL DEFAULT 0 CHECK(prep_minutes BETWEEN 0 AND 720);
