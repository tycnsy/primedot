import { useEffect, useMemo, useRef, useState } from 'react';
import ColorPickerField from './ColorPickerField';
import { DEFAULT_TAG_SERIES_COLOR } from '../lib/colorPresets';

interface NamedColorItem {
  id: string;
  name: string;
  color: string;
  tag?: string | null;
  archived_at?: string | null;
}

interface ColorTagEditorProps<TItem extends NamedColorItem> {
  noun: string;
  items: TItem[];
  isLoading?: boolean;
  error?: unknown;
  relatedTagOptions?: string[];
  usageById?: Map<string, number>;
  onCreate: (input: { name: string; color: string; tag?: string | null }) => Promise<void>;
  onUpdate: (input: {
    id: string;
    oldName: string;
    name: string;
    color: string;
    tag?: string | null;
  }) => Promise<void>;
  onDelete: (input: { id: string; name: string }) => Promise<void>;
  onArchive?: (input: { id: string; name: string }) => Promise<void>;
  onRestore?: (input: { id: string; name: string }) => Promise<void>;
}

const DEFAULT_COLOR = DEFAULT_TAG_SERIES_COLOR;

export default function ColorTagEditor<TItem extends NamedColorItem>({
  noun,
  items,
  isLoading,
  error,
  relatedTagOptions,
  usageById,
  onCreate,
  onUpdate,
  onDelete,
  onArchive,
  onRestore,
}: ColorTagEditorProps<TItem>) {
  type ItemDraft = { name: string; color: string; tag: string };
  const [drafts, setDrafts] = useState<
    Record<string, ItemDraft>
  >({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [newTag, setNewTag] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveInFlightRef = useRef<Record<string, boolean>>({});
  const queuedSaveRef = useRef<Record<string, ItemDraft>>({});

  const supportsRelatedTag = relatedTagOptions !== undefined;
  const supportsArchive = !!onArchive && !!onRestore;

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items],
  );

  const activeItems = useMemo(
    () => items.filter((item) => !item.archived_at),
    [items],
  );
  const archivedItems = useMemo(
    () => items.filter((item) => !!item.archived_at),
    [items],
  );

  const usageOf = (item: TItem) => usageById?.get(item.id) ?? 0;

  const draftFor = (item: TItem) => {
    return (
      drafts[item.id] ?? {
        name: item.name,
        color: item.color || DEFAULT_COLOR,
        tag: item.tag ?? '',
      }
    );
  };

  const removeDraft = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const clearQueuedSave = (id: string) => {
    const timer = saveTimeoutsRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete saveTimeoutsRef.current[id];
    }
  };

  const clearAutoSaveState = (id: string) => {
    clearQueuedSave(id);
    delete queuedSaveRef.current[id];
    delete saveInFlightRef.current[id];
    setSavingById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const hasDraftChanges = (item: TItem, draft: ItemDraft) =>
    item.name !== draft.name ||
    (item.color || DEFAULT_COLOR) !== draft.color ||
    (item.tag ?? '') !== draft.tag;

  const persistDraft = async (id: string, draft: ItemDraft) => {
    const item = itemById.get(id);
    if (!item) return;
    if (!draft.name.trim()) return;
    if (!hasDraftChanges(item, draft)) return;

    if (saveInFlightRef.current[id]) {
      queuedSaveRef.current[id] = draft;
      return;
    }

    saveInFlightRef.current[id] = true;
    setSavingById((prev) => ({ ...prev, [id]: true }));
    setFeedback(null);
    try {
      await onUpdate({
        id,
        oldName: item.name,
        name: draft.name,
        color: draft.color,
        ...(supportsRelatedTag ? { tag: draft.tag.trim() || null } : {}),
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : `Failed to update ${noun}.`);
    } finally {
      saveInFlightRef.current[id] = false;
      setSavingById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const queued = queuedSaveRef.current[id];
      if (queued) {
        delete queuedSaveRef.current[id];
        void persistDraft(id, queued);
      }
    }
  };

  const queueAutoSave = (id: string, draft: ItemDraft) => {
    clearQueuedSave(id);
    saveTimeoutsRef.current[id] = setTimeout(() => {
      delete saveTimeoutsRef.current[id];
      void persistDraft(id, draft);
    }, 400);
  };

  useEffect(() => {
    return () => {
      Object.values(saveTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
      saveTimeoutsRef.current = {};
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-fg">Create {noun}</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
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
          <button
            type="button"
            className="btn-primary sm:self-end"
            disabled={busyKey === 'create' || !newName.trim()}
            onClick={async () => {
              setFeedback(null);
              setBusyKey('create');
              try {
                await onCreate({
                  name: newName,
                  color: newColor,
                  ...(supportsRelatedTag ? { tag: newTag.trim() || null } : {}),
                });
                setNewName('');
                setNewColor(DEFAULT_COLOR);
                setNewTag('');
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
        {supportsRelatedTag ? (
          <div className="space-y-1 sm:max-w-xs">
            <label className="label" htmlFor={`new-${noun}-tag`}>
              Related tag
            </label>
            <select
              id={`new-${noun}-tag`}
              className="input"
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
            >
              <option value="">None</option>
              {(relatedTagOptions ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <ColorPickerField
          id={`new-${noun}-color`}
          value={newColor}
          onChange={setNewColor}
        />
      </div>

      {isLoading ? <p className="text-muted">Loading {noun}s…</p> : null}
      {error ? (
        <p className="text-danger">
          {error instanceof Error ? error.message : `Failed to load ${noun}s.`}
        </p>
      ) : null}
      {feedback ? <p className="text-xs text-danger">{feedback}</p> : null}

      <ul className="space-y-3">
        {activeItems.map((item) => {
          const draft = draftFor(item);
          const inUse = usageOf(item) > 0;
          return (
            <li key={item.id} className="card space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <label className="label" htmlFor={`${noun}-${item.id}`}>
                    Name
                  </label>
                  <input
                    id={`${noun}-${item.id}`}
                    className="input"
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((prev) => {
                        const prevDraft = prev[item.id] ?? draft;
                        const nextDraft = { ...prevDraft, name: event.target.value };
                        queueAutoSave(item.id, nextDraft);
                        return {
                          ...prev,
                          [item.id]: nextDraft,
                        };
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-3 sm:justify-self-end">
                  {savingById[item.id] ? <span className="text-xs text-muted">Saving…</span> : null}
                  {inUse && supportsArchive ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busyKey === `archive-${item.id}`}
                      onClick={async () => {
                        setFeedback(null);
                        setBusyKey(`archive-${item.id}`);
                        try {
                          clearAutoSaveState(item.id);
                          await onArchive!({ id: item.id, name: item.name });
                          removeDraft(item.id);
                        } catch (err) {
                          setFeedback(
                            err instanceof Error ? err.message : `Failed to archive ${noun}.`,
                          );
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      {busyKey === `archive-${item.id}` ? 'Archiving…' : 'Archive'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost text-danger"
                      disabled={busyKey === `delete-${item.id}`}
                      onClick={async () => {
                        if (!confirm(`Delete "${item.name}"?`)) {
                          return;
                        }
                        setFeedback(null);
                        setBusyKey(`delete-${item.id}`);
                        try {
                          clearAutoSaveState(item.id);
                          await onDelete({ id: item.id, name: item.name });
                          removeDraft(item.id);
                        } catch (err) {
                          setFeedback(
                            err instanceof Error ? err.message : `Failed to delete ${noun}.`,
                          );
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      {busyKey === `delete-${item.id}` ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
              <ColorPickerField
                id={`${noun}-color-${item.id}`}
                value={draft.color}
                onChange={(color) =>
                  setDrafts((prev) => {
                    const prevDraft = prev[item.id] ?? draft;
                    const nextDraft = { ...prevDraft, color };
                    queueAutoSave(item.id, nextDraft);
                    return {
                      ...prev,
                      [item.id]: nextDraft,
                    };
                  })
                }
              />
              {supportsRelatedTag ? (
                <div className="space-y-1 sm:max-w-xs">
                  <label className="label" htmlFor={`${noun}-tag-${item.id}`}>
                    Related tag
                  </label>
                  <select
                    id={`${noun}-tag-${item.id}`}
                    className="input"
                    value={draft.tag}
                    onChange={(event) =>
                      setDrafts((prev) => {
                        const prevDraft = prev[item.id] ?? draft;
                        const nextDraft = { ...prevDraft, tag: event.target.value };
                        queueAutoSave(item.id, nextDraft);
                        return {
                          ...prev,
                          [item.id]: nextDraft,
                        };
                      })
                    }
                  >
                    <option value="">None</option>
                    {(relatedTagOptions ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    {draft.tag && !(relatedTagOptions ?? []).includes(draft.tag) ? (
                      <option value={draft.tag}>{draft.tag} (archived)</option>
                    ) : null}
                  </select>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {supportsArchive && archivedItems.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">Archived {noun}s</h2>
          <ul className="space-y-2">
            {archivedItems.map((item) => {
              const inUse = usageOf(item) > 0;
              return (
                <li
                  key={item.id}
                  className="card flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: item.color || DEFAULT_COLOR }}
                    />
                    <span className="text-sm text-fg">{item.name}</span>
                    {supportsRelatedTag && item.tag ? (
                      <span className="text-xs text-muted">tag: {item.tag}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busyKey === `restore-${item.id}`}
                      onClick={async () => {
                        setFeedback(null);
                        setBusyKey(`restore-${item.id}`);
                        try {
                          await onRestore!({ id: item.id, name: item.name });
                        } catch (err) {
                          setFeedback(
                            err instanceof Error ? err.message : `Failed to restore ${noun}.`,
                          );
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      {busyKey === `restore-${item.id}` ? 'Restoring…' : 'Unarchive'}
                    </button>
                    {!inUse ? (
                      <button
                        type="button"
                        className="btn-ghost text-danger"
                        disabled={busyKey === `delete-${item.id}`}
                        onClick={async () => {
                          if (!confirm(`Delete "${item.name}"?`)) {
                            return;
                          }
                          setFeedback(null);
                          setBusyKey(`delete-${item.id}`);
                          try {
                            await onDelete({ id: item.id, name: item.name });
                          } catch (err) {
                            setFeedback(
                              err instanceof Error ? err.message : `Failed to delete ${noun}.`,
                            );
                          } finally {
                            setBusyKey(null);
                          }
                        }}
                      >
                        {busyKey === `delete-${item.id}` ? 'Deleting…' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
