-- «Банкетный зал» (2026-11-17): what the hall is taken for (lib/listings.ts occasions). Empty for every other kind.
-- A booking with an occasion is a banquet: its cancellation returns everything paid (lib/cancellation.ts).
ALTER TABLE booking_terms ADD COLUMN occasion text NOT NULL DEFAULT '';
