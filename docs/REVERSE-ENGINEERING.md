# Reverse-engineering notes: PageIndex Cloud + `app.pageindex.ai`

What was observed, what was inferred, and what is still unverified. Two passes:

- **Static pass** — specs, SDKs, and the shipped web app's public bundles.
- **Live pass** — with an API key, against `api.pageindex.ai` (2026-10-22), which
  corrected several things the docs and SDK imply.

---

## 1. Targets and method

| Target | What it gave us |
| --- | --- |
| `https://api.pageindex.ai/openapi.json` | Route + schema list (OpenAPI 3.1, FastAPI, `info.version: 0.1.0`). Incomplete: no `/chat/completions`, `/retrieval`, `/mcp`, `/doc/{id}/block`, `/doc/s3/...`. |
| `https://docs.pageindex.ai` | API reference, SDK guides, MCP page, changelog, cookbook, the JS SDK's **"Legacy — Chat API"** page. |
| `VectifyAI/PageIndex` @ `cc62cce` | Server/SDK source: `cloud_api.py`, `client.py` (`_parse_citations`, `resolve_citations`), `local_chat.py` (`_cloud_chunk_events`), `agent_tools.py`. |
| `@pageindex/sdk@0.8.0` | Declared TypeScript response types and the `client.tools` (MCP) surface. |
| `app.pageindex.ai` public HTML/chunks | App shell, nav config, auth surface, and the fact that `chat.pageindex.ai` is the same deployment. |
| Live API with a real key | The actual stream grammar, citation payloads, block endpoint, page renders. |

Method notes:

- Route existence on `app.pageindex.ai` was probed unauthenticated: a protected
  route answers `307 → /login?callbackUrl=…`, a missing one answers `404`.
- Static bundle reads prove code ships; they do not prove a route is reachable.
- **The authenticated product UI at `app.pageindex.ai` was never observed** — no
  session exists in any local browser (checked Chrome, Edge, Brave profiles for
  `pageindex` cookies). The citation-popover and "Open page" artifact behaviour in
  this app follows the user's description plus the API's citation data, not a
  screenshot of the official implementation.
- **Second pass (2026-10-23), unauthenticated:** the conversation UI is observed
  through public share links (`/share/chat/:shareId`, `/share/doc/:shareId`) plus 50
  client chunks downloaded from those pages. That resolved the citation popover,
  Sources block, reasoning/tool rows, document panel, `Page N of M` and composer.
- **Third pass (2026-10-23), authenticated + platform:** with a live Free-plan session
  the product surface was observed — a real chat created from the sample pack
  (`/chat?session=…`), `/documents`, `/settings`, `/usage`, `/subscription`, the
  Share dialog, the document panel, and computed styles from the DOM — plus a
  **mobile** pass (390×844) and a **network** pass that enumerated the oRPC
  procedure list (`/api/orpc/<router>/<proc>`), quotas, ingestion formats, answer
  export (md/docx/pdf) and the **MCP server** at `app.pageindex.ai/mcp`.
  Full matrix in [`FEATURE-COMPARISON.md`](./FEATURE-COMPARISON.md).

---

## 2. The web product

**Observed (public routes only).**

- `app.pageindex.ai` and `chat.pageindex.ai` serve the same Next.js App Router
  build (identical landing payloads; title *“PageIndex — Professional AI Co-Reader
  for Complex Documents”*).
- Protected routes (`307 → /login`): `/library`, `/chat`, `/documents`,
  `/settings`, `/usage`, `/subscription`, `/billing/success`,
  `/admin/communications`. Public: `/explore`, `/magic-link`; `/signin` → `/login`.
- Login offers Google, GitHub, and password with an email field.
- `/explore` (public) lists public knowledge collections — *Getting Started with
  PageIndex, Apple v. OpenAI, Stanford CS229, Financial Machine Learning,
  Y Combinator SAFE, SpaceX, Micron* — each with **Learn more / Start chat**
  buttons that require login.
- Client chunks reference `next-auth`, PostHog, Sentry, `nuqs`, Radix/shadcn, and
  a Zod env schema with `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_*`,
  `RESEND_API_KEY`, `NEXT_PUBLIC_HOST_URL`, `ADMIN_EMAILS`, `PAGEINDEX_API_URL`,
  `CHAT_RATE_LIMIT_MODE`, `SHARED_SOURCE_CHAT_SHARE_DISABLED`, plus LLM provider
  credentials.
