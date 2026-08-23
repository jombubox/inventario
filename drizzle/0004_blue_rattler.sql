CREATE TABLE "import_job_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"action" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_data" jsonb,
	"normalized_data" jsonb,
	"product_id" uuid,
	"inventory_item_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_job_rows_job_row_unique" UNIQUE("import_job_id","row_number"),
	CONSTRAINT "import_job_rows_row_number_positive" CHECK ("import_job_rows"."row_number" > 0),
	CONSTRAINT "import_job_rows_status_not_blank" CHECK (length(btrim("import_job_rows"."status")) > 0),
	CONSTRAINT "import_job_rows_action_not_blank" CHECK (length(btrim("import_job_rows"."action")) > 0),
	CONSTRAINT "import_job_rows_fingerprint_not_blank" CHECK (length(btrim("import_job_rows"."fingerprint")) > 0)
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "force_duplicate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "started_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "completed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "import_job_rows_fingerprint_idx" ON "import_job_rows" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "import_job_rows_status_idx" ON "import_job_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_job_rows_product_id_idx" ON "import_job_rows" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "import_job_rows_inventory_item_id_idx" ON "import_job_rows" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "import_jobs_file_hash_idx" ON "import_jobs" USING btree ("file_hash");