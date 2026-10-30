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

Status as of the current build (revised 2026-10-30); §8, §9.10, §9.11 and
§9.12 record the work behind each ✔.

Legend: **✔ parity** · **◐ partial** · **✗ missing**

### 4.1 Shell and navigation

| Feature | Clone | Note |
| --- | --- | --- |
| Sidebar, icon rail, mobile drawer | ✔ | |
| New chat / Documents | ✔ | |
| **Explore** entry + public packs | ✗ | |
| Recents with rename/delete | ✔ | server-backed, per tenant + author |
| Recents **share** + shared indicator | ✗ | |
| Account footer (avatar, plan, Upgrade) | ◐ | avatar, Account and Settings; no plan or Upgrade |
| Usage meter (`%`, ring in rail mode) | ◐ | doc/page counts, no quota |
| Dark shell + rounded app panel | ◐ | paper is the default; dark ships as a theme |
| Settings hub (Workspace / Integrations / Other) | ◐ | one page with a sticky section nav |

### 4.2 Conversation

| Feature | Clone | Note |
| --- | --- | --- |
| Chat + document beside it | ✔ | 430 px fixed panel |
| Context card above the user bubble | ✔ | `turn.docs` snapshot |
| Blue user bubble | ◐ | black bubble |
| Reasoning row (`Thought for Ns`) | ✔ | elapsed time, not a reasoning trace |
| Tool rows: icon, chevron, shimmer | ✔ | |
| **Expanded tool result** (outline table / returned pages) | ✔ | |
| **`View raw input and output`** | ✔ | |
| Citation chips | ✔ | ours adds number + `· block` |
| **Sources** hairline + counts + grouping | ✔ | |
| **Copy / Download / Regenerate** + timestamp | ✔ | |
| **Edit message → re-run** | ✔ | previous wording + answer kept behind `‹ 2/3 ›` |
| **Export answer .md / .docx / .pdf** | ✔ | |
| Mermaid + table/image copy & download | ✔ | |
| Scroll-to-bottom affordance | ✔ | |
| Stop generation | ✔ | |
| Share chat / read-only view | ✗ | |

### 4.3 Citations and the reader

| Feature | Clone | Note |
| --- | --- | --- |
| Hover citation card (320 px) | ✔ | |
| Block text + page highlight | ✔ | bbox overlay |
| `Page N of M` + block-type pill | ✔ | |
| `Open page ↗` | ✔ | |
| Resizable panel + **tabs per document** | ✔ | |
| **True PDF + determinate progress** | ✗ | page JPEG + OCR markdown |
| **Mobile: full-height `Document Viewer` sheet** | ✔ | bottom sheet under `lg` |
| `Document info`, `Add Page to Chat` | ✔ | |
| **Chat about the document, in place** | ✔ | the reader grows a composer; its chats live under **Chat**, not Recents — §9.12 |
| Bulk `resolveCitations` server call | ◐ | per-block fetch |

### 4.4 Platform

| Feature | Clone | Note |
| --- | --- | --- |
| Server-side chats (cross-device) | ✔ | `chats` / `chat_turns` / `chat_runs` in Postgres — §9.11 |
| Auth | ◐ | Clerk: gated pages, personal space + Organizations; sign-in methods are Clerk instance config |
| Page + query metering, warnings | ✗ | |
| Plans, Stripe, invoices, seats, team space | ✗ | |
| **Answer export (md/docx/pdf)** | ✔ | client-side `docx` + jsPDF, Markdown export |
| **MCP server + Connect UI (Claude/Cursor)** | ◐ | we consume PageIndex MCP; we don't expose one |
| Ingestion formats | ✔ | PDF, Word, PowerPoint, CSV, Markdown, TXT and `.zip` bundles |
| `file/resolveCitations` bulk resolution | ✗ | |
| Privacy toggle + delete-all-files | ✗ | |
| Share eligibility / dependency-scoped shares | ✗ | |

---

## 5. Gaps ranked

