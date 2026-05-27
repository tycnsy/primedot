import { useMemo, useState } from 'react';

interface NamedColorItem {
  id: string;
  name: string;
  color: string;
}

interface ColorTagEditorProps<TItem extends NamedColorItem> {
  noun: string;
  items: TItem[];
  isLoading?: boolean;
  error?: unknown;
  onCreate: (input: { name: string; color: string }) => Promise<void>;
  onUpdate: (input: {
    id: string;
    oldName: string;
    name: string;
    color: string;
  }) => Promise<void>;
  onDelete: (input: { id: string; name: string }) => Promise<void>;
}

const DEFAULT_COLOR = '#9CA3AF';
const COLOR_PRESETS = [
  '#9CA3AF',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EC4899',
];

export default function ColorTagEditor<TItem extends NamedColorItem>({
  noun,
  items,
  isLoading,
  error,
  onCreate,
  onUpdate,
  onDelete,
}: ColorTagEditorProps<TItem>) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; color: string }>>({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items],
  );

  const draftFor = (item: TItem) => {
    return drafts[item.id] ?? { name: item.name, color: item.color || DEFAULT_COLOR };
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-fg">Create {noun}</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-1">
            <label className="label" htmlFor={`new-${noun}`}>
              Name
            </label>
            <input
              id={`new-${noun}`}
              className="input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={`New ${noun}`}
            />
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor={`new-${noun}-color`}>
              Color
            </label>
            <input
              id={`new-${noun}-color`}
              type="color"
              className="h-10 w-14 rounded-md border border-border bg-surface2 p-1"
              value={newColor}
              onChange={(event) => setNewColor(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={busyKey === 'create' || !newName.trim()}
            onClick={async () => {
              setFeedback(null);
              setBusyKey('create');
              try {
                await onCreate({ name: newName, color: newColor });
                setNewName('');
                setNewColor(DEFAULT_COLOR);
              } catch (err) {
                setFeedback(err instanceof Error ? err.message : `Failed to create ${noun}.`);
              } finally {
                setBusyKey(null);
              }
            }}
          >
            {busyKey === 'create' ? 'Creating…' : `Create ${noun}`}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="h-6 w-6 rounded-full border border-border"
              style={{ backgroundColor: preset }}
              title={`Pick ${preset}`}
              onClick={() => setNewColor(preset)}
            />
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-muted">Loading {noun}s…</p> : null}
      {error ? (
        <p className="text-danger">
          {error instanceof Error ? error.message : `Failed to load ${noun}s.`}
        </p>
      ) : null}
      {feedback ? <p className="text-xs text-danger">{feedback}</p> : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const draft = draftFor(item);
          return (
            <li key={item.id} className="card space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <div className="space-y-1">
                  <label className="label" htmlFor={`${noun}-${item.id}`}>
                    Name
                  </label>
                  <input
                    id={`${noun}-${item.id}`}
                    className="input"
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...draft, name: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="label" htmlFor={`${noun}-color-${item.id}`}>
                    Color
                  </label>
                  <input
                    id={`${noun}-color-${item.id}`}
                    type="color"
                    className="h-10 w-14 rounded-md border border-border bg-surface2 p-1"
                    value={draft.color}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.id]: { ...draft, color: event.target.value },
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busyKey === `save-${item.id}` || !draft.name.trim()}
                  onClick={async () => {
                    setFeedback(null);
                    setBusyKey(`save-${item.id}`);
                    try {
                      const original = itemById.get(item.id);
                      if (!original) return;
                      await onUpdate({
                        id: item.id,
                        oldName: original.name,
                        name: draft.name,
                        color: draft.color,
                      });
                    } catch (err) {
                      setFeedback(err instanceof Error ? err.message : `Failed to update ${noun}.`);
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                >
                  {busyKey === `save-${item.id}` ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-danger"
                  disabled={busyKey === `delete-${item.id}`}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete "${item.name}"? Projects using this ${noun} will be updated to none.`,
                      )
                    ) {
                      return;
                    }
                    setFeedback(null);
                    setBusyKey(`delete-${item.id}`);
                    try {
                      await onDelete({ id: item.id, name: item.name });
                      setDrafts((prev) => {
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                      });
                    } catch (err) {
                      setFeedback(err instanceof Error ? err.message : `Failed to delete ${noun}.`);
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                >
                  {busyKey === `delete-${item.id}` ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
