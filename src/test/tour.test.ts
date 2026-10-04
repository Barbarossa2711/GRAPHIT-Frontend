/**
 * The tour's state machine. Its failure modes are silent on screen: an offer that never
 * arrives, arrives twice, or a "don't show again" that is not remembered.
 */

import { IStateDB } from '@jupyterlab/statedb';
import { describe, expect, it } from 'vitest';

import { Persistence } from '../state/persistence';
import { DEFAULT_CONFIG, GraphitStore } from '../state/store';
import { DomainNode } from '../api/types';
import { TOUR_STEPS } from '../tour/steps';
import { expandPathTo, firstConcept } from '../tour/demonstration';

// The suite runs in the node environment; persistence only needs the two timer functions.
const global = globalThis as unknown as { window?: unknown };
global.window ??= {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (handle: number) => clearTimeout(handle)
};

/**
 * Minimal in-memory IStateDB stand-in.
 * @param seed: Initial entries
 * @returns: The fake database and its backing map
 */
function fakeDb(seed: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(seed));
  return {
    db: {
      fetch: async (id: string) => data.get(id),
      save: async (id: string, value: unknown) => {
        data.set(id, value);
      },
      remove: async (id: string) => {
        data.delete(id);
      },
      list: async () => ({
        ids: [...data.keys()],
        values: [...data.values()]
      }),
      toJSON: async () => Object.fromEntries(data)
    },
    data
  };
}

/**
 * Creates a store backed by a fake state database.
 * @param seed: Initial database entries
 * @returns: The store and the database contents
 */
function store(seed: Record<string, unknown> = {}) {
  const { db, data } = fakeDb(seed);
  const s = new GraphitStore(
    DEFAULT_CONFIG,
    new Persistence(db as unknown as IStateDB)
  );
  return { s, data };
}

describe('Tour: the offer', () => {
  it('waits with the offer until the stored state has been read', async () => {
    const { s } = store();
    s.offerTour();
    expect(s.state.tour).toBeNull();

    await s.restore();
    expect(s.state.tour?.phase).toBe('ask');
  });

  it('also offers when the request arrives after loading', async () => {
    const { s } = store();
    await s.restore();
    expect(s.state.tour).toBeNull();

    s.offerTour();
    expect(s.state.tour?.phase).toBe('ask');
  });

  it('asks at most once per session', async () => {
    const { s } = store();
    await s.restore();
    s.offerTour();
    s.declineTour(false);
    expect(s.state.tour).toBeNull();

    // Main view opened a second time in the same session.
    s.offerTour();
    expect(s.state.tour).toBeNull();
  });

  it('does not ask once the decision is stored', async () => {
    const { s } = store({ 'graphit:tour': { dismissed: true } });
    await s.restore();
    s.offerTour();
    expect(s.state.tour).toBeNull();
    expect(s.state.tourDismissed).toBe(true);
  });

  it('does not ask over a running quiz', async () => {
    const { s } = store();
    await s.restore();
    s.showCandidates([], 'Kapitel 2'); // creates quiz state
    expect(s.state.quiz).not.toBeNull();

    s.offerTour();
    expect(s.state.tour).toBeNull();
  });
});

describe('Tour: remembering the decision', () => {
  it('remembers the checkbox when declining', async () => {
    const { s, data } = store();
    await s.restore();
    s.offerTour();
    s.declineTour(true);

    expect(s.state.tourDismissed).toBe(true);
    expect(data.get('graphit:tour')).toEqual({ dismissed: true });
  });

  it('remembers the checkbox even when the tour is started', async () => {
    const { s, data } = store();
    await s.restore();
    s.offerTour();
    s.startTour(true);

    expect(s.state.tour?.phase).toBe('running');
    expect(data.get('graphit:tour')).toEqual({ dismissed: true });
  });

  it('remembers nothing when declining without the checkbox', async () => {
    const { s, data } = store();
    await s.restore();
    s.offerTour();
    s.declineTour(false);

    expect(s.state.tourDismissed).toBe(false);
    expect(data.get('graphit:tour')).toBeUndefined();
  });
});

