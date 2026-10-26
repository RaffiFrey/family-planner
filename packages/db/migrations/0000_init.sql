CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"locale" text DEFAULT 'de' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"level" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"household_allowlist" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gdpr_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"result_key" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"color" text NOT NULL,
	"avatar_url" text,
	"is_managed" boolean DEFAULT false NOT NULL,
	"birthday" date,
	"granted_modules" text[],
	"access_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "household_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"token" text NOT NULL,
	"role" text NOT NULL,
	"email" text,
	"granted_modules" text[],
	"access_until" timestamp with time zone,
	"invited_by_member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'none' NOT NULL,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"comp_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"visibility" text DEFAULT 'household' NOT NULL,
	"shared_with" uuid[],
	"owner_member_id" uuid NOT NULL,
	"ics_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendars_ics_token_unique" UNIQUE("ics_token")
);
--> statement-breakpoint
ALTER TABLE "calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"original_start" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"overrides" jsonb,
	CONSTRAINT "event_exceptions_uq" UNIQUE("event_id","original_start")
);
--> statement-breakpoint
ALTER TABLE "event_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"rrule" text,
	"series_end_at" timestamp with time zone,
	"attendee_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"reminders" integer[] DEFAULT '{}'::int[] NOT NULL,
	"color" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_key" text,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"visibility" text DEFAULT 'household' NOT NULL,
	"owner_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"institution" text,
	"iban_encrypted" text,
	"iban_last4" text,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"color" text,
	"visibility" text DEFAULT 'household' NOT NULL,
	"owner_member_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_budget_alerts" (
	"household_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_budget_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"period" text NOT NULL,
	"limit_minor" bigint NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_budgets_category_period_uq" UNIQUE("household_id","category_id","period")
);
--> statement-breakpoint
ALTER TABLE "fin_budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text,
	"color" text,
	"key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "fin_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_category_prefs" (
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_category_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"format" text NOT NULL,
	"file_name" text,
	"imported" integer NOT NULL,
	"duplicates" integer NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid,
	"category_id" uuid NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb NOT NULL,
	"direction" text,
	"amount_min_minor" bigint,
	"amount_max_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_splits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	"member_id" uuid,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "fin_splits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"counterparty_name" text,
	"counterparty_iban" text,
	"purpose" text DEFAULT '' NOT NULL,
	"booking_text" text,
	"category_id" uuid,
	"rule_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text NOT NULL,
	"import_id" uuid,
	"import_hash" text,
	"bank_reference" text,
	"transfer_account_id" uuid,
	"transfer_peer_id" uuid,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'household' NOT NULL,
	"owner_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_history" (
	"household_id" uuid NOT NULL,
	"normalized" text NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"uses" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"text" text NOT NULL,
	"quantity" text,
	"category" text DEFAULT 'other' NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_by_member_id" uuid,
	"checked_at" timestamp with time zone,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text,
	"visibility" text DEFAULT 'household' NOT NULL,
	"owner_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"prefs" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"household_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sent_reminders" (
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"reason" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"roles" text[] NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"assignee_member_id" uuid,
	"due_at" timestamp with time zone,
	"anchor_at" timestamp with time zone,
	"priority" text DEFAULT 'normal' NOT NULL,
	"recurrence" jsonb,
	"rotation_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_member_id" uuid,
	"visibility" text DEFAULT 'household' NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_accounts" ADD CONSTRAINT "fin_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budget_alerts" ADD CONSTRAINT "fin_budget_alerts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budget_alerts" ADD CONSTRAINT "fin_budget_alerts_budget_id_fin_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."fin_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_categories" ADD CONSTRAINT "fin_categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_category_prefs" ADD CONSTRAINT "fin_category_prefs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_category_prefs" ADD CONSTRAINT "fin_category_prefs_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_imports" ADD CONSTRAINT "fin_imports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_imports" ADD CONSTRAINT "fin_imports_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_rules" ADD CONSTRAINT "fin_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_rules" ADD CONSTRAINT "fin_rules_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_splits" ADD CONSTRAINT "fin_splits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_splits" ADD CONSTRAINT "fin_splits_transaction_id_fin_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."fin_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_splits" ADD CONSTRAINT "fin_splits_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_rule_id_fin_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."fin_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_import_id_fin_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."fin_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_reminders" ADD CONSTRAINT "sent_reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_household_created_idx" ON "audit_log" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "gdpr_status_idx" ON "gdpr_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "members_household_idx" ON "household_members" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_household_user_uq" ON "household_members" USING btree ("household_id","user_id") WHERE user_id is not null and removed_at is null;--> statement-breakpoint
CREATE INDEX "idempotency_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invitations_household_idx" ON "invitations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox" USING btree ("id") WHERE processed_at is null;--> statement-breakpoint
CREATE INDEX "calendars_household_idx" ON "calendars" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "events_household_range_idx" ON "events" USING btree ("household_id","start_at","series_end_at");--> statement-breakpoint
CREATE INDEX "files_folder_idx" ON "files" USING btree ("household_id","folder_id");--> statement-breakpoint
CREATE INDEX "fin_accounts_household_idx" ON "fin_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_budget_alerts_uq" ON "fin_budget_alerts" USING btree ("budget_id","period_start","level");--> statement-breakpoint
CREATE INDEX "fin_categories_household_idx" ON "fin_categories" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_category_prefs_uq" ON "fin_category_prefs" USING btree ("household_id","category_id");--> statement-breakpoint
CREATE INDEX "fin_rules_household_idx" ON "fin_rules" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "fin_splits_tx_idx" ON "fin_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "fin_tx_household_date_idx" ON "fin_transactions" USING btree ("household_id","booking_date","id");--> statement-breakpoint
CREATE INDEX "fin_tx_account_date_idx" ON "fin_transactions" USING btree ("account_id","booking_date");--> statement-breakpoint
CREATE INDEX "fin_tx_category_idx" ON "fin_transactions" USING btree ("household_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_tx_import_hash_uq" ON "fin_transactions" USING btree ("account_id","import_hash") WHERE import_hash is not null;--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("household_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_history_uq" ON "item_history" USING btree ("household_id","normalized");--> statement-breakpoint
CREATE INDEX "list_items_list_idx" ON "list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "lists_household_idx" ON "lists" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sent_reminders_key_uq" ON "sent_reminders" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "staff_audit_created_idx" ON "staff_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_household_status_due_idx" ON "tasks" USING btree ("household_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_series_idx" ON "tasks" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_series_open_uq" ON "tasks" USING btree ("series_id") WHERE status = 'open' and deleted_at is null;--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "household_members_tenant_isolation" ON "household_members" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "households_tenant_isolation" ON "households" AS PERMISSIVE FOR ALL TO "fp_app" USING (id = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invitations_tenant_isolation" ON "invitations" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "outbox_insert" ON "outbox" AS PERMISSIVE FOR INSERT TO "fp_app" WITH CHECK (household_id is null or household_id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_isolation" ON "subscriptions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "calendars_tenant_isolation" ON "calendars" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "event_exceptions_tenant_isolation" ON "event_exceptions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "events_tenant_isolation" ON "events" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "files_tenant_isolation" ON "files" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_accounts_tenant_isolation" ON "fin_accounts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_budget_alerts_tenant_isolation" ON "fin_budget_alerts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_budgets_tenant_isolation" ON "fin_budgets" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_categories_read" ON "fin_categories" AS PERMISSIVE FOR SELECT TO "fp_app" USING (household_id is null or household_id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_categories_write" ON "fin_categories" AS PERMISSIVE FOR ALL TO "fp_app" USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_category_prefs_tenant_isolation" ON "fin_category_prefs" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_imports_tenant_isolation" ON "fin_imports" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_rules_read" ON "fin_rules" AS PERMISSIVE FOR SELECT TO "fp_app" USING (household_id is null or household_id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_rules_write" ON "fin_rules" AS PERMISSIVE FOR ALL TO "fp_app" USING (household_id = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK (household_id = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_splits_tenant_isolation" ON "fin_splits" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_transactions_tenant_isolation" ON "fin_transactions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "folders_tenant_isolation" ON "folders" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "item_history_tenant_isolation" ON "item_history" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "list_items_tenant_isolation" ON "list_items" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lists_tenant_isolation" ON "lists" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);