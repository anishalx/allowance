CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`api_key_hash` text NOT NULL,
	`api_key_prefix` text NOT NULL,
	`mandate_text` text NOT NULL,
	`policy` text NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text,
	`request_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_user_idx` ON `events` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`paypal_email` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`merchant_id` text,
	`merchant` text NOT NULL,
	`items` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`purpose` text NOT NULL,
	`policy_checks` text NOT NULL,
	`policy_decision` text NOT NULL,
	`audit` text,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`status` text NOT NULL,
	`approval_expires_at` integer,
	`approval_token` text,
	`paypal_order_id` text,
	`capture_id` text,
	`payout_batch_id` text,
	`payout_status` text,
	`payout_fee_cents` integer,
	`refund_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_agent_idx` ON `payment_requests` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_capture_idx` ON `payment_requests` (`capture_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ntfy_topic` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`setup_token_id` text,
	`payment_token_id` text,
	`customer_id` text,
	`payer_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`resource_id` text,
	`verified` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