describe('Tour: walking through', () => {
  it('moves forward and back and stops at the beginning', async () => {
    const { s } = store();
    await s.restore();
    s.startTour();

    expect(s.state.tour?.step).toBe(0);
    s.tourBack();
    expect(s.state.tour?.step).toBe(0);

    s.tourNext();
    s.tourNext();
    expect(s.state.tour?.step).toBe(2);
    s.tourBack();
    expect(s.state.tour?.step).toBe(1);
  });

  it('ends after the last step and remembers that', async () => {
    const { s, data } = store();
    await s.restore();
    s.startTour();
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      s.tourNext();
    }

    expect(s.state.tour).toBeNull();
    expect(data.get('graphit:tour')).toEqual({ dismissed: true });
  });

  it('remembers nothing when cancelled early', async () => {
    const { s, data } = store();
    await s.restore();
    s.startTour();
    s.tourNext();
    s.endTour();

    expect(s.state.tour).toBeNull();
    expect(s.state.tourDismissed).toBe(false);
    expect(data.get('graphit:tour')).toBeUndefined();
  });
});

describe('Tour: the tab afterwards', () => {
  it('restores the tab the student was on', async () => {
    const { s } = store();
    await s.restore();
    s.setActiveTab('stats');
    s.startTour();

    // Any step that switches the tab.
    const targetTab = TOUR_STEPS.findIndex(step => step.tab === 'guide');
    expect(targetTab).toBeGreaterThan(-1);
    for (let i = 0; i < targetTab; i++) {
      s.tourNext();
    }
    expect(s.state.activeTab).toBe('guide');

    s.endTour();
    expect(s.state.activeTab).toBe('stats');
  });

  it('restores the tab after a complete run as well', async () => {
    const { s } = store();
    await s.restore();
    s.setActiveTab('review');
    s.startTour();
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      s.tourNext();
    }
    expect(s.state.activeTab).toBe('review');
  });
});

describe('Tour: the content', () => {
  it('has unique ids and text everywhere', () => {
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.body.every(p => p.trim().length > 0)).toBe(true);
    }
  });

  it('only targets GRAPHIT classes', () => {
    // The tour must not highlight parts of the JupyterLab UI it knows nothing about.
    for (const step of TOUR_STEPS) {
      if (!step.selector) {
        continue;
      }
      expect(step.selector.startsWith('.')).toBe(true);
      expect(step.selector).toMatch(/\.(graphit|jp-graphit)-/);
    }
  });
});

describe('Tour: demonstrations', () => {
  const tree: DomainNode[] = [
    {
      id: 'L',
      name: 'Vorlesung',
      type: 'lecture',
      children: [
        {
          id: 'K1',
          name: 'Kapitel 1',
          type: 'chapter',
          children: [
            {
              id: 'T1',
              name: 'Thema 1',
              type: 'topic',
              children: [
                { id: 'C1', name: 'Konzept 1', type: 'concept', children: [] },
                { id: 'C2', name: 'Konzept 2', type: 'concept', children: [] }
              ]
            }
          ]
        },
        {
          id: 'K2',
          name: 'Kapitel 2',
          type: 'chapter',
          children: [
            { id: 'C3', name: 'Konzept 3', type: 'concept', children: [] }
          ]
        }
      ]
    }
  ];

  it('finds the first concept depth first, not breadth first', () => {
    // Breadth first would find C3, which hangs directly off a chapter.
    expect(firstConcept(tree)?.id).toBe('C1');
  });

  it('handles an empty or missing tree', () => {
    expect(firstConcept(null)).toBeNull();
    expect(firstConcept([])).toBeNull();
  });

  it('expands exactly the ancestors and keeps open nodes open', () => {
    expect(expandPathTo(tree, [], 'C1').sort()).toEqual(['K1', 'L', 'T1']);
    expect(expandPathTo(tree, ['K2'], 'C1').sort()).toEqual([
      'K1',
      'K2',
      'L',
      'T1'
    ]);
  });

  it('adds no duplicates when the branch is already open', () => {
    const expanded = ['L', 'K1', 'T1'];
    expect(expandPathTo(tree, expanded, 'C1')).toHaveLength(3);
  });

  it('only performs the seven known demonstrations', () => {
    const allowed = new Set([
      'sidebar',
      'legend',
      'recommendation',
      'tree',
      'concept',
      'mastery',
      'chat'
    ]);
    for (const step of TOUR_STEPS) {
      if (step.demo) {
        expect(allowed.has(step.demo)).toBe(true);
      }
    }
    // A concept must be selected before the chat, otherwise the chat has no topic.
    const conceptStep = TOUR_STEPS.findIndex(s => s.demo === 'concept');
    const chatStep = TOUR_STEPS.findIndex(s => s.demo === 'chat');
    expect(conceptStep).toBeGreaterThan(-1);
    expect(chatStep).toBeGreaterThan(conceptStep);
  });
});
