/**
 * Match question: one dropdown per left-hand entry with all right-hand options.
 * `right` contains distractors. Duplicate assignments are warned about, not blocked.
 */

import * as React from 'react';

import { MatchPayload } from '../../../api/types';
import { duplicateAssignments, setSlot } from '../../../quiz/answerModel';
import { QuestionProps } from './QuestionRenderer';

/**
 * Renders the matching rows.
 * @param props: Question props with the match payload
 * @returns: The match element
 */
export function MatchQuestion(
  props: QuestionProps & { payload: MatchPayload }
): JSX.Element {
  const { payload } = props;
  const values =
    props.answer.kind === 'match'
      ? props.answer.value
      : ({} as Record<string, string>);
  const duplicates = duplicateAssignments(props.answer);
  const rightById = React.useMemo(
    () => new Map(payload.right.map(r => [r.id, r.text])),
    [payload.right]
  );

  return (
    <>
      <div className="graphit-match">
        {payload.left.map(entry => (
          <React.Fragment key={entry.id}>
            <div className="graphit-match-left">{entry.text}</div>
            <select
              className="graphit-select"
              data-empty={!values[entry.id]}
              value={values[entry.id] ?? ''}
              disabled={props.disabled}
              aria-label={`Zuordnung für ${entry.text}`}
              onChange={e =>
                props.onChange(setSlot(props.answer, entry.id, e.target.value))
              }
            >
              <option value="">bitte wählen</option>
              {payload.right.map(option => (
                <option key={option.id} value={option.id}>
                  {option.text}
                </option>
              ))}
            </select>
          </React.Fragment>
        ))}
      </div>

      {duplicates.length > 0 ? (
        <div className="graphit-question-note" style={{ marginTop: 8 }}>
          Mehrfach zugeordnet:{' '}
          {duplicates.map(id => rightById.get(id) ?? id).join(', ')}. Das ist
          erlaubt, aber meistens nicht gewollt.
        </div>
      ) : null}
    </>
  );
}
