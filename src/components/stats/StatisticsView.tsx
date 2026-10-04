/** Overall progress: summary cards, per-chapter rollups, upcoming reviews. */

import { DomainNode, RollupStats } from '../../api/types';
import {
  answerTotals,
  dueCount,
  formatDue,
  openCount,
  masteryAverageTested,
  percent,
  ReviewLoad,
  reviewLoad,
  soonDueList,
  testedCount
} from '../../state/selectors';
import { useGraphit, useStore } from '../../state/useStore';
import {
  EmptyState,
  ErrorBanner,
  Spinner,
  AchievementBar,
  AchievementLegend,
  StatusBar
} from '../common/Common';

/**
 * Statistics tab with summary cards, status distribution, chapter table and review load.
 * @returns: The statistics view
 */
export function StatisticsView(): JSX.Element {
  const state = useGraphit();
  const store = useStore();

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

  if (!state.progress) {
    return <EmptyState title="Kein Lernstand verfügbar" />;
  }

  const summary = state.progress.summary;
  // Same 14-day horizon as the review-load chart.
  const soon = soonDueList(state.progress, 14);
  const soonShown = soon.slice(0, 10);
  const chapters = collectChapters(state.tree);
  const answers = answerTotals(state.progress);
  const tested = testedCount(state.progress);
  const testedAvg = masteryAverageTested(state.progress);
  const load = reviewLoad(state.progress, 14);

  return (
    <div className="graphit-scroll">
      <div className="graphit-section">
        <h3>Gesamtüberblick</h3>
        {/* Row 1: lecture state (reached once = mastered + due). Row 2: quiz answers. */}
        <div className="graphit-cards-title">Stand der Vorlesung</div>
        <div className="graphit-cards">
          <Card label="Konzepte gesamt" value={summary.total} />
          <Card
            label="noch offen"
            hint="Konzepte, deren Bestmarke die Schwelle noch nie erreicht hat: unberührt, nur angeschaut oder in Arbeit."
            value={openCount(state.progress)}
          />
          <Card
            label={`Schwelle je erreicht (${summary.gate_passed} von ${summary.total})`}
            hint="Konzepte, deren Bestmarke die Schwelle mindestens einmal erreicht hat. Die Bestmarke sinkt nie, deshalb geben diese Konzepte ihre Folgekonzepte dauerhaft frei. Entspricht der Summe der beiden Karten rechts."
            value={`${percent(summary.gate_passed, summary.total)} %`}
          />
          <Card
            label={`aktuell beherrscht (${summary.mastered} von ${summary.total})`}
            hint="Konzepte, deren aktuelle Mastery heute mindestens die Schwelle erreicht."
            value={`${percent(summary.mastered, summary.total)} %`}
            status="mastered"
          />
          <Card
            label="Wiederholung fällig"
            hint="Konzepte, die die Schwelle schon einmal erreicht hatten und deren aktuelle Mastery wieder darunter gesunken ist. Sie blockieren keine Folgekonzepte."
            value={dueCount(state.progress)}
            status="due_review"
          />
        </div>

        <div className="graphit-cards-title">Deine Abfragen</div>
        <div className="graphit-cards">
          <Card
            label={`mindestens einmal abgefragt (${tested} von ${summary.total})`}
            hint="Konzepte, zu denen du mindestens eine Frage beantwortet hast, richtig oder falsch."
            value={`${percent(tested, summary.total)} %`}
          />
          <Card
            label={
              answers.total > 0
                ? `richtig beantwortet (${answers.correct} von ${answers.total})`
                : 'richtig beantwortet'
            }
            hint="Anteil der richtigen Antworten an allen Fragen, die du bisher beantwortet hast."
            value={
              answers.accuracy === null
                ? '–'
                : `${Math.round(answers.accuracy * 100)} %`
            }
          />
          <Card
            label={
              testedAvg === null
                ? 'Ø Mastery der abgefragten Konzepte'
                : `Ø Mastery der abgefragten Konzepte (${tested})`
            }
            hint="Durchschnitt der aktuellen Mastery über alle Konzepte, zu denen du mindestens eine Frage beantwortet hast. Nie abgefragte Konzepte zählen nicht mit."
            value={testedAvg === null ? '–' : `${Math.round(testedAvg * 100)} %`}
          />
        </div>
        <div className="graphit-meter-head">
          <h4>Lernfortschritt</h4>
          <span>
            {summary.total > 0
              ? `${percent(summary.mastered, summary.total)} % beherrscht`
              : '–'}
          </span>
        </div>
        <AchievementBar stats={summary} />
        <AchievementLegend stats={summary} rest={false} />
      </div>

      <div className="graphit-section">
        <h3>Gesamter Bearbeitungsfortschritt (verteilt nach Status)</h3>
        <StatusBar stats={summary} />
        <p className="graphit-small graphit-muted">
          Jedes Konzept hat genau einen Status, dieser Balken ist deshalb immer
          voll. Er sagt nicht, wie weit du bist, sondern wo die Vorlesung gerade
          steht. Wie viel davon Erreichtes ist, steht im Balken darüber.
        </p>
      </div>

      <div className="graphit-section">
        <h3>Wiederholungslast der nächsten 14 Tage</h3>
        <ReviewLoadChart load={load} />
        <p className="graphit-small graphit-muted">
          Gezählt werden nur Konzepte, die die Schwelle einmal erreicht haben,
          denn nur die haben überhaupt einen Wiederholungstermin. Alles, was
          heute oder früher fällig wurde, steht im ersten Balken zusammen.
          {load.beyond > 0
            ? ` Weitere ${load.beyond} ${load.beyond === 1 ? 'Konzept wird' : 'Konzepte werden'} erst nach diesen 14 Tagen fällig.`
            : ''}
        </p>
      </div>

      {soon.length > 0 ? (
        <details className="graphit-section graphit-collapse" open>
          <summary>
            <h3>Demnächst fällig ({soon.length})</h3>
          </summary>
          <ul className="graphit-checklist">
            {soonShown.map(concept => (
              <li key={concept.id}>
                <button
                  className="graphit-link graphit-checklist-name"
                  onClick={() => {
                    store.selectById(concept.id);
                    store.setActiveTab('concepts');
                  }}
                >
                  {concept.name}
                </button>
                <span className="graphit-small graphit-muted">
                  {formatDue(concept.days_until_due)}
                </span>
              </li>
            ))}
          </ul>
          <p className="graphit-small graphit-muted">
            Konzepte, die innerhalb der nächsten 14 Tage unter die Schwelle
            fallen, also dieselbe Spanne wie im Diagramm darüber.
            {soon.length > soonShown.length
              ? ` Angezeigt sind die ${soonShown.length} dringendsten, ${soon.length - soonShown.length} weitere folgen danach.`
              : ''}
          </p>
        </details>
      ) : null}

      <div className="graphit-section">
        <h3>Nach Kapitel</h3>
        {chapters.length === 0 ? (
          <p className="graphit-muted">
            Keine Kapitelstruktur geladen. Der Baum muss dafür verfügbar sein.
          </p>
        ) : (
          <table className="graphit-table">
            <thead>
              <tr>
                <th>Kapitel</th>
                <th className="graphit-num">beherrscht</th>
                <th className="graphit-num">Anteil</th>
                <th className="graphit-num">fällig</th>
                <th style={{ width: '30%' }}>Fortschritt</th>
                <th className="graphit-num">Ø</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map(chapter => {
                const stats: RollupStats | undefined =
                  state.progress?.rollup[chapter.id];
                return (
                  <tr key={chapter.id}>
                    <td>
                      <button
                        className="graphit-link"
                        onClick={() => {
                          store.selectById(chapter.id);
                          store.setActiveTab('concepts');
                        }}
                      >
                        {chapter.name}
                      </button>
                    </td>
                    <td className="graphit-num">
                      {stats ? `${stats.mastered}/${stats.total}` : '–'}
                    </td>
                    {/* Percentage makes chapters of different size comparable. */}
                    <td className="graphit-num">
                      {stats ? `${percent(stats.mastered, stats.total)} %` : '–'}
                    </td>
                    <td className="graphit-num">{stats?.due_review ?? '–'}</td>
                    <td>
                      {stats ? (
                        <AchievementBar stats={stats} />
                      ) : (
                        <span className="graphit-muted graphit-small">
                          keine Daten
                        </span>
                      )}
                    </td>
                    <td className="graphit-num">
                      {stats ? `${Math.round(stats.mastery_avg * 100)} %` : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

/**
 * Review schedule as one column per day, plus a leading column for everything already
 * due. Bars are scaled against the tallest column; ticks at today, +7 and +14.
 * @param props: Review load
 * @returns: The chart element
 */
function ReviewLoadChart(props: { load: ReviewLoad }): JSX.Element {
  const { load } = props;
  const gesamt = load.overdue + load.days.reduce((n, d) => n + d.count, 0);

  if (gesamt === 0) {
    return (
      <p className="graphit-muted">
        In den nächsten 14 Tagen steht keine Wiederholung an.
      </p>
    );
  }

  return (
    <>
      <div
        className="graphit-load"
        role="img"
        aria-label={`Wiederholungen: ${load.overdue} fällig, ${gesamt - load.overdue} in den nächsten 14 Tagen`}
      >
        <div className="graphit-load-col" data-overdue="true">
          <span
            className="graphit-load-bar"
            style={{ height: `${(load.overdue / load.max) * 100}%` }}
            title={`bereits fällig: ${load.overdue}`}
          />
          <span className="graphit-load-count">{load.overdue || ''}</span>
        </div>
        {load.days.map(d => (
          <div key={d.day} className="graphit-load-col">
            <span
              className="graphit-load-bar"
              style={{ height: `${(d.count / load.max) * 100}%` }}
              title={`in ${d.day} ${d.day === 1 ? 'Tag' : 'Tagen'}: ${d.count}`}
            />
            <span className="graphit-load-count">{d.count || ''}</span>
          </div>
        ))}
      </div>
      <div className="graphit-load-axis">
        <span>fällig</span>
        <span>in 7 Tagen</span>
        <span>in 14 Tagen</span>
      </div>
    </>
  );
}

/**
 * Summary card with a number and label.
 * @param props: Label, value, optional status colour and hint text
 * @returns: The card element
 */
function Card(props: {
  label: string;
  value: number | string;
  status?: string;
  /** Explanation of the number, shown as a tooltip on an info mark. */
  hint?: string;
}): JSX.Element {
  return (
    <div className="graphit-card" data-status={props.status}>
      {props.hint ? <InfoMark text={props.hint} /> : null}
      <div className="graphit-card-value">{props.value}</div>
      <div className="graphit-card-label">{props.label}</div>
    </div>
  );
}

/**
 * Info mark in a card's top-right corner, drawn as SVG for consistent centring.
 * @param props: Tooltip text
 * @returns: The info mark
 */
function InfoMark(props: { text: string }): JSX.Element {
  return (
    <span
      className="graphit-info"
      title={props.text}
      aria-label={props.text}
      role="img"
      tabIndex={0}
    >
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" />
        <circle cx="7" cy="4.3" r="0.95" fill="currentColor" />
        <rect x="6.2" y="6.2" width="1.6" height="4.6" rx="0.5" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * Collects all chapter nodes below the lecture roots.
 * @param forest: Tree roots
 * @returns: Chapters in tree order
 */
function collectChapters(forest: DomainNode[] | null): DomainNode[] {
  if (!forest) {
    return [];
  }
  const out: DomainNode[] = [];
  const walk = (nodes: DomainNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'chapter') {
        out.push(node);
      } else if (node.type === 'lecture') {
        walk(node.children);
      }
    }
  };
  walk(forest);
  return out;
}
