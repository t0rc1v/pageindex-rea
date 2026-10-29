# PageIndex Reader

A co-reader for long documents, built on **PageIndex Cloud**. A persistent sidebar
like the official app, chat-first answers that carry **numbered citations with block
bounding boxes**, and a document artifact that opens on the cited page beside the
conversation.

Next.js 16 (App Router, Cache Components) · React 19 · Tailwind v4 · no client state
library.

---

## What you get

- **shadcn sidebar** — collapsible to an icon rail on desktop (⌘/Ctrl+B or the
  trigger) and a Sheet on mobile, with New chat, Documents, Recents (renamable,
  deletable, persisted), usage, Settings. Nav structure reproduced from the
  shipped app's own sidebar component.
- **Chat-first, no chat header** — the transcript is the page. Ask across the
  whole library or a chosen scope; the composer carries the scope pill
  (`+ Select Documents` popover) and a circular send/stop control.
- **Inspectable work** — each tool step is a row (`Viewed folder structure`,
  `Read pages 135–136 from "…"`, shimmering while in flight) that expands into a
  real result: the document outline as a title ↔ `Page N` table, or the returned
  pages as text. `</>` opens **View raw input and output** (JSON viewer).
- **Reasoning row** — `Thought for Ns` collapses the model's narration; timings
  survive reloads.
- **Numbered inline citations** plus a **Sources** block (hairline row →
  `N references · M documents`, grouped per document with page links).
- **Citation preview** — hover on desktop, tap on mobile: `Page N of M`, a block-type
  pill, the cited page thumbnail with the block outlined, the block's own text,
  and **Open page ↗**. It keeps the same 8px gap whether it opens above or below
  the marker, follows the marker while the transcript scrolls, and goes away
  once the marker does.
- **Document panel** — one tab per document, resizable on desktop, a bottom-sheet
  viewer on phones; page image ↔ OCR text toggle, page navigation, `Document info`
  (pages, uploaded, description), remembers the last page per document, and
  **Add page to chat** pins a page into the next question.
- **Message actions** — copy, **Download** (Markdown, Word `.docx`, PDF, or Print),
  Regenerate with a **branch control** that keeps the previous answer, thumbs, and
  edit-and-resend on a question. Tables copy as Markdown/TSV or download CSV/MD;
  code blocks copy; **Mermaid diagrams** render and export as SVG/PNG/MMD; figures
  download or copy their link.
- **Document reader** — the PageIndex tree as a navigable outline, page text as
  markdown (tables, figures), rendered page images with block highlight, keyboard
  paging.
- **Library** — documents and workspace folders, drag-and-drop upload with
  per-file progress (PDF, Word, PowerPoint, CSV, Markdown, TXT, or a `.zip`
  bundle whose per-entry results are reported), content sniffing so a renamed
  file is rejected before indexing, grid ⇄ list view, rename/describe, live
  status, filtering, select-many → ask.
- **Appearance** — light/dark/system theme, and a transcript that can switch
  between the serif reading identity and the official's sans column.
- **First run** — onboarding with a bundled sample document, so a cited answer
  works before any upload.
