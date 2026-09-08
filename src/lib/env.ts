import "server-only";

import {
  parseDatabaseEnv,
  parseServerEnv,
  type DatabaseEnv,
  type ServerEnv,
} from "@/lib/env-schema";

export type { DatabaseEnv, ServerEnv } from "@/lib/env-schema";

export function getDatabaseEnv(): DatabaseEnv {
  return parseDatabaseEnv(process.env);
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
