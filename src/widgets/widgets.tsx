/**
 * ReactWidget hosts. Each creates its own React root, which is why the shared state
 * lives in a store with a Lumino Signal instead of a React context.
 *
 * All widgets must be constructible before the settings have loaded, because layout
 * restoration runs earlier.
 */

import { ReactWidget } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Message } from '@lumino/messaging';
import * as React from 'react';

import { App } from '../components/App';
import { ChatView } from '../components/chat/ChatView';
import { Sidebar } from '../components/Sidebar';
import { graphitChatIcon, graphitIcon } from '../icons';
import { GraphitStore } from '../state/store';
import { GraphitContext } from '../state/useStore';

abstract class StoreWidget extends ReactWidget {
  /**
   * Creates a widget bound to the shared store.
   * @param store: The GRAPHIT store
   * @param commands: JupyterLab command registry
   */
  constructor(
    protected readonly store: GraphitStore,
    protected readonly commands: CommandRegistry
  ) {
    super();
  }

  /**
   * Wraps content in the GRAPHIT context provider.
   * @param children: Content to render
   * @returns: The wrapped element
   */
  protected wrap(children: React.ReactNode): JSX.Element {
    return (
      <GraphitContext.Provider
        value={{ store: this.store, commands: this.commands }}
      >
        {children}
      </GraphitContext.Provider>
    );
  }
}

export class GraphitMainWidget extends StoreWidget {
  /**
   * Creates the main-area widget.
   * @param store: The GRAPHIT store
   * @param commands: JupyterLab command registry
   */
  constructor(store: GraphitStore, commands: CommandRegistry) {
    super(store, commands);
    this.id = 'graphit-main';
    this.title.label = 'GRAPHIT';
    this.title.icon = graphitIcon;
    this.title.caption = 'GRAPHIT: Tutor für Big Data Technologien';
    this.title.closable = true;
    this.addClass('jp-graphit-main');
  }

  /**
   * Refreshes tree and progress on activation (cheap; the store coalesces requests).
   * @param msg: Activation message
   */
  protected override onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    void this.store.refreshTree();
    void this.store.refreshProgress();
  }

  /**
   * Requests the tour offer once the view is visible, however it was opened. The store
   * decides whether it is actually shown.
   * @param msg: Attach message
   */
  protected override onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this.store.offerTour();
  }

  /**
   * Renders the main application.
   * @returns: The React element
   */
  protected render(): JSX.Element {
    return this.wrap(<App />);
  }
}

export class GraphitChatWidget extends StoreWidget {
  /**
   * Creates the chat widget.
   * @param store: The GRAPHIT store
   * @param commands: JupyterLab command registry
   */
  constructor(store: GraphitStore, commands: CommandRegistry) {
    super(store, commands);
    this.id = 'graphit-chat';
    this.title.label = 'GRAPHIT-Chat';
    this.title.icon = graphitChatIcon;
    this.title.caption = 'Chat mit dem GRAPHIT-Tutor';
    this.title.closable = true;
    this.addClass('jp-graphit-chat');
  }

  /**
   * Ends the chat session on every kind of close (button, tab X, commands), so the next
   * opening starts with an empty history.
   * @param msg: Close message
   */
  protected override onCloseRequest(msg: Message): void {
    this.store.clearChat();
    super.onCloseRequest(msg);
  }

  /**
   * Renders the chat view.
   * @returns: The React element
   */
  protected render(): JSX.Element {
    return this.wrap(<ChatView onClose={() => this.close()} />);
  }
}

export class GraphitSidebarWidget extends StoreWidget {
  /**
   * Creates the left-sidebar widget.
   * @param store: The GRAPHIT store
   * @param commands: JupyterLab command registry
   */
  constructor(store: GraphitStore, commands: CommandRegistry) {
    super(store, commands);
    this.id = 'graphit-sidebar';
    this.title.icon = graphitIcon;
    this.title.caption = 'GRAPHIT';
    this.addClass('jp-graphit-sidebar');
  }

  /**
   * Refreshes progress when the sidebar is shown.
   * @param msg: Activation message
   */
  protected override onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    void this.store.refreshProgress();
  }

  /**
   * Renders the sidebar.
   * @returns: The React element
   */
  protected render(): JSX.Element {
    return this.wrap(<Sidebar />);
  }
}
