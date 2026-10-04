import { describe, expect, it } from 'vitest';

import { ApiError, userMessage } from '../api/errors';

const DETAIL = 'Concept BDT_CH01 nicht im Graphen gefunden (Cypher-Fehler)';

describe('userMessage — the 404-after-timeout rule', () => {
  it('treats a submit 404 as success when a submit was already attempted', () => {
    const err = new ApiError('http', 'quizSubmit', 404, DETAIL);
    const msg = userMessage(err, { submitAttempted: true });
    expect(msg.benign).toBe(true);
    expect(msg.title).toMatch(/gewertet/i);
  });

  it('treats a first-attempt submit 404 as an expired quiz', () => {
    const err = new ApiError('http', 'quizSubmit', 404, DETAIL);
    const msg = userMessage(err, { submitAttempted: false });
    expect(msg.benign).toBeUndefined();
    expect(msg.title).toMatch(/abgelaufen/i);
  });
});

describe('userMessage — never leaks server detail', () => {
  const cases: Array<[string, ApiError]> = [
    ['404 quizStart', new ApiError('http', 'quizStart', 404, DETAIL)],
    ['404 recommend', new ApiError('http', 'recommend', 404, DETAIL)],
    ['422 progress', new ApiError('http', 'progress', 422, DETAIL)],
    ['500 chat', new ApiError('http', 'chat', 500, DETAIL)],
    ['network', new ApiError('network', 'progress', null, DETAIL)],
    ['timeout', new ApiError('timeout', 'quizStart', null, null)],
    ['parse', new ApiError('parse', 'domainTree', 200, DETAIL)]
  ];

  for (const [label, err] of cases) {
    it(`${label} produces no trace of detail`, () => {
      const msg = userMessage(err, { baseUrl: 'http://127.0.0.1:8077' });
      const rendered = [msg.title, msg.body, msg.hint ?? ''].join(' ');
      expect(rendered).not.toContain(DETAIL);
      expect(rendered).not.toContain('Cypher');
      expect(msg.title.length).toBeGreaterThan(0);
    });
  }
});

describe('userMessage — specific endpoints', () => {
  it('422 is presented as an internal error and is not retryable', () => {
    const msg = userMessage(new ApiError('http', 'progress', 422, DETAIL));
    expect(msg.canRetry).toBe(false);
    expect(msg.title).toMatch(/intern/i);
  });

  it('a quizStart timeout warns that retrying costs again', () => {
    const msg = userMessage(new ApiError('timeout', 'quizStart', null, null));
    expect(msg.hint).toMatch(/neu|erneut/i);
    expect(msg.canRetry).toBe(true);
  });

  // With diagnostics on, both causes (dead server, CORS) are named for operators.
  it('a network failure names both possible causes for an operator', () => {
    const msg = userMessage(new ApiError('network', 'progress', null, null), {
      baseUrl: 'http://127.0.0.1:8077',
      showDiagnostics: true
    });
    expect(msg.hint).toMatch(/CORS|GRAPHIT_CORS_ORIGINS|Läuft der Server/);
    expect(msg.body).toContain('http://127.0.0.1:8077');
  });

  // Students get neither address nor env variable, only what they can do.
  it('hides the address and the operator hint by default', () => {
    const msg = userMessage(new ApiError('network', 'progress', null, null), {
      baseUrl: 'http://127.0.0.1:8077'
    });
    expect(msg.body).not.toContain('127.0.0.1');
    expect(msg.hint).not.toMatch(/CORS|GRAPHIT_CORS_ORIGINS/);
    expect(msg.hint).toMatch(/Betreuung/);
    expect(msg.canRetry).toBe(true);
  });

  it('an abort is benign and silent', () => {
    const msg = userMessage(new ApiError('abort', 'chat', null, null));
    expect(msg.benign).toBe(true);
    expect(msg.canRetry).toBe(false);
  });

  it('a non-ApiError still yields something showable', () => {
    const msg = userMessage(new Error('boom'));
    expect(msg.title.length).toBeGreaterThan(0);
    expect(msg.canRetry).toBe(true);
  });
});
