import { describe, expect, it } from "vitest";

import { ChatTranslator, encodeEvent, friendlyError } from "./chat-stream";

/** The managed lane's grammar, in the order the API actually emits it. */
function sequence() {
  const translator = new ChatTranslator();
  const events = [
    ...translator.push({ block_metadata: { type: "text_block_start", block_index: 1 } }),
    ...translator.push({ choices: [{ delta: { content: "Let me read the report. " } }] }),
    ...translator.push({ block_metadata: { type: "text_stop", block_index: 1 } }),
    ...translator.push({
      block_metadata: { type: "mcp_tool_use_start", block_index: 2, tool_name: "get_page_content" },
    }),
    ...translator.push({ choices: [{ delta: { content: '{"doc_name":"Report.pdf",' } }] }),
    ...translator.push({ choices: [{ delta: { content: '"pages":"12"}' } }] }),
    ...translator.push({ block_metadata: { type: "tool_use_stop", block_index: 2 } }),
    ...translator.push({ block_metadata: { type: "text_block_start", block_index: 3 } }),
    ...translator.push({ choices: [{ delta: { content: "Revenue grew 12%." } }] }),
    ...translator.push({ choices: [{ delta: {}, finish_reason: "end_turn" }] }),
    // The citations frame arrives AFTER finish_reason.
    ...translator.push({
      object: "chat.completion.citations",
      citations: [
        { document: "Report.pdf", page: 12, block_id: "p12_text_1", bbox: [1, 2, 3, 4] },
      ],
    }),
    ...translator.finish(),
  ];
  return events;
}

describe("ChatTranslator", () => {
  it("keeps prose, tool arguments and citations separate", () => {
    const events = sequence();

    const text = events
      .filter((event) => event.type === "text")
      .map((event) => ("delta" in event ? event.delta : ""))
      .join("");
    expect(text).toContain("Revenue grew 12%");
    expect(text).not.toContain("doc_name");

    const tools = events.filter((event) => event.type === "tool");
    expect(tools[0]).toMatchObject({ name: "get_page_content", status: "start" });
    const stop = tools.find((event) => event.type === "tool" && event.status === "stop");
    expect(stop).toMatchObject({ args: { doc_name: "Report.pdf", pages: "12" } });
  });

  it("emits the citations frame even though it follows finish_reason", () => {
    const citations = sequence().filter((event) => event.type === "citations");
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      citations: [{ document: "Report.pdf", page: 12, blockId: "p12_text_1", bbox: [1, 2, 3, 4] }],
    });
  });

  it("does not close a tool block on the tool_use content tag", () => {
    const translator = new ChatTranslator();
    translator.push({
      block_metadata: { type: "mcp_tool_use_start", block_index: 1, tool_name: "browse_documents" },
    });
    const mid = translator.push({
      block_metadata: { type: "tool_use", block_index: 1 },
    });
    expect(mid.filter((event) => event.type === "tool")).toHaveLength(0);
  });
});

describe("friendlyError", () => {
  it("translates credit exhaustion", () => {
    expect(friendlyError("InsufficientCredits")).toMatch(/no chat credits/i);
  });

  it("passes unknown codes through", () => {
    expect(friendlyError("SomethingElse")).toBeNull();
  });
});

describe("encodeEvent", () => {
  it("frames an event as an SSE data line", () => {
    const frame = new TextDecoder().decode(encodeEvent({ type: "done" }));
    expect(frame).toContain("data:");
    expect(frame.endsWith("\n\n")).toBe(true);
  });
});
