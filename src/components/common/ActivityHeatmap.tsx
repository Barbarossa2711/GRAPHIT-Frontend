/**
 * GitHub-style activity calendar: one square per day, weeks as columns, rendered as
 * inline SVG. It counts participation (answered questions, right or wrong, plus chat
 * sessions), not success.
 */

import * as React from 'react';

import { ActivityDay } from '../../api/types';

/** Squares per column: one week, Monday at the top. */
const DAYS_PER_WEEK = 7;
/**
 * Number of weeks shown. The SVG scales to the panel width, so this (not CELL) decides
 * the square size; 18 weeks is roughly the active phase of a semester.
 */
const WEEKS = 18;

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;

const MONTHS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez'
];

/**
 * Formats a date as ISO date in local time (`toISOString` would shift across midnight).
 * @param d: Date
 * @returns: The date as `YYYY-MM-DD`
 */
function isoDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Maps an activity count to one of five colour levels. Thresholds are absolute, so a
 * colour means the same in every week.
 * @param count: Activities on a day
 * @returns: Level 0 (none) to 4
 */
export function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

export interface HeatmapCell {
  x: number;
  y: number;
  date: string;
  count: number;
  future: boolean;
}

export interface Calendar {
  cells: HeatmapCell[];
  monthLabels: Array<{ x: number; text: string }>;
  /** Sum over the visible window only. */
  total: number;
  activeDays: number;
}

/**
 * Builds the calendar grid. Pure and with `today` as a parameter, so the date
 * arithmetic is testable.
 * @param days: Days with activity
 * @param today: Reference date; its week is the last column
 * @returns: Cells, month labels and totals
 */
export function buildCalendar(days: ActivityDay[], today: Date): Calendar {
  const byDate = new Map(days.map(d => [d.date, d.count]));
  const anchor = new Date(today);
  anchor.setHours(0, 0, 0, 0);

  // The last column is the current week, so today sits in the rightmost one.
  // getDay() is 0 for Sunday; shift so Monday is row 0.
  const weekdayOfToday = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(start.getDate() - weekdayOfToday - (WEEKS - 1) * DAYS_PER_WEEK);

  const cells: HeatmapCell[] = [];
  const monthLabels: Array<{ x: number; text: string }> = [];
  let lastMonth = -1;
  let total = 0;
  let activeDays = 0;

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + w * DAYS_PER_WEEK + d);
      const iso = isoDate(day);
      const count = byDate.get(iso) ?? 0;
      total += count;
      if (count > 0) activeDays++;
      cells.push({
        x: w * STEP,
        y: d * STEP,
        date: iso,
        count,
        // Future days are drawn faintly instead of omitted.
        future: day > anchor
      });
      if (d === 0 && day.getMonth() !== lastMonth) {
        lastMonth = day.getMonth();
        monthLabels.push({ x: w * STEP, text: MONTHS[day.getMonth()] });
      }
    }
  }
  return { cells, monthLabels, total, activeDays };
}

/**
 * Formats an ISO date for display, built from parts so no timezone can shift it.
 * @param iso: Date as `YYYY-MM-DD`
 * @returns: E.g. `Mi., 19.08.2026`
 */
function readableDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Activity calendar with summary line and legend.
 * @param props: Days with activity
 * @returns: The heatmap element
 */
export function ActivityHeatmap(props: { days: ActivityDay[] }): JSX.Element {
  const { cells, monthLabels, total, activeDays } = React.useMemo(
    () => buildCalendar(props.days, new Date()),
    [props.days]
  );
  const [hovered, setHovered] = React.useState<HeatmapCell | null>(null);

  const width = WEEKS * STEP;
  const height = DAYS_PER_WEEK * STEP + 14;

  return (
    <div className="graphit-heatmap">
      {/* The hovered day replaces the summary in place, avoiding clipped tooltips and reflow. */}
      <div className="graphit-heatmap-head">
        {hovered ? (
          <span className="graphit-small graphit-heatmap-hover">
            <strong>
              {hovered.count}{' '}
              {hovered.count === 1 ? 'Aktivität' : 'Aktivitäten'}
            </strong>{' '}
            am {readableDate(hovered.date)}
          </span>
        ) : (
          <span className="graphit-small">
            {total === 0
              ? 'Noch keine Aktivität'
              : `${total} ${total === 1 ? 'Aktivität' : 'Aktivitäten'} an ${activeDays} ${activeDays === 1 ? 'Tag' : 'Tagen'}`}
          </span>
        )}
      </div>

      <svg
        className="graphit-heatmap-grid"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label={`Aktivitätskalender der letzten ${WEEKS} Wochen: ${total} Aktivitäten an ${activeDays} Tagen`}
      >
        {monthLabels.map(m => (
          <text
            key={`${m.x}-${m.text}`}
            className="graphit-heatmap-month"
            x={m.x}
            y={height - 3}
          >
            {m.text}
          </text>
        ))}
        {cells.map(c => (
          <rect
            key={c.date}
            x={c.x}
            y={c.y}
            width={CELL}
            height={CELL}
            rx={2}
            className="graphit-heatmap-cell"
            data-level={c.future ? 'future' : level(c.count)}
            data-hovered={hovered?.date === c.date}
            onMouseEnter={() => setHovered(c.future ? null : c)}
          >
            <title>
              {c.future
                ? c.date
                : `${c.date}: ${c.count} ${c.count === 1 ? 'Aktivität' : 'Aktivitäten'}`}
            </title>
          </rect>
        ))}
      </svg>

      <div className="graphit-heatmap-legend graphit-small graphit-muted">
        <span>weniger</span>
        {[0, 1, 2, 3, 4].map(l => (
          <span key={l} className="graphit-heatmap-key" data-level={l} />
        ))}
        <span>mehr</span>
      </div>
    </div>
  );
}
