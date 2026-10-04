/**
 * The single shared state container.
 *
 * A plain class without React: main and chat widget are separate React roots, so a
 * React context cannot span both. A store plus a Lumino Signal can, and it is also
 * reachable from command handlers.
 *
 * Every mutation replaces the top-level snapshot, so useSyncExternalStore receives a
 * referentially stable value between changes.
 */

import { ISignal, Signal } from '@lumino/signaling';

import { HttpGraphitClient, IGraphitClient } from '../api/client';
import { ApiError, userMessage } from '../api/errors';
import { DEFAULT_TIMEOUTS, Timeouts } from '../api/http';
import { MockGraphitClient } from '../api/mock/mockClient';
import {
  ChatScope,
  ClientQuestion,
  DomainNode,
  QuizCandidate,
  SlideCitation
} from '../api/types';
import { AnswerState, buildPayload, initAnswers } from '../quiz/answerModel';
import {
  isQuizStale,
  KEY_CHAT,
  KEY_QUIZ,
  KEY_TOUR,
  KEY_UI,
  PersistedChat,
  PersistedQuiz,
  PersistedTour,
  PersistedUi,
  Persistence,
  trimHistory
} from './persistence';
import {
  accordionExpanded,
  ancestorIds,
  collectConcepts,
  collectTopicIds,
  findNode
} from './selectors';
import { TOUR_STEPS } from '../tour/steps';
import {
  BatchReviewItem,
  BatchReviewState,
  ChatEntry,
  EMPTY_CHAT,
  MainTab,
  GraphitState,
  QuizUiState,
  freshChat,
  newSessionId
} from './types';

export interface StoreConfig {
  baseUrl: string;
  studentId: string;
  mockMode: boolean;
  streaming: boolean;
  chatModel: string;
  reviewSessionSize: number;
  persistChatHistory: boolean;
  showDiagnostics: boolean;
  timeouts: Timeouts;
  mock: {
    quizStartDelayMs: number;
    chatFirstChunkMs: number;
    failureRate: number;
  };
}

export const DEFAULT_CONFIG: StoreConfig = {
  baseUrl: 'http://127.0.0.1:8077',
  studentId: '',
  mockMode: false,
  streaming: true,
  chatModel: 'graphit-tutor',
  reviewSessionSize: 5,
  // Off by default: a chat ends when it is closed; a stored transcript would be resent
  // to the stateless server on the next opening.
  persistChatHistory: false,
  showDiagnostics: false,
  timeouts: DEFAULT_TIMEOUTS,
  mock: { quizStartDelayMs: 800, chatFirstChunkMs: 3000, failureRate: 0 }
};

/** /progress is only refetched when older than this, unless forced. */
const PROGRESS_STALE_MS = 60_000;

/** Default tree column width in percent. */
export const DEFAULT_SPLIT_RATIO = 45;

/** Number of concepts proposed above the tree (matches the server default). */
export const NEXT_STEPS_LIMIT = 5;

/**
 * Keeps the divider in a usable range: below ~25 % the tree shows only ellipses, above
 * ~75 % the detail panel wraps every line.
 * @param value: Requested width in percent
 * @returns: The clamped, rounded width
 */
export function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPLIT_RATIO;
  }
  return Math.min(75, Math.max(25, Math.round(value)));
}

/**
 * Creates the initial state snapshot.
 * @param cfg: Store configuration
 * @returns: The initial state
 */
function initialState(cfg: StoreConfig): GraphitState {
  return {
    studentId: cfg.studentId,
    studentIdConfirmed: cfg.studentId.length > 0,
    baseUrl: cfg.baseUrl,
    mockMode: cfg.mockMode,
    showDiagnostics: cfg.showDiagnostics,
    reviewSessionSize: cfg.reviewSessionSize,
    tree: null,
    treeStatus: 'idle',
    treeError: null,
    progress: null,
    progressStatus: 'idle',
    progressError: null,
    progressFetchedAt: null,
    progressFetchedDate: null,
    connection: cfg.mockMode ? 'mock' : 'unknown',
    selection: null,
    expanded: [],
    filter: '',
    activeTab: 'concepts',
    splitRatio: DEFAULT_SPLIT_RATIO,
    recommend: null,
    recommendStatus: 'idle',
    nextSteps: null,
    activity: [],
    quiz: null,
    batchQuiz: null,
    chat: EMPTY_CHAT,
    tour: null,
    tourDismissed: false
  };
}

export class GraphitStore {
  private _state: GraphitState;
  private _client: IGraphitClient;
  private _cfg: StoreConfig;
  private readonly _changed = new Signal<this, GraphitState>(this);
  private readonly persistence: Persistence;

  /** Coalesces bursts of refresh triggers into one request. */
  private progressInFlight: Promise<void> | null = null;
  private treeInFlight: Promise<void> | null = null;

  private chatAbort: AbortController | null = null;
  private quizAbort: AbortController | null = null;
  private batchAbort: AbortController | null = null;
  private recommendAbort: AbortController | null = null;
  private readonly recommendCache = new Map<
    string,
    GraphitState['recommend']
  >();

  // The tour offer depends on three flags because the widget can request it before or
  // after restore() has read the stored decision.
  /** True once restore() has read the stored decision. */
  private tourRestored = false;
  /** True once a widget has asked for the tour to be offered. */
  private tourWanted = false;
  /** True once the offer was shown in this browser session (at most once). */
  private tourOffered = false;

