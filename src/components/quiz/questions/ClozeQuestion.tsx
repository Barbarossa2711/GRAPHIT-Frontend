/**
 * Cloze question: the text with a dropdown per `{{blankId}}` placeholder.
 *
 * The UI enforces two rules the grader does not:
 *   - `reuse: false` means a bank entry may fill only one blank;
 *   - a declared blank missing from the text still gets an input.
 * Dropdowns are keyboard-friendly and work in narrow panels.
 */

import * as React from 'react';

import { ClozePayload } from '../../../api/types';
import { setSlot, usedBankIds } from '../../../quiz/answerModel';
import { parseCloze } from '../../../quiz/clozeParser';
import { QuestionProps } from './QuestionRenderer';

/**
 * Renders the cloze text with inline dropdowns.
 * @param props: Question props with the cloze payload
 * @returns: The cloze element
 */
export function ClozeQuestion(
  props: QuestionProps & { payload: ClozePayload }
): JSX.Element {
  const { payload } = props;
  const parsed = React.useMemo(() => parseCloze(payload), [payload]);
  const values =
    props.answer.kind === 'cloze'
      ? props.answer.value
      : ({} as Record<string, string>);

  const blank = (blankId: string, label?: string) => (
    <BlankSelect
      key={blankId}
      blankId={blankId}
      label={label}
      payload={payload}
      value={values[blankId] ?? ''}
      used={
        payload.reuse ? new Set<string>() : usedBankIds(props.answer, blankId)
      }
      disabled={props.disabled}
      onChange={next => props.onChange(setSlot(props.answer, blankId, next))}
    />
  );

  return (
    <>
      <p className="graphit-cloze-text">
        {parsed.segments.map((segment, i) =>
          segment.kind === 'text' ? (
            <React.Fragment key={i}>{segment.text}</React.Fragment>
          ) : (
            blank(segment.blankId)
          )
        )}
      </p>

      {parsed.orphanBlanks.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <div className="graphit-small graphit-muted">
            Weitere Lücken ohne Position im Text:
          </div>
          {parsed.orphanBlanks.map(id => blank(id, id))}
        </div>
      ) : null}
    </>
  );
}

/**
 * Dropdown for a single blank.
 * @param props: Blank id, optional label, payload, value, used bank ids, disabled flag
 *   and change callback
 * @returns: The select element
 */
function BlankSelect(props: {
  blankId: string;
  label?: string;
  payload: ClozePayload;
  value: string;
  used: Set<string>;
  disabled: boolean;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <>
      {props.label ? (
        <span className="graphit-small graphit-muted">{props.label}: </span>
      ) : null}
      <select
        className="graphit-select"
        data-empty={props.value === ''}
        value={props.value}
        disabled={props.disabled}
        aria-label={`Lücke ${props.blankId}`}
        onChange={e => props.onChange(e.target.value)}
      >
        <option value="">bitte wählen</option>
        {props.payload.bank.map(entry => (
          <option
            key={entry.id}
            value={entry.id}
            // reuse: false, already used in another blank.
            disabled={props.used.has(entry.id) && entry.id !== props.value}
          >
            {entry.text}
          </option>
        ))}
      </select>
    </>
  );
}
