import "server-only";

import { cache } from "react";

import { createDatabaseClient } from "@/db/connection";
import { getServerEnv } from "@/lib/env";

const getRequestDatabase = cache(() => {
  return createDatabaseClient(getServerEnv().DATABASE_URL);
});

let localDatabase: ReturnType<typeof createDatabaseClient> | undefined;

export function getDb() {
  if (process.env.NEON_LOCAL_WS_PROXY) {
    localDatabase ??= createDatabaseClient(getServerEnv().DATABASE_URL);
    return localDatabase;
  }
  return getRequestDatabase();
}
