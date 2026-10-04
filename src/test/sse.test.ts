import { describe, expect, it } from 'vitest';

import { parseDataLine, SseLineBuffer } from '../api/sse';

/**
 * Builds an SSE data line carrying one content delta.
 * @param content: Delta text
 * @returns: The SSE line including the trailing newline
 */
function chunkFor(content: string): string {
  return `data: ${JSON.stringify({
    id: 'x',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'graphit-tutor',
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  })}\n`;
}

describe('SseLineBuffer', () => {
  it('retains an incomplete trailing line', () => {
    const buf = new SseLineBuffer();
    expect(buf.push('data: {"a"')).toEqual([]);
    expect(buf.push(':1}\n')).toEqual(['data: {"a":1}']);
  });

  it('returns several complete lines and keeps the remainder', () => {
    const buf = new SseLineBuffer();
    const lines = buf.push('a\nb\nc\npartia');
    expect(lines).toEqual(['a', 'b', 'c']);
    expect(buf.flush()).toEqual(['partia']);
  });

  it('handles CRLF line endings', () => {
    const buf = new SseLineBuffer();
    expect(buf.push('one\r\ntwo\r\n')).toEqual(['one', 'two']);
  });

  it('flush yields nothing when the stream ended on a newline', () => {
    const buf = new SseLineBuffer();
    buf.push('done\n');
    expect(buf.flush()).toEqual([]);
  });

  it('survives a JSON object split across three chunks', () => {
    const buf = new SseLineBuffer();
    const full = chunkFor('Sharding ');
    const a = full.slice(0, 10);
    const b = full.slice(10, 40);
    const c = full.slice(40);

    const lines = [...buf.push(a), ...buf.push(b), ...buf.push(c)];
    expect(lines).toHaveLength(1);
    expect(parseDataLine(lines[0])).toEqual({ done: false, text: 'Sharding ' });
  });

  it('reassembles a multi-byte UTF-8 character split across chunks', () => {
    // The tutor answers in German, so umlauts can straddle chunk boundaries.
    const bytes = new TextEncoder().encode(chunkFor('Schlüssel'));
    const decoder = new TextDecoder();
    const buf = new SseLineBuffer();

    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 7) {
      lines.push(
        ...buf.push(decoder.decode(bytes.slice(i, i + 7), { stream: true }))
      );
    }
    lines.push(...buf.flush());

    const parsed = lines.map(parseDataLine).filter(p => p.text);
    expect(parsed).toEqual([{ done: false, text: 'Schlüssel' }]);
  });
});

describe('parseDataLine', () => {
  it('detects [DONE] with and without trailing whitespace', () => {
    expect(parseDataLine('data: [DONE]')).toEqual({ done: true });
    expect(parseDataLine('data: [DONE]   ')).toEqual({ done: true });
  });

  it('ignores lines that are not data lines', () => {
    expect(parseDataLine(': keep-alive')).toEqual({ done: false });
    expect(parseDataLine('event: message')).toEqual({ done: false });
  });

  it('tolerates the role-only first chunk', () => {
    const line = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    })}`;
    expect(parseDataLine(line)).toEqual({ done: false, text: undefined });
  });

  it('tolerates the empty final chunk', () => {
    const line = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    })}`;
    expect(parseDataLine(line)).toEqual({ done: false, text: undefined });
  });

  it('skips a malformed line instead of throwing', () => {
    expect(() => parseDataLine('data: {not json')).not.toThrow();
    expect(parseDataLine('data: {not json')).toEqual({ done: false });
  });
});

describe('parseDataLine: slide citations', () => {
  const slide = {
    page: 14,
    chapter: 'NoSQL-Systeme & Verteiltes Datenmanagement',
    chapter_num: 2,
    source: '02-NoSQL.pdf',
    stand: 'BDT 2026'
  };

  it('reads the citations off the closing chunk', () => {
    const line = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      graphit_slides: [slide]
    })}`;
    expect(parseDataLine(line)).toEqual({
      done: false,
      text: undefined,
      slides: [slide]
    });
  });

  it('leaves the key out entirely when the answer used no slides', () => {
    const line = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      graphit_slides: []
    })}`;
    expect('slides' in parseDataLine(line)).toBe(false);
  });

  it('ignores a graphit_slides that is not an array', () => {
    const line = `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: 'x' }, finish_reason: null }],
      graphit_slides: 'kaputt'
    })}`;
    expect(parseDataLine(line)).toEqual({ done: false, text: 'x' });
  });
});
