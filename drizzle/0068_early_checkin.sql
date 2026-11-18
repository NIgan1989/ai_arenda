-- «Можно заселиться раньше»: the owner opens the check-in before the usual 15 minutes (lib/arrival-shift.ts).
ALTER TABLE `booking_terms` ADD `early_checkin_at` integer;
