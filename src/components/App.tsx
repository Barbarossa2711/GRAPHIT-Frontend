/** Tab shell of the main widget. */

import * as React from 'react';

import { dueCount } from '../state/selectors';
import { MainTab } from '../state/types';
import { useGraphit, useStore } from '../state/useStore';
import { NodeDetail } from './detail/NodeDetail';
import { GuideView } from './guide/GuideView';
import { QuizPanel } from './quiz/QuizPanel';
import { BatchReviewView } from './review/BatchReviewView';
import { ReviewDueView } from './review/ReviewDueView';
import { StatisticsView } from './stats/StatisticsView';
import { TourLayer } from './tour/TourLayer';
import { DomainTree } from './tree/DomainTree';
import { SplitHandle } from './tree/SplitHandle';
import { TreeOverview } from './tree/TreeOverview';

const TABS: Array<{ id: MainTab; label: string }> = [
  { id: 'concepts', label: 'Konzepte' },
  { id: 'stats', label: 'Statistik' },
  { id: 'review', label: 'Wiederholung' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'guide', label: 'Anleitung' }
];

/** Tab that only exists while a quiz is running. */
const TRANSIENT_TAB: MainTab = 'quiz';

/** Fallback when the active tab is not available. */
const HOME_TAB: MainTab = 'concepts';

/**
 * Main view with tab bar and the active tab's content. All views share one React root,
 * since they share selection, progress and quiz state.
 * @returns: The main view
 */
export function App(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const due = dueCount(state.progress);
  // The divider measures the pointer against this row.
  const splitRef = React.useRef<HTMLDivElement>(null);

  // The quiz tab only exists while a single-concept quiz or a scope quiz (combined quiz
  // over a tree node) runs. The filter covers every path that drops the quiz, e.g. a
  // persisted tab from a previous session. Review sessions use their own tab.
  const scopeQuiz =
    state.batchQuiz?.origin === 'scope' ? state.batchQuiz : null;
  const quizTabActive = state.quiz !== null || scopeQuiz !== null;
  const tabs = TABS.filter(t => t.id !== TRANSIENT_TAB || quizTabActive);
  const activeTab = tabs.some(t => t.id === state.activeTab)
    ? state.activeTab
    : HOME_TAB;

  return (
    <div className="graphit-root">
      <div className="graphit-tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className="graphit-tab"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => store.setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'review' && due > 0 ? (
              <span className="graphit-tab-badge">{due}</span>
            ) : null}
          </button>
        ))}
        <span style={{ flex: '1 1 auto' }} />
        <button
          className="graphit-tab"
          onClick={() => void store.refreshProgress({ force: true })}
          title="Lernstand neu laden"
        >
          ⟳
        </button>
      </div>

      <div className="graphit-body">
        {activeTab === 'concepts' ? (
          <div className="graphit-concepts">
            <TreeOverview />
            {/* A CSS variable instead of an inline width, so the narrow-panel media query can override it. */}
            <div
              className="graphit-split"
              ref={splitRef}
              style={
                {
                  '--graphit-split-left': `${state.splitRatio}%`
                } as React.CSSProperties
              }
            >
              <div className="graphit-split-left">
                <DomainTree />
              </div>
              <SplitHandle containerRef={splitRef} />
              <div className="graphit-split-right">
                <NodeDetail />
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'stats' ? <StatisticsView /> : null}
        {activeTab === 'review' ? <ReviewDueView /> : null}
        {activeTab === 'quiz' ? (
          scopeQuiz ? (
            <BatchReviewView />
          ) : (
            <div className="graphit-scroll">
              <QuizPanel />
            </div>
          )
        ) : null}
        {activeTab === 'guide' ? <GuideView /> : null}
      </div>

      {/* Renders into document.body via a portal while a tour is active. */}
      <TourLayer />
    </div>
  );
}
