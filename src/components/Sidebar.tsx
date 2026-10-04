/**
 * The left-sidebar panel: an at-a-glance dashboard with due reviews, progress and
 * activity, plus the button that opens the main view. (A Lumino sidebar tab always
 * toggles its panel and cannot act as a plain button.)
 */

import { CommandIDs } from '../commands';
import { ConnectionState } from '../state/types';

/**
 * Describes the connection state for tooltip and screen readers.
 * @param state: Connection state
 * @returns: The label text
 */
function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case 'mock':
      return 'Demo-Modus (Beispieldaten)';
    case 'ok':
      return 'Backend verbunden';
    case 'error':
      return 'Backend nicht erreichbar';
    default:
      return 'Verbindung ungeprüft';
  }
}
import { dueCount } from '../state/selectors';
import { useCommands, useGraphit, useStore } from '../state/useStore';
import { ActivityHeatmap } from './common/ActivityHeatmap';
import { AchievementBar, AchievementLegend, Spinner } from './common/Common';
import { ReviewLoadMini } from './common/ReviewLoadMini';

/**
 * Sidebar dashboard.
 * @returns: The sidebar content
 */
export function Sidebar(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const commands = useCommands();
  const due = dueCount(state.progress);
  const summary = state.progress?.summary;

  return (
    <div className="graphit-root graphit-sidebar">
      <h2>GRAPHIT</h2>
      <div className="graphit-sidebar-subtitle">
        Graph-Based Intelligent Tutoring System
      </div>

      <div className="graphit-sidebar-block graphit-sidebar-due">
        <div className="graphit-bignum" data-zero={due === 0}>
          {state.progressStatus === 'loading' && !state.progress ? (
            <Spinner />
          ) : (
            due
          )}
        </div>
        <div className="graphit-small">
          {due === 1 ? 'Konzept' : 'Konzepte'} zur Wiederholung
        </div>
        <div
          className="graphit-btnrow"
          style={{ justifyContent: 'center', marginTop: 8 }}
        >
          <button
            className="graphit-btn graphit-btn--primary"
            disabled={due === 0}
            onClick={() => void commands.execute(CommandIDs.reviewSession)}
          >
            Wiederholen
          </button>
        </div>
      </div>

      {state.progress ? (
        <div className="graphit-sidebar-block">
          <div className="graphit-sidebar-title">
            Wiederholungslast in den nächsten 14 Tagen
          </div>
          <ReviewLoadMini progress={state.progress} />
        </div>
      ) : null}

      {summary ? (
        <div className="graphit-sidebar-block">
          <div className="graphit-meter-label">
            <span>
              {summary.mastered}/{summary.total} beherrscht
            </span>
            <span>Ø {Math.round(summary.mastery_avg * 100)} %</span>
          </div>
          <AchievementBar stats={summary} />
          <AchievementLegend stats={summary} />
        </div>
      ) : null}

      <div className="graphit-sidebar-block">
        <div className="graphit-sidebar-title">Aktivität</div>
        <ActivityHeatmap days={state.activity} />
      </div>

      <div className="graphit-sidebar-actions">
        <button
          className="graphit-btn graphit-btn--primary"
          onClick={() => void commands.execute(CommandIDs.openMain)}
        >
          GRAPHIT öffnen
        </button>
        <button
          className="graphit-btn graphit-btn--quiet"
          onClick={() => void store.refreshProgress({ force: true })}
        >
          Aktualisieren
        </button>
      </div>

      {/* Sticky footer; its padding keeps the card clear of the lower edge. */}
      <div className="graphit-sidebar-footer">
        <div className="graphit-sidebar-block graphit-sidebar-identity">
          {/* Backend address only with the `showDiagnostics` setting. */}
          {state.showDiagnostics ? (
            <div
              className="graphit-small graphit-muted"
              style={{ marginTop: 4 }}
            >
              {state.mockMode ? 'mock' : state.baseUrl}
            </div>
          ) : null}
          {/* Read-only: the identity comes from the JupyterHub account. */}
          <div className="graphit-identity">
            <span className="graphit-small graphit-muted">Angemeldet als</span>
            {/* Connection dot in front of the name; its text lives in tooltip and aria-label. */}
            <span className="graphit-identity-value">
              <span
                className="graphit-conn-dot"
                data-state={state.connection}
                title={connectionLabel(state.connection)}
                role="img"
                aria-label={connectionLabel(state.connection)}
              />
              {state.studentId ? (
                <code className="graphit-identity-name">{state.studentId}</code>
              ) : (
                <span className="graphit-identity-missing">
                  nicht ermittelbar
                </span>
              )}
            </span>
            {state.studentId ? null : (
              <div className="graphit-small graphit-muted">
                Ohne Anmeldung am JupyterHub lässt sich kein Lernstand zuordnen.
              </div>
            )}
          </div>
          {state.showDiagnostics ? (
            <div className="graphit-btnrow" style={{ marginTop: 6 }}>
              <button
                className="graphit-btn graphit-btn--quiet"
                onClick={() => void store.checkConnection()}
              >
                Verbindung testen
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
