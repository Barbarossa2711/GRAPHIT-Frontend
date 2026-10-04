/**
 * Server-Sent Events parsing for the chat endpoint.
 *
 * Split into a pure line buffer and a stream driver so the buffer is testable without
 * fetch(). Chunk boundaries do not align with line boundaries, so an incomplete
 * trailing line is kept until the next chunk arrives. Multi-byte UTF-8 characters can
 * also straddle chunks, hence TextDecoder with `{stream: true}`.
 */

import { ApiError } from './errors';
import {
  ChatChunk,
  ChatCompletion,
  ChatStreamHandlers,
  SlideCitation
} from './types';

export class SseLineBuffer {
  private buf = '';

  /**
   * Feeds a decoded text chunk.
   * @param chunk: Decoded text
   * @returns: The complete lines contained so far
   */
  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split(/\r?\n/);
    // The last element is either '' or a partial line.
    this.buf = lines.pop() ?? '';
    return lines;
  }

  /**
   * Returns the final unterminated line. Call once after the reader reports `done`.
   * @returns: The remaining line, if any
   */
  flush(): string[] {
    const rest = this.buf;
    this.buf = '';
    return rest.length > 0 ? [rest] : [];
  }
}

/**
 * Parses one `data:` line. `slides` only appears on the closing chunk and only when the
 * tutor loaded slides, so its absence is normal.
 * @param line: A single SSE line
 * @returns: Whether the stream is done, plus the text delta and slide citations if present
 */
export function parseDataLine(line: string): {
  done: boolean;
  text?: string;
  slides?: SlideCitation[];
} {
  if (!line.startsWith('data:')) {
    return { done: false };
  }
  const data = line.slice(5).trim();
  if (data === '[DONE]') {
    return { done: true };
  }
  if (!data) {
    return { done: false };
  }
  try {
    const chunk = JSON.parse(data) as ChatChunk;
    const text = chunk.choices?.[0]?.delta?.content;
    const slides = chunk.graphit_slides;
    const parsed: { done: boolean; text?: string; slides?: SlideCitation[] } = {
      done: false,
      text: typeof text === 'string' ? text : undefined
    };
    // Only set when present, so equality checks on `{done, text}` keep working.
    if (Array.isArray(slides) && slides.length > 0) {
      parsed.slides = slides;
    }
    return parsed;
  } catch {
    // A single malformed line must not kill the stream.
    console.warn('[GRAPHIT] unparsable SSE line, skipped:', data.slice(0, 200));
    return { done: false };
  }
}

/**
 * Consumes an SSE response and feeds the handlers. Falls back to a plain
 * `chat.completion` body if the server did not stream.
 * @param response: The chat response
 * @param handlers: Callbacks for first chunk, deltas, slides and completion
 */
export async function consumeChatStream(
  response: Response,
  handlers: ChatStreamHandlers
): Promise<void> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('text/event-stream') || !response.body) {
    await consumeNonStreaming(response, handlers);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const buffer = new SseLineBuffer();
  let sawFirst = false;

  const handleLines = (lines: string[]): boolean => {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const { done, text, slides } = parseDataLine(trimmed);
      if (slides) {
        handlers.onSlides?.(slides);
      }
      if (done) {
        return true;
      }
      if (text) {
        if (!sawFirst) {
          sawFirst = true;
          handlers.onFirstChunk?.();
        }
        handlers.onDelta(text);
      }
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (handleLines(buffer.push(decoder.decode(value, { stream: true })))) {
        handlers.onDone?.();
        return;
      }
    }
    // A stream ending without [DONE] is a normal completion.
    const tail = decoder.decode();
    if (tail) {
      handleLines(buffer.push(tail));
    }
    handleLines(buffer.flush());
    handlers.onDone?.();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Handles a non-streamed chat completion as if it were a single chunk.
 * @param response: The chat response
 * @param handlers: Stream callbacks
 */
async function consumeNonStreaming(
  response: Response,
  handlers: ChatStreamHandlers
): Promise<void> {
  let payload: ChatCompletion;
  try {
    payload = (await response.json()) as ChatCompletion;
  } catch (err) {
    throw new ApiError(
      'parse',
      'chat',
      response.status,
      err instanceof Error ? err.message : String(err)
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  handlers.onFirstChunk?.();
  if (typeof content === 'string' && content.length > 0) {
    handlers.onDelta(content);
  }
  const slides = payload.graphit_slides;
  if (Array.isArray(slides) && slides.length > 0) {
    handlers.onSlides?.(slides);
  }
  handlers.onDone?.();
}
