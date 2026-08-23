CREATE TABLE "operational_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "operational_rate_limits_count_positive" CHECK ("operational_rate_limits"."count" > 0),
	CONSTRAINT "operational_rate_limits_key_not_blank" CHECK (length(btrim("operational_rate_limits"."key")) > 0)
);
--> statement-breakpoint
CREATE INDEX "operational_rate_limits_window_idx" ON "operational_rate_limits" USING btree ("window_started_at");--> statement-breakpoint
CREATE INDEX "inventory_items_product_status_idx" ON "inventory_items" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "products_public_updated_at_idx" ON "products" USING btree ("updated_at" DESC NULLS LAST) WHERE "products"."status" = 'ACTIVE' and "products"."is_public" = true and "products"."deleted_at" is null;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "products_sku_trgm_idx" ON "products" USING gin ("sku" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "products_title_trgm_idx" ON "products" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "products_part_number_trgm_idx" ON "products" USING gin ("part_number" gin_trgm_ops) WHERE "part_number" is not null;
--> statement-breakpoint
CREATE INDEX "product_compatibilities_model_trgm_idx" ON "product_compatibilities" USING gin ("model" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "component_types_name_trgm_idx" ON "component_types" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "inventory_items_code_trgm_idx" ON "inventory_items" USING gin ("inventory_code" gin_trgm_ops);
