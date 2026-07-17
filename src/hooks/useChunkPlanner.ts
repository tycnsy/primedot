import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  chunksForEntry,
  newEntryId,
  readStoredChunkLength,
  readStoredEntries,
  writeStoredChunkLength,
  writeStoredEntries,
  type ChunkAllotmentMode,
  type ChunkPlannerChunk,
  type ChunkPlannerEntry,
  DEFAULT_CHUNK_LENGTH_SECONDS,
  computeAllotment,
} from '../lib/chunkPlanner';
import type { Project, Task, TaskType } from '../lib/types';

export type { ChunkAllotmentMode, ChunkPlannerChunk, ChunkPlannerEntry };

export interface AddChunkEntryInput {
  project: Project;
  task: Task;
  mode: ChunkAllotmentMode;
  amount: number;
}

export function useChunkPlanner() {
  const [entries, setEntries] = useState<ChunkPlannerEntry[]>(() => readStoredEntries());
  const [chunkLengthSeconds, setChunkLengthState] = useState<number>(() =>
    readStoredChunkLength(),
  );

  useEffect(() => {
    writeStoredEntries(entries);
  }, [entries]);

  useEffect(() => {
    writeStoredChunkLength(chunkLengthSeconds);
  }, [chunkLengthSeconds]);

  const setChunkLengthSeconds = useCallback((seconds: number) => {
    const next = Math.max(60, Math.floor(seconds));
    setChunkLengthState(next);
  }, []);

  const addEntry = useCallback((input: AddChunkEntryInput): ChunkPlannerEntry | null => {
    const allotment = computeAllotment(
      input.task,
      input.project,
      input.mode,
      input.amount,
    );
    if (allotment.allottedProgress <= 0 || allotment.allottedRealtimeSeconds <= 0) {
      return null;
    }

    const entry: ChunkPlannerEntry = {
      id: newEntryId(),
      projectId: input.project.id,
      projectName: input.project.name,
      taskId: input.task.id,
      taskName: input.task.name,
      taskType: input.task.type as TaskType,
      startProgress: Number(input.task.current_progress) || 0,
      allottedProgress: allotment.allottedProgress,
      allottedRealtimeSeconds: allotment.allottedRealtimeSeconds,
      sortOrder: 0,
    };

    setEntries((prev) => {
      const next = [...prev, { ...entry, sortOrder: prev.length }];
      return next.map((row, index) => ({ ...row, sortOrder: index }));
    });
    return entry;
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) =>
      prev
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, sortOrder: index })),
    );
  }, []);

  const clearBoard = useCallback(() => {
    setEntries([]);
  }, []);

  const reorderEntries = useCallback((orderedIds: string[]) => {
    setEntries((prev) => {
      const byId = new Map(prev.map((row) => [row.id, row]));
      const next: ChunkPlannerEntry[] = [];
      for (const id of orderedIds) {
        const row = byId.get(id);
        if (row) next.push(row);
      }
      for (const row of prev) {
        if (!orderedIds.includes(row.id)) next.push(row);
      }
      return next.map((row, index) => ({ ...row, sortOrder: index }));
    });
  }, []);

  const chunksByEntryId = useMemo(() => {
    const map = new Map<string, ChunkPlannerChunk[]>();
    for (const entry of entries) {
      map.set(entry.id, chunksForEntry(entry, chunkLengthSeconds));
    }
    return map;
  }, [entries, chunkLengthSeconds]);

  const totalRealtimeSeconds = useMemo(
    () => entries.reduce((sum, row) => sum + row.allottedRealtimeSeconds, 0),
    [entries],
  );

  const totalChunkCount = useMemo(() => {
    let count = 0;
    for (const chunks of chunksByEntryId.values()) count += chunks.length;
    return count;
  }, [chunksByEntryId]);

  return {
    entries,
    chunkLengthSeconds,
    setChunkLengthSeconds,
    defaultChunkLengthSeconds: DEFAULT_CHUNK_LENGTH_SECONDS,
    addEntry,
    removeEntry,
    clearBoard,
    reorderEntries,
    chunksByEntryId,
    totalRealtimeSeconds,
    totalChunkCount,
  };
}
