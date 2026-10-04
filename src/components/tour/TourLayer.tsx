/**
 * The guided tour: the opening offer and the spotlight that walks through the interface.
 *
 * Rendered through a portal into `document.body`, because the highlighted regions live
 * in three different widgets (main view, sidebar, chat). Targets are found via existing
 * CSS classes and measured with `getBoundingClientRect`; a step whose target is not on
 * screen shows its text centred.
 */

import { CommandRegistry } from '@lumino/commands';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { CommandIDs } from '../../commands';
import { GraphitStore } from '../../state/store';
import { useCommands, useGraphit, useStore } from '../../state/useStore';
import {
  Size,
  FALLBACK_CARD_SIZE,
  cardPosition,
  Rect
} from '../../tour/placement';
import { TOUR_STEPS, TourStep } from '../../tour/steps';
import { expandPathTo, firstConcept } from '../../tour/demonstration';

/** Colour legend under the progress bar (a <details> element). */
const LEGEND = '.graphit-overview-legend';
/** "Lernpfad-Empfehlung" list (a <details> element, collapsed by default). */
const NEXT_STEPS = '.graphit-next';
/** Mastery block in the detail panel. */
const MASTERY = '.graphit-mastery';
/** Scrollable region inside a tab body. */
const SCROLL = '.graphit-scroll';
/** Chat widget, used to detect whether it is already open. */
const CHAT = '.jp-graphit-chat';

/**
 * Renders the tour offer or the current step, if a tour is active.
 * @returns: A portal into document.body, or null
 */
export function TourLayer(): JSX.Element | null {
  const state = useGraphit();
  const tour = state.tour;

  if (!tour) {
    return null;
  }
  return createPortal(
    tour.phase === 'ask' ? <TourOffer /> : <TourStepCard index={tour.step} />,
    document.body
  );
}

/**
 * The opening dialog asking whether to start the tour.
 * @returns: The dialog element
 */
function TourOffer(): JSX.Element {
  const store = useStore();
  const [dontAskAgain, setDontAskAgain] = React.useState(false);

  return (
    <div className="graphit-tour graphit-tour--offer">
      <div className="graphit-tour-backdrop" />
      <div
        className="graphit-tour-card graphit-tour-card--center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="graphit-tour-offer-title"
      >
        <h2 id="graphit-tour-offer-title">Kurze Einführung?</h2>
        <p>
          GRAPHIT hat einige Bereiche. Eine kurze Führung zeigt dir in{' '}
          {TOUR_STEPS.length} Schritten, wofür jeder davon da ist. Das dauert
          etwa zwei Minuten.
        </p>
        <label className="graphit-tour-remember">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={e => setDontAskAgain(e.target.checked)}
          />
          <span>Nicht wieder anzeigen</span>
        </label>
        <div className="graphit-tour-buttons">
          <button
            className="graphit-btn graphit-btn--quiet"
            onClick={() => store.declineTour(dontAskAgain)}
          >
            Später
          </button>
          <button
            className="graphit-btn graphit-btn--primary"
            onClick={() => store.startTour(dontAskAgain)}
            autoFocus
          >
            Einführung starten
          </button>
        </div>
        <p className="graphit-tour-footnote">
          Du findest die Einführung jederzeit unter „Anleitung“ wieder.
        </p>
      </div>
    </div>
  );
}

/**
 * One tour step: backdrop, highlight ring and the explanation card.
 * @param props: `index` of the step in TOUR_STEPS
 * @returns: The step element
 */
