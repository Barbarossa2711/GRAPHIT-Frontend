import { describe, expect, it } from 'vitest';

import { MatchPayload } from '../api/types';
import { matchPairs, renderSolution } from '../components/quiz/Feedback';

const matchPayload: MatchPayload = {
  type: 'match',
  prompt: 'Ordne zu.',
  left: [
    { id: 'l1', text: 'Hohe Datenredundanz' },
    { id: 'l2', text: 'Inkonsistente Datenstände' }
  ],
  right: [
    { id: 'r1', text: 'Einmalige Speicherung' },
    { id: 'r2', text: 'Transaktionsmanagement' },
    { id: 'r3', text: 'Dezentrale Dateiverwaltung' }
  ]
};

describe('renderSolution for match questions', () => {
  it('renders the list of pairs stored by the generator', () => {
    // Regression: a list of {left, right} used to render as "[object Object]".
    const text = renderSolution(matchPayload, [
      { left: 'l1', right: 'r1' },
      { left: 'l2', right: 'r2' }
    ]);
    expect(text).toBe(
      'Hohe Datenredundanz → Einmalige Speicherung; ' +
        'Inkonsistente Datenstände → Transaktionsmanagement'
    );
    expect(text).not.toContain('[object Object]');
  });

  it('renders the map submitted by the student the same way', () => {
    // Both shapes must read identically so answer and solution can be compared.
    expect(renderSolution(matchPayload, { l1: 'r1', l2: 'r2' })).toBe(
      'Hohe Datenredundanz → Einmalige Speicherung; ' +
        'Inkonsistente Datenstände → Transaktionsmanagement'
    );
  });

  it('falls back to the explanation for an unknown shape', () => {
    expect(renderSolution(matchPayload, [{ unknown: 'l1' }])).toBeNull();
    expect(renderSolution(matchPayload, 42)).toBeNull();
  });
});

describe('matchPairs', () => {
  it('accepts both shapes the backend accepts', () => {
    expect(matchPairs([{ left: 'l1', right: 'r1' }])).toEqual([['l1', 'r1']]);
    expect(matchPairs({ l1: 'r1' })).toEqual([['l1', 'r1']]);
  });

  it('rejects everything else instead of guessing', () => {
    expect(matchPairs([{ left: 'l1' }])).toBeNull();
    expect(matchPairs([])).toBeNull();
    expect(matchPairs('l1')).toBeNull();
    expect(matchPairs(null)).toBeNull();
  });
});
