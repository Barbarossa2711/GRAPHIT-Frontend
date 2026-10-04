/**
 * Splits a cloze `text` into literal segments and blank placeholders.
 *
 * `blanks` is authoritative, not the regex result:
 *   - a `{{x}}` not listed in `blanks` is rendered as literal text (no answer slot);
 *   - a listed blank missing from the text still needs an input, otherwise it could
 *     never be filled.
 */

import { ClozePayload } from '../api/types';

export type ClozeSegment =
  { kind: 'text'; text: string } | { kind: 'blank'; blankId: string };

export interface ParsedCloze {
  segments: ClozeSegment[];
  /** Blanks declared in `blanks` but missing from `text`; rendered separately. */
  orphanBlanks: string[];
  /** `{{x}}` found in the text but not declared; rendered literally. */
  undeclared: string[];
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Parses a cloze payload into renderable segments.
 * @param payload: Cloze question payload
 * @returns: Segments plus orphan and undeclared blanks
 */
export function parseCloze(payload: ClozePayload): ParsedCloze {
  const declared = new Set(payload.blanks);
  const seen = new Set<string>();
  const undeclared: string[] = [];
  const segments: ClozeSegment[] = [];

  let cursor = 0;
  PLACEHOLDER.lastIndex = 0;

  for (;;) {
    const match = PLACEHOLDER.exec(payload.text);
    if (!match) {
      break;
    }
    if (match.index > cursor) {
      segments.push({
        kind: 'text',
        text: payload.text.slice(cursor, match.index)
      });
    }
    const id = match[1];
    if (declared.has(id)) {
      seen.add(id);
      segments.push({ kind: 'blank', blankId: id });
    } else {
      undeclared.push(id);
      segments.push({ kind: 'text', text: match[0] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < payload.text.length) {
    segments.push({ kind: 'text', text: payload.text.slice(cursor) });
  }

  const orphanBlanks = payload.blanks.filter(b => !seen.has(b));

  if (undeclared.length > 0) {
    console.warn(
      '[GRAPHIT] cloze: Platzhalter ohne Eintrag in "blanks":',
      undeclared
    );
  }
  if (orphanBlanks.length > 0) {
    console.warn(
      '[GRAPHIT] cloze: "blanks" ohne Platzhalter im Text:',
      orphanBlanks
    );
  }

  return { segments, orphanBlanks, undeclared };
}
