/**
 * Learning path of the selected concept.
 *
 * /recommend returns the target plus all transitive prerequisites, grouped by state.
 * The target is shown as a verdict line; the prerequisites are listed in the order they
 * can be worked through. A decayed prerequisite never blocks the path.
 */

import * as React from 'react';

import { PathEntry, RecommendResponse } from '../../api/types';
import { LoadStatus } from '../../state/types';
import { formatDue, STATUS_SHORT } from '../../state/selectors';
import { Spinner, StatusPill } from '../common/Common';

/**
 * Learning path panel with verdict, prerequisites and helpful concepts.
 * @param props: Recommendation, load status, selection callback and the scroll target
 *   for the prerequisite list
 * @returns: The panel, or null if nothing is loaded
 */
export function RecommendPanel(props: {
  recommend: RecommendResponse | null;
  status: LoadStatus;
  onSelect: (id: string) => void;
  /** Scroll target for the hint below the action buttons. */
  prereqRef?: React.RefObject<HTMLElement>;
}): JSX.Element | null {
  if (props.status === 'loading') {
    return (
      <div className="graphit-section" style={{ marginTop: 20 }}>
        <h3>
          <Spinner /> Lernpfad wird geladen …
        </h3>
      </div>
    );
  }
  if (!props.recommend) {
    return null;
  }

  const r = props.recommend;
  const targetId = r.target.id;
  const without = (entries: PathEntry[]): PathEntry[] =>
    entries.filter(e => e.id !== targetId);

  const openNow = without(r.ready_to_learn);
  const waiting = without(r.blocked);
  const refresh = without(r.due_for_review);
  const prereqCount = openNow.length + waiting.length + refresh.length;

  // Nested boxes (path > category > group > entry) instead of separator lines.
  return (
    <section className="graphit-path" style={{ marginTop: 20 }}>
      <h3>Lernpfad</h3>

      <TargetVerdict recommend={r} />

      <div className="graphit-path-cats">
        <section
          className="graphit-path-cat"
          data-kind="required"
          ref={props.prereqRef}
        >
          <h4>
            Voraussetzungen
            {prereqCount > 0 ? <span> ({prereqCount})</span> : null}
          </h4>
          <p className="graphit-path-caption">
            Müssen zum Verständnis vorher bearbeitet werden.
          </p>

          {prereqCount === 0 ? (
            <p className="graphit-path-empty">Keine offenen Voraussetzungen.</p>
          ) : (
            <>
              <Group
                kind="open"
                title="Jetzt möglich"
                caption="Kann direkt bearbeitet werden, da die Voraussetzungen erfüllt sind. Ein guter Einstiegspunkt."
                entries={openNow}
                onSelect={props.onSelect}
              />

              <Group
                kind="waiting"
                title="Noch gesperrt"
                caption="Für diese Konzepte sind noch nicht alle Voraussetzungen erfüllt. Klicke ein Konzept an, um zu sehen, was ihm noch fehlt."
                entries={waiting}
                onSelect={props.onSelect}
              />

              <Group
                kind="refresh"
                title="Zum Wiederholen"
                caption="Wurde schon einmal beherrscht, ist nur über die Zeit unter die beherrscht-Schwelle gesunken. Lohnt sich zu wiederholen, ist aber nicht zwingend notwendig!"
                entries={refresh}
                onSelect={props.onSelect}
                renderExtra={entry =>
                  entry.days_until_due !== undefined ? (
                    <span
                      className="graphit-due-chip"
                      data-overdue={entry.days_until_due <= 0}
                    >
                      {formatDue(entry.days_until_due)}
                    </span>
                  ) : null
                }
              />
            </>
          )}
        </section>

        <section className="graphit-path-cat" data-kind="helpful">
          <h4>
            Hilfreich
            {r.facilitators.length > 0 ? (
              <span> ({r.facilitators.length})</span>
            ) : null}
          </h4>
          <p className="graphit-path-caption">
            Erleichtert das Verständnis, ist aber nicht zwingend erforderlich.
          </p>
          {r.facilitators.length === 0 ? (
            <p className="graphit-path-empty">Keine hilfreichen Konzepte.</p>
          ) : (
            <EntryList entries={r.facilitators} onSelect={props.onSelect} />
          )}
        </section>
      </div>
    </section>
  );
}

