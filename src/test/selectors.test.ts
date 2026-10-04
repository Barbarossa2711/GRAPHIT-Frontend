import { describe, expect, it } from 'vitest';

import {
  ConceptProgress,
  DomainNode,
  NodeType,
  ProgressResponse,
  RecommendResponse,
  RollupStats
} from '../api/types';
import { clampSplitRatio, DEFAULT_SPLIT_RATIO } from '../state/store';
import {
  answerTotals,
  blockedTarget,
  collectConcepts,
  collectTopicIds,
  dueCount,
  dueList,
  formatDue,
  formatMastery,
  isOverdue,
  openCount,
  masteryAverageTested,
  peakAverage,
  percent,
  reviewLoad,
  soonDueList,
  splitUntouched,
  testedCount
} from '../state/selectors';

/**
 * Creates concept progress with defaults.
 * @param over: Fields to override
 * @returns: The concept progress
 */
function concept(over: Partial<ConceptProgress>): ConceptProgress {
  return {
    id: 'c',
    name: 'C',
    status: 'new',
    mastery: null,
    mastery_peak: 0,
    mastered: false,
    gate_passed: false,
    prereqs_met: true,
    prereqs_missing: [],
    days_until_due: null,
    days_since_quiz: null,
    visited_count: 0,
    s: 0,
    f: 0,
    ...over
  };
}

/**
 * Creates rollup statistics with defaults.
 * @param over: Fields to override
 * @returns: The statistics
 */
function stats(over: Partial<RollupStats>): RollupStats {
  return {
    total: 0,
    new: 0,
    visited: 0,
    in_progress: 0,
    due_review: 0,
    mastered: 0,
    gate_passed: 0,
    mastery_avg: 0,
    ...over
  };
}

/**
 * Wraps concepts and summary in a progress response.
 * @param concepts: Concepts
 * @param summary: Summary statistics
 * @returns: The progress response
 */
function progress(
  concepts: ConceptProgress[],
  summary: RollupStats
): ProgressResponse {
  return { student_id: 's', concepts, rollup: {}, summary };
}

describe('due vs. blocked — the distinction the whole UI hangs on', () => {
  it('a decayed but once-mastered concept does not block', () => {
    const c = concept({
      status: 'due_review',
      mastery: 0.301,
      mastery_peak: 0.978,
      gate_passed: true,
      days_until_due: -25.5
    });
    // gate_passed, not mastery, decides whether follow-ons are unlocked.
    expect(c.gate_passed).toBe(true);
    expect(c.mastered).toBe(false);
  });

  it('a never-mastered concept blocks even with a decent current mastery', () => {
    const c = concept({
      status: 'in_progress',
      mastery: 0.63,
      mastery_peak: 0.63,
      gate_passed: false
    });
    expect(c.gate_passed).toBe(false);
  });
});

describe('dueCount / openCount', () => {
  const p = progress(
    [],
    stats({
      total: 100,
      new: 40,
      visited: 5,
      in_progress: 12,
      due_review: 8,
      mastered: 35
    })
  );

  it('the headline number is summary.due_review alone', () => {
    expect(dueCount(p)).toBe(8);
  });

  it('never-mastered concepts are counted separately, never summed in', () => {
    expect(openCount(p)).toBe(57);
    expect(dueCount(p) + openCount(p)).not.toBe(dueCount(p));
  });

  it('handles a missing progress response', () => {
    expect(dueCount(null)).toBe(0);
    expect(openCount(null)).toBe(0);
  });
});