  /**
   * Creates the store.
   * @param cfg: Store configuration
   * @param persistence: State database wrapper
   */
  constructor(cfg: StoreConfig, persistence: Persistence) {
    this._cfg = cfg;
    this._state = initialState(cfg);
    this._client = buildClient(cfg);
    this.persistence = persistence;
  }

  /**
   * Current state snapshot.
   * @returns: The state
   */
  get state(): GraphitState {
    return this._state;
  }

  /**
   * Signal emitted after every state change.
   * @returns: The change signal
   */
  get changed(): ISignal<this, GraphitState> {
    return this._changed;
  }

  /**
   * Active backend client (HTTP or mock).
   * @returns: The client
   */
  get client(): IGraphitClient {
    return this._client;
  }

  /**
   * Current configuration.
   * @returns: The store configuration
   */
  get config(): StoreConfig {
    return this._cfg;
  }

  /**
   * Aborts all requests and disconnects all listeners.
   */
  dispose(): void {
    this.chatAbort?.abort();
    this.quizAbort?.abort();
    this.batchAbort?.abort();
    this.recommendAbort?.abort();
    this.persistence.dispose();
    Signal.clearData(this);
  }

  /**
   * Applies new settings. A change of identity or data source invalidates all caches
   * and reloads tree and progress.
   * @param cfg: New configuration
   */
  applyConfig(cfg: StoreConfig): void {
    const dataSourceChanged =
      cfg.baseUrl !== this._cfg.baseUrl ||
      cfg.mockMode !== this._cfg.mockMode ||
      cfg.studentId !== this._cfg.studentId;

    this._cfg = cfg;
    this._client = buildClient(cfg);

    if (dataSourceChanged) {
      this.chatAbort?.abort();
      this.quizAbort?.abort();
      this.batchAbort?.abort();
      this.recommendAbort?.abort();
      this.progressInFlight = null;
      this.treeInFlight = null;
      this.recommendCache.clear();
      this.patch({
        studentId: cfg.studentId,
        studentIdConfirmed: cfg.studentId.length > 0,
        baseUrl: cfg.baseUrl,
        mockMode: cfg.mockMode,
        showDiagnostics: cfg.showDiagnostics,
        reviewSessionSize: cfg.reviewSessionSize,
        connection: cfg.mockMode ? 'mock' : 'unknown',
        tree: null,
        treeStatus: 'idle',
        treeError: null,
        progress: null,
        progressStatus: 'idle',
        progressError: null,
        progressFetchedAt: null,
        progressFetchedDate: null,
        recommend: null,
        recommendStatus: 'idle',
        activity: [],
        nextSteps: null,
        quiz: null,
        batchQuiz: null
      });
      void this.refreshTree();
      void this.refreshProgress({ force: true });
    } else {
      this.patch({ reviewSessionSize: cfg.reviewSessionSize });
    }
  }

  /**
   * Sets the student id and reloads all data for it.
   * @param studentId: New student id
   */
  setStudentId(studentId: string): void {
    this.applyConfig({ ...this._cfg, studentId });
    this.patch({ studentIdConfirmed: studentId.length > 0 });
  }

  /**
   * Restores persisted UI, chat, quiz and tour state. Call once at activation.
   */
  async restore(): Promise<void> {
    const [ui, chat, quiz, tour] = await Promise.all([
      this.persistence.load<PersistedUi>(KEY_UI),
      this._cfg.persistChatHistory
        ? this.persistence.load<PersistedChat>(KEY_CHAT)
        : Promise.resolve(null),
      this.persistence.load<PersistedQuiz>(KEY_QUIZ),
      this.persistence.load<PersistedTour>(KEY_TOUR)
    ]);

    if (tour?.dismissed) {
      this.patch({ tourDismissed: true });
    }

    if (ui) {
      this.patch({
        expanded: ui.expanded ?? [],
        activeTab: ui.activeTab ?? 'concepts',
        splitRatio: clampSplitRatio(ui.splitRatio ?? DEFAULT_SPLIT_RATIO)
      });
    }
    if (chat?.messages?.length) {
      // A restored transcript continues the conversation and keeps its session id, so
      // the visit is not counted twice.
      const { messages, trimmed } = trimHistory(chat.messages);
      this.patch({
        chat: {
          ...EMPTY_CHAT,
          messages,
          scope: chat.scope ?? null,
          trimmed,
          sessionId: chat.sessionId ?? newSessionId()
        }
      });
    }
    if (quiz) {
      await this.restoreQuiz(quiz);
    }

    // Last, so a pending tour offer sees the restored decision.
    this.tourRestored = true;
    this.maybeOfferTour();
  }

