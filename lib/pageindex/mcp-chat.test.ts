import { describe, expect, it, vi } from "vitest";

// `mcp-chat` is a server module; its prompt builder is pure. The marker package
// throws in the node test environment, so stub only that.
vi.mock("server-only", () => ({}));

import { mcpPrompt } from "./mcp-chat";

const docs = [{ id: "doc-1", name: "Annual Report 2024.pdf" }];

describe("mcpPrompt", () => {
  it("moves system messages into instructions", () => {
    // AI SDK 7 rejects `role: "system"` in `messages` with
    // "Invalid prompt: System messages are not allowed...". The pinned page
    // preamble arrives as one, so this is the regression that reached users.
    const prompt = mcpPrompt({
      docs,
      messages: [
        { role: "system", content: "<page>Table 4</page>" },
        { role: "user", content: "What changed?" },
        { role: "assistant", content: "Revenue grew." },
        { role: "user", content: "And the risk?" },
      ],
    });

    expect(prompt.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(prompt.instructions).toContain("Annual Report 2024.pdf");
    expect(prompt.instructions).toContain("<page>Table 4</page>");
  });

  it("always states the document scope, with or without a preamble", () => {
    const prompt = mcpPrompt({
      docs,
      messages: [{ role: "user", content: "Summarize it." }],
    });

    expect(prompt.messages).toEqual([{ role: "user", content: "Summarize it." }]);
    expect(prompt.instructions).toContain("Annual Report 2024.pdf");
  });
});
