/**
 * Wire types of the GRAPHIT backend, verified against real HTTP responses.
 */

// GET /domain/tree

export type NodeType = 'lecture' | 'chapter' | 'topic' | 'subtopic' | 'concept';

export interface DomainNode {
  id: string;
  /** Falls back to `id` server-side, never null. */
  name: string;
  type: NodeType;
  /** Always present; `[]` for concepts and empty branches. */
  children: DomainNode[];
}

export interface DomainTreeResponse {
  /** A forest of roots; may be empty. */
  tree: DomainNode[];
}

// POST /v1/chat/completions

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** GRAPHIT extension to the OpenAI schema; sent with every chat request. */
export interface ChatScope {
  id: string;
  name?: string;
  type?: NodeType;
}

export interface ChatRequest {
  model?: string;
  /** Full history; the server is stateless. */
  messages: ChatMessage[];
  stream?: boolean;
  user?: string;
  scope?: ChatScope;
  /**
   * Identifies the conversation so the server counts one visit per chat session instead
   * of one per message. If omitted, the server derives a key from the history.
   */
  session_id?: string;
}

/**
 * A lecture slide the tutor was given for an answer. Only a reference: title and text
 * are deliberately omitted so the panel cannot be used to read the lecture material.
 */
export interface SlideCitation {
  /** Page within `source`, identical to the slide number. */
  page: number;
  /** Chapter title; empty for chapters without one. */
  chapter: string;
  /** Chapter number; null outside the numbered chapters. */
  chapter_num: number | null;
  /** File name of the slide deck. */
  source: string;
  /** Revision of the slide set, e.g. "BDT 2026". */
  stand: string;
}

export interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: 'stop';
  }>;
  /** GRAPHIT extension; absent when no slide was loaded. */
  graphit_slides?: SlideCitation[];
}

export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    /** `role` only in the first chunk; `content` missing in the first and last. */
    delta: { role?: 'assistant'; content?: string };
    finish_reason: 'stop' | null;
  }>;
  /** GRAPHIT extension, only on the closing chunk. */
  graphit_slides?: SlideCitation[];
}

export interface ChatStreamHandlers {
  /** Fired once, when the first content chunk arrives. */
  onFirstChunk?: () => void;
  onDelta: (text: string) => void;
  /** Fired at most once, with the slides the answer drew on. */
  onSlides?: (slides: SlideCitation[]) => void;
  onDone?: () => void;
}

// GET /progress

export type ConceptStatus =
  'new' | 'visited' | 'in_progress' | 'due_review' | 'mastered';

export interface ConceptProgress {
  id: string;
  name: string;
  status: ConceptStatus;
  /** null = never tested. Decays over time. */
  mastery: number | null;
  /** 0 = never tested. Never decays. */
  mastery_peak: number;
  mastered: boolean;
  /** mastery_peak >= threshold; unlocks follow-on concepts. */
  gate_passed: boolean;
  /**
   * All direct prerequisites have passed their gate (true if there are none), i.e.
   * this concept is ready to be worked on.
   */
  prereqs_met: boolean;
  /** Names of the direct prerequisites that still block this concept. */
  prereqs_missing: string[];
  /** Negative = overdue; null = never answered. */
  days_until_due: number | null;
  /** Days since the last quiz answer; 0 = today, null = never. Chat does not count. */
  days_since_quiz: number | null;
  visited_count: number;
  s: number;
  f: number;
}

export interface RollupStats {
  total: number;
  new: number;
  visited: number;
  in_progress: number;
  due_review: number;
  mastered: number;
  gate_passed: number;
  /** Average over all concepts of the group; never-tested count as 0. */
  mastery_avg: number;
}

export interface ProgressResponse {
  student_id: string;
  concepts: ConceptProgress[];
  /** Keyed by chapter, topic and subtopic IDs. */
  rollup: Record<string, RollupStats>;
  summary: RollupStats;
}

// GET /recommend

export interface PathEntry {
  id: string;
  name: string;
  status: ConceptStatus;
  /** Only in `blocked`; names, not IDs. */
  missing_prereqs?: string[];
  /** Only in `due_for_review`; negative = overdue. */
  days_until_due?: number;
}

