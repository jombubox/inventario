import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

function configureLocalWebSocketProxy(): void {
  const localProxy = process.env.NEON_LOCAL_WS_PROXY?.trim();
  if (localProxy) {
    neonConfig.wsProxy = () => localProxy;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
    neonConfig.poolQueryViaFetch = false;
    return;
  }
  // Single-statement reads use Neon's fetch transport. Interactive Drizzle
  // transactions still acquire a WebSocket client from Pool.
  neonConfig.poolQueryViaFetch = true;
}

export function createDatabaseClient(databaseUrl: string) {
  configureLocalWebSocketProxy();
  const reuseHarnessConnections =
    Boolean(process.env.NEON_LOCAL_WS_PROXY?.trim()) &&
    process.env.NEON_LOCAL_WS_POOL_REUSE === "true";
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    // A Cloudflare request must not retain a WebSocket or its idle timer.
    // maxUses=1 removes a transactional client as soon as Drizzle releases it.
    maxUses: reuseHarnessConnections ? Number.POSITIVE_INFINITY : 1,
    idleTimeoutMillis: reuseHarnessConnections ? 30_000 : 0,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error: Error) => {
    const code = (error as Error & { code?: unknown }).code;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "database_pool_error",
      errorName: error.name,
      ...(typeof code === "string" ? { errorCode: code } : {}),
    }));
  });
  return drizzle({ client: pool, schema });
}

export type Database = ReturnType<typeof createDatabaseClient>;