function TourStepCard(props: { index: number }): JSX.Element {
  const store = useStore();
  const step: TourStep = TOUR_STEPS[props.index] ?? TOUR_STEPS[0];
  useDemonstration(step, props.index);
  const target = useTargetRect(step, props.index);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const cardSize = useCardSize(cardRef, props.index);

  const isLast = props.index === TOUR_STEPS.length - 1;
  const isFirst = props.index === 0;

  // Recomputed on every render so the card follows the region on resize.
  const placement = target
    ? cardPosition(target, cardSize ?? FALLBACK_CARD_SIZE, {
        w: window.innerWidth,
        h: window.innerHeight
      })
    : null;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        store.endTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        store.tourNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        store.tourBack();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [store]);

  React.useEffect(() => {
    cardRef.current?.focus();
  }, [props.index]);

  // The backdrop swallows clicks and wheel events. For scrollable steps the wheel is
  // forwarded to the tab's scroll region.
  const forwardWheel = (e: React.WheelEvent) => {
    if (!step.scrollbar || !step.selector) {
      return;
    }
    const region = document.querySelector<HTMLElement>(step.selector);
    const scroller = region?.matches(SCROLL)
      ? region
      : region?.querySelector<HTMLElement>(SCROLL);
    if (!scroller) {
      return;
    }
    // deltaMode 1 = lines (Firefox); browsers assume 16px per line.
    const factor = e.deltaMode === 1 ? 16 : 1;
    scroller.scrollBy({ top: e.deltaY * factor, left: e.deltaX * factor });
  };

  return (
    <div className="graphit-tour">
      {/* Catches every click so the interface cannot be operated by accident. */}
      <div
        className="graphit-tour-backdrop"
        data-spotlight={target ? 'yes' : 'no'}
        onClick={() => undefined}
        onWheel={forwardWheel}
      />
      {target ? (
        <div
          className="graphit-tour-ring"
          style={{
            top: `${target.top}px`,
            left: `${target.left}px`,
            width: `${target.width}px`,
            height: `${target.height}px`
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        tabIndex={-1}
        className={
          target
            ? 'graphit-tour-card'
            : 'graphit-tour-card graphit-tour-card--center'
        }
        style={
          placement
            ? { top: `${placement.top}px`, left: `${placement.left}px` }
            : undefined
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="graphit-tour-title"
      >
        <div className="graphit-tour-header">
          <span className="graphit-tour-counter">
            Schritt {props.index + 1} von {TOUR_STEPS.length}
          </span>
          <button
            className="graphit-tour-close"
            onClick={() => store.endTour()}
            title="Einführung beenden (Escape)"
            aria-label="Einführung beenden"
          >
            ×
          </button>
        </div>

        <h2 id="graphit-tour-title">{step.title}</h2>
        {step.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}

        {step.selector && !target ? (
          <p className="graphit-tour-footnote">
            Dieser Bereich ist gerade nicht geöffnet, deshalb ist hier nichts
            hervorgehoben.
          </p>
        ) : null}

        <div className="graphit-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className="graphit-tour-dot"
              data-active={i === props.index}
            />
          ))}
        </div>

        <div className="graphit-tour-buttons">
          <button
            className="graphit-btn graphit-btn--quiet"
            onClick={() => store.endTour()}
          >
            Überspringen
          </button>
          <span className="graphit-tour-spacer" />
          <button
            className="graphit-btn"
            onClick={() => store.tourBack()}
            disabled={isFirst}
          >
            Zurück
          </button>
          <button
            className="graphit-btn graphit-btn--primary"
            onClick={() => store.tourNext()}
          >
            {isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Original state of everything the tour changed, so it can be restored. `null` means
 * "not touched"; `selection` uses `undefined` for that, since null is a real value.
 */
interface OriginalState {
  expanded: string[] | null;
  selection: string | null | undefined;
  legendOpen: boolean | null;
  nextStepsOpen: boolean | null;
  chatOpenedByTour: boolean;
  sidebarOpenedByTour: boolean;
}

/**
 * Performs the step's demonstration (expanded tree, selected concept, open chat, ...)
 * and undoes it again. An open chat is never replaced, and tree demonstrations wait
 * until the tree has loaded.
 * @param step: Current tour step
 * @param index: Index of the step
 */
function useDemonstration(step: TourStep, index: number): void {
  const store = useStore();
  const commands = useCommands();
  const original = React.useRef<OriginalState>({
    expanded: null,
    selection: undefined,
    legendOpen: null,
    nextStepsOpen: null,
    chatOpenedByTour: false,
    sidebarOpenedByTour: false
  });

  React.useEffect(() => {
    const demo = step.demo;
    if (!demo) {
      return;
    }
    // The record is mutated, never replaced, so action and cleanup share it.
    const record = original.current;
    // The target may only appear after a tab switch, so the action is retried; every
    // action is idempotent.
    const run = () => demonstrate(demo, store, commands, record);
    run();
    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 220);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      undoStep(demo, commands, record);
    };
  }, [step, index, store, commands]);

  // Unmount means the tour ended (last step, skip or Escape).
  React.useEffect(() => {
    const record = original.current;
    return () => {
      undoAll(record, store, commands);
    };
  }, [store, commands]);
}

/**
 * Performs one demonstration and records the original state.
 * @param demo: Demonstration to perform
 * @param store: The GRAPHIT store
 * @param commands: JupyterLab command registry
 * @param record: Original state record, updated in place
 */
function demonstrate(
  demo: NonNullable<TourStep['demo']>,
  store: GraphitStore,
  commands: CommandRegistry,
  record: OriginalState
): void {
  const state = store.state;

  if (demo === 'sidebar') {
    // The left area is only reachable from the main plugin, which records and restores it.
    if (!commands.hasCommand(CommandIDs.showSidebar)) {
      return;
    }
    record.sidebarOpenedByTour = true;
    void commands.execute(CommandIDs.showSidebar);
    return;
  }

  if (demo === 'legend') {
    const element = document.querySelector<HTMLDetailsElement>(LEGEND);
    if (element && !element.open) {
      if (record.legendOpen === null) {
        record.legendOpen = false;
      }
      element.open = true;
    }
    return;
  }

  if (demo === 'recommendation') {
    const element = document.querySelector<HTMLDetailsElement>(NEXT_STEPS);
    if (element && !element.open) {
      if (record.nextStepsOpen === null) {
        record.nextStepsOpen = false;
      }
      element.open = true;
    }
    return;
  }

  if (demo === 'mastery') {
    // A scroll position needs no undo.
    document
      .querySelector<HTMLElement>(MASTERY)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const concept = firstConcept(state.tree);
  if (!concept) {
    return; // Tree not loaded yet; the step stays text-only.
  }

  if (demo === 'tree') {
    if (record.expanded === null) {
      record.expanded = state.expanded;
    }
    const nextExpanded = expandPathTo(state.tree, state.expanded, concept.id);
    if (nextExpanded.length !== state.expanded.length) {
      store.setExpanded(nextExpanded);
    }
    return;
  }

  if (demo === 'concept') {
    if (state.selection?.id === concept.id) {
      return;
    }
    if (record.selection === undefined) {
      record.selection = state.selection?.id ?? null;
    }
    if (record.expanded === null) {
      record.expanded = state.expanded;
    }
    store.selectById(concept.id);
    return;
  }

  if (demo === 'chat') {
    if (document.querySelector(CHAT)) {
      return; // Already open, possibly with a conversation; leave it alone.
    }
    if (!commands.hasCommand(CommandIDs.openChat)) {
      return; // The chat plugin may have failed to load.
    }
    record.chatOpenedByTour = true;
    void commands.execute(CommandIDs.openChat, {
      scope: { id: concept.id, name: concept.name, type: 'concept' }
    });
  }
}

/**
 * Undoes the demonstrations that take up screen space (sidebar, legend, recommendation,
 * chat) as soon as their step is left. Tree expansion and selection stay until the end.
 * @param demo: Demonstration of the step being left
 * @param commands: JupyterLab command registry
 * @param record: Original state record
 */
function undoStep(
  demo: NonNullable<TourStep['demo']>,
  commands: CommandRegistry,
  record: OriginalState
): void {
  if (demo === 'legend' && record.legendOpen !== null) {
    const element = document.querySelector<HTMLDetailsElement>(LEGEND);
    if (element) {
      element.open = record.legendOpen;
    }
    record.legendOpen = null;
  }
  if (demo === 'recommendation' && record.nextStepsOpen !== null) {
    const element = document.querySelector<HTMLDetailsElement>(NEXT_STEPS);
    if (element) {
      element.open = record.nextStepsOpen;
    }
    record.nextStepsOpen = null;
  }
  if (demo === 'sidebar' && record.sidebarOpenedByTour) {
    record.sidebarOpenedByTour = false;
    if (commands.hasCommand(CommandIDs.restoreSidebar)) {
      void commands.execute(CommandIDs.restoreSidebar);
    }
  }
  if (demo === 'chat' && record.chatOpenedByTour) {
    // Reset first, so a chat the student reopened later is not closed at the end.
    record.chatOpenedByTour = false;
    if (commands.hasCommand(CommandIDs.closeChat)) {
      void commands.execute(CommandIDs.closeChat);
    }
  }
}

/**
 * Undoes all demonstrations when the tour ends.
 * @param record: Original state record
 * @param store: The GRAPHIT store
 * @param commands: JupyterLab command registry
 */
function undoAll(
  record: OriginalState,
  store: GraphitStore,
  commands: CommandRegistry
): void {
  // Safety net for a tour that ended during such a step.
  undoStep('chat', commands, record);
  undoStep('legend', commands, record);
  undoStep('recommendation', commands, record);
  undoStep('sidebar', commands, record);

  // Selection before expansion, because selecting expands the ancestors again.
  if (record.selection !== undefined) {
    if (record.selection === null) {
      store.setSelection(null);
    } else {
      store.selectById(record.selection);
    }
  }
  if (record.expanded !== null) {
    store.setExpanded(record.expanded);
  }
}

/**
 * Tracks the position of the step's target region. Measured immediately, after the
 * next frame and after a timeout, because a tab switch changes the layout in the same
 * commit; also on resize and on any scroll.
 * @param step: Current tour step
 * @param index: Index of the step
 * @returns: The target rectangle, or null if not on screen
 */
function useTargetRect(step: TourStep, index: number): Rect | null {
  const [rect, setRect] = React.useState<Rect | null>(null);

  React.useLayoutEffect(() => {
    let cancelled = false;

    const measure = () => {
      if (cancelled) {
        return;
      }
      const next = step.selector
        ? measureElement(step.selector, step.padding ?? 0)
        : null;
      setRect(prev => (sameRect(prev, next) ? prev : next));
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 200);
    window.addEventListener('resize', measure);
    // Capture phase, to also see scrolling inside nested containers.
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [index, step.selector]);

  return rect;
}

/**
 * Measures an element in viewport coordinates.
 * @param selector: CSS selector of the element
 * @param padding: Extra pixels on every side
 * @returns: The rectangle, or null if missing, hidden or the selector is invalid
 */
function measureElement(selector: string, padding = 0): Rect | null {
  let element: Element | null = null;
  try {
    element = document.querySelector(selector);
  } catch {
    // An invalid selector is a bug in the step list; do not break the tour.
    return null;
  }
  if (!element) {
    return null;
  }
  const r = element.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) {
    return null; // collapsed or hidden
  }
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + 2 * padding,
    height: r.height + 2 * padding
  };
}

/**
 * Compares two rectangles with sub-pixel tolerance.
 * @param a: First rectangle
 * @param b: Second rectangle
 * @returns: True if both are null or equal within one pixel
 */
function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

/**
 * Measures the card's outer size before paint and whenever it changes (e.g. text
 * rewrapping on a narrow window).
 * @param ref: Ref to the card element
 * @param step: Step index, triggers a new measurement
 * @returns: The card size, or null before the first measurement
 */
function useCardSize(
  ref: React.RefObject<HTMLDivElement>,
  step: number
): Size | null {
  const [size, setSize] = React.useState<Size | null>(null);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = () => {
      const r = element.getBoundingClientRect();
      setSize(prev =>
        prev && Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height }
      );
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, step]);

  return size;
}
