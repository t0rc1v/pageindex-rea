/**
 * Local stand-in for the PageIndex Cloud API, used only to exercise this app's
 * route handlers end to end (it is not part of the app, and never ships).
 *
 * It implements the documented wire shapes, including the managed chat SSE with
 * `block_metadata` tool blocks and inline citation tags.
 *
 *   node .rea/mock/pageindex-mock.mjs 4319
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? 4319);
const API_KEY = "test-key";

const doc = {
  id: "pi-mock-1",
  name: "Annual Report 2024.pdf",
  description: "Mock annual report used to verify the reader UI.",
  status: "completed",
  createdAt: "2026-01-04T10:00:00.000Z",
  pageNum: 3,
  folderId: null,
  metadata: null,
};

const otherDoc = {
  id: "pi-mock-2",
  name: "Acquisition Memo.pdf",
  description: "A document that belongs to a different workspace.",
  status: "completed",
  createdAt: "2026-01-05T10:00:00.000Z",
  pageNum: 2,
  folderId: null,
  metadata: null,
};

const tree = [
  {
    title: "Financial Highlights",
    node_id: "0001",
    page_index: 1,
    summary: "Headline results and the shape of the year.",
    nodes: [
      {
        title: "Revenue by segment",
        node_id: "0002",
        page_index: 2,
        summary: "Segment split and growth rates.",
      },
    ],
  },
  {
    title: "Risk Factors",
    node_id: "0003",
    page_index: 3,
    summary: "Principal risks and mitigations.",
  },
];

const pages = [
  {
    page_index: 1,
    markdown:
      "# Financial Highlights\n\nRevenue grew **12%** to $4.2bn, with every segment ahead of plan.\n\n| Segment | 2023 | 2024 |\n| --- | --- | --- |\n| Cloud | 1.1 | 1.6 |\n| Devices | 2.6 | 2.6 |\n\nOperating margin held at 18%, even with the step-up in R&D.\n\nInvertibility: \\(A\\) is singular exactly when \\(\\det A=0\\).\n\n\\[\\det(AB)=\\det(A)\\det(B).\\]\n\n1. **Singularity**\n   \\[\n   \\det(A)=0\n   \\]\n\n2. **Row operations**\n   - Multiplying a row by \\(c\\) multiplies the determinant by \\(c\\).\n\n![Figure 1](img-1.jpeg)",
    images: ["BASE64-IMAGE-1"],
  },
  {
    page_index: 2,
    markdown:
      "## Revenue by segment\n\nCloud revenue reached $1.6bn, up 45% year over year.\n\n- Cloud: $1.6bn\n- Devices: $2.6bn\n\n> Demand was strongest in the second half.",
  },
  {
    page_index: 3,
    markdown:
      "## Risk Factors\n\nSupply concentration remains the principal operational risk.\n\n1. Single-source components\n2. Freight volatility",
  },
];

const folders = [
  {
    id: "folder-a",
    name: "Reference",
    description: null,
    parent_folder_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    file_count: 1,
    children_count: 0,
  },
];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authorized(req) {
  return req.headers.api_key === API_KEY;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const chunks = (value) => value.match(/[\s\S]{1,18}/g) ?? [];

async function chatStream(req, res) {
  const body = JSON.parse(await readBody(req)); // also validates the request is JSON
  // A caller can ask for the citations frame to land late. That is the window in
  // which a citation is already on screen but has no document id yet, which a
  // fast click (or a slow answer) hits in a real browser.
  const delayedCitations = /cite later/i.test(JSON.stringify(body));
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const text = (delta) => send({ choices: [{ index: 0, delta: { content: delta } }] });

  send({ block_metadata: { type: "text_block_start", block_index: 0 } });
  await sleep(30);

  const answer =
    "Revenue grew 12% to $4.2bn, led by Cloud at $1.6bn. <doc=Annual Report 2024.pdf;page=1;block=p1_text_2>";
  for (const piece of chunks(answer)) {
    text(piece);
    await sleep(8);
  }
  send({ block_metadata: { type: "text_stop", block_index: 0 } });

  // A tool block: the opening tag names the tool, the argument JSON is
  // interleaved into delta.content (and must NOT render as prose).
  send({
    block_metadata: {
      type: "mcp_tool_use_start",
      tool_name: "get_page_content",
      server_name: "pageindex",
      block_index: 1,
    },
  });
  for (const piece of chunks('{"doc_name":"Annual Report 2024.pdf","pages":"3"}')) {
    // Live traffic tags argument deltas `tool_use`; they are JSON, not prose.
    send({
      block_metadata: { type: "tool_use", block_index: 1 },
      choices: [{ index: 0, delta: { content: piece } }],
    });
    await sleep(5);
  }
  send({ block_metadata: { type: "tool_use_stop", block_index: 1 } });

  send({ block_metadata: { type: "text_block_start", block_index: 2 } });
  const tail =
    "Supply concentration is the principal operational risk. <cite doc=\"Annual Report 2024.pdf\" page=\"3\" block=\"p3_text_1\"/>\n\n" +
    "```mermaid\nflowchart LR\n  A[Question] --> B{Tree walk}\n  B -->|section| C[Pages]\n  C --> D[Cited answer]\n```\n\n| Metric | FY24 | FY25 |\n| --- | --- | --- |\n| Revenue | 3.7 | 4.2 |\n| Margin | 71% | 74% |\n\nThe figure shows the mix change: <cite doc=\"Annual Report 2024.pdf\" page=\"2\" block=\"p2_image_1\"/>, and the segment table breaks it out: <cite doc=\"Annual Report 2024.pdf\" page=\"2\" block=\"p2_table_1\"/>\n\n```ts\nconst revenue = { fy24: 3.7, fy25: 4.2 };\n```";
  for (const piece of chunks(tail)) {
    text(piece);
    await sleep(8);
  }
  send({ choices: [{ index: 0, delta: {}, finish_reason: "end_turn" }] });
  // The citations frame lands AFTER finish_reason — the trap clients fall into.
  if (delayedCitations) await sleep(4000);
  send({
    object: "chat.completion.citations",
    citations: [
      { document: "Annual Report 2024.pdf", page: 1, block_id: "p1_text_2", bbox: [80, 240, 910, 300], block_type: "text" },
      { document: "Annual Report 2024.pdf", page: 3, block_id: "p3_text_1", bbox: [80, 200, 910, 260], block_type: "text" },
      // A figure and a table, so the citation card's variant previews have
      // something to crop in offline runs.
      { document: "Annual Report 2024.pdf", page: 2, block_id: "p2_image_1", bbox: [140, 180, 720, 520], block_type: "image" },
      { document: "Annual Report 2024.pdf", page: 2, block_id: "p2_table_1", bbox: [90, 560, 900, 720], block_type: "table" },
    ],
  });
  res.write("data: [DONE]\n\n");
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (part) => parts.push(part));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // Presigned page renders are loaded by <img>, which cannot send api_key —
  // the real API hands out pre-signed S3 URLs for exactly this reason.
  if (!path.startsWith("/render/") && !authorized(req)) {
    return json(res, 401, { detail: "invalid api_key" });
  }

  // chat
  if (req.method === "POST" && path === "/chat/completions/") {
    return chatStream(req, res);
  }
  if (req.method === "POST" && path === "/chat/completions") {
    return chatStream(req, res);
  }

  // documents
  if (req.method === "GET" && (path === "/docs/" || path === "/docs")) {
    const folderId = url.searchParams.get("folder_id");
    const list = folderId === "folder-a" ? [] : [doc, otherDoc];
    return json(res, 200, {
      documents: list,
      total: list.length,
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
  }

  if (req.method === "POST" && (path === "/doc/" || path === "/doc")) {
    await readBody(req);
    return json(res, 200, { doc_id: doc.id, name: doc.name });
  }

  if (req.method === "DELETE" && path.startsWith("/doc/")) {
    return json(res, 200, { message: "deleted" });
  }

  if (req.method === "PUT" && path === `/doc/${doc.id}/metadata`) {
    const body = JSON.parse(await readBody(req));
    if (typeof body.name === "string" && body.name.trim()) doc.name = body.name.trim();
    if (body.description !== undefined) doc.description = body.description;
    return json(res, 200, doc);
  }

  if (req.method === "GET" && path === `/doc/${doc.id}/metadata/`) {
    return json(res, 200, doc);
  }

  if (req.method === "GET" && path === `/doc/${doc.id}/`) {
    const type = url.searchParams.get("type");
    if (type === "tree") {
      return json(res, 200, { doc_id: doc.id, status: "completed", retrieval_ready: true, result: tree });
    }
    const format = url.searchParams.get("format") ?? "page";
    return json(res, 200, {
      doc_id: doc.id,
      status: "completed",
      retrieval_ready: true,
      result: format === "page" ? pages : "concatenated markdown",
    });
  }

  if (req.method === "GET" && path === "/doc/s3/pi-mock-1/images") {
    const page = Number(url.searchParams.get("start") ?? 1);
    return json(res, 200, {
      images: [{ page, url: `http://127.0.0.1:${PORT}/render/page-${page}.png` }],
    });
  }

  if (req.method === "GET" && path.startsWith(`/doc/${doc.id}/block/`)) {
    const blockId = decodeURIComponent(path.split("/block/")[1].replace(/\/$/, ""));
    const found = {
      "p1_text_2": { page: 1, bbox: [80, 240, 910, 300], block_type: "text", text: "Revenue grew 12% to $4.2bn." },
      "p3_text_1": { page: 3, bbox: [80, 200, 910, 260], block_type: "text", text: "Supply concentration remains the principal operational risk." },
      "p2_image_1": { page: 2, bbox: [140, 180, 720, 520], block_type: "image", text: "Figure 1: Revenue mix by segment, FY24 vs FY25." },
      "p2_table_1": { page: 2, bbox: [90, 560, 900, 720], block_type: "table", text: "Segment | FY24 | FY25 — Cloud 1.2 1.6; Devices 2.1 2.0; Services 0.4 0.6" },
    }[blockId];
    if (!found) return json(res, 404, { detail: "block not found" });
    return json(res, 200, { doc_id: doc.id, block_id: blockId, ...found });
  }

  if (req.method === "GET" && path.startsWith(`/doc/${doc.id}/image/`)) {
    return json(res, 200, { url: `http://127.0.0.1:${PORT}/render/img-1.jpeg` });
  }

  // folders
  if (req.method === "GET" && (path === "/folders/" || path === "/folders")) {
    return json(res, 200, { folders, total: folders.length });
  }
  if (req.method === "POST" && (path === "/folder/" || path === "/folder")) {
    const body = JSON.parse(await readBody(req));
    return json(res, 200, {
      folder: {
        id: `folder-${body.name}`,
        name: body.name,
        description: null,
        parent_folder_id: body.parent_folder_id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_count: 0,
        children_count: 0,
      },
    });
  }

  // page render (redirect target)
  if (req.method === "GET" && path.startsWith("/render/")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1050"><rect width="100%" height="100%" fill="#fff"/><text x="40" y="80" font-family="Georgia" font-size="22">Mock page</text><rect x="64" y="192" width="664" height="48" fill="#fbe9d8"/></svg>`,
    );
  }

  json(res, 404, { detail: `no route ${req.method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`mock PageIndex API on http://127.0.0.1:${PORT} (api_key=${API_KEY})`);
});