  /**
   * Restores a persisted single-concept quiz. The questions stay valid server-side under
   * the quiz_id, so answering can continue after a reload.
   * @param persisted: Persisted quiz
   */
  private async restoreQuiz(persisted: PersistedQuiz): Promise<void> {
    if (isQuizStale(persisted.startedAt)) {
      await this.persistence.remove(KEY_QUIZ);
      return;
    }

    if (persisted.submitAttempted) {
      // The submit was already sent and quiz_id is single-use, so resubmitting would
      // fail. Reload progress instead and tell the student.
      await this.persistence.remove(KEY_QUIZ);
      this.patch({
        quiz: {
          phase: 'idle',
          conceptId: persisted.conceptId,
          conceptName: persisted.conceptName,
          quizId: null,
          questions: [],
          answers: {},
          startedAt: null,
          submitAttempted: true,
          result: null,
          candidates: null,
          error: {
            title: 'Antworten vermutlich gewertet',
            body: 'Die Abgabe war bereits unterwegs, als die Seite neu geladen wurde. Dein Stand wurde frisch geladen.',
            benign: true,
            canRetry: false
          }
        }
      });
      void this.refreshProgress({ force: true });
      return;
    }

    this.patch({
      quiz: {
        phase: 'answering',
        conceptId: persisted.conceptId,
        conceptName: persisted.conceptName,
        quizId: persisted.quizId,
        questions: persisted.questions,
        answers: persisted.answers,
        startedAt: persisted.startedAt,
        submitAttempted: false,
        result: null,
        error: null,
        candidates: null
      }
    });
  }

  /**
   * Loads the domain tree, once per session unless forced.
   * @param force: Reload even if a tree is present
   */
  async refreshTree(force = false): Promise<void> {
    if (!force && (this._state.tree !== null || this.treeInFlight)) {
      return this.treeInFlight ?? Promise.resolve();
    }
    this.patch({ treeStatus: 'loading', treeError: null });

    this.treeInFlight = (async () => {
      try {
        const res = await this._client.getDomainTree();
        const tree = res.tree ?? [];
        this.patch({
          tree,
          treeStatus: 'ready',
          // Expand only the roots so the chapter list is visible.
          expanded:
            this._state.expanded.length > 0
              ? this._state.expanded
              : tree.map(root => root.id),
          connection: this._cfg.mockMode ? 'mock' : 'ok'
        });
      } catch (err) {
        this.patch({
          treeStatus: 'error',
          treeError: userMessage(err, {
            baseUrl: this._cfg.baseUrl,
            showDiagnostics: this._cfg.showDiagnostics
          }),
          connection: this._cfg.mockMode ? 'mock' : 'error'
        });
      } finally {
        this.treeInFlight = null;
      }
    })();

    return this.treeInFlight;
  }

  /**
   * Reloads progress if stale. Also stale on a new calendar day, since mastery decays
   * against the current date. Activity and next steps are reloaded alongside.
   * @param opts: `force` reloads regardless of age
   */
  async refreshProgress(opts: { force?: boolean } = {}): Promise<void> {
    const s = this._state;
    const today = localDateKey();
    const stale =
      s.progressFetchedAt === null ||
      Date.now() - s.progressFetchedAt > PROGRESS_STALE_MS ||
      s.progressFetchedDate !== today;

    if (!opts.force && !stale) {
      return;
    }
    if (this.progressInFlight) {
      return this.progressInFlight;
    }

    this.patch({
      progressStatus: s.progress ? 'ready' : 'loading',
      progressError: null
    });

    void this.refreshActivity();
    void this.refreshNextSteps();

    this.progressInFlight = (async () => {
      try {
        const progress = await this._client.getProgress();
        this.patch({
          progress,
          progressStatus: 'ready',
          progressFetchedAt: Date.now(),
          progressFetchedDate: localDateKey(),
          connection: this._cfg.mockMode ? 'mock' : 'ok'
        });
      } catch (err) {
        this.patch({
          progressStatus: 'error',
          progressError: userMessage(err, {
            baseUrl: this._cfg.baseUrl,
            showDiagnostics: this._cfg.showDiagnostics
          }),
          connection: this._cfg.mockMode ? 'mock' : 'error'
        });
      } finally {
        this.progressInFlight = null;
      }
    })();

    return this.progressInFlight;
  }

  /**
   * Probes the backend and updates the connection state.
   * @returns: True if the backend answered
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this._client.health();
      this.patch({ connection: this._cfg.mockMode ? 'mock' : 'ok' });
      return true;
    } catch (err) {
      this.patch({
        connection: this._cfg.mockMode ? 'mock' : 'error',
        progressError: userMessage(err, {
          baseUrl: this._cfg.baseUrl,
          showDiagnostics: this._cfg.showDiagnostics
        })
      });
      return false;
    }
  }

  /**
   * Selects a tree node and loads its learning path if it is a concept.
   * @param node: Node to select, or null
   */
  setSelection(node: DomainNode | null): void {
    this.patch({ selection: node, recommend: null, recommendStatus: 'idle' });
    this.persistUi();
    if (node?.type === 'concept') {
      void this.loadRecommend(node.id);
    }
  }

  /**
   * Selects a node by id and expands its ancestors, closing other chapters.
   * @param id: Node id
   * @returns: The selected node, or null if unknown
   */
  selectById(id: string): DomainNode | null {
    const node = findNode(this._state.tree, id);
    if (node) {
      const ancestors = ancestorIds(this._state.tree, id);
      this.patch({
        expanded: accordionExpanded(
          this._state.tree,
          unique([...this._state.expanded, ...ancestors]),
          [id, ...ancestors]
        )
      });
      this.setSelection(node);
    }
    return node;
  }

