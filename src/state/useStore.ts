/**
 * React bindings for the store.
 *
 * The context only injects dependencies within one React root; the shared state is the
 * store instance itself, which both roots receive from the plugin.
 */

import { CommandRegistry } from '@lumino/commands';
import { createContext, useContext, useSyncExternalStore } from 'react';

import { GraphitStore } from './store';
import { GraphitState } from './types';

export interface GraphitContextValue {
  store: GraphitStore;
  commands: CommandRegistry;
}

export const GraphitContext = createContext<GraphitContextValue | null>(null);

/**
 * Reads the GRAPHIT context of the current React root.
 * @returns: Store and command registry
 */
export function useGraphitContext(): GraphitContextValue {
  const value = useContext(GraphitContext);
  if (!value) {
    throw new Error('GraphitContext fehlt, Provider nicht gesetzt.');
  }
  return value;
}

/**
 * Returns the shared store.
 * @returns: The GRAPHIT store
 */
export function useStore(): GraphitStore {
  return useGraphitContext().store;
}

/**
 * Returns the JupyterLab command registry.
 * @returns: The command registry
 */
export function useCommands(): CommandRegistry {
  return useGraphitContext().commands;
}

/**
 * Subscribes to the whole state snapshot. `store.state` is replaced on every mutation
 * and otherwise referentially stable, as useSyncExternalStore requires.
 * @returns: The current state
 */
export function useGraphit(): GraphitState {
  const store = useStore();
  return useSyncExternalStore(
    onChange => {
      const slot = () => onChange();
      store.changed.connect(slot);
      return () => {
        store.changed.disconnect(slot);
      };
    },
    () => store.state,
    () => store.state
  );
}
