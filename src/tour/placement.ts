/**
 * Placement of the tour card next to the highlighted region.
 *
 * Pure: the viewport is a parameter, so every placement case is unit-testable without
 * a running JupyterLab.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Gap between region and card, and between card and viewport edge. */
export const GAP = 14;

/**
 * Card size used for the single render before the card has been measured. Never
 * decides the final placement.
 */
export const FALLBACK_CARD_SIZE: Size = { w: 360, h: 240 };

export type Side = 'below' | 'above' | 'right' | 'left' | 'inside';

export interface Placement {
  top: number;
  left: number;
  /** Chosen side; only of interest for tests and debugging. */
  side: Side;
}

/**
 * Places the card on the first side of the region where it fits: below, above, right,
 * left, otherwise inside. The result is always clamped into the viewport, so the card's
 * buttons stay reachable even for long texts.
 * @param target: Highlighted region
 * @param card: Measured card size
 * @param viewport: Viewport size
 * @returns: Card position and chosen side
 */
export function cardPosition(
  target: Rect,
  card: Size,
  viewport: Size
): Placement {
  const spaceBelow = viewport.h - (target.top + target.height);
  const spaceAbove = target.top;
  const spaceRight = viewport.w - (target.left + target.width);
  const spaceLeft = target.left;

  let top: number;
  let left: number;
  let side: Side;

  if (spaceBelow >= card.h + GAP) {
    top = target.top + target.height + GAP;
    left = target.left;
    side = 'below';
  } else if (spaceAbove >= card.h + GAP) {
    top = target.top - card.h - GAP;
    left = target.left;
    side = 'above';
  } else if (spaceRight >= card.w + GAP) {
    left = target.left + target.width + GAP;
    top = target.top;
    side = 'right';
  } else if (spaceLeft >= card.w + GAP) {
    left = target.left - card.w - GAP;
    top = target.top;
    side = 'left';
  } else {
    left = target.left + (target.width - card.w) / 2;
    top = target.top + (target.height - card.h) / 2;
    side = 'inside';
  }

  return {
    top: clamp(top, GAP, viewport.h - card.h - GAP),
    left: clamp(left, GAP, viewport.w - card.w - GAP),
    side
  };
}

/**
 * Clamps a value into a range.
 * @param value: Value to clamp
 * @param min: Lower bound
 * @param max: Upper bound
 * @returns: The clamped value; the lower bound if the range is empty
 */
export function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    // Card larger than the viewport; its CSS max-height makes it scroll.
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
