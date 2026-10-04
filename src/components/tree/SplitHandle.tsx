/**
 * Draggable divider between tree and detail panel: a `role="separator"` element using
 * pointer events with pointer capture (covers mouse, touch and pen) and arrow keys.
 */

import * as React from 'react';

import { DEFAULT_SPLIT_RATIO } from '../../state/store';
import { useGraphit, useStore } from '../../state/useStore';

/** Percentage points one arrow-key press moves the divider. */
const STEP = 2;

/**
 * Divider handle; double-click or Home resets the default width.
 * @param props: `containerRef` of the row the ratio is measured against
 * @returns: The separator element
 */
export function SplitHandle(props: {
  /** Flex row holding both columns; the ratio is measured against it. */
  containerRef: React.RefObject<HTMLElement>;
}): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const [dragging, setDragging] = React.useState(false);

  const ratioFromPointer = (clientX: number): number | null => {
    const box = props.containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return null;
    }
    return ((clientX - box.left) / box.width) * 100;
  };

  return (
    <div
      className="graphit-splitter"
      data-dragging={dragging}
      role="separator"
      aria-orientation="vertical"
      aria-label="Breite von Baum und Detailbereich"
      aria-valuenow={state.splitRatio}
      aria-valuemin={25}
      aria-valuemax={75}
      tabIndex={0}
      title="Ziehen zum Verschieben, Doppelklick setzt zurück"
      onPointerDown={e => {
        // Pointer capture keeps fast drags on the handle.
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={e => {
        if (!dragging) {
          return;
        }
        const next = ratioFromPointer(e.clientX);
        if (next !== null) {
          store.setSplitRatio(next);
        }
      }}
      onPointerUp={e => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => store.setSplitRatio(DEFAULT_SPLIT_RATIO)}
      onKeyDown={e => {
        // Keyboard support for accessibility.
        if (e.key === 'ArrowLeft') {
          store.setSplitRatio(state.splitRatio - STEP);
        } else if (e.key === 'ArrowRight') {
          store.setSplitRatio(state.splitRatio + STEP);
        } else if (e.key === 'Home') {
          store.setSplitRatio(DEFAULT_SPLIT_RATIO);
        } else {
          return;
        }
        e.preventDefault();
      }}
    />
  );
}
