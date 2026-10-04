/**
 * Offline/demo client with the same interface as HttpGraphitClient.
 *
 * Reproduces the timing and failure modes of the real backend, not just its data:
 *  - /quiz/start is slow, so the loading view is exercised.
 *  - Chat is silent for a while and then streams, like the real server.
 *  - The fake SSE text runs through the real SseLineBuffer, split mid-line and
 *    mid-character, so the parser is exercised too.
 *  - quiz_id is single-use; a second submit returns 404.
 */

import { ApiError, EndpointId } from '../errors';
import { IGraphitClient } from '../client';
import { parseDataLine, SseLineBuffer } from '../sse';
import {
  ActivityDay,
  ActivityResponse,
  ChatRequest,
  ChatStreamHandlers,
  ClientQuestion,
  DomainTreeResponse,
  NextStepsResponse,
  ProgressResponse,
  QuizCandidatesRequest,
  QuizCandidatesResponse,
  QuizStartResponse,
  QuizSubmitRequest,
  QuizSubmitResponse,
  RecommendResponse
} from '../types';
import { mockAnswer, mockSlides } from './fixtures/chat';
import { applyReadiness, buildMockProgress } from './fixtures/progress';
import { buildMockQuiz, gradeMockQuiz } from './fixtures/quiz';
import { buildMockNextSteps } from './fixtures/nextSteps';
import { buildMockRecommend } from './fixtures/recommend';
import { MOCK_TREE } from './fixtures/tree';

export interface MockConfig {
  studentId: string;
  quizStartDelayMs: number;
  chatFirstChunkMs: number;
  /** 0…1; injects random failures to exercise the error paths. */
  failureRate: number;
}

interface OpenQuiz {
  quiz: QuizStartResponse;
  questions: ClientQuestion[];
}

export class MockGraphitClient implements IGraphitClient {
  readonly isMock = true;
  readonly baseUrl = 'mock://graphit';

  private progress: ProgressResponse;
  private readonly open = new Map<string, OpenQuiz>();

  /**
   * Creates the mock client with freshly generated demo progress.
   * @param cfg: Mock latencies, failure rate and student id
   */
  constructor(private cfg: MockConfig) {
    this.progress = buildMockProgress(cfg.studentId);
  }

  /**
   * Simulates `/v1/models`.
   * @param signal: Abort signal
   * @returns: The mock model id
   */
  async health(signal?: AbortSignal): Promise<string[]> {
    await this.delay(120, signal, 'health');
    return ['graphit-tutor'];
  }

  /**
   * Returns the static demo tree.
   * @param signal: Abort signal
   * @returns: The domain tree
   */
  async getDomainTree(signal?: AbortSignal): Promise<DomainTreeResponse> {
    await this.delay(200, signal, 'domainTree');
    return MOCK_TREE;
  }

  /**
   * Returns the in-memory demo progress.
   * @param signal: Abort signal
   * @returns: Progress per concept plus summary
   */
  async getProgress(signal?: AbortSignal): Promise<ProgressResponse> {
    await this.delay(300, signal, 'progress');
    return this.progress;
  }

  /**
   * Builds a learning path from the demo progress.
   * @param conceptId: Target concept
   * @param signal: Abort signal
   * @returns: The recommendation
   */
  async getRecommend(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<RecommendResponse> {
    await this.delay(400, signal, 'recommend');
    const result = buildMockRecommend(conceptId, this.progress);
    if (!result) {
      throw new ApiError('http', 'recommend', 404, 'Concept nicht gefunden');
    }
    return result;
  }

  /**
   * Builds next steps from the demo progress.
   * @param limit: Maximum number of steps
   * @param signal: Abort signal
   * @returns: The recommended next steps
   */
  async getNextSteps(
    limit = 5,
    signal?: AbortSignal
  ): Promise<NextStepsResponse> {
    await this.delay(300, signal, 'nextSteps');
    return buildMockNextSteps(this.progress, limit);
  }

  /**
   * Deterministic pseudo-activity derived from a hash of the date, so the demo heatmap
   * stays stable across renders. Weekends are sparser than weekdays.
   * @param signal: Abort signal
   * @returns: Activity for the last 200 days
   */
  async getActivity(signal?: AbortSignal): Promise<ActivityResponse> {
    await this.delay(200, signal, 'activity');
    const days: ActivityDay[] = [];
    const today = new Date();
    for (let back = 200; back >= 0; back--) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const h = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % 11;
      const count = h < (weekend ? 7 : 4) ? 0 : h - 2;
      if (count > 0) {
        days.push({ date: d.toISOString().slice(0, 10), count });
      }
    }
    return { student_id: 'demo', days };
  }

