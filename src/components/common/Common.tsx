/** Small shared presentational pieces. */

import * as React from 'react';

import { UserFacingError } from '../../api/errors';
import { ConceptStatus, RollupStats } from '../../api/types';
import { STATUS_LABEL, STATUS_SHORT } from '../../state/selectors';

/**
 * Inline loading indicator.
 * @returns: The spinner element
 */
export function Spinner(): JSX.Element {
  return <span className="graphit-spinner" role="status" aria-label="lädt" />;
}

/**
 * Placeholder for views without content.
 * @param props: Title, optional body text and extra children
 * @returns: The empty-state element
 */
export function EmptyState(props: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="graphit-empty">
      <div>
        <strong>{props.title}</strong>
      </div>
      {props.body ? <p>{props.body}</p> : null}
      {props.children}
    </div>
  );
}

/**
 * Error or notice box with optional retry and dismiss buttons.
 * @param props: The error plus optional `onRetry` and `onDismiss` callbacks
 * @returns: The banner element
 */
export function ErrorBanner(props: {
  error: UserFacingError;
  onRetry?: () => void;
  onDismiss?: () => void;
}): JSX.Element {
  const { error } = props;
  return (
    <div className={error.benign ? 'graphit-notice' : 'graphit-error'}>
      <div className={error.benign ? undefined : 'graphit-error-title'}>
        {error.title}
      </div>
      {error.body ? <div>{error.body}</div> : null}
      {error.hint ? (
        <div className="graphit-small graphit-muted">{error.hint}</div>
      ) : null}
      {(props.onRetry && error.canRetry) || props.onDismiss ? (
        <div className="graphit-btnrow" style={{ marginTop: 6 }}>
          {props.onRetry && error.canRetry ? (
            <button className="graphit-btn" onClick={props.onRetry}>
              Erneut versuchen
            </button>
          ) : null}
          {props.onDismiss ? (
            <button
              className="graphit-btn graphit-btn--quiet"
              onClick={props.onDismiss}
            >
              Schließen
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact status label with a coloured dot.
 * @param props: Concept status
 * @returns: The pill element
 */
export function StatusPill(props: { status: ConceptStatus }): JSX.Element {
  return (
    <span className="graphit-pill" data-status={props.status}>
      <span className="graphit-dot" data-status={props.status} />
      {STATUS_SHORT[props.status]}
    </span>
  );
}

/**
 * Mastery meter: the fill is the decaying `mastery`, a marker shows the never-decaying
 * `mastery_peak`. Both are needed to tell "due for review" from "never mastered".
 * @param props: Mastery, peak, threshold and whether to draw labelled markers
 * @returns: The meter element
 */
export function MasteryBar(props: {
  mastery: number | null;
  peak?: number;
  threshold?: number;
  /** Draw tall, captioned markers instead of bare ticks. */
  labeled?: boolean;
}): JSX.Element {
  const pct = Math.round((props.mastery ?? 0) * 100);
  const peakPct =
    props.peak !== undefined ? Math.round(props.peak * 100) : null;
  const thresholdPct =
    props.threshold !== undefined ? Math.round(props.threshold * 100) : null;

  const ariaLabel =
    props.mastery === null
      ? 'nie getestet'
      : `Mastery ${pct} Prozent${peakPct !== null ? `, Bestmarke ${peakPct} Prozent` : ''}${thresholdPct !== null ? `, Schwelle ${thresholdPct} Prozent` : ''}`;

  if (props.labeled) {
    const hasPeak = peakPct !== null && peakPct > 0;
    return (
      <div className="graphit-bar-labeled" data-peak={hasPeak}>
        <div className="graphit-bar" role="img" aria-label={ariaLabel}>
          <span className="graphit-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {hasPeak ? (
          <BarMarker
            kind="peak"
            placement="above"
            pct={peakPct as number}
            value={`Bestmarke ${peakPct} %`}
          />
        ) : null}
        {/* Fixed scale ends, so the fill can be read against 0–100 %. */}
        <BarMarker kind="scale" placement="below" pct={0} value="0 %" />
        <BarMarker kind="scale" placement="below" pct={100} value="100 %" />
        {thresholdPct !== null ? (
          <BarMarker
            kind="threshold"
            placement="below"
            pct={thresholdPct}
            value={`Schwelle ${thresholdPct} %`}
            meaning="ab hier beherrscht"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="graphit-bar" role="img" aria-label={ariaLabel}>
      <span className="graphit-bar-fill" style={{ width: `${pct}%` }} />
      {thresholdPct !== null ? (
        <span
          className="graphit-bar-threshold"
          style={{ left: `${thresholdPct}%` }}
          title={`Schwelle für „beherrscht": ${thresholdPct} %`}
        />
      ) : null}
      {peakPct !== null && peakPct > pct ? (
        <span className="graphit-bar-peak" style={{ left: `${peakPct}%` }} />
      ) : null}
    </div>
  );
}

/**
 * Marker line on the mastery bar with a caption, placed above or below the bar so that
 * nearby markers do not overlap. The caption is aligned so it never leaves the bar.
 * @param props: Marker kind, placement, position in percent, value and meaning
 * @returns: The marker element
 */
function BarMarker(props: {
  kind: 'threshold' | 'peak' | 'scale';
  placement: 'above' | 'below';
  pct: number;
  value: string;
  meaning?: string;
}): JSX.Element {
  const translate = props.pct <= 12 ? '0' : props.pct >= 88 ? '-100%' : '-50%';
  const textAlign =
    props.pct <= 12 ? 'left' : props.pct >= 88 ? 'right' : 'center';
  return (
    <div
      className={`graphit-bar-marker graphit-bar-marker--${props.kind}`}
      data-placement={props.placement}
      style={{ left: `${props.pct}%` }}
      title={props.meaning ? `${props.value}: ${props.meaning}` : props.value}
    >
      <span className="graphit-bar-marker-line" />
      <span
        className="graphit-bar-marker-label"
        style={{ transform: `translateX(${translate})`, textAlign }}
      >
        <b>{props.value}</b>
        {props.meaning ? (
          <span className="graphit-muted">{props.meaning}</span>
        ) : null}
      </span>
    </div>
  );
}

const SEGMENTS: ConceptStatus[] = [
  'mastered',
  'due_review',
  'in_progress',
  'visited',
  'new'
];

/**
 * Progress bar filled by achievement only: `mastered` solid and `due_review` faded
 * (mastered once, gate still open). Other statuses stay empty and are reported as
 * numbers, so the bar reads as "how much is done".
 * @param props: Rollup statistics
 * @returns: The bar element
 */
export function AchievementBar(props: { stats: RollupStats }): JSX.Element {
  const { stats } = props;
  const total = Math.max(stats.total, 1);
  const pct = (value: number): string => `${(value / total) * 100}%`;
  return (
    <div
      className="graphit-achieve"
      role="img"
      aria-label={`${stats.mastered} von ${stats.total} beherrscht, ${stats.due_review} zur Wiederholung fällig`}
    >
      {stats.mastered > 0 ? (
        <span
          className="graphit-achieve-mastered"
          style={{ width: pct(stats.mastered) }}
          title={`aktuell beherrscht: ${stats.mastered}`}
        />
      ) : null}
      {stats.due_review > 0 ? (
        <span
          className="graphit-achieve-due"
          style={{ width: pct(stats.due_review) }}
          title={`war beherrscht, Wiederholung fällig: ${stats.due_review}`}
        />
      ) : null}
    </div>
  );
}

/**
 * Legend for AchievementBar.
 * @param props: Rollup statistics; `rest` adds the counts of the unfilled statuses
 *   (off where the full distribution is shown anyway)
 * @returns: The legend element
 */
export function AchievementLegend(props: {
  stats: RollupStats;
  rest?: boolean;
}): JSX.Element {
  const s = props.stats;
  const rest = props.rest ?? true;
  return (
    <div className="graphit-legend">
      <span>
        <span className="graphit-achieve-key graphit-achieve-mastered" />
        {s.mastered} beherrscht
      </span>
      <span>
        <span className="graphit-achieve-key graphit-achieve-due" />
        {s.due_review} fällig
      </span>
      {rest ? (
        <span className="graphit-muted">
          Zusätzlich: {s.in_progress} in Arbeit · {s.visited} nur angeschaut ·{' '}
          {s.new} noch nicht bearbeitet
        </span>
      ) : null}
    </div>
  );
}

/**
 * Distribution of all five statuses as one full-width bar (not a progress bar). The
 * legend with numbers is included because small segments are unreadable.
 * @param props: Rollup statistics
 * @returns: Bar and legend
 */
export function StatusBar(props: { stats: RollupStats }): JSX.Element {
  const { stats } = props;
  const total = Math.max(stats.total, 1);
  return (
    <>
      <div
        className="graphit-dist"
        role="img"
        aria-label={SEGMENTS.map(
          status => `${stats[status]} ${STATUS_SHORT[status]}`
        ).join(', ')}
      >
        {SEGMENTS.map(status =>
          stats[status] > 0 ? (
            <span
              key={status}
              className="graphit-dist-seg"
              data-status={status}
              style={{ width: `${(stats[status] / total) * 100}%` }}
              title={`${STATUS_LABEL[status]}: ${stats[status]}`}
            />
          ) : null
        )}
      </div>
      <div className="graphit-legend">
        {SEGMENTS.map(status => (
          <span key={status}>
            <span className="graphit-dot" data-status={status} />
            {STATUS_SHORT[status]}{' '}
            <b>{stats[status]}</b>
            <span className="graphit-muted">
              ({Math.round((stats[status] / total) * 100)} %)
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Legend for the per-concept status dots.
 * @returns: The legend element
 */
export function StatusLegend(): JSX.Element {
  return (
    <div className="graphit-legend">
      {SEGMENTS.map(status => (
        <span key={status}>
          <span className="graphit-dot" data-status={status} />
          {STATUS_SHORT[status]}
        </span>
      ))}
    </div>
  );
}

/**
 * Padlock showing whether a concept is ready to be worked on (`prereqs_met`, not
 * `gate_passed`). The tooltip names the missing prerequisites.
 * @param props: Readiness and the names of missing prerequisites
 * @returns: The lock element
 */
export function ReadyLock(props: {
  ready: boolean;
  missing?: string[];
}): JSX.Element {
  const missing = props.missing ?? [];
  const title = props.ready
    ? 'Alle Voraussetzungen erfüllt, kann bearbeitet werden'
    : missing.length > 0
      ? `Zuerst: ${missing.join(', ')}`
      : 'Voraussetzungen noch nicht erfüllt';
  return (
    <span
      className="graphit-lock"
      data-open={props.ready}
      title={title}
      aria-label={props.ready ? 'bereit' : 'noch nicht bereit'}
    >
      {props.ready ? '🔓' : '🔒'}
    </span>
  );
}