- No `api.pageindex.ai` host string appears in the public client chunks.

**Sidebar structure (recovered verbatim from the public `/explore` bundle,
`113xlpzcsljwd.js`):**

```js
navMain: [
  { title: "New Chat",  url: "/chat",      icon: ChatIcon },
  { title: "Documents", url: "/documents", icon: DocumentIcon },
  { title: "Explore",   url: "/explore",   icon: Compass, gate: "explore" },
  { title: "Library",   url: "/library",   icon: Books,   gate: "admin" },
],
navGroups: [],
navSecondary: [
  { title: "Contact",      url: "#contact-dialog", icon: MessageSquareText },
  { title: "Settings",     url: "/settings",       icon: Settings },
  { title: "Subscription", url: "/subscription",   icon: CreditCard },
]
```

Plus: a **Recents** section with a chevron, persisted in localStorage under
`sidebar-conversations-expanded`; per-chat rename / delete / share actions; a
"Share Chat" dialog; "No chats yet" empty state; a **page-usage** progress bar
with a tooltip and percent label; an **Upgrade** CTA; teamspace (`useTeamspace`,
`isPersonalSpace`) state; and shadcn's `Sidebar` primitives with a mobile drawer
(`useSidebar`, `setOpenMobile`, `collapsible="icon"`).

**Inference.** The product is chat-first: the sidebar is always present, and
documents open beside a conversation rather than as a separate primary page.

**Design consequence here.** This app now has a persistent sidebar (New chat /
Documents / Recents / Settings / usage), chat as the default surface, and a
document **artifact panel** that opens from a citation. The Cloud API exposes no
conversation resource, so conversations live in this app's own Postgres
(`chats` / `chat_turns` / `chat_runs`, scoped to tenant and author) behind Clerk
auth — the same shape the official app uses, minus sharing.

**Verified against the live app (2026-10-23, Free plan).** These supersede the
bundle-only inferences above:

- The app is **dark-only** on this build: canvas `rgb(9,9,11)`, text
  `rgb(250,250,250)`, **Geist** 16 px; blue accent (`#3788D8` theme colour, chips
  `#C3D8F5`). No serif anywhere in product UI.
- Sidebar ~198 px with New Chat / Documents / Explore, Recents, and a footer of
  avatar + plan + **Upgrade** + a usage meter (`0%`).
- **The authenticated chat has no header bar.** A floating `Share` pill is the only
  chrome at the top left; the conversation title exists only in Recents and in the
  `/share/chat/...` view. Chats are addressed as `/chat?session=<id>`.
- Chat column and composer are both **768 px** wide; the composer is **145 px** tall
  with a `+ Select Documents` pill and a circular `↑`/stop control.
- Message toolbars: assistant = Copy / Download / Regenerate + timestamp;
  user = Copy / Edit / Regenerate.
- Tool steps expand into real results (document outline as a title/`Page N` table,
  or document chip + `Returned pages 1–3`) and expose
  **"View raw input and output"** (JSON viewer).
- The document panel is **resizable** (508 px here, 618 px on the share page),
  renders the **PDF** with a determinate `Loading document N%` bar, and reflows the
  chat column instead of overlaying it.
- `/documents`, `/settings`, `/usage`, `/subscription` and the Share dialog were all
  captured; see [`FEATURE-COMPARISON.md`](./FEATURE-COMPARISON.md) §1.
- **Transport:** the browser calls its own **oRPC** router (`POST /api/orpc/<router>/<proc>`)
  — `chat/*`, `user/*`, `folder/tree`, `file/{list,recents,resolveCitations}`,
  `explore/getBySlug`, `share/*`, `subscription/*`, `usage/getUsageStats`. Citation
  resolution is a **bulk** server call (`file/resolveCitations` with `blockIds[]`).
- **The app is also an MCP server:** `https://app.pageindex.ai/mcp` returns
  `401 invalid_token` without OAuth (`/oauth/authorize`), and Settings → Integrations
  → Connect ships one-click Claude Desktop / Cursor installs, "included in your
  PageIndex Plan". `file/list` takes `mode:"mcp"` for that surface.
