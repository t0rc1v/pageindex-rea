#!/usr/bin/env node
/**
 * Make sure the account the e2e suite signs in as exists, creating it if needed.
 *
 * `clerk.signIn({ emailAddress })` mints a sign-in token for an *existing* user,
 * so a fresh Clerk instance (or CI with a reset instance) would fail the suite
 * before the first assertion. This uses the Backend API with CLERK_SECRET_KEY —
 * no Dashboard visit, no CLI login — and is idempotent.
 *
 *   pnpm e2e:user                 # create if missing
 *   pnpm e2e:user --dry-run       # report only
 *
 * The password satisfies Clerk's instance policy (the default minimum is 15
 * characters); the suite never types it, because sign-in goes through a
 * backend-minted ticket.
 */
import crypto from "node:crypto";

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const dryRun = process.argv.slice(2).includes("--dry-run");

const secret = process.env.CLERK_SECRET_KEY?.trim();
const email = (process.env.E2E_CLERK_USER_EMAIL ?? "pageindex-e2e+clerk_test@example.com").trim();

const headers = { Authorization: `Bearer ${secret ?? ""}`, "Content-Type": "application/json" };

async function main() {
  if (!secret) {
    console.error("✗ CLERK_SECRET_KEY is not set (check .env.local).");
    return 1;
  }

  const search = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=10`,
    { headers },
  );

  if (!search.ok) {
    console.error(`✗ Clerk user lookup failed: ${search.status} ${await search.text()}`);
    return 1;
  }

  const found = await search.json();
  if (Array.isArray(found) && found.length > 0) {
    console.log(`✓ e2e user exists: ${found[0].id} (${email})`);
    return 0;
  }

  if (dryRun) {
    console.log(`would create ${email}`);
    return 0;
  }

  // Never used for sign-in; skip strength scoring so a stricter instance policy
  // cannot fail provisioning.
  const password = `${crypto.randomBytes(18).toString("base64url")}Aa1`;
  const created = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
      first_name: "E2E",
      last_name: "Reader",
    }),
  });

  if (!created.ok) {
    console.error(`✗ Could not create ${email}: ${created.status} ${await created.text()}`);
    return 1;
  }

  const user = await created.json();
  console.log(`✓ created e2e user: ${user.id} (${email})`);
  return 0;
}

// `process.exitCode` rather than `process.exit`: exiting while the HTTP client is
// still tearing down trips a libuv assertion on Windows.
process.exitCode = await main();