- **Server-side key** — the PageIndex API key never reaches the browser.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local   # paste your PageIndex key
pnpm dev                     # http://localhost:3000 → sign in → /chat
```

Get a PageIndex key at [dash.pageindex.ai](https://dash.pageindex.ai).

Clerk keys come from `npx clerk init` (or `npx clerk env pull` once the project is
linked); they are already in `.env.local` for this checkout. Every route below
`/chat`, `/library`, `/doc`, `/settings` and every `/api/*` handler requires a
session — pages gate with `await auth.protect()`, handlers likewise.

### Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PAGEINDEX_API_KEY` | yes | — | PageIndex Cloud key. Server-only; sent as `api_key` (or `Bearer`). |
| `PAGEINDEX_API_URL` | no | `https://api.pageindex.ai` | Point at a compatible backend or the local mock. |
| `PAGEINDEX_BETA_HEADERS` | no | `block_reference` | Beta features requested on upload; empty or `none` disables. Enables block ids + bboxes. |
| `OPENAI_API_KEY` | no | — | Enables the **MCP lane** (recommended). Requires `PAGEINDEX_API_KEY`. |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Model that drives the MCP tools. |
| `PAGEINDEX_MCP_URL` | no | `$PAGEINDEX_API_URL/mcp` | Override the MCP endpoint. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | — | Clerk publishable key; safe to ship to the browser. |
| `CLERK_SECRET_KEY` | yes | — | Clerk secret key. Server-only. |
| `DATABASE_URL` | yes | — | Neon **pooled** connection string; used by the app at runtime. |
| `DATABASE_URL_UNPOOLED` | for migrations | — | Neon **direct** connection string; `drizzle-kit` only. |

Organizations are enabled with **Membership optional** (personal accounts on), so
a user can read documents solo and create a team later; `orgId` is the tenancy
key the Neon schema is scoped by.

---

## Database

The PageIndex key is **account-wide** — every document lives in one upstream
account, so PageIndex itself cannot answer "is this document yours?". Ownership
lives in Postgres instead, and a **tenant** is the boundary:

- the session's Clerk Organization, when `orgId` is present;
- otherwise the caller's personal tenant, created on first request.

`tenant_id` is never null. A personal space is a real row in `tenants` with a
null `clerk_org_id`, so personal and team scopes run one query shape instead of
an `isNull(orgId)` branch in every handler. `lib/server/tenant.ts` is the only
place a request becomes a tenant.

**Ownership is enforced, not implied.** The upstream will serve any id it is
given, so every document route resolves the id through `lib/server/documents.ts`
first, and a miss answers **404** — not 403, which would confirm that someone
else's document lives at that id. Rows enter the registry only by an upload in
that tenant (`POST /api/upload` registers what it created, including every file
expanded from a `.zip`) or by running the claim script explicitly:

```bash
pnpm db:claim --email you@example.com --dry-run   # what would be attached
pnpm db:claim --email you@example.com             # attach to that user's tenant
```

Documents uploaded before the registry existed are invisible until claimed.
Deleting a document removes the upstream file only once **no other tenant** lists
it, so "delete mine" cannot destroy a shared document.

The chat lane is scoped the same way. `docIds` from the browser are intersected
with the registry before anything reaches upstream, and the MCP lane (which talks
to an account-wide endpoint) exposes only tools that address one document *by
name*, then checks every name against the tenant's list. `browse_documents`,
`search_documents`, `get_folder_structure` and `get_document_image` are withheld:
whether or not they are destructive, they can enumerate the account, which is
exactly what tenancy must prevent.

| Table | Holds |
| --- | --- |
| `tenants` | personal space or Clerk Organization |
| `users` | Clerk user mirror; `tenant_id` is the personal tenant (unique) |
| `folders` | workspace folders — ours, never the account-global upstream ones |
| `documents` | ownership registry: `(tenant_id, pageindex_id)` unique, plus folder, status, description and the display/upstream name pair |
| `chats` | conversation header, scope documents, author |
| `chat_turns` | one row per question/answer, ordered by `position` |
| `chat_runs` | one row per regeneration; `blocks`/`citations`/`tools` as `jsonb` |

```bash
pnpm db:generate   # schema.ts → SQL in lib/db/migrations
pnpm db:migrate    # apply pending migrations (direct connection)
pnpm db:studio     # browse the data
pnpm db:push       # dev-only shortcut: sync schema without a migration file
pnpm db:claim      # attach pre-existing upstream documents to a tenant
pnpm e2e:user      # create the e2e sign-in account if it does not exist
```

Migrations go through `DATABASE_URL_UNPOOLED`. DDL through a transaction-mode
pooler is where `drizzle-kit` fails first. The app uses `drizzle-orm/neon-http`
(one request per query, nothing to pool), and `db.batch()` is what keeps
multi-statement writes atomic, since that driver has no interactive transactions.

### Applying migrations to production

Development is a local command; production is a button, so the production
connection string never has to exist on a laptop.

1. Edit `lib/db/schema.ts`, run `pnpm db:generate`, read the SQL it wrote.
2. `pnpm db:migrate` against your dev branch, and exercise the change.
3. Commit the schema **and** the generated SQL, open a PR, merge.
4. Actions → **Migrate database** → *Run workflow* (from `main`) → type `migrate`.
5. Deploy the code that expects the new schema.

The workflow resolves its target from an **environment** secret
(`Settings → Environments → production → DATABASE_URL_UNPOOLED`, with required
reviewers so a run pauses for approval). It prints only the host it is about to
migrate, then applies the committed files. Nothing is applied that is not in the
repository.

**Order matters, and so does shape.** Migrate before deploying, because the old
version keeps serving during the rollout — and write migrations that the *old*
code still tolerates. Add a column, deploy code that uses it, drop the old one in
a later release; a `DROP COLUMN` shipped alongside the code that stopped reading
it will break the version still in flight.

Never paste generated SQL into Neon's editor: the schema changes but Drizzle's
`__drizzle_migrations` journal does not, and the next `db:migrate` tries to apply
it again. Never migrate on app boot either — every instance would race.

---

## Routes

```
/sign-in              Clerk sign-in (catch-all)
/sign-up              Clerk sign-up (catch-all)
/chat                 new conversation (optionally ?docs=id,id)
/chat/[chatId]        stored conversation (Neon)
/library              documents + folders
/doc/[docId]          reader (tree + pages + page image)
/settings             connection, local data, chat lane notes

/api/me               session probe: { userId, orgId, orgRole, orgSlug }
/api/chats            GET  Recents · DELETE all of the caller's conversations
/api/chats/[chatId]   GET full conversation · PUT upsert · PATCH rename · DELETE
/api/folders          GET list · POST create — workspace folders in Postgres
/api/folders/[id]     DELETE — unfiles its documents, removes nested folders
```

## Architecture

```
browser ──► Clerk session ──► Next.js Route Handlers ──► api.pageindex.ai
            (proxy.ts)      (api_key header, server)      (BFF: key never ships)
```

| Browser call | Upstream | Notes |
| --- | --- | --- |
| `GET /api/config` | — | Key presence, API base, beta headers. |
| `GET /api/docs` | `GET /docs/` | `folderId`, `limit`, `offset`, `name`, `recursive`. |
| `GET/DELETE /api/docs/[docId]` | `GET /doc/{id}/metadata/`, `DELETE /doc/{id}/` | |
| `GET /api/docs/[docId]/tree` | `GET /doc/{id}/?type=tree` | |
| `GET /api/docs/[docId]/pages?from&to` | `GET /doc/{id}/?type=ocr&format=page` | Whole OCR fetched once, sliced, cached ~5 min. |
| `GET /api/docs/[docId]/block/[blockId]` | `GET /doc/{id}/block/{block_id}/` | bbox in thousandths, plus the block's text. |
| `GET /api/docs/[docId]/image?page=N` | `GET /doc/s3/{id}/images?start&end` | Presigned page JPEG. |
| `GET /api/docs/[docId]/image/[imgId]` | `GET /doc/{id}/image/{img_id}/` | 302 to a presigned figure. |
| `POST /api/upload` | `POST /doc/` | Multipart pass-through with indexing options. |
| `GET/POST /api/folders` | — | Workspace folders in Postgres (tenant-scoped). |
| `POST /api/chat` | `POST /chat/completions/` | Normalizes the SSE: prose / tool args / citations / done. |

### The chat wire (worth reading before changing it)

`lib/pageindex/chat-stream.ts` encodes three facts verified against live traffic:

1. `block_metadata.type = "tool_use"` marks **argument JSON** inside `delta.content`.
2. The citations frame (`object: "chat.completion.citations"`, carrying `bbox`,
   `block_id`, `block_type`) arrives **after** `finish_reason` — stop there and you
   silently lose every bounding box.
3. Prose arrives in blocks (`text_block_start` … `text_stop`); a citation tag can
   straddle a block boundary, so blocks are joined before tags are parsed.

`lib/citations.ts` parses both tag formats and numbers sources the way
`client.resolve_citations()` does (same source → same number).

---

## Chat lanes: MCP (default) and managed (fallback)

PageIndex documents `POST /chat/completions` as the **legacy Chat API** and
recommends [MCP tools](https://docs.pageindex.ai/mcp). This app implements both
and picks one at request time:

| | MCP — used when `OPENAI_API_KEY` is set | Managed fallback |
| --- | --- | --- |
| Model | yours (`OPENAI_MODEL`) | PageIndex's |
| Tool loop | this app's (`lib/pageindex/mcp-chat.ts`) | PageIndex's server-side |
| Endpoint | `https://api.pageindex.ai/mcp` (Bearer) | `POST /chat/completions/` |
| Citations | model writes `<cite doc page block/>`; app resolves bbox from `/block/{id}` | inline tags + `chat.completion.citations` frame |

The MCP lane withholds destructive tools (anything named delete/remove) from the
model and scopes it with a system prompt that fixes the citation format and names
the documents in scope. Switch lanes by adding/removing `OPENAI_API_KEY`; the
active lane and model are shown in **Settings**.

---

## Verifying without a key

`scripts/mock-pageindex-api.mjs` implements the documented wire shapes — including
a tool block, split citation tags, and a citations frame — so the app runs offline:

```bash
pnpm mock:api                       # terminal 1, port 4319, api_key=test-key
PAGEINDEX_API_URL=http://127.0.0.1:4319 PAGEINDEX_API_KEY=test-key pnpm dev
```

`next build` and `next dev` share `.next`: stop the dev server before building, or
the production output is clobbered mid-build and `next start` serves 404s for the
CSS/chunks (seen while verifying this app).

### Tests

```bash
pnpm test        # vitest: citation grammar, SSE translation, exports (real PDF)
pnpm test:e2e    # playwright against the mock API, using your installed Chrome
```

The e2e suite starts the mock and a production server on port 3100 itself; it
needs no PageIndex key and no browser download.

It does need a Clerk user, because every route is gated. `pnpm e2e:user` makes
sure that account exists (idempotent; it uses the Backend API with
`CLERK_SECRET_KEY`, so no Dashboard visit is needed). The `setup` project then
signs it in once and writes `e2e/.auth/user.json` (gitignored) for the specs to
reuse, so tests never walk through a sign-in form:

```bash
pnpm build        # the suite serves .next
pnpm e2e:user     # create the sign-in account if this instance does not have it
pnpm test:e2e     # E2E_CLERK_USER_EMAIL overrides the default address
```

`playwright.config.ts` loads `.env.local` through `@next/env` (the loader Next
uses) so `clerkSetup()` sees `CLERK_SECRET_KEY`; `clerk.signIn({ emailAddress })`
then mints a sign-in token over the Backend API and spends it as a ticket — no
password, no emailed code, nothing that bot protection can rate-limit. The setup
fails immediately, naming what is missing, when `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `DATABASE_URL` is absent.

**What is stubbed, and what is not.** PageIndex is a local mock
(`scripts/mock-pageindex-api.mjs`) and no model is ever called — `OPENAI_API_KEY`
is blanked for the suite, which forces the managed lane. Sign-in and the database
are **real**: a Clerk development instance and your Postgres. Fixtures make that
repeatable (the setup clears the test user's conversations, registers its
document through the real upload path and restores the display name; the folder
test deletes the folder it created), but the dependency is real.

There is deliberately **no auth bypass** for tests. A flag that made
`auth.protect()` return a fixture identity would have to work in a production
build — the suite runs `next start` — and that is an unacceptable footgun for a
temporary convenience. A secretless suite needs a test-only identity provider
behind a build-time switch; that is a product decision, not a test tweak.

---

## Continuous integration

`.github/workflows/ci.yml` runs two jobs on every push to `main` and every pull
request.

| Job | Needs secrets | Runs |
| --- | --- | --- |
| `verify` | no | `pnpm lint`, `tsc --noEmit`, `pnpm test`, migration checks, `pnpm build` |
| `e2e` | yes | migrate, provision the sign-in account, build, Playwright |

A third workflow, `migrate.yml`, is **manual only** (`workflow_dispatch`) and
applies committed migrations to the production branch — see
[Applying migrations to production](#applying-migrations-to-production).

`CONTRIBUTING.md` is the day-to-day version of all of this: the branch → PR →
checks → merge → migrate → deploy loop, the three databases, and the failure
playbook.

`verify` is secretless on purpose: `getDb()` is lazy and Clerk only needs a
well-formed publishable key to prerender the sign-in route, so the job builds with
placeholder values.

`e2e` is skipped — with a notice, not a failure — unless these repository secrets
exist: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`. Point them at a **CI branch**, not the database you
develop against: the suite deletes the test user's conversations and mutates its
document registry, so a parallel local run would collide.

`E2E_CLERK_USER_EMAIL` can be set as a repository *variable* to override the
default address. `PLAYWRIGHT_CHANNEL` selects the browser: CI downloads Chromium,
a workstation reuses installed Chrome.

---

## Project layout

```
app/
  (shell)/layout.tsx           sidebar + mobile drawer shell
  (shell)/chat/…               new chat + stored conversations
  (shell)/library, doc/[docId], settings
  api/…                        Route Handlers (only place the key is used)
components/
  shell/                       sidebar, drawer, top bar
  chat/                        workspace, citation card, artifact, scope picker, useChat
  library-view, doc-view, page-reader, tree-outline, markdown, ui
lib/
  pageindex/client.ts          server-only Cloud client
  pageindex/chat-stream.ts     SSE → normalized events (verified grammar)
  citations.ts                 tag parsing, numbering, stream-safe tokenizing
  citation-placement.ts        where the citation preview sits (measured, clamped)
  chat-store.ts                conversation cache + write path (client)
  server/chats.ts              conversations, scoped by tenant and author
  chat-types.ts                shapes shared by the browser store and Postgres
  db/schema.ts                 tenants, users, documents, chats, turns, runs
  db/migrations/               generated SQL, applied with db:migrate
  server/tenant.ts             session → tenant (personal or organization)
  server/pages-cache.ts        bounded page-content cache
drizzle.config.ts              drizzle-kit (loads .env.local via @next/env)
CONTRIBUTING.md                the branch → PR → migrate → deploy loop
docs/DEBUGGING.md              symptom → cause: 500s, console errors, e2e rot
.github/workflows/ci.yml       verify (secretless) + e2e (guarded) jobs
scripts/ensure-e2e-user.mjs    idempotent test-account provisioning
docs/REVERSE-ENGINEERING.md    evidence, inferences, open questions
scripts/mock-pageindex-api.mjs
```

---

## Limits and caveats

- **One PageIndex account, many users.** Every user's documents land in the
  same upstream account because there is a single API key. Tenancy is enforced
  by this app — `documents` is the ownership registry — so the BFF must check
  it on every document route; the upstream will serve any id it is given.
- **Conversations are private to their author** inside a tenant. Documents are
  the shared artifact — they are tenant-scoped, so "Shared with me" works — while
  a transcript stays personal until sharing ships. Chats left in `localStorage`
  by earlier builds are imported once, on the first authenticated load.
- **No sharing or billing.** Chat/document share links, subscriptions, seats and
  team spaces are deliberately out of scope for this build.
- **PDF fidelity.** The Cloud API exposes rendered page images, not the original
  PDF, so the document panel shows page renders plus OCR text rather than a PDF
  canvas.
- **Tool payloads.** The managed lane streams tool *arguments* but not results, so
  an expanded step shows the fetched outline/pages when it can resolve them and
  otherwise points at the raw view. The MCP lane emits real results.
- **Block-level citations need blocks.** Documents indexed without them still work,
  but citations fall back to page level (the preview says so).
- **Tables/figures come from OCR markdown**; use the page-image view when pixel
  fidelity matters.
- **The official app's authenticated UI could not be observed** (no session in any
  local browser), so the citation card and artifact are built from the user's
  description plus the API's citation payload — see §6 of the notes.

---

## Security model

Everything below is a boundary the app enforces itself, because the PageIndex
account is shared and the upstream has no notion of tenants.

| Concern | Where it is handled |
| --- | --- |
| Authentication | `clerkMiddleware()` in `proxy.ts` reads the session; every page and Route Handler calls `await auth.protect()` (per-resource, not path matching) |
| Tenancy | `requireTenant()` → `tenantId = orgId ?? personal tenant`; every query filters on it |
| Document ownership | `documents` registry, checked on every document route; a miss is a 404 |
| Chat visibility | `tenant_id` **and** `created_by` on every chat query — transcripts are private to their author |
| Chat carding | Client `PUT` upserts only inside its own tenant+author scope; a taken id answers 409 |
| Input validation | zod on chat payloads; chat ids must be UUIDs; 2 MB body cap on `PUT /api/chats/:id`; 50 MB upload cap with content sniffing |
| Abuse | Fixed-window limits in Postgres (see below) — not in process memory, so N instances do not mean N× the limit |
| Webhooks | `POST /api/webhooks/clerk` verifies the Svix signature and is excluded from the session middleware; without a secret it answers 503 |
| Response headers | `nosniff`, `DENY` framing, strict referrer, permissions policy, HSTS, same-origin opener, and a Content Security Policy (below) |
| Secrets | Only server modules read `CLERK_SECRET_KEY`, `DATABASE_URL`, `PAGEINDEX_API_KEY`; `server-only` makes a client import a build error |

| Endpoint | Limit |
| --- | --- |
| `POST /api/chat` | 30 / minute / user |
| `POST /api/upload` | 20 / hour / user |
| `PUT`·`PATCH`·`DELETE /api/chats/:id` | 240 / minute / user |
| `DELETE /api/chats` (clear all) | 10 / hour / user |

Exceeding a limit answers `429` with `Retry-After`, `X-RateLimit-Limit` and
`X-RateLimit-Remaining`. Counters live in `rate_limits`; expired windows are
swept by the first request of each new window, so no cron is required.

### Clerk webhooks

The webhook keeps the `users` mirror current and makes account and organization
deletion cascade (a deleted user takes their personal space and transcripts with
them; a deleted organization takes its documents and conversations).

1. Clerk Dashboard → **Webhooks** → **Add endpoint** → `https://<host>/api/webhooks/clerk`
2. Subscribe to `user.created`, `user.updated`, `user.deleted`,
   `organization.created`, `organization.updated`, `organization.deleted`
3. Copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`

Until it is configured the endpoint answers `503` rather than accepting unsigned
payloads. Users are still mirrored lazily on their first request (one Backend API
call, for the profile fields), so the app works without it — the webhook is what
keeps deletions and renames honest.

### Renames

A document carries two names, and only one of them is written by this workspace.

| Column | Meaning | Written by |
| --- | --- | --- |
| `documents.name` | What the workspace calls it | the user (`PATCH /api/docs/:id`) |
| `documents.upstream_name` | What PageIndex calls it | upload, claim, and the status refresh |

The upstream name is an **account-global key**: it is what PageIndex's MCP tools
accept (`get_document(doc_name=…)`) and what its citations carry. Renaming it
would change another tenant's citations and break their tool calls, so a rename
stays here, and the two names are reconciled at the two edges that need it:

- **MCP tool calls** — the gate checks the display name against the tenant's list,
  then `mapDocNameArguments` swaps in the upstream name immediately before the
  call.
- **Managed-lane citations** — PageIndex emits the upstream name; the stream
  rewrites `citation.document` to the display name before it reaches the browser,
  so citations, Sources and the library never disagree.

A rename in the PageIndex dashboard is picked up by the next status refresh as a
new `upstream_name`; the workspace's own name is never touched. Descriptions are
local too: seeded from upstream the first time, then left alone once edited.

One boundary: tool-step **arguments** are still whatever upstream returned, so an
expanded step can show the upstream name. It is inspectable plumbing, not a claim
the answer makes.

### Folders and listing

Folders live in `folders`, scoped by tenant, because the upstream `/folders` API
is account-global: proxying it would let one workspace see and mutate another's
tree. Uploads therefore never send `folder_id` upstream — the id is validated
against the tenant and stored on the `documents` row. A document's `path` in the
UI is the workspace folder chain ("Legal / Contracts"), not the upstream one.

The library is read from the registry, not from the upstream listing: ordering,
paging and `total` are a Postgres query, so the list is honest at any size. Only
*status* comes from upstream — the visible rows whose `synced_at` is stale are
reconciled (at most five per request: 5s for in-flight indexing, 5min once
settled), and the result is written back. Rows keep the last known status when
upstream cannot be reached.

### Before deploying

- Run `pnpm db:migrate` as a release step; migrations use the direct URL.
- Use a Neon role that owns only this database, and keep the pooled URL for the
  app and the direct one for the migration job.
- Claim anything uploaded before the registry existed.
- Configure the Clerk webhook and confirm `CLERK_WEBHOOK_SIGNING_SECRET` is set.
- Turn on Neon backups / point-in-time restore for the production branch, and
  keep `next dev` pointing at a branch you do not mind losing.
- Connect a log sink: unhandled route errors are logged server-side and returned
  to the caller as a generic 500, so the log is the only place the cause appears.

### Content Security Policy

`proxy.ts` sets a CSP on every matched response. It is **not** nonce-based, and
that is a deliberate trade recorded here because the alternative looks tempting:

a nonce can only be attached while a page is rendered per request. This app runs
on Cache Components, so routes are partial prerenders whose static shell is built
with no request and therefore no nonce. Clerk's `contentSecurityPolicy` helper
generates one and adds `'strict-dynamic'` — enabling it blocked every Next chunk
in this app, because a browser ignores `'unsafe-inline'` once a nonce is present.
The real choice is a strict nonce policy **or** partial prerendering, not both.

Enforced today: scripts come from our own bundle and Clerk's Frontend API (derived
from the publishable key, so it follows the instance); `object-src`, `base-uri`
and framing are shut; `connect-src` is the app plus Clerk; `img-src` is presigned
S3 renders, Clerk avatars and blobs. Inline scripts stay allowed — the tradeoff
to be explicit about. React escapes by default, the single
`dangerouslySetInnerHTML` renders mermaid with `securityLevel: "strict"`, and an
injected script would still find nowhere to send what it stole.

`e2e/fixtures.ts` fails any test whose page logs a CSP violation, so the policy
cannot quietly break a surface: images, diagrams, sign-in and exports are all
covered by the suite.

If you later want a nonce policy, the honest path is making the authenticated
routes dynamic (`await connection()` in the shell) and accepting the loss of the
static shell — not loosening the policy until it passes.

### Known limits

- **Tool-step arguments show upstream names.** Citations, Sources and the
  library use the workspace's display name; an expanded tool step's raw I/O
  still shows what PageIndex returned. It is inspectable plumbing, not a claim
  the answer makes.
- **Upstream folders are ignored.** Documents uploaded through the PageIndex
  dashboard land unfiled here; this app's folders are its own.
- **Status is eventually consistent.** Rows reconcile with upstream at most once
  every 5s while indexing and once every 5min when settled, so a status change
  can lag by that much. The library polls, so a fresh upload catches up quickly.
