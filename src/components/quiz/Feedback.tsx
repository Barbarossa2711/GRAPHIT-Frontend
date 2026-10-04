/**
 * Feedback after submitting a quiz.
 *
 * `solution` is untyped on the wire, so the display degrades gracefully: IDs are mapped
 * back to display text when the shape is recognised, otherwise only the result badge
 * and explanation are shown.
 */

import * as React from 'react';

import {
  Answer,
  ClientQuestion,
  QuestionPayload,
  QuizOption,
  QuizResult,
  QuizSubmitResponse
} from '../../api/types';
import { parseCloze } from '../../quiz/clozeParser';
import { formatDue } from '../../state/selectors';
import { MasteryBar } from '../common/Common';

/**
 * Score card plus one result card per question.
 * @param props: Submit result, questions, concept name, restart/close callbacks and
 *   optional extra action buttons
 * @returns: The feedback view
 */
export function Feedback(props: {
  result: QuizSubmitResponse;
  questions: ClientQuestion[];
  conceptName: string;
  onRestart: () => void;
  onClose: () => void;
  extraActions?: React.ReactNode;
}): JSX.Element {
  const { result } = props;
  const byId = React.useMemo(
    () => new Map(props.questions.map(q => [q.question_id, q])),
    [props.questions]
  );

  return (
    <>
      <div className="graphit-scorecard">
        <h4>
          {props.conceptName}: {result.n_correct} von {result.n_total} richtig
        </h4>

        <div className="graphit-meter">
          <div className="graphit-meter-label">
            <span>Aktuell abrufbar</span>
            <span>{Math.round(result.mastery * 100)} %</span>
          </div>
          <MasteryBar mastery={result.mastery} peak={result.mastery_peak} />
        </div>

        <dl className="graphit-facts">
          <dt>Bestmarke</dt>
          <dd>{Math.round(result.mastery_peak * 100)} %</dd>
          <dt>Folgekonzepte</dt>
          <dd>
            {result.gate_passed ? 'freigegeben' : 'noch gesperrt'}
          </dd>
          <dt>Nächste Wiederholung</dt>
          {/* A review date only exists once the concept was mastered. */}
          <dd>
            {result.gate_passed
              ? formatDue(result.next_due_in_days)
              : 'erst nach dem ersten Beherrschen'}
          </dd>
          <dt>Antworten insgesamt</dt>
          <dd>
            {result.s} richtig · {result.f} falsch
          </dd>
        </dl>

        {!result.mastered ? (
          // Not styled as a failure: mastery needs three cumulative correct answers.
          <p className="graphit-notice" style={{ marginBottom: 0 }}>
            Noch nicht als „beherrscht" gewertet, das ist normal. Dafür sind
            insgesamt 3 richtige Antworten nötig (bei zwei Fehlversuchen 4).
            {result.gate_passed
              ? ' Deine Folgekonzepte sind trotzdem freigegeben.'
              : ''}
          </p>
        ) : null}
      </div>

      {result.results.map(r => (
        <ResultCard
          key={r.question_id}
          result={r}
          question={byId.get(r.question_id)}
        />
      ))}

      <div className="graphit-btnrow" style={{ marginTop: 12 }}>
        {props.extraActions}
        <button className="graphit-btn" onClick={props.onRestart}>
          Nochmal abfragen
        </button>
        <button
          className="graphit-btn graphit-btn--quiet"
          onClick={props.onClose}
        >
          Schließen
        </button>
      </div>
    </>
  );
}

/**
 * Result of a single question with answer comparison and explanation.
 * @param props: Question result and the original question, if known
 * @returns: The result card
 */
export function ResultCard(props: {
  result: QuizResult;
  question: ClientQuestion | undefined;
}): JSX.Element {
  const { result, question } = props;
  const payload = question?.payload;

  return (
    <div className="graphit-result" data-correct={result.correct}>
      <div className="graphit-result-head">
        <span>{result.correct ? '✓ richtig' : '✗ falsch'}</span>
        {payload ? (
          <span className="graphit-small graphit-muted">{payload.prompt}</span>
        ) : null}
      </div>

      <AnswerView payload={payload} result={result} />

      {result.explanation ? (
        <div className="graphit-result-expl">{result.explanation}</div>
      ) : null}
    </div>
  );
}

