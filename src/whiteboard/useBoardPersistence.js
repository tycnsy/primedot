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
        .select('id, elements')
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
        const loaded = Array.isArray(existing.elements) ? existing.elements : [];
        setElementsState(loaded);
        setReady(true);
        return;
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

  return { elements, setElements, ready };
}

// useBoardPalettes — boardId-namespaced localStorage for the three palette/bg keys.
// Returns the same shape the original whiteboard-app code consumed.
export function useBoardPalettes(boardId) {
  const strokeKey = `wb-${boardId}-stroke-palette`;
  const fillKey = `wb-${boardId}-fill-palette`;
  const bgKey = `wb-${boardId}-bg-color`;

  const [strokePalette, setStrokePalette] = useState(() =>
    safeReadJSON(strokeKey, defaultStrokePalette()),
  );
  const [fillPalette, setFillPalette] = useState(() =>
    safeReadJSON(fillKey, defaultFillPalette()),
  );
  const [bgColor, setBgColor] = useState(() => safeReadString(bgKey));

  // Reset state when boardId changes (read fresh values from localStorage).
  useEffect(() => {
    setStrokePalette(safeReadJSON(strokeKey, defaultStrokePalette()));
    setFillPalette(safeReadJSON(fillKey, defaultFillPalette()));
    setBgColor(safeReadString(bgKey));
  }, [strokeKey, fillKey, bgKey]);

  useEffect(() => {
    safeWriteJSON(strokeKey, strokePalette);
  }, [strokeKey, strokePalette]);
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