  /**
   * Loads the learning path of a concept, cached per concept. Called per selection,
   * never per rendered row (the endpoint runs two Neo4j queries).
   * @param conceptId: Selected concept
   */
  private async loadRecommend(conceptId: string): Promise<void> {
    const cached = this.recommendCache.get(conceptId);
    if (cached) {
      this.patch({ recommend: cached, recommendStatus: 'ready' });
      return;
    }
    this.recommendAbort?.abort();
    const controller = new AbortController();
    this.recommendAbort = controller;

    this.patch({ recommendStatus: 'loading' });
    try {
      const res = await this._client.getRecommend(conceptId, controller.signal);
      this.recommendCache.set(conceptId, res);
      if (this._state.selection?.id === conceptId) {
        this.patch({ recommend: res, recommendStatus: 'ready' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.isAbort) {
        return;
      }
      // Only logged; a missing learning path does not warrant an error banner.
      userMessage(err, {
        baseUrl: this._cfg.baseUrl,
        showDiagnostics: this._cfg.showDiagnostics
      });
      if (this._state.selection?.id === conceptId) {
        this.patch({ recommend: null, recommendStatus: 'error' });
      }
    }
  }

  /**
   * Replaces the set of expanded tree nodes.
   * @param expanded: Expanded node ids
   */
  setExpanded(expanded: string[]): void {
    this.patch({ expanded });
    this.persistUi();
  }

  /**
   * Opens or closes a tree node. Opening applies the accordion rule; closing touches
   * nothing else.
   * @param id: Node id
   */
  toggleExpanded(id: string): void {
    const set = new Set(this._state.expanded);
    if (set.has(id)) {
      set.delete(id);
      this.setExpanded([...set]);
      return;
    }
    set.add(id);
    this.setExpanded(
      accordionExpanded(this._state.tree, set, [
        id,
        ...ancestorIds(this._state.tree, id)
      ])
    );
  }

  /**
   * Sets the tree filter text.
   * @param filter: Filter text
   */
  setFilter(filter: string): void {
    this.patch({ filter });
  }

  /**
   * Loads the activity history for the heatmap. Failures are ignored; an empty history
   * renders as an empty calendar.
   */
  async refreshActivity(): Promise<void> {
    try {
      const res = await this._client.getActivity();
      this.patch({ activity: res.days });
    } catch {
      // Ignored, see above.
    }
  }

  /**
   * Loads the next-step recommendation shown above the tree. Failures are ignored; the
   * tree below offers the same concepts.
   */
  async refreshNextSteps(): Promise<void> {
    try {
      const nextSteps = await this._client.getNextSteps(NEXT_STEPS_LIMIT);
      this.patch({ nextSteps });
    } catch {
      // Ignored, see above.
    }
  }

  /**
   * Switches the main tab.
   * @param activeTab: Tab to show
   */
  setActiveTab(activeTab: MainTab): void {
    this.patch({ activeTab });
    this.persistUi();
  }

  /**
   * Signals that the main view is visible, so the tour may be offered. Idempotent; the
   * decision is made in maybeOfferTour().
   */
  offerTour(): void {
    this.tourWanted = true;
    this.maybeOfferTour();
  }

  /**
   * Starts the tour at the first step.
   * @param dontAskAgain: Checkbox of the offer; honoured even when accepting
   */
  startTour(dontAskAgain = false): void {
    this.tourOffered = true;
    if (dontAskAgain) {
      this.rememberTourDismissed();
    }
    const returnTab = this._state.tour?.returnTab ?? this._state.activeTab;
    this.patch({ tour: { phase: 'running', step: 0, returnTab } });
    this.applyTourTab(0);
  }

  /**
   * Declines the tour offer without changing anything else.
   * @param dontAskAgain: Never offer again
   */
  declineTour(dontAskAgain = false): void {
    this.tourOffered = true;
    if (dontAskAgain) {
      this.rememberTourDismissed();
    }
    this.patch({ tour: null });
  }

  /**
   * Advances the tour, ending it after the last step.
   */
  tourNext(): void {
    const tour = this._state.tour;
    if (!tour || tour.phase !== 'running') {
      return;
    }
    if (tour.step >= TOUR_STEPS.length - 1) {
      this.endTour(true);
      return;
    }
    const step = tour.step + 1;
    this.patch({ tour: { ...tour, step } });
    this.applyTourTab(step);
  }

  /**
   * Goes back one tour step; no-op on the first step.
   */
  tourBack(): void {
    const tour = this._state.tour;
    if (!tour || tour.phase !== 'running' || tour.step === 0) {
      return;
    }
    const step = tour.step - 1;
    this.patch({ tour: { ...tour, step } });
    this.applyTourTab(step);
  }

  /**
   * Closes the tour and returns to the original tab.
   * @param completed: True if the last step was reached; only then the offer is not
   *   shown again
   */
  endTour(completed = false): void {
    const tour = this._state.tour;
    if (!tour) {
      return;
    }
    this.patch({ tour: null });
    if (tour.phase === 'running' && tour.returnTab !== this._state.activeTab) {
      this.setActiveTab(tour.returnTab);
    }
    if (completed) {
      this.rememberTourDismissed();
    }
  }

  /**
   * Shows the tour offer once all preconditions hold. Never during a running quiz.
   */
  private maybeOfferTour(): void {
    if (!this.tourWanted || !this.tourRestored || this.tourOffered) {
      return;
    }
    if (this._state.tourDismissed || this._state.tour) {
      return;
    }
    if (this._state.quiz || this._state.batchQuiz) {
      return;
    }
    this.tourOffered = true;
    this.patch({
      tour: { phase: 'ask', step: 0, returnTab: this._state.activeTab }
    });
  }

  /**
   * Switches to the tab a tour step refers to, if any.
   * @param index: Step index
   */
  private applyTourTab(index: number): void {
    const tab = TOUR_STEPS[index]?.tab;
    if (tab && tab !== this._state.activeTab) {
      this.setActiveTab(tab);
    }
  }

  /**
   * Persists that the tour should not be offered again.
   */
  private rememberTourDismissed(): void {
    if (this._state.tourDismissed) {
      return;
    }
    this.patch({ tourDismissed: true });
    const payload: PersistedTour = { dismissed: true };
    this.persistence.save(KEY_TOUR, payload);
  }

  /**
   * Moves the divider between tree and detail panel. Clamped, since pointer positions
   * routinely leave the valid range while dragging.
   * @param splitRatio: Tree column width in percent
   */
  setSplitRatio(splitRatio: number): void {
    const next = clampSplitRatio(splitRatio);
    if (next === this._state.splitRatio) {
      return;
    }
    this.patch({ splitRatio: next });
    this.persistUi();
  }

  /**
   * Resolves a selection into testable concepts. /quiz/candidates only accepts
   * concept_id or topic_id, so other levels are walked locally first.
   * @param node: Selected node
   * @returns: The candidate concepts
   */
  async resolveQuizScope(node: DomainNode): Promise<QuizCandidate[]> {
    if (node.type === 'concept') {
      return [{ id: node.id, name: node.name }];
    }
    if (node.type === 'subtopic') {
      const concepts = collectConcepts(node);
      return concepts.map(c => ({ id: c.id, name: c.name }));
    }
    if (node.type === 'topic') {
      const res = await this._client.quizCandidates({ topic_id: node.id });
      return res.candidates;
    }
    // Chapter or lecture: one call per contained topic, deduplicated.
    const topicIds = collectTopicIds(node);
    const seen = new Map<string, QuizCandidate>();
    for (const topicId of topicIds) {
      const res = await this._client.quizCandidates({ topic_id: topicId });
      for (const candidate of res.candidates) {
        if (!seen.has(candidate.id)) {
          seen.set(candidate.id, candidate);
        }
      }
    }
    return [...seen.values()];
  }

  /**
   * Opens the quiz tab with a candidate picker.
   * @param candidates: Concepts to choose from
   * @param conceptName: Name of the selected scope
   */
  showCandidates(candidates: QuizCandidate[], conceptName: string): void {
    this.patch({
      activeTab: 'quiz',
      quiz: {
        phase: 'idle',
        conceptId: '',
        conceptName,
        quizId: null,
        questions: [],
        answers: {},
        startedAt: null,
        submitAttempted: false,
        result: null,
        error: null,
        candidates
      }
    });
  }

  /**
   * Starts a single-concept quiz. Slow (LLM pipeline); never retried or prefetched.
   * @param conceptId: Concept to quiz
   * @param conceptName: Display name; looked up in the tree if omitted
   */
  async startQuiz(conceptId: string, conceptName?: string): Promise<void> {
    this.quizAbort?.abort();
    const controller = new AbortController();
    this.quizAbort = controller;

    const name =
      conceptName ?? findNode(this._state.tree, conceptId)?.name ?? conceptId;

    this.patch({
      activeTab: 'quiz',
      quiz: {
        phase: 'generating',
        conceptId,
        conceptName: name,
        quizId: null,
        questions: [],
        answers: {},
        startedAt: Date.now(),
        submitAttempted: false,
        result: null,
        error: null,
        candidates: null
      }
    });

    try {
      const quiz = await this._client.quizStart(conceptId, controller.signal);
      const answers = initAnswers(quiz.questions);
      this.patchQuiz({
        phase: 'answering',
        quizId: quiz.quiz_id,
        questions: quiz.questions,
        answers
      });
      this.persistQuiz();
    } catch (err) {
      if (err instanceof ApiError && err.isAbort) {
        this.patch({ quiz: null });
        return;
      }
      this.patchQuiz({
        phase: 'idle',
        error: userMessage(err, {
          baseUrl: this._cfg.baseUrl,
          showDiagnostics: this._cfg.showDiagnostics
        })
      });
    }
  }

  /**
   * Aborts a running quiz generation.
   */
  cancelQuizGeneration(): void {
    this.quizAbort?.abort();
    this.quizAbort = null;
  }

  /**
   * Stores the answer to a question of the single-concept quiz.
   * @param questionId: Question id
   * @param answer: New answer state
   */
  setAnswer(questionId: string, answer: AnswerState): void {
    const quiz = this._state.quiz;
    if (!quiz) {
      return;
    }
    this.patchQuiz({ answers: { ...quiz.answers, [questionId]: answer } });
    this.persistQuiz(500);
  }

  /**
   * Submits the single-concept quiz and reloads progress.
   */
  async submitQuiz(): Promise<void> {
    const quiz = this._state.quiz;
    if (!quiz?.quizId || quiz.phase === 'submitting') {
      return;
    }

    const answers = buildPayload(quiz.questions, quiz.answers);

    // Persisted before the request: after a reload or network drop this flag prevents
    // a resubmit of the single-use quiz_id.
    this.patchQuiz({ phase: 'submitting', submitAttempted: true, error: null });
    await this.persistQuizNow();

    try {
      const result = await this._client.quizSubmit({
        quiz_id: quiz.quizId,
        answers
      });
      this.patchQuiz({ phase: 'feedback', result, error: null });
      await this.persistence.remove(KEY_QUIZ);
      this.recommendCache.clear();
      await this.refreshProgress({ force: true });
    } catch (err) {
      const message = userMessage(err, {
        baseUrl: this._cfg.baseUrl,
        submitAttempted: true
      });
      this.patchQuiz({
        phase: message.benign ? 'idle' : 'answering',
        error: message
      });
      if (message.benign) {
        // "Probably graded": reload instead of showing a failure.
        await this.persistence.remove(KEY_QUIZ);
        await this.refreshProgress({ force: true });
      }
    }
  }

  /**
   * Ends the quiz. The quiz tab only exists while a quiz does, so it is left if it is
   * in front; otherwise the active tab stays.
   */
  clearQuiz(): void {
    this.quizAbort?.abort();
    this.patch({
      quiz: null,
      activeTab:
        this._state.activeTab === 'quiz' ? 'concepts' : this._state.activeTab
    });
    this.persistUi();
    void this.persistence.remove(KEY_QUIZ);
  }

  /**
   * Starts a combined quiz over several concepts. Each concept is a separate backend
   * quiz; they are generated strictly one after another before the page is shown. A
   * failed generation is recorded and skipped.
   * @param concepts: Concepts to include
   * @param opts: Heading and origin (`review` or `scope`) of the run
   */
  async startBatchReview(
    concepts: Array<{ id: string; name: string }>,
    opts: { title?: string; origin?: 'review' | 'scope' } = {}
  ): Promise<void> {
    if (concepts.length === 0) {
      return;
    }
    const origin = opts.origin ?? 'review';
    const title = opts.title ?? 'Wiederholung';
    this.batchAbort?.abort();
    const controller = new AbortController();
    this.batchAbort = controller;

    const items: BatchReviewItem[] = concepts.map(c => ({
      conceptId: c.id,
      conceptName: c.name,
      quizId: null,
      questions: [],
      answers: {},
      genError: null,
      result: null,
      submitError: null
    }));

    this.patch({
      // A scope run is a quiz, not a review, and lives in the quiz tab.
      activeTab: origin === 'scope' ? 'quiz' : 'review',
      quiz: null,
      batchQuiz: {
        phase: 'generating',
        items,
        generated: 0,
        startedAt: Date.now(),
        error: null,
        title,
        origin
      }
    });

    for (let i = 0; i < items.length; i++) {
      if (controller.signal.aborted) {
        return;
      }
      try {
        const quiz = await this._client.quizStart(
          items[i].conceptId,
          controller.signal
        );
        this.patchBatchItem(i, {
          quizId: quiz.quiz_id,
          questions: quiz.questions,
          answers: initAnswers(quiz.questions)
        });
      } catch (err) {
        if (err instanceof ApiError && err.isAbort) {
          return;
        }
        this.patchBatchItem(i, {
          genError: userMessage(err, {
            baseUrl: this._cfg.baseUrl,
            showDiagnostics: this._cfg.showDiagnostics
          })
        });
      }
      this.patchBatch({ generated: i + 1 });
    }

    if (controller.signal.aborted) {
      return;
    }
    const anyReady = (this._state.batchQuiz?.items ?? []).some(
      it => it.questions.length > 0
    );
    this.patchBatch({
      phase: 'answering',
      error: anyReady
        ? null
        : {
            title: 'Keine Fragen erzeugt',
            body: 'Für keines der Konzepte konnten Fragen erstellt werden. Bitte später erneut versuchen.',
            benign: false,
            canRetry: true
          }
    });
  }

  /**
   * Stores the answer to a question of the combined quiz.
   * @param index: Item index
   * @param questionId: Question id
   * @param answer: New answer state
   */
  setBatchAnswer(index: number, questionId: string, answer: AnswerState): void {
    const bq = this._state.batchQuiz;
    if (!bq || index < 0 || index >= bq.items.length) {
      return;
    }
    const items = bq.items.map((it, i) =>
      i === index
        ? { ...it, answers: { ...it.answers, [questionId]: answer } }
        : it
    );
    this.patch({ batchQuiz: { ...bq, items } });
  }

  /**
   * Submits every concept of the combined quiz separately, then reloads progress once.
   * The 'submitting' phase guards against double submission.
   */
  async submitBatchReview(): Promise<void> {
    const bq = this._state.batchQuiz;
    if (!bq || bq.phase === 'submitting' || bq.phase === 'feedback') {
      return;
    }
    this.patchBatch({ phase: 'submitting', error: null });

    const items = bq.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.quizId) {
        // Generation failed earlier; nothing to grade.
        continue;
      }
      try {
        const result = await this._client.quizSubmit({
          quiz_id: it.quizId,
          answers: buildPayload(it.questions, it.answers)
        });
        this.patchBatchItem(i, { result, submitError: null });
      } catch (err) {
        this.patchBatchItem(i, {
          submitError: userMessage(err, {
            baseUrl: this._cfg.baseUrl,
            submitAttempted: true
          })
        });
      }
    }

    this.recommendCache.clear();
    await this.refreshProgress({ force: true });
    this.patchBatch({ phase: 'feedback' });
  }

