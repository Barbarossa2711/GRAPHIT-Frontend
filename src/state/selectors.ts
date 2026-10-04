/**
 * Derivations over the raw backend data.
 *
 * Two rules drive the status semantics:
 *   1. "Wiederholung fällig" (due_review) and "locked" are different states; only
 *      `gate_passed` distinguishes them, not `mastery`.
 *   2. `visited_count` (raised by chatting) and mastery (raised by quizzes) are
 *      separate signals and are never merged.
 */

import {
  ConceptProgress,
  ConceptStatus,
  DomainNode,
  NodeType,
  PathEntry,
  ProgressResponse,
  RecommendResponse,
  RollupStats
} from '../api/types';

export const STATUS_ORDER: ConceptStatus[] = [
  'new',
  'visited',
  'in_progress',
  'due_review',
  'mastered'
];

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  new: 'noch nicht begonnen',
  visited: 'angeschaut, nie geprüft',
  in_progress: 'in Arbeit',
  due_review: 'Wiederholung fällig',
  mastered: 'aktuell beherrscht'
};

export const STATUS_SHORT: Record<ConceptStatus, string> = {
  new: 'neu',
  visited: 'angeschaut',
  in_progress: 'in Arbeit',
  due_review: 'fällig',
  mastered: 'beherrscht'
};

/**
 * Long status explanation for the detail panel.
 * @param c: Concept progress
 * @returns: The explanation text
 */
export function statusExplanation(c: ConceptProgress): string {
  switch (c.status) {
    case 'new':
      return 'Du hattest mit diesem Konzept noch keine Berührung.';
    case 'visited':
      return 'Du hast dir das Konzept im Chat angeschaut, aber noch kein Quiz dazu gemacht. Anschauen verändert die Mastery nicht.';
    case 'in_progress':
      return 'Du hast das Konzept schon getestet, die Schwelle aber noch nie erreicht. Es hält Folgekonzepte weiterhin zurück.';
    case 'due_review':
      return 'Du hattest das Konzept schon einmal beherrscht; die Abrufbarkeit ist mit der Zeit gesunken. Das ist kein Rückschritt und blockiert nichts, nur eine Wiederholung steht an.';
    case 'mastered':
      return 'Das Konzept sitzt aktuell. Die Mastery sinkt mit der Zeit wieder; du bekommst rechtzeitig einen Hinweis.';
    default:
      return '';
  }
}

/**
 * Indexes concepts by id, the join key against the domain tree.
 * @param progress: Progress response
 * @returns: Map from concept id to progress
 */
export function conceptIndex(
  progress: ProgressResponse | null
): Map<string, ConceptProgress> {
  if (!progress) {
    return new Map();
  }
  return new Map(progress.concepts.map(c => [c.id, c]));
}

/**
 * Looks up the statistics of a tree node. `undefined` is a normal outcome (unattached
 * concept, empty branch) and renders as "no data".
 * @param node: Tree node
 * @param index: Concept index
 * @param progress: Progress response
 * @returns: Concept progress, rollup statistics or undefined
 */
export function nodeStats(
  node: DomainNode,
  index: Map<string, ConceptProgress>,
  progress: ProgressResponse | null
): ConceptProgress | RollupStats | undefined {
  return node.type === 'concept'
    ? index.get(node.id)
    : progress?.rollup[node.id];
}

/**
 * Type guard distinguishing concept progress from rollup statistics.
 * @param value: Node statistics
 * @returns: True for concept progress
 */
export function isConceptProgress(
  value: ConceptProgress | RollupStats | undefined
): value is ConceptProgress {
  return value !== undefined && 'status' in value;
}

/**
 * Number of concepts that were mastered once and have decayed. Deliberately not summed
 * with never-mastered concepts.
 * @param progress: Progress response
 * @returns: The due count
 */
export function dueCount(progress: ProgressResponse | null): number {
  return progress?.summary.due_review ?? 0;
}