- **Mobile (390×844)** is a dedicated layout: sidebar → left drawer, icon-only
  `Share`, and a tap on a citation opens a full-height `Document Viewer` sheet
  instead of the inline panel.
- **Ingestion** accepts PDF, CSV, Markdown and TXT, plus `.zip` bundles that rebuild
  the folder tree; `detectDocumentFormat` also knows docx.
- **Answers export** to `.md`, `.docx` and `.pdf` (`Exporting Markdown…`,
  `Markdown file downloaded`), and rich blocks export individually (tables as
  CSV/Markdown/TSV, Mermaid as SVG/PNG/MMD).

---

## 3. The Cloud API contract

Base URL `https://api.pageindex.ai`.

**Auth.** Both headers work (verified):

```
api_key: <key>
Authorization: Bearer <key>
```

A 401 carries `www-authenticate: Bearer`. The SDK sends `api_key`.

Trailing slashes: the OpenAPI document declares `/doc/{doc_id}`; the SDK calls
`/doc/{doc_id}/`. FastAPI serves both (307). This app uses the SDK form.

### 3.1 Documents

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/doc/` | `multipart/form-data`, required `file`; optional `folder_id`, `metadata` (JSON string), `beta_headers` (JSON array), `if_add_node_id`, `if_add_node_summary`, `if_add_doc_description`, `if_add_node_text`, `if_retrieval`. Returns `{doc_id, name?}` immediately; indexing is async. ZIP → `202` with per-entry results. |
| `GET` | `/doc/{id}/?type=tree` | `summary`, `include_text`. Returns `{doc_id, status, retrieval_ready?, result: TreeNode[]}`. |
| `GET` | `/doc/{id}/?type=ocr&format=page` | `include_images` swaps base64 for presigned URLs. **Verified page keys: `page_index`, `markdown`, `images`, `extended_node_candidates`** — no `blocks` array. |
| `GET` | `/doc/{id}/metadata/` | `{id, name, description, status, createdAt, pageNum, folderId, metadata}`. |
| `GET` | `/doc/{id}/block/{block_id}/` | **Verified**: `{doc_id, page, block_id, bbox, block_type, text}`. `bbox` is `[x0,y0,x1,y1]` in thousandths of page width/height, origin top-left. 404 when the block does not exist. |
| `GET` | `/doc/s3/{id}/images?start=N&end=N` | **Verified**: `{doc_id, images: [{page, mime_type, object_key, url}]}` — presigned JPEG. |
| `GET` | `/doc/{id}/image/{img_id}/` | `{url}` for a figure OCR extracted. |
| `GET` | `/docs/` | `limit` (1–10000), `offset`, `folder_id` (`root`, `shared-with-me`, `following`), `recursive`, `name`, `metadata_filter`, `sort`, `aggregates`, `group_by`. Returns `{documents,total,limit,offset}`; list rows add `path`. |
| `DELETE` | `/doc/{id}/` | Deletes document + derived data. |

**Verified tree node shape** (superset of the SDK's `TreeNode`):

```json
{ "title": "Preface", "node_id": "0000", "page_index": 1,
  "start_index": 1, "end_index": 4, "summary": "…" }
```

`start_index` / `end_index` are page ranges the SDK types do not declare.

### 3.2 Folders

`POST /folder/` `{name, description?, parent_folder_id?}`; `GET /folders/?parent_folder_id=root|<id>`;
`DELETE /folder/{id}/`; metadata-schema endpoints under `/folder/{id}/metadata/schema`.

### 3.3 Chat — the real wire

`POST /chat/completions/`. **The docs label this the "legacy Chat API"** and
recommend MCP tools instead (`https://docs.pageindex.ai/js-sdk/legacy/chat`). It
remains the only lane that answers **without a second LLM provider key**: the
Python docs state that `protocol="chat_completions"` "works with managed cloud
chat, without your own chat model", and `chat_completions()` "remains available
for existing code".

Verified stream grammar (one real answer, 115 frames):

