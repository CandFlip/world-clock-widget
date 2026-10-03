CREATE TABLE `download_daily` (
	`day` text NOT NULL,
	`platform` text NOT NULL,
	`country` text NOT NULL,
	`region` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `platform`, `country`, `region`)
);

--> statement-breakpoint
INSERT OR IGNORE INTO site_settings(key,value,updated_at) VALUES('download_tracking_started',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
