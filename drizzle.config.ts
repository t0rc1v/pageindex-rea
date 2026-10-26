import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

/**
 * Next keeps its config in `.env.local`, and drizzle-kit only reads `.env`, so
 * it would otherwise see an empty `DATABASE_URL_UNPOOLED`. `@next/env` is the
 * same loader Next uses (same precedence, same expansion), which keeps one
 * source of truth for connection strings.
 */
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL_UNPOOLED?.trim();

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. drizzle-kit needs the direct (non-pooled) Neon URL: " +
      "DDL through a transaction-mode pooler is where migrations fail first.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: { url },
});
