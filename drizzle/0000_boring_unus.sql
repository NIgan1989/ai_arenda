CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `cleaning_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_applicant` ON `applications` (`job_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`occupied_until` integer NOT NULL,
	`guests` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`expires_at` integer NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`request_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_request_key` ON `bookings` (`guest_id`,`request_key`);--> statement-breakpoint
CREATE TABLE `cleaning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`booking_id` text,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`fee` integer NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`checklist` text DEFAULT '[]' NOT NULL,
	`report` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_for_booking` ON `cleaning_jobs` (`booking_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`dedupe` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe` ON `notifications` (`dedupe`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`city` text DEFAULT 'Павлодар' NOT NULL,
	`roles` text DEFAULT '["guest"]' NOT NULL,
	`districts` text DEFAULT '' NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`availability` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`demo_owner` text,
	`title` text NOT NULL,
	`city` text NOT NULL,
	`district` text NOT NULL,
	`address` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`rooms` integer NOT NULL,
	`capacity` integer NOT NULL,
	`cleaning_minutes` integer DEFAULT 90 NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER booking_insert_guard BEFORE INSERT ON bookings BEGIN
  SELECT CASE WHEN NEW.end <= NEW.start OR NEW.occupied_until < NEW.end OR NEW.amount < 0 OR NEW.guests < 1 OR NEW.status NOT IN ('requested','confirmed','cancelled','expired','completed') THEN RAISE(ABORT, 'invalid_booking') END;
  SELECT CASE WHEN (NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch())) AND EXISTS (
    SELECT 1 FROM bookings b WHERE b.property_id=NEW.property_id
    AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>unixepoch()))
    AND b.start<NEW.occupied_until AND b.occupied_until>NEW.start
  ) THEN RAISE(ABORT, 'booking_overlap') END;
  SELECT CASE WHEN (NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch())) AND EXISTS (
    SELECT 1 FROM cleaning_jobs j WHERE j.property_id=NEW.property_id AND j.status IN ('open','assigned','in_progress','submitted') AND (j.booking_id IS NULL OR j.booking_id<>NEW.id) AND j.start<NEW.occupied_until AND j.end>NEW.start
  ) THEN RAISE(ABORT, 'booking_overlap') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_update_guard BEFORE UPDATE ON bookings BEGIN
  SELECT CASE WHEN NEW.end <= NEW.start OR NEW.occupied_until < NEW.end OR NEW.status NOT IN ('requested','confirmed','cancelled','expired','completed') THEN RAISE(ABORT, 'invalid_booking') END;
  SELECT CASE WHEN (NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch())) AND EXISTS (
    SELECT 1 FROM bookings b WHERE b.id<>NEW.id AND b.property_id=NEW.property_id
    AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>unixepoch()))
    AND b.start<NEW.occupied_until AND b.occupied_until>NEW.start
  ) THEN RAISE(ABORT, 'booking_overlap') END;
END;
--> statement-breakpoint
CREATE TRIGGER cleaner_assignment_guard BEFORE UPDATE OF assigned_to,status,start,end ON cleaning_jobs
WHEN NEW.assigned_to IS NOT NULL AND NEW.status IN ('assigned','in_progress','submitted') BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM cleaning_jobs j WHERE j.id<>NEW.id AND j.assigned_to=NEW.assigned_to AND j.status IN ('assigned','in_progress','submitted') AND j.start<NEW.end AND j.end>NEW.start) THEN RAISE(ABORT, 'cleaner_overlap') END;
END;
--> statement-breakpoint
CREATE INDEX bookings_property_interval ON bookings(property_id,start,occupied_until);
--> statement-breakpoint
CREATE INDEX jobs_assigned_interval ON cleaning_jobs(assigned_to,start,end);
--> statement-breakpoint
CREATE INDEX messages_user_scope ON messages(user_id,scope,created_at);
