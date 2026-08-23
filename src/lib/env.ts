import "server-only";

import { parseServerEnv, type ServerEnv } from "@/lib/env-schema";

export type { ServerEnv } from "@/lib/env-schema";

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