  /**
   * Aborts any running generation and ends the combined quiz, leaving the quiz tab if
   * it is in front (see clearQuiz()).
   */
  clearBatchReview(): void {
    this.batchAbort?.abort();
    this.batchAbort = null;
    this.patch({
      batchQuiz: null,
      activeTab:
        this._state.activeTab === 'quiz' ? 'concepts' : this._state.activeTab
    });
    this.persistUi();
  }

  /**
   * Updates fields of the combined quiz.
   * @param partial: Fields to change
   */
  private patchBatch(partial: Partial<BatchReviewState>): void {
    if (!this._state.batchQuiz) {
      return;
    }
    this.patch({ batchQuiz: { ...this._state.batchQuiz, ...partial } });
  }

  /**
   * Updates fields of one item of the combined quiz.
   * @param index: Item index
   * @param partial: Fields to change
   */
  private patchBatchItem(
    index: number,
    partial: Partial<BatchReviewItem>
  ): void {
    const bq = this._state.batchQuiz;
    if (!bq) {
      return;
    }
    const items = bq.items.map((it, i) =>
      i === index ? { ...it, ...partial } : it
    );
    this.patch({ batchQuiz: { ...bq, items } });
  }

  /**
   * Sets the chat topic. A different topic (compared by id) starts a new conversation,
   * because the stateless server would otherwise keep answering from the old history.
   * @param scope: New chat scope
   */
  setChatScope(scope: ChatScope | null): void {
    const currentId = this._state.chat.scope?.id ?? null;
    if ((scope?.id ?? null) === currentId) {
      this.patch({ chat: { ...this._state.chat, scope } });
      this.persistChat();
      return;
    }

    // A running stream belongs to the old topic.
    this.abortChat();
    this.patch({ chat: freshChat(scope) });
    void this.persistence.remove(KEY_CHAT);
  }

