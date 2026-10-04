/**
 * "Lernpfad-Empfehlung": corpus-wide recommendation above the lecture tree, giving new
 * students an entry point.
 *
 * The list comes from GET /next: the learnable front (not yet mastered, all direct
 * prerequisites met) in lecture order, computed deterministically. Collapsed by default,
 * so the summary line says what is behind it.
 */

import { CommandIDs } from '../../commands';
import { NextStep } from '../../api/types';
import { useCommands, useGraphit } from '../../state/useStore';

/**
 * Explains why a concept is recommended, derived from its status.
 * @param step: Recommended concept
 * @returns: The reason text
 */
function reason(step: NextStep): string {
  switch (step.status) {
    case 'in_progress':
      return 'angefangen, Mastery-Schwelle noch nicht erreicht';
    case 'visited':
      return 'im Chat angesehen, noch nicht geprüft';
    default:
      return 'noch nicht bearbeitet';
  }
}

/**
 * Collapsible list of recommended next concepts.
 * @returns: The panel, or null before progress is loaded
 */
export function NextSteps(): JSX.Element | null {
  const state = useGraphit();
  const commands = useCommands();
  const data = state.nextSteps;

  // No spinner, to avoid a flashing placeholder above the tree on every reload.
  if (!data) {
    return null;
  }

  const alles = data.total > 0 && data.mastered === data.total;

  return (
    <details className="graphit-next">
      <summary className="graphit-next-summary">
        <span className="graphit-next-title">Lernpfad-Empfehlung</span>
        <span className="graphit-small graphit-muted">
          {alles
            ? 'alles beherrscht'
            : 'klicken für einen Vorschlag, womit du weitermachen kannst'}
        </span>
      </summary>

      {data.next.length === 0 ? (
        <p className="graphit-small graphit-muted graphit-next-empty">
          {alles
            ? 'Du hast alle Konzepte der Vorlesung beherrscht. Halte sie über die fälligen Wiederholungen frisch.'
            : 'Aktuell ist kein Konzept freigegeben. Allen offenen Konzepten fehlt noch eine Voraussetzung.'}
        </p>
      ) : (
        <ol className="graphit-next-list">
          {data.next.map(step => (
            <li key={step.id} className="graphit-next-item">
              <button
                className="graphit-next-link"
                onClick={() =>
                  void commands.execute(CommandIDs.select, { id: step.id })
                }
                title={`${step.name} im Vorlesungsbaum öffnen`}
              >
                <span className="graphit-next-name">{step.name}</span>
                {step.path ? (
                  <span className="graphit-next-path graphit-small">
                    {step.path}
                  </span>
                ) : null}
                <span className="graphit-next-reason graphit-small">
                  <span className="graphit-dot" data-status={step.status} />
                  {reason(step)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Only shown when reviews are due. */}
      {data.due_count > 0 ? (
        <p className="graphit-next-foot graphit-small graphit-muted">
          {data.due_count}{' '}
          {data.due_count === 1 ? 'Konzept wartet' : 'Konzepte warten'} auf eine
          Wiederholung.{' '}
          <button
            className="graphit-linklike"
            onClick={() => void commands.execute(CommandIDs.reviewSession)}
          >
            Jetzt wiederholen
          </button>
        </p>
      ) : null}
    </details>
  );
}

/** Exported for tests. */
export const __test = { reason };
