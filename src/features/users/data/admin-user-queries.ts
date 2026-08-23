import { desc } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { user } from "@/db/schema";

export function listAdministrativeUsers(db: Database) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
}
