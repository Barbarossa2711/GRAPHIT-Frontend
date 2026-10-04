/**
 * Chat plugin: a separate dock widget, opened split-right of the main view, so the
 * student can drag it next to a notebook.
 */

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';

import { ChatScope, NodeType } from '../api/types';
import { CommandIDs, PLUGIN_ID_CHAT } from '../commands';
import { graphitChatIcon } from '../icons';
import { GraphitStore } from '../state/store';
import { IGraphitMainTracker, IGraphitStore } from '../tokens';
import { GraphitChatWidget, GraphitMainWidget } from '../widgets/widgets';

export const chatPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID_CHAT,
  description: 'GRAPHIT: Chatfenster mit dem Tutor.',
  autoStart: true,
  requires: [IGraphitStore, ILabShell],
  optional: [ILayoutRestorer, ICommandPalette, IGraphitMainTracker],
  activate: (
    app: JupyterFrontEnd,
    store: GraphitStore,
    labShell: ILabShell,
    restorer: ILayoutRestorer | null,
    palette: ICommandPalette | null,
    mainTracker: WidgetTracker<GraphitMainWidget> | null
  ): void => {
    const tracker = new WidgetTracker<GraphitChatWidget>({
      namespace: 'graphit-chat'
    });
    let widget: GraphitChatWidget | null = null;

    const openChat = (scope?: ChatScope): void => {
      const existed = widget !== null && !widget.isDisposed;

      if (!existed) {
        widget = new GraphitChatWidget(store, app.commands);
        widget.disposed.connect(() => {
          widget = null;
        });
        void tracker.add(widget);
      }

      if (!widget!.isAttached) {
        const main = mainTracker?.currentWidget;
        const options =
          main && !main.isDisposed && main.isAttached
            ? { mode: 'split-right' as const, ref: main.id, activate: true }
            : { activate: true };
        labShell.add(widget!, 'main', options);
      }
      // An existing widget is never re-docked; the student may have moved it.

      if (scope) {
        store.setChatScope(scope);
      }
      app.shell.activateById(widget!.id);
    };

    app.commands.addCommand(CommandIDs.openChat, {
      label: 'GRAPHIT: Chat öffnen',
      caption: 'Fragen an den Tutor stellen',
      icon: graphitChatIcon,
      execute: args => {
        openChat(parseScope(args.scope));
      }
    });

    app.commands.addCommand(CommandIDs.closeChat, {
      label: 'GRAPHIT: Chat schließen',
      isEnabled: () => widget !== null && !widget.isDisposed,
      execute: () => {
        // close() triggers onCloseRequest, which discards the conversation.
        widget?.close();
      }
    });

    if (palette) {
      palette.addItem({ command: CommandIDs.openChat, category: 'GRAPHIT' });
    }

    if (restorer) {
      void restorer.restore(tracker, {
        command: CommandIDs.openChat,
        name: () => 'graphit-chat'
      });
    }
  }
};

/**
 * Parses the scope argument of the open-chat command. Only concepts are valid chat
 * topics, because the backend raises visited_count on the scope.
 * @param value: Raw command argument
 * @returns: The chat scope, or undefined if missing or not a concept
 */
function parseScope(value: unknown): ChatScope | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) {
    return undefined;
  }
  const type =
    typeof raw.type === 'string' ? (raw.type as NodeType) : undefined;
  if (type !== 'concept') {
    console.warn(
      `[GRAPHIT] Chat-Scope verworfen: ${id} ist ${type ?? 'ohne Typ'}, kein Konzept.`
    );
    return undefined;
  }
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    type
  };
}
