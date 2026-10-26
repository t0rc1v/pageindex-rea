import "server-only";

import { lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { jsonResponse } from "@/lib/server/http";

/**
 * Fixed-window rate limiting, counted in Postgres.
 *
 * Deliberately not in process memory: a per-instance counter silently multiplies
 * every limit by the number of running instances, which is precisely the failure
 * a rate limit exists to prevent. One upsert per limited request is cheap next to
 * the work these endpoints do (a 50 MB upload, a streaming completion).
 *
 * Windows are aligned to their own length so concurrent instances agree on the
 * bucket, and the increment is a single atomic statement, so no read-then-write
 * race can undercount.
 */
export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitVerdict> {
  const windowMs = windowSeconds * 1000;
  const startedAt = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const db = getDb();

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: startedAt, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? 1;

  // Only the first request of a window pays for the sweep; this keeps the table
  // from growing without a separate cron.
  if (count === 1) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    void db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).catch(() => {});
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((startedAt.getTime() + windowMs - Date.now()) / 1000),
  );

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

/** 429 with the headers a client needs to back off correctly. */
export function rateLimited(verdict: RateLimitVerdict): Response {
  return jsonResponse(
    {
      error: `Too many requests. Try again in ${verdict.retryAfterSeconds}s.`,
      code: "INTERNAL",
      status: 429,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(verdict.retryAfterSeconds),
        "X-RateLimit-Limit": String(verdict.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
