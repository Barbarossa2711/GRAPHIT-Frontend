/**
 * Dispatch over the five question types. `assertNever` makes an unknown type a compile
 * error instead of rendering nothing.
 */

import * as React from 'react';

import {
  ClientQuestion,
  MultiplePayload,
  SinglePayload
} from '../../../api/types';
import {
  AnswerState,
  setSingle,
  toggleMultiple
} from '../../../quiz/answerModel';
import { ClozeQuestion } from './ClozeQuestion';
import { MatchQuestion } from './MatchQuestion';
import { OrderQuestion } from './OrderQuestion';

export interface QuestionProps {
  question: ClientQuestion;
  answer: AnswerState;
  index: number;
  disabled: boolean;
  onChange: (next: AnswerState) => void;
}

/**
 * Renders a question with number, prompt, type-specific hint and input.
 * @param props: Question, answer state, index, disabled flag and change callback
 * @returns: The question element
 */
export function QuestionRenderer(props: QuestionProps): JSX.Element {
  const { question } = props;
  const payload = question.payload;

  let body: React.ReactNode;
  let note: string | null = null;

  switch (payload.type) {
    case 'single':
      body = <SingleQuestion {...props} payload={payload} />;
      break;
    case 'multiple':
      body = <MultipleQuestion {...props} payload={payload} />;
      // Shown so the grading does not look arbitrary.
      note = 'Alles-oder-nichts: teilweise richtig zählt als falsch.';
      break;
    case 'cloze':
      body = <ClozeQuestion {...props} payload={payload} />;
      note = payload.reuse
        ? null
        : 'Jeder Begriff darf nur einmal verwendet werden.';
      break;
    case 'match':
      body = <MatchQuestion {...props} payload={payload} />;
      note =
        'Es gibt mehr Antworten als Begriffe, nicht alle werden gebraucht.';
      break;
    case 'order':
      body = <OrderQuestion {...props} payload={payload} />;
      note = 'Die vorgegebene Reihenfolge ist zufällig und kein Vorschlag.';
      break;
    default:
      return assertNever(payload);
  }

  return (
    <section className="graphit-question">
      <div className="graphit-question-head">
        <span className="graphit-question-num">{props.index + 1}.</span>
        <span className="graphit-question-prompt">{payload.prompt}</span>
      </div>
      {note ? <div className="graphit-question-note">{note}</div> : null}
      {body}
    </section>
  );
}

/**
 * Single-choice question as radio buttons.
 * @param props: Question props with the single-choice payload
 * @returns: The options element
 */
function SingleQuestion(
  props: QuestionProps & { payload: SinglePayload }
): JSX.Element {
  const selected = props.answer.kind === 'single' ? props.answer.value : null;
  const name = `q-${props.question.question_id}`;
  return (
    <div className="graphit-options" role="radiogroup">
      {props.payload.options.map(option => (
        <label className="graphit-option" key={option.id}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={selected === option.id}
            disabled={props.disabled}
            onChange={() => props.onChange(setSingle(props.answer, option.id))}
          />
          <span>{option.text}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Multiple-choice question as checkboxes.
 * @param props: Question props with the multiple-choice payload
 * @returns: The options element
 */
function MultipleQuestion(
  props: QuestionProps & { payload: MultiplePayload }
): JSX.Element {
  const selected =
    props.answer.kind === 'multiple' ? props.answer.value : ([] as string[]);
  return (
    <div className="graphit-options" role="group">
      {props.payload.options.map(option => (
        <label className="graphit-option" key={option.id}>
          <input
            type="checkbox"
            value={option.id}
            checked={selected.includes(option.id)}
            disabled={props.disabled}
            onChange={() =>
              props.onChange(toggleMultiple(props.answer, option.id))
            }
          />
          <span>{option.text}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Exhaustiveness check for switch statements.
 * @param x: Value that should be unreachable
 * @returns: Never; always throws
 */
function assertNever(x: never): never {
  throw new Error(`Unbekannter Fragetyp: ${JSON.stringify(x)}`);
}
