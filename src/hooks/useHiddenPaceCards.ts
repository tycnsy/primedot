import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useProjects } from './useProjects';
import type { Project } from '../lib/types';

// Persisted visibility lives in the database on `projects.pace_hidden`, so it
// is shared across devices/instances. The committed hidden set is derived from
// the projects query. Only the ephemeral "hide mode" editing state (the draft
// selection while the user is choosing which cards to hide) is kept in memory
// and shared across components via this module-level store.

type HideModeState = {
  isHideMode: boolean;
  hideModeProjectIds: ReadonlySet<string>;
};

type Listener = (state: HideModeState) => void;

const listeners = new Set<Listener>();

let state: HideModeState = {
  isHideMode: false,
  hideModeProjectIds: new Set<string>(),
};

function emit() {
  for (const listener of listeners) listener(state);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function enterHideMode(seed: ReadonlySet<string>) {
  state = {
    isHideMode: true,
    hideModeProjectIds: new Set(seed),
  };
  emit();
}

function exitHideMode() {
  state = {
    isHideMode: false,
    hideModeProjectIds: new Set<string>(),
  };
  emit();
}

function toggleProjectHiddenState(projectId: string) {
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

function replaceDraftIfHideMode(ids: ReadonlySet<string>) {
  if (!state.isHideMode) return;
  state = {
    ...state,
    hideModeProjectIds: new Set(ids),
  };
  emit();
}

export function useHiddenPaceCards() {
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects();

  const hiddenProjectIds = useMemo(
    () =>
      new Set(
        projects.filter((project) => project.pace_hidden).map((project) => project.id),
      ),
    [projects],
  );

  const [snapshot, setSnapshot] = useState<HideModeState>(() => state);
  useEffect(() => subscribe(setSnapshot), []);

  const persistHidden = useCallback(
    async (nextHidden: ReadonlySet<string>) => {
      const toHide = projects
        .filter((project) => !project.pace_hidden && nextHidden.has(project.id))
        .map((project) => project.id);
      const toShow = projects
        .filter((project) => project.pace_hidden && !nextHidden.has(project.id))
        .map((project) => project.id);

      if (toHide.length === 0 && toShow.length === 0) return;

      // Optimistically patch every cached projects list so the UI updates
      // immediately, then reconcile with the server.
      qc.setQueriesData<Project[]>({ queryKey: ['projects'] }, (old) => {
        if (!old) return old;
        return old.map((project) => {
          const shouldHide = nextHidden.has(project.id);
          return project.pace_hidden === shouldHide
            ? project
            : { ...project, pace_hidden: shouldHide };
        });
      });

      try {
        if (toHide.length > 0) {
          const { error } = await supabase
            .from('projects')
            .update({ pace_hidden: true })
            .in('id', toHide);
          if (error) throw error;
        }
        if (toShow.length > 0) {
          const { error } = await supabase
            .from('projects')
            .update({ pace_hidden: false })
            .in('id', toShow);
          if (error) throw error;
        }
      } finally {
        qc.invalidateQueries({ queryKey: ['projects'] });
      }
    },
    [projects, qc],
  );

  const toggleHideMode = useCallback(() => {
    if (state.isHideMode) {
      const committed = state.hideModeProjectIds;
      exitHideMode();
      void persistHidden(committed);
      return;
    }
    enterHideMode(hiddenProjectIds);
  }, [hiddenProjectIds, persistHidden]);

  const setHiddenProjectIds = useCallback(
    (ids: ReadonlySet<string>) => {
      replaceDraftIfHideMode(ids);
      void persistHidden(ids);
    },
    [persistHidden],
  );

  return {
    hiddenProjectIds,
    hideModeProjectIds: snapshot.isHideMode ? snapshot.hideModeProjectIds : hiddenProjectIds,
    isHideMode: snapshot.isHideMode,
    toggleHideMode,
    toggleProjectHidden: toggleProjectHiddenState,
    setHiddenProjectIds,
  };
}
