-- Additive protections on sales tables only. No legacy row or definition is changed.
CREATE FUNCTION sales_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sales history is immutable; use an explicit return, cancellation or payment' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sale_items_immutable BEFORE UPDATE OR DELETE ON sale_items FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sale_payments_immutable BEFORE UPDATE OR DELETE ON sale_payments FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sale_returns_immutable BEFORE UPDATE OR DELETE ON sale_returns FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sale_return_items_immutable BEFORE UPDATE OR DELETE ON sale_return_items FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sale_events_immutable BEFORE UPDATE OR DELETE ON sale_events FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sales_no_delete BEFORE DELETE ON sales FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER sale_allocations_no_delete BEFORE DELETE ON sale_allocations FOR EACH ROW EXECUTE FUNCTION sales_reject_history_mutation();
--> statement-breakpoint
CREATE FUNCTION sales_guard_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','delivery','delivery_status','credited_cents','updated_at','completed_at','cancelled_at','cancellation_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','delivery','delivery_status','credited_cents','updated_at','completed_at','cancelled_at','cancellation_reason'])
    OR (NEW.delivery - ARRAY['carrier','tracking','estimatedDate','notes']) IS DISTINCT FROM (OLD.delivery - ARRAY['carrier','tracking','estimatedDate','notes'])
    OR NEW.credited_cents < OLD.credited_cents
    OR (OLD.status = 'COMPLETED' AND NEW.status NOT IN ('COMPLETED','CANCELLED'))
    OR (OLD.status = 'CANCELLED' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
    OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at)
  THEN RAISE EXCEPTION 'Sale snapshots and financial history are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sales_snapshot_guard BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION sales_guard_snapshot_update();
--> statement-breakpoint
CREATE FUNCTION sales_guard_allocation_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['returned_quantity','movement_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['returned_quantity','movement_id'])
    OR NEW.returned_quantity < OLD.returned_quantity
    OR (OLD.movement_id IS NOT NULL AND NEW.movement_id IS DISTINCT FROM OLD.movement_id)
  THEN RAISE EXCEPTION 'Stock allocations are immutable except for monotonic completion and returns' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sale_allocations_snapshot_guard BEFORE UPDATE ON sale_allocations FOR EACH ROW EXECUTE FUNCTION sales_guard_allocation_update();