describe('isOverdue', () => {
  it('reads a missing date as "nothing due"', () => {
    // null means never answered, so nothing can be due.
    expect(
      isOverdue(concept({ gate_passed: true, days_until_due: null }))
    ).toBe(false);
    expect(
      isOverdue(concept({ status: 'visited', days_until_due: null }))
    ).toBe(false);
  });

  it('needs the gate, not just a date in the past', () => {
    // Regression: a never-mastered concept also has a negative date and used to show
    // as due in the tree but not in the review tab.
    expect(
      isOverdue(
        concept({ status: 'in_progress', gate_passed: false, days_until_due: -14 })
      )
    ).toBe(false);
    expect(
      isOverdue(
        concept({ status: 'due_review', gate_passed: true, days_until_due: -14 })
      )
    ).toBe(true);
  });

  it('otherwise splits on the date itself', () => {
    expect(
      isOverdue(
        concept({ status: 'due_review', gate_passed: true, days_until_due: 0 })
      )
    ).toBe(true);
    expect(
      isOverdue(
        concept({ status: 'due_review', gate_passed: true, days_until_due: -3 })
      )
    ).toBe(true);
    expect(
      isOverdue(
        concept({ status: 'mastered', gate_passed: true, days_until_due: 3 })
      )
    ).toBe(false);
  });
});

