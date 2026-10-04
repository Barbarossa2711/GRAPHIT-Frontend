/**
 * Mock /recommend, derived from the mock progress so the two stay consistent.
 *
 * Reproduces the central case of the learner model: a prerequisite is overdue
 * (`due_for_review`) while the target is still in `ready_to_learn`.
 */

import {
  ConceptProgress,
  PathEntry,
  ProgressResponse,
  RecommendResponse
} from '../../types';

/**
 * Converts a concept into a path entry.
 * @param c: Concept progress
 * @returns: The path entry
 */
function entry(c: ConceptProgress): PathEntry {
  return { id: c.id, name: c.name, status: c.status };
}

/**
 * Builds the mock /recommend response.
 * @param conceptId: Target concept
 * @param progress: Demo progress
 * @returns: The recommendation, or null if the concept is unknown
 */
export function buildMockRecommend(
  conceptId: string,
  progress: ProgressResponse
): RecommendResponse | null {
  const index = progress.concepts.findIndex(c => c.id === conceptId);
  if (index < 0) {
    return null;
  }
  const target = progress.concepts[index];

  // The two preceding concepts act as direct prerequisites; each lands in one bucket.
  const prereqs = progress.concepts.slice(Math.max(0, index - 2), index);

  const blocked: PathEntry[] = [];
  const dueForReview: PathEntry[] = [];
  const readyToLearn: PathEntry[] = [];

  // Never-mastered prerequisites gate the target. The first is ready now, later ones
  // wait on their predecessor, forming a chain.
  const openPrereqs = prereqs.filter(
    p => !p.gate_passed && p.status !== 'mastered'
  );

  openPrereqs.forEach((p, i) => {
    if (i === 0) {
      readyToLearn.push(entry(p));
    } else {
      blocked.push({
        ...entry(p),
        missing_prereqs: [openPrereqs[i - 1].name]
      });
    }
  });

  // Mastered once but decayed: not a blocker, only a review.
  for (const p of prereqs) {
    if (p.gate_passed && p.status === 'due_review') {
      dueForReview.push({
        ...entry(p),
        days_until_due: p.days_until_due ?? 0
      });
    }
  }

  if (openPrereqs.length > 0) {
    blocked.push({
      ...entry(target),
      missing_prereqs: openPrereqs.map(p => p.name)
    });
  } else if (!target.mastered) {
    readyToLearn.push(entry(target));
  }

  // A few siblings as additional options.
  progress.concepts
    .slice(index + 1, index + 3)
    .filter(c => c.gate_passed === false && c.status === 'new')
    .forEach(c => readyToLearn.push(entry(c)));

  const facilitators = progress.concepts
    .slice(Math.max(0, index - 4), Math.max(0, index - 2))
    .map(entry);

  return {
    target: entry(target),
    ready_to_learn: readyToLearn,
    blocked,
    due_for_review: dueForReview,
    facilitators
  };
}
