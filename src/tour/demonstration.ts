/**
 * Pure tree helpers for the tour demonstrations, kept separate from the component so
 * they can be unit-tested.
 */

import { DomainNode } from '../api/types';
import { ancestorIds } from '../state/selectors';

/**
 * Finds the first concept in the forest, depth first, so the expanded branch is the
 * one at the top of the tree.
 * @param forest: Tree roots
 * @returns: The first concept, or null
 */
export function firstConcept(forest: DomainNode[] | null): DomainNode | null {
  for (const node of forest ?? []) {
    if (node.type === 'concept') {
      return node;
    }
    const hit = firstConcept(node.children);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Adds the ancestors of a node to the expanded set. Purely additive; nodes the student
 * opened stay open.
 * @param forest: Tree roots
 * @param expanded: Currently expanded ids
 * @param id: Node that should become visible
 * @returns: The new expanded ids
 */
export function expandPathTo(
  forest: DomainNode[] | null,
  expanded: string[],
  id: string
): string[] {
  return [...new Set([...expanded, ...ancestorIds(forest, id)])];
}
