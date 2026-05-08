import { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { usePaceSettingsForProjects } from '../hooks/usePaceSettings';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects } from '../hooks/useTasks';
import { publishPaceWidgetSnapshot } from '../lib/capacitorWidgetBridge';
import { buildPaceWidgetSnapshot } from '../lib/widgetSnapshot';

const SNAPSHOT_DEBOUNCE_MS = 600;

export default function PaceWidgetSync() {
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } =
    useProjects();
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } =
    useTasksForProjects(projectIds);
  const {
    data: paceByProject = {},
    isLoading: paceLoading,
    error: paceError,
  } = usePaceSettingsForProjects(projectIds);

  const previousSnapshotJsonRef = useRef<string>('');
  const [foregroundRefreshNonce, setForegroundRefreshNonce] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;

    let isActive = true;
    const listenerHandlePromise = CapacitorApp.addListener(
      'appStateChange',
      ({ isActive: nowActive }) => {
        if (!isActive || !nowActive) return;
        // Retry widget publishing whenever the app returns foreground.
        setForegroundRefreshNonce((value) => value + 1);
      },
    );

    return () => {
      isActive = false;
      void listenerHandlePromise.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (projectsLoading || tasksLoading || paceLoading) return;
    if (projectsError || tasksError || paceError) return;

    const timeoutId = window.setTimeout(async () => {
      const snapshot = buildPaceWidgetSnapshot({
        projects,
        tasks,
        paceByProject,
      });
      const snapshotJson = JSON.stringify(snapshot);
      if (snapshotJson === previousSnapshotJsonRef.current) return;
      const published = await publishPaceWidgetSnapshot(snapshot);
      if (published) {
        previousSnapshotJsonRef.current = snapshotJson;
      }
    }, SNAPSHOT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    paceByProject,
    paceError,
    paceLoading,
    projects,
    projectsError,
    projectsLoading,
    tasks,
    tasksError,
    tasksLoading,
    foregroundRefreshNonce,
  ]);

  return null;
}