  /**
   * Dismisses the chat error banner.
   */
  clearChatError(): void {
    this.patch({ chat: { ...this._state.chat, error: null } });
  }

  /**
   * Ends the conversation: clears the history in memory and storage and creates a new
   * session id. Called when the chat widget closes.
   */
  clearChat(): void {
    this.abortChat();
    this.patch({ chat: freshChat(this._state.chat.scope) });
    void this.persistence.remove(KEY_CHAT);
  }

  /**
   * Aborts the running chat request.
   */
  abortChat(): void {
    this.chatAbort?.abort();
    this.chatAbort = null;
  }

  /**
   * Sends one chat turn with the full history (the server is stateless).
   * @param text: Message text
   */
  async sendChat(text: string): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText || this._state.chat.phase !== 'idle') {
      return;
    }

    const userEntry: ChatEntry = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmedText
    };
    const assistantId = `a-${Date.now()}`;
    const history = [...this._state.chat.messages, userEntry];
    // The initial state has no session id yet.
    const sessionId = this._state.chat.sessionId || newSessionId();

    this.patch({
      chat: {
        ...this._state.chat,
        messages: [
          ...history,
          { id: assistantId, role: 'assistant', content: '' }
        ],
        phase: 'waiting',
        error: null,
        sessionId
      }
    });

    const controller = new AbortController();
    this.chatAbort = controller;
    let buffer = '';
    let flushHandle: number | null = null;

    // Deltas are batched so that a burst of chunks does not cause one render per word.
    const flush = () => {
      flushHandle = null;
      if (!buffer) {
        return;
      }
      const chunk = buffer;
      buffer = '';
      this.appendAssistant(assistantId, chunk);
    };
    const schedule = () => {
      if (flushHandle === null) {
        flushHandle = window.setTimeout(flush, 40);
      }
    };

    try {
      await this._client.chat(
        {
          messages: history.map(m => ({ role: m.role, content: m.content })),
          scope: this._state.chat.scope ?? undefined,
          session_id: sessionId
        },
        {
          onFirstChunk: () => {
            this.patch({ chat: { ...this._state.chat, phase: 'streaming' } });
          },
          onDelta: delta => {
            buffer += delta;
            schedule();
          },
          onSlides: slides => {
            // Flush first so the text appears before its footnote.
            flush();
            this.setAssistantSlides(assistantId, slides);
          },
          onDone: () => {
            if (flushHandle !== null) {
              window.clearTimeout(flushHandle);
            }
            flush();
          }
        },
        controller.signal
      );

      this.patch({ chat: { ...this._state.chat, phase: 'idle' } });
      // The tutor raises visited_count, so progress is now stale.
      void this.refreshProgress({ force: true });
    } catch (err) {
      if (flushHandle !== null) {
        window.clearTimeout(flushHandle);
      }
      flush();

      if (err instanceof ApiError && err.isAbort) {
        // Keep the partial text and mark it as aborted.
        this.patch({
          chat: {
            ...this._state.chat,
            phase: 'idle',
            messages: this._state.chat.messages.map(m =>
              m.id === assistantId ? { ...m, aborted: true } : m
            )
          }
        });
      } else {
        this.patch({
          chat: {
            ...this._state.chat,
            phase: 'idle',
            error: userMessage(err, {
              baseUrl: this._cfg.baseUrl,
              showDiagnostics: this._cfg.showDiagnostics
            }),
            // Drop the empty placeholder bubble.
            messages: this._state.chat.messages.filter(
              m => m.id !== assistantId || m.content.length > 0
            )
          }
        });
      }
    } finally {
      this.chatAbort = null;
      this.persistChat();
    }
  }

  /**
   * Appends streamed text to an assistant message.
   * @param id: Message id
   * @param delta: Text to append
   */
  private appendAssistant(id: string, delta: string): void {
    this.patch({
      chat: {
        ...this._state.chat,
        messages: this._state.chat.messages.map(m =>
          m.id === id ? { ...m, content: m.content + delta } : m
        )
      }
    });
  }

  /**
   * Attaches slide citations to an answer. A message dropped by a topic switch stays
   * dropped.
   * @param id: Message id
   * @param slides: Slide citations
   */
  private setAssistantSlides(id: string, slides: SlideCitation[]): void {
    this.patch({
      chat: {
        ...this._state.chat,
        messages: this._state.chat.messages.map(m =>
          m.id === id ? { ...m, slides } : m
        )
      }
    });
  }

  /**
   * Persists the chat (debounced) if chat persistence is enabled, trimming the history
   * first.
   */
  persistChat(): void {
    if (!this._cfg.persistChatHistory) {
      return;
    }
    const { messages, trimmed } = trimHistory(this._state.chat.messages);
    if (trimmed && messages.length !== this._state.chat.messages.length) {
      this.patch({ chat: { ...this._state.chat, messages, trimmed } });
    }
    const payload: PersistedChat = {
      messages,
      scope: this._state.chat.scope,
      updatedAt: Date.now(),
      sessionId: this._state.chat.sessionId
    };
    this.persistence.save(KEY_CHAT, payload, 1000);
  }

  /**
   * Writes the chat immediately if chat persistence is enabled.
   */
  async flushChat(): Promise<void> {
    if (!this._cfg.persistChatHistory) {
      return;
    }
    const payload: PersistedChat = {
      messages: this._state.chat.messages,
      scope: this._state.chat.scope,
      updatedAt: Date.now(),
      sessionId: this._state.chat.sessionId
    };
    await this.persistence.flush(KEY_CHAT, payload);
  }

  /**
   * Persists tree expansion, tab, selection and splitter (debounced).
   */
  private persistUi(): void {
    const payload: PersistedUi = {
      expanded: this._state.expanded,
      activeTab: this._state.activeTab,
      selectionId: this._state.selection?.id ?? null,
      splitRatio: this._state.splitRatio
    };
    this.persistence.save(KEY_UI, payload, 1000);
  }

  /**
   * Persists the single-concept quiz.
   * @param debounceMs: Debounce delay
   */
  private persistQuiz(debounceMs = 0): void {
    const payload = this.quizPayload();
    if (payload) {
      this.persistence.save(KEY_QUIZ, payload, debounceMs);
    }
  }

  /**
   * Persists the single-concept quiz immediately.
   */
  private async persistQuizNow(): Promise<void> {
    const payload = this.quizPayload();
    if (payload) {
      await this.persistence.flush(KEY_QUIZ, payload);
    }
  }

  /**
   * Builds the persisted form of the current quiz.
   * @returns: The payload, or null if no quiz is running
   */
  private quizPayload(): PersistedQuiz | null {
    const quiz = this._state.quiz;
    if (!quiz?.quizId) {
      return null;
    }
    return {
      quizId: quiz.quizId,
      conceptId: quiz.conceptId,
      conceptName: quiz.conceptName,
      questions: quiz.questions as ClientQuestion[],
      answers: quiz.answers,
      startedAt: quiz.startedAt ?? Date.now(),
      submitAttempted: quiz.submitAttempted
    };
  }

  /**
   * Replaces the snapshot with updated fields and emits the change signal.
   * @param partial: Fields to change
   */
  private patch(partial: Partial<GraphitState>): void {
    this._state = { ...this._state, ...partial };
    this._changed.emit(this._state);
  }

  /**
   * Updates fields of the single-concept quiz.
   * @param partial: Fields to change
   */
  private patchQuiz(partial: Partial<QuizUiState>): void {
    if (!this._state.quiz) {
      return;
    }
    this.patch({ quiz: { ...this._state.quiz, ...partial } });
  }
}

/**
 * Creates the backend client for a configuration.
 * @param cfg: Store configuration
 * @returns: Mock client in mock mode, HTTP client otherwise
 */
function buildClient(cfg: StoreConfig): IGraphitClient {
  if (cfg.mockMode) {
    return new MockGraphitClient({
      studentId: cfg.studentId || 'demo',
      ...cfg.mock
    });
  }
  return new HttpGraphitClient({
    baseUrl: cfg.baseUrl,
    studentId: cfg.studentId,
    timeouts: cfg.timeouts,
    chatModel: cfg.chatModel,
    streaming: cfg.streaming
  });
}

/**
 * Local calendar date as a comparison key.
 * @returns: The date as `YYYY-M-D`
 */
function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * Removes duplicates while keeping the order.
 * @param values: Input values
 * @returns: The unique values
 */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
