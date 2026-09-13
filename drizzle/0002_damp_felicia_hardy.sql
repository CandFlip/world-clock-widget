PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text,
	`target_id` text NOT NULL,
	`amount_cents` text NOT NULL,
	`currency` text NOT NULL,
	`reference` text NOT NULL,
	`status` text NOT NULL,
	`provider` text DEFAULT 'legacy-manual' NOT NULL,
	`provider_event_id` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_contributions`("id", "visitor_id", "target_id", "amount_cents", "currency", "reference", "status", "provider", "provider_event_id", "verified_at", "created_at", "updated_at") SELECT "id", "visitor_id", "target_id", "amount_cents", "currency", "reference", "status", 'legacy-manual', NULL, NULL, "created_at", "updated_at" FROM `contributions`;--> statement-breakpoint
DROP TABLE `contributions`;--> statement-breakpoint
ALTER TABLE `__new_contributions` RENAME TO `contributions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_contributions_target_status` ON `contributions` (`target_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contributions_provider_event` ON `contributions` (`provider`,`provider_event_id`);
