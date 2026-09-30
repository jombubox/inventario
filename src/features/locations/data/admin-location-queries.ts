import { asc, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { inventoryItems, locations } from "@/db/schema";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";

export async function listAdminLocations(db: Database) {
  const rows = await db
    .select()
    .from(locations)
    .orderBy(asc(locations.name))
    .limit(1000);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const stockRows = rows.length > 0
    ? await db
        .select({
          locationId: inventoryItems.locationId,
          inventoryRecords: sql<number>`count(*)::int`,
          activeUnits: sql<number>`coalesce(sum(case when ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED') then ${inventoryItems.quantity} else 0 end), 0)::int`,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.locationId, rows.map((row) => row.id)))
        .groupBy(inventoryItems.locationId)
    : [];
  const stockByLocation = new Map(
    stockRows.map((row) => [row.locationId, row]),
  );
  const depthOf = (id: string): number => {
    let depth = 0;
    let current = byId.get(id);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      depth += 1;
      current = byId.get(current.parentId);
    }
    return depth;
  };

  return rows
    .map((row) => ({
      ...row,
      depth: depthOf(row.id),
      breadcrumb: buildLocationBreadcrumb(row.id, rows),
      inventoryRecords: stockByLocation.get(row.id)?.inventoryRecords ?? 0,
      activeUnits: stockByLocation.get(row.id)?.activeUnits ?? 0,
    }))
    .sort((left, right) => left.breadcrumb.localeCompare(right.breadcrumb, "es"));
}