describe('dueList ordering', () => {
  it('sorts the most overdue first', () => {
    const p = progress(
      [
        concept({
          id: 'a',
          name: 'A',
          status: 'due_review',
          days_until_due: -1
        }),
        // Undercut threshold, dated by the backend to the last attempt.
        concept({
          id: 'b',
          name: 'B',
          status: 'due_review',
          days_until_due: -40
        }),
        concept({
          id: 'c',
          name: 'C',
          status: 'due_review',
          days_until_due: -25.5
        }),
        concept({ id: 'd', name: 'D', status: 'mastered', days_until_due: 3 })
      ],
      stats({})
    );
    expect(dueList(p).map(c => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('soonDueList only reports mastered concepts inside the window', () => {
    const p = progress(
      [
        concept({ id: 'a', status: 'mastered', days_until_due: 3 }),
        concept({ id: 'b', status: 'mastered', days_until_due: 30 }),
        concept({ id: 'c', status: 'due_review', days_until_due: -2 })
      ],
      stats({})
    );
    expect(soonDueList(p, 7).map(c => c.id)).toEqual(['a']);
  });
});

describe('corpus figures', () => {
  it('sums answers from s/f, not from the activity history', () => {
    const p = progress(
      [
        concept({ id: 'a', s: 4, f: 1 }),
        concept({ id: 'b', s: 2, f: 3 }),
        concept({ id: 'c' })
      ],
      stats({})
    );
    const totals = answerTotals(p);
    expect(totals).toEqual({
      correct: 6,
      wrong: 4,
      total: 10,
      accuracy: 0.6
    });
  });

  it('reports no accuracy at all before the first answer', () => {
    // 0 % would claim a failure that never happened.
    expect(answerTotals(progress([concept({})], stats({}))).accuracy).toBe(
      null
    );
    expect(answerTotals(null).total).toBe(0);
  });

  it('counts a concept as tested only once it was answered', () => {
    // visited_count is raised by chatting and must not count here.
    const p = progress(
      [
        concept({ id: 'a', s: 1, f: 0 }),
        concept({ id: 'b', s: 0, f: 2 }),
        concept({ id: 'c', visited_count: 9 })
      ],
      stats({})
    );
    expect(testedCount(p)).toBe(2);
  });

  it('averages the peak over ALL concepts, like the backend does', () => {
    // Untested concepts count as 0.
    const p = progress(
      [
        concept({ id: 'a', mastery_peak: 1 }),
        concept({ id: 'b', mastery_peak: 0.5 }),
        concept({ id: 'c' })
      ],
      stats({})
    );
    expect(peakAverage(p)).toBeCloseTo(0.5);
    expect(peakAverage(null)).toBe(0);
  });

  it('masteryAverageTested ignores concepts that were never quizzed', () => {
    // Unlike peakAverage, untested concepts are excluded.
    const p = progress(
      [
        concept({ id: 'a', mastery: 0.9 }),
        concept({ id: 'b', mastery: 0.3 }),
        concept({ id: 'c', mastery: null })
      ],
      stats({})
    );
    expect(masteryAverageTested(p)).toBeCloseTo(0.6);
    expect(masteryAverageTested(progress([concept({ id: 'c' })], stats({})))).toBeNull();
    expect(masteryAverageTested(null)).toBeNull();
  });

  it('never divides by zero', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(3, 8)).toBe(38);
  });
});

describe('reviewLoad', () => {
  it('buckets by day and collapses everything already due', () => {
    const p = progress(
      [
        concept({ id: 'a', gate_passed: true, days_until_due: -9 }),
        concept({ id: 'b', gate_passed: true, days_until_due: 0 }),
        concept({ id: 'c', gate_passed: true, days_until_due: 3 }),
        concept({ id: 'd', gate_passed: true, days_until_due: 3 }),
        concept({ id: 'e', gate_passed: true, days_until_due: 14 }),
        concept({ id: 'f', gate_passed: true, days_until_due: 15 })
      ],
      stats({})
    );
    const load = reviewLoad(p, 14);
    expect(load.overdue).toBe(2);
    expect(load.days[2]).toEqual({ day: 3, count: 2 });
    expect(load.days[13]).toEqual({ day: 14, count: 1 });
    expect(load.beyond).toBe(1);
    expect(load.max).toBe(2);
  });

  it('ignores concepts that were never mastered', () => {
    // They have a negative date, but no review to schedule.
    const p = progress(
      [
        concept({ id: 'a', gate_passed: false, days_until_due: -14 }),
        concept({ id: 'b', gate_passed: false, days_until_due: 2 }),
        concept({ id: 'c', gate_passed: true, days_until_due: null })
      ],
      stats({})
    );
    const load = reviewLoad(p, 14);
    expect(load.overdue).toBe(0);
    expect(load.days.every(d => d.count === 0)).toBe(true);
    expect(load.max).toBe(1);
  });
});

describe('formatting', () => {
  it('never renders "nie getestet" as 0 %', () => {
    expect(formatMastery(null)).toBe('nie getestet');
    expect(formatMastery(0)).toBe('0 %');
  });

  it('has no "immediately due" wording left: null means never answered', () => {
    expect(formatDue(null)).toBe('noch nicht geprüft');
  });

  it('negative days read as overdue', () => {
    expect(formatDue(-25)).toBe('seit 25 Tagen fällig');
    expect(formatDue(10)).toBe('in 10 Tagen fällig');
  });

  // The API delivers whole days: 0 = due since today, 1 = tomorrow.
  it('phrases the day boundary, not a fraction of a day', () => {
    expect(formatDue(0)).toBe('seit heute fällig');
    expect(formatDue(1)).toBe('in 1 Tag fällig');
    expect(formatDue(-1)).toBe('seit 1 Tag fällig');
  });
});

/**
 * The hierarchy has varying depth: topics can carry concepts directly and subtopics can
 * nest, so the selectors must handle any depth.
 */
describe('hierarchy of varying depth', () => {
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

  const tree = node('BDT', 'lecture', [
    node('CH01', 'chapter', [
      // Topic without subtopics; concepts hang off it directly.
      node('T07', 'topic', [node('T07_C01', 'concept')]),
      node('T03', 'topic', [
        node('S01', 'subtopic', [
          node('S01_C01', 'concept'),
          // Subtopic inside a subtopic, two levels deep.
          node('S01_S01', 'subtopic', [
            node('S01_S01_S01', 'subtopic', [node('DEEP_C01', 'concept')])
          ])
        ])
      ])
    ])
  ]);

  it('collects concepts that hang directly off a topic', () => {
    expect(collectConcepts(tree).map(c => c.id)).toContain('T07_C01');
  });

  it('collects concepts from arbitrarily nested subtopics', () => {
    expect(collectConcepts(tree).map(c => c.id)).toContain('DEEP_C01');
  });

  it('finds every concept in the tree, whatever its depth', () => {
    expect(collectConcepts(tree)).toHaveLength(3);
  });

  it('collects topic ids without descending into subtopics', () => {
    expect(collectTopicIds(tree).sort()).toEqual(['T03', 'T07']);
  });
});

describe('blockedTarget', () => {
  /**
   * Creates a recommendation response with defaults.
   * @param over: Fields to override
   * @returns: The recommendation
   */
  function response(over: Partial<RecommendResponse>): RecommendResponse {
    return {
      target: { id: 'X', name: 'X' },
      ready_to_learn: [],
      blocked: [],
      due_for_review: [],
      facilitators: [],
      ...over
    } as RecommendResponse;
  }

  it('reports the target when it is blocked', () => {
    const r = response({
      blocked: [{ id: 'X', name: 'X', status: 'new', missing_prereqs: ['A'] }]
    });
    expect(blockedTarget(r)?.missing_prereqs).toEqual(['A']);
  });

  // Only the target's own entry in `blocked` is relevant.
  it('ignores other blocked concepts of the path', () => {
    const r = response({
      blocked: [{ id: 'Y', name: 'Y', status: 'new', missing_prereqs: ['A'] }]
    });
    expect(blockedTarget(r)).toBeNull();
  });

  it('treats a merely decayed concept as unblocked', () => {
    const r = response({
      due_for_review: [
        { id: 'X', name: 'X', status: 'due_review', days_until_due: -3 }
      ]
    });
    expect(blockedTarget(r)).toBeNull();
  });

  it('survives a missing recommendation', () => {
    expect(blockedTarget(null)).toBeNull();
  });
});

/** Receives raw pointer positions, so out-of-range values are normal. */
describe('clampSplitRatio', () => {
  it('keeps a value inside the usable range', () => {
    expect(clampSplitRatio(50)).toBe(50);
    expect(clampSplitRatio(25)).toBe(25);
    expect(clampSplitRatio(75)).toBe(75);
  });

  it('clamps a drag past either edge', () => {
    expect(clampSplitRatio(-40)).toBe(25);
    expect(clampSplitRatio(140)).toBe(75);
  });

  it('rounds, so the persisted value stays a whole percent', () => {
    expect(clampSplitRatio(42.4)).toBe(42);
    expect(clampSplitRatio(42.6)).toBe(43);
  });

  // A zero-width container yields NaN.
  it('falls back to the default for a non-finite value', () => {
    // Infinity is non-finite as well and is not clamped to the upper bound.
    expect(clampSplitRatio(NaN)).toBe(DEFAULT_SPLIT_RATIO);
    expect(clampSplitRatio(Infinity)).toBe(DEFAULT_SPLIT_RATIO);
  });
});

/**
 * Decides the warning before a combined quiz over a whole chapter or topic.
 */
describe('splitUntouched', () => {
  const progress = {
    concepts: [
      concept({ id: 'A', status: 'new' }),
      concept({ id: 'B', status: 'visited' }),
      concept({ id: 'C', status: 'mastered' }),
      concept({ id: 'D', status: 'in_progress' })
    ]
  } as ProgressResponse;

  const named = (...ids: string[]) => ids.map(id => ({ id, name: id }));

  it('counts a concept without any learning state as untouched', () => {
    const { untouched } = splitUntouched(progress, named('A', 'B'));
    expect(untouched.map(c => c.id)).toEqual(['A']);
  });

  // "Worked on" means seen at all, not mastered.
  it('treats every state other than new as worked on', () => {
    const { touched } = splitUntouched(progress, named('B', 'C', 'D'));
    expect(touched.map(c => c.id)).toEqual(['B', 'C', 'D']);
  });

  it('treats a concept missing from progress as untouched', () => {
    const { untouched } = splitUntouched(progress, named('Z'));
    expect(untouched.map(c => c.id)).toEqual(['Z']);
  });

  it('reports everything as untouched when no progress is loaded', () => {
    const { touched, untouched } = splitUntouched(null, named('A', 'B'));
    expect(touched).toHaveLength(0);
    expect(untouched).toHaveLength(2);
  });
});
