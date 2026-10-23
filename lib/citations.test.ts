import { describe, expect, it } from "vitest";

import {
  citationKey,
  parseCitations,
  resolveCitationDocs,
  splitStreamingTail,
  tokenizeCitations,
} from "./citations";

const DOC = "Annual Report 2024.pdf";

describe("parseCitations", () => {
  it("reads the <doc=…> tag with and without a block", () => {
    const found = parseCitations(
      `Revenue grew <doc=${DOC};page=12;block=p12_text_3> and costs fell <doc=${DOC};page=14>.`,
    );
    expect(found).toEqual([
      { document: DOC, page: 12, blockId: "p12_text_3" },
      { document: DOC, page: 14, blockId: undefined },
    ]);
  });

  it("reads the <cite …/> form", () => {
    const found = parseCitations(`See <cite doc="${DOC}" page="7" block="p7_text_1"/>.`);
    expect(found).toEqual([{ document: DOC, page: 7, blockId: "p7_text_1" }]);
  });

  it("keeps first-appearance order and drops duplicates", () => {
    const found = parseCitations(
      `<doc=${DOC};page=3;block=a> <doc=${DOC};page=3;block=a> <doc=${DOC};page=3;block=b>`,
    );
    expect(found).toHaveLength(2);
  });

  it("ignores a page range's second number", () => {
    expect(parseCitations(`<doc=${DOC};page=131-133>`)[0]?.page).toBe(131);
  });

  it("ignores malformed tags", () => {
    expect(parseCitations("<doc=;page=x>")).toEqual([]);
  });
});

describe("citationKey", () => {
  it("separates two blocks on the same page", () => {
    const a = { document: DOC, page: 3, blockId: "a" };
    const b = { document: DOC, page: 3, blockId: "b" };
    expect(citationKey(a)).not.toBe(citationKey(b));
  });
});

describe("tokenizeCitations", () => {
  it("splits prose from citations", () => {
    const segments = tokenizeCitations(`before <doc=${DOC};page=2> after`);
    expect(segments.map((segment) => segment.kind)).toEqual(["text", "citation", "text"]);
  });
});

describe("splitStreamingTail", () => {
  it("holds back a half-received tag", () => {
    const { stable, pending } = splitStreamingTail(`Answer <doc=${DOC};page=1;blo`);
    expect(stable).toBe("Answer ");
    expect(pending).toBe(`<doc=${DOC};page=1;blo`);
  });

  it("returns the whole text once the tag closes", () => {
    const text = `<doc=${DOC};page=1;block=x>`;
    expect(splitStreamingTail(text)).toEqual({ stable: text, pending: "" });
  });

  it("does not treat a stray < as a citation", () => {
    const text = "5 < 6";
    expect(splitStreamingTail(text)).toEqual({ stable: text, pending: "" });
  });
});

describe("resolveCitationDocs", () => {
  it("attaches ids by document name", () => {
    const docs = [{ id: "doc-1", name: DOC }];
    const [citation] = resolveCitationDocs(
      [{ document: DOC, page: 4 }],
      docs,
    );
    expect(citation?.docId).toBe("doc-1");
  });

  it("matches case-insensitively", () => {
    const docs = [{ id: "doc-1", name: "annual report 2024.pdf" }];
    const [citation] = resolveCitationDocs([{ document: DOC, page: 4 }], docs);
    expect(citation?.docId).toBe("doc-1");
  });
});
