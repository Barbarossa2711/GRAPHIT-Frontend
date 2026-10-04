import { describe, expect, it } from 'vitest';

import { ClozePayload } from '../api/types';
import { parseCloze } from '../quiz/clozeParser';

/**
 * Creates a cloze payload with defaults.
 * @param over: Fields to override
 * @returns: The payload
 */
function payload(over: Partial<ClozePayload>): ClozePayload {
  return {
    type: 'cloze',
    prompt: 'p',
    text: 'Ein {{b1}} über {{b2}}.',
    blanks: ['b1', 'b2'],
    bank: [{ id: 't1', text: 'x' }],
    reuse: false,
    ...over
  };
}

describe('parseCloze', () => {
  it('splits text into literals and blanks', () => {
    const parsed = parseCloze(payload({}));
    expect(parsed.segments).toEqual([
      { kind: 'text', text: 'Ein ' },
      { kind: 'blank', blankId: 'b1' },
      { kind: 'text', text: ' über ' },
      { kind: 'blank', blankId: 'b2' },
      { kind: 'text', text: '.' }
    ]);
    expect(parsed.orphanBlanks).toEqual([]);
    expect(parsed.undeclared).toEqual([]);
  });

  it('renders an undeclared placeholder as literal text', () => {
    const parsed = parseCloze(
      payload({ text: 'A {{b1}} und {{ghost}}.', blanks: ['b1'] })
    );
    expect(parsed.undeclared).toEqual(['ghost']);
    expect(parsed.segments).toContainEqual({ kind: 'text', text: '{{ghost}}' });
    expect(parsed.segments.filter(s => s.kind === 'blank')).toHaveLength(1);
  });

  it('reports a declared blank that never appears in the text', () => {
    // Otherwise the blank could never be filled.
    const parsed = parseCloze(
      payload({ text: 'Nur {{b1}}.', blanks: ['b1', 'b2'] })
    );
    expect(parsed.orphanBlanks).toEqual(['b2']);
  });

  it('handles adjacent placeholders', () => {
    const parsed = parseCloze(
      payload({ text: '{{b1}}{{b2}}', blanks: ['b1', 'b2'] })
    );
    expect(parsed.segments).toEqual([
      { kind: 'blank', blankId: 'b1' },
      { kind: 'blank', blankId: 'b2' }
    ]);
  });

  it('leaves a lone brace alone', () => {
    const parsed = parseCloze(
      payload({ text: 'Ein { und {{b1}}.', blanks: ['b1'] })
    );
    expect(parsed.segments[0]).toEqual({ kind: 'text', text: 'Ein { und ' });
  });

  it('is idempotent across repeated calls (regex lastIndex reset)', () => {
    const p = payload({});
    const first = parseCloze(p);
    const second = parseCloze(p);
    expect(second.segments).toEqual(first.segments);
  });
});
