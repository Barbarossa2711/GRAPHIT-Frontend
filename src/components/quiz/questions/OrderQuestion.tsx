/**
 * Order question: drag-and-drop sorting with @dnd-kit. The up/down buttons provide
 * keyboard access and a fallback if pointer dragging conflicts with Lumino. The
 * delivered order is not reshuffled.
 */

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as React from 'react';

import { OrderPayload } from '../../../api/types';
import { moveOrderItem, setOrder } from '../../../quiz/answerModel';
import { QuestionProps } from './QuestionRenderer';

/**
 * Renders the sortable list.
 * @param props: Question props with the order payload
 * @returns: The sortable list
 */
export function OrderQuestion(
  props: QuestionProps & { payload: OrderPayload }
): JSX.Element {
  const ids =
    props.answer.kind === 'order'
      ? props.answer.value
      : props.payload.items.map(i => i.id);

  const textById = React.useMemo(
    () => new Map(props.payload.items.map(i => [i.id, i.text])),
    [props.payload.items]
  );

  const sensors = useSensors(
    // Activation distance, so a click does not start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) {
      return;
    }
    props.onChange(setOrder(props.answer, arrayMove(ids, from, to)));
  };

  const move = (from: number, to: number) => {
    props.onChange(moveOrderItem(props.answer, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="graphit-order-list">
          {ids.map((id, i) => (
            <SortableRow
              key={id}
              id={id}
              index={i}
              total={ids.length}
              text={textById.get(id) ?? id}
              disabled={props.disabled}
              onMove={move}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

/**
 * One draggable item with handle and move buttons.
 * @param props: Item id, index, total, text, disabled flag and move callback
 * @returns: The list item
 */
function SortableRow(props: {
  id: string;
  index: number;
  total: number;
  text: string;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: props.id, disabled: props.disabled });

  return (
    <li
      ref={setNodeRef}
      className="graphit-order-item"
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Focusable for keyboard dragging, so not aria-hidden. */}
      <span
        className="graphit-order-handle"
        title={`"${props.text}" verschieben`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </span>
      <span className="graphit-order-index">{props.index + 1}</span>
      <span className="graphit-order-text">{props.text}</span>
      <span className="graphit-order-buttons">
        <button
          className="graphit-btn graphit-btn--quiet"
          disabled={props.disabled || props.index === 0}
          onClick={() => props.onMove(props.index, props.index - 1)}
          aria-label={`"${props.text}" nach oben`}
          title="Nach oben"
        >
          ↑
        </button>
        <button
          className="graphit-btn graphit-btn--quiet"
          disabled={props.disabled || props.index === props.total - 1}
          onClick={() => props.onMove(props.index, props.index + 1)}
          aria-label={`"${props.text}" nach unten`}
          title="Nach unten"
        >
          ↓
        </button>
      </span>
    </li>
  );
}
