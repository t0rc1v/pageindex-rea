export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CardPlacement {
  left: number;
  top: number;
  width: number;
  /** Set only when the card is taller than either side, so its body scrolls. */
  maxHeight?: number;
  side: "above" | "below";
}

export const CARD_WIDTH = 352;
/** Gap between the chip and the card — identical on both sides. */
export const CARD_GAP = 8;
export const CARD_MARGIN = 12;
/** Never clamp a card below its header plus a readable sliver. */
const MIN_CARD_HEIGHT = 96;

/**
 * Where the citation preview card sits relative to the chip that opened it.
 *
 * The card opens below the chip and flips above it when there is not enough
 * room; both sides keep the same `gap`, which is only possible once the card's
 * real height is known (a guessed height leaves the flipped card further away
 * at the top than at the bottom). `height` is the measured height and `0` means
 * "not measured yet" — those place below, where the gap does not depend on it.
 *
 * The result is viewport-clamped: horizontally by `margin`, and vertically by
 * `maxHeight` when the card fits on neither side.
 */
export function placeCitationCard(
  anchor: AnchorRect,
  {
    height,
    viewport,
    width = CARD_WIDTH,
    gap = CARD_GAP,
    margin = CARD_MARGIN,
  }: {
    height: number;
    viewport: ViewportSize;
    width?: number;
    gap?: number;
    margin?: number;
  },
): CardPlacement {
  const centre = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(margin, centre - width / 2),
    Math.max(margin, viewport.width - width - margin),
  );

  const below = anchor.top + anchor.height + gap;
  const spaceBelow = viewport.height - margin - below;
  const spaceAbove = anchor.top - gap - margin;

  if (height <= 0) return { left, top: below, width, side: "below" };

  const fitsBelow = height <= spaceBelow;
  const fitsAbove = height <= spaceAbove;
  const above = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);
  const available = above ? spaceAbove : spaceBelow;

  return {
    left,
    top: above ? Math.max(margin, anchor.top - height - gap) : below,
    width,
    maxHeight: height > available ? Math.max(MIN_CARD_HEIGHT, available) : undefined,
    side: above ? "above" : "below",
  };
}
