/**
 * In-memory answer state and its translation to the wire format. Answers are compared
 * by ID only; display text is never sent.
 *
 *   single    string                      "b"
 *   multiple  string[]                    ["a","c"]        set, order irrelevant
 *   cloze     Record<blankId, bankId>     {"b1":"t1"}      all blanks required
 *   match     Record<leftId, rightId>     {"l1":"r1"}
 *   order     string[]                    ["s1","s2"]      exact sequence
 */

import { Answer, ClientQuestion, QuestionPayload } from '../api/types';

export type AnswerState =
  | { kind: 'single'; value: string | null }
  | { kind: 'multiple'; value: string[] }
  | { kind: 'cloze'; value: Record<string, string> }
  | { kind: 'match'; value: Record<string, string> }
  | { kind: 'order'; value: string[]; touched: boolean };

export type AnswerMap = Record<string, AnswerState>;

/**
 * Creates the empty answer state for a question.
 * @param payload: Question payload
 * @returns: The initial answer state
 */
export function initAnswer(payload: QuestionPayload): AnswerState {
  switch (payload.type) {
    case 'single':
      return { kind: 'single', value: null };
    case 'multiple':
      return { kind: 'multiple', value: [] };
    case 'cloze':
      return { kind: 'cloze', value: {} };
    case 'match':
      return { kind: 'match', value: {} };
    case 'order':
      // Keep the delivered (arbitrary) order; shuffling would break restore after reload.
      return {
        kind: 'order',
        value: payload.items.map(i => i.id),
        touched: false
      };
    default:
      return assertNever(payload);
  }
}

/**
 * Creates the empty answer states for all questions.
 * @param questions: Quiz questions
 * @returns: Answer states keyed by question id
 */
export function initAnswers(questions: ClientQuestion[]): AnswerMap {
  const out: AnswerMap = {};
  for (const q of questions) {
    out[q.question_id] = initAnswer(q.payload);
  }
  return out;
}

/**
 * Whether the student has engaged with the question. A cloze counts as answered once
 * one blank is filled; completeness is checked separately by isComplete().
 * @param state: Answer state
 * @returns: True if answered
 */
export function isAnswered(state: AnswerState | undefined): boolean {
  if (!state) {
    return false;
  }
  switch (state.kind) {
    case 'single':
      return state.value !== null;
    case 'multiple':
      return state.value.length > 0;
    case 'cloze':
    case 'match':
      return Object.keys(state.value).length > 0;
    case 'order':
      // An untouched order question holds a permutation, but no choice was made.
      return state.touched;
    default:
      return assertNever(state);
  }
}

/**
 * Whether every slot of a multi-slot question is filled.
 * @param payload: Question payload
 * @param state: Answer state
 * @returns: True if complete
 */
export function isComplete(
  payload: QuestionPayload,
  state: AnswerState | undefined
): boolean {
  if (!state) {
    return false;
  }
  if (payload.type === 'cloze' && state.kind === 'cloze') {
    return payload.blanks.every(b => Boolean(state.value[b]));
  }
  if (payload.type === 'match' && state.kind === 'match') {
    return payload.left.every(l => Boolean(state.value[l.id]));
  }
  return isAnswered(state);
}

/**
 * Converts an answer state to its wire value.
 * @param state: Answer state
 * @returns: The wire value, or undefined if the question should be omitted
 */
export function normalizeForWire(
  state: AnswerState | undefined
): Answer | undefined {
  if (!state) {
    return undefined;
  }
  switch (state.kind) {
    case 'single':
      return state.value ?? undefined;
    case 'multiple':
      return state.value.length > 0 ? [...state.value] : undefined;
    case 'cloze':
    case 'match': {
      const entries = Object.entries(state.value).filter(([, v]) => Boolean(v));
      return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    case 'order':
      return state.touched ? [...state.value] : undefined;
    default:
      return assertNever(state);
  }
}

/**
 * Builds the submit payload, omitting unanswered questions.
 * @param questions: Quiz questions
 * @param answers: Answer states keyed by question id
 * @returns: Wire answers keyed by question id
 */
export function buildPayload(
  questions: ClientQuestion[],
  answers: AnswerMap
): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const q of questions) {
    const wire = normalizeForWire(answers[q.question_id]);
    if (wire !== undefined) {
      out[q.question_id] = wire;
    }
  }
  return out;
}