export interface RecommendResponse {
  target: PathEntry;
  /** The learnable front: a choice, not an instruction. */
  ready_to_learn: PathEntry[];
  /** Prerequisites never mastered. */
  blocked: PathEntry[];
  /** Mastered once, decayed; not a blocker. */
  due_for_review: PathEntry[];
  /** Optional, not a prerequisite. */
  facilitators: PathEntry[];
}

// GET /next

/** A proposed concept; `path` is its position in the tree. */
export interface NextStep {
  id: string;
  name: string;
  status: ConceptStatus;
  /** "Chapter > Topic > Subtopic"; empty if the concept hangs off the root. */
  path: string;
  /** Current, decaying mastery; null if never tested. */
  mastery: number | null;
  visited_count: number;
}

export interface NextStepsResponse {
  student_id: string;
  /** The learnable front in lecture order, capped by the server. */
  next: NextStep[];
  /** Size of the front before capping. */
  next_total: number;
  /** Number of due reviews. */
  due_count: number;
  mastered: number;
  total: number;
}

// Quiz

export interface QuizOption {
  id: string;
  text: string;
}

export type QuestionType = 'single' | 'multiple' | 'cloze' | 'match' | 'order';

export interface SinglePayload {
  type: 'single';
  prompt: string;
  options: QuizOption[];
}

export interface MultiplePayload {
  type: 'multiple';
  prompt: string;
  options: QuizOption[];
  grading: 'all_or_nothing';
}

export interface ClozePayload {
  type: 'cloze';
  prompt: string;
  /** Contains `{{blankId}}` placeholders. */
  text: string;
  /** Authoritative list of blank IDs. */
  blanks: string[];
  /** Contains distractors, so it has more entries than blanks. */
  bank: QuizOption[];
  /** false = each bank entry may be used only once (not checked by the grader). */
  reuse: boolean;
}

export interface MatchPayload {
  type: 'match';
  prompt: string;
  left: QuizOption[];
  /** Usually longer than `left` (distractors). */
  right: QuizOption[];
}

export interface OrderPayload {
  type: 'order';
  prompt: string;
  /** Delivered in arbitrary order. */
  items: QuizOption[];
}

export type QuestionPayload =
  SinglePayload | MultiplePayload | ClozePayload | MatchPayload | OrderPayload;

/** A day with learning activity; days without activity are omitted. */
export interface ActivityDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Answered quiz questions plus chat sessions on that day. */
  count: number;
}

export interface ActivityResponse {
  student_id: string;
  days: ActivityDay[];
}

export interface ClientQuestion {
  question_id: string;
  type: QuestionType;
  /** Without `stem_id`, `source`, `explanation` and `solution`. */
  payload: QuestionPayload;
}

/** Wire format of an answer: IDs only, never display text. */
export type Answer = string | string[] | Record<string, string>;

export interface QuizCandidatesRequest {
  concept_id?: string | null;
  topic_id?: string | null;
  student_id?: string | null;
  only_unmastered?: boolean;
}

export interface QuizCandidate {
  id: string;
  /** null if the request used `concept_id`. */
  name: string | null;
}

export interface QuizCandidatesResponse {
  candidates: QuizCandidate[];
}

export interface QuizStartResponse {
  quiz_id: string;
  concept_id: string;
  questions: ClientQuestion[];
}

export interface QuizSubmitRequest {
  quiz_id: string;
  answers: Record<string, Answer>;
}

export interface QuizResult {
  question_id: string;
  type: QuestionType;
  correct: boolean;
  your_answer: Answer | null;
  /** Type-specific and only documented for `single`, so consumers must degrade gracefully. */
  solution: unknown;
  explanation: string | null;
}

export interface QuizSubmitResponse {
  concept_id: string;
  n_correct: number;
  n_total: number;
  mastery: number;
  mastered: boolean;
  mastery_peak: number;
  gate_passed: boolean;
  /**
   * Whole days until the next review; 0 = due today, negative = overdue. Never null;
   * only meaningful once `gate_passed`.
   */
  next_due_in_days: number;
  /** Cumulative across all attempts. */
  s: number;
  f: number;
  results: QuizResult[];
}

// GET /v1/models

export interface ModelsResponse {
  object?: string;
  data?: Array<{ id: string; object?: string }>;
}
