import { describe, expect, it } from 'vitest';

import {
  ClientQuestion,
  ClozePayload,
  MatchPayload,
  MultiplePayload,
  OrderPayload,
  SinglePayload
} from '../api/types';
import {
  buildPayload,
  duplicateAssignments,
  initAnswer,
  isAnswered,
  isComplete,
  moveOrderItem,
  normalizeForWire,
  setSingle,
  setSlot,
  toggleMultiple,
  usedBankIds
} from '../quiz/answerModel';

const single: SinglePayload = {
  type: 'single',
  prompt: 'p',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' }
  ]
};

const multiple: MultiplePayload = {
  type: 'multiple',
  prompt: 'p',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' }
  ],
  grading: 'all_or_nothing'
};

const cloze: ClozePayload = {
  type: 'cloze',
  prompt: 'p',
  text: 'Ein {{b1}} über {{b2}}.',
  blanks: ['b1', 'b2'],
  bank: [
    { id: 't1', text: 'Shard' },
    { id: 't2', text: 'Knoten' },
    { id: 't3', text: 'Distraktor' }
  ],
  reuse: false
};

const match: MatchPayload = {
  type: 'match',
  prompt: 'p',
  left: [
    { id: 'l1', text: 'L1' },
    { id: 'l2', text: 'L2' }
  ],
  right: [
    { id: 'r1', text: 'R1' },
    { id: 'r2', text: 'R2' },
    { id: 'r3', text: 'R3' }
  ]
};

const order: OrderPayload = {
  type: 'order',
  prompt: 'p',
  items: [
    { id: 's2', text: 'zwei' },
    { id: 's1', text: 'eins' },
    { id: 's3', text: 'drei' }
  ]
};

describe('normalizeForWire: exact wire formats', () => {
  it('single -> string', () => {
    const state = setSingle(initAnswer(single), 'b');
    expect(normalizeForWire(state)).toBe('b');
  });

  it('multiple -> string[], order irrelevant', () => {
    let state = initAnswer(multiple);
    state = toggleMultiple(state, 'c');
    state = toggleMultiple(state, 'a');
    const wire = normalizeForWire(state) as string[];
    expect([...wire].sort()).toEqual(['a', 'c']);
  });

  it('cloze -> Record<blankId, bankId>', () => {
    let state = initAnswer(cloze);
    state = setSlot(state, 'b1', 't1');
    state = setSlot(state, 'b2', 't2');
    expect(normalizeForWire(state)).toEqual({ b1: 't1', b2: 't2' });
  });

  it('match -> Record<leftId, rightId>', () => {
    let state = initAnswer(match);
    state = setSlot(state, 'l1', 'r1');
    state = setSlot(state, 'l2', 'r2');
    expect(normalizeForWire(state)).toEqual({ l1: 'r1', l2: 'r2' });
  });

  it('order -> exact sequence of item ids', () => {
    let state = initAnswer(order);
    // delivered order is s2,s1,s3 -> move s1 to the front
    state = moveOrderItem(state, 1, 0);
    expect(normalizeForWire(state)).toEqual(['s1', 's2', 's3']);
  });

  it('never emits display text', () => {
    const state = setSingle(initAnswer(single), 'a');
    expect(normalizeForWire(state)).not.toBe('A');
  });

  it('sends a partially filled cloze rather than dropping it', () => {
    const state = setSlot(initAnswer(cloze), 'b1', 't1');
    expect(normalizeForWire(state)).toEqual({ b1: 't1' });
  });

  it('returns undefined for untouched answers', () => {
    expect(normalizeForWire(initAnswer(single))).toBeUndefined();
    expect(normalizeForWire(initAnswer(multiple))).toBeUndefined();
    expect(normalizeForWire(initAnswer(cloze))).toBeUndefined();
    expect(normalizeForWire(initAnswer(match))).toBeUndefined();
    // An untouched order holds a permutation but no decision.
    expect(normalizeForWire(initAnswer(order))).toBeUndefined();
  });
});

describe('buildPayload', () => {
  it('omits unanswered questions entirely', () => {
    const questions: ClientQuestion[] = [
      { question_id: 'q1', type: 'single', payload: single },
      { question_id: 'q2', type: 'multiple', payload: multiple }
    ];
    const answers = {
      q1: setSingle(initAnswer(single), 'b'),
      q2: initAnswer(multiple)
    };
    expect(buildPayload(questions, answers)).toEqual({ q1: 'b' });
  });
});

describe('isAnswered / isComplete', () => {
  it('treats an untouched order question as unanswered', () => {
    expect(isAnswered(initAnswer(order))).toBe(false);
    expect(isAnswered(moveOrderItem(initAnswer(order), 0, 1))).toBe(true);
  });

  it('distinguishes partially and fully filled cloze', () => {
    const partial = setSlot(initAnswer(cloze), 'b1', 't1');
    expect(isAnswered(partial)).toBe(true);
    expect(isComplete(cloze, partial)).toBe(false);
    expect(isComplete(cloze, setSlot(partial, 'b2', 't2'))).toBe(true);
  });

  it('requires every left entry for match', () => {
    const partial = setSlot(initAnswer(match), 'l1', 'r1');
    expect(isComplete(match, partial)).toBe(false);
  });
});

describe('reuse and duplicate rules the grader does not enforce', () => {
  it('reports bank ids spent on other blanks', () => {
    let state = initAnswer(cloze);
    state = setSlot(state, 'b1', 't1');
    expect(usedBankIds(state, 'b2')).toEqual(new Set(['t1']));
    // The blank's own value is never treated as blocking itself.
    expect(usedBankIds(state, 'b1')).toEqual(new Set());
  });

  it('flags duplicate match assignments without blocking them', () => {
    let state = initAnswer(match);
    state = setSlot(state, 'l1', 'r1');
    state = setSlot(state, 'l2', 'r1');
    expect(duplicateAssignments(state)).toEqual(['r1']);
    expect(normalizeForWire(state)).toEqual({ l1: 'r1', l2: 'r1' });
  });

  it('clearing a slot removes it from the payload', () => {
    let state = setSlot(initAnswer(cloze), 'b1', 't1');
    state = setSlot(state, 'b1', '');
    expect(normalizeForWire(state)).toBeUndefined();
  });
});
