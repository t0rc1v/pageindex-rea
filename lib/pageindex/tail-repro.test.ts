import { describe, expect, it } from "vitest";

import { ChatTranslator } from "./chat-stream";

const TAIL =
  'Supply concentration is the principal operational risk. <cite doc="Annual Report 2024.pdf" page="3" block="p3_text_1"/>\n\n' +
  "```mermaid\nflowchart LR\n  A[Question] --> B[Tree]\n```\n\n" +
  "| Metric | FY24 |\n| --- | --- |\n| Revenue | 3.7 |\n\n" +
  'The figure shows the mix change: <cite doc="Annual Report 2024.pdf" page="2" block="p2_image_1"/>, ' +
  'and the segment table breaks it out: <cite doc="Annual Report 2024.pdf" page="2" block="p2_table_1"/>\n\n' +
  "```ts\nconst revenue = { fy24: 3.7, fy25: 4.2 };\n```";

const chunks = (value: string) => value.match(/[\s\S]{1,18}/g) ?? [];

describe("18-char chunking", () => {
  it("preserves every character through the translator", () => {
    const translator = new ChatTranslator();
    let out = "";
    for (const piece of chunks(TAIL)) {
      for (const event of translator.push({ choices: [{ delta: { content: piece } }] })) {
        if (event.type === "text") out += event.delta;
      }
    }
    for (const event of translator.finish()) {
      if (event.type === "text") out += event.delta;
    }
    expect(out).toBe(TAIL);
  });
});