Ranked at the §8 build. Delivered since, per §8 and §9.10: **1, 2, 4, 6, 7, 8,
11**; partial: **3** (tabs and resize, but page images not PDF), **9**, **10**,
**14**; open: **5** (share), **12** (billing — auth and server chats shipped,
§9.11), **13** (MCP exposure).

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

12. Billing: `/subscription` (Pro $20, Team $150/5 seats), Stripe. *(Auth and
    server-side chats have shipped — §9.11.)*
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

*(1), (2), (3), (4) and (6) and the resize/tabs half of (5) have shipped — §8 and
§9.10. What remains from this list is PDF fidelity, which the Cloud API withholds
(§9.9).)*

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
| P0-3 Document panel | One tab per document, resizable by pointer or ←/→ with clamped width persisted to localStorage, `Document info` popover, page image ↔ OCR text toggle, page nav, last page remembered per document; full-height bottom sheet under `lg` (`document-panel.tsx`). |
| P0-4 Sources | Hairline row → `N references · M documents`, grouped per document, numbered, page chips that open the preview, trailing `N refs` (`sources.tsx`). |
| P0-6 Citation card | `Page N of M`, block-type pill (`Text block`, `Table`, `Image`, …), `Open page ↗` (320 px card, bottom sheet on phones). |
| P1-7 Composer | Single card, `+ Select Documents` popover (search + multi-select + "whole library"), circular send/stop, `AI is thinking…` placeholder. |
| P1-8 Answer artifacts | Tables copy as Markdown / download as CSV; code blocks copy. |
| P1-11 Ingestion breadth | Upload accepts PDF, Word, PowerPoint, CSV, Markdown, TXT and `.zip` bundles, validated server-side (`ACCEPTED_EXTENSIONS`). |
| — | **Reader chat**: the mirror of §1.5 — a one-row composer under the page starts a conversation about that document, the panel beside it continues it, and a `Chat` menu lists the document's chats. A citation turns the reader instead of opening a viewer, `?chat=` keeps the panel through a reload, and the surface is docked ≥1280 px, a right-hand sheet 768–1279, a bottom sheet under 768 (`components/doc-chat/*`) — §9.12. |
| — | Reasoning row (`Thought for Ns`) holding the model's narration, timings persisted. |
| — | Error codes mapped to readable copy (`InsufficientCredits` → an actionable sentence). |

### Deliberately not built

- **Sharing** (`/share/chat/:id`), **subscriptions**, seat management and usage
  quotas, Stripe — no backend for them, and out of the agreed scope. *(Tenancy
  itself arrived later; see §9.11.)*
- **MCP server exposure** — this app consumes PageIndex's MCP; exposing its own
  `/mcp` + OAuth is a separate product.
- **True PDF rendering** — the Cloud API serves page images, not the source PDF.
- **Response branching** — regenerate replaces the answer instead of keeping
  sibling variants. *(Since superseded — see 9.10, item 1.)*

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

---

## 9. Remaining parity gaps

What is still open after §9.10 and §9.11 landed. Each subsection opens with what
it has since shipped, so the tables stay short and stay true. Every row names
what blocks it, because the three classes need very different work:

- **[ui]** — pure client work, no new infrastructure.
- **[svc]** — needs a service this build does not run: sharing, metering or billing.
- **[api]** — the PageIndex Cloud API does not expose it.

### 9.1 Frontend — chat

Delivered since: artifact menus, `.docx`/`.pdf` export, figure and table citation
previews, the attachment card, `Add Page to Chat` and local feedback — §9.10
items 2–8.

