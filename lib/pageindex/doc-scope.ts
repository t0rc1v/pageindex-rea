/**
 * Which MCP tools this app is willing to let a model call, and how a document
 * name is matched and translated across the display/upstream split.
 *
 * Deliberately free of `server-only` so the rules can be unit-tested; the tool
 * wrapping itself stays in `mcp-chat.ts`.
 *
 * The MCP endpoint authenticates with the account-wide PageIndex key, so its
 * tools see every document in the account. Only tools that address a single
 * document *by name* are exposed, which makes the name the permission check.
 *
 * `browse_documents`, `search_documents`, `get_folder_structure` and
 * `get_document_image` are absent on purpose: they enumerate or address
 * documents without a name we can validate. Adding a tool upstream does not
 * widen this surface until it is listed here.
 */
export const MCP_READ_TOOLS: ReadonlySet<string> = new Set([
  "get_document",
  "get_document_structure",
  "get_page_content",
  "get_metadata_schema",
]);

/** Arguments that carry a document name in the PageIndex MCP schema. */
function isDocNameKey(key: string): boolean {
  return /doc(ument)?_?names?$/i.test(key);
}

export function normalizeDocName(name: string): string {
  return name.trim().toLowerCase();
}

/** Every argument value that addresses a document by name. */
export function docNameArguments(args: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!isDocNameKey(key)) continue;
    if (typeof value === "string") names.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string") names.push(item);
    }
  }
  return names;
}

/**
 * True when every document the call names belongs to this tenant. An argument
 * set with no document name is allowed: those tools (`get_metadata_schema`) do
 * not read document content.
 */
export function toolCallAllowed(
  args: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): { allowed: true } | { allowed: false; name: string } {
  for (const name of docNameArguments(args)) {
    if (!allowed.has(normalizeDocName(name))) return { allowed: false, name };
  }
  return { allowed: true };
}

/**
 * Display name → upstream name, for the documents whose two names differ.
 *
 * The model works in display names (that is what the user sees and what its
 * citations should say), while PageIndex tools only accept the upstream name.
 * Translation happens immediately before the tool call, so the permission check
 * stays a plain set lookup on display names.
 */
export function upstreamNameMap(
  docs: Array<{ name: string; upstreamName?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (doc.upstreamName && doc.upstreamName !== doc.name) {
      map.set(normalizeDocName(doc.name), doc.upstreamName);
    }
  }
  return map;
}

/** Rewrite the document-name arguments of a tool call through `toUpstream`. */
export function mapDocNameArguments(
  args: Record<string, unknown>,
  toUpstream: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (!isDocNameKey(key) || toUpstream.size === 0) {
      next[key] = value;
      continue;
    }

    if (typeof value === "string") {
      next[key] = toUpstream.get(normalizeDocName(value)) ?? value;
    } else if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        typeof item === "string" ? toUpstream.get(normalizeDocName(item)) ?? item : item,
      );
    } else {
      next[key] = value;
    }
  }

  return next;
}

/**
 * Upstream name → display name, for the citations the managed lane emits.
 *
 * PageIndex writes `<cite doc="…">` with the name it knows, and resolves the
 * citations frame the same way. Both are translated before the browser sees
 * them, so a transcript never cites a name the library does not show.
 */
export function citationNameMap(
  docs: Array<{ name: string; upstreamName?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (doc.upstreamName && doc.upstreamName !== doc.name) {
      map.set(normalizeDocName(doc.upstreamName), doc.name);
    }
  }
  return map;
}

export function displayDocumentName(
  name: string,
  toDisplay: ReadonlyMap<string, string>,
): string {
  return toDisplay.get(normalizeDocName(name)) ?? name;
}
