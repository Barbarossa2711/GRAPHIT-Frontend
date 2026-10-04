import { describe, expect, it } from 'vitest';

import { DomainNode, NodeType } from '../api/types';
import { accordionExpanded, ancestorIds } from '../state/selectors';

/**
 * Creates a tree node whose name equals its id.
 * @param id: Node id
 * @param type: Node type
 * @param children: Child nodes
 * @returns: The node
 */
function node(
  id: string,
  type: NodeType,
  children: DomainNode[] = []
): DomainNode {
  return { id, name: id, type, children };
}

/**
 * L
 * ├─ C1 ─ T1 ─ S1 ─ X1
 * └─ C2 ─ T2 ─ S2 ─ X2
 */
const forest: DomainNode[] = [
  node('L', 'lecture', [
    node('C1', 'chapter', [
      node('T1', 'topic', [node('S1', 'subtopic', [node('X1', 'concept')])])
    ]),
    node('C2', 'chapter', [
      node('T2', 'topic', [node('S2', 'subtopic', [node('X2', 'concept')])])
    ])
  ])
];

const sorted = (ids: string[]): string[] => [...ids].sort();

describe('accordionExpanded', () => {
  it('closes the sibling chapter when another one is opened', () => {
    const next = accordionExpanded(forest, ['L', 'C1', 'C2'], ['C2', 'L']);
    expect(sorted(next)).toEqual(['C2', 'L']);
  });

  it('drops the whole subtree of the chapter it closes', () => {
    // Otherwise reopening C1 would restore T1/S1 as well.
    const next = accordionExpanded(
      forest,
      ['L', 'C1', 'T1', 'S1', 'C2'],
      ['C2', 'L']
    );
    expect(sorted(next)).toEqual(['C2', 'L']);
  });

  it('keeps the open chapter when a topic inside it is expanded', () => {
    const keep = ['T1', ...ancestorIds(forest, 'T1')];
    const next = accordionExpanded(forest, ['L', 'C1', 'T1'], keep);
    expect(sorted(next)).toEqual(['C1', 'L', 'T1']);
  });

  it('closes the other chapter even when a deep node is the one opened', () => {
    // Jumping in from the learning path expands ancestors; the other chapter closes.
    const keep = ['S1', ...ancestorIds(forest, 'S1')];
    const next = accordionExpanded(forest, ['L', 'C1', 'T1', 'S1', 'C2'], keep);
    expect(sorted(next)).toEqual(['C1', 'L', 'S1', 'T1']);
  });

  it('leaves topics and subtopics free to coexist', () => {
    const c = node('C', 'chapter', [
      node('TA', 'topic', [node('SA', 'subtopic')]),
      node('TB', 'topic', [node('SB', 'subtopic')])
    ]);
    const tree = [node('L', 'lecture', [c])];
    const keep = ['TB', ...ancestorIds(tree, 'TB')];
    const next = accordionExpanded(tree, ['L', 'C', 'TA', 'SA', 'TB'], keep);
    expect(sorted(next)).toEqual(['C', 'L', 'SA', 'TA', 'TB']);
  });

  it('treats chapter roots as main topics when the lecture root is missing', () => {
    // Without a :Lecture node, /domain/tree returns chapters as roots.
    const tree = [
      node('C1', 'chapter', [node('T1', 'topic')]),
      node('C2', 'chapter', [node('T2', 'topic')])
    ];
    const next = accordionExpanded(tree, ['C1', 'T1', 'C2'], ['C2']);
    expect(sorted(next)).toEqual(['C2']);
  });

  it('is a no-op without a tree', () => {
    expect(sorted(accordionExpanded(null, ['C1', 'C2'], ['C1']))).toEqual([
      'C1',
      'C2'
    ]);
  });
});

describe('ancestorIds', () => {
  it('lists ancestors root first and excludes the node itself', () => {
    expect(ancestorIds(forest, 'X1')).toEqual(['L', 'C1', 'T1', 'S1']);
  });

  it('is empty for a root and for an unknown id', () => {
    expect(ancestorIds(forest, 'L')).toEqual([]);
    expect(ancestorIds(forest, 'nope')).toEqual([]);
  });
});