/**
 * Structured comparison of the student's answer with the solution, with all ids mapped
 * back to display text. Falls back to a one-line text rendering for unknown shapes.
 *
 * Solution shapes returned by /quiz/submit:
 *   single   {correct: "b"}            multiple {correct: ["a", "c"]}
 *   cloze    {b1: "t1", b2: "t2"}      order    ["s1", "s2", "s3"]
 *   match    [{left, right}, ...]  or  {l1: "r1", ...}
 * @param props: Question payload (if known) and result
 * @returns: The comparison element
 */
function AnswerView(props: {
  payload: QuestionPayload | undefined;
  result: QuizResult;
}): JSX.Element {
  const { payload, result } = props;
  const view = payload ? structured(payload, result) : null;
  if (view) {
    return view;
  }

  // Unknown shape or no payload: text form plus technical details.
  const yourText = renderAnswerHuman(payload, result.your_answer);
  const solutionText = renderSolution(payload, result.solution);
  return (
    <>
      <div className="graphit-answer">
        <span className="graphit-answer-label">Deine Antwort</span>
        <span className="graphit-answer-chip" data-state={result.correct ? 'ok' : 'wrong'}>
          {yourText ?? 'nicht beantwortet'}
        </span>
      </div>
      {!result.correct ? (
        <div className="graphit-answer">
          <span className="graphit-answer-label">Richtig wäre</span>
          {solutionText ? (
            <span className="graphit-answer-chip" data-state="ok">{solutionText}</span>
          ) : (
            <em className="graphit-muted">siehe Erklärung</em>
          )}
        </div>
      ) : null}
      {solutionText === null && !result.correct ? (
        <details>
          <summary>Technische Details</summary>
          <pre>{safeJson(result.solution)}</pre>
        </details>
      ) : null}
    </>
  );
}

/**
 * Unwraps `{correct: …}` (used for single and multiple).
 * @param solution: Raw solution
 * @returns: The inner value, or the solution itself
 */
function unwrapCorrect(solution: unknown): unknown {
  return typeof solution === 'object' &&
    solution !== null &&
    !Array.isArray(solution) &&
    'correct' in (solution as Record<string, unknown>)
    ? (solution as Record<string, unknown>).correct
    : solution;
}

/**
 * Interprets a value as a list of ids.
 * @param value: A string or string array
 * @returns: The ids, or null for other shapes
 */
function idList(value: unknown): string[] | null {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
    return value as string[];
  }
  return null;
}

/**
 * Interprets a value as an id-to-id map, keeping only string values.
 * @param value: A plain object
 * @returns: The map, or null for other shapes
 */
