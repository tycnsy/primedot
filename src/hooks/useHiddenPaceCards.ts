import { useEffect, useState } from 'react';

const HIDDEN_PACE_CARDS_STORAGE_KEY = 'prime:hidden-pace-project-ids';

type HiddenPaceCardsState = {
  hiddenProjectIds: ReadonlySet<string>;
  hideModeProjectIds: ReadonlySet<string>;
  isHideMode: boolean;
};

type Listener = (state: HiddenPaceCardsState) => void;

const listeners = new Set<Listener>();

let initialized = false;
let storageListenerBound = false;
let state: HiddenPaceCardsState = {
  hiddenProjectIds: new Set<string>(),
  hideModeProjectIds: new Set<string>(),
  isHideMode: false,
};

function parseHiddenProjectIds(raw: string | null): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    const ids = parsed.filter((value): value is string => typeof value === 'string');
    return new Set(ids);
  } catch {
    return new Set<string>();
  }
}

function persistHiddenProjectIds(hiddenProjectIds: ReadonlySet<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      HIDDEN_PACE_CARDS_STORAGE_KEY,
      JSON.stringify(Array.from(hiddenProjectIds)),
    );
  } catch {
    // localStorage may be unavailable; ignore persistence.
  }
}

function emit() {
  for (const listener of listeners) listener(state);
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  if (typeof window === 'undefined') return;
  const loaded = parseHiddenProjectIds(
    window.localStorage.getItem(HIDDEN_PACE_CARDS_STORAGE_KEY),
  );
  state = {
    ...state,
    hiddenProjectIds: loaded,
    hideModeProjectIds: loaded,
  };
}

function ensureStorageListener() {
  if (storageListenerBound || typeof window === 'undefined') return;
  storageListenerBound = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== HIDDEN_PACE_CARDS_STORAGE_KEY) return;
    const loaded = parseHiddenProjectIds(event.newValue);
    state = {
      ...state,
      hiddenProjectIds: loaded,
      hideModeProjectIds: state.isHideMode ? state.hideModeProjectIds : loaded,
    };
    emit();
  });
}

function subscribe(listener: Listener) {
  ensureInitialized();
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toggleHideModeState() {
  ensureInitialized();
  if (state.isHideMode) {
    const committed = new Set(state.hideModeProjectIds);
    state = {
      hiddenProjectIds: committed,
      hideModeProjectIds: committed,
      isHideMode: false,
    };
    persistHiddenProjectIds(committed);
    emit();
    return;
  }

  state = {
    ...state,
    isHideMode: true,
    hideModeProjectIds: new Set(state.hiddenProjectIds),
  };
  emit();
}

function toggleProjectHiddenState(projectId: string) {
  ensureInitialized();
  if (!state.isHideMode) return;
  const next = new Set(state.hideModeProjectIds);
  if (next.has(projectId)) next.delete(projectId);
  else next.add(projectId);
  state = {
    ...state,
    hideModeProjectIds: next,
  };
  emit();
}

export function useHiddenPaceCards() {
  const [snapshot, setSnapshot] = useState<HiddenPaceCardsState>(() => {
    ensureInitialized();
    return state;
  });

  useEffect(() => subscribe(setSnapshot), []);

  return {
    hiddenProjectIds: snapshot.hiddenProjectIds,
    hideModeProjectIds: snapshot.hideModeProjectIds,
    isHideMode: snapshot.isHideMode,
    toggleHideMode: toggleHideModeState,
    toggleProjectHidden: toggleProjectHiddenState,
  };
}

