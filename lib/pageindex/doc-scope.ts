/**
 * Which MCP tools this app is willing to let a model call, and how a document
 * name is matched against a tenant's registry.
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

export function normalizeDocName(name: string): string {
  return name.trim().toLowerCase();
}

/** Every argument value that addresses a document by name. */
export function docNameArguments(args: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!/doc(ument)?_?names?$/i.test(key)) continue;
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
