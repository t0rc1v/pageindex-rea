import { describe, expect, it } from "vitest";

import { CARD_GAP, CARD_MARGIN, CARD_WIDTH, placeCitationCard } from "./citation-placement";

const viewport = { width: 1280, height: 800 };
const chip = { left: 600, top: 400, width: 14, height: 16 };

describe("placeCitationCard", () => {
  it("keeps the same 8px gap below the chip", () => {
    const placement = placeCitationCard(chip, { height: 240, viewport });
    expect(placement.side).toBe("below");
    expect(placement.top).toBe(chip.top + chip.height + CARD_GAP);
  });

  // The regression: the flipped card used a guessed height (300) for the gap,
  // so a 240px card floated 68px above the chip while sitting 8px below it.
  it("keeps the same 8px gap above the chip when it flips", () => {
    const nearBottom = { ...chip, top: viewport.height - 60 };
    const height = 240;
    const placement = placeCitationCard(nearBottom, { height, viewport });
    expect(placement.side).toBe("above");
    expect(placement.top + height).toBe(nearBottom.top - CARD_GAP);
  });

  it("never uses the gap as slack for a wrong height", () => {
    for (const height of [120, 180, 240, 300, 360]) {
      const nearBottom = { ...chip, top: viewport.height - 40 };
      const placement = placeCitationCard(nearBottom, { height, viewport });
      expect(placement.side).toBe("above");
      expect(nearBottom.top - (placement.top + height)).toBe(CARD_GAP);
    }
  });

  it("centres on the chip and clamps to the viewport margin", () => {
    const middle = placeCitationCard(chip, { height: 200, viewport });
    expect(middle.left).toBe(600 + 7 - CARD_WIDTH / 2);

    const right = placeCitationCard({ ...chip, left: viewport.width - 4 }, { height: 200, viewport });
    expect(right.left).toBe(viewport.width - CARD_WIDTH - CARD_MARGIN);

    const left = placeCitationCard({ ...chip, left: 2 }, { height: 200, viewport });
    expect(left.left).toBe(CARD_MARGIN);
  });

  it("places below, unclamped, before the first measurement", () => {
    const placement = placeCitationCard(chip, { height: 0, viewport });
    expect(placement.side).toBe("below");
    expect(placement.top).toBe(chip.top + chip.height + CARD_GAP);
    expect(placement.maxHeight).toBeUndefined();
  });

  it("clamps to the roomier side when the card fits on neither", () => {
    const short = { width: 1280, height: 420 };
    const centred = { ...chip, top: 220 };
    const placement = placeCitationCard(centred, { height: 400, viewport: short });
    expect(placement.side).toBe("above");
    expect(placement.top).toBe(CARD_MARGIN);
    expect(placement.maxHeight).toBe(centred.top - CARD_GAP - CARD_MARGIN);
  });

  it("stays fully inside the viewport when it fits below", () => {
    const placement = placeCitationCard(chip, { height: 240, viewport });
    expect(placement.top + 240).toBeLessThanOrEqual(viewport.height - CARD_MARGIN);
    expect(placement.maxHeight).toBeUndefined();
  });
});