```
block_metadata {type:"text_block_start", block_index:1}
delta.content …                       ← model narrating ("I'll locate …")
block_metadata {type:"text_stop", block_index:1}

block_metadata {type:"mcp_tool_use_start", block_index:2, tool_name:"get_document_structure", server_name:"pageindex"}
block_metadata {type:"tool_use", block_index:2}   ← delta.content is ARGUMENT JSON
block_metadata {type:"tool_use_stop", block_index:2}

… another tool block …

block_metadata {type:"text_block_start", block_index:4}
delta.content …                       ← the answer, with inline citation tags
block_metadata {type:"text_stop", block_index:4}

choices[0].finish_reason = "end_turn"  (+ usage)
object = "chat.completion.citations"   ← citations[], AFTER finish_reason
data: [DONE]
```

Three traps this app had to fix after the live run:

1. **`tool_use` is a content tag, not a stop tag.** Treating it as a stop closes
   the tool block on its first argument chunk. The stop tags are
   `tool_use_stop` / `mcp_tool_use_stop`.
2. **Tool arguments arrive as `delta.content`.** Rendering prose verbatim leaks
   `{"doc_name": …, "pages": "133-135"}` into the answer.
3. **The citations frame arrives after `finish_reason`.** A consumer that stops
   at `finish_reason` (or at the first `done`) never sees `bbox`, `block_id`, or
   `block_type`. Read until `[DONE]`.

The stream carries **no thinking** and **no tool results** (matches the SDK's
`_cloud_chunk_events`). `stream_metadata` is not required to receive
`block_metadata`.

Non-streaming (`stream:false`) returns the OpenAI envelope **plus a top-level
`citations` array** with the same bbox data.

### 3.4 Citations

