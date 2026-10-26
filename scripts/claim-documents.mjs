#!/usr/bin/env node
/**
 * Claim documents that exist in the PageIndex account but have no registry row.
 *
 * Everything uploaded before the `documents` table existed (or by a direct call
 * to the upstream API) is invisible to the app, because ownership — not
 * existence — is what the BFF checks. This attaches those documents to one
 * tenant, once, with an explicit target so it can never run by accident.
 *
 *   pnpm db:claim --email you@example.com            # personal space of that user
 *   pnpm db:claim --user user_2abc…                  # …by Clerk id
 *   pnpm db:claim --tenant 2ec1c22d-…                # …or an explicit tenant
 *   pnpm db:claim --email you@example.com --dry-run  # report only
 */
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

// @next/env is CommonJS: the named export is not available from an ESM script.
nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const userId = flag("user");
const email = flag("email");
const tenantFlag = flag("tenant");

if (!userId && !email && !tenantFlag) {
  console.error(
    "Usage: pnpm db:claim (--email <address> | --user <clerk-id> | --tenant <uuid>) [--dry-run]",
  );
  process.exit(1);
}

const apiKey = process.env.PAGEINDEX_API_KEY?.trim();
if (!apiKey) fail("PAGEINDEX_API_KEY is not set in .env.local");

const databaseUrl = process.env.DATABASE_URL_UNPOOLED?.trim() ?? process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail("DATABASE_URL / DATABASE_URL_UNPOOLED is not set in .env.local");

const apiUrl = (process.env.PAGEINDEX_API_URL ?? "https://api.pageindex.ai").replace(/\/+$/, "");
const sql = neon(databaseUrl);

let tenantId = tenantFlag;
let resolvedUserId = userId ?? null;

if (!tenantId) {
  const rows = userId
    ? await sql`select id, tenant_id from users where id = ${userId} limit 1`
    : await sql`select id, tenant_id from users where lower(email) = lower(${email}) limit 1`;

  if (rows.length === 0) {
    fail(
      `No user row for ${userId ?? email}. Sign in once so the tenant exists, or pass --tenant.`,
    );
  }
  tenantId = rows[0].tenant_id;
  resolvedUserId = rows[0].id;
}

const response = await fetch(`${apiUrl}/docs/?limit=500&offset=0`, {
  headers: { api_key: apiKey },
});
if (!response.ok) {
  fail(`Upstream listing failed: ${response.status} ${await response.text()}`);
}

const body = await response.json();
const documents = Array.isArray(body.documents) ? body.documents : [];
if (documents.length === 0) {
  console.log("No upstream documents to claim.");
  process.exit(0);
}

const existing = await sql`select pageindex_id from documents where tenant_id = ${tenantId}`;
const owned = new Set(existing.map((row) => row.pageindex_id));
const missing = documents.filter((document) => !owned.has(document.id));

console.log(
  `${documents.length} upstream document(s) · ${owned.size} already registered · ${missing.length} to claim`,
);
console.log(`tenant ${tenantId}${resolvedUserId ? ` · uploaded_by ${resolvedUserId}` : ""}`);
if (dryRun) {
  for (const document of missing) console.log(`  would claim ${document.id} — ${document.name}`);
  process.exit(0);
}

let claimed = 0;
for (const document of missing) {
  const inserted = await sql`
    insert into documents (tenant_id, pageindex_id, name, page_count, uploaded_by)
    values (
      ${tenantId},
      ${document.id},
      ${document.name ?? document.id},
      ${typeof document.pageNum === "number" ? document.pageNum : null},
      ${resolvedUserId}
    )
    on conflict (tenant_id, pageindex_id) do nothing
    returning id
  `;
  if (inserted.length > 0) claimed += 1;
}

console.log(`✓ claimed ${claimed} document(s)`);
