/**
 * Overall progress strip above the tree, plus the recommendation and a legend for all
 * symbols used in the tree.
 */

import { CommandIDs } from '../../commands';
import { dueCount } from '../../state/selectors';
import { useCommands, useGraphit } from '../../state/useStore';
import {
  AchievementBar,
  AchievementLegend,
  MasteryBar,
  ReadyLock,
  StatusLegend
} from '../common/Common';
import { NextSteps } from './NextSteps';

/**
 * Progress summary, next-step recommendation and tree legend.
 * @returns: The overview element
 */
export function TreeOverview(): JSX.Element {
  const state = useGraphit();
  const commands = useCommands();
  const summary = state.progress?.summary;
  const due = dueCount(state.progress);

  return (
    <div className="graphit-overview">
      {summary ? (
        <>
          <div className="graphit-overview-head">
            <span className="graphit-overview-title">Gesamtfortschritt</span>
            <span className="graphit-overview-main">
              <b>
                {summary.mastered}/{summary.total}
              </b>{' '}
              beherrscht
              {summary.total > 0
                ? ` (${Math.round((summary.mastered / summary.total) * 100)} %)`
                : ''}
            </span>
            <span className="graphit-small graphit-muted">
              Ø {Math.round(summary.mastery_avg * 100)} %
            </span>
            <span style={{ flex: '1 1 auto' }} />
            {due > 0 ? (
              <button
                className="graphit-btn graphit-btn--quiet"
                onClick={() => void commands.execute(CommandIDs.reviewSession)}
                title="Fällige Konzepte als Quiz wiederholen"
              >
                {due} fällig
              </button>
            ) : null}
          </div>
          <AchievementBar stats={summary} />
          <AchievementLegend stats={summary} />
        </>
      ) : (
        <div className="graphit-small graphit-muted">
          Gesamtfortschritt wird geladen …
        </div>
      )}

      {/* Recommendation first, legend second. */}
      <NextSteps />

      {/* Collapsed by default, as a reference. */}
      <details className="graphit-overview-legend">
        <summary className="graphit-small">
          Legende zu der Vorlesungsstruktur
        </summary>

        <StatusLegend />

        <dl className="graphit-facts graphit-small">
          <dt>
            <MasteryBar mastery={0.55} peak={0.85} />
          </dt>
          <dd>
            Balken: <b>aktuell abrufbare</b> Mastery, sie verfällt mit der Zeit.
            Der Strich rechts ist die <b>Bestmarke</b>, sie verfällt nie und
            entscheidet über die Freigabe.
          </dd>

          <dt>
            <ReadyLock ready={true} /> <ReadyLock ready={false} />
          </dt>
          <dd>
            Offenes Schloss: alle Voraussetzungen sind erfüllt oder es gibt
            keine, das Konzept kann jetzt bearbeitet werden. Geschlossen: etwas,
            worauf es aufbaut, wurde noch nie beherrscht. Der Tooltip nennt es.
          </dd>

          <dt>👁 3</dt>
          <dd>
            So oft im Chat angeschaut. Zählt <b>nicht</b> als geprüft und
            verändert die Mastery nicht.
          </dd>

          {/* Both chip variants: filled = overdue ("seit …"), outlined = upcoming ("in …"). */}
          <dt>
            <span className="graphit-due-chip" data-overdue={true}>
              seit 5 Tagen
            </span>
          </dt>
          <dd>
            Ausgefüllt: die Wiederholung ist <b>fällig</b>. Das ist kein
            Rückschritt und sperrt nichts.
          </dd>

          <dt>
            <span className="graphit-due-chip" data-overdue={false}>
              in 3 Tagen
            </span>
          </dt>
          <dd>
            Umrandet: wird in den nächsten 7 Tagen fällig. Steht mehr Zeit zur
            Verfügung, erscheint kein Hinweis.
          </dd>

          <dt>
            <span className="graphit-small graphit-muted">7/20</span>{' '}
            <AchievementBar
              stats={{
                total: 20,
                new: 5,
                visited: 3,
                in_progress: 3,
                due_review: 2,
                mastered: 7,
                gate_passed: 9,
                mastery_avg: 0.4
              }}
            />
          </dt>
          <dd>
            Bei Kapiteln, Themen und Unterthemen: beherrschte von enthaltenen
            Konzepten. Der Balken füllt sich <b>nur mit Erreichtem</b>. Bloß
            angeschaute oder angefangene Konzepte lassen ihn absichtlich leer.
          </dd>
        </dl>
      </details>
    </div>
  );
}
