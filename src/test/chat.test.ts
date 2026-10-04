import { describe, expect, it } from 'vitest';

import { renderInline } from '../components/chat/ChatView';

/**
 * The tutor emits `[[ID|Label]]` to point at another concept. The text comes from a
 * language model, so what becomes a clickable action is pinned down here.
 */
describe('renderInline — concept links', () => {
  /**
   * Renders text and collects the concept ids handed to the callback during rendering.
   * @param text: Message text
   * @returns: The collected ids
   */
  function ids(text: string): string[] {
    const seen: string[] = [];
    renderInline(text, id => seen.push(id));
    return seen;
  }

  /**
   * Renders text, clicks every rendered element and collects the selected ids.
   * @param text: Message text
   * @returns: The selected concept ids
   */
  function clickAll(text: string): string[] {
    const seen: string[] = [];
    for (const part of renderInline(text, id => seen.push(id))) {
      const el = part as { props?: { onClick?: () => void } };
      el?.props?.onClick?.();
    }
    return seen;
  }

  it('turns a link into a clickable element carrying the id', () => {
    expect(clickAll('siehe [[BDT_CH06_T04_C01|Apache Kafka]]')).toEqual([
      'BDT_CH06_T04_C01'
    ]);
  });

  it('keeps the label as the visible text', () => {
    const parts = renderInline('siehe [[BDT_X1|Apache Kafka]]');
    const labels = parts.map(p =>
      typeof p === 'string'
        ? p
        : (p as { props?: { children?: unknown } })?.props?.children
    );
    expect(labels).toContain('Apache Kafka');
  });

  // Ids outside the corpus shape stay literal text and never reach commands.execute.
  it('ignores ids with unexpected characters', () => {
    expect(clickAll('[[../etc/passwd|böse]]')).toEqual([]);
    expect(clickAll('[[BDT X|Leerzeichen]]')).toEqual([]);
  });

  it('still renders code and bold', () => {
    const parts = renderInline('ein `Wort` und **fett**');
    expect(parts.length).toBeGreaterThan(2);
  });

  it('leaves plain text untouched', () => {
    expect(renderInline('nur Text')).toEqual(['nur Text']);
  });
});
