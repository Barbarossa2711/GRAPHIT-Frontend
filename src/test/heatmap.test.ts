import { describe, expect, it } from 'vitest';

import { buildCalendar, level } from '../components/common/ActivityHeatmap';

// A Wednesday, so the Monday shift in `(getDay() + 6) % 7` is actually exercised.
const WEDNESDAY = new Date(2026, 7, 19, 15, 30);

describe('level', () => {
  it('separates "nothing" from "a little"', () => {
    expect(level(0)).toBe(0);
    expect(level(1)).toBe(1);
  });

  it('rises in four steps and saturates', () => {
    expect([level(2), level(5), level(10), level(11), level(500)]).toEqual([
      1, 2, 3, 4, 4
    ]);
  });
});

describe('buildCalendar', () => {
  it('fills whole weeks', () => {
    const { cells } = buildCalendar([], WEDNESDAY);
    expect(cells.length % 7).toBe(0);
  });

  // The column count determines the rendered square size.
  it('spans 18 weeks', () => {
    const { cells } = buildCalendar([], WEDNESDAY);
    expect(cells).toHaveLength(18 * 7);
  });

  it('puts today in the last column', () => {
    const { cells } = buildCalendar([], WEDNESDAY);
    const today = cells.find(c => c.date === '2026-08-19');
    const maxX = Math.max(...cells.map(c => c.x));
    expect(today?.x).toBe(maxX);
  });

  // Monday is row 0. 2026-08-17 is the Monday of that week.
  it('starts each column on Monday', () => {
    const { cells } = buildCalendar([], WEDNESDAY);
    const monday = cells.find(c => c.date === '2026-08-17');
    expect(monday?.y).toBe(0);
  });

  it('marks the rest of the current week as future', () => {
    const { cells } = buildCalendar([], WEDNESDAY);
    expect(cells.find(c => c.date === '2026-08-19')?.future).toBe(false);
    expect(cells.find(c => c.date === '2026-08-20')?.future).toBe(true);
  });

  it('matches counts to their day and sums them', () => {
    const { cells, total, activeDays } = buildCalendar(
      [
        { date: '2026-08-19', count: 4 },
        { date: '2026-08-17', count: 2 }
      ],
      WEDNESDAY
    );
    expect(cells.find(c => c.date === '2026-08-19')?.count).toBe(4);
    expect(total).toBe(6);
    expect(activeDays).toBe(2);
  });

  // Days outside the drawn window must not inflate the headline number.
  it('ignores activity older than the window', () => {
    const { total } = buildCalendar(
      [{ date: '2020-01-01', count: 99 }],
      WEDNESDAY
    );
    expect(total).toBe(0);
  });

  // toISOString() would shift dates by a day east of UTC.
  it('uses local dates, not UTC', () => {
    const spaet = new Date(2026, 7, 19, 23, 59);
    const { cells } = buildCalendar([], spaet);
    expect(cells.some(c => c.date === '2026-08-19')).toBe(true);
  });
});
