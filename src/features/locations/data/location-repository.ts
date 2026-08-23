import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/db/executor";
import { locations } from "@/db/schema";

export function createLocationRepository(db: DatabaseExecutor) {
  return {
    findByCode(code: string) {
      return db.query.locations.findFirst({ where: eq(locations.code, code) });
    },

    listHierarchyNodes() {
      return db
        .select({ id: locations.id, name: locations.name, parentId: locations.parentId })
        .from(locations)
        .orderBy(asc(locations.name));
    },
  };
}
