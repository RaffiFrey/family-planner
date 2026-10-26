CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"granted_by_member_id" uuid NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id_encrypted" text NOT NULL,
	"external_key" text NOT NULL,
	"name" text NOT NULL,
	"iban_encrypted" text,
	"iban_last4" text,
	"currency" text NOT NULL,
	"type" text NOT NULL,
	"account_id" uuid,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"bank_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id_encrypted" text,
	"external_user_encrypted" text,
	"secret_encrypted" text,
	"pending_ref_encrypted" text,
	"state_hash" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"consent_expires_at" timestamp with time zone,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contract_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"counterparty_key" text,
	"counterparty_name" text,
	"direction" text DEFAULT 'out' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"interval" text NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"start_date" date,
	"next_due_date" date,
	"minimum_term_end" date,
	"notice_period_days" integer,
	"end_date" date,
	"provider_name" text,
	"provider_contact" text,
	"contract_number_encrypted" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"confidence" double precision,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_expense_parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"member_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_expense_parties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_expense_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"value" double precision,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_expense_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_goal_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"date" date NOT NULL,
	"member_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_goal_contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"deadline" date,
	"account_id" uuid,
	"color" text,
	"icon" text,
	"archived" boolean DEFAULT false NOT NULL,
	"reached_at" timestamp with time zone,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"from_party_id" uuid NOT NULL,
	"to_party_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fin_shared_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"paid_by_party_id" uuid NOT NULL,
	"split_method" text NOT NULL,
	"transaction_id" uuid,
	"notes" text,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_shared_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "album_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" text,
	"taken_at" timestamp with time zone,
	"position" double precision NOT NULL,
	"added_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_file_id" uuid,
	"visibility" text DEFAULT 'household' NOT NULL,
	"shared_with" uuid[],
	"owner_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "albums" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "allowance_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"date" date NOT NULL,
	"rule_id" uuid,
	"period_key" text,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allowance_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "allowance_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"interval" text NOT NULL,
	"weekday" smallint,
	"day_of_month" smallint,
	"starts_on" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allowance_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "board_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"text" text NOT NULL,
	"color" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"attachment_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"author_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "board_reactions" (
	"household_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" text NOT NULL,
	"recipe_id" uuid,
	"title" text NOT NULL,
	"servings" integer,
	"cook_member_id" uuid,
	"notes" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"household_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"option_index" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"author_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"servings" integer,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_url" text,
	"image_file_id" uuid,
	"image_url" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"task_id" uuid,
	"reward_id" uuid,
	"redemption_id" uuid,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"reward_id" uuid,
	"reward_title" text NOT NULL,
	"cost_points" integer NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"decided_by_member_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cost_points" integer NOT NULL,
	"icon" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trip_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"location" text,
	"confirmation_code_encrypted" text,
	"notes" text,
	"attachment_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"destination" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"budget_minor" bigint,
	"currency" text NOT NULL,
	"finance_category_id" uuid,
	"finance_account_id" uuid,
	"member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"packing_list_id" uuid,
	"notes" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"purchase_date" date,
	"warranty_until" date,
	"receipt_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"transaction_id" uuid,
	"notes" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkup_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"code" text NOT NULL,
	"done_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkup_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"organization" text,
	"phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text,
	"address" text,
	"notes" text,
	"member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "emergency_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"blood_type" text,
	"allergies" text[] DEFAULT '{}'::text[] NOT NULL,
	"conditions" text[] DEFAULT '{}'::text[] NOT NULL,
	"medications" text,
	"insurance_provider" text,
	"insurance_number_encrypted" text,
	"insurance_number_last4" text,
	"emergency_contact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"doctor_contact_id" uuid,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "location_pings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_pings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "location_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"shared_with" uuid[],
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"done_on" date NOT NULL,
	"due_on" date,
	"cost_minor" bigint,
	"notes" text,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"template_key" text,
	"recurrence" jsonb NOT NULL,
	"anchor_on" date NOT NULL,
	"next_due_on" date,
	"lead_days" integer DEFAULT 14 NOT NULL,
	"last_done_on" date,
	"assignee_member_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" text,
	"times" text[] DEFAULT '{}'::text[] NOT NULL,
	"rrule" text DEFAULT 'FREQ=DAILY' NOT NULL,
	"timezone" text NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"reminders" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"meter_type" text NOT NULL,
	"value" numeric(15, 3) NOT NULL,
	"unit" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meter_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "place_presence" (
	"household_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"state" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "place_presence_place_id_member_id_pk" PRIMARY KEY("place_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "place_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "place_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"subscriber_member_id" uuid NOT NULL,
	"target_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_subscriptions_uq" UNIQUE NULLS NOT DISTINCT("place_id","subscriber_member_id","target_member_id")
);
--> statement-breakpoint
ALTER TABLE "place_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer DEFAULT 100 NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "school_holiday_cache" (
	"state" text NOT NULL,
	"year" integer NOT NULL,
	"holidays" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_holiday_cache_state_year_pk" PRIMARY KEY("state","year")
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"state" text,
	"ab_week_anchor" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timetable_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"period" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"subject" text NOT NULL,
	"room" text,
	"teacher" text,
	"valid_from" date,
	"valid_to" date,
	"week" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timetable_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vaccinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"vaccine" text NOT NULL,
	"given_on" date NOT NULL,
	"dose" text,
	"next_due_on" date,
	"doctor_contact_id" uuid,
	"batch" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vaccinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vault_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"holder_member_id" uuid,
	"issuer" text,
	"number_encrypted" text,
	"number_last4" text,
	"issued_on" date,
	"expires_on" date,
	"notes" text,
	"file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"reminder_lead_days" integer[],
	"visibility" text DEFAULT 'household' NOT NULL,
	"shared_with" uuid[],
	"owner_member_id" uuid NOT NULL,
	"ocr_status" text DEFAULT 'none' NOT NULL,
	"ocr_text" text,
	"ocr_suggestions" jsonb,
	"ocr_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('german'::regconfig, coalesce(title, '') || ' ' || coalesce(issuer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(ocr_text, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assistant_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_text" text,
	"message" text,
	"actions" jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assistant_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assistant_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assistant_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp with time zone,
	"consented_by_member_id" uuid,
	"disabled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_subscription_events" (
	"household_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"event_id" uuid NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "calendar_subscription_events_subscription_id_uid_pk" PRIMARY KEY("subscription_id","uid")
);
--> statement-breakpoint
ALTER TABLE "calendar_subscription_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url_enc" text NOT NULL,
	"url_host" text NOT NULL,
	"refresh_minutes" integer DEFAULT 360 NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"next_fetch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_notified_at" timestamp with time zone,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"google_calendar_id" text NOT NULL,
	"member_id" uuid NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"sync_token" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_notified_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_event_links" (
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"etag" text,
	"google_updated_at" timestamp with time zone NOT NULL,
	"local_updated_at" timestamp with time zone NOT NULL,
	"exceptions_hash" text DEFAULT '' NOT NULL,
	CONSTRAINT "google_event_links_connection_id_event_id_pk" PRIMARY KEY("connection_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "google_event_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_contracts" ADD CONSTRAINT "fin_contracts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_contracts" ADD CONSTRAINT "fin_contracts_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_contracts" ADD CONSTRAINT "fin_contracts_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_expense_parties" ADD CONSTRAINT "fin_expense_parties_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_expense_shares" ADD CONSTRAINT "fin_expense_shares_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_expense_shares" ADD CONSTRAINT "fin_expense_shares_expense_id_fin_shared_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."fin_shared_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_expense_shares" ADD CONSTRAINT "fin_expense_shares_party_id_fin_expense_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."fin_expense_parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_goal_contributions" ADD CONSTRAINT "fin_goal_contributions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_goal_contributions" ADD CONSTRAINT "fin_goal_contributions_goal_id_fin_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."fin_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_goals" ADD CONSTRAINT "fin_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_goals" ADD CONSTRAINT "fin_goals_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_settlements" ADD CONSTRAINT "fin_settlements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_settlements" ADD CONSTRAINT "fin_settlements_from_party_id_fin_expense_parties_id_fk" FOREIGN KEY ("from_party_id") REFERENCES "public"."fin_expense_parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_settlements" ADD CONSTRAINT "fin_settlements_to_party_id_fin_expense_parties_id_fk" FOREIGN KEY ("to_party_id") REFERENCES "public"."fin_expense_parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_shared_expenses" ADD CONSTRAINT "fin_shared_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_shared_expenses" ADD CONSTRAINT "fin_shared_expenses_paid_by_party_id_fin_expense_parties_id_fk" FOREIGN KEY ("paid_by_party_id") REFERENCES "public"."fin_expense_parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_shared_expenses" ADD CONSTRAINT "fin_shared_expenses_transaction_id_fin_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."fin_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_items" ADD CONSTRAINT "album_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_items" ADD CONSTRAINT "album_items_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_items" ADD CONSTRAINT "album_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger" ADD CONSTRAINT "allowance_ledger_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger" ADD CONSTRAINT "allowance_ledger_rule_id_allowance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."allowance_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_rules" ADD CONSTRAINT "allowance_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reactions" ADD CONSTRAINT "board_reactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reactions" ADD CONSTRAINT "board_reactions_post_id_board_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_points" ADD CONSTRAINT "reward_points_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_points" ADD CONSTRAINT "reward_points_redemption_id_reward_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."reward_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_finance_category_id_fin_categories_id_fk" FOREIGN KEY ("finance_category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_finance_account_id_fin_accounts_id_fk" FOREIGN KEY ("finance_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_packing_list_id_lists_id_fk" FOREIGN KEY ("packing_list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkup_records" ADD CONSTRAINT "checkup_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_cards" ADD CONSTRAINT "emergency_cards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_cards" ADD CONSTRAINT "emergency_cards_doctor_contact_id_contacts_id_fk" FOREIGN KEY ("doctor_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_shares" ADD CONSTRAINT "location_shares_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_presence" ADD CONSTRAINT "place_presence_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_presence" ADD CONSTRAINT "place_presence_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_subscriptions" ADD CONSTRAINT "place_subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_subscriptions" ADD CONSTRAINT "place_subscriptions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_doctor_contact_id_contacts_id_fk" FOREIGN KEY ("doctor_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_requests" ADD CONSTRAINT "assistant_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD CONSTRAINT "assistant_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscription_events" ADD CONSTRAINT "calendar_subscription_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscription_events" ADD CONSTRAINT "calendar_subscription_events_subscription_id_calendar_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."calendar_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscription_events" ADD CONSTRAINT "calendar_subscription_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_links" ADD CONSTRAINT "google_event_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_links" ADD CONSTRAINT "google_event_links_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_links" ADD CONSTRAINT "google_event_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_access_household_idx" ON "support_access_grants" USING btree ("household_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_external_uq" ON "bank_accounts" USING btree ("connection_id","external_key");--> statement-breakpoint
CREATE INDEX "bank_connections_household_idx" ON "bank_connections" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_state_uq" ON "bank_connections" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "fin_contracts_household_idx" ON "fin_contracts" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_expense_parties_member_uq" ON "fin_expense_parties" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_expense_shares_uq" ON "fin_expense_shares" USING btree ("expense_id","party_id");--> statement-breakpoint
CREATE INDEX "fin_goal_contributions_goal_idx" ON "fin_goal_contributions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "fin_goals_household_idx" ON "fin_goals" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "fin_settlements_household_idx" ON "fin_settlements" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "fin_shared_expenses_household_idx" ON "fin_shared_expenses" USING btree ("household_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "album_items_file_uq" ON "album_items" USING btree ("album_id","file_id");--> statement-breakpoint
CREATE INDEX "album_items_album_idx" ON "album_items" USING btree ("album_id","position");--> statement-breakpoint
CREATE INDEX "album_items_taken_idx" ON "album_items" USING btree ("household_id","taken_at");--> statement-breakpoint
CREATE INDEX "albums_household_idx" ON "albums" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "allowance_ledger_member_idx" ON "allowance_ledger" USING btree ("household_id","member_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "allowance_ledger_period_uq" ON "allowance_ledger" USING btree ("rule_id","period_key") WHERE rule_id is not null and period_key is not null;--> statement-breakpoint
CREATE INDEX "allowance_rules_household_idx" ON "allowance_rules" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "board_posts_feed_idx" ON "board_posts" USING btree ("household_id","pinned","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "board_reactions_uq" ON "board_reactions" USING btree ("post_id","member_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plan_entries_slot_uq" ON "meal_plan_entries" USING btree ("household_id","date","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_uq" ON "poll_votes" USING btree ("poll_id","member_id","option_index");--> statement-breakpoint
CREATE INDEX "polls_household_idx" ON "polls" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "recipes_household_idx" ON "recipes" USING btree ("household_id","title");--> statement-breakpoint
CREATE INDEX "reward_points_member_idx" ON "reward_points" USING btree ("household_id","member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_points_task_uq" ON "reward_points" USING btree ("task_id") WHERE task_id is not null;--> statement-breakpoint
CREATE INDEX "reward_redemptions_household_idx" ON "reward_redemptions" USING btree ("household_id","status","created_at");--> statement-breakpoint
CREATE INDEX "rewards_household_idx" ON "rewards" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "trip_items_trip_idx" ON "trip_items" USING btree ("trip_id","start_at");--> statement-breakpoint
CREATE INDEX "trips_household_idx" ON "trips" USING btree ("household_id","start_date");--> statement-breakpoint
CREATE INDEX "assets_household_idx" ON "assets" USING btree ("household_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "checkup_records_uq" ON "checkup_records" USING btree ("household_id","member_id","code");--> statement-breakpoint
CREATE INDEX "contacts_household_idx" ON "contacts" USING btree ("household_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_cards_member_uq" ON "emergency_cards" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "location_pings_member_idx" ON "location_pings" USING btree ("household_id","member_id","at");--> statement-breakpoint
CREATE INDEX "location_pings_at_idx" ON "location_pings" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "location_shares_member_uq" ON "location_shares" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "maintenance_logs_plan_idx" ON "maintenance_logs" USING btree ("household_id","plan_id");--> statement-breakpoint
CREATE INDEX "maintenance_plans_asset_idx" ON "maintenance_plans" USING btree ("household_id","asset_id");--> statement-breakpoint
CREATE INDEX "maintenance_plans_due_idx" ON "maintenance_plans" USING btree ("next_due_on");--> statement-breakpoint
CREATE INDEX "medications_member_idx" ON "medications" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "meter_readings_asset_idx" ON "meter_readings" USING btree ("household_id","asset_id","meter_type","read_at");--> statement-breakpoint
CREATE INDEX "places_household_idx" ON "places" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "timetable_member_idx" ON "timetable_entries" USING btree ("household_id","member_id","weekday");--> statement-breakpoint
CREATE INDEX "vaccinations_member_idx" ON "vaccinations" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "vault_documents_household_idx" ON "vault_documents" USING btree ("household_id","type");--> statement-breakpoint
CREATE INDEX "vault_documents_expiry_idx" ON "vault_documents" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "vault_documents_search_idx" ON "vault_documents" USING gin ("search");--> statement-breakpoint
CREATE INDEX "assistant_proposals_household_idx" ON "assistant_proposals" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_requests_household_idx" ON "assistant_requests" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_subscriptions_calendar_uq" ON "calendar_subscriptions" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_subscriptions_due_idx" ON "calendar_subscriptions" USING btree ("next_fetch_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_connections_calendar_uq" ON "google_calendar_connections" USING btree ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_event_links_google_uq" ON "google_event_links" USING btree ("connection_id","google_event_id");--> statement-breakpoint
CREATE POLICY "support_access_grants_tenant_isolation" ON "support_access_grants" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "bank_accounts_tenant_isolation" ON "bank_accounts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "bank_connections_tenant_isolation" ON "bank_connections" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_contracts_tenant_isolation" ON "fin_contracts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_expense_parties_tenant_isolation" ON "fin_expense_parties" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_expense_shares_tenant_isolation" ON "fin_expense_shares" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_goal_contributions_tenant_isolation" ON "fin_goal_contributions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_goals_tenant_isolation" ON "fin_goals" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_settlements_tenant_isolation" ON "fin_settlements" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "fin_shared_expenses_tenant_isolation" ON "fin_shared_expenses" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "album_items_tenant_isolation" ON "album_items" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "albums_tenant_isolation" ON "albums" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "allowance_ledger_tenant_isolation" ON "allowance_ledger" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "allowance_rules_tenant_isolation" ON "allowance_rules" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "board_posts_tenant_isolation" ON "board_posts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "board_reactions_tenant_isolation" ON "board_reactions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "meal_plan_entries_tenant_isolation" ON "meal_plan_entries" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "poll_votes_tenant_isolation" ON "poll_votes" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "polls_tenant_isolation" ON "polls" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "recipes_tenant_isolation" ON "recipes" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "reward_points_tenant_isolation" ON "reward_points" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "reward_redemptions_tenant_isolation" ON "reward_redemptions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "rewards_tenant_isolation" ON "rewards" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "trip_items_tenant_isolation" ON "trip_items" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "trips_tenant_isolation" ON "trips" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assets_tenant_isolation" ON "assets" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "checkup_records_tenant_isolation" ON "checkup_records" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "contacts_tenant_isolation" ON "contacts" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "emergency_cards_tenant_isolation" ON "emergency_cards" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "location_pings_tenant_isolation" ON "location_pings" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "location_shares_tenant_isolation" ON "location_shares" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "maintenance_logs_tenant_isolation" ON "maintenance_logs" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "maintenance_plans_tenant_isolation" ON "maintenance_plans" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "medications_tenant_isolation" ON "medications" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "meter_readings_tenant_isolation" ON "meter_readings" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "place_presence_tenant_isolation" ON "place_presence" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "place_subscriptions_tenant_isolation" ON "place_subscriptions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "places_tenant_isolation" ON "places" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "school_settings_tenant_isolation" ON "school_settings" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "timetable_entries_tenant_isolation" ON "timetable_entries" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "vaccinations_tenant_isolation" ON "vaccinations" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "vault_documents_tenant_isolation" ON "vault_documents" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assistant_proposals_tenant_isolation" ON "assistant_proposals" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assistant_requests_tenant_isolation" ON "assistant_requests" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assistant_settings_tenant_isolation" ON "assistant_settings" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "calendar_subscription_events_tenant_isolation" ON "calendar_subscription_events" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "calendar_subscriptions_tenant_isolation" ON "calendar_subscriptions" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "google_calendar_connections_tenant_isolation" ON "google_calendar_connections" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "google_event_links_tenant_isolation" ON "google_event_links" AS PERMISSIVE FOR ALL TO "fp_app" USING ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK ("household_id" = nullif(current_setting('app.household_id', true), '')::uuid);