/**
 * Number of concepts that were never mastered.
 * @param progress: Progress response
 * @returns: Count of new, visited and in-progress concepts
 */
export function openCount(progress: ProgressResponse | null): number {
  if (!progress) {
    return 0;
  }
  const s = progress.summary;
  return s.new + s.visited + s.in_progress;
}

/**
 * Whether a concept's review is due now. Never-mastered concepts can also carry a
 * negative date (the backend dates them to the last attempt), so `gate_passed` is
 * required as well. `days_until_due === null` means never answered.
 * @param concept: Gate flag and due date
 * @returns: True if overdue
 */
export function isOverdue(concept: {
  gate_passed: boolean;
  days_until_due: number | null;
}): boolean {
  return (
    concept.gate_passed &&
    concept.days_until_due !== null &&
    concept.days_until_due <= 0
  );
}

/**
 * Due concepts, most urgent first.
 * @param progress: Progress response
 * @returns: The due concepts
 */
export function dueList(progress: ProgressResponse | null): ConceptProgress[] {
  if (!progress) {
    return [];
  }
  return progress.concepts
    .filter(c => c.status === 'due_review')
    .sort(byUrgency);
}

/**
 * Answers over the whole corpus, summed from the cumulative per-concept `s`/`f` (the
 * activity history also counts chat sessions).
 * @param progress: Progress response
 * @returns: Correct, wrong and total answers, plus accuracy (null if nothing answered)
 */
export function answerTotals(progress: ProgressResponse | null): {
  correct: number;
  wrong: number;
  total: number;
  accuracy: number | null;
} {
  let correct = 0;
  let wrong = 0;
  for (const c of progress?.concepts ?? []) {
    correct += c.s;
    wrong += c.f;
  }
  const total = correct + wrong;
  return { correct, wrong, total, accuracy: total > 0 ? correct / total : null };
}

/**
 * Number of concepts answered at least once. Chat visits do not count.
 * @param progress: Progress response
 * @returns: The tested count
 */
export function testedCount(progress: ProgressResponse | null): number {
  return (progress?.concepts ?? []).filter(c => c.s + c.f > 0).length;
}

/**
 * Mean current mastery over concepts quizzed at least once. Unlike
 * `summary.mastery_avg`, never-tested concepts are excluded.
 * @param progress: Progress response
 * @returns: The average, or null if nothing was tested
 */
export function masteryAverageTested(
  progress: ProgressResponse | null
): number | null {
  const tested = (progress?.concepts ?? []).filter(
    (c): c is ConceptProgress & { mastery: number } => c.mastery !== null
  );
  if (tested.length === 0) {
    return null;
  }
  return tested.reduce((sum, c) => sum + c.mastery, 0) / tested.length;
}

/**
 * Mean of the never-decaying `mastery_peak` over all concepts, untested counting as 0
 * like `mastery_avg`. The gap between the two is the decay.
 * @param progress: Progress response
 * @returns: The average peak
 */
export function peakAverage(progress: ProgressResponse | null): number {
  const concepts = progress?.concepts ?? [];
  if (concepts.length === 0) {
    return 0;
  }
  return (
    concepts.reduce((sum, c) => sum + c.mastery_peak, 0) / concepts.length
  );
}

/** Number of reviews falling due on one day. */
export interface ReviewLoadDay {
  /** Days from today; 1 is tomorrow. */
  day: number;
  count: number;
}

export interface ReviewLoad {
  /** Due today or earlier, as a single bucket. */
  overdue: number;
  days: ReviewLoadDay[];
  /** Due after the horizon; reported as a number, not drawn. */
  beyond: number;
  /** Tallest bucket for scaling the bars; at least 1. */
  max: number;
}

/**
 * Review schedule for the next days. Only concepts that passed the gate have a review
 * date; everything due today or earlier is collapsed into one bucket.
 * @param progress: Progress response
 * @param horizon: Number of days to show
 * @returns: The review load
 */
