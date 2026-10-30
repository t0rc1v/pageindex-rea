# Debugging this app

Symptoms that look like app bugs but are not, and the fastest way to tell them
apart. `CONTRIBUTING.md` covers the loop (branch → PR → merge → migrate →
deploy); this file covers "it is running and something is wrong".

Portable lessons live in agent skills, not here — see
`~/.agents/skills/next-cache-components-triage`, `playwright-console-guards` and
`clerk-playwright-sessions`. This file is only what is true of *this* app.

---

## Every API call answers 500

The browser shows `[browser] hydrateChats Error: GET /api/chats → 500`, plus the
same for `/api/docs`, `/api/me`, `/api/folders`. The client is fine; the server
cannot reach the database. Two causes, in the order worth checking:

**1. A malformed `DATABASE_URL`.** Neon answers
`Wrong URL scheme or missing user, host or database in connection parameters`,
which Next nests under `[cause]` in the terminal. The one that has happened here
is a doubled letter in the scheme (`ppostgresql://`). `.env.local` is gitignored,
so a typo never reaches CI and stays local until someone retries a fresh clone.

```bash
# which scheme is actually loaded (no secrets printed)
node -e "require('@next/env').loadEnvConfig(process.cwd()); console.log((process.env.DATABASE_URL||'').split(':')[0])"
```

**2. The database has never been migrated.** The error is
`relation "users" does not exist` instead. Merging never migrates anything — the
only path to production DDL is **Actions → Migrate database** (manual, and it
pauses for the `production` environment). CI's `e2e` job does run
`pnpm db:migrate`, but against the **ci** branch, not production.

```bash
ls lib/db/migrations/*.sql    # five migrations: tenants/users/documents/folders/chats/…
```

A provisioned database has a `__drizzle_migrations` table with one row per
applied file. If production answers 500 while `verify` and `e2e` are green, this
is the first thing to check.

---

## The console is the only symptom

`next dev` forwards the browser's console to the terminal as `[browser] …`, so a
terminal is enough to see client errors:

```bash
pnpm dev            # then open the route; errors appear in this pane
```

Signatures that are repo-specific:

| Console | Cause here | Fix |
|---|---|---|
| `Could not validate \`instant\` … [cause]: NEXT_REDIRECT` on `/` | a page tried to be a redirect (removed in favour of a config redirect) | keep `/` out of `app/`; the 307 lives in `next.config.ts` |
| `net::ERR_INVALID_HTTP_RESPONSE` on `/_next/hmr` + `Blocked cross-origin request` | the dev server trusts `localhost`; you opened `127.0.0.1` | already allowed via `allowedDevOrigins` — restart if it reappears |
| `hydrateChats … 500` | see the section above | — |
| `Error [AI_InvalidPromptError]: Invalid prompt: System messages are not allowed in the prompt or messages fields` when a question carries a pinned page | AI SDK 7 rejects system messages in `messages`; the pinned-page preamble is one | `lib/pageindex/mcp-chat.ts` lifts system messages into `instructions` (`mcpPrompt`) — keep them there |
| `Route /x is rendering with server caches disabled` | a hard reload sent `Cache-Control: no-cache` | informational, not a bug |

Anything that is *not* on this list is likely generic Next/React/Clerk
behaviour — reach for the skills named at the top before debugging from scratch.

---

## Sign-in leaves the app for `*.accounts.dev`

The sign-in and sign-up paths are **code-owned**:

- `proxy.ts` → `clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" })`
  covers `auth.protect()` redirects on the server.
- `app/layout.tsx` → the same paths on `<ClerkProvider>`, plus
  `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl`, cover the browser.

Do not reintroduce `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and friends. They are absent on
purpose: with them unset Clerk resolves the instance's **Account Portal** on a
second origin (`<slug>.accounts.dev`), which `proxy.ts` blocks by design — the
symptom is a console CSP violation and a redirect that leaves the app. Props and
middleware options beat env, so the env vars are dead weight even when present.

---

## The e2e suite rots as it runs

`pnpm test:e2e` builds nothing — the config starts `next start -p 3100`, so run
`pnpm build` first. Sign-in and the database are real; only PageIndex is mocked.

A development-instance session lives **60 seconds** and cannot refresh itself.
Past that, `/api/*` redirects to sign-in and specs that parse JSON see HTML:
`SyntaxError: Unexpected token '<', "<!DOCTYPE "...`. `e2e/fixtures.ts` renews 20 s
before expiry and writes the renewed session back to `e2e/.auth/user.json`
(contexts are per-test, so an unwritten renewal is lost). If a spec starts
failing this way again, that fixture is the first place to look.

The suite is ~3 minutes; roughly three of those are real sign-ins. Raising the
session-token lifetime on the Clerk development instance would remove them.

---

## Reproducing a citation race

The mock holds the citations frame back for 4 seconds when the question contains
**"cite later"**, which is the window where a citation is on screen before its
document id arrives:

```ts
await page.getByPlaceholder(/Ask a question/).fill("Cite later: summarise the risks.");
```

`e2e/chat.spec.ts` uses this to keep the "clicked mid-answer" case deterministic.
Prefer extending that knob over sleeping in a spec.

---

## Working against the mock by hand

```bash
node scripts/mock-pageindex-api.mjs 4319
curl -H "api_key: test-key" "http://127.0.0.1:4319/doc/pi-mock-1/"   # not Authorization
```

The trailing slash is part of the route, and the header is `api_key` rather than
`Authorization` — the real API takes a query parameter, and this is the shape the
BFF sends. It serves three pages of OCR markdown, a table and a figure, and a
managed-chat SSE whose citations frame lands *after* `finish_reason` — the
ordering the client has to survive.

---

## Two smaller traps

- **A deleted route breaks `tsc`.** `.next/types/validator.ts` is written by
  `next build`; deleting a page leaves it importing a module that no longer
  exists (`Cannot find module '../../app/page.js'`). Rebuild, or delete
  `.next/types`.
- **A second `next dev` in the same directory refuses to start** and prints the
  running PID. Kill that process; do not start on another port expecting a clean
  environment.
