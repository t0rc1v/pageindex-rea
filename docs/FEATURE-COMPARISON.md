# `app.pageindex.ai` vs this clone — feature & UX comparison

Evidence pass: 2026-10-23. Three rounds: unauthenticated public shares, an
authenticated live account (Free plan, real chat created), and a **mobile**
(390×844) plus **network/platform** pass. Sources are labelled **[live]**,
**[authed]**, **[mobile]**, **[net]**, **[shipped code]**, **[marketing]**.

---

## 0. Method and confidence

| Source | What it gave |
| --- | --- |
| **Live, unauthenticated** | `/login`, `/explore`, `/share/chat/:id`, `/share/doc/:id`, citation hover, tool steps, Sources |
| **Live, authenticated** | `/chat` onboarding, a real chat (`/chat?session=…`), message toolbars, tool expansion, Share dialog, document panel, `/documents`, `/settings`, `/usage`, `/subscription` |
| **Mobile emulation** | 390×844 @3x: chat, drawer, citation → viewer, `/documents`, `/explore` |
| **Network (oRPC)** | every `/api/orpc/*` call + request/response bodies for the chat page |
| **Shipped client bundle** | 50 public chunks + **19 additional authenticated chunks** (composer, export, picker, MCP) |
| **Marketing product shots** | citation popover, multi-doc tabs, PDF fidelity |

Widths, font sizes and colours below are read from the live DOM's computed
styles, not estimated.

---

## 1. The authenticated app — desktop UI

### 1.1 Shell **[authed]**

- **Dark only**: canvas `rgb(9,9,11)`, text `rgb(250,250,250)`, **Geist** 16 px,
  blue accent, `theme-color #3788D8`.
- Sidebar ~198 px (icon rail when narrow): wordmark, collapse toggle,
  **New Chat / Documents / Explore**, **Recents**, footer = avatar + name + plan +
  **Upgrade** + usage meter (`0%`, a small ring in rail mode).
- No Library entry (admin-gated); no Contact entry on this plan.

### 1.2 Composer **[authed]**

- **768 × 145 px**, radius 16, `rgb(24,24,27)`, border `rgba(255,255,255,.1)`;
  textarea 14 px, `min-h-12`, `max-h-48`.
- `+ Select Documents` pill → **popover picker**: `Search documents …`, folder rows
  with icon + resource count + chevron, a multi-select checkbox, footer
  `Upload` · `Open folder ⇥` · `Select`.
- Circular `↑` send → stop square while streaming; placeholder `Ask a question...`,
  and `AI is thinking...` during a run.

### 1.3 Conversation **[authed]**

- Answer **16 px / 24 px**, column **768 px**.
- User turn: context card above the bubble (`Following · 1 File`), blue bubble.
- Tool rows: icon + label + chevron, **shimmer while running**; expanding reveals a
  real result — `get_document_structure` → outline as title ↔ `Page N` table;
  page reads → document chip + `Returned pages 1–3` + raw excerpt. A `</>` button
  opens **"View raw input and output"** (JSON).
- Reasoning row: **`Thought for 1 seconds`** (visible on mobile capture).
- Assistant toolbar: **Copy**, **Download**, **Regenerate** + `Today at 4:37 PM`.
  User toolbar: **Copy message**, **Edit message**, **Regenerate**.
- Citation chips 12 px, `#C3D8F5` on blue @15 %, radius 4, `doc p.N`.
- **Sources**: `Sources` + `17 references · 1 document` + hairline + chevron;
  expanded = numbered doc rows with page links (`p.1 p.2 p.3 …`) and `17 refs`.

### 1.4 Citation card **[authed]**

**320 × 204**: filename, **`Page 10 of 13`** + **`Text block`** pill, page thumbnail
with the cited region highlighted, block text (3-line clamp), `Open page ↗`.

### 1.5 Document panel **[authed]**

- **508 px** here / 618 px on the share page, resizable; header = thumbnail +
  filename + `Document` + `X`; PDF with **determinate `Loading document 72%`**;
  scrolls to the page and highlights the block; chat column reflows narrower.

### 1.6 Share **[authed]**

`Share` pill → `Create share link` dialog: "Generate a read-only link to this
conversation and only the documents it actually references", callout **"Only
referenced documents are shared"**, revocation warning, `Cancel` / `Create share link`.

