import { describe, expect, it } from 'vitest';

import { buildMockNextSteps } from '../api/mock/fixtures/nextSteps';
import { __test } from '../components/tree/NextSteps';
import { ConceptProgress, ConceptStatus, ProgressResponse } from '../api/types';

/**
 * Creates concept progress with plausible values for a status.
 * @param id: Concept id
 * @param status: Concept status
 * @returns: The concept progress
 */
function concept(id: string, status: ConceptStatus): ConceptProgress {
  return {
    id,
    name: `Konzept ${id}`,
    status,
    mastery: status === 'new' || status === 'visited' ? null : 0.4,
    mastery_peak: status === 'mastered' ? 0.9 : 0.4,
    mastered: status === 'mastered',
    gate_passed: status === 'mastered' || status === 'due_review',
    prereqs_met: true,
    prereqs_missing: [],
    days_until_due: null,
    days_since_quiz: null,
    visited_count: status === 'visited' ? 1 : 0,
    s: 0,
    f: 0
  };
}

/**
 * Wraps concepts in a progress response with a matching summary. Callers pass them out
 * of lecture order, since the ordering is under test.
 * @param entries: Concepts
 * @returns: The progress response
 */
function progress(entries: ConceptProgress[]): ProgressResponse {
  const counts = {
    new: 0,
    visited: 0,
    in_progress: 0,
    due_review: 0,
    mastered: 0
  };
  for (const c of entries) {
    counts[c.status] += 1;
  }
  return {
    student_id: 'test',
    concepts: entries,
    rollup: {},
    summary: {
      total: entries.length,
      ...counts,
      gate_passed: counts.mastered + counts.due_review,
      mastery_avg: 0
    }
  };
}

describe('buildMockNextSteps', () => {
  it('sorts by concept id, which is the order of the lecture', () => {
    const res = buildMockNextSteps(
      progress([
        concept('BDT_CH02_T01_C01', 'new'),
        concept('BDT_CH01_T03_S01_C01', 'new'),
        concept('BDT_CH01_T01_C01', 'visited')
      ]),
      5
    );
    expect(res.next.map(e => e.id)).toEqual([
      'BDT_CH01_T01_C01',
      'BDT_CH01_T03_S01_C01',
      'BDT_CH02_T01_C01'
    ]);
  });

  it('a concept hanging directly off a topic sorts before its sibling subtopic', () => {
    // "C" < "S", so BDT_CH01_T03_C01 precedes BDT_CH01_T03_S01_C01, as in the tree.
    const res = buildMockNextSteps(
      progress([
        concept('BDT_CH01_T03_S01_C01', 'new'),
        concept('BDT_CH01_T03_C01', 'new')
      ]),
      5
    );
    expect(res.next[0].id).toBe('BDT_CH01_T03_C01');
  });

  it('leaves out what is already done and counts refreshers separately', () => {
    const res = buildMockNextSteps(
      progress([
        concept('BDT_CH01_T01_C01', 'mastered'),
        concept('BDT_CH01_T01_C02', 'due_review'),
        concept('BDT_CH01_T01_C03', 'in_progress')
      ]),
      5
    );
    expect(res.next.map(e => e.id)).toEqual(['BDT_CH01_T01_C03']);
    expect(res.due_count).toBe(1);
    expect(res.mastered).toBe(1);
  });

  it('caps the list but reports the full size of the front', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      concept(`BDT_CH01_T01_C${String(i).padStart(2, '0')}`, 'new')
    );
    const res = buildMockNextSteps(progress(many), 5);
    expect(res.next).toHaveLength(5);
    expect(res.next_total).toBe(9);
  });

  it('returns an empty list when everything is mastered', () => {
    const res = buildMockNextSteps(
      progress([concept('BDT_CH01_T01_C01', 'mastered')]),
      5
    );
    expect(res.next).toEqual([]);
    expect(res.mastered).toBe(res.total);
  });
});

describe('reason', () => {
  it('distinguishes started, merely seen and untouched', () => {
    const texts = (['in_progress', 'visited', 'new'] as ConceptStatus[]).map(
      status =>
        __test.reason({
          id: 'x',
          name: 'x',
          status,
          path: '',
          mastery: null,
          visited_count: 0
        })
    );
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain('angefangen');
  });
});
