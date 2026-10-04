/**
 * Flattens the domain forest into the visible rows. No virtualization: even fully
 * expanded the tree has only ~550 rows, and virtualization would break Ctrl+F.
 */

import { useMemo } from 'react';

import { DomainNode } from '../../api/types';

export interface VisibleRow {
  node: DomainNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Inner node without children; rendered, but without quiz actions. */
  emptyBranch: boolean;
}

export interface FlattenResult {
  rows: VisibleRow[];
  matchCount: number;
}

/**
 * Computes the visible rows for the current expansion and filter. A filter keeps
 * matching nodes plus their ancestors and expands those ancestors automatically.
 * @param forest: Tree roots
 * @param expanded: Expanded node ids
 * @param filter: Filter text (case-insensitive substring)
 * @returns: Visible rows and number of matches
 */
export function useFlattenedTree(
  forest: DomainNode[] | null,
  expanded: string[],
  filter: string
): FlattenResult {
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const needle = filter.trim().toLowerCase();

  return useMemo(() => {
    if (!forest) {
      return { rows: [], matchCount: 0 };
    }

    // Pass 1 (filter only): mark kept nodes and ancestors to expand.
    const keep = new Set<string>();
    const forced = new Set<string>();
    let matchCount = 0;

    const mark = (node: DomainNode): boolean => {
      const selfMatch = node.name.toLowerCase().includes(needle);
      if (selfMatch) {
        matchCount += 1;
      }
      // Visit all children; `some` would short-circuit and skip marking.
      let childMatch = false;
      for (const child of node.children) {
        if (mark(child)) {
          childMatch = true;
        }
      }
      if (selfMatch || childMatch) {
        keep.add(node.id);
      }
      if (childMatch) {
        forced.add(node.id);
      }
      return selfMatch || childMatch;
    };

    if (needle.length > 0) {
      forest.forEach(mark);
    }

    // Pass 2: emit visible rows in server order, which is the lecture order.
    const rows: VisibleRow[] = [];
    const walk = (nodes: DomainNode[], depth: number): void => {
      for (const node of nodes) {
        if (needle.length > 0 && !keep.has(node.id)) {
          continue;
        }
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedSet.has(node.id) || forced.has(node.id);
        rows.push({
          node,
          depth,
          hasChildren,
          expanded: hasChildren && isExpanded,
          emptyBranch: node.type !== 'concept' && !hasChildren
        });
        if (hasChildren && isExpanded) {
          walk(node.children, depth + 1);
        }
      }
    };

    walk(forest, 0);
    return { rows, matchCount };
  }, [forest, expandedSet, needle]);
}