### 1.7 Documents / Settings / Usage / Subscription **[authed]**

- `/documents`: **Following** (1 saved resource) and **Shared with me** cards,
  `My Documents` toolbar = **Upload**, **Create Folder**, search, **grid⇄list**.
- `/settings` hub with a modal nav: **Workspace** (Settings, Subscription, Usage,
  Privacy & Data) · **Integrations** (Connect, Enterprise) · **Other** (Team Space).
- `/usage`: `0 of 1,000 pages`, `1 of 100 queries`, Pro upsells.
- `/subscription`: Free ($0; 1,000 pages, 100 messages) vs **Pro $20/mo**, Monthly/Annual.

---

## 2. Mobile (390×844 @3x) **[mobile]**

| Surface | Behaviour |
| --- | --- |
| Shell | Sidebar becomes a **left drawer** over a dimmed backdrop, full nav + account footer; desktop rail is gone |
| Chat top bar | Only `Toggle Sidebar` and an **icon-only `Share`** — no title, no header |
| Conversation | Context card + bubble go full-width; tool labels **truncate with ellipsis**; `Thought for 1 seconds` row present; message toolbar icons right-aligned under the user bubble |
| Composer | Pinned to the bottom, full width, same `+ Select Documents` pill and circular `↑` |
| **Citation tap** | Opens a **full-height `Document Viewer` sheet** — title, subtitle "View referenced documents from the conversation.", doc header (thumbnail + name + `Document` + `X`), PDF + progress. The inline desktop panel is *replaced*, not just hidden |
| `/documents` | Cards stack vertically; `Upload` + `Create Folder` on one row, search + view toggle wrap to a second row |
| `/explore` | Single-column pack list |

Mobile is a first-class layout, not a squeezed desktop: the drawer, the icon-only
Share, and the citation→sheet transition all have dedicated behaviour.

---

## 3. Non-UI / platform surface **[net]** **[shipped code]**

### 3.1 API layer — oRPC, not REST

Every browser call is `POST /api/orpc/<router>/<proc>` with `{json: …}`, plus
`GET /api/auth/session`. Observed on one chat page:

| Procedure | Payload | Meaning |
| --- | --- | --- |
| `chat/listSessions` | `{limit:30}` | server-side chat list (cross-device) |
| `chat/getSession` | `{sessionId}` | full transcript |
| `user/getUser` | `{}` | profile |
| `folder/tree` | `{scope:"personal"}` | folder tree (team/personal scopes) |
| `file/list` | `{folderId, limit, mode:"mcp", goldenDataFilter:"personal", includeFailedFiles}` | document listing |
| `file/recents` | `{limit}` | `uploadItems` + `chatItems` (including shared) |
| `file/resolveCitations` | `{items:[{doc, blockIds[]}]}` | **bulk** citation → bbox/block resolution |
| `explore/getBySlug` | `{slug}` | public pack |
| `share/getSharedSource` | `{shareId}` | shared source |
| `share/listSavedShares` | `{}` | saved/followed shares |
| `share/resolveSavedShareCitations` | `{shareIds, items}` | shared-source citations |
| `share/getChatShareEligibility` | `{sessionId}` | `{canShare, reason, dependencyCount, sourceCounts:{official,user}}` |
| `subscription/getSubscriptionStatus` | `{}` | `{hasSubscription, isPro, status, periodStart/End, cancelAtPeriodEnd, billingPeriod, pendingPlanSwitch, isLegacyUser}` |
| `usage/getUsageStats` | `{}` | `{page:{total,limit,available}, chat:{total,limit,available,percentage,shouldShowWarning}, isPro, hasSubscription, canPurchase}` |

### 3.2 Metering and plans

- Two independent budgets: **pages** (`limit 1000` on Free) and **chat queries**
  (`limit 100`, with `percentage` and `shouldShowWarning`).
- Free $0 (1,000 pages, 100 messages, community support) · **Pro $20/mo** (full chat,
  buy more pages, priority support, 5K new-user pages) · **Team $150/mo for 5 seats**
  (one shared space, members, billing; personal space stays separate) · seats by
  `/seat/mo` · `/seat/yr`; top-ups via `canPurchase`.

### 3.3 Ingestion

