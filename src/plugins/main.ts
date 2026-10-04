/**
 * Main plugin: left-sidebar dashboard, main-area widget and all commands used by the
 * rest of the extension.
 */

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  Dialog,
  ICommandPalette,
  showDialog,
  WidgetTracker
} from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { CommandIDs, PLUGIN_ID_MAIN } from '../commands';
import { graphitIcon } from '../icons';
import {
  dueCount,
  dueList,
  findNode,
  splitUntouched
} from '../state/selectors';
import { GraphitStore } from '../state/store';
import { IGraphitMainTracker, IGraphitStore } from '../tokens';
import { GraphitMainWidget, GraphitSidebarWidget } from '../widgets/widgets';

const CATEGORY = 'GRAPHIT';

export const mainPlugin: JupyterFrontEndPlugin<
  WidgetTracker<GraphitMainWidget>
> = {
  id: PLUGIN_ID_MAIN,
  description: 'GRAPHIT: Hauptansicht, Sidebar und Kommandos.',
  autoStart: true,
  requires: [IGraphitStore, ILabShell],
  optional: [ILayoutRestorer, ICommandPalette, ILauncher, ISettingRegistry],
  provides: IGraphitMainTracker,
  activate: (
    app: JupyterFrontEnd,
    store: GraphitStore,
    labShell: ILabShell,
    restorer: ILayoutRestorer | null,
    palette: ICommandPalette | null,
    launcher: ILauncher | null,
    settingRegistry: ISettingRegistry | null
  ): WidgetTracker<GraphitMainWidget> => {
    const tracker = new WidgetTracker<GraphitMainWidget>({
      namespace: 'graphit-main'
    });
    let widget: GraphitMainWidget | null = null;

    const openMain = (): GraphitMainWidget => {
      if (!widget || widget.isDisposed) {
        widget = new GraphitMainWidget(store, app.commands);
        widget.disposed.connect(() => {
          widget = null;
        });
        void tracker.add(widget);
      }
      if (!widget.isAttached) {
        labShell.add(widget, 'main', { activate: true });
      }
      app.shell.activateById(widget.id);
      return widget;
    };

    /**
     * Closes the chat whenever a quiz starts: the tutor answers from the same slides
     * the questions are generated from, so an open chat would turn the quiz into a
     * lookup. Guarded because the chat plugin may have failed to load.
     */
    const closeChat = (): void => {
      if (app.commands.hasCommand(CommandIDs.closeChat)) {
        void app.commands.execute(CommandIDs.closeChat);
      }
    };

    const sidebar = new GraphitSidebarWidget(store, app.commands);
    labShell.add(sidebar, 'left', { rank: 300 });

    /**
     * State of the left area before the tour opened the sidebar, restored afterwards.
     * Recorded only once, because the tour repeats each demonstration up to three times
     * (see `useDemonstration`).
     */
    let sidebarBefore: { collapsed: boolean; id: string | null } | null =
      null;

    app.commands.addCommand(CommandIDs.showSidebar, {
      label: 'GRAPHIT: Seitenleiste zeigen',
      execute: () => {
        if (sidebar.isVisible) {
          return; // Already open, nothing to remember.
        }
        if (sidebarBefore === null) {
          // A collapsed left area has no visible widget; collapsing again restores it.
          const visibleWidget = Array.from(labShell.widgets('left')).find(
            w => w.isVisible
          );
          sidebarBefore = {
            collapsed: labShell.leftCollapsed,
            id: visibleWidget?.id ?? null
          };
        }
        labShell.activateById(sidebar.id);
      }
    });

    app.commands.addCommand(CommandIDs.restoreSidebar, {
      label: 'GRAPHIT: Seitenleiste zurücksetzen',
      execute: () => {
        const before = sidebarBefore;
        sidebarBefore = null;
        if (!before) {
          return; // The sidebar was already open.
        }
        if (before.collapsed) {
          labShell.collapseLeft();
        } else if (before.id) {
          labShell.activateById(before.id);
        }
      }
    });

    app.commands.addCommand(CommandIDs.openMain, {
      // The launcher card names the product, the palette entry the action.
      label: args => (args.launcher ? 'GRAPHIT' : 'GRAPHIT öffnen'),
      caption: args =>
        args.launcher
          ? 'Erklärt Konzepte, prüft dein Verständnis, empfiehlt den nächsten Schritt.'
          : 'Vorlesungsinhalte, Fortschritt, Wiederholungen und Quiz',
      icon: graphitIcon,
      execute: () => {
        openMain();
      }
    });

    app.commands.addCommand(CommandIDs.select, {
      label: 'GRAPHIT: Konzept auswählen',
      execute: args => {
        const id = String(args.id ?? '');
        if (!id) {
          return;
        }
        openMain();
        store.setActiveTab('concepts');
        store.selectById(id);
      }
    });

    app.commands.addCommand(CommandIDs.refreshProgress, {
      label: 'GRAPHIT: Lernstand neu laden',
      execute: () => store.refreshProgress({ force: true })
    });

    // The tour draws on top of the main view, so the view is opened first.
    app.commands.addCommand(CommandIDs.startTour, {
      label: 'GRAPHIT: Einführung starten',
      caption: 'Führt Schritt für Schritt durch die Bereiche der Oberfläche',
      execute: () => {
        openMain();
        store.startTour();
      }
    });

    /**
     * Starts a quiz from either a `conceptId` or a `scopeId` (any tree node). A scope is
     * first resolved into testable concepts; several concepts become one combined quiz.
     */
    app.commands.addCommand(CommandIDs.startQuiz, {
      label: 'GRAPHIT: Quiz starten',
      execute: async args => {
        openMain();
        closeChat();
        const conceptId = args.conceptId ? String(args.conceptId) : '';
        if (conceptId) {
          const name = args.conceptName
            ? String(args.conceptName)
            : (findNode(store.state.tree, conceptId)?.name ?? conceptId);
          await store.startQuiz(conceptId, name);
          return;
        }

        const scopeId = args.scopeId ? String(args.scopeId) : '';
        const node = scopeId ? findNode(store.state.tree, scopeId) : null;
        if (!node) {
          store.setActiveTab('concepts');
          return;
        }

        // No tab switch yet: the quiz tab only exists once quiz state is set, which
        // every branch below does together with the tab.
        let candidates;
        try {
          candidates = await store.resolveQuizScope(node);
        } catch (err) {
          console.warn(
            '[GRAPHIT] Auflösung des Quiz-Bereichs fehlgeschlagen',
            err
          );
          store.showCandidates([], node.name);
          return;
        }

        if (candidates.length === 0) {
          // Shows the "nothing open here" explanation instead of an empty run.
          store.showCandidates([], node.name);
          return;
        }
        if (candidates.length === 1) {
          await store.startQuiz(
            candidates[0].id,
            candidates[0].name ?? candidates[0].id
          );
          return;
        }

        const named = candidates.map(c => ({
          id: c.id,
          name: c.name ?? c.id
        }));
        const { untouched } = splitUntouched(store.state.progress, named);

        if (untouched.length > 0) {
          // Asked before generating, which takes 30–120 s per concept.
          const names = untouched.map(c => c.name);
          // Joined as a German sentence; long lists end with the remaining count.
          const listed =
            names.length > 8
              ? `${names.slice(0, 8).join(', ')} und ${names.length - 8} weitere`
              : names.length > 1
                ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
                : names[0];
          const answer = await showDialog({
            title: 'Noch nicht alles bearbeitet',
            body:
              `${untouched.length} von ${named.length} Konzepten in „${node.name}“ ` +
              `hast du noch nicht bearbeitet: ${listed}. ` +
              'Die Konzepte werden in dem Quiz auch abgefragt!',
            buttons: [
              Dialog.cancelButton({ label: 'Abbrechen' }),
              Dialog.okButton({ label: 'Trotzdem starten' })
            ]
          });
          if (!answer.button.accept) {
            return;
          }
        }

        await store.startBatchReview(named, {
          title: node.name,
          origin: 'scope'
        });
      }
    });

    app.commands.addCommand(CommandIDs.reviewSession, {
      label: 'GRAPHIT: Wiederholung starten',
      isEnabled: () => dueCount(store.state.progress) > 0,
      execute: args => {
        openMain();
        closeChat();
        store.setActiveTab('review');
        const explicit = Array.isArray(args.conceptIds)
          ? (args.conceptIds as string[])
          : null;
        const due = dueList(store.state.progress);
        const chosen = explicit
          ? due.filter(c => explicit.includes(c.id))
          : due.slice(0, store.state.reviewSessionSize);
        if (chosen.length > 0) {
          void store.startBatchReview(
            chosen.map(c => ({ id: c.id, name: c.name }))
          );
        }
      }
    });

    if (palette) {
      for (const command of [
        CommandIDs.openMain,
        CommandIDs.startTour,
        CommandIDs.reviewSession,
        CommandIDs.refreshProgress
      ]) {
        palette.addItem({ command, category: CATEGORY });
      }
    }

    if (launcher) {
      // Own launcher section, so the card is recognisable on a fresh workspace.
      launcher.add({
        command: CommandIDs.openMain,
        category: 'Tutor',
        rank: 1,
        args: { launcher: true }
      });
    }

    if (restorer) {
      // Singleton widget, so a constant name suffices.
      void restorer.restore(tracker, {
        command: CommandIDs.openMain,
        name: () => 'graphit-main'
      });
      restorer.add(sidebar, 'graphit-sidebar');
    }

    return tracker;
  }
};
