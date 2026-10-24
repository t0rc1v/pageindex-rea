import { describe, expect, it } from "vitest";

import { answerRunIndex, answerRunsFor } from "./chat-variants";

/** Runs as a turn builds them: regenerate appends, edit appends a new version. */
const runs = (...versions: Array<number | undefined>) =>
  versions.map((questionRun) => (questionRun === undefined ? {} : { questionRun }));

describe("question/answer pairing", () => {
  it("groups regenerated answers under the wording they replied to", () => {
    expect(answerRunsFor(runs(0, 0, 0), 0)).toEqual([0, 1, 2]);
    expect(answerRunsFor(runs(0, 0, 0), 1)).toEqual([]);
  });

  it("keeps versions apart after an edit", () => {
    // Q1 answered twice, then edited to Q2 and answered once, then edited again.
    const turn = runs(0, 0, 1, 1, 2);
    expect(answerRunsFor(turn, 0)).toEqual([0, 1]);
    expect(answerRunsFor(turn, 1)).toEqual([2, 3]);
    expect(answerRunsFor(turn, 2)).toEqual([4]);
  });

  it("shows the newest answer to the visible wording", () => {
    expect(answerRunIndex(runs(0, 0, 1, 1, 2), 0)).toBe(1);
    expect(answerRunIndex(runs(0, 0, 1, 1, 2), 1)).toBe(3);
    expect(answerRunIndex(runs(0, 0, 1, 1, 2), 2)).toBe(4);
  });

  it("falls back to the closest earlier answer for unprefixed stored runs", () => {
    // Every run written before edit-variants existed answered the only wording.
    expect(answerRunIndex(runs(undefined, undefined), 0)).toBe(1);
    expect(answerRunIndex(runs(undefined, undefined), 3)).toBe(1);
  });

  it("never returns an index outside the turn", () => {
    expect(answerRunIndex([], 2)).toBe(0);
    expect(answerRunIndex(runs(2, 2), 0)).toBe(0);
  });
});