  /**
   * Lists demo concepts matching the filter.
   * @param req: Candidate filter
   * @param signal: Abort signal
   * @returns: The quiz candidates
   */
  async quizCandidates(
    req: QuizCandidatesRequest,
    signal?: AbortSignal
  ): Promise<QuizCandidatesResponse> {
    await this.delay(500, signal, 'quizCandidates');
    if (req.concept_id) {
      return { candidates: [{ id: req.concept_id, name: null }] };
    }
    const prefix = req.topic_id ?? '';
    const pool = this.progress.concepts.filter(c => c.id.startsWith(prefix));
    const filtered =
      req.only_unmastered === false ? pool : pool.filter(c => !c.mastered);
    return { candidates: filtered.map(c => ({ id: c.id, name: c.name })) };
  }

  /**
   * Builds a demo quiz after the configured (deliberately long) delay.
   * @param conceptId: Concept to quiz
   * @param signal: Abort signal
   * @returns: The quiz without solutions
   */
  async quizStart(
    conceptId: string,
    signal?: AbortSignal
  ): Promise<QuizStartResponse> {
    await this.delay(this.cfg.quizStartDelayMs, signal, 'quizStart');
    const quiz = buildMockQuiz(conceptId);
    this.open.set(quiz.quiz_id, { quiz, questions: quiz.questions });
    return quiz;
  }

  /**
   * Grades a demo quiz and updates the in-memory mastery. Like the server, a quiz can
   * only be submitted once.
   * @param req: Quiz id and answers
   * @param signal: Abort signal
   * @returns: Grading result with solutions
   */
  async quizSubmit(
    req: QuizSubmitRequest,
    signal?: AbortSignal
  ): Promise<QuizSubmitResponse> {
    await this.delay(800, signal, 'quizSubmit');
    const entry = this.open.get(req.quiz_id);
    if (!entry) {
      throw new ApiError(
        'http',
        'quizSubmit',
        404,
        'Quiz unbekannt oder verbraucht'
      );
    }
    this.open.delete(req.quiz_id);

    const results = gradeMockQuiz(entry.questions, req.answers);
    const nCorrect = results.filter(r => r.correct).length;
    return this.applyMastery(
      entry.quiz.concept_id,
      nCorrect,
      results.length,
      results
    );
  }

  /**
   * Streams a canned answer through the real SSE parser.
   * @param req: Chat history and scope
   * @param handlers: Stream callbacks
   * @param signal: Abort signal
   */
  async chat(
    req: Omit<ChatRequest, 'model' | 'stream'>,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const lastUser = [...req.messages].reverse().find(m => m.role === 'user');
    const answer = mockAnswer(lastUser?.content ?? '', req.scope ?? null);
    const slides = mockSlides(lastUser?.content ?? '', req.scope ?? null);

    // The real server computes the full answer first, so the first chunk arrives late.
    await this.delay(this.cfg.chatFirstChunkMs, signal, 'chat');

    // Real SSE text, sliced so chunk boundaries fall inside JSON and multi-byte characters.
    const words = answer.split(/(\s+)/).filter(w => w.length > 0);
    // Closing chunk as the server sends it: empty delta, finish_reason, slide citations.
    const closingChunk = `data: ${JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'graphit-tutor',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      ...(slides.length > 0 ? { graphit_slides: slides } : {})
    })}\n`;
    const sse =
      words
        .map(
          w =>
            `data: ${JSON.stringify({
              id: 'chatcmpl-mock',
              object: 'chat.completion.chunk',
              created: 0,
              model: 'graphit-tutor',
              choices: [
                { index: 0, delta: { content: w }, finish_reason: null }
              ]
            })}\n`
        )
        .join('') +
      closingChunk +
      'data: [DONE]\n';

    const bytes = new TextEncoder().encode(sse);
    const buffer = new SseLineBuffer();
    const decoder = new TextDecoder();
    let sawFirst = false;
    const SLICE = 37; // prime, so splits land inside lines and umlauts

    for (let offset = 0; offset < bytes.length; offset += SLICE) {
      if (signal?.aborted) {
        throw new ApiError('abort', 'chat', null, null);
      }
      const text = decoder.decode(bytes.slice(offset, offset + SLICE), {
        stream: true
      });
      for (const line of buffer.push(text)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        const { done, text: delta, slides: citedSlides } = parseDataLine(trimmed);
        if (citedSlides) {
          handlers.onSlides?.(citedSlides);
        }
        if (done) {
          handlers.onDone?.();
          return;
        }
        if (delta) {
          if (!sawFirst) {
            sawFirst = true;
            handlers.onFirstChunk?.();
          }
          handlers.onDelta(delta);
          await sleep(25);
        }
      }
    }
    handlers.onDone?.();
  }

