/**
 * Placement of the tour card, including cards taller than the remaining space.
 */

import { describe, expect, it } from 'vitest';

import { GAP, Size, cardPosition, clamp } from '../tour/placement';

const VIEWPORT: Size = { w: 1440, h: 900 };
const CARD: Size = { w: 360, h: 300 };

/** The GRAPHIT sidebar: narrow and as tall as the window. */
const SIDEBAR = { top: 28, left: 33, width: 260, height: 872 };
/** The tab row of the main view: wide, short, near the top. */
const TAB_ROW = { top: 60, left: 320, width: 1100, height: 32 };
/** The whole content area of a tab: larger than the card on every side. */
const HUGE = { top: 60, left: 320, width: 1100, height: 820 };

describe('cardPosition', () => {
  it('places the card below a flat region', () => {
    const p = cardPosition(TAB_ROW, CARD, VIEWPORT);
    expect(p.side).toBe('below');
    expect(p.top).toBe(TAB_ROW.top + TAB_ROW.height + GAP);
    expect(p.left).toBe(TAB_ROW.left);
  });

  it('places the card next to the sidebar, not below it', () => {
    const p = cardPosition(SIDEBAR, CARD, VIEWPORT);
    expect(p.side).toBe('right');
    expect(p.left).toBe(SIDEBAR.left + SIDEBAR.width + GAP);
  });

  it('keeps the card fully visible even with long text', () => {
    for (const height of [200, 300, 480, 700, 860]) {
      const p = cardPosition(SIDEBAR, { w: 360, h: height }, VIEWPORT);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.top + height).toBeLessThanOrEqual(VIEWPORT.h);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + 360).toBeLessThanOrEqual(VIEWPORT.w);
    }
  });

  it('moves above when there is no room below', () => {
    const lowRegion = { top: 700, left: 320, width: 600, height: 150 };
    const p = cardPosition(lowRegion, CARD, VIEWPORT);
    expect(p.side).toBe('above');
    expect(p.top).toBe(lowRegion.top - CARD.h - GAP);
  });

  it('moves left when there is no room on the right', () => {
    const rightColumn = { top: 28, left: 1000, width: 430, height: 860 };
    const p = cardPosition(rightColumn, CARD, VIEWPORT);
    expect(p.side).toBe('left');
    expect(p.left).toBe(rightColumn.left - CARD.w - GAP);
  });

  it('places the card inside a region that encloses it on all sides', () => {
    const p = cardPosition(HUGE, CARD, VIEWPORT);
    expect(p.side).toBe('inside');
    expect(p.top).toBeGreaterThan(HUGE.top);
    expect(p.top + CARD.h).toBeLessThan(HUGE.top + HUGE.height);
  });

  it('stays on screen when the card is larger than the viewport', () => {
    const cramped: Size = { w: 320, h: 400 };
    const p = cardPosition(SIDEBAR, { w: 360, h: 600 }, cramped);
    expect(p.top).toBe(GAP);
    expect(p.left).toBe(GAP);
  });

  it('never goes negative in a tiny viewport', () => {
    const tiny: Size = { w: 200, h: 200 };
    const p = cardPosition(TAB_ROW, CARD, tiny);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });
});

describe('clamp', () => {
  it('limits to the lower and upper bound', () => {
    expect(clamp(5, 10, 100)).toBe(10);
    expect(clamp(500, 10, 100)).toBe(100);
    expect(clamp(50, 10, 100)).toBe(50);
  });

  it('returns the lower bound when the range is empty', () => {
    expect(clamp(50, 14, -20)).toBe(14);
  });
});
