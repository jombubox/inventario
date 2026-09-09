import "server-only";

import { desc } from "drizzle-orm";

import type { Database } from "@/db/connection";

export async function listRecentImportJobs(db: Database, limit = 25) {
  return db.query.importJobs.findMany({
    columns: {
      id: true,
      filename: true,
      status: true,
      totalRows: true,
      successfulRows: true,
      warningRows: true,
      failedRows: true,
      forceDuplicate: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: (jobs) => desc(jobs.createdAt),
    limit: Math.min(100, Math.max(1, limit)),
  });
}