export function reviewLoad(
  progress: ProgressResponse | null,
  horizon = 14
): ReviewLoad {
  const days: ReviewLoadDay[] = Array.from({ length: horizon }, (_, i) => ({
    day: i + 1,
    count: 0
  }));
  let overdue = 0;
  let beyond = 0;

  for (const c of progress?.concepts ?? []) {
    if (!c.gate_passed || c.days_until_due === null) {
      continue;
    }
    if (c.days_until_due <= 0) {
      overdue += 1;
    } else if (c.days_until_due <= horizon) {
      days[c.days_until_due - 1].count += 1;
    } else {
      beyond += 1;
    }
  }

  const max = Math.max(overdue, ...days.map(d => d.count), 1);
  return { overdue, days, beyond, max };
}

/**
 * Computes a whole-number percentage.
 * @param part: Numerator
 * @param total: Denominator
 * @returns: The percentage, 0 for an empty total
 */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Mastered concepts that will fall below the threshold soon.
 * @param progress: Progress response
 * @param days: Look-ahead in days
 * @returns: The concepts, most urgent first
 */
export function soonDueList(
  progress: ProgressResponse | null,
  days = 7
): ConceptProgress[] {
  if (!progress) {
    return [];
  }
  return progress.concepts
    .filter(
      c =>
        c.status === 'mastered' &&
        c.days_until_due !== null &&
        c.days_until_due <= days
    )
    .sort(byUrgency);
}

/**
 * Sort comparator: undated first (by name), then by days until due.
 * @param a: First concept
 * @param b: Second concept
 * @returns: Negative, zero or positive
 */
function byUrgency(a: ConceptProgress, b: ConceptProgress): number {
  const av = a.days_until_due;
  const bv = b.days_until_due;
  if (av === null && bv === null) {
    return a.name.localeCompare(b.name, 'de');
  }
  if (av === null) {
    return -1;
  }
  if (bv === null) {
    return 1;
  }
  return av - bv;
}

/**
 * Mastery needed to count as mastered and to unlock follow-on concepts (backend gate,
 * mirrored in mockClient.ts).
 */
export const MASTERY_THRESHOLD = 0.8;

/**
 * Formats a mastery value.
 * @param value: Mastery between 0 and 1, or null
 * @returns: Percentage text or "nie getestet"
 */
export function formatMastery(value: number | null): string {
  return value === null ? 'nie getestet' : `${Math.round(value * 100)} %`;
}

/**
 * Phrases `days_until_due`. The backend delivers whole days; 0 means due since today,
 * null means never answered.
 * @param days: Days until due
 * @returns: The German phrase
 */
export function formatDue(days: number | null): string {
  if (days === null) {
    return 'noch nicht geprüft';
  }
  if (days > 0) {
    return `in ${formatDays(days)} fällig`;
  }
  return days === 0 ? 'seit heute fällig' : `seit ${formatDays(-days)} fällig`;
}

/**
 * Formats a number of days.
 * @param days: Number of days
 * @returns: E.g. "1 Tag" or "3 Tagen"
 */
function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

/**
 * Collects all concept descendants of a tree node.
 * @param node: Tree node
 * @returns: Concepts in tree order
 */
export function collectConcepts(node: DomainNode): DomainNode[] {
  if (node.type === 'concept') {
    return [node];
  }
  return node.children.flatMap(collectConcepts);
}

/**
 * Collects the topic ids beneath a node (the unit `/quiz/candidates` accepts).
 * @param node: Tree node
 * @returns: Topic ids
 */
export function collectTopicIds(node: DomainNode): string[] {
  if (node.type === 'topic') {
    return [node.id];
  }
  if (node.type === 'concept' || node.type === 'subtopic') {
    return [];
  }
  return node.children.flatMap(collectTopicIds);
}

