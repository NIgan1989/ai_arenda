-- «Услуги» of a car place (2026-11-28): a booking of a car wash, a tyre service, a car service or a detailing studio
-- keeps the service and the car in one line, «Комплекс · Toyota Camry, 123 ABC 01» (lib/venue-services.ts).
ALTER TABLE booking_terms ADD COLUMN service TEXT NOT NULL DEFAULT '';
