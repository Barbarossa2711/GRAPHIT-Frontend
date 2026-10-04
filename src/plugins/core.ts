/**
 * Core plugin: settings, student identity, store and client.
 *
 * Activates before the widget plugins so the shared state exists when they render. The
 * widgets still have to cope with an uninitialised store, because layout restoration
 * can run first.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';

import { PLUGIN_ID_CORE } from '../commands';
import { DEFAULT_TIMEOUTS } from '../api/http';
import { Persistence } from '../state/persistence';
import { DEFAULT_CONFIG, GraphitStore, StoreConfig } from '../state/store';
import { IGraphitStore } from '../tokens';

export const corePlugin: JupyterFrontEndPlugin<GraphitStore> = {
  id: PLUGIN_ID_CORE,
  description:
    'GRAPHIT: gemeinsamer Zustand, Einstellungen und Backend-Client.',
  autoStart: true,
  requires: [ISettingRegistry],
  optional: [IStateDB],
  provides: IGraphitStore,
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    stateDB: IStateDB | null
  ): GraphitStore => {
    const store = new GraphitStore(DEFAULT_CONFIG, new Persistence(stateDB));

    void (async () => {
      try {
        const settings = await settingRegistry.load(PLUGIN_ID_CORE);

        // Identity resolution order:
        //   1. explicitly configured studentId (settings),
        //   2. authenticated JupyterHub username,
        //   3. otherwise unset; the user is asked.
        // The Hub identity is read live and never written into the settings.
        const hubId = await hubStudentId();
        const applyWithIdentity = (
          composite: Record<string, unknown>
        ): StoreConfig => {
          const cfg = readConfig(composite);
          if (!cfg.studentId && hubId) {
            cfg.studentId = hubId;
          }
          store.applyConfig(cfg);
          return cfg;
        };

        const cfg = applyWithIdentity(
          settings.composite as Record<string, unknown>
        );
        settings.changed.connect(() => {
          applyWithIdentity(settings.composite as Record<string, unknown>);
        });

        if (!cfg.studentId) {
          // Only a suggestion, never applied silently (see suggestStudentId()).
          console.info(
            '[GRAPHIT] Keine Studenten-ID gesetzt. Vorschlag:',
            (await suggestStudentId(app)) || '(keiner ermittelbar)'
          );
        } else if (hubId && cfg.studentId === hubId) {
          console.info(
            '[GRAPHIT] Studenten-ID aus JupyterHub übernommen:',
            hubId
          );
        }
      } catch (err) {
        console.error(
          '[GRAPHIT] Einstellungen konnten nicht geladen werden',
          err
        );
        store.applyConfig(DEFAULT_CONFIG);
      }

      await store.restore();
      void store.refreshTree();
      void store.refreshProgress({ force: true });
    })();

    return store;
  }
};

/**
 * Suggests a student id from the running Jupyter without adopting it. Without a Hub,
 * Jupyter hands out an anonymous per-browser-session name; adopting it would split the
 * learner model after every cookie reset.
 * @param app: The JupyterLab application
 * @returns: Hub user, local identity name, or an empty string
 */
export async function suggestStudentId(app: JupyterFrontEnd): Promise<string> {
  const hub = await hubStudentId();
  if (hub) {
    return hub;
  }
  try {
    const identity = app.serviceManager.user?.identity;
    const name = identity?.username || identity?.name;
    if (name) {
      return name;
    }
  } catch {
    /* identity unavailable */
  }
  return '';
}

/**
 * Reads the authenticated JupyterHub username from the page config. It is stable
 * across sessions and browsers and is therefore adopted automatically.
 * @returns: The Hub username, or an empty string outside a Hub
 */
export async function hubStudentId(): Promise<string> {
  try {
    const { PageConfig } = await import('@jupyterlab/coreutils');
    return PageConfig.getOption('hubUser') || '';
  } catch {
    return '';
  }
}

/**
 * Converts the composite settings into a store configuration with defaults.
 * @param composite: Composite settings from the registry
 * @returns: The store configuration
 */
function readConfig(
  composite: Record<string, unknown> | undefined
): StoreConfig {
  const c = composite ?? {};
  const timeouts = (c.timeouts as Partial<typeof DEFAULT_TIMEOUTS>) ?? {};
  const mock = (c.mock as Partial<StoreConfig['mock']>) ?? {};
  return {
    baseUrl: str(c.baseUrl, DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    studentId: str(c.studentId, ''),
    mockMode: bool(c.mockMode, false),
    streaming: bool(c.streaming, true),
    chatModel: str(c.chatModel, DEFAULT_CONFIG.chatModel),
    reviewSessionSize: num(c.reviewSessionSize, 5),
    persistChatHistory: bool(c.persistChatHistory, false),
    showDiagnostics: bool(c.showDiagnostics, false),
    timeouts: { ...DEFAULT_TIMEOUTS, ...timeouts },
    mock: { ...DEFAULT_CONFIG.mock, ...mock }
  };
}

/**
 * Reads a non-empty string setting.
 * @param value: Raw setting value
 * @param fallback: Default value
 * @returns: The string or the fallback
 */
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Reads a boolean setting.
 * @param value: Raw setting value
 * @param fallback: Default value
 * @returns: The boolean or the fallback
 */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads a finite numeric setting.
 * @param value: Raw setting value
 * @param fallback: Default value
 * @returns: The number or the fallback
 */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
