import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const SAVE_DEBOUNCE_MS = 600;

function defaultStrokePalette() {
  return ['#ffffff', '#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#e8590c', '#9c36b5'];
}

function defaultFillPalette() {
  return ['transparent', '#ffffff', '#ffd9d9', '#d0e7ff', '#d3f0d9', '#ffe5b8', '#ead8ff'];
}

function defaultView() {
  return { x: 220, y: 80, scale: 1 };
}

function normalizePalette(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const filtered = value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  return filtered.length ? filtered : fallback;
}

function normalizeView(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const x = Number(value.x);
  const y = Number(value.y);
  const scale = Number(value.scale);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) return fallback;
  return { x, y, scale };
}

function safeReadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable or full; ignore.
  }
}

function safeReadString(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteString(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// useBoardElements — Supabase-backed element list keyed by (user_id, slug).
// Returns { elements, setElements, ready }. setElements has the same signature
// as React's setState (value or updater) and is debounced to a row UPDATE.
export function useBoardElements(boardId, makeStarterElements) {
  const { user, loading: authLoading } = useAuth();
  const [elements, setElementsState] = useState([]);
  const [ready, setReady] = useState(false);
  const [boardRowId, setBoardRowId] = useState(null);
  const [canonicalSlug, setCanonicalSlug] = useState(boardId || null);
  const rowIdRef = useRef(null);
  const saveTimerRef = useRef(null);
  const latestRef = useRef(elements);
  const cancelledRef = useRef(false);

  useEffect(() => {
    latestRef.current = elements;
  }, [elements]);

  // Load (or create) the board row whenever the user/boardId changes.
  useEffect(() => {
    cancelledRef.current = false;
    rowIdRef.current = null;
    setBoardRowId(null);
    setCanonicalSlug(boardId || null);
    setReady(false);
    setElementsState([]);

    if (authLoading) return undefined;
    if (!user || !boardId) {
      // No auth or no board — fall back to starter elements in-memory only.
      const starter = makeStarterElements ? makeStarterElements() : [];
      setElementsState(starter);
      setReady(true);
      return undefined;
    }

    (async () => {
      const { data: existing, error: selectError } = await supabase
        .from('whiteboards')
        .select('id, slug, elements')
        .eq('user_id', user.id)
        .eq('slug', boardId)
        .maybeSingle();

      if (cancelledRef.current) return;

      if (selectError) {
        console.error('[whiteboard] failed to load board', selectError);
        const starter = makeStarterElements ? makeStarterElements() : [];
        setElementsState(starter);
        setReady(true);
        return;
      }

      if (existing) {
        rowIdRef.current = existing.id;
        setBoardRowId(existing.id);
        setCanonicalSlug(existing.slug || boardId);
        const loaded = Array.isArray(existing.elements) ? existing.elements : [];
        setElementsState(loaded);
        setReady(true);
        return;
      }

      const { data: aliasRow, error: aliasError } = await supabase
        .from('whiteboard_slug_aliases')
        .select('board_id')
        .eq('user_id', user.id)
        .eq('slug', boardId)
        .maybeSingle();

      if (cancelledRef.current) return;
      if (aliasError) {
        console.error('[whiteboard] failed to resolve slug alias', aliasError);
      }

      if (aliasRow?.board_id) {
        const { data: aliasedBoard, error: aliasedBoardError } = await supabase
          .from('whiteboards')
          .select('id, slug, elements')
          .eq('user_id', user.id)
          .eq('id', aliasRow.board_id)
          .maybeSingle();

        if (cancelledRef.current) return;
        if (aliasedBoardError) {
          console.error('[whiteboard] failed to load canonical board from alias', aliasedBoardError);
        } else if (aliasedBoard) {
          rowIdRef.current = aliasedBoard.id;
          setBoardRowId(aliasedBoard.id);
          setCanonicalSlug(aliasedBoard.slug || boardId);
          const loaded = Array.isArray(aliasedBoard.elements) ? aliasedBoard.elements : [];
          setElementsState(loaded);
          setReady(true);
          return;
        }
      }

      const starter = makeStarterElements ? makeStarterElements() : [];
      const { data: inserted, error: insertError } = await supabase
        .from('whiteboards')
        .insert({
          user_id: user.id,
          slug: boardId,
          elements: starter,
        })
        .select('id')
        .single();

      if (cancelledRef.current) return;

      if (insertError) {
        console.error('[whiteboard] failed to create board', insertError);
      } else if (inserted) {
        rowIdRef.current = inserted.id;
        setBoardRowId(inserted.id);
        setCanonicalSlug(boardId);
      }
      setElementsState(starter);
      setReady(true);
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [user, authLoading, boardId, makeStarterElements]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = rowIdRef.current;
    if (!id) return;
    const payload = latestRef.current;
    const { error } = await supabase
      .from('whiteboards')
      .update({ elements: payload, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[whiteboard] failed to save elements', error);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (!rowIdRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const setElements = useCallback(
    (next) => {
      setElementsState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        latestRef.current = value;
        scheduleSave();
        return value;
      });
    },
    [scheduleSave],
  );

  // Flush on unmount so a quick navigation away doesn't lose the last edit.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void flushSave();
      }
    };
  }, [flushSave]);

  return { elements, setElements, ready, boardRowId, canonicalSlug };
}

// useBoardViewport — board-scoped pan/zoom persistence in localStorage.
// Returns { initialView, saveView } where saveView is debounced.
export function useBoardViewport(boardId, boardStorageId) {
  const scopedKey = boardStorageId || boardId || 'default';
  const viewKey = `wb-board-${scopedKey}-view`;
  const legacyViewKey = boardId ? `wb-${boardId}-view` : null;
  const [initialView, setInitialView] = useState(() => defaultView());
  const saveTimerRef = useRef(null);
  const pendingViewRef = useRef(null);
  const persistedRef = useRef(JSON.stringify(defaultView()));

  useEffect(() => {
    const primary = safeReadJSON(viewKey, null);
    const legacy = legacyViewKey ? safeReadJSON(legacyViewKey, null) : null;
    const resolved = normalizeView(primary ?? legacy, defaultView());
    setInitialView(resolved);
    persistedRef.current = JSON.stringify(resolved);

    if (primary == null && legacy != null) {
      safeWriteJSON(viewKey, resolved);
      if (legacyViewKey) safeRemove(legacyViewKey);
    }
  }, [legacyViewKey, viewKey]);

  const saveView = useCallback(
    (nextView) => {
      const normalized = normalizeView(nextView, defaultView());
      const serialized = JSON.stringify(normalized);
      if (serialized === persistedRef.current) {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        pendingViewRef.current = null;
        return;
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      pendingViewRef.current = normalized;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingViewRef.current || normalized;
        pendingViewRef.current = null;
        safeWriteJSON(viewKey, pending);
        persistedRef.current = JSON.stringify(pending);
      }, SAVE_DEBOUNCE_MS);
    },
    [viewKey],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const pending = pendingViewRef.current;
        saveTimerRef.current = null;
        pendingViewRef.current = null;
        if (pending) {
          safeWriteJSON(viewKey, pending);
          persistedRef.current = JSON.stringify(pending);
        }
      }
    };
  }, [viewKey]);

  return { initialView, saveView };
}