  /**
   * Recomputes mastery roughly like the backend so the UI shows movement.
   * @param conceptId: Quizzed concept
   * @param nCorrect: Correct answers in this quiz
   * @param nTotal: Questions in this quiz
   * @param results: Per-question results
   * @returns: The submit response
   */
  private applyMastery(
    conceptId: string,
    nCorrect: number,
    nTotal: number,
    results: QuizSubmitResponse['results']
  ): QuizSubmitResponse {
    const concept = this.progress.concepts.find(c => c.id === conceptId);
    const s = (concept?.s ?? 0) + nCorrect;
    const f = (concept?.f ?? 0) + (nTotal - nCorrect);

    // PFA logit with dt = 0: m = gamma*s + rho*f, P = sigmoid(m), mastery = (P-0.5)*2
    const m = 0.75 * s - 0.3 * f;
    const p = 1 / (1 + Math.exp(-m));
    const mastery = Math.max(0, Math.min(1, (p - 0.5) * 2));
    const peak = Math.max(concept?.mastery_peak ?? 0, mastery);
    const mastered = mastery >= 0.8;
    const gatePassed = peak >= 0.8;

    // Δt until mastery falls below the threshold: t_h/ln2 * ln(gamma*s / (m* - rho*f)),
    // with the backend's half-life t_h = 28 days.
    const mStar = Math.log(9);
    const ratio = (0.75 * s) / (mStar + 0.3 * f);
    // Whole days like the backend: floor(interval) + 1. Without an interval the
    // threshold is already undercut, which the backend dates to now, hence 0.
    const nextDue =
      ratio > 1 ? Math.floor((28 / Math.LN2) * Math.log(ratio)) + 1 : 0;

    if (concept) {
      concept.s = s;
      concept.f = f;
      concept.mastery = mastery;
      concept.mastery_peak = peak;
      concept.mastered = mastered;
      concept.gate_passed = gatePassed;
      concept.days_until_due = nextDue;
      concept.days_since_quiz = 0;
      concept.status = mastered
        ? 'mastered'
        : gatePassed
          ? 'due_review'
          : 'in_progress';
      this.progress = rebuildAggregates(this.progress);
    }

    return {
      concept_id: conceptId,
      n_correct: nCorrect,
      n_total: nTotal,
      mastery: Math.round(mastery * 1000) / 1000,
      mastered,
      mastery_peak: Math.round(peak * 1000) / 1000,
      gate_passed: gatePassed,
      next_due_in_days: nextDue,
      s,
      f,
      results
    };
  }

  /**
   * Waits like a network call, honouring aborts and the configured failure rate.
   * @param ms: Simulated latency
   * @param signal: Abort signal
   * @param endpoint: Endpoint name for raised errors
   */
  private async delay(
    ms: number,
    signal: AbortSignal | undefined,
    endpoint: EndpointId
  ): Promise<void> {
    if (Math.random() < this.cfg.failureRate) {
      await sleep(Math.min(ms, 300));
      throw new ApiError('http', endpoint, 500, 'Simulierter Mock-Fehler');
    }
    const step = 50;
    for (let waited = 0; waited < ms; waited += step) {
      if (signal?.aborted) {
        throw new ApiError('abort', endpoint, null, null);
      }
      await sleep(Math.min(step, ms - waited));
    }
    if (signal?.aborted) {
      throw new ApiError('abort', endpoint, null, null);
    }
  }
}

/**
 * Resolves after a delay.
 * @param ms: Delay in milliseconds
 * @returns: A promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recomputes readiness, rollups and summary after a concept changed.
 * @param progress: Current demo progress
 * @returns: Progress with consistent aggregates
 */
function rebuildAggregates(progress: ProgressResponse): ProgressResponse {
  const fresh = buildMockProgress(progress.student_id);
  const byId = new Map(progress.concepts.map(c => [c.id, c]));
  const concepts = fresh.concepts.map(c => byId.get(c.id) ?? c);
  applyReadiness(concepts);
  const rollupIds = Object.keys(fresh.rollup);
  const rollup: ProgressResponse['rollup'] = {};

  for (const id of rollupIds) {
    rollup[id] = summarise(concepts.filter(c => c.id.startsWith(id)));
  }
  return {
    student_id: progress.student_id,
    concepts,
    rollup,
    summary: summarise(concepts)
  };
}

/**
 * Aggregates concept statistics.
 * @param concepts: Concepts of a group
 * @returns: Counts per status and average mastery
 */
function summarise(
  concepts: ProgressResponse['concepts']
): ProgressResponse['summary'] {
  const stats = {
    total: concepts.length,
    new: 0,
    visited: 0,
    in_progress: 0,
    due_review: 0,
    mastered: 0,
    gate_passed: 0,
    mastery_avg: 0
  };
  for (const c of concepts) {
    stats[c.status] += 1;
    if (c.gate_passed) {
      stats.gate_passed += 1;
    }
    stats.mastery_avg += c.mastery ?? 0;
  }
  stats.mastery_avg =
    stats.total > 0
      ? Math.round((stats.mastery_avg / stats.total) * 1000) / 1000
      : 0;
  return stats;
}
