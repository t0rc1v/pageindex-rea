import { z } from "zod";

/**
 * Where a conversation lives, and how that choice travels over HTTP.
 *
 * There are two lists, not one. Recents (`/chat`) holds conversations started
 * in the chat surface; a document's Chat menu holds the ones started inside
 * that document's reader. `origin_doc_id` is the only thing that tells them
 * apart, so the rule lives here — pure, shared by the route handler and the
 * browser — instead of being remembered separately in each.
 *
 * `docs`/`scopeDocs` are *not* this. A document chat is scoped to its document,
 * but scope can change per question, and a `/chat` conversation about one
 * document still belongs in Recents.
 */

/** Query parameter on `GET /api/chats`. Absent means Recents. */
export const CHAT_LIST_SCOPE_PARAM = "docId";

/** Bounded like `scopeDocs[].id`: document ids are opaque, not UUIDs. */
const documentId = z.string().trim().min(1).max(200);

export type ChatListScope = { kind: "recents" } | { kind: "document"; docId: string };

/**
 * Decode `?docId=`.
 *
 * - absent or empty → Recents
 * - a document id → that document's chats
 * - anything too long to be one → `null`, which the route answers with a 400
 *   instead of running a query that could only ever match nothing.
 *
 * A well-formed id that matches no document is not an error: it lists nothing,
 * exactly like `GET /api/docs?name=…` for a document this workspace does not
 * have.
 */
export function parseChatListScope(value: string | null | undefined): ChatListScope | null {
  if (value === null || value === undefined || value === "") return { kind: "recents" };

  const parsed = documentId.safeParse(value);
  return parsed.success ? { kind: "document", docId: parsed.data } : null;
}

/** The list endpoint for a scope. The reverse of `parseChatListScope`. */
export function chatListUrl(scope: ChatListScope): string {
  return scope.kind === "recents"
    ? "/api/chats"
    : `/api/chats?${CHAT_LIST_SCOPE_PARAM}=${encodeURIComponent(scope.docId)}`;
}

/** True when this conversation was born inside a document's reader. */
export function isDocChat<T extends { originDocId?: string }>(
  chat: T,
): chat is T & { originDocId: string } {
  return typeof chat.originDocId === "string" && chat.originDocId.length > 0;
}

/**
 * One document's conversations, newest first.
 *
 * The store's cache is already ordered by recency, but a chat switched in from
 * `fetchChat` is not, so sorting here keeps the menu honest in every caller.
 */
export function chatsForDoc<T extends { originDocId?: string; updatedAt: number }>(
  chats: readonly T[],
  docId: string,
): T[] {
  return chats
    .filter((chat) => chat.originDocId === docId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
