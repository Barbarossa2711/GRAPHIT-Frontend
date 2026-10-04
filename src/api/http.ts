/**
 * Thin fetch wrapper with per-endpoint timeouts, abort chaining and minimal headers.
 */

import { ApiError, EndpointId } from './errors';

export interface Timeouts {
  default: number;
  health: number;
  domainTree: number;
  progress: number;
  recommend: number;
  nextSteps: number;
  activity: number;
  chat: number;
  quizCandidates: number;
  quizStart: number;
  quizSubmit: number;
}

export const DEFAULT_TIMEOUTS: Timeouts = {
  default: 15000,
  health: 5000,
  domainTree: 30000,
  progress: 30000,
  recommend: 20000,
  nextSteps: 20000,
  activity: 15000,
  chat: 180000,
  quizCandidates: 30000,
  // /quiz/start runs a two-stage LLM pipeline; 30–120 s is normal.
  quizStart: 240000,
  quizSubmit: 60000
};

export interface RequestOptions {
  endpoint: EndpointId;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /**
   * Sent as X-Student-Id on every request except /domain/tree and /quiz/submit. Only
   * Content-Type and X-Student-Id are in the server's CORS allowlist; any other custom
   * header fails the preflight.
   */
  studentId?: string | null;
  /** Return the raw Response instead of parsed JSON (used for SSE). */
  raw?: boolean;
}

/**
 * Joins a base URL and a path without producing a double slash.
 * @param baseUrl: Base URL of the backend
 * @param path: Request path
 * @returns: The combined URL
 */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Sends a request and returns the raw response. Non-2xx responses, timeouts, aborts
 * and network failures are all converted into an ApiError.
 * @param baseUrl: Base URL of the backend
 * @param opts: Request options
 * @returns: The successful response
 */
export async function requestRaw(
  baseUrl: string,
  opts: RequestOptions
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);

  // Chained manually because AbortSignal.any() is not available in all browsers.
  const onParentAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) {
      controller.abort();
    } else {
      opts.signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.studentId) {
    headers['X-Student-Id'] = opts.studentId;
  }

  try {
    const response = await fetch(joinUrl(baseUrl, opts.path), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      // The identity travels in a header; credentialed requests would need stricter CORS.
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new ApiError(
        'http',
        opts.endpoint,
        response.status,
        await readDetail(response)
      );
    }
    return response;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (isAbortLike(err)) {
      throw new ApiError(
        timedOut ? 'timeout' : 'abort',
        opts.endpoint,
        null,
        null
      );
    }
    // fetch() rejects with a TypeError both for unreachable hosts and for CORS
    // blocks; the browser does not reveal which.
    throw new ApiError(
      'network',
      opts.endpoint,
      null,
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * Sends a request and parses the JSON body.
 * @param baseUrl: Base URL of the backend
 * @param opts: Request options
 * @returns: The parsed response body
 */
export async function request<T>(
  baseUrl: string,
  opts: RequestOptions
): Promise<T> {
  const response = await requestRaw(baseUrl, opts);
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new ApiError(
      'parse',
      opts.endpoint,
      response.status,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Like request(), but retries once on network errors and 5xx. Only for GETs: a retry
 * of /quiz/start would trigger a second LLM generation, and quiz_id for /quiz/submit
 * is single-use.
 * @param baseUrl: Base URL of the backend
 * @param opts: Request options
 * @returns: The parsed response body
 */
export async function requestWithRetry<T>(
  baseUrl: string,
  opts: RequestOptions
): Promise<T> {
  try {
    return await request<T>(baseUrl, opts);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.kind === 'network' || (err.status !== null && err.status >= 500))
    ) {
      return request<T>(baseUrl, opts);
    }
    throw err;
  }
}

/**
 * Extracts the error detail from a failed response.
 * @param response: The failed response
 * @returns: The `detail` field, the truncated raw body, or null
 */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === 'string') {
        return parsed.detail;
      }
    } catch {
      /* not JSON, fall back to the raw text */
    }
    return text.slice(0, 500);
  } catch {
    return null;
  }
}

/**
 * Checks whether an error comes from an aborted or timed-out fetch.
 * @param err: The caught error
 * @returns: True for AbortError and TimeoutError
 */
function isAbortLike(err: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}
