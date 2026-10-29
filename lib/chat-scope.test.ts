import { describe, expect, it } from "vitest";

import {
  chatListUrl,
  chatsForDoc,
  isDocChat,
  parseChatListScope,
  CHAT_LIST_SCOPE_PARAM,
} from "./chat-scope";

const DOC = "6f1c0f9e-2d1a-4a3e-9a4b-1c2d3e4f5a6b";
const OTHER = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";

describe("parseChatListScope", () => {
  it("treats a missing or empty parameter as Recents", () => {
    expect(parseChatListScope(null)).toEqual({ kind: "recents" });
    expect(parseChatListScope(undefined)).toEqual({ kind: "recents" });
    expect(parseChatListScope("")).toEqual({ kind: "recents" });
  });

  it("reads a document scope from a document id", () => {
    expect(parseChatListScope("pi-mock-1")).toEqual({ kind: "document", docId: "pi-mock-1" });
    expect(parseChatListScope(DOC)).toEqual({ kind: "document", docId: DOC });
  });

  it("accepts an id that matches nothing, like every other list endpoint", () => {
    // Document ids are upstream strings, so there is no format to reject. An
    // unknown one lists nothing rather than erroring.
    expect(parseChatListScope("not-a-document")).toEqual({
      kind: "document",
      docId: "not-a-document",
    });
  });

  it("rejects a value too long to be a document id", () => {
    expect(parseChatListScope("x".repeat(201))).toBeNull();
  });

  it("trims padding rather than querying for it", () => {
    expect(parseChatListScope("  pi-mock-1  ")).toEqual({ kind: "document", docId: "pi-mock-1" });
  });
});

describe("chatListUrl", () => {
  it("round-trips every scope through the query string", () => {
    for (const scope of [{ kind: "recents" as const }, { kind: "document" as const, docId: DOC }]) {
      const url = chatListUrl(scope);
      const value =
        scope.kind === "recents"
          ? null
          : new URL(url, "http://localhost").searchParams.get(CHAT_LIST_SCOPE_PARAM);

      expect(parseChatListScope(value)).toEqual(scope);
    }
  });

  it("leaves Recents as the bare endpoint", () => {
    expect(chatListUrl({ kind: "recents" })).toBe("/api/chats");
  });
});

describe("isDocChat", () => {
  it("separates the two origins, including legacy rows with no marker", () => {
    expect(isDocChat({ originDocId: DOC })).toBe(true);
    expect(isDocChat({ originDocId: "" })).toBe(false);
    expect(isDocChat({})).toBe(false);
  });
});

describe("chatsForDoc", () => {
  const chat = (id: string, originDocId: string | undefined, updatedAt: number) => ({
    id,
    originDocId,
    updatedAt,
  });

  it("keeps only that document's chats, newest first", () => {
    const chats = [
      chat("recents-newest", undefined, 300),
      chat("doc-old", DOC, 100),
      chat("other-doc", OTHER, 400),
      chat("doc-new", DOC, 200),
    ];

    expect(chatsForDoc(chats, DOC).map((item) => item.id)).toEqual(["doc-new", "doc-old"]);
  });

  it("does not reorder the caller's list", () => {
    const chats = [chat("a", DOC, 1), chat("b", DOC, 2)];
    chatsForDoc(chats, DOC);
    expect(chats.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
