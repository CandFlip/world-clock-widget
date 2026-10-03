CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`picture` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_users_last_seen` ON `users` (`last_seen`);
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `idx_sessions_user_id` ON `sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_sessions_expires_at` ON `sessions` (`expires_at`);

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

CREATE INDEX `idx_contributions_target_status` ON `contributions` (`target_id`,`status`);
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);

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

CREATE INDEX `idx_suggestions_status_created` ON `suggestions` (`status`,`created_at`);
CREATE TABLE `support_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`instructions` text NOT NULL,
	`active` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

PRAGMA foreign_keys=OFF;
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

INSERT INTO `__new_contributions`("id", "visitor_id", "target_id", "amount_cents", "currency", "reference", "status", "provider", "provider_event_id", "verified_at", "created_at", "updated_at") SELECT "id", "visitor_id", "target_id", "amount_cents", "currency", "reference", "status", 'legacy-manual', NULL, NULL, "created_at", "updated_at" FROM `contributions`;
DROP TABLE `contributions`;
ALTER TABLE `__new_contributions` RENAME TO `contributions`;
PRAGMA foreign_keys=ON;
CREATE INDEX `idx_contributions_target_status` ON `contributions` (`target_id`,`status`);
CREATE UNIQUE INDEX `idx_contributions_provider_event` ON `contributions` (`provider`,`provider_event_id`);

CREATE TABLE `download_daily` (
	`day` text NOT NULL,
	`platform` text NOT NULL,
	`country` text NOT NULL,
	`region` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `platform`, `country`, `region`)
);


INSERT OR IGNORE INTO site_settings(key,value,updated_at) VALUES('download_tracking_started',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE votes (visitor_id TEXT PRIMARY KEY, option_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE timer_feedback (visitor_id TEXT PRIMARY KEY, context TEXT NOT NULL, placement TEXT NOT NULL, alert_style TEXT NOT NULL, typical_duration TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
