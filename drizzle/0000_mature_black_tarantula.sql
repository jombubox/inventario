CREATE TYPE "public"."import_job_status" AS ENUM('PENDING', 'PREVIEWED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_condition" AS ENUM('NEW', 'USED_EXCELLENT', 'USED_GOOD', 'USED_FAIR', 'FOR_PARTS', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('INITIAL', 'IN', 'OUT', 'MOVE', 'ADJUSTMENT', 'SALE', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."inventory_status" AS ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED', 'SCRAPPED');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('WAREHOUSE', 'ZONE', 'SHELF', 'BOX', 'BAG', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE SEQUENCE "public"."inventory_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "brand_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_aliases_normalized_alias_unique" UNIQUE("normalized_alias"),
	CONSTRAINT "brand_aliases_alias_not_blank" CHECK (length(btrim("brand_aliases"."alias")) > 0),
	CONSTRAINT "brand_aliases_normalized_alias_not_blank" CHECK (length(btrim("brand_aliases"."normalized_alias")) > 0)
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "brands_code_unique" UNIQUE("code"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug"),
	CONSTRAINT "brands_name_not_blank" CHECK (length(btrim("brands"."name")) > 0),
	CONSTRAINT "brands_normalized_name_not_blank" CHECK (length(btrim("brands"."normalized_name")) > 0),
	CONSTRAINT "brands_code_format" CHECK ("brands"."code" ~ '^[A-Z0-9]{2,8}$'),
	CONSTRAINT "brands_slug_format" CHECK ("brands"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "component_type_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_type_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_type_aliases_normalized_alias_unique" UNIQUE("normalized_alias"),
	CONSTRAINT "component_type_aliases_alias_not_blank" CHECK (length(btrim("component_type_aliases"."alias")) > 0),
	CONSTRAINT "component_type_aliases_normalized_alias_not_blank" CHECK (length(btrim("component_type_aliases"."normalized_alias")) > 0)
);
--> statement-breakpoint
CREATE TABLE "component_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_types_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "component_types_code_unique" UNIQUE("code"),
	CONSTRAINT "component_types_slug_unique" UNIQUE("slug"),
	CONSTRAINT "component_types_name_not_blank" CHECK (length(btrim("component_types"."name")) > 0),
	CONSTRAINT "component_types_normalized_name_not_blank" CHECK (length(btrim("component_types"."normalized_name")) > 0),
	CONSTRAINT "component_types_code_format" CHECK ("component_types"."code" ~ '^[A-Z0-9]{2,8}$'),
	CONSTRAINT "component_types_slug_format" CHECK ("component_types"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_code" text DEFAULT 'INV-' || lpad(nextval('inventory_code_seq')::text, 6, '0') NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" "inventory_condition" DEFAULT 'UNKNOWN' NOT NULL,
	"status" "inventory_status" DEFAULT 'AVAILABLE' NOT NULL,
	"acquired_at" date,
	"acquisition_source" text,
	"purchase_cost" numeric(12, 2),
	"notes" text,
	"legacy_bag_number" text,
	"legacy_location_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_inventory_code_unique" UNIQUE("inventory_code"),
	CONSTRAINT "inventory_items_inventory_code_format" CHECK ("inventory_items"."inventory_code" ~ '^INV-[0-9]{6,}$'),
	CONSTRAINT "inventory_items_quantity_non_negative" CHECK ("inventory_items"."quantity" >= 0),
	CONSTRAINT "inventory_items_quantity_status_consistency" CHECK ((("inventory_items"."status" in ('AVAILABLE', 'RESERVED', 'DAMAGED')) and "inventory_items"."quantity" > 0) or (("inventory_items"."status" in ('SOLD', 'SCRAPPED')) and "inventory_items"."quantity" = 0)),
	CONSTRAINT "inventory_items_purchase_cost_non_negative" CHECK ("inventory_items"."purchase_cost" is null or "inventory_items"."purchase_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"user_id" uuid,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_quantity_positive" CHECK ("inventory_movements"."quantity" > 0),
	CONSTRAINT "inventory_movements_reason_not_blank" CHECK (length(btrim("inventory_movements"."reason")) > 0),
	CONSTRAINT "inventory_movements_locations_different" CHECK ("inventory_movements"."from_location_id" is null or "inventory_movements"."to_location_id" is null or "inventory_movements"."from_location_id" <> "inventory_movements"."to_location_id"),
	CONSTRAINT "inventory_movements_move_locations_required" CHECK ("inventory_movements"."type" <> 'MOVE' or ("inventory_movements"."from_location_id" is not null and "inventory_movements"."to_location_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "location_type" NOT NULL,
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code"),
	CONSTRAINT "locations_code_not_blank" CHECK (length(btrim("locations"."code")) > 0),
	CONSTRAINT "locations_name_not_blank" CHECK (length(btrim("locations"."name")) > 0),
	CONSTRAINT "locations_not_own_parent" CHECK ("locations"."parent_id" is null or "locations"."parent_id" <> "locations"."id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_action_not_blank" CHECK (length(btrim("audit_logs"."action")) > 0),
	CONSTRAINT "audit_logs_entity_type_not_blank" CHECK (length(btrim("audit_logs"."entity_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"status" "import_job_status" DEFAULT 'PENDING' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"successful_rows" integer DEFAULT 0 NOT NULL,
	"warning_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_jobs_filename_not_blank" CHECK (length(btrim("import_jobs"."filename")) > 0),
	CONSTRAINT "import_jobs_row_counts_non_negative" CHECK ("import_jobs"."total_rows" >= 0 and "import_jobs"."successful_rows" >= 0 and "import_jobs"."warning_rows" >= 0 and "import_jobs"."failed_rows" >= 0),
	CONSTRAINT "import_jobs_row_counts_within_total" CHECK ("import_jobs"."successful_rows" + "import_jobs"."warning_rows" + "import_jobs"."failed_rows" <= "import_jobs"."total_rows")
);
--> statement-breakpoint
CREATE TABLE "product_compatibilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"model" text NOT NULL,
	"normalized_model" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_compatibilities_product_brand_model_unique" UNIQUE("product_id","brand_id","normalized_model"),
	CONSTRAINT "product_compatibilities_model_not_blank" CHECK (length(btrim("product_compatibilities"."model")) > 0),
	CONSTRAINT "product_compatibilities_normalized_model_not_blank" CHECK (length(btrim("product_compatibilities"."normalized_model")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"storage_key" text,
	"url" text,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_provider_not_blank" CHECK (length(btrim("product_images"."provider")) > 0),
	CONSTRAINT "product_images_sort_order_non_negative" CHECK ("product_images"."sort_order" >= 0),
	CONSTRAINT "product_images_locator_required" CHECK (num_nonnulls("product_images"."external_id", "product_images"."storage_key", "product_images"."url") >= 1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"slug" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"component_type_id" uuid NOT NULL,
	"part_number" text,
	"normalized_part_number" text,
	"title" text NOT NULL,
	"description" text,
	"sale_price" numeric(12, 2),
	"currency" char(3) DEFAULT 'MXN' NOT NULL,
	"status" "product_status" DEFAULT 'DRAFT' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_sku_format" CHECK ("products"."sku" ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "products_title_not_blank" CHECK (length(btrim("products"."title")) > 0),
	CONSTRAINT "products_part_number_pair" CHECK (("products"."part_number" is null and "products"."normalized_part_number" is null) or ("products"."part_number" is not null and "products"."normalized_part_number" is not null and length(btrim("products"."normalized_part_number")) > 0)),
	CONSTRAINT "products_sale_price_non_negative" CHECK ("products"."sale_price" is null or "products"."sale_price" >= 0),
	CONSTRAINT "products_currency_format" CHECK ("products"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "brand_aliases" ADD CONSTRAINT "brand_aliases_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "component_type_aliases" ADD CONSTRAINT "component_type_aliases_component_type_id_component_types_id_fk" FOREIGN KEY ("component_type_id") REFERENCES "public"."component_types"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_compatibilities" ADD CONSTRAINT "product_compatibilities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_compatibilities" ADD CONSTRAINT "product_compatibilities_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_component_type_id_component_types_id_fk" FOREIGN KEY ("component_type_id") REFERENCES "public"."component_types"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "brand_aliases_brand_id_idx" ON "brand_aliases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brands_active_idx" ON "brands" USING btree ("active");--> statement-breakpoint
CREATE INDEX "component_type_aliases_component_type_id_idx" ON "component_type_aliases" USING btree ("component_type_id");--> statement-breakpoint
CREATE INDEX "component_types_active_idx" ON "component_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "inventory_items_product_id_idx" ON "inventory_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_items_location_id_idx" ON "inventory_items" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_items_status_idx" ON "inventory_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_items_legacy_location_code_idx" ON "inventory_items" USING btree ("legacy_location_code");--> statement-breakpoint
CREATE INDEX "inventory_movements_inventory_item_created_idx" ON "inventory_movements" USING btree ("inventory_item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movements_from_location_id_idx" ON "inventory_movements" USING btree ("from_location_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_to_location_id_idx" ON "inventory_movements" USING btree ("to_location_id");--> statement-breakpoint
CREATE INDEX "locations_parent_id_idx" ON "locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "locations_type_active_idx" ON "locations" USING btree ("type","active");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_jobs_status_created_idx" ON "import_jobs" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "import_jobs_created_by_idx" ON "import_jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "product_compatibilities_brand_id_idx" ON "product_compatibilities" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "product_compatibilities_normalized_model_idx" ON "product_compatibilities" USING btree ("normalized_model");--> statement-breakpoint
CREATE INDEX "product_images_product_sort_idx" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary_per_product" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_provider_external_id_unique" ON "product_images" USING btree ("provider","external_id") WHERE "product_images"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_component_type_id_idx" ON "products" USING btree ("component_type_id");--> statement-breakpoint
CREATE INDEX "products_normalized_part_number_idx" ON "products" USING btree ("normalized_part_number");--> statement-breakpoint
CREATE INDEX "products_duplicate_candidate_idx" ON "products" USING btree ("brand_id","component_type_id","normalized_part_number") WHERE "products"."normalized_part_number" is not null and "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_public_catalog_idx" ON "products" USING btree ("status","is_public") WHERE "products"."deleted_at" is null;