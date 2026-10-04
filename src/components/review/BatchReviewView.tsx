/**
 * Combined quiz across several concepts.
 *
 * All concepts are generated up front (see store.startBatchReview) and shown on one
 * page: questions in the main column, a question map on the right that shows what is
 * still open. One submit grades every concept and shows a shared evaluation.
 */

import * as React from 'react';

import { initAnswer, isAnswered } from '../../quiz/answerModel';
import { BatchReviewItem } from '../../state/types';
import { useGraphit, useStore } from '../../state/useStore';
import { MasteryBar, Spinner } from '../common/Common';
import { ResultCard } from '../quiz/Feedback';
import { QuestionRenderer } from '../quiz/questions/QuestionRenderer';

/**
 * DOM id of a question wrapper, so the map can scroll to it.
 * @param globalNo: Global question number
 * @returns: The element id
 */
const questionDomId = (globalNo: number) => `graphit-bq-q-${globalNo}`;

/**
 * DOM id of a concept's result card.
 * @param conceptId: Concept id
 * @returns: The element id
 */
const resultDomId = (conceptId: string) => `graphit-bq-result-${conceptId}`;
/**
 * DOM id of a concept's collapsible answer details.
 * @param conceptId: Concept id
 * @returns: The element id
 */
const detailsDomId = (conceptId: string) => `graphit-bq-details-${conceptId}`;

/**
 * Combined quiz view for the current phase.
 * @returns: The view, or null without a combined quiz
 */
export function BatchReviewView(): JSX.Element | null {
  const state = useGraphit();
  const bq = state.batchQuiz;
  if (!bq) {
    return null;
  }

  if (bq.phase === 'generating') {
    return <GeneratingBatch />;
  }
  if (bq.phase === 'feedback') {
    return <BatchFeedback />;
  }
  return <BatchAnswering />;
}

/**
 * Progress view while the questions of all concepts are generated.
 * @returns: The progress view
 */
