import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, parseISO } from 'date-fns';
import { useTodoTags, useTodos, type Todo } from '../hooks/useTodos';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(todo: Todo): string {
  const start = format(parseISO(todo.startDate), 'EEE, MMM d');
  if (todo.endDate && todo.endDate !== todo.startDate) {
    const end = format(parseISO(todo.endDate), 'EEE, MMM d');
    return `${start} → ${end}`;
  }
  return start;
}

type Group = {
  key: string;
  label: string;
  items: Todo[];
  danger?: boolean;
  color?: string;
};

function normalizeTag(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function SortableTodoRow({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${className} ${isDragging ? 'opacity-70' : ''}`}
    >
      <button
        type="button"
        className="shrink-0 rounded p-1 text-subtle hover:bg-surface2 hover:text-fg"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      {children}
    </li>
  );
}

export default function Todos() {
  const { todos, isLoading, error, createTodo, updateTodo, toggleDone, deleteTodo, reorderTodos } =
    useTodos();
  const tagsQuery = useTodoTags();

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(todayDateString());
  const [useRange, setUseRange] = useState(false);
  const [endDate, setEndDate] = useState(todayDateString());
  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editHasEnd, setEditHasEnd] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [groupBy, setGroupBy] = useState<'date' | 'tag'>('date');

  const today = todayDateString();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const tags = tagsQuery.data ?? [];
  const tagColorByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) {
      map.set(tag.name, tag.color);
    }
    return map;
  }, [tags]);

  const activeTodos = useMemo(
    () =>
      todos
        .filter((todo) => !todo.done)
        .sort((a, b) => (a.order === b.order ? a.createdAt.localeCompare(b.createdAt) : a.order - b.order)),
    [todos],
  );

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'date') {
      const overdue = activeTodos.filter((t) => t.startDate < today);
      const todayItems = activeTodos.filter((t) => t.startDate === today);
      const upcoming = activeTodos.filter((t) => t.startDate > today);
      return [
        { key: 'overdue', label: 'Overdue', items: overdue, danger: true },
        { key: 'today', label: 'Today', items: todayItems },
        { key: 'upcoming', label: 'Upcoming', items: upcoming },
      ];
    }

    const untaggedKey = '__untagged__';
    const byTag = new Map<string, Todo[]>();
    for (const todo of activeTodos) {
      const key = todo.tag ?? untaggedKey;
      const list = byTag.get(key);
      if (list) {
        list.push(todo);
      } else {
        byTag.set(key, [todo]);
      }
    }

    const keys = [...byTag.keys()].sort((a, b) => {
      if (a === untaggedKey) return 1;
      if (b === untaggedKey) return -1;
      return a.localeCompare(b);
    });

    return keys.map((key) => ({
      key: `tag-${key}`,
      label: key === untaggedKey ? 'Untagged' : key,
      items: byTag.get(key) ?? [],
      color: key === untaggedKey ? undefined : tagColorByName.get(key),
    }));
  }, [activeTodos, groupBy, tagColorByName, today]);

  const completed = useMemo(
    () =>
      todos
        .filter((t) => t.done)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [todos],
  );

  const groupByTodoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const todo of group.items) {
        map.set(todo.id, group.key);
      }
    }
    return map;
  }, [groups]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    const start = startDate;
    let end = useRange ? endDate : start;
    if (end < start) end = start;
    setSubmitting(true);
    try {
      await createTodo({ title: trimmed, startDate: start, endDate: end, tag: normalizeTag(newTag) });
      setTitle('');
      setNewTag('');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditTitle(todo.title);
  };

  const commitEdit = async (todo: Todo) => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todo.title) {
      await updateTodo(todo.id, { title: trimmed });
    }
    setEditingId(null);
  };

  const startDateEdit = (todo: Todo) => {
    setEditingDateId(todo.id);
    setEditStart(todo.startDate);
    setEditEnd(todo.endDate);
    setEditHasEnd(todo.endDate !== todo.startDate);
  };

  const commitDateEdit = async (todo: Todo) => {
    const start = editStart || todo.startDate;
    let end = editHasEnd ? editEnd || start : start;
    if (end < start) end = start;
    if (start !== todo.startDate || end !== todo.endDate) {
      await updateTodo(todo.id, { startDate: start, endDate: end });
    }
    setEditingDateId(null);
  };

  const startTagEdit = (todo: Todo) => {
    setEditingTagId(todo.id);
    setEditTag(todo.tag ?? '');
  };

  const commitTagEdit = async (todo: Todo) => {
    const nextTag = normalizeTag(editTag);
    if (nextTag !== todo.tag) {
      await updateTodo(todo.id, { tag: nextTag });
    }
    setEditingTagId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeGroup = groupByTodoId.get(activeId);
    if (!activeGroup || activeGroup !== groupByTodoId.get(overId)) {
      return;
    }

    const group = groups.find((item) => item.key === activeGroup);
    if (!group) return;
    const groupIds = group.items.map((todo) => todo.id);
    const oldIndex = groupIds.indexOf(activeId);
    const newIndex = groupIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const reorderedGroupIds = arrayMove(groupIds, oldIndex, newIndex);
    const activeOrderIds = activeTodos.map((todo) => todo.id);
    const positionById = new Map(activeOrderIds.map((id, idx) => [id, idx]));
    const slots = groupIds
      .map((id) => positionById.get(id))
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);

    const nextOrderIds = [...activeOrderIds];
    for (let index = 0; index < slots.length; index += 1) {
      nextOrderIds[slots[index]] = reorderedGroupIds[index];
    }
    await reorderTodos(nextOrderIds);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <span className="label">Planner</span>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">To-Do</h1>
        <p className="max-w-lg text-sm text-muted">
          Track daily to-dos with a date or a range of dates. Anything due today or earlier
          that is still open shows as a count on the sidebar.
        </p>
      </div>

      <form onSubmit={handleCreate} className="card space-y-3">
        <input
          className="input"
          placeholder="Add a to-do…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="label">{useRange ? 'Start date' : 'Date'}</span>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          {useRange && (
            <label className="space-y-1">
              <span className="label">End date</span>
              <input
                type="date"
                className="input"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          )}
          <label className="space-y-1">
            <span className="label">Tag</span>
            <input
              className="input"
              placeholder="Optional"
              value={newTag}
              list="todo-tag-options"
              onChange={(e) => setNewTag(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setUseRange((prev) => {
                const next = !prev;
                if (next && endDate < startDate) setEndDate(startDate);
                return next;
              });
            }}
          >
            {useRange ? 'Remove range' : 'Add end date'}
          </button>
          <button type="submit" className="btn-primary ml-auto" disabled={submitting}>
            Add
          </button>
        </div>
        <datalist id="todo-tag-options">
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </form>

      {error && <p className="text-sm text-danger">{error.message}</p>}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Group by</span>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                groupBy === 'date' ? 'bg-surface2 text-fg' : 'hover:bg-surface2'
              }`}
              onClick={() => setGroupBy('date')}
            >
              Date
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                groupBy === 'tag' ? 'bg-surface2 text-fg' : 'hover:bg-surface2'
              }`}
              onClick={() => setGroupBy('tag')}
            >
              Tag
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <section key={group.key} className="space-y-2">
                <h2
                  className={`label ${group.danger ? '!text-danger' : ''}`}
                >
                  {group.color ? (
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: group.color }}
                    />
                  ) : null}
                  {group.label} ({group.items.length})
                </h2>
                <SortableContext
                  items={group.items.map((todo) => todo.id)}
                  strategy={verticalListSortingStrategy}
                >
                <ul className="space-y-1.5">
                  {group.items.map((todo) => (
                    <SortableTodoRow
                      key={todo.id}
                      id={todo.id}
                      className="card-interactive flex items-center gap-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-accent"
                        checked={todo.done}
                        onChange={() => toggleDone(todo.id, !todo.done)}
                        aria-label={`Mark ${todo.title} done`}
                      />
                      <div className="min-w-0 flex-1">
                        {editingId === todo.id ? (
                          <input
                            className="input"
                            value={editTitle}
                            autoFocus
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => commitEdit(todo)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(todo);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="block w-full whitespace-normal break-words text-left text-sm text-fg"
                            onClick={() => startEdit(todo)}
                          >
                            {todo.title}
                          </button>
                        )}
                      </div>
                      {editingTagId === todo.id ? (
                        <div
                          className="flex shrink-0 items-center gap-1.5"
                          onBlur={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              return;
                            }
                            commitTagEdit(todo);
                          }}
                        >
                          <input
                            className="input !w-32 !py-1 text-xs"
                            value={editTag}
                            list="todo-tag-options"
                            autoFocus
                            onChange={(e) => setEditTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitTagEdit(todo);
                              if (e.key === 'Escape') setEditingTagId(null);
                            }}
                          />
                          <button
                            type="button"
                            className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                            onClick={() => setEditTag('')}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="shrink-0 rounded-full border px-2 py-1 text-xs text-muted hover:bg-surface2"
                          style={todo.tag ? { borderColor: tagColorByName.get(todo.tag) } : undefined}
                          onClick={() => startTagEdit(todo)}
                          title="Click to change tag"
                        >
                          {todo.tag ? (
                            <span
                              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                              style={{ backgroundColor: tagColorByName.get(todo.tag) ?? '#9CA3AF' }}
                            />
                          ) : null}
                          {todo.tag ?? 'Tag'}
                        </button>
                      )}
                      {editingDateId === todo.id ? (
                        <div
                          className="flex shrink-0 items-center gap-1.5"
                          onBlur={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              return;
                            }
                            commitDateEdit(todo);
                          }}
                        >
                          {editHasEnd ? (
                            <button
                              type="button"
                              className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                              onClick={() => {
                                setEditHasEnd(false);
                                setEditEnd(editStart);
                              }}
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                              onClick={() => {
                                setEditHasEnd(true);
                                if (!editEnd || editEnd < editStart) setEditEnd(editStart);
                              }}
                            >
                              Add end date
                            </button>
                          )}
                          <input
                            type="date"
                            className="input !w-auto !py-1 text-xs"
                            value={editStart}
                            autoFocus
                            onChange={(e) => setEditStart(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitDateEdit(todo);
                              if (e.key === 'Escape') setEditingDateId(null);
                            }}
                          />
                          {editHasEnd && (
                            <>
                              <span className="text-xs text-subtle">→</span>
                              <input
                                type="date"
                                className="input !w-auto !py-1 text-xs"
                                value={editEnd}
                                min={editStart}
                                onChange={(e) => setEditEnd(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitDateEdit(todo);
                                  if (e.key === 'Escape') setEditingDateId(null);
                                }}
                              />
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`shrink-0 rounded px-1 py-1 text-xs leading-none hover:bg-surface2 ${
                            group.danger ? 'text-danger' : 'text-muted'
                          }`}
                          onClick={() => startDateEdit(todo)}
                          title="Click to change date"
                        >
                          {formatDateLabel(todo)}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                        onClick={() => deleteTodo(todo.id)}
                        aria-label={`Delete ${todo.title}`}
                      >
                        Delete
                      </button>
                    </SortableTodoRow>
                  ))}
                </ul>
                </SortableContext>
              </section>
            ),
          )}
          </DndContext>

          {groups.every((g) => g.items.length === 0) && completed.length === 0 && (
            <p className="text-sm text-muted">No to-dos yet. Add one above.</p>
          )}

          {completed.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                className="label flex items-center gap-2 hover:text-fg"
                onClick={() => setShowCompleted((prev) => !prev)}
              >
                <span>{showCompleted ? '▾' : '▸'}</span>
                <span>Completed ({completed.length})</span>
              </button>
              {showCompleted ? (
                <ul className="space-y-1.5">
                  {completed.map((todo) => (
                    <li key={todo.id} className="card flex items-center gap-3 py-2.5 opacity-70">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-accent"
                      checked={todo.done}
                      onChange={() => toggleDone(todo.id, !todo.done)}
                      aria-label={`Mark ${todo.title} not done`}
                    />
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-sm text-muted line-through">
                      {todo.title}
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {formatDateLabel(todo)}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                      onClick={() => deleteTodo(todo.id)}
                      aria-label={`Delete ${todo.title}`}
                    >
                      Delete
                    </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
