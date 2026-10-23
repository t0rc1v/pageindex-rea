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
- **Chat-first** — ask across the whole library or a chosen scope. The answer
  streams with the retrieval steps shown (`Read the outline`, `Read pages 135-136`),
  numbered inline citations, and a Sources row.
- **Citation preview** — hover on desktop, tap on mobile: the cited page thumbnail
  with the block outlined, the block's own text, block type/id, and **Open page**.
- **Artifact panel** — Open page opens the document beside the chat, on the cited
  page, with the block highlighted; step pages, jump to the full reader, close.
- **Document reader** — the PageIndex tree as a navigable outline, page text as
  markdown (tables, figures), rendered page images with block highlight, keyboard
  paging.
- **Library** — documents and workspace folders, drag-and-drop upload, live
  indexing status, filtering, select-many → ask.
- **Server-side key** — the PageIndex API key never reaches the browser.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local   # paste your key
pnpm dev                     # http://localhost:3000 → /chat
```

Get a key at [dash.pageindex.ai](https://dash.pageindex.ai).

### Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PAGEINDEX_API_KEY` | yes | — | PageIndex Cloud key. Server-only; sent as `api_key` (or `Bearer`). |
| `PAGEINDEX_API_URL` | no | `https://api.pageindex.ai` | Point at a compatible backend or the local mock. |
| `PAGEINDEX_BETA_HEADERS` | no | `block_reference` | Beta features requested on upload; empty or `none` disables. Enables block ids + bboxes. |
| `OPENAI_API_KEY` | no | — | Enables the **MCP lane** (recommended). Requires `PAGEINDEX_API_KEY`. |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Model that drives the MCP tools. |
| `PAGEINDEX_MCP_URL` | no | `$PAGEINDEX_API_URL/mcp` | Override the MCP endpoint. |

---

## Routes

```
/chat                 new conversation (optionally ?docs=id,id)
/chat/[chatId]        stored conversation (localStorage)
/library              documents + folders
/doc/[docId]          reader (tree + pages + page image)
/settings             connection, local data, chat lane notes
```

## Architecture

```
browser ──► Next.js Route Handlers ──► api.pageindex.ai
            (api_key header, server)      (BFF: key never ships)
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
| `GET/POST /api/folders` | `GET /folders/`, `POST /folder/` | |
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
  chat-store.ts                conversations in localStorage
  server/pages-cache.ts        bounded page-content cache
docs/REVERSE-ENGINEERING.md    evidence, inferences, open questions
scripts/mock-pageindex-api.mjs
```

---

## Limits and caveats

- **Single-user, no auth.** The API key *is* the account. Do not deploy publicly
  without sessions and rate limits.
- **Conversations are local** to this browser; there is no Cloud API for them.
- **Block-level citations need blocks.** Documents indexed without them still work,
  but citations fall back to page level (the preview says so).
- **Tables/figures come from OCR markdown**; use the page-image view when pixel
  fidelity matters.
- **The official app's authenticated UI could not be observed** (no session in any
  local browser), so the citation card and artifact are built from the user's
  description plus the API's citation payload — see §6 of the notes.
