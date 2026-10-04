/** Quiz orchestration: generating → answering → submitting → feedback. */

import * as React from 'react';

import { CommandIDs } from '../../commands';
import { initAnswer, isAnswered, isComplete } from '../../quiz/answerModel';
import { useCommands, useGraphit, useStore } from '../../state/useStore';
import { EmptyState, ErrorBanner, Spinner } from '../common/Common';
import { Feedback } from './Feedback';
import { QuestionRenderer } from './questions/QuestionRenderer';

/**
 * Single-concept quiz view covering all phases.
 * @returns: The quiz view
 */
export function QuizPanel(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const commands = useCommands();
  const quiz = state.quiz;
  // Two-step submit while questions are open: the first click shows a warning, the
  // second submits. Any answer change resets it.
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    setConfirming(false);
  }, [quiz?.answers, quiz?.conceptId]);

  // Normally unreachable (App.tsx hides the tab without a quiz), but required below.
  if (!quiz) {
    return (
      <EmptyState
        title="Kein Quiz aktiv"
        body="Wähle im Tab „Konzepte“ ein Konzept und starte dort ein Quiz. Oder arbeite unter „Wiederholung“ die fälligen Konzepte ab."
      >
        <div className="graphit-btnrow" style={{ justifyContent: 'center' }}>
          <button
            className="graphit-btn"
            onClick={() => store.setActiveTab('concepts')}
          >
            Zu den Konzepten
          </button>
        </div>
      </EmptyState>
    );
  }

  if (quiz.candidates) {
    return (
      <div className="graphit-quiz">
        <h3>Welches Konzept soll geprüft werden?</h3>
        <p className="graphit-muted">
          Ein Quiz deckt immer genau ein Konzept ab. Aus „{quiz.conceptName}"
          ergeben sich {quiz.candidates.length} prüfbare Konzepte.
        </p>
        <ul className="graphit-reclist">
          {quiz.candidates.map(candidate => (
            <li key={candidate.id}>
              <button
                className="graphit-link"
                onClick={() =>
                  void store.startQuiz(
                    candidate.id,
                    candidate.name ?? candidate.id
                  )
                }
              >
                {candidate.name ?? candidate.id}
              </button>
            </li>
          ))}
        </ul>
        {quiz.candidates.length === 0 ? (
          <p className="graphit-muted">
            Hier ist gerade nichts offen, alle Konzepte dieses Bereichs sind
            aktuell beherrscht.
          </p>
        ) : null}
        <div className="graphit-btnrow">
          <button
            className="graphit-btn graphit-btn--quiet"
            onClick={() => store.clearQuiz()}
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  const answered = quiz.questions.filter(q =>
    isAnswered(quiz.answers[q.question_id])
  ).length;
  const incomplete = quiz.questions.filter(
    q =>
      isAnswered(quiz.answers[q.question_id]) &&
      !isComplete(q.payload, quiz.answers[q.question_id])
  ).length;
  const open = quiz.questions.length - answered;

  return (
    <div className="graphit-quiz">
      <div className="graphit-quiz-header">
        <h3>{quiz.conceptName}</h3>
        {quiz.phase === 'answering' ? (
          <span className="graphit-small graphit-muted">
            {answered} von {quiz.questions.length} beantwortet
          </span>
        ) : null}
      </div>

      {quiz.error ? (
        <ErrorBanner
          error={quiz.error}
          onRetry={
            quiz.error.canRetry && quiz.conceptId
              ? () => void store.startQuiz(quiz.conceptId, quiz.conceptName)
              : undefined
          }
          onDismiss={() => store.clearQuiz()}
        />
      ) : null}

      {quiz.phase === 'generating' ? (
        <Generating
          onCancel={() => {
            store.cancelQuizGeneration();
          }}
        />
      ) : null}

      {(quiz.phase === 'answering' || quiz.phase === 'submitting') &&
      quiz.questions.length > 0 ? (
        <>
          {quiz.questions.map((question, i) => (
            <QuestionRenderer
              key={question.question_id}
              question={question}
              index={i}
              // Restored quizzes may lack an answer entry.
              answer={
                quiz.answers[question.question_id] ??
                initAnswer(question.payload)
              }
              disabled={quiz.phase === 'submitting'}
              onChange={next => store.setAnswer(question.question_id, next)}
            />
          ))}

          <div className="graphit-quiz-footer" data-confirming={confirming}>
            <button
              className={
                confirming
                  ? 'graphit-btn graphit-btn--warn'
                  : 'graphit-btn graphit-btn--primary'
              }
              disabled={quiz.phase === 'submitting'}
              onClick={() => {
                if (confirming || (open === 0 && incomplete === 0)) {
                  setConfirming(false);
                  void store.submitQuiz();
                } else {
                  setConfirming(true);
                }
              }}
            >
              {quiz.phase === 'submitting' ? (
                <>
                  <Spinner /> Wird gewertet …
                </>
              ) : confirming ? (
                'Trotzdem abgeben'
              ) : (
                'Abgeben'
              )}
            </button>
            {confirming ? (
              <span className="graphit-small graphit-quiz-warn" role="alert">
                <strong>
                  {open > 0 ? `${open} unbeantwortet` : ''}
                  {open > 0 && incomplete > 0 ? ', ' : ''}
                  {incomplete > 0 ? `${incomplete} unvollständig` : ''}
                </strong>
                , zählt als falsch. Nochmal klicken, um wirklich abzugeben.
              </span>
            ) : (
              <span className="graphit-small graphit-muted">
                {open > 0
                  ? `${open} offen. Übersprungene Fragen gelten als falsch.`
                  : 'Alle Fragen bearbeitet.'}
              </span>
            )}
            <button
              className="graphit-btn graphit-btn--quiet"
              disabled={quiz.phase === 'submitting'}
              onClick={() => store.clearQuiz()}
            >
              Quiz verwerfen
            </button>
          </div>
        </>
      ) : null}

      {quiz.phase === 'feedback' && quiz.result ? (
        <Feedback
          result={quiz.result}
          questions={quiz.questions}
          conceptName={quiz.conceptName}
          onRestart={() =>
            void store.startQuiz(quiz.conceptId, quiz.conceptName)
          }
          onClose={() => store.clearQuiz()}
          extraActions={
            <button
              className="graphit-btn"
              onClick={() =>
                void commands.execute(CommandIDs.openChat, {
                  scope: {
                    id: quiz.conceptId,
                    name: quiz.conceptName,
                    type: 'concept'
                  }
                })
              }
            >
              Im Chat nachfragen
            </button>
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Loading state while /quiz/start returns the questions.
 * @param props: `onCancel` aborts the generation
 * @returns: The loading element
 */
function Generating(props: { onCancel: () => void }): JSX.Element {
  return (
    <div className="graphit-generating">
      <h4>
        <Spinner /> Quiz wird geladen …
      </h4>
      <div className="graphit-btnrow">
        <button
          className="graphit-btn graphit-btn--quiet"
          onClick={props.onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
