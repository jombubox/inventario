import "server-only";

import { cache } from "react";

import { createDatabaseClient } from "@/db/connection";
import { getDatabaseEnv } from "@/lib/env";

const getRequestDatabase = cache(() => {
  return createDatabaseClient(getDatabaseEnv().DATABASE_URL);
});

let localDatabase: ReturnType<typeof createDatabaseClient> | undefined;

export function getDb() {
  if (process.env.NEON_LOCAL_WS_PROXY) {
    localDatabase ??= createDatabaseClient(getDatabaseEnv().DATABASE_URL);
    return localDatabase;
  }
  return getRequestDatabase();
}