function GeneratingBatch(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const bq = state.batchQuiz!;
  const total = bq.items.length;
  const pct = total === 0 ? 0 : Math.round((bq.generated / total) * 100);

  return (
    <div className="graphit-scroll">
      <div className="graphit-generating">
        <h4>
          <Spinner /> Quiz wird geladen …
        </h4>

        <div className="graphit-batch-progress" aria-hidden="true">
          <div
            className="graphit-batch-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="graphit-elapsed graphit-muted">
          Konzept {Math.min(bq.generated + 1, total)} von {total}
        </p>

        <ol className="graphit-batch-genlist">
          {bq.items.map((item, i) => {
            const stateLabel =
              i < bq.generated
                ? item.genError
                  ? 'failed'
                  : 'done'
                : i === bq.generated
                  ? 'active'
                  : 'pending';
            return (
              <li key={item.conceptId} data-state={stateLabel}>
                <span className="graphit-batch-genlist-mark" aria-hidden="true">
                  {stateLabel === 'done'
                    ? '✓'
                    : stateLabel === 'failed'
                      ? '✗'
                      : stateLabel === 'active'
                        ? '…'
                        : '·'}
                </span>
                {item.conceptName}
              </li>
            );
          })}
        </ol>

        <div className="graphit-btnrow">
          <button
            className="graphit-btn graphit-btn--quiet"
            onClick={() => store.clearBatchReview()}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Precomputed layout: each concept and the global number of its first question. */
interface NumberedItem {
  item: BatchReviewItem;
  index: number;
  /** Global question number (1-based) of this concept's first question. */
  start: number;
}

/**
 * Assigns global question numbers across all concepts.
 * @param items: Combined quiz items
 * @returns: Items with their first question number, plus the total question count
 */
function numberItems(items: BatchReviewItem[]): {
  numbered: NumberedItem[];
  total: number;
} {
  let counter = 0;
  const numbered = items.map((item, index) => {
    const start = counter + 1;
    counter += item.questions.length;
    return { item, index, start };
  });
  return { numbered, total: counter };
}

/**
 * Answering page with all questions, question map and sticky submit footer.
 * @returns: The answering view
 */
function BatchAnswering(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const bq = state.batchQuiz!;
  const submitting = bq.phase === 'submitting';
  // Two-step submit while questions are open, as in the single quiz.
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    setConfirming(false);
  }, [bq.items]);

  const { numbered, total } = React.useMemo(
    () => numberItems(bq.items),
    [bq.items]
  );

  const answeredCount = bq.items.reduce(
    (sum, item) =>
      sum +
      item.questions.filter(q => isAnswered(item.answers[q.question_id]))
        .length,
    0
  );
  const open = total - answeredCount;

  const jumpTo = (globalNo: number) => {
    document
      .getElementById(questionDomId(globalNo))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="graphit-scroll">
      <div className="graphit-batch">
        <div className="graphit-batch-main">
          <div className="graphit-quiz-header">
            <h3>{bq.title}</h3>
            <span className="graphit-small graphit-muted">
              {answeredCount} von {total} beantwortet
            </span>
          </div>
          <p className="graphit-muted">
            Alle gewählten Konzepte in einem Quiz. Beantworte die Fragen und gib
            am Ende alles zusammen ab. Im Anschluss siehst du direkt dein
            Ergebnis.
          </p>

          {numbered.map(({ item, index, start }) => (
            <section className="graphit-batch-concept" key={item.conceptId}>
              <h4 className="graphit-batch-concept-title">
                {item.conceptName}
              </h4>

              {item.questions.length === 0 ? (
                <div className="graphit-question-note">
                  Für dieses Konzept konnten keine Fragen erstellt werden. Es
                  wird bei der Abgabe übersprungen.
                </div>
              ) : (
                item.questions.map((question, qi) => {
                  const globalNo = start + qi;
                  return (
                    <div
                      id={questionDomId(globalNo)}
                      key={question.question_id}
                    >
                      <QuestionRenderer
                        question={question}
                        index={globalNo - 1}
                        answer={
                          item.answers[question.question_id] ??
                          initAnswer(question.payload)
                        }
                        disabled={submitting}
                        onChange={next =>
                          store.setBatchAnswer(
                            index,
                            question.question_id,
                            next
                          )
                        }
                      />
                    </div>
                  );
                })
              )}
            </section>
          ))}

          <div className="graphit-quiz-footer" data-confirming={confirming}>
            <button
              className={
                confirming
                  ? 'graphit-btn graphit-btn--warn'
                  : 'graphit-btn graphit-btn--primary'
              }
              disabled={submitting}
              onClick={() => {
                if (confirming || open === 0) {
                  setConfirming(false);
                  void store.submitBatchReview();
                } else {
                  setConfirming(true);
                }
              }}
            >
              {submitting ? (
                <>
                  <Spinner /> Wird gewertet …
                </>
              ) : confirming ? (
                'Trotzdem abgeben'
              ) : (
                'Quiz abgeben'
              )}
            </button>
            {confirming ? (
              <span className="graphit-small graphit-quiz-warn" role="alert">
                <strong>
                  {open} von {total} Fragen noch offen
                </strong>
                , sie gelten als falsch. Nochmal klicken, um wirklich abzugeben.
              </span>
            ) : (
              <span className="graphit-small graphit-muted">
                {open > 0
                  ? `${open} Frage(n) noch offen. Übersprungene Fragen gelten als falsch.`
                  : 'Alle Fragen bearbeitet.'}
              </span>
            )}
            <button
              className="graphit-btn graphit-btn--quiet"
              disabled={submitting}
              onClick={() => store.clearBatchReview()}
            >
              Verwerfen
            </button>
          </div>
        </div>

        <aside className="graphit-batch-map" aria-label="Fragenübersicht">
          <div className="graphit-batch-map-title">Übersicht</div>
          <div className="graphit-batch-map-boxes">
            {numbered.flatMap(({ item, start }) =>
              item.questions.length === 0
                ? [
                    <span
                      key={`${item.conceptId}-failed`}
                      className="graphit-batch-map-box"
                      data-kind="failed"
                      title={`${item.conceptName}: keine Fragen erstellt`}
                      aria-hidden="true"
                    >
                      ✗
                    </span>
                  ]
                : item.questions.map((question, qi) => {
                    const globalNo = start + qi;
                    const answered = isAnswered(
                      item.answers[question.question_id]
                    );
                    return (
                      <button
                        key={question.question_id}
                        className="graphit-batch-map-box"
                        data-answered={answered}
                        title={
                          answered
                            ? `Frage ${globalNo}: beantwortet`
                            : `Frage ${globalNo}: offen`
                        }
                        onClick={() => jumpTo(globalNo)}
                      >
                        {globalNo}
                      </button>
                    );
                  })
            )}
          </div>
          <div className="graphit-batch-map-legend">
            <span>
              <span
                className="graphit-batch-map-box"
                data-answered="true"
                aria-hidden="true"
              />{' '}
              beantwortet
            </span>
            <span>
              <span
                className="graphit-batch-map-box"
                data-answered="false"
                aria-hidden="true"
              />{' '}
              offen
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Shared evaluation with result map and per-concept result cards.
 * @returns: The feedback view
 */
function BatchFeedback(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const bq = state.batchQuiz!;

  const { numbered, total } = React.useMemo(
    () => numberItems(bq.items),
    [bq.items]
  );

  const graded = bq.items.filter(it => it.result);
  const totalCorrect = graded.reduce(
    (sum, it) => sum + (it.result?.n_correct ?? 0),
    0
  );
  const masteredCount = graded.filter(it => it.result?.mastered).length;

  // Open the concept's answer details and bring its card into view.
  const openConcept = (conceptId: string) => {
    const details = document.getElementById(
      detailsDomId(conceptId)
    ) as HTMLDetailsElement | null;
    if (details) {
      details.open = true;
    }
    document
      .getElementById(resultDomId(conceptId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="graphit-scroll">
      <div className="graphit-batch-feedback">
        <div className="graphit-scorecard">
          <h4>{bq.title} ausgewertet</h4>
          <p>
            Insgesamt {totalCorrect} von {total} Fragen richtig über{' '}
            {graded.length} {graded.length === 1 ? 'Konzept' : 'Konzepte'}.
            {masteredCount > 0
              ? ` ${masteredCount} davon jetzt als „beherrscht" gewertet.`
              : ''}
          </p>
        </div>

        {/* One box per question: green = correct, red = wrong. */}
        <div
          className="graphit-batch-summary-map"
          aria-label="Ergebnisübersicht"
        >
          <div className="graphit-batch-map-boxes">
            {numbered.flatMap(({ item, start }) => {
              const correctById = new Map(
                (item.result?.results ?? []).map(r => [
                  r.question_id,
                  r.correct
                ])
              );
              return item.questions.length === 0
                ? [
                    <span
                      key={`${item.conceptId}-failed`}
                      className="graphit-batch-map-box"
                      data-kind="failed"
                      title={`${item.conceptName}: keine Fragen erstellt`}
                      aria-hidden="true"
                    >
                      ✗
                    </span>
                  ]
                : item.questions.map((question, qi) => {
                    const globalNo = start + qi;
                    const correct = correctById.get(question.question_id);
                    return (
                      <button
                        key={question.question_id}
                        className="graphit-batch-map-box"
                        data-correct={correct}
                        title={
                          correct === undefined
                            ? `${item.conceptName}, Frage ${globalNo}: nicht gewertet`
                            : correct
                              ? `${item.conceptName}, Frage ${globalNo}: richtig`
                              : `${item.conceptName}, Frage ${globalNo}: falsch`
                        }
                        onClick={() => openConcept(item.conceptId)}
                      >
                        {globalNo}
                      </button>
                    );
                  });
            })}
          </div>

          <div className="graphit-batch-summary-legend">
            <span>
              <span
                className="graphit-batch-map-box"
                data-correct={true}
                aria-hidden="true"
              />{' '}
              richtig
            </span>
            <span>
              <span
                className="graphit-batch-map-box"
                data-correct={false}
                aria-hidden="true"
              />{' '}
              falsch
            </span>
          </div>
        </div>

        {bq.items.map(item => (
          <ConceptResult key={item.conceptId} item={item} />
        ))}

        <div className="graphit-btnrow" style={{ marginTop: 12 }}>
          <button
            className="graphit-btn graphit-btn--primary"
            onClick={() => store.clearBatchReview()}
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Result card of one concept in the combined quiz.
 * @param props: The combined quiz item
 * @returns: The result card
 */
function ConceptResult(props: { item: BatchReviewItem }): JSX.Element {
  const { item } = props;
  const result = item.result;

  if (!result) {
    return (
      <div
        className="graphit-result"
        id={resultDomId(item.conceptId)}
        data-correct={false}
      >
        <div className="graphit-result-head">
          <span>{item.conceptName}</span>
        </div>
        <div className="graphit-result-answer graphit-muted">
          {item.genError
            ? 'Es konnten keine Fragen erstellt werden, nicht gewertet.'
            : item.submitError
              ? 'Konnte nicht gewertet werden. Bitte später erneut versuchen.'
              : 'Nicht gewertet.'}
        </div>
      </div>
    );
  }

  const byId = new Map(item.questions.map(q => [q.question_id, q]));

  return (
    <div
      className="graphit-batch-concept-result"
      id={resultDomId(item.conceptId)}
    >
      <div className="graphit-scorecard graphit-batch-concept-score">
        <h4>
          {item.conceptName}: {result.n_correct} von {result.n_total} richtig
        </h4>
        <div className="graphit-meter">
          <div className="graphit-meter-label">
            <span>Aktuell abrufbar</span>
            <span>{Math.round(result.mastery * 100)} %</span>
          </div>
          <MasteryBar mastery={result.mastery} peak={result.mastery_peak} />
        </div>
        <dl className="graphit-facts">
          <dt>Beherrscht</dt>
          <dd>{result.mastered ? 'ja' : 'noch nicht'}</dd>
          <dt>Folgekonzepte</dt>
          <dd>
            {result.gate_passed ? 'freigegeben' : 'noch gesperrt'}
          </dd>
        </dl>
      </div>

      <details
        className="graphit-batch-concept-details"
        id={detailsDomId(item.conceptId)}
      >
        <summary>Antworten ansehen</summary>
        {result.results.map(r => (
          <ResultCard
            key={r.question_id}
            result={r}
            question={byId.get(r.question_id)}
          />
        ))}
      </details>
    </div>
  );
}
