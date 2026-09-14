CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`picture` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_users_last_seen` ON `users` (`last_seen`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_expires_at` ON `sessions` (`expires_at`);
