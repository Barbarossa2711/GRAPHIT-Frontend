/**
 * Review tab: how many concepts are due and a way to review them.
 *
 * The headline number is `summary.due_review` only (mastered once, then decayed); it is
 * deliberately not summed with never-mastered concepts.
 */

import * as React from 'react';

import {
  dueCount,
  dueList,
  formatDue,
  isOverdue
} from '../../state/selectors';
import { useGraphit, useStore } from '../../state/useStore';
import { EmptyState, ErrorBanner, MasteryBar, Spinner } from '../common/Common';
import { BatchReviewView } from './BatchReviewView';

/**
 * List of due concepts with selection and start buttons, or the running review session.
 * @returns: The review view
 */
export function ReviewDueView(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const due = React.useMemo(() => dueList(state.progress), [state.progress]);
  const [selected, setSelected] = React.useState<Set<string> | null>(null);

  // Preselect the first `reviewSessionSize` entries, refreshed when the list changes.
  const effectiveSelection = React.useMemo(() => {
    if (selected) {
      return selected;
    }
    return new Set(due.slice(0, state.reviewSessionSize).map(c => c.id));
  }, [selected, due, state.reviewSessionSize]);

  // Only review sessions are shown here; scope quizzes live in the quiz tab.
  if (state.batchQuiz?.origin === 'review') {
    return <BatchReviewView />;
  }

  if (state.progressStatus === 'loading' && !state.progress) {
    return (
      <div className="graphit-empty">
        <Spinner /> Lernstand wird geladen …
      </div>
    );
  }

  if (state.progressError && !state.progress) {
    return (
      <div className="graphit-scroll">
        <ErrorBanner
          error={state.progressError}
          onRetry={() => void store.refreshProgress({ force: true })}
        />
      </div>
    );
  }

  const count = dueCount(state.progress);
  const chosen = due.filter(c => effectiveSelection.has(c.id));

  return (
    <div className="graphit-scroll graphit-review">
      <div className="graphit-review-hero">
        <div className="graphit-review-headline">
          <span className="graphit-review-count" data-zero={count === 0}>
            {count}
          </span>
          <span className="graphit-review-label">
            {count === 1 ? 'Konzept' : 'Konzepte'} zur Wiederholung
          </span>
        </div>
      </div>

      {count === 0 ? (
        <EmptyState
          title="Gerade nichts fällig"
          body="Alle einmal beherrschten Konzepte liegen noch über der Schwelle. Schau unter „Statistik“, was demnächst ansteht."
        />
      ) : (
        <>
          <p className="graphit-muted graphit-review-intro">
            Diese Konzepte hattest du schon einmal beherrscht; die Abrufbarkeit
            ist zeitbedingt gesunken. Sie halten deinen Lernweg{' '}
            <strong>nicht</strong> auf. Eine Wiederholung ist trotzdem sinnvoll.
          </p>

          <div className="graphit-review-listhead">
            <span className="graphit-small graphit-muted">
              {chosen.length} von {due.length} ausgewählt
            </span>
            <span className="graphit-review-actions">
              <button
                className="graphit-linklike"
                disabled={chosen.length === due.length}
                onClick={() => setSelected(new Set(due.map(c => c.id)))}
              >
                Alle
              </button>
              <button
                className="graphit-linklike"
                disabled={chosen.length === 0}
                onClick={() => setSelected(new Set())}
              >
                Keine
              </button>
            </span>
          </div>

          <ul className="graphit-checklist graphit-review-list">
            {due.map(concept => {
              // Filled chip and row accent = due now, outlined = due within the week.
              const overdue = isOverdue(concept);
              return (
                <li key={concept.id} data-overdue={overdue}>
                  <input
                    type="checkbox"
                    checked={effectiveSelection.has(concept.id)}
                    onChange={() => {
                      const next = new Set(effectiveSelection);
                      if (next.has(concept.id)) {
                        next.delete(concept.id);
                      } else {
                        next.add(concept.id);
                      }
                      setSelected(next);
                    }}
                    aria-label={concept.name}
                  />
                  <button
                    className="graphit-link graphit-checklist-name"
                    onClick={() => {
                      store.selectById(concept.id);
                      store.setActiveTab('concepts');
                    }}
                    title="Im Konzeptbaum öffnen"
                  >
                    {concept.name}
                  </button>
                  {/* Shows how far mastery has decayed below the peak. */}
                  <div className="graphit-review-bar">
                    <MasteryBar
                      mastery={concept.mastery}
                      peak={concept.mastery_peak}
                    />
                  </div>
                  <span className="graphit-due-chip" data-overdue={overdue}>
                    {formatDue(concept.days_until_due)}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Sticky, so the start button stays reachable for long lists. */}
          <div className="graphit-review-actionbar">
            <button
              className="graphit-btn graphit-btn--primary"
              disabled={chosen.length === 0}
              onClick={() =>
                void store.startBatchReview(
                  chosen.map(c => ({ id: c.id, name: c.name }))
                )
              }
            >
              Wiederholung starten ({chosen.length})
            </button>
            <button
              className="graphit-btn"
              disabled={due.length === 0}
              onClick={() =>
                void store.startBatchReview(
                  due.map(c => ({ id: c.id, name: c.name }))
                )
              }
            >
              Alle wiederholen ({due.length})
            </button>
            <span className="graphit-small graphit-muted">
              Die ausgewählten Konzepte werden zu einem Quiz zusammengefasst.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
