/** Detail panel for the selected tree node. */

import * as React from 'react';

import { ConceptProgress, RollupStats } from '../../api/types';
import { CommandIDs } from '../../commands';
import {
  blockedTarget,
  conceptIndex,
  formatDue,
  formatMastery,
  isConceptProgress,
  MASTERY_THRESHOLD,
  nodePath,
  nodeStats,
  STATUS_LABEL,
  statusExplanation
} from '../../state/selectors';
import { useCommands, useGraphit, useStore } from '../../state/useStore';
import {
  EmptyState,
  MasteryBar,
  ReadyLock,
  AchievementBar,
  StatusPill
} from '../common/Common';
import { RecommendPanel } from './RecommendPanel';

/**
 * Detail panel with actions, progress facts and learning path of the selected node.
 * @returns: The detail panel
 */
export function NodeDetail(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const commands = useCommands();
  const index = React.useMemo(
    () => conceptIndex(state.progress),
    [state.progress]
  );
  // Links the hint below the buttons to the prerequisite list in RecommendPanel.
  // All hooks must stay above the early return, or the hook count changes between renders.
  const prereqRef = React.useRef<HTMLElement>(null);
  // Two-step start when prerequisites are missing: the first click arms the button and
  // shows a warning, the second starts anyway. Selecting another node disarms.
  const [armed, setArmed] = React.useState(false);
  const selectionId = state.selection?.id;
  React.useEffect(() => {
    setArmed(false);
  }, [selectionId]);

  const node = state.selection;
  if (!node) {
    return (
      <EmptyState
        title="Nichts ausgewählt"
        body="Wähle links ein Kapitel, Thema oder Konzept, um Details, Lernstand und Aktionen zu sehen."
      />
    );
  }

  const stats = nodeStats(node, index, state.progress);
  const path = nodePath(state.tree, node.id);
  const isConcept = node.type === 'concept';
  const isEmptyBranch = !isConcept && node.children.length === 0;

  const openChat = () => {
    if (!isConcept) {
      return;
    }
    void commands.execute(CommandIDs.openChat, {
      scope: { id: node.id, name: node.name, type: node.type }
    });
  };

  const blocked = isConcept ? blockedTarget(state.recommend) : null;
  // Missing prerequisites come from /progress, which is loaded before /recommend.
  const missing: string[] =
    isConcept && stats && isConceptProgress(stats) && !stats.prereqs_met
      ? stats.prereqs_missing
      : (blocked?.missing_prereqs ?? []);
  const needsConfirm = isConcept && missing.length > 0;

  const startQuiz = () => {
    if (needsConfirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    void commands.execute(CommandIDs.startQuiz, {
      conceptId: isConcept ? node.id : undefined,
      scopeId: isConcept ? undefined : node.id
    });
  };

  return (
    <div className="graphit-detail">
      <h3>{node.name}</h3>
      <div className="graphit-detail-path">
        {path.map(p => p.name).join(' › ')}
      </div>

      <div className="graphit-btnrow">
        {/* Chat only for concepts: only there do scope, quiz and mastery agree. */}
        <button
          className="graphit-btn graphit-btn--primary"
          onClick={openChat}
          disabled={!isConcept}
          title={
            isConcept
              ? 'Frage den Tutor zu diesem Konzept'
              : 'Fragen sind nur zu einzelnen Konzepten möglich. Wähle einen Knoten der untersten Ebene.'
          }
        >
          Im Chat fragen
        </button>
        <button
          className={armed ? 'graphit-btn graphit-btn--warn' : 'graphit-btn'}
          onClick={startQuiz}
          disabled={isEmptyBranch}
          title={
            isEmptyBranch
              ? 'Dieser Ast enthält keine Konzepte'
              : armed
                ? 'Fragt das Konzept ab, obwohl Voraussetzungen fehlen'
                : isConcept
                  ? 'Stellt dir eine Frage zu diesem Konzept'
                  : 'Löst diesen Bereich in prüfbare Konzepte auf'
          }
        >
          {/* A concept quiz has exactly one question; a branch becomes a full quiz. */}
          {armed
            ? 'Trotzdem abfragen'
            : isConcept
              ? 'Konzept abfragen'
              : 'Quiz starten'}
        </button>
      </div>

      {/* Informs about missing prerequisites without blocking the buttons. */}
      {needsConfirm || blocked ? (
        <div className="graphit-notice" data-tone="blocked" data-armed={armed}>
          {armed ? (
            <>
              <strong>Voraussetzungen fehlen: {missing.join(', ')}.</strong>{' '}
              Die Frage wird dadurch schwerer. Nochmal auf „Trotzdem abfragen"
              klicken, um es dennoch zu versuchen.
            </>
          ) : missing.length > 0 ? (
            <>
              Es fehlen noch Voraussetzungen: {missing.join(', ')}.
            </>
          ) : (
            <>Es fehlen noch Voraussetzungen.</>
          )}{' '}
          Du findest die Voraussetzungen{' '}
          <button
            className="graphit-linklike"
            onClick={() =>
              prereqRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              })
            }
          >
            unten
          </button>
          .
        </div>
      ) : null}

      {stats === undefined ? (
        <p className="graphit-muted" style={{ marginTop: 16 }}>
          Keine Fortschrittsdaten zu diesem Knoten. Das ist normal, wenn er im
          Graphen nicht an der Hierarchie hängt.
        </p>
      ) : isConceptProgress(stats) ? (
        <ConceptFacts concept={stats} />
      ) : (
        <GroupFacts stats={stats} />
      )}

      {isConcept ? (
        <RecommendPanel
          recommend={state.recommend}
          status={state.recommendStatus}
          onSelect={id => store.selectById(id)}
          prereqRef={prereqRef}
        />
      ) : null}
    </div>
  );
}

