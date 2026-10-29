import { describe, expect, it } from "vitest";

import { isSubmitKey } from "./composer-keys";

describe("isSubmitKey", () => {
  it("sends on Enter", () => {
    expect(isSubmitKey({ key: "Enter" })).toBe(true);
  });

  it("leaves Shift+Enter alone so it can insert a newline", () => {
    expect(isSubmitKey({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("never sends while an IME is composing", () => {
    // Enter confirms a candidate mid-composition; sending here would post half
    // a line for every Japanese, Korean or Chinese user.
    expect(isSubmitKey({ key: "Enter", isComposing: true })).toBe(false);
    expect(isSubmitKey({ key: "Enter", isComposing: true, shiftKey: true })).toBe(false);
  });

  it("ignores every other key", () => {
    for (const key of ["a", "Escape", "ArrowUp", "Tab", "Process"]) {
      expect(isSubmitKey({ key }), key).toBe(false);
    }
  });

  it("still sends when Enter arrives with a modifier", () => {
    // Documented current behaviour: editing affordances live elsewhere, so a
    // stray ⌘ or Ctrl on Enter is not a separate command.
    expect(isSubmitKey({ key: "Enter", shiftKey: false })).toBe(true);
  });
});