- Upload accept list (`ACCEPT_DOCUMENTS`): **PDF, CSV, Markdown (.md/.markdown),
  Text (.txt)**, `multiple`, plus **`.zip`** bundles (`isUploadOnlyBundle`) whose
  folder structure is rebuilt.
- `detectDocumentFormat` also knows **docx**; `documentFormatLabel` gives per-type
  labels; icons ship for `pdf`, `csv`, `markdown`.
- Onboarding copy promises "PDF, Word, PowerPoint or ZIP".

### 3.4 Answer export and rich artifacts

- **Export the answer** as **Markdown (.md)**, **Word (.docx)**, or **PDF (.pdf)**,
  with toasts (`Exporting Markdown…`, `Markdown file downloaded`,
  `Failed to export Word document`). This is the `Download` toolbar button.
- **Copy Code**, **Download file**, **Copy link**.
- **Mermaid diagrams** → `Copy`, `Download diagram as SVG / PNG / MMD`.
- **Tables** → `Copy table as Markdown / CSV / TSV`, `Download table as CSV / Markdown`.
- **Images** → `Download image`.

### 3.5 MCP / agent integrations

- The chat app **is an MCP server**: `https://app.pageindex.ai/mcp` answers
  `401 {"error":"invalid_token"}` without OAuth, with `/oauth/authorize` alongside.
- Settings → **Integrations → Connect**: "Use PageIndex with your preferred LLM",
  "Connect PageIndex to Claude, Cursor, and other AI apps — **included in your
  PageIndex Plan**". Cards: **Claude** (install-free, online PDFs, Claude Pro
  required), **Claude Desktop** (*recommended*, `.mcpb` **Download Extension**,
  online + local PDFs), **Cursor** (one-click `Add to Cursor` deeplink), **General
  MCP** (manual config + GitHub repo). Also "Programmatic MCP access available on
  PageIndex Developer Platform".
- `file/list` carries `mode:"mcp"` — the same listing powers the MCP tool surface.

### 3.6 Privacy, data, lifecycle