/**
 * Status, mastery meter and facts of a concept.
 * @param props: Concept progress
 * @returns: The facts block
 */
function ConceptFacts(props: { concept: ConceptProgress }): JSX.Element {
  const c = props.concept;
  // Only after a quiz can the shown mastery lag behind the server.
  const wasQuizzed = c.s + c.f > 0;
  const [dismissed, setDismissed] = React.useState<Set<string>>(
    () => new Set()
  );
  const showRefreshHint = wasQuizzed && !dismissed.has(c.id);
  return (
    <>
      <div className="graphit-section" style={{ marginTop: 16 }}>
        <div className="graphit-btnrow">
          <StatusPill status={c.status} />
          <ReadyLock ready={c.prereqs_met} missing={c.prereqs_missing} />
          <span className="graphit-small graphit-muted">
            {STATUS_LABEL[c.status]}
          </span>
        </div>
        <p className="graphit-small" style={{ marginTop: 6 }}>
          {statusExplanation(c)}
        </p>
      </div>

      {/* One block, so the tour can point at title and bar together. */}
      <div className="graphit-mastery">
        <h4 className="graphit-meter-title">Mastery-Score</h4>
        {c.mastery_peak > 0 ? null : (
          <div className="graphit-meter-label">
            <span>Aktuell abrufbar: {formatMastery(c.mastery)}</span>
          </div>
        )}
        <div className="graphit-meter">
          <MasteryBar
            mastery={c.mastery}
            peak={c.mastery_peak}
            threshold={MASTERY_THRESHOLD}
            labeled
          />
        </div>
      </div>

      {showRefreshHint ? (
        <div className="graphit-hint" role="note">
          <span className="graphit-hint-text">
            Zu diesem Konzept wurde bereits ein Quiz gemacht. Falls der Wert
            veraltet wirkt, oben rechts über ⟳ aktualisieren.
          </span>
          <button
            className="graphit-hint-close"
            aria-label="Hinweis schließen"
            title="Hinweis schließen"
            onClick={() => setDismissed(prev => new Set(prev).add(c.id))}
          >
            ×
          </button>
        </div>
      ) : null}

      <dl className="graphit-facts">
        <dt>Nächste Wiederholung</dt>
        {/* A review date only exists once the concept was mastered. */}
        <dd>
          {c.gate_passed
            ? formatDue(c.days_until_due)
            : 'erst nach dem ersten Beherrschen'}
        </dd>
        <dt>Letztes Quiz</dt>
        <dd>{formatSince(c.days_since_quiz)}</dd>
        <dt>Im Chat angeschaut</dt>
        <dd>{c.visited_count}×</dd>
        <dt>Antworten insgesamt</dt>
        <dd>
          {c.s} richtig · {c.f} falsch
        </dd>
        <dt>Folgekonzepte</dt>
        <dd>
          {c.gate_passed
            ? 'freigegeben → dieses Konzept blockiert keine Folgekonzepte mehr'
            : 'noch gesperrt, die Schwelle wurde nie erreicht'}
        </dd>
      </dl>
    </>
  );
}

/**
 * Formats the time since the last quiz.
 * @param days: Days since the last quiz, or null
 * @returns: "heute", "gestern", "vor N Tagen" or "noch keins"
 */
function formatSince(days: number | null): string {
  if (days === null) {
    return 'noch keins';
  }
  if (days <= 0) {
    return 'heute';
  }
  if (days === 1) {
    return 'gestern';
  }
  return `vor ${days} Tagen`;
}

/**
 * Aggregated facts of a chapter, topic or subtopic.
 * @param props: Rollup statistics
 * @returns: The facts block
 */
function GroupFacts(props: { stats: RollupStats }): JSX.Element {
  const s = props.stats;
  return (
    <div className="graphit-section" style={{ marginTop: 16 }}>
      <div className="graphit-meter-label">
        <span>
          {s.mastered} von {s.total} beherrscht
        </span>
        <span>Ø {Math.round(s.mastery_avg * 100)} %</span>
      </div>
      <AchievementBar stats={s} />
      <dl className="graphit-facts" style={{ marginTop: 10 }}>
        <dt>Wiederholung fällig</dt>
        <dd>{s.due_review}</dd>
        <dt>In Arbeit</dt>
        <dd>{s.in_progress}</dd>
        <dt>Angeschaut, nie geprüft</dt>
        <dd>{s.visited}</dd>
        <dt>Noch nicht begonnen</dt>
        <dd>{s.new}</dd>
        <dt>Freigegeben (Gate)</dt>
        <dd>{s.gate_passed}</dd>
      </dl>
      <p className="graphit-small graphit-muted">
        Der Durchschnitt zählt nie getestete Konzepte als 0 %.
      </p>
    </div>
  );
}
