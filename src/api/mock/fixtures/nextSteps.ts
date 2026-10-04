/**
 * Mock /next, derived from the mock progress so panel and tree stay consistent.
 *
 * The mock has no prerequisite edges, so the learnable front is approximated as
 * "everything not yet mastered", kept in lecture order.
 */

import { NextStep, NextStepsResponse, ProgressResponse } from '../../types';

/**
 * Converts a concept into a next step. The path stays empty because the mock tree has
 * no hierarchy names.
 * @param c: Concept progress
 * @returns: The next step
 */
function step(c: ProgressResponse['concepts'][number]): NextStep {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    path: '',
    mastery: c.mastery,
    visited_count: c.visited_count
  };
}

/**
 * Builds the mock /next response.
 * @param progress: Demo progress
 * @param limit: Maximum number of steps
 * @returns: The next-steps response
 */
export function buildMockNextSteps(
  progress: ProgressResponse,
  limit: number
): NextStepsResponse {
  // Concept ids are hierarchical, so sorting by id yields the tree order.
  const front = progress.concepts
    .filter(
      c =>
        c.status === 'new' ||
        c.status === 'visited' ||
        c.status === 'in_progress'
    )
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    student_id: progress.student_id,
    next: front.slice(0, limit).map(step),
    next_total: front.length,
    due_count: progress.summary.due_review,
    mastered: progress.summary.mastered,
    total: progress.summary.total
  };
}
