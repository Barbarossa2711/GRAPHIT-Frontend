/**
 * Compact review load of the next two weeks for the sidebar: the same data as the
 * statistics chart, one bar per day and a single tick at seven days.
 */

import * as React from 'react';

import { ProgressResponse } from '../../api/types';
import { reviewLoad } from '../../state/selectors';

const HORIZON = 14;

/**
 * Mini bar chart of upcoming reviews.
 * @param props: Progress response
 * @returns: The chart, or a short note if nothing is due
 */
export function ReviewLoadMini(props: {
  progress: ProgressResponse;
}): JSX.Element {
  const load = React.useMemo(
    () => reviewLoad(props.progress, HORIZON),
    [props.progress]
  );
  const week = load.days.slice(0, 7).reduce((n, d) => n + d.count, 0);
  const fortnight = load.days.reduce((n, d) => n + d.count, 0);
  const total = load.overdue + fortnight;
  const columns = load.days.length + 1;

  if (total === 0) {
    return (
      <div className="graphit-small graphit-muted">
        Keine Wiederholung in Sicht.
      </div>
    );
  }

  return (
    <>
      <div
        className="graphit-load graphit-load--mini"
        role="img"
        aria-label={`${load.overdue} fällig, ${week} in den nächsten 7 Tagen, ${fortnight} in den nächsten 14 Tagen`}
      >
        <div className="graphit-load-col" data-overdue="true">
          <span
            className="graphit-load-bar"
            style={{ height: `${(load.overdue / load.max) * 100}%` }}
            title={`bereits fällig: ${load.overdue}`}
          />
        </div>
        {load.days.map(d => (
          <div key={d.day} className="graphit-load-col">
            <span
              className="graphit-load-bar"
              style={{ height: `${(d.count / load.max) * 100}%` }}
              title={`in ${d.day} ${d.day === 1 ? 'Tag' : 'Tagen'}: ${d.count}`}
            />
          </div>
        ))}
      </div>
      {/* Tick under day 7: centre of column 8 of 15 (overdue comes first). */}
      <div className="graphit-load-mini-axis">
        <span style={{ left: `${((7 + 0.5) / columns) * 100}%` }}>7 Tage</span>
      </div>
    </>
  );
}