| Gap | Detail | Blocked by |
| --- | --- | --- |
| Conversation tree | Per-turn runs behind `‹ 2/3 ›` cover regenerate **and** edited questions (§9.10 item 1), but a later turn does not survive a branch switch. The official pairs sibling runs the same way; neither has a tree. | **[ui]** |
| Streamdown-style code rendering | Answers reveal through the typewriter (#5), but fenced code is still a plain `<pre><code>` with a copy button — no syntax highlighting. Theirs render through Streamdown. | **[ui]** — needs a highlighting dependency |
| Feedback sink | Thumbs are stored on the turn, locally (#8). Their client carries an `$ai_feedback` flag and toolbar slots; anything shared needs somewhere to send it. | **[svc]** for a real sink |

### 9.2 Frontend — documents, library, reader

Delivered since: grid ⇄ list toggle, rename/description, ZIP per-entry results,
per-file upload progress — §9.10 items 9–12 — and in-reader chat (§9.12).

| Gap | Detail | Blocked by |
| --- | --- | --- |
| **Following** view | "1 saved resource" card → live knowledge libraries you follow. | **[svc]** + **[api]** (no explore endpoint) |
| **Shared with me** view | "0 saved resources" card, per-view search, "Open a share link and add it to Documents". | **[svc]** |
| **Folder move** | Rename and description ship, but a document cannot be re-filed after upload: `PATCH /api/docs/:id` takes `name` and `description` only, and a folder move is not in the documented upstream API. Folders are chosen at upload time. | **[ui]** — local metadata, no upstream call |
| **Folder sharing, nested share links** | `/share/folder/:shareId`. | **[svc]** |
| **Saved collections** | `SAVED_COLLECTIONS`, official vs user attribution. | **[svc]** |
| **PDF rendering** | Theirs renders the source PDF (text selection, native tables). We render presigned page JPEGs plus OCR markdown, with a page-text toggle. | **[api]** — the Cloud API serves page images, not the original file |
| Reader fidelity | They highlight the cited block inside a PDF and scroll to it; we do page + bbox overlay + arrow paging. Neither has in-document search. | **[api]** for fidelity |

### 9.3 Frontend — shell, settings, onboarding

Delivered since: first-run onboarding with a sample document, the toast system and
shadcn `AlertDialog` — §9.10 items 13–15.

| Gap | Detail | Blocked by |
| --- | --- | --- |
| **Explore** | Public packs, featured carousel, category chips, search, `Learn more` / `Start chat`, follow, `/explore/:slug`, `/explore/manage`. | **[svc]** + **[api]** |
| **Account footer** | Avatar and Account/Settings ship; the plan label, **Upgrade** and the rail usage ring do not, because there is no billing. | **[svc]** |
| **Plan usage meter** | `0% · 0 of 1,000 pages`, `1 of 100 queries`, `shouldShowWarning`. We show indexed documents/pages — real data, but not a quota. | **[svc]** |
| **Settings hub** | The grouped nav lists Appearance / Connection / Chat lane / Conversations / Shortcuts; the official's Workspace (Subscription, Usage, Privacy & Data) and Integrations (Connect, Enterprise) sections have nothing behind them yet. | **[svc]** for most; the layout itself is **[ui]** |
| **Privacy & Data** | `Allow data collection for model improvement`, `Delete All Files`, account deletion. | **[svc]** (delete-all needs a server route) |
| **Connect (MCP)** | Claude Desktop `.mcpb` download, Cursor one-click deeplink, remote/local config. | **[svc]** — we would have to expose an MCP server |

### 9.4 UI/UX & design language

This layer is a **deliberate divergence**, not an oversight — "match or improve"
was read as "keep the reading identity". If pixel parity is the goal, the
remaining delta is typography, accent and density.

| Property | app.pageindex.ai (measured) | This app | Class |
| --- | --- | --- | --- |
| Theme | dark-only: canvas `rgb(9,9,11)`, text `rgb(250,250,250)` | warm paper `#f7f5f1` / ink `#191817` by default, dark available as a theme (#20) | decision |
| Typography | Geist only, 16 px / 24 px body | Geist UI + **Source Serif** transcript and headings | decision |
| Accent | blue, `#3788D8` theme colour, chips `#C3D8F5` | ochre `#b4622b`, `brand-soft` | decision |
| Citation chip | 12 px, `2px 6px`, `doc p.N`, no number | 10 px, mono number + `· block` | decision |
| Citation card | 320 × 204 | ~352 wide, taller | close |
| Column / composer | 768 px / 768 × 145, radius 16 | 768 px / 768 × 145, radius 16 (#18) | parity |
| Tool row | 16 px icon, shimmer, chevron | 16 px icon, shimmer, chevron | parity |
| Motion | 200 ms width/opacity, slide+fade collapsibles | `pi-enter` / `pi-sheet-in` on panels and collapsibles (#17) | parity |
| Density | sm 14 px controls, 36 px height | 11.5–13 px controls, tighter | decision |
| Toasts | Sonner | Sonner, plus `AlertDialog` for destructive actions (#14) | parity |

### 9.5 Backend / platform

Delivered since: server-side conversations and accounts (§9.11), and the test
harness (#19): 60 unit tests over citations, streaming grammar, exports,
variant pairing, citation placement, doc scope and the Clerk Frontend API, plus
Playwright e2e over steps → sources → branch → citation → appearance. CI runs
`verify` (secretless) and `e2e` (guarded).

| Gap | Detail | Blocked by |
| --- | --- | --- |
| **Sharing** | `/share/chat/<id>`, `/share/doc/<id>`, `/share/folder/<id>`, read-only views, access toggles (chat/preview/download), revocation, `Share Chat` dialog with `canShare` / `dependencyCount`. | **[svc]** |
| Billing | Pro **$20/mo**, Team **$150/mo for 5 seats**, monthly/annual switch, proration, Stripe portal, invoices, page top-ups. | excluded by request |
| **Team spaces** | A Clerk Organization is already a tenant (§9.11), so documents are org-scoped today; member management, roles, invites and seats are not built. | **[svc]** |
| Quota + rate limits | Page and query budgets, `shouldShowWarning`, upstream 429 handling with retry. We rate-limit streaming, uploads and conversation writes per user (`RATE_LIMITS`) and surface upstream errors, but do not meter pages or queries, and never retry. | **[svc]** metering / **[ui]** retry |
| **MCP server** | `https://app.pageindex.ai/mcp` returns `401 invalid_token` without OAuth; their settings ship Claude/Cursor installers. We are an MCP *client* only. | **[svc]** |
| **oRPC + TanStack Query** | They run a typed RPC router (16 procedures observed loading one chat page). We run a REST handler per resource; `useFetch` sits on TanStack Query, so caching and invalidation are real, but there is no typed contract between client and server. Adequate at this size. | **[ui]** refactor, optional |
| Observability | PostHog + Sentry in their bundle. We have no analytics, no error tracking, no structured logs. | **[svc]** (external) |
| Concurrency / backpressure | Handlers stream straight through: no queueing, no per-request budget, abort propagation only via the client `AbortController`. | **[ui]** |
| Upload hardening | Magic-byte sniffing compares the container with the claimed extension (#25). No resumable uploads, so a dropped connection restarts the file. | **[ui]** |

### 9.6 Data & persistence

| Gap | Detail |
| --- | --- |
| Chats | Postgres (`chats`, `chat_turns`, `chat_runs`), keyed to `(tenant_id, created_by)`; `listChats` returns the newest 60. Conversations left in `localStorage` by earlier builds are imported once, on the first authenticated load, under their existing ids. |
| Local state | Panel width and per-document last page in localStorage; appearance (theme / transcript / density) per browser; citation previews cached 30 min; page OCR cached ~5 min server-side. |
| Usage counters | None — no page/query accounting exists anywhere in this app. |
| Theirs | Relational records for chats, shares, saved collections, memberships, usage and subscriptions. |

### 9.7 Backlog A — no new infrastructure required

Complete list, superseding the earlier "six things" summary. **All of it shipped**
— §9.10 carries the same numbering and says where — with one exception: item 5's
Streamdown-style code rendering is still open (§9.1).

**Chat**

1. Response variants + prev/next branch control.
2. **Artifact menu completion**: TSV copy, per-table Markdown download, image
   download, copy link, **Mermaid rendering** (lazy-loaded) with SVG/PNG/MMD export.
3. **Export formats**: real `.docx` and `.pdf` generation, replacing print-to-PDF
   for those two formats.
4. **Citation variants**: figure/table previews using the `block_type` and
   `img_id` we already receive.
5. **Typewriter reveal** and Streamdown-style code rendering. *(Typewriter
   shipped; code highlighting did not — still open.)*
6. Attachment card above the user turn.
7. `Add Page to Chat`.
8. Local-only feedback (thumbs stored on the turn) until a sink exists.

**Documents**

9. **Grid ⇄ list toggle**.
10. Document rename + description via `PUT /doc/{doc_id}/metadata` (one BFF route).
11. ZIP per-entry results surfaced after upload.
12. Per-file upload progress.

**Shell**

13. **First-run onboarding** (welcome cards + sample pack).
14. **Toast system** + shadcn `AlertDialog`, replacing the 4 native dialogs.
15. Settings hub layout (grouped nav) over the existing sections.
16. Keyboard-shortcut parity (`⌘B` exists; panel/scope shortcuts do not).

**Craft**

17. Motion pass (200 ms panel/opacity transitions, collapsible slide+fade).
18. Composer height/radius parity (145 px / 16 px).
19. Test harness: Playwright over the transcript, unit tests for `citations.ts`,
    `chat-stream.ts` and `chat-export.ts`.

### 9.8 Backlog B — needs a service

Server-side **sharing** (chat/doc/folder + access toggles) · Explore, follow
and saved collections · Following + Shared-with-me · usage metering and
quotas · billing, plans, seats and team space · MCP server exposure · real
feedback capture · observability backend.

### 9.9 Blocked by the Cloud API

| Item | Why |
| --- | --- |
| True PDF rendering | Only page images (`/doc/s3/.../images`) and extracted figures are exposed; no source file. |
| Public Explore / follow | No endpoint for public packs or collections. |
| Folder move | `PUT /doc/{id}/metadata` is documented; a folder move is not. |
| Reasoning tokens | The managed lane streams no thinking — our `Thought for Ns` is elapsed time, not a reasoning trace. |

### 9.10 Backlog A — delivered

Every item below needs neither storage/auth/billing nor an API the Cloud service
withholds. Line references point at the commit that added it.

**Chat**

| # | Item | Where |
| --- | --- | --- |
| 1 | Response variants + branch control | `use-chat.ts` keeps `runs[]` per turn; `lib/chat-variants.ts` pairs a question version with the answers it got, so **editing a question** also keeps the previous wording and its answer behind a branch control (`‹ 2/3 ›`), with Regenerate staying available for every variant |
| 2 | Artifact menu completion | `markdown.tsx` (TSV copy, MD download, image save/link), `markdown-mermaid.tsx` (lazy Mermaid + SVG/PNG/MMD export) |
| 3 | Export formats | `chat-export.ts`: `exportDocx` (real OOXML via `docx`) and `exportPdf` (jsPDF text layout) |
| 4 | Citation variants | `citation-card.tsx`: figure/table citations are cropped from the page render and labelled "Cited figure" / "Cited table" |
| 5 | Typewriter reveal | `use-typewriter.ts`, applied to the *stable* text only |
| 6 | Attachment card above the question | `turn.docs` snapshot rendered above the bubble |
| 7 | Add page to chat | `document-panel.tsx` → `addPageToChat` → `/api/chat` system preamble |
| 8 | Local feedback | thumbs on the message row, persisted per turn |

**Documents**

| # | Item | Where |
| --- | --- | --- |
| 9 | Grid ⇄ list toggle | `library-view.tsx`, persisted with `useLocalFlag` |
| 10 | Rename / description | `PATCH /api/docs/:id` → `PUT /doc/{id}/metadata`; `RenameDialog` |
| 11 | ZIP per-entry results | `submitDocument` returns the API body; `summarizeEntries` toasts "n of m queued" |
| 12 | Per-file upload progress | `apiUploadWithProgress` (XHR), percentage in the pending row |

**Shell**

| # | Item | Where |
| --- | --- | --- |
| 13 | First-run onboarding + sample | `onboarding.tsx` + `public/sample/getting-started.md` (uploaded through the normal path) |
| 14 | Toasts + AlertDialog | `sonner` Toaster in `providers.tsx`; `ConfirmProvider` replaces all `window.confirm/alert` |
| 15 | Settings hub | `settings-view.tsx`: sticky section nav (Appearance / Connection / Chat lane / Conversations / Shortcuts) |
| 16 | Shortcut parity | `⌘K` composer focus, `⌘B` sidebar, arrows in the reader, `Esc` everywhere |

**Craft**

| # | Item | Where |
| --- | --- | --- |
| 17 | Motion pass | `pi-enter` / `pi-sheet-in` in `globals.css`; panel + collapsible transitions |
| 18 | Composer parity | 145 px card, 16 px radius, circular send/stop *(the 145 px card is since superseded — see §9.12)* |
| 19 | Tests | `vitest`: citations, streaming grammar, markdown export, **real jsPDF output**; `playwright`: steps → sources → branch → citation → appearance |

**Decision items now switchable rather than forced**

| # | Item | Where |
| --- | --- | --- |
| 20 | Dark theme | token overrides under `.dark` in `globals.css` |
| 21–23 | Density / transcript / full parity | Settings → Appearance (`serif` vs `sans`, comfortable vs compact) so the reading identity stays the default while parity is one click away |

**Platform**

| # | Item | Where |
| --- | --- | --- |
| 25 | Upload content sniffing | `sniffContainer` in `/api/upload` compares magic bytes with the claimed extension |
| 26 | Query layer | `useFetch` re-implemented on TanStack Query (shared cache, invalidation, `refetchInterval`), no call-site churn |

**Not delivered:** nothing in this batch. Playwright runs against the installed
Chrome (`channel: "chrome"`) so no browser download is required.

---

## 9.11 Delivered — accounts, tenancy, server-side conversations

Shipped after §8 and §9.10. The rows in §4.1, §4.4, §5, §9.5, §9.6 and §9.8 that
said "localStorage" or "single-user key" are corrected here as well; §1–§3 are
unchanged, because they describe `app.pageindex.ai`.

| Piece | What shipped | Where |
| --- | --- | --- |
| Accounts | Clerk gates every page and Route Handler. `auth.protect()` runs inside each handler rather than a URL matcher, so Server Functions and paths Next normalizes differently are covered too. | `proxy.ts`, `app/(shell)/*/page.tsx` |
| Tenancy | `tenants` holds both personal spaces (`clerk_org_id` null) and Clerk Organizations. `requireTenant()` is the only place a request becomes a tenant — `tenantId = orgId` inside an org, the caller's personal tenant otherwise — so every query filters one column. | `lib/server/tenant.ts`, `lib/db/schema.ts` |
| Sync | `POST /api/webhooks/clerk` mirrors `user.*` and `organization.*` into `users` / `tenants` (svix signature; 503 without a signing secret). Lazy creation in `requireTenant` means a first request never waits for a delivery, and both paths are race-safe. | `app/api/webhooks/clerk/route.ts`, `lib/server/clerk-sync.ts` |
| Ownership | `documents` is this app's registry: `(tenant_id, pageindex_id)` unique, plus the workspace display name, folder and status. The Cloud API is account-global, so this table is what makes "is this document yours?" answerable at all. | `app/api/docs/*` |
| Conversations | `chats` (tenant + author, scope docs as JSON), `chat_turns` (ordered, role), `chat_runs` (one answer variant per run, so regenerate and edit-and-resend both keep history). Recents reads newest-first per author; delete-all is rate-limited. | `lib/server/chats.ts`, `lib/chat-store.ts` |
| Legacy import | Chats written to `localStorage` before this change are uploaded once under their existing ids, then the local copy is dropped. | `lib/chat-store.ts` |

What this changes about the comparison: conversations are now a **record**, like
theirs, so cross-device and "lost on clear" stop being caveats. Still absent from
this surface, unchanged from §9.5 and §9.8: sharing (chat/doc/folder + access
toggles), usage metering and quotas, billing/plans/seats, and team roles.

---

## 9.12 Delivered — the reader's own chat surface

The reverse of §1.5. In `/chat` the conversation is the page and the document is
the panel; in `/doc/[docId]` the document is the page and the conversation opens
beside it. Same transcript, same streaming, same variants — only the direction a
citation travels is inverted.

| Piece | What shipped | Where |
| --- | --- | --- |
| Composer | One row under the page, scope locked to the document and named by the panel header rather than a chip, `⌘K`. Sending starts a **new** chat; it never appends to the one already in the panel. | `components/doc-chat/doc-composer.tsx` |
| Composer rules | Draft, autosize to a per-surface ceiling, Enter sends / Shift+Enter newlines, nothing sends mid-IME, clear on send — one hook for all three surfaces, each keeping its own chrome and send/stop button. | `components/chat/use-composer.ts`, `lib/composer-keys.ts` |
| Panel | Title + chat switcher, transcript, and its own composer. Stop, regenerate, edit, branch and feedback come from the shared transcript rather than a second implementation. Docked ≥1280 px, right-hand sheet 768–1279, bottom sheet under 768. | `doc-chat-panel.tsx`, `chat-transcript.tsx` |
| Chat list | Recency-ordered, new / rename / delete, count badge; the same control renders in the reader header and in the panel header, so switching conversations never means going back first. | `doc-chat-menu.tsx` |
| Citation direction | Chip → preview → `Open page ↗` turns the reader under the panel. Below 1280 px the panel closes first, or it would cover the page it just opened. A citation from another document opens that document's reader at its page. | `components/doc-view.tsx` |
| Page pinning | Every question asked from the reader attaches the page on screen as an already-open page. Additive, not a filter — the document stays in scope, so answers can still cite anywhere. A new page replaces the previous automatic pin, and removing the chip retracts it until the reader turns the page. The turn and the stop button appear before the pin resolves, and a pinned page is reused on follow-ups. | `lib/page-context.ts`, `doc-chat-panel.tsx` |
| Address bar | `?chat=` names the open conversation; `page` and `block` keep working on the same URL, and each writer preserves the others' parameters. | `use-doc-chat.ts` |
| Panel width | Drag the grip on the docked panel's left edge, or focus it and press ←/→ (Home resets). 380–560 px, 420 by default, remembered per browser. Past 480 px the tree is what gives way, and it returns when the panel closes. | `hooks/use-panel-width.ts`, `panel-resize-handle.tsx` |
| Storage | `chats.origin_doc_id` marks where a conversation was born — the PageIndex id, the same space `scopeDocs[].id` uses. Recents and a document's list are disjoint, and origin is written once: a later save cannot move a chat between them. | `lib/db/schema.ts`, `lib/server/chats.ts`, `lib/chat-store.ts` |

Evidence: `e2e/doc-chat.spec.ts` — twelve specs covering composer → panel, the
first message landing before the page pin resolves, reload from `?chat=`, panel
composer continues the same chat, pointer/keyboard panel resizing that also
survives a reload, the reader's chat menu painting above the page behind it, a
citation turning the reader without opening a second panel, the phone sheet
closing on a citation, and the menu's list/rename/delete. The hydration guard in
`e2e/fixtures.ts` also covers a panel opened straight from a query parameter.

All three composers share one shape now — a single row that grows to three lines,
16 px radius, 36 px send/stop — with `/chat`'s document picker and its clear
control inline at the left, and the context chips above. The reader's composer no
longer repeats the document in a locked chip: the panel header already names it,
and the row belongs to the question. That drops the 145 px card §9.10 matched in
the official app on purpose: one composer shape across three surfaces is worth
more than parity in one of them.

