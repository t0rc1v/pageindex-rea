import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

/**
 * Neon over HTTP: one request per query, no socket to exhaust, no pool to tune.
 * That is why the *pooled* URL is used here but not load-bearing — it matters
 * the day this module is swapped for `neon-serverless` (WebSocket) or `pg`,
 * which is why `DATABASE_URL_UNPOOLED` exists only for the migration tool.
 *
 * The client is lazy: `next build` collects page data with no guarantee a
 * database is reachable, and a module-scope throw would break the build rather
 * than the request that actually needs Postgres.
 */
let client: Database | null = null;

export function getDb(): Database {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Paste the pooled Neon connection string into .env.local and restart the server.",
    );
  }

  client = drizzle(neon(connectionString), { schema });
  return client;
}

export { schema };