/**
 * Finds the target's own entry in `blocked`; other entries concern other concepts of
 * the path.
 * @param recommend: Recommendation response
 * @returns: The blocking entry, or null if the target is not blocked
 */
export function blockedTarget(
  recommend: RecommendResponse | null
): PathEntry | null {
  if (!recommend) {
    return null;
  }
  return recommend.blocked.find(e => e.id === recommend.target.id) ?? null;
}

/**
 * Splits concepts into "already worked on" (chat or quiz) and "never touched". Used to
 * warn before a combined quiz about material the student has never seen.
 * @param progress: Progress response
 * @param concepts: Concepts to split
 * @returns: Touched and untouched concepts
 */
export function splitUntouched(
  progress: ProgressResponse | null,
  concepts: Array<{ id: string; name: string }>
): { touched: typeof concepts; untouched: typeof concepts } {
  const status = new Map(progress?.concepts.map(c => [c.id, c.status]) ?? []);
  const touched: typeof concepts = [];
  const untouched: typeof concepts = [];
  for (const c of concepts) {
    (status.get(c.id) && status.get(c.id) !== 'new' ? touched : untouched).push(
      c
    );
  }
  return { touched, untouched };
}

/**
 * Finds a node anywhere in the forest.
 * @param forest: Tree roots
 * @param id: Node id
 * @returns: The node, or null
 */
export function findNode(
  forest: DomainNode[] | null,
  id: string
): DomainNode | null {
  if (!forest) {
    return null;
  }
  for (const node of forest) {
    if (node.id === id) {
      return node;
    }
    const hit = findNode(node.children, id);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Levels with accordion behaviour (at most one open among siblings). A chapter holds
 * over a hundred rows; lower levels stay freely expandable.
 */
const ACCORDION_TYPES = new Set<NodeType>(['lecture', 'chapter']);

/**
 * Enforces the accordion rule on an expansion set. Every accordion-level node outside
 * `keep` is closed together with its subtree, so reopening it later does not restore
 * old expansions. Only applied when opening a node.
 * @param forest: Tree roots
 * @param expanded: Currently expanded ids
 * @param keep: Ids that must stay open (the opened node and its ancestors)
 * @returns: The new expanded ids
 */
export function accordionExpanded(
  forest: DomainNode[] | null,
  expanded: Iterable<string>,
  keep: Iterable<string>
): string[] {
  const result = new Set(expanded);
  if (!forest) {
    return [...result];
  }
  const keepSet = new Set(keep);

  const dropSubtree = (node: DomainNode): void => {
    result.delete(node.id);
    for (const child of node.children) {
      dropSubtree(child);
    }
  };

  const walk = (nodes: DomainNode[]): void => {
    for (const node of nodes) {
      if (ACCORDION_TYPES.has(node.type) && !keepSet.has(node.id)) {
        dropSubtree(node);
        continue;
      }
      walk(node.children);
    }
  };
  walk(forest);
  return [...result];
}

/**
 * Ancestor ids of a node.
 * @param forest: Tree roots
 * @param id: Node id
 * @returns: Ids root first; empty for a root or unknown id
 */
export function ancestorIds(forest: DomainNode[] | null, id: string): string[] {
  return nodePath(forest, id)
    .slice(0, -1)
    .map(n => n.id);
}

/**
 * Path from the root to a node, used for the breadcrumb.
 * @param forest: Tree roots
 * @param id: Node id
 * @returns: Nodes root first, including the node itself; empty if unknown
 */
export function nodePath(
  forest: DomainNode[] | null,
  id: string
): DomainNode[] {
  const path: DomainNode[] = [];
  const walk = (nodes: DomainNode[], trail: DomainNode[]): boolean => {
    for (const node of nodes) {
      const next = [...trail, node];
      if (node.id === id) {
        path.push(...next);
        return true;
      }
      if (walk(node.children, next)) {
        return true;
      }
    }
    return false;
  };
  if (forest) {
    walk(forest, []);
  }
  return path;
}
