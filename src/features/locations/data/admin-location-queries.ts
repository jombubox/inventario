import { asc } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { locations } from "@/db/schema";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";

export async function listAdminLocations(db: Database) {
  const rows = await db
    .select()
    .from(locations)
    .orderBy(asc(locations.name))
    .limit(1000);

  const byId = new Map(rows.map((row) => [row.id, row]));
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
    }))
    .sort((left, right) => left.breadcrumb.localeCompare(right.breadcrumb, "es"));
}
