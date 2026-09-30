CREATE TABLE "product_serial_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"serial_number" text NOT NULL,
	"normalized_serial_number" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_serial_numbers_product_normalized_unique" UNIQUE("product_id","normalized_serial_number"),
	CONSTRAINT "product_serial_numbers_kind_valid" CHECK ("product_serial_numbers"."kind" in ('PRIMARY', 'SECONDARY')),
	CONSTRAINT "product_serial_numbers_serial_not_blank" CHECK (length(btrim("product_serial_numbers"."serial_number")) > 0),
	CONSTRAINT "product_serial_numbers_normalized_not_blank" CHECK (length(btrim("product_serial_numbers"."normalized_serial_number")) > 0),
	CONSTRAINT "product_serial_numbers_sort_order_non_negative" CHECK ("product_serial_numbers"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_serial_numbers" ADD CONSTRAINT "product_serial_numbers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "product_serial_numbers_one_primary_per_product" ON "product_serial_numbers" USING btree ("product_id") WHERE "product_serial_numbers"."kind" = 'PRIMARY';--> statement-breakpoint
CREATE INDEX "product_serial_numbers_product_sort_idx" ON "product_serial_numbers" USING btree ("product_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "product_serial_numbers_normalized_idx" ON "product_serial_numbers" USING btree ("normalized_serial_number");