/**
 * Verdict for the selected concept, derived from the bucket that contains it.
 * @param props: Recommendation response
 * @returns: The verdict notice
 */
function TargetVerdict(props: { recommend: RecommendResponse }): JSX.Element {
  const r = props.recommend;
  const id = r.target.id;
  const blocked = r.blocked.find(e => e.id === id);
  const ready = r.ready_to_learn.some(e => e.id === id);
  const due = r.due_for_review.find(e => e.id === id);

  if (blocked) {
    const missing = blocked.missing_prereqs ?? [];
    return (
      <div className="graphit-notice" data-tone="blocked">
        <strong>Dafür fehlen dir noch Voraussetzungen.</strong>
        <p style={{ margin: '4px 0 0' }}>
          {missing.length > 0
            ? `Diese Konzepte hast du noch nicht vollständig bearbeitet: ${missing.join(', ')}. Arbeite sie zuerst ab. Unten stehen sie in der Reihenfolge, in der sie erreichbar sind.`
            : 'Weiter unten in der Kette wurde etwas nie beherrscht. Fang bei „Jetzt möglich" an.'}
        </p>
        <p
          className="graphit-small graphit-muted"
          style={{ margin: '4px 0 0' }}
        >
          Du kannst trotzdem fragen und ein Quiz starten. Das System hält dich
          nicht auf, es sagt dir nur, dass es schwerer wird.
        </p>
      </div>
    );
  }

  if (due) {
    return (
      <div className="graphit-notice" data-tone="due">
        <strong>Das hattest du schon beherrscht.</strong>
        <p style={{ margin: '4px 0 0' }}>
          Die Mastery ist nur mit der Zeit gesunken
          {due.days_until_due !== undefined
            ? ` (${formatDue(due.days_until_due)})`
            : ''}
          . Ein Quiz bringt sie zurück; gesperrt ist dadurch nichts.
        </p>
      </div>
    );
  }

  if (ready) {
    return (
      <div className="graphit-notice" data-tone="ready">
        <strong>Du kannst direkt loslegen.</strong>
        <p style={{ margin: '4px 0 0' }}>
          Alle direkten Voraussetzungen sind freigegeben.
        </p>
      </div>
    );
  }

  return (
    <div className="graphit-notice">
      <strong>Beherrscht.</strong>
      <p style={{ margin: '4px 0 0' }}>
        Dieses Konzept steht auf keiner offenen Liste mehr. Aktueller Status:{' '}
        {STATUS_SHORT[r.target.status]}.
      </p>
    </div>
  );
}

/**
 * Group of path entries inside a category; `kind` picks the colour (tree.css).
 * @param props: Kind, title, caption, entries, selection callback and extra renderer
 * @returns: The group, or null if empty
 */
function Group(props: {
  kind: 'open' | 'waiting' | 'refresh';
  title: string;
  caption: string;
  entries: PathEntry[];
  onSelect: (id: string) => void;
  renderExtra?: (entry: PathEntry) => React.ReactNode;
}): JSX.Element | null {
  if (props.entries.length === 0) {
    return null;
  }
  return (
    <div className="graphit-path-group" data-kind={props.kind}>
      <div className="graphit-path-group-title">
        {props.title} <span>({props.entries.length})</span>
      </div>
      <p className="graphit-path-caption">{props.caption}</p>
      <EntryList
        entries={props.entries}
        onSelect={props.onSelect}
        renderExtra={props.renderExtra}
      />
    </div>
  );
}

/**
 * List of clickable path entries with status pills.
 * @param props: Entries, selection callback and optional extra renderer
 * @returns: The list element
 */
function EntryList(props: {
  entries: PathEntry[];
  onSelect: (id: string) => void;
  renderExtra?: (entry: PathEntry) => React.ReactNode;
}): JSX.Element {
  return (
    <ul className="graphit-path-list">
      {props.entries.map(entry => (
        <li key={entry.id}>
          <button
            className="graphit-link"
            onClick={() => props.onSelect(entry.id)}
            // Full name as tooltip for truncated labels.
            title={entry.name}
          >
            {entry.name}
          </button>
          <StatusPill status={entry.status} />
          {props.renderExtra?.(entry)}
        </li>
      ))}
    </ul>
  );
}