function idMap(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Looks up the display text of an option.
 * @param options: Available options
 * @param id: Option id
 * @returns: The text, the id if unknown, or null without id
 */
function optionText(options: QuizOption[], id: string | undefined): string | null {
  if (id === undefined) {
    return null;
  }
  return options.find(o => o.id === id)?.text ?? id;
}

/**
 * Builds the type-specific answer comparison.
 * @param payload: Question payload
 * @param result: Question result
 * @returns: The comparison, or null if the solution shape is not recognised
 */
function structured(payload: QuestionPayload, result: QuizResult): JSX.Element | null {
  switch (payload.type) {
    case 'single': {
      const yours = idList(result.your_answer)?.[0];
      const correct = idList(unwrapCorrect(result.solution))?.[0];
      if (correct === undefined) {
        return null;
      }
      return (
        <>
          <div className="graphit-answer">
            <span className="graphit-answer-label">Deine Antwort</span>
            <span
              className="graphit-answer-chip"
              data-state={yours === undefined ? 'empty' : result.correct ? 'ok' : 'wrong'}
            >
              {optionText(payload.options, yours) ?? 'nicht beantwortet'}
            </span>
          </div>
          {!result.correct ? (
            <div className="graphit-answer">
              <span className="graphit-answer-label">Richtig wäre</span>
              <span className="graphit-answer-chip" data-state="ok">
                {optionText(payload.options, correct)}
              </span>
            </div>
          ) : null}
        </>
      );
    }

    case 'multiple': {
      const yours = new Set(idList(result.your_answer) ?? []);
      const correctIds = idList(unwrapCorrect(result.solution));
      if (!correctIds) {
        return null;
      }
      const correct = new Set(correctIds);
      // One list shows both what was ticked and what should have been.
      return (
        <div className="graphit-answer graphit-answer--block">
          <span className="graphit-answer-label">Deine Auswahl</span>
          <ul className="graphit-answer-list">
            {payload.options.map(o => {
              const chosen = yours.has(o.id);
              const right = correct.has(o.id);
              const state = chosen && right ? 'ok' : chosen ? 'wrong' : right ? 'missing' : 'neutral';
              return (
                <li key={o.id} data-state={state}>
                  <span className="graphit-answer-mark" aria-hidden="true">
                    {state === 'ok' ? '✓' : state === 'wrong' ? '✗' : state === 'missing' ? '○' : ''}
                  </span>
                  <span className="graphit-answer-text">{o.text}</span>
                  <span className="graphit-answer-note">
                    {state === 'ok'
                      ? 'richtig gewählt'
                      : state === 'wrong'
                        ? 'fälschlich gewählt'
                        : state === 'missing'
                          ? 'hätte gewählt werden müssen'
                          : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    case 'cloze': {
      const yours = idMap(result.your_answer) ?? {};
      const correct = idMap(result.solution);
      if (!correct) {
        return null;
      }
      const parsed = parseCloze(payload);
      const bank = (id: string | undefined) => optionText(payload.bank, id);
      const blank = (id: string) => {
        const mine = yours[id];
        const right = correct[id];
        const ok = mine !== undefined && mine === right;
        return (
          <span className="graphit-cloze-slot" key={id}>
            <span
              className="graphit-answer-chip"
              data-state={mine === undefined ? 'empty' : ok ? 'ok' : 'wrong'}
            >
              {bank(mine) ?? '—'}
            </span>
            {!ok && right !== undefined ? (
              <span className="graphit-answer-chip" data-state="ok" title="richtig wäre">
                {bank(right)}
              </span>
            ) : null}
          </span>
        );
      };
      return (
        <div className="graphit-answer graphit-answer--block">
          <span className="graphit-answer-label">
            Dein Lückentext
            {!result.correct ? (
              <span className="graphit-answer-hint"> (grün daneben: richtig wäre)</span>
            ) : null}
          </span>
          <p className="graphit-cloze-review">
            {parsed.segments.map((seg, i) =>
              seg.kind === 'text' ? (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ) : (
                blank(seg.blankId)
              )
            )}
          </p>
          {parsed.orphanBlanks.length > 0 ? (
            <ul className="graphit-answer-list">
              {parsed.orphanBlanks.map((id, i) => (
                <li key={id}>
                  <span className="graphit-answer-text">Lücke {parsed.segments.filter(s => s.kind === 'blank').length + i + 1}</span>
                  {blank(id)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    case 'match': {
      const yoursPairs = matchPairs(result.your_answer) ?? [];
      const correctPairs = matchPairs(result.solution);
      if (!correctPairs) {
        return null;
      }
      const yours = new Map(yoursPairs);
      const correct = new Map(correctPairs);
      const rightText = (id: string | undefined) => optionText(payload.right, id);
      return (
        <div className="graphit-answer graphit-answer--block">
          <span className="graphit-answer-label">Deine Zuordnung</span>
          <table className="graphit-answer-table">
            <thead>
              <tr>
                <th></th>
                <th>Begriff</th>
                <th>Deine Zuordnung</th>
                {!result.correct ? <th>Richtig wäre</th> : null}
              </tr>
            </thead>
            <tbody>
              {payload.left.map(l => {
                const mine = yours.get(l.id);
                const right = correct.get(l.id);
                const ok = mine !== undefined && mine === right;
                const state = mine === undefined ? 'empty' : ok ? 'ok' : 'wrong';
                return (
                  <tr key={l.id} data-state={state}>
                    <td className="graphit-answer-mark" aria-hidden="true">
                      {state === 'ok' ? '✓' : state === 'wrong' ? '✗' : '—'}
                    </td>
                    <td>{l.text}</td>
                    <td>{rightText(mine) ?? <em className="graphit-muted">offen</em>}</td>
                    {!result.correct ? (
                      <td>{ok ? '' : rightText(right)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case 'order': {
      const yours = idList(result.your_answer) ?? [];
      const correct = idList(result.solution);
      if (!correct) {
        return null;
      }
      const item = (id: string | undefined) => optionText(payload.items, id);
      const column = (title: string, ids: string[], reference: string[], own: boolean) => (
        <div>
          <span className="graphit-answer-label">{title}</span>
          <ol className="graphit-answer-order">
            {ids.map((id, i) => (
              <li
                key={`${id}-${i}`}
                data-state={own ? (reference[i] === id ? 'ok' : 'wrong') : 'neutral'}
              >
                {item(id)}
              </li>
            ))}
          </ol>
        </div>
      );
      return (
        <div className="graphit-answer graphit-answer--block">
          <div className="graphit-answer-cols">
            {yours.length > 0 ? (
              column('Deine Reihenfolge', yours, correct, true)
            ) : (
              <div>
                <span className="graphit-answer-label">Deine Reihenfolge</span>
                <span className="graphit-answer-chip" data-state="empty">nicht beantwortet</span>
              </div>
            )}
            {!result.correct ? column('Richtige Reihenfolge', correct, correct, false) : null}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Renders a solution as text, unwrapping `solution.correct` if present.
 * @param payload: Question payload
 * @param solution: Raw solution
 * @returns: The text, or null if the shape is not recognised
 */
export function renderSolution(
  payload: QuestionPayload | undefined,
  solution: unknown
): string | null {
  if (solution === null || solution === undefined) {
    return null;
  }
  const candidate =
    typeof solution === 'object' &&
    solution !== null &&
    'correct' in (solution as Record<string, unknown>)
      ? (solution as Record<string, unknown>).correct
      : solution;
  return renderAnswerHuman(payload, candidate as Answer | MatchPair[]);
}

/** A matching pair as stored in a match solution. */
type MatchPair = { left: string; right: string };

/**
 * Normalises both match shapes (list of pairs or map) to `[left, right]` pairs, as the
 * backend grader accepts both.
 * @param value: Match answer or solution
 * @returns: The pairs, or null for other shapes
 */
export function matchPairs(value: unknown): [string, string][] | null {
  if (Array.isArray(value)) {
    const pairs: [string, string][] = [];
    for (const item of value) {
      const pair = item as Partial<MatchPair> | null;
      if (
        typeof pair !== 'object' ||
        pair === null ||
        typeof pair.left !== 'string' ||
        typeof pair.right !== 'string'
      ) {
        return null;
      }
      pairs.push([pair.left, pair.right]);
    }
    return pairs.length > 0 ? pairs : null;
  }
  if (typeof value === 'object' && value !== null) {
    const pairs = Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string'
    );
    return pairs.length > 0 ? pairs : null;
  }
  return null;
}

/**
 * Renders an answer as one line of text, mapping ids back to display text.
 * @param payload: Question payload
 * @param value: Answer or solution value
 * @returns: The text, or null if nothing is recognisable
 */
function renderAnswerHuman(
  payload: QuestionPayload | undefined,
  value: Answer | MatchPair[] | null | undefined
): string | null {
  if (value === null || value === undefined || !payload) {
    return null;
  }

  const label = (
    id: string,
    kind: 'option' | 'bank' | 'left' | 'right' | 'item'
  ) => {
    switch (payload.type) {
      case 'single':
      case 'multiple':
        return payload.options.find(o => o.id === id)?.text ?? id;
      case 'cloze':
        return kind === 'bank'
          ? (payload.bank.find(o => o.id === id)?.text ?? id)
          : id;
      case 'match':
        return kind === 'left'
          ? (payload.left.find(o => o.id === id)?.text ?? id)
          : (payload.right.find(o => o.id === id)?.text ?? id);
      case 'order':
        return payload.items.find(o => o.id === id)?.text ?? id;
      default:
        return id;
    }
  };

  // Answers are maps, solutions are lists of `{left, right}`; both are handled here.
  if (payload.type === 'match') {
    const pairs = matchPairs(value);
    if (pairs) {
      return pairs
        .map(([l, r]) => `${label(l, 'left')} → ${label(r, 'right')}`)
        .join('; ');
    }
  }

  if (typeof value === 'string') {
    return payload.type === 'single' || payload.type === 'multiple'
      ? label(value, 'option')
      : value;
  }

  if (Array.isArray(value)) {
    // Only plain id lists reach this point.
    const ids = value.filter((v): v is string => typeof v === 'string');
    if (ids.length === 0) {
      // null keeps the caller's fallback ("siehe Erklärung" plus details).
      return null;
    }
    if (payload.type === 'order') {
      return ids.map((id, i) => `${i + 1}. ${label(id, 'item')}`).join(' → ');
    }
    return ids.map(id => label(id, 'option')).join(', ');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, string>);
    if (payload.type === 'cloze') {
      return entries.map(([k, v]) => `${k} = ${label(v, 'bank')}`).join(', ');
    }
    return entries.map(([k, v]) => `${k} = ${v}`).join(', ');
  }

  return null;
}

/**
 * Pretty-prints a value as JSON without throwing.
 * @param value: Any value
 * @returns: JSON text, or String(value) if not serialisable
 */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
