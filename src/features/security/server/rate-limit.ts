import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { operationalRateLimits } from "@/db/schema";
import { RateLimitExceededError } from "@/features/shared/domain/service-errors";

export async function consumeOperationalRateLimit(
  db: Database,
  input: {
    scope: string;
    identity: string;
    limit: number;
    windowSeconds: number;
  },
): Promise<void> {
  const now = new Date();
  const windowBoundary = new Date(now.getTime() - input.windowSeconds * 1_000);
  const key = `${input.scope}:${input.identity}`.slice(0, 240);
  const [entry] = await db
    .insert(operationalRateLimits)
    .values({ key, windowStartedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: operationalRateLimits.key,
      set: {
        count: sql`case when ${operationalRateLimits.windowStartedAt} <= ${windowBoundary} then 1 else ${operationalRateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${operationalRateLimits.windowStartedAt} <= ${windowBoundary} then ${now} else ${operationalRateLimits.windowStartedAt} end`,
      },
    })
    .returning({
      count: operationalRateLimits.count,
      windowStartedAt: operationalRateLimits.windowStartedAt,
    });

  if (!entry || entry.count <= input.limit) return;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (entry.windowStartedAt.getTime() + input.windowSeconds * 1_000 - now.getTime()) /
        1_000,
    ),
  );
  throw new RateLimitExceededError(
    "Demasiadas operaciones. Espera antes de intentarlo nuevamente.",
    retryAfterSeconds,
  );
}
