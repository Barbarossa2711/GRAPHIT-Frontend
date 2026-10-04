/**
 * Mock progress, derived deterministically from the mock tree.
 *
 * Covers all five statuses plus the edge cases the UI must handle:
 *   - due_review with gate_passed=true and overdue days_until_due (not blocking)
 *   - in_progress with gate_passed=false (blocking)
 *   - mastered with days_until_due = 1 (short-lived mastery at s=3)
 *   - new with mastery=null (never tested, must not render as 0 %)
 */

import {
  ConceptProgress,
  ConceptStatus,
  DomainNode,
  ProgressResponse,
  RollupStats
} from '../../types';
import { MOCK_TREE, mockConcepts } from './tree';

const PATTERN: Array<{
  status: ConceptStatus;
  mastery: number | null;
  peak: number;
  due: number | null;
  visits: number;
  s: number;
  f: number;
}> = [
  {
    status: 'mastered',
    mastery: 0.94,
    peak: 0.94,
    due: 15,
    visits: 3,
    s: 6,
    f: 0
  },
  // Freshly reached mastery is short-lived by design (s=3, no buffer).
  {
    status: 'mastered',
    mastery: 0.81,
    peak: 0.85,
    due: 1,
    visits: 1,
    s: 3,
    f: 0
  },
  // Decayed, but the gate stays open: blocks nothing.
  {
    status: 'due_review',
    mastery: 0.301,
    peak: 0.978,
    due: -25,
    visits: 4,
    s: 6,
    f: 0
  },
  {
    status: 'due_review',
    mastery: 0.12,
    peak: 0.88,
    due: -3,
    visits: 2,
    s: 5,
    f: 1
  },
  // Tested but never above the threshold: blocking.
  {
    status: 'in_progress',
    mastery: 0.42,
    peak: 0.42,
    due: null,
    visits: 2,
    s: 2,
    f: 2
  },
  {
    status: 'in_progress',
    mastery: 0.63,
    peak: 0.63,
    due: null,
    visits: 1,
    s: 3,
    f: 1
  },
  // Seen in the chat, never tested: mastery is absent, not zero.
  {
    status: 'visited',
    mastery: null,
    peak: 0,
    due: null,
    visits: 2,
    s: 0,
    f: 0
  },
  { status: 'new', mastery: null, peak: 0, due: null, visits: 0, s: 0, f: 0 },
  { status: 'new', mastery: null, peak: 0, due: null, visits: 0, s: 0, f: 0 },
  { status: 'new', mastery: null, peak: 0, due: null, visits: 0, s: 0, f: 0 }
];

/**
 * Assigns the status pattern cyclically to the mock concepts.
 * @returns: Progress for every mock concept
 */
function buildConcepts(): ConceptProgress[] {
  return mockConcepts().map((node, i) => {
    const p = PATTERN[i % PATTERN.length];
    return {
      id: node.id,
      name: node.name,
      status: p.status,
      mastery: p.mastery,
      mastery_peak: p.peak,
      mastered: p.status === 'mastered',
      gate_passed: p.peak >= 0.8,
      // Filled in by applyReadiness once all concepts exist.
      prereqs_met: true,
      prereqs_missing: [],
      days_until_due: p.due,
      // Plausible age derived from the answer counts.
      days_since_quiz: p.s + p.f > 0 ? (i * 3) % 20 : null,
      visited_count: p.visits,
      s: p.s,
      f: p.f
    };
  });
}

/**
 * Computes `prereqs_met` and `prereqs_missing` like the backend. Without prerequisite
 * edges, the two preceding concepts count as direct prerequisites (as in
 * fixtures/recommend.ts). Mutates in place.
 * @param concepts: All concepts in tree order
 */
export function applyReadiness(concepts: ConceptProgress[]): void {
  concepts.forEach((c, i) => {
    const prereqs = concepts.slice(Math.max(0, i - 2), i);
    const missing = prereqs.filter(p => !p.gate_passed).map(p => p.name);
    c.prereqs_met = missing.length === 0;
    c.prereqs_missing = missing;
  });
}

/**
 * Creates zeroed rollup statistics.
 * @returns: Empty statistics
 */
function emptyStats(): RollupStats {
  return {
    total: 0,
    new: 0,
    visited: 0,
    in_progress: 0,
    due_review: 0,
    mastered: 0,
    gate_passed: 0,
    mastery_avg: 0
  };
}

/**
 * Adds a concept to the statistics. Never-tested concepts count as mastery 0, like in
 * the backend.
 * @param stats: Statistics to update in place
 * @param c: Concept to add
 */
function accumulate(stats: RollupStats, c: ConceptProgress): void {
  stats.total += 1;
  stats[c.status] += 1;
  if (c.gate_passed) {
    stats.gate_passed += 1;
  }
  stats.mastery_avg += c.mastery ?? 0;
}

/**
 * Turns the accumulated mastery sum into a rounded average.
 * @param stats: Accumulated statistics
 * @returns: The same object with the average applied
 */
function finish(stats: RollupStats): RollupStats {
  stats.mastery_avg =
    stats.total > 0
      ? Math.round((stats.mastery_avg / stats.total) * 1000) / 1000
      : 0;
  return stats;
}

/**
 * Builds a fresh progress response, so mutations cannot leak between calls.
 * @param studentId: Student id to report
 * @returns: The mock progress
 */
export function buildMockProgress(studentId: string): ProgressResponse {
  const concepts = buildConcepts();
  applyReadiness(concepts);
  const byId = new Map(concepts.map(c => [c.id, c]));
  const rollup: Record<string, RollupStats> = {};
  const summary = emptyStats();

  // Rollups are keyed by the inner node ids (chapter, topic, subtopic).
  const walk = (node: DomainNode): ConceptProgress[] => {
    if (node.type === 'concept') {
      const c = byId.get(node.id);
      return c ? [c] : [];
    }
    const collected = node.children.flatMap(walk);
    if (node.type !== 'lecture') {
      const stats = emptyStats();
      collected.forEach(c => accumulate(stats, c));
      rollup[node.id] = finish(stats);
    }
    return collected;
  };

  MOCK_TREE.tree.forEach(walk);
  concepts.forEach(c => accumulate(summary, c));

  return {
    student_id: studentId,
    concepts,
    rollup,
    summary: finish(summary)
  };
}
