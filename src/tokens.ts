import { Token } from '@lumino/coreutils';

import { GraphitMainWidget } from './widgets/widgets';
import { GraphitStore } from './state/store';
import { WidgetTracker } from '@jupyterlab/apputils';

/** Provided by `graphit-jupyter:core`; consumed by both widget plugins. */
export const IGraphitStore = new Token<GraphitStore>(
  'graphit-jupyter:IGraphitStore',
  'Shared GRAPHIT state and backend client.'
);

/**
 * Provided by `graphit-jupyter:main`. Optional for the chat plugin, so the chat still
 * opens if the main plugin failed to activate.
 */
export const IGraphitMainTracker = new Token<WidgetTracker<GraphitMainWidget>>(
  'graphit-jupyter:IGraphitMainTracker',
  'Tracker for the GRAPHIT main-area widget.'
);
