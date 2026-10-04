/**
 * GRAPHIT — JupyterLab frontend for the GRAPHIT tutoring backend.
 *
 * Three plugins:
 *   core  shared store and backend client (owns the settings)
 *   main  left-sidebar dashboard, main-area widget and all commands
 *   chat  separate, dockable chat widget
 *
 * The split guarantees the store exists before either widget and lets chat and main
 * fail independently.
 */

import { JupyterFrontEndPlugin } from '@jupyterlab/application';

import { chatPlugin } from './plugins/chat';
import { corePlugin } from './plugins/core';
import { mainPlugin } from './plugins/main';

const plugins: JupyterFrontEndPlugin<unknown>[] = [
  corePlugin,
  mainPlugin,
  chatPlugin
];

export default plugins;

export { IGraphitMainTracker, IGraphitStore } from './tokens';
export { CommandIDs } from './commands';