- **Privacy & Data**: `Allow data collection for model improvement` toggle ("If
  disabled, your chat and file data will not be collected for any training
  purposes"). **Danger Zone** → **Delete All Files** ("Permanently delete all your
  uploaded documents and files"), plus account deletion.
- Editing a user message **re-runs the turn** (`Failed to edit message`).
- Rate-limit handling exists (`Failed to handle rate limit response`), and
  `shouldShowWarning` drives a quota warning in the UI.
- Sharing is dependency-scoped: a chat share carries only the documents it cites,
  and revoking any source breaks the link (`sourceCounts` distinguishes official
  vs user-owned sources).

---

## 4. Status against this clone

Legend: **✔ parity** · **◐ partial** · **✗ missing**

### 4.1 Shell and navigation

| Feature | Clone | Note |
| --- | --- | --- |
| Sidebar, icon rail, mobile drawer | ✔ | |
| New chat / Documents | ✔ | |
| **Explore** entry + public packs | ✗ | |
| Recents with rename/delete | ✔ | localStorage vs server |
| Recents **share** + shared indicator | ✗ | |
| Account footer (avatar, plan, Upgrade) | ✗ | |
| Usage meter (`%`, ring in rail mode) | ◐ | doc/page counts, no quota |
| Dark shell + rounded app panel | ✗ | paper theme |
| Settings hub (Workspace / Integrations / Other) | ✗ | flat settings page |

### 4.2 Conversation

| Feature | Clone | Note |
| --- | --- | --- |
| Chat + document beside it | ✔ | 430 px fixed panel |
| Context card above the user bubble | ✗ | |
| Blue user bubble | ◐ | black bubble |
| Reasoning row (`Thought for Ns`) | ✗ | |
| Tool rows: icon, chevron, shimmer | ◐ | 11 px flat line, spinner/✓ |
| **Expanded tool result** (outline table / returned pages) | ✗ | |
| **`View raw input and output`** | ✗ | |
| Citation chips | ✔ | ours adds number + `· block` |
| **Sources** hairline + counts + grouping | ◐ | dashed chip strip |
| **Copy / Download / Regenerate** + timestamp | ✗ | |
| **Edit message → re-run** | ✗ | |
| **Export answer .md / .docx / .pdf** | ✗ | |
| Mermaid + table/image copy & download | ✗ | remark-gfm tables only |
| Scroll-to-bottom affordance | ✗ | |
| Stop generation | ✔ | |
| Share chat / read-only view | ✗ | |

### 4.3 Citations and the reader

| Feature | Clone | Note |
| --- | --- | --- |
| Hover citation card (320 px) | ✔ | |
| Block text + page highlight | ✔ | bbox overlay |
| `Page N of M` + block-type pill | ✗ | |
| `Open page ↗` | ◐ | small button |
| Resizable panel + **tabs per document** | ✗ | |
| **True PDF + determinate progress** | ✗ | page JPEG + OCR markdown |
| **Mobile: full-height `Document Viewer` sheet** | ◐ | full-screen overlay, no title/desc |
| `Document info`, `Add Page to Chat` | ✗ | |
| Bulk `resolveCitations` server call | ◐ | per-block fetch |

### 4.4 Platform

| Feature | Clone | Note |
| --- | --- | --- |
| Server-side chats (cross-device) | ✗ | localStorage |
| Auth (Google/GitHub/magic link) | ✗ | single-user key |
| Page + query metering, warnings | ✗ | |
| Plans, Stripe, invoices, seats, team space | ✗ | |
| **Answer export (md/docx/pdf)** | ✗ | |
| **MCP server + Connect UI (Claude/Cursor)** | ◐ | we consume PageIndex MCP; we don't expose one |
| Ingestion formats | ✗ | PDF only (no CSV/MD/TXT/ZIP) |
| `file/resolveCitations` bulk resolution | ✗ | |
| Privacy toggle + delete-all-files | ✗ | |
| Share eligibility / dependency-scoped shares | ✗ | |

---

## 5. Gaps ranked

**P0 — reads as a different product without these**

1. **Inspectable work**: expandable tool steps with real results, shimmer while
   running, `View raw input and output`.
2. **Message toolbar**: Copy / **Download (md · docx · pdf)** / Regenerate, timestamp,
   and **edit-and-rerun** on user turns.
3. **Tabbed, resizable, PDF-backed document panel** (+ mobile viewer sheet).
4. **Sources** as a real section with counts and per-document grouping.
5. **Share chat** (pill → dialog → read-only `/share/chat/:id`).
6. **Citation card parity**: `Page N of M`, type pill, `Open page ↗`.

**P1**

7. Composer parity: `+ Select Documents` popover picker, glyph submit, thinking state.
8. Answer artifacts: Mermaid render + table/image copy & export.
9. Account footer, usage meter, `/usage`, Privacy & Data, Settings hub.
10. Documents: Following / Shared-with-me, grid⇄list, Create Folder.
11. **Ingestion breadth**: CSV, Markdown, TXT, ZIP bundles.

**P2 — commercial**

12. Auth, server-side chats, `/subscription` (Pro $20, Team $150/5 seats), Stripe.
13. **MCP exposure** (`/mcp` + `/oauth/authorize` + Connect UI) — we are a consumer
    of PageIndex MCP, the official app is a *provider*.
14. Rate limits, quota warnings, delete-all-files.

---

## 6. UI/UX refinements, measured

| Property | Official | Clone |
| --- | --- | --- |
| Canvas / text | `rgb(9,9,11)` / `rgb(250,250,250)` | `#f7f5f1` / `#191817` |
| Type | Geist 16 px, no serif | Source Serif body/headings |
| Accent | blue (`#3788D8`, chips `#C3D8F5`) | orange `#b4622b` |
| Column / composer | 768 px both; composer 145 px, radius 16 | 768 px; composer 2-row card |
| Submit | circular `↑` / stop square | rectangular **Send** + hint text |
| User bubble | blue, white text | black, `text-paper` |
| Chip | 12 px, `2px 6px`, `doc p.N` | 10 px, mono number + `· block` |
| Citation card | 320 × 204, `Page N of M` + pill | taller, block id, small CTA |
| Sources | hairline + `N references · M documents` | dashed border + chips |
| Panel | 508–618 px, resizable, tabs, PDF | 430 px fixed |
| Tool row | 16 px icon, chevron, shimmer | 11 px, spinner/✓ |
| Mobile | drawer + icon-only Share + viewer sheet | sheet |

**Do first:** (1) message toolbar + export, (2) tool-step expansion + raw I/O,
(3) Sources rewrite, (4) citation card, (5) panel tabs/resize/PDF, (6) composer.
Then ingestion breadth and the account/usage surfaces.

---

## 7. Still unverified

1. **Team Space internals** — `$150/mo for 5 seats` is confirmed from the create
   dialog, but member roles, invitation flow and team billing screens need a team plan.
2. **PDF viewer chrome** (zoom, page jump, in-document search, download) — the panel
   was still loading in every capture; only the progress state was observed.
3. **`/explore/:slug` and `/explore/manage`** layouts; follow/unfollow confirmation.
4. **`/library`** (admin-only).
5. **Rate-limit thresholds and error copy** (only the handler exists in the bundle).
6. **Tablet widths** (768–1024) — only 390 and 1280 were captured.

---

## 8. Implementation status (this build)

Scope agreed with the operator: **auth and subscriptions are out**. Everything
below was built and verified against the mock API and, for one full answer, the
live Cloud API.

### Now at parity

| Gap from §5 | What shipped |
| --- | --- |
| P0-1 Inspectable work | `ToolStep` rows (icon + sentence + chevron, `pi-shimmer` while running) that expand into the real result — document outline as a title ↔ `Page N` table, or the returned pages fetched from `/api/docs/:id/pages`. `</>` opens **View raw input and output** with input/output JSON (`json-view.tsx`). |
| P0-2 Message toolbar | Copy, **Download** (Markdown; Print → Save as PDF), **Regenerate**, timestamp; on a question: copy + **edit-and-resend** (`message-actions.tsx`, `lib/chat-export.ts`). |
| P0-3 Document panel | One tab per document, pointer-resizable with clamped width persisted to localStorage, `Document info` popover, page image ↔ OCR text toggle, page nav, last page remembered per document; full-height bottom sheet under `lg` (`document-panel.tsx`). |
| P0-4 Sources | Hairline row → `N references · M documents`, grouped per document, numbered, page chips that open the preview, trailing `N refs` (`sources.tsx`). |
| P0-6 Citation card | `Page N of M`, block-type pill (`Text block`, `Table`, `Image`, …), `Open page ↗` (320 px card, bottom sheet on phones). |
| P1-7 Composer | Single card, `+ Select Documents` popover (search + multi-select + "whole library"), circular send/stop, `AI is thinking…` placeholder. |
| P1-8 Answer artifacts | Tables copy as Markdown / download as CSV; code blocks copy. |
| P1-11 Ingestion breadth | Upload accepts PDF, Word, PowerPoint, CSV, Markdown, TXT and `.zip` bundles, validated server-side (`ACCEPTED_EXTENSIONS`). |
| — | Reasoning row (`Thought for Ns`) holding the model's narration, timings persisted. |
| — | Error codes mapped to readable copy (`InsufficientCredits` → an actionable sentence). |

### Deliberately not built

- **Sharing** (`/share/chat/:id`), **subscriptions**, seats, team spaces, usage
  quotas and Stripe — no backend for them, and out of the agreed scope.
- **MCP server exposure** — this app consumes PageIndex's MCP; exposing its own
  `/mcp` + OAuth is a separate product.
- **True PDF rendering** — the Cloud API serves page images, not the source PDF.
- **Response branching** — regenerate replaces the answer instead of keeping
  sibling variants.

### Bugs found and fixed while verifying

1. **No `<meta name="viewport">`** — `app/layout.tsx` had no `viewport` export, so
   mobile browsers used a ~980 px layout viewport and every `sm:`/`md:` breakpoint
   fired on a phone. Fixed with a `viewport` export (and deliberately *without*
   `user-scalable=no`, so pinch-zoom still works on page renders).
2. **Raw citation markup flashed mid-stream** — the workspace rendered
   `stable + pending`, defeating `splitStreamingTail`, so a half-received
   `<doc=…;page=…` was painted as text. Now only `stable` is rendered.
3. **Export menu was invisible** — the dropdown lived inside the hover-only action
   row; an open menu now pins the row visible.
4. **Mock page renders 401'd** — `/render/*` sat behind the `api_key` gate, but an
   `<img>` cannot send headers. Exempted, matching how the real API hands out
   presigned URLs.
