import { timestamp } from "drizzle-orm/pg-core";

export function createdAtColumn() {
  return timestamp("created_at", { mode: "date", withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull();
}

export function updatedAtColumn() {
  return timestamp("updated_at", { mode: "date", withTimezone: true, precision: 3 })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
}
