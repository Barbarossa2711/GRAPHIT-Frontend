/** Shape of the shared state snapshot. */

import { UserFacingError } from '../api/errors';
import {
  ActivityDay,
  ChatScope,
  ClientQuestion,
  DomainNode,
  NextStepsResponse,
  ProgressResponse,
  QuizCandidate,
  QuizSubmitResponse,
  RecommendResponse,
  SlideCitation
} from '../api/types';
import { AnswerMap } from '../quiz/answerModel';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Whether the backend answers; shown as a dot next to the student name. */
export type ConnectionState = 'unknown' | 'ok' | 'error' | 'mock';

export type MainTab = 'concepts' | 'stats' | 'review' | 'quiz' | 'guide';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Set when the student cancelled mid-stream; the partial text is kept. */
  aborted?: boolean;
  /**
   * Lecture slides used for this answer, shown as a collapsed footnote. Kept outside
   * `content` so the citations are not resent as chat history.
   */
  slides?: SlideCitation[];
}

export interface ChatUiState {
  messages: ChatEntry[];
  scope: ChatScope | null;
  /** 'waiting' = request sent, nothing received yet. */
  phase: 'idle' | 'waiting' | 'streaming';
  error: UserFacingError | null;
  /** True if older messages were dropped to bound the resent history. */
  trimmed: boolean;
  /**
   * Identifies this conversation for the server's visit counter, which counts sessions
   * rather than messages. A new chat gets a new id.
   */
  sessionId: string;
}

export type QuizPhase =
  'idle' | 'generating' | 'answering' | 'submitting' | 'feedback';

export interface QuizUiState {
  phase: QuizPhase;
  conceptId: string;
  conceptName: string;
  quizId: string | null;
  questions: ClientQuestion[];
  answers: AnswerMap;
  /** Start of the generation, for the elapsed-time display. */
  startedAt: number | null;
  /**
   * Set before the submit request is sent. On a later 404 it distinguishes "already
   * graded" from "quiz expired".
   */
  submitAttempted: boolean;
  result: QuizSubmitResponse | null;
  error: UserFacingError | null;
  /** Candidate picker, shown when a non-concept scope had to be resolved. */
  candidates: QuizCandidate[] | null;
}

/**
 * One concept within a combined quiz. Each concept is a separate backend quiz with its
 * own `quizId` and grading.
 */
export interface BatchReviewItem {
  conceptId: string;
  conceptName: string;
  quizId: string | null;
  questions: ClientQuestion[];
  answers: AnswerMap;
  /** Set if generation failed; the item then has no questions. */
  genError: UserFacingError | null;
  /** Grading result, filled after submit. */
  result: QuizSubmitResponse | null;
  /** Set if this concept's submit failed. */
  submitError: UserFacingError | null;
}

export type BatchReviewPhase =
  'generating' | 'answering' | 'submitting' | 'feedback';

/**
 * A combined quiz spanning several concepts: all generated up front, answered on one
 * page and submitted together.
 */
export interface BatchReviewState {
  phase: BatchReviewPhase;
  items: BatchReviewItem[];
  /** Concepts whose generation has finished (success or failure). */
  generated: number;
  startedAt: number | null;
  error: UserFacingError | null;
  /** Heading: "Wiederholung" or the name of the selected tree node. */
  title: string;
  /**
   * Origin of the run, which decides its tab: `review` (due concepts) is shown under
   * "Wiederholung", `scope` (a chapter/topic/subtopic from the tree) under "Quiz".
   */
  origin: 'review' | 'scope';
}

/**
 * The guided tour while it is on screen; `null` otherwise. The offer ('ask') is
 * separate from the run, so declining changes nothing.
 */
export interface TourUiState {
  /** 'ask' = offer shown, 'running' = walking through the steps. */
  phase: 'ask' | 'running';
  /** Index into the step list; unused while asking. */
  step: number;
  /** Tab active when the tour started; restored at the end. */
  returnTab: MainTab;
}

export interface GraphitState {
  studentId: string;
  studentIdConfirmed: boolean;
  baseUrl: string;
  mockMode: boolean;
  /** Whether the sidebar may show the backend address and the connection test. */
  showDiagnostics: boolean;
  reviewSessionSize: number;

  tree: DomainNode[] | null;
  treeStatus: LoadStatus;
  treeError: UserFacingError | null;

  progress: ProgressResponse | null;
  progressStatus: LoadStatus;
  progressError: UserFacingError | null;
  progressFetchedAt: number | null;
  /** Local calendar date of the last fetch; mastery is computed against that day. */
  progressFetchedDate: string | null;

  connection: ConnectionState;

  selection: DomainNode | null;
  expanded: string[];
  filter: string;
  activeTab: MainTab;
  /** Width of the tree column in the concepts tab, in percent. */
  splitRatio: number;

  recommend: RecommendResponse | null;
  /** Days with learning activity, for the heatmap. */
  activity: ActivityDay[];
  /** Corpus-wide recommendation; loaded together with /progress. */
  nextSteps: NextStepsResponse | null;
  recommendStatus: LoadStatus;

  quiz: QuizUiState | null;
  batchQuiz: BatchReviewState | null;

  chat: ChatUiState;

  tour: TourUiState | null;
  /** True once the student declined permanently or finished the tour. */
  tourDismissed: boolean;
}

/**
 * Empty conversation template. Use freshChat() to start a chat, since every
 * conversation needs its own session id.
 */
export const EMPTY_CHAT: ChatUiState = {
  messages: [],
  scope: null,
  phase: 'idle',
  error: null,
  trimmed: false,
  sessionId: ''
};

/**
 * Creates a unique chat session id.
 * @returns: Timestamp plus random suffix
 */
export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Starts a new conversation with its own session id.
 * @param scope: Chat scope
 * @returns: The new chat state
 */
export function freshChat(scope: ChatScope | null): ChatUiState {
  return { ...EMPTY_CHAT, scope, sessionId: newSessionId() };
}
