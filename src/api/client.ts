/**
 * Client interface used by the whole UI, plus its HTTP implementation. The mock client
 * (api/mock/mockClient.ts) implements the same interface for offline mode.
 */

import { request, requestRaw, requestWithRetry, Timeouts } from './http';
import { consumeChatStream } from './sse';
import {
  ActivityResponse,
  ChatRequest,
  ChatStreamHandlers,
  DomainTreeResponse,
  ModelsResponse,
  NextStepsResponse,
  ProgressResponse,
  QuizCandidatesRequest,
  QuizCandidatesResponse,
  QuizStartResponse,
  QuizSubmitRequest,
  QuizSubmitResponse,
  RecommendResponse
} from './types';

export interface ClientConfig {
  baseUrl: string;
  studentId: string;
  timeouts: Timeouts;
  chatModel: string;
  streaming: boolean;
}

export interface IGraphitClient {
  readonly isMock: boolean;
  readonly baseUrl: string;
  /**
   * Cheapest possible connectivity probe (no Neo4j, no LLM).
   * @param signal: Abort signal
   * @returns: IDs of the available models
   */
  health(signal?: AbortSignal): Promise<string[]>;
  /**
   * Loads the domain model tree.
   * @param signal: Abort signal
   * @returns: The domain tree
   */
  getDomainTree(signal?: AbortSignal): Promise<DomainTreeResponse>;
  /**
   * Loads the student's progress.
   * @param signal: Abort signal
   * @returns: Progress per concept plus summary
   */
  getProgress(signal?: AbortSignal): Promise<ProgressResponse>;
  /**
   * Loads the learning path towards a concept.
   * @param conceptId: Target concept
   * @param signal: Abort signal
   * @returns: The recommendation
   */
  getRecommend(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<RecommendResponse>;
  /**
   * Loads the daily activity history.
   * @param signal: Abort signal
   * @returns: Activity per day
   */
  getActivity(signal?: AbortSignal): Promise<ActivityResponse>;
  /**
   * Loads the corpus-wide next-step recommendation.
   * @param limit: Maximum number of steps
   * @param signal: Abort signal
   * @returns: The recommended next steps
   */
  getNextSteps(
    limit?: number,
    signal?: AbortSignal
  ): Promise<NextStepsResponse>;
  /**
   * Lists concepts that can be quizzed.
   * @param req: Candidate filter
   * @param signal: Abort signal
   * @returns: The quiz candidates
   */
  quizCandidates(
    req: QuizCandidatesRequest,
    signal?: AbortSignal
  ): Promise<QuizCandidatesResponse>;
  /**
   * Generates a quiz for a concept.
   * @param conceptId: Concept to quiz
   * @param signal: Abort signal
   * @returns: The quiz without solutions
   */
  quizStart(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<QuizStartResponse>;
  /**
   * Submits quiz answers for grading.
   * @param req: Quiz id and answers
   * @param signal: Abort signal
   * @returns: Grading result with solutions
   */
  quizSubmit(
    req: QuizSubmitRequest,
    signal?: AbortSignal
  ): Promise<QuizSubmitResponse>;
  /**
   * Sends a chat request and streams the answer into the handlers.
   * @param req: Chat history and scope
   * @param handlers: Stream callbacks
   * @param signal: Abort signal
   */
  chat(
    req: Omit<ChatRequest, 'model' | 'stream'>,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ): Promise<void>;
}

export class HttpGraphitClient implements IGraphitClient {
  readonly isMock = false;

  /**
   * Creates the HTTP client.
   * @param cfg: Backend address, identity, timeouts and chat options
   */
  constructor(private readonly cfg: ClientConfig) {}

  /**
   * Configured backend URL.
   * @returns: The base URL
   */
  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  /**
   * Probes `/v1/models`.
   * @param signal: Abort signal
   * @returns: IDs of the available models
   */
  async health(signal?: AbortSignal): Promise<string[]> {
    const res = await request<ModelsResponse>(this.cfg.baseUrl, {
      endpoint: 'health',
      path: '/v1/models',
      timeoutMs: this.cfg.timeouts.health,
      signal
    });
    return (res.data ?? []).map(m => m.id);
  }

  /**
   * Loads `/domain/tree`. Sent without X-Student-Id; the tree is student-independent.
   * @param signal: Abort signal
   * @returns: The domain tree
   */
  getDomainTree(signal?: AbortSignal): Promise<DomainTreeResponse> {
    return requestWithRetry<DomainTreeResponse>(this.cfg.baseUrl, {
      endpoint: 'domainTree',
      path: '/domain/tree',
      timeoutMs: this.cfg.timeouts.domainTree,
      signal
    });
  }

  /**
   * Loads `/progress`.
   * @param signal: Abort signal
   * @returns: Progress per concept plus summary
   */
  getProgress(signal?: AbortSignal): Promise<ProgressResponse> {
    return requestWithRetry<ProgressResponse>(this.cfg.baseUrl, {
      endpoint: 'progress',
      path: '/progress',
      timeoutMs: this.cfg.timeouts.progress,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Loads `/activity`.
   * @param signal: Abort signal
   * @returns: Activity per day
   */
  getActivity(signal?: AbortSignal): Promise<ActivityResponse> {
    return requestWithRetry<ActivityResponse>(this.cfg.baseUrl, {
      endpoint: 'activity',
      path: '/activity',
      timeoutMs: this.cfg.timeouts.activity,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Loads `/recommend` for a concept.
   * @param conceptId: Target concept
   * @param signal: Abort signal
   * @returns: The recommendation
   */
  getRecommend(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<RecommendResponse> {
    return requestWithRetry<RecommendResponse>(this.cfg.baseUrl, {
      endpoint: 'recommend',
      path: `/recommend?concept_id=${encodeURIComponent(conceptId)}`,
      timeoutMs: this.cfg.timeouts.recommend,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Loads `/next`: the learnable front of the whole corpus in lecture order.
   * @param limit: Maximum number of steps
   * @param signal: Abort signal
   * @returns: The recommended next steps
   */
  getNextSteps(
    limit?: number,
    signal?: AbortSignal
  ): Promise<NextStepsResponse> {
    const query =
      limit === undefined ? '' : `?limit=${encodeURIComponent(limit)}`;
    return requestWithRetry<NextStepsResponse>(this.cfg.baseUrl, {
      endpoint: 'nextSteps',
      path: `/next${query}`,
      timeoutMs: this.cfg.timeouts.nextSteps,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Posts to `/quiz/candidates`, restricted to unmastered concepts by default.
   * @param req: Candidate filter
   * @param signal: Abort signal
   * @returns: The quiz candidates
   */
  quizCandidates(
    req: QuizCandidatesRequest,
    signal?: AbortSignal
  ): Promise<QuizCandidatesResponse> {
    return request<QuizCandidatesResponse>(this.cfg.baseUrl, {
      endpoint: 'quizCandidates',
      path: '/quiz/candidates',
      method: 'POST',
      body: { only_unmastered: true, ...req },
      timeoutMs: this.cfg.timeouts.quizCandidates,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Posts to `/quiz/start`. Slow (LLM pipeline), therefore never retried.
   * @param conceptId: Concept to quiz
   * @param signal: Abort signal
   * @returns: The quiz without solutions
   */
  quizStart(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<QuizStartResponse> {
    return request<QuizStartResponse>(this.cfg.baseUrl, {
      endpoint: 'quizStart',
      path: '/quiz/start',
      method: 'POST',
      body: { concept_id: conceptId },
      timeoutMs: this.cfg.timeouts.quizStart,
      studentId: this.cfg.studentId,
      signal
    });
  }

  /**
   * Posts to `/quiz/submit`. No student header (the identity is bound to the quiz_id);
   * never retried.
   * @param req: Quiz id and answers
   * @param signal: Abort signal
   * @returns: Grading result with solutions
   */
  quizSubmit(
    req: QuizSubmitRequest,
    signal?: AbortSignal
  ): Promise<QuizSubmitResponse> {
    return request<QuizSubmitResponse>(this.cfg.baseUrl, {
      endpoint: 'quizSubmit',
      path: '/quiz/submit',
      method: 'POST',
      body: req,
      timeoutMs: this.cfg.timeouts.quizSubmit,
      signal
    });
  }

  /**
   * Posts to `/v1/chat/completions` and consumes the (streamed) answer.
   * @param req: Chat history and scope
   * @param handlers: Stream callbacks
   * @param signal: Abort signal
   */
  async chat(
    req: Omit<ChatRequest, 'model' | 'stream'>,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await requestRaw(this.cfg.baseUrl, {
      endpoint: 'chat',
      path: '/v1/chat/completions',
      method: 'POST',
      body: {
        model: this.cfg.chatModel,
        stream: this.cfg.streaming,
        ...req
      },
      timeoutMs: this.cfg.timeouts.chat,
      studentId: this.cfg.studentId,
      signal
    });
    await consumeChatStream(response, handlers);
  }
}
