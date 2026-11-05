CREATE TABLE "sale_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"returned_quantity" integer DEFAULT 0 NOT NULL,
	"source" jsonb NOT NULL,
	"movement_id" uuid,
	CONSTRAINT "sale_allocations_item_source_unique" UNIQUE("sale_item_id","inventory_item_id"),
	CONSTRAINT "sale_allocations_movement_unique" UNIQUE("movement_id"),
	CONSTRAINT "sale_allocations_quantity_valid" CHECK ("sale_allocations"."quantity" between 1 and 10000 and "sale_allocations"."returned_quantity" between 0 and "sale_allocations"."quantity")
);
--> statement-breakpoint
CREATE TABLE "sale_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"type" text NOT NULL,
	"actor" text DEFAULT 'ADMIN' NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_events_idempotency_unique" UNIQUE("sale_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	CONSTRAINT "sale_items_money_valid" CHECK ("sale_items"."quantity" between 1 and 10000 and "sale_items"."unit_price_cents" between 0 and 2000000000 and "sale_items"."discount_cents" between 0 and "sale_items"."quantity"::bigint * "sale_items"."unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	"notes" text NOT NULL,
	"actor" text DEFAULT 'ADMIN' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_payments_key_unique" UNIQUE("sale_id","idempotency_key"),
	CONSTRAINT "sale_payments_amount_positive" CHECK ("sale_payments"."amount_cents" between 1 and 2000000000),
	CONSTRAINT "sale_payments_kind_valid" CHECK ("sale_payments"."kind" in ('PAYMENT','REFUND')),
	CONSTRAINT "sale_payments_method_valid" CHECK ("sale_payments"."method" in ('CASH','TRANSFER','CARD','MERCADO_PAGO','OTHER'))
);
--> statement-breakpoint
CREATE TABLE "sale_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"disposition" text NOT NULL,
	"restocked_inventory_item_id" uuid,
	"movement_id" uuid,
	CONSTRAINT "sale_return_items_allocation_unique" UNIQUE("return_id","allocation_id"),
	CONSTRAINT "sale_return_items_quantity_positive" CHECK ("sale_return_items"."quantity" between 1 and 10000),
	CONSTRAINT "sale_return_items_disposition_valid" CHECK ("sale_return_items"."disposition" in ('SELLABLE','DAMAGED','NONE'))
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"condition" text NOT NULL,
	"credit_cents" integer NOT NULL,
	"actor" text DEFAULT 'ADMIN' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_returns_credit_valid" CHECK ("sale_returns"."credit_cents" between 0 and 2000000000)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"customer" jsonb NOT NULL,
	"delivery" jsonb NOT NULL,
	"delivery_status" text DEFAULT 'PENDING' NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"item_discount_cents" integer NOT NULL,
	"order_discount_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"credited_cents" integer DEFAULT 0 NOT NULL,
	"notes" text NOT NULL,
	"actor" text DEFAULT 'ADMIN' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "sales_folio_unique" UNIQUE("folio"),
	CONSTRAINT "sales_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "sales_status_valid" CHECK ("sales"."status" in ('DRAFT','COMPLETED','CANCELLED')),
	CONSTRAINT "sales_delivery_valid" CHECK ("sales"."delivery_status" in ('PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED')),
	CONSTRAINT "sales_money_valid" CHECK ("sales"."currency" = 'MXN' and "sales"."subtotal_cents" >= 0 and "sales"."item_discount_cents" >= 0 and "sales"."order_discount_cents" >= 0 and "sales"."shipping_cents" >= 0 and "sales"."tax_cents" >= 0 and "sales"."total_cents" between 0 and 2000000000 and "sales"."credited_cents" between 0 and "sales"."total_cents" and "sales"."item_discount_cents" + "sales"."order_discount_cents" <= "sales"."subtotal_cents" and "sales"."total_cents" = "sales"."subtotal_cents"::bigint - "sales"."item_discount_cents" - "sales"."order_discount_cents" + "sales"."shipping_cents" + "sales"."tax_cents"),
	CONSTRAINT "sales_lifecycle_valid" CHECK (("sales"."status" = 'DRAFT' and "sales"."completed_at" is null and "sales"."cancelled_at" is null) or ("sales"."status" = 'COMPLETED' and "sales"."completed_at" is not null and "sales"."cancelled_at" is null) or ("sales"."status" = 'CANCELLED' and "sales"."cancelled_at" is not null and length(btrim("sales"."cancellation_reason")) >= 3 and "sales"."credited_cents" = "sales"."total_cents"))
);
--> statement-breakpoint
ALTER TABLE "sale_allocations" ADD CONSTRAINT "sale_allocations_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_allocations" ADD CONSTRAINT "sale_allocations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_allocations" ADD CONSTRAINT "sale_allocations_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_allocation_id_sale_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."sale_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_restocked_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("restocked_inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_allocations_source_idx" ON "sale_allocations" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "sale_events_sale_created_idx" ON "sale_events" USING btree ("sale_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_idx" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_date_idx" ON "sale_payments" USING btree ("sale_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sale_return_items_allocation_idx" ON "sale_return_items" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "sale_returns_sale_idx" ON "sale_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_created_idx" ON "sales" USING btree ("created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "sales_status_created_idx" ON "sales" USING btree ("status","created_at" DESC NULLS LAST);