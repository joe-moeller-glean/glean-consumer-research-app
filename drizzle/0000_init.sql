CREATE TYPE "public"."analysis_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('VALIDATING', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."family_makeup" AS ENUM('SINGLE_NO_KIDS', 'SINGLE_WITH_KIDS', 'COUPLE_NO_KIDS', 'COUPLE_WITH_KIDS', 'MULTIGENERATIONAL', 'ROOMMATES', 'OTHER', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('CSV', 'ZIP');--> statement-breakpoint
CREATE TYPE "public"."income_band" AS ENUM('UNDER_25K', 'K25_50K', 'K50_75K', 'K75_100K', 'K100_150K', 'K150_200K', 'OVER_200K', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
CREATE TYPE "public"."race" AS ENUM('AMERICAN_INDIAN_ALASKA_NATIVE', 'ASIAN', 'BLACK_AFRICAN_AMERICAN', 'NATIVE_HAWAIIAN_PACIFIC_ISLANDER', 'WHITE', 'MULTIRACIAL', 'OTHER', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'RESEARCHER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('LIKE', 'DISLIKE', 'INDIFFERENT');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('MALE', 'FEMALE', 'NONBINARY', 'OTHER', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('DRAFT', 'COLLECTING', 'PROCESSING', 'ANALYZED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('UPLOADED', 'PARSING', 'PARSED', 'PROCESSING', 'COMPLETE', 'FAILED');--> statement-breakpoint
CREATE TABLE "leg_panelists" (
	"leg_id" uuid NOT NULL,
	"panelist_id" uuid NOT NULL,
	"role" varchar(100),
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leg_panelists_leg_id_panelist_id_pk" PRIMARY KEY("leg_id","panelist_id")
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"description" text,
	"test_variant" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panelists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelist_id" varchar(100) NOT NULL,
	"age" integer,
	"sex" "sex",
	"race" "race",
	"country" varchar(120),
	"state" varchar(120),
	"city" varchar(160),
	"household_income" "income_band",
	"family_makeup" "family_makeup",
	"household_size" integer,
	"children_count" integer,
	"notes" text,
	"is_stub" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panelists_panelist_id_unique" UNIQUE("panelist_id")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"leg_id" uuid NOT NULL,
	"study_data_id" uuid NOT NULL,
	"panelist_id" uuid,
	"panelist_external_id" varchar(100),
	"question" text,
	"feedback_text" text NOT NULL,
	"structured_attrs" jsonb,
	"sentiment" "sentiment",
	"sentiment_score" real,
	"sentiment_model" varchar(300),
	"sentiment_overridden" boolean DEFAULT false NOT NULL,
	"flagged_for_review" boolean DEFAULT false NOT NULL,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"study_data_id" uuid,
	"fireworks_job_id" varchar(300),
	"input_dataset_id" varchar(300),
	"output_dataset_id" varchar(300),
	"request_count" integer DEFAULT 0 NOT NULL,
	"status" "batch_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"continued_from_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(300) NOT NULL,
	"product" varchar(300) NOT NULL,
	"product_version" varchar(100) NOT NULL,
	"test_criteria" text NOT NULL,
	"description" text,
	"category" varchar(200),
	"status" "study_status" DEFAULT 'DRAFT' NOT NULL,
	"target_panel_size" integer,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'PENDING' NOT NULL,
	"input_json" jsonb,
	"output_text" text,
	"model" varchar(300),
	"error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "study_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"leg_id" uuid NOT NULL,
	"original_filename" varchar(500) NOT NULL,
	"stored_filename" varchar(700) NOT NULL,
	"storage_path" text NOT NULL,
	"file_type" "file_type" DEFAULT 'CSV' NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"row_count" integer,
	"checksum" varchar(128),
	"status" "upload_status" DEFAULT 'UPLOADED' NOT NULL,
	"error" text,
	"uploaded_by_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_panelists" (
	"study_id" uuid NOT NULL,
	"panelist_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_panelists_study_id_panelist_id_pk" PRIMARY KEY("study_id","panelist_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"password_hash" text,
	"role" "role" DEFAULT 'RESEARCHER' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "leg_panelists" ADD CONSTRAINT "leg_panelists_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leg_panelists" ADD CONSTRAINT "leg_panelists_panelist_id_panelists_id_fk" FOREIGN KEY ("panelist_id") REFERENCES "public"."panelists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_study_data_id_study_data_id_fk" FOREIGN KEY ("study_data_id") REFERENCES "public"."study_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_panelist_id_panelists_id_fk" FOREIGN KEY ("panelist_id") REFERENCES "public"."panelists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_batches" ADD CONSTRAINT "sentiment_batches_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_batches" ADD CONSTRAINT "sentiment_batches_study_data_id_study_data_id_fk" FOREIGN KEY ("study_data_id") REFERENCES "public"."study_data"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_analyses" ADD CONSTRAINT "study_analyses_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_analyses" ADD CONSTRAINT "study_analyses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_data" ADD CONSTRAINT "study_data_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_data" ADD CONSTRAINT "study_data_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_data" ADD CONSTRAINT "study_data_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_panelists" ADD CONSTRAINT "study_panelists_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_panelists" ADD CONSTRAINT "study_panelists_panelist_id_panelists_id_fk" FOREIGN KEY ("panelist_id") REFERENCES "public"."panelists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legs_study_idx" ON "legs" USING btree ("study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "panelists_panelist_id_idx" ON "panelists" USING btree ("panelist_id");--> statement-breakpoint
CREATE INDEX "responses_study_idx" ON "responses" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "responses_leg_idx" ON "responses" USING btree ("leg_id");--> statement-breakpoint
CREATE INDEX "responses_panelist_idx" ON "responses" USING btree ("panelist_id");--> statement-breakpoint
CREATE INDEX "responses_sentiment_idx" ON "responses" USING btree ("sentiment");--> statement-breakpoint
CREATE UNIQUE INDEX "sentiment_batches_job_idx" ON "sentiment_batches" USING btree ("fireworks_job_id");--> statement-breakpoint
CREATE INDEX "sentiment_batches_study_idx" ON "sentiment_batches" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "studies_status_idx" ON "studies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studies_product_idx" ON "studies" USING btree ("product");--> statement-breakpoint
CREATE INDEX "study_analyses_study_idx" ON "study_analyses" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "study_data_study_idx" ON "study_data" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "study_data_leg_idx" ON "study_data" USING btree ("leg_id");