// Mutations below return new objects; the store is shallow-immutable.

/**
 * Selects the option of a single-choice question.
 * @param state: Answer state
 * @param optionId: Selected option
 * @returns: The new answer state
 */
export function setSingle(state: AnswerState, optionId: string): AnswerState {
  return state.kind === 'single' ? { kind: 'single', value: optionId } : state;
}

/**
 * Toggles an option of a multiple-choice question.
 * @param state: Answer state
 * @param optionId: Toggled option
 * @returns: The new answer state
 */
export function toggleMultiple(
  state: AnswerState,
  optionId: string
): AnswerState {
  if (state.kind !== 'multiple') {
    return state;
  }
  const has = state.value.includes(optionId);
  return {
    kind: 'multiple',
    value: has
      ? state.value.filter(v => v !== optionId)
      : [...state.value, optionId]
  };
}

/**
 * Fills or clears a cloze blank or match row.
 * @param state: Answer state
 * @param slotId: Blank or left-hand id
 * @param valueId: Selected id; empty string clears the slot
 * @returns: The new answer state
 */
export function setSlot(
  state: AnswerState,
  slotId: string,
  valueId: string
): AnswerState {
  if (state.kind !== 'cloze' && state.kind !== 'match') {
    return state;
  }
  const next = { ...state.value };
  if (valueId) {
    next[slotId] = valueId;
  } else {
    delete next[slotId];
  }
  return { kind: state.kind, value: next };
}

/**
 * Replaces the sequence of an order question.
 * @param state: Answer state
 * @param ids: New item order
 * @returns: The new answer state
 */
export function setOrder(state: AnswerState, ids: string[]): AnswerState {
  return state.kind === 'order'
    ? { kind: 'order', value: ids, touched: true }
    : state;
}

/**
 * Moves one item of an order question.
 * @param state: Answer state
 * @param from: Current index
 * @param to: Target index
 * @returns: The new answer state
 */
export function moveOrderItem(
  state: AnswerState,
  from: number,
  to: number
): AnswerState {
  if (state.kind !== 'order') {
    return state;
  }
  if (to < 0 || to >= state.value.length || from === to) {
    return state;
  }
  const next = [...state.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { kind: 'order', value: next, touched: true };
}

/**
 * Bank entries already used by other blanks, needed for `reuse: false`.
 * @param state: Answer state
 * @param exceptSlot: Slot to ignore
 * @returns: The used bank ids
 */
export function usedBankIds(
  state: AnswerState | undefined,
  exceptSlot: string
): Set<string> {
  if (!state || (state.kind !== 'cloze' && state.kind !== 'match')) {
    return new Set();
  }
  return new Set(
    Object.entries(state.value)
      .filter(([slot, value]) => slot !== exceptSlot && Boolean(value))
      .map(([, value]) => value)
  );
}

/**
 * Right-hand entries assigned more than once (a warning, not a block).
 * @param state: Answer state
 * @returns: The duplicated right-hand ids
 */
export function duplicateAssignments(state: AnswerState | undefined): string[] {
  if (!state || state.kind !== 'match') {
    return [];
  }
  const counts = new Map<string, number>();
  for (const value of Object.values(state.value)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

/**
 * Exhaustiveness check for switch statements.
 * @param x: Value that should be unreachable
 * @returns: Never; always throws
 */
function assertNever(x: never): never {
  throw new Error(`Unbehandelter Fragetyp: ${JSON.stringify(x)}`);
}