// useBoardPalettes — account-level stroke palette + board-scoped fill/background.
// Returns the same shape the original whiteboard-app code consumed.
export function useBoardPalettes(boardId, boardStorageId) {
  const { user, loading: authLoading } = useAuth();
  const strokeKey = 'wb-stroke-palette';
  const legacyStrokeKey = `wb-${boardId}-stroke-palette`;
  const scopedKey = boardStorageId || boardId || 'default';
  const fillKey = `wb-board-${scopedKey}-fill-palette`;
  const bgKey = `wb-board-${scopedKey}-bg-color`;
  const legacyFillKey = boardId ? `wb-${boardId}-fill-palette` : null;
  const legacyBgKey = boardId ? `wb-${boardId}-bg-color` : null;

  const [strokePalette, setStrokePalette] = useState(defaultStrokePalette);
  const [fillPalette, setFillPalette] = useState(() => defaultFillPalette());
  const [bgColor, setBgColor] = useState(() => null);
  const strokeReadyRef = useRef(false);
  const strokeSaveTimerRef = useRef(null);
  const strokePersistedRef = useRef(JSON.stringify(defaultStrokePalette()));

  useEffect(() => {
    let cancelled = false;

    strokeReadyRef.current = false;
    if (strokeSaveTimerRef.current) {
      clearTimeout(strokeSaveTimerRef.current);
      strokeSaveTimerRef.current = null;
    }

    if (authLoading) return undefined;

    const fromStorage = normalizePalette(
      safeReadJSON(strokeKey, safeReadJSON(legacyStrokeKey, defaultStrokePalette())),
      defaultStrokePalette(),
    );

    if (!user) {
      setStrokePalette(fromStorage);
      strokePersistedRef.current = JSON.stringify(fromStorage);
      strokeReadyRef.current = true;
      return undefined;
    }

    (async () => {
      const { data, error } = await supabase
        .from('whiteboard_preferences')
        .select('stroke_palette')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[whiteboard] failed to load stroke palette', error);
        setStrokePalette(fromStorage);
        strokePersistedRef.current = JSON.stringify(fromStorage);
        strokeReadyRef.current = true;
        return;
      }

      const hasRemotePalette = Array.isArray(data?.stroke_palette) && data.stroke_palette.length > 0;
      const resolvedPalette = hasRemotePalette
        ? normalizePalette(data.stroke_palette, defaultStrokePalette())
        : fromStorage;

      if (!hasRemotePalette) {
        const { error: upsertError } = await supabase.from('whiteboard_preferences').upsert(
          { user_id: user.id, stroke_palette: resolvedPalette, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        if (upsertError) {
          console.error('[whiteboard] failed to seed stroke palette', upsertError);
        }
      }

      setStrokePalette(resolvedPalette);
      strokePersistedRef.current = JSON.stringify(resolvedPalette);
      strokeReadyRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, legacyStrokeKey, strokeKey, user]);

  // Reset board-scoped palette values when board key changes.
  useEffect(() => {
    const primaryFill = safeReadJSON(fillKey, null);
    const legacyFill = legacyFillKey ? safeReadJSON(legacyFillKey, null) : null;
    const resolvedFill = normalizePalette(primaryFill ?? legacyFill, defaultFillPalette());
    setFillPalette(resolvedFill);

    const primaryBg = safeReadString(bgKey);
    const legacyBg = legacyBgKey ? safeReadString(legacyBgKey) : null;
    const resolvedBg = primaryBg ?? legacyBg;
    setBgColor(resolvedBg);

    if (primaryFill == null && legacyFill != null) {
      safeWriteJSON(fillKey, resolvedFill);
      if (legacyFillKey) safeRemove(legacyFillKey);
    }
    if (primaryBg == null && legacyBg != null) {
      safeWriteString(bgKey, legacyBg);
      if (legacyBgKey) safeRemove(legacyBgKey);
    }
  }, [bgKey, fillKey, legacyBgKey, legacyFillKey]);

  useEffect(() => {
    if (!strokeReadyRef.current || authLoading) return undefined;

    const serialized = JSON.stringify(strokePalette);
    if (serialized === strokePersistedRef.current) return undefined;

    if (!user) {
      safeWriteJSON(strokeKey, strokePalette);
      strokePersistedRef.current = serialized;
      return undefined;
    }

    if (strokeSaveTimerRef.current) {
      clearTimeout(strokeSaveTimerRef.current);
    }
    strokeSaveTimerRef.current = setTimeout(async () => {
      strokeSaveTimerRef.current = null;
      const { error } = await supabase.from('whiteboard_preferences').upsert(
        { user_id: user.id, stroke_palette: strokePalette, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) {
        console.error('[whiteboard] failed to save stroke palette', error);
        return;
      }
      strokePersistedRef.current = serialized;
      safeWriteJSON(strokeKey, strokePalette);
      safeRemove(legacyStrokeKey);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (strokeSaveTimerRef.current) {
        clearTimeout(strokeSaveTimerRef.current);
        strokeSaveTimerRef.current = null;
      }
    };
  }, [authLoading, legacyStrokeKey, strokeKey, strokePalette, user]);
  useEffect(() => {
    safeWriteJSON(fillKey, fillPalette);
  }, [fillKey, fillPalette]);

  const commitBgColor = useCallback(
    (color) => {
      setBgColor(color);
      if (color == null) {
        safeRemove(bgKey);
      } else {
        safeWriteString(bgKey, color);
      }
    },
    [bgKey],
  );

  const clearBgColor = useCallback(() => {
    setBgColor(null);
    safeRemove(bgKey);
  }, [bgKey]);

  return {
    strokePalette,
    setStrokePalette,
    fillPalette,
    setFillPalette,
    bgColor,
    commitBgColor,
    clearBgColor,
  };
}
