import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useTodos, type Todo } from '../hooks/useTodos';

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
};

export default function Todos() {
  const { todos, isLoading, error, createTodo, updateTodo, toggleDone, deleteTodo } =
    useTodos();

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(todayDateString());
  const [useRange, setUseRange] = useState(false);
  const [endDate, setEndDate] = useState(todayDateString());
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editHasEnd, setEditHasEnd] = useState(false);

  const today = todayDateString();

  const groups = useMemo<Group[]>(() => {
    const active = todos.filter((t) => !t.done);
    const overdue = active.filter((t) => t.startDate < today);
    const todayItems = active.filter((t) => t.startDate === today);
    const upcoming = active.filter((t) => t.startDate > today);
    return [
      { key: 'overdue', label: 'Overdue', items: overdue, danger: true },
      { key: 'today', label: 'Today', items: todayItems },
      { key: 'upcoming', label: 'Upcoming', items: upcoming },
    ];
  }, [todos, today]);

  const completed = useMemo(
    () =>
      todos
        .filter((t) => t.done)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [todos],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    const start = startDate;
    let end = useRange ? endDate : start;
    if (end < start) end = start;
    setSubmitting(true);
    try {
      await createTodo({ title: trimmed, startDate: start, endDate: end });
      setTitle('');
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
      </form>

      {error && <p className="text-sm text-danger">{error.message}</p>}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <section key={group.key} className="space-y-2">
                <h2
                  className={`label ${group.danger ? '!text-danger' : ''}`}
                >
                  {group.label} ({group.items.length})
                </h2>
                <ul className="space-y-1.5">
                  {group.items.map((todo) => (
                    <li key={todo.id} className="card-interactive flex items-center gap-3 py-2.5">
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
                            className="block w-full truncate text-left text-sm text-fg"
                            onClick={() => startEdit(todo)}
                          >
                            {todo.title}
                          </button>
                        )}
                      </div>
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
                          className={`shrink-0 rounded px-1 text-xs hover:bg-surface2 ${
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
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}

          {groups.every((g) => g.items.length === 0) && completed.length === 0 && (
            <p className="text-sm text-muted">No to-dos yet. Add one above.</p>
          )}

          {completed.length > 0 && (
            <section className="space-y-2">
              <h2 className="label">Completed ({completed.length})</h2>
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
                    <span className="min-w-0 flex-1 truncate text-sm text-muted line-through">
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}
