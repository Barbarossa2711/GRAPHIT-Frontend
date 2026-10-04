/** The expandable lecture hierarchy with progress badges. */

import * as React from 'react';

import { ConceptProgress, DomainNode, RollupStats } from '../../api/types';
import {
  conceptIndex,
  formatDue,
  isConceptProgress,
  isOverdue,
  nodeStats
} from '../../state/selectors';
import { useGraphit, useStore } from '../../state/useStore';
import {
  EmptyState,
  ErrorBanner,
  MasteryBar,
  ReadyLock,
  Spinner,
  AchievementBar
} from '../common/Common';
import { useFlattenedTree, VisibleRow } from './useFlattenedTree';

/**
 * Lecture tree with filter, keyboard navigation and progress badges.
 * @returns: The tree element
 */
export function DomainTree(): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const index = React.useMemo(
    () => conceptIndex(state.progress),
    [state.progress]
  );
  const { rows, matchCount } = useFlattenedTree(
    state.tree,
    state.expanded,
    state.filter
  );

  const listRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (
    event: React.KeyboardEvent,
    row: VisibleRow,
    i: number
  ) => {
    const focusRow = (target: number) => {
      const el =
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          '.graphit-tree-row'
        )[target];
      el?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(Math.max(i - 1, 0));
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) {
          event.preventDefault();
          store.toggleExpanded(row.node.id);
        }
        break;
      case 'ArrowLeft':
        if (row.hasChildren && row.expanded) {
          event.preventDefault();
          store.toggleExpanded(row.node.id);
        }
        break;
      default:
        break;
    }
  };

  return (
    <>
      <h3 className="graphit-tree-title">Vorlesungsstruktur</h3>
      <div className="graphit-toolbar">
        <input
          type="search"
          placeholder="Konzepte filtern …"
          value={state.filter}
          onChange={e => store.setFilter(e.target.value)}
          aria-label="Konzepte filtern"
        />
        {state.filter ? (
          <span className="graphit-small graphit-muted">
            {matchCount} Treffer
          </span>
        ) : null}
        <button
          className="graphit-btn graphit-btn--quiet"
          onClick={() => void store.refreshTree(true)}
          title="Struktur neu vom Server laden"
        >
          Baum neu laden
        </button>
      </div>

      <div className="graphit-tree" ref={listRef} role="tree">
        {state.treeStatus === 'loading' ? (
          <div className="graphit-empty">
            <Spinner /> Vorlesungsstruktur wird geladen …
          </div>
        ) : null}

        {state.treeError ? (
          <div style={{ padding: '0 12px' }}>
            <ErrorBanner
              error={state.treeError}
              onRetry={() => void store.refreshTree(true)}
            />
          </div>
        ) : null}

        {state.treeStatus === 'ready' && rows.length === 0 ? (
          <EmptyState
            title={state.filter ? 'Keine Treffer' : 'Das Domain Model ist leer'}
            body={
              state.filter
                ? 'Für diesen Filter gibt es keine passenden Knoten.'
                : 'Der Server hat keine Vorlesungsstruktur geliefert. Wahrscheinlich fehlt im Graphen die :Lecture-Wurzel.'
            }
          />
        ) : null}

        {rows.map((row, i) => (
          <TreeRow
            key={row.node.id}
            row={row}
            index={i}
            selected={state.selection?.id === row.node.id}
            stats={nodeStats(row.node, index, state.progress)}
            onToggle={() => store.toggleExpanded(row.node.id)}
            onSelect={() => store.setSelection(row.node)}
            onKeyDown={e => onKeyDown(e, row, i)}
          />
        ))}
      </div>
    </>
  );
}

interface RowProps {
  row: VisibleRow;
  index: number;
  selected: boolean;
  stats: ConceptProgress | RollupStats | undefined;
  onToggle: () => void;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * One tree row with chevron, name and badges.
 * @param props: Row data, index, selection state, statistics and callbacks
 * @returns: The row button
 */
const TreeRow = React.memo(function TreeRow(props: RowProps): JSX.Element {
  const { row, stats } = props;
  const node: DomainNode = row.node;

  return (
    <button
      className="graphit-tree-row"
      style={{ paddingLeft: 6 + row.depth * 16 }}
      data-type={node.type}
      data-empty={row.emptyBranch}
      role="treeitem"
      aria-selected={props.selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      tabIndex={props.index === 0 ? 0 : -1}
      onClick={props.onSelect}
      onKeyDown={props.onKeyDown}
      // Full name as tooltip, since long names are truncated.
      title={node.name}
    >
      <span
        className="graphit-tree-chevron"
        onClick={e => {
          if (row.hasChildren) {
            e.stopPropagation();
            props.onToggle();
          }
        }}
      >
        {row.hasChildren ? (row.expanded ? '▾' : '▸') : ''}
      </span>

      {/* Double-click on the label (not the chevron) toggles the subtree. */}
      <span
        className="graphit-tree-name"
        onDoubleClick={e => {
          if (!row.hasChildren) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          props.onToggle();
        }}
      >
        {node.name}
        {row.emptyBranch ? ' (leer)' : ''}
      </span>

      <span className="graphit-tree-meta">
        <RowMeta stats={stats} />
      </span>
    </button>
  );
});

/**
 * Badges of a row: visits, due chip, lock and status dot or rollup bar.
 * @param props: Concept progress or rollup statistics
 * @returns: The badges, or null without statistics
 */
function RowMeta(props: {
  stats: ConceptProgress | RollupStats | undefined;
}): JSX.Element | null {
  const { stats } = props;
  if (!stats) {
    return null;
  }

  if (isConceptProgress(stats)) {
    // Due chips only for concepts that passed the gate, matching the review tab.
    const overdue = isOverdue(stats);
    const soon =
      stats.gate_passed &&
      stats.days_until_due !== null &&
      stats.days_until_due > 0 &&
      stats.days_until_due <= 7;
    return (
      <>
        {/* Visits and quiz results are separate signals. */}
        {stats.visited_count > 0 ? (
          <span
            className="graphit-tree-visits"
            title={`${stats.visited_count}× im Chat angeschaut (verändert die Mastery nicht)`}
          >
            👁 {stats.visited_count}
          </span>
        ) : null}
        {overdue || soon ? (
          <span className="graphit-due-chip" data-overdue={overdue}>
            {formatDue(stats.days_until_due)}
          </span>
        ) : null}
        <ReadyLock ready={stats.prereqs_met} missing={stats.prereqs_missing} />
        <MasteryBar mastery={stats.mastery} peak={stats.mastery_peak} />
        <span className="graphit-dot" data-status={stats.status} />
      </>
    );
  }

  return (
    <>
      <span className="graphit-small graphit-muted">
        {stats.mastered}/{stats.total}
      </span>
      <AchievementBar stats={stats} />
    </>
  );
}
