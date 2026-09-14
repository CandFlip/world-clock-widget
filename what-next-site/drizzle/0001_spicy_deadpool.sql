CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`target_id` text NOT NULL,
	`amount_cents` text NOT NULL,
	`currency` text NOT NULL,
	`reference` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contributions_target_status` ON `contributions` (`target_id`,`status`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`outcome` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suggestions_status_created` ON `suggestions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`instructions` text NOT NULL,
	`active` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