Two tag formats are emitted (both parsed by the SDK's `_parse_citations`):

```
<doc=Annual Report.pdf;page=12;block=p12_text_3>
<cite doc="Annual Report.pdf" page="12" block="p12_text_3"/>
```

Verified details:

- The cited identifier is the document **name**, not its id.
- Cloud documents indexed since **2026-09-13** carry block ids; page-only tags
  remain valid for older documents and structure outlines.
- The citations frame resolves each tag:

```json
{ "document": "…pdf", "page": 134, "block_id": "p134_text_10",
  "bbox": [174, 600, 855, 676], "block_type": "text" }
```

`client.get_citations(answer)` returns the same resolution, and
`client.resolve_citations(answer)` converts tags into numbered markdown links
(`[[1]](#pageindex-citation-01)`) with **the same source reusing its number** — the
numbering convention this app's chips follow. `client.highlight_region(image, bbox)`
draws the box on the page image; this app draws it as a CSS overlay instead.

**Blocks are not embedded in page OCR.** Verified: `format=page` page objects
have no `blocks`; a block is fetched individually by id. So a client either
fetches `/block/{id}` per citation (this app) or renders only page-level
highlights.

### 3.5 Statuses

`queued` → `processing` → `completed` | `failed`, asynchronous. This app polls
`/docs/` and `/doc/{id}/metadata/` while any document is pending.

---

## 4. The modern lane (what "not legacy" means)

`https://api.pageindex.ai/mcp` — MCP over HTTP, `Authorization: Bearer <key>`.
It exposes the retrieval/chat layer only: documents must already be indexed, and
the docs are explicit that it "does not share files or usage with PageIndex Chat".
Tools include `browse_documents`, `search_documents`,
`get_document_structure`, `get_page_content`, `get_document_image`,
`find_relevant_documents` (`@pageindex/sdk`'s `client.tools.*` wraps them).

**Inference.** MCP is the recommended integration *when you already run a model*:
the agent loop and the answer live in your app.

**Implemented (live-verified).** With `OPENAI_API_KEY` set, the app opens an MCP
session (`StreamableHTTPClientTransport`, `Authorization: Bearer <PageIndex key>`),
lists tools, withholds destructive ones, and drives them with `streamText` +
`stepCountIs(12)`. A live run against the account produced this tool order:
`get_folder_structure` → `browse_documents` (relevance query) → `get_document` →
`get_document_structure` → `get_page_content`, then an answer citing
`<cite doc="…" page="135" block="p135_text_8"/>`. The block id resolved to
`bbox [154,711,824,753]` through `GET /doc/{id}/block/{block_id}/`.

Two wires therefore exist for the same product surface, and the app ships both:

| | MCP lane (default with a model key) | Managed lane (fallback) |
| --- | --- | --- |
| Agent | ours (AI SDK v7 + OpenAI) | PageIndex's |
| Citations | model-written tags; bbox resolved per block | tags + `chat.completion.citations` frame |
| Tool activity | real `tool-call` / `tool-result` parts | `block_metadata` tags |

---

## 5. Decisions in this build

| Decision | Why |
| --- | --- |
| BFF Route Handlers; `PAGEINDEX_API_KEY` server-only | Matches the shipped app's shape; key never reaches the bundle. |
| Managed chat lane (`/chat/completions/`) | No third-party model key needed; returns bbox-level citations. MCP lane documented, not enabled. |
| Read the stream to `[DONE]`, then emit `done` | The citations frame lands after `finish_reason`. |
| Accumulate `tool_use` deltas as tool args | They are JSON, not prose. |
| Boundary-aware block assembly | Citation tags can straddle prose-block boundaries; dropping a block blindly slices tags and leaks `;page=…;block=…>`. |
| Page windowing + short-lived server cache | `type=ocr` returns the whole document; a 584-page book must not be re-sent per click. |
| Citation preview card + artifact panel | Follows the user's description of the official app: hover/tap → details + Open page → document beside the chat. |
| Chats in our own Postgres | The Cloud API has no conversation resource and the official app's storage is behind its own auth, so conversations are recorded here instead — scoped to tenant and author, with turns and answer runs as rows. |
| `beta_headers=["block_reference"]` on upload (configurable) | Block ids/bboxes for block-level citations. Still the SDK's example, not a verified-stable contract. |

---

## 6. Unknowns / not verified

1. **The authenticated product UI.** Observed live on 2026-10-23 (Free plan): chat,
   composer, message toolbars, tool-step expansion, Share dialog, document panel,
   `/documents`, `/settings` (incl. Privacy & Data and the Connect/MCP panel),
   `/usage`, `/subscription`, and the mobile (390×844) layout. Still unobserved:
   Team Space internals (roles, invites, team billing — create dialog says
   `$150/mo for 5 seats`), the PDF viewer's own toolbar, `/explore/:slug`,
   `/explore/manage`, and the admin-only `/library`.
2. **What the official BFF calls.** The browser talks to its own **oRPC** layer
   (`/api/orpc/<router>/<proc>`, e.g. `landing/getSharedFileUrl`) plus
   `/api/auth/session`; whether the server then uses `/chat/completions` or a newer
   internal endpoint is still behind auth.
3. **`block_reference` beta.** Whether the name is still required (our account's
   existing document has blocks without us uploading), and whether pages ever
   carry an inline `blocks[]` array for other plans.
4. **Quotas / plan gating.** `@pageindex/sdk` declares `USAGE_LIMIT_REACHED`,
   `PLAN_REQUIRED`, `RATE_LIMITED`, `FOLDER_SCOPE_VIOLATION`; this app surfaces
   messages but does not special-case them.
5. **Upload limits** (server-side maximum size, PDF-only enforcement) — the
   50 MB cap in `/api/upload` is this app's own guard.
6. **`/retrieval/`** exists (`405` on GET) but is absent from the OpenAPI paths and
   the API reference; unused here.
7. **Share links / public chats.** Resolved: `/share/chat/:shareId` and
   `/share/doc/:shareId` render read-only, unauthenticated views (no `/share/folder`
   sample was found, but the route exists). Share access is per-source and can be
   limited to chat / preview / downloads.

---

## 7. Reproduce

```bash
KEY=$(grep '^PAGEINDEX_API_KEY=' .env.local | cut -d= -f2-)

# stream grammar (watch for the citations frame after finish_reason)
curl -N -H "api_key: $KEY" -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What is a subspace? Cite it."}],
       "doc_id":"<doc_id>","stream":true,"enable_citations":true}' \
  https://api.pageindex.ai/chat/completions/ | tail -5

# a block behind a citation
curl -s -H "api_key: $KEY" \
  https://api.pageindex.ai/doc/<doc_id>/block/p134_text_10/ | jq

# page render (presigned)
curl -s -H "api_key: $KEY" \
  "https://api.pageindex.ai/doc/s3/<doc_id>/images?start=134&end=134" | jq '.images[0]'
```
