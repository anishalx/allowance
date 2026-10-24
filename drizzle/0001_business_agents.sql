CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`paypal_tool` text NOT NULL,
	`args` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`target` text NOT NULL,
	`reason` text NOT NULL,
	`checks` text NOT NULL,
	`engine_decision` text NOT NULL,
	`audit` text,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`status` text NOT NULL,
	`approval_expires_at` integer,
	`approval_token` text,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `operations_agent_idx` ON `operations` (`agent_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `agents` ADD `kind` text DEFAULT 'shopper' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `ops_policy` text;