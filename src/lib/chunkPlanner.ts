import { progressTarget } from './calc';
import { unbufferedProgressRate } from './pace';
import type { Project, Task, TaskType } from './types';

export const DEFAULT_CHUNK_LENGTH_SECONDS = 15 * 60;

export const CHUNK_PLANNER_ENTRIES_KEY = 'prime.chunkPlanner.entries';
export const CHUNK_PLANNER_CHUNK_LENGTH_KEY = 'prime.chunkPlanner.chunkLength';

export type ChunkAllotmentMode = 'progress' | 'realtime';

export interface ChunkPlannerEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  taskType: TaskType;
  /** Task `current_progress` when the entry was added (range start). */
  startProgress: number;
  /** Allotted work in the task's progress units (units or seconds). */
  allottedProgress: number;
  allottedRealtimeSeconds: number;
  sortOrder: number;
}

export interface ChunkPlannerChunk {
  id: string;
  entryId: string;
  index: number;
  realtimeSeconds: number;
  progressAmount: number;
  /** Absolute progress at the start of this chunk. */
  progressFrom: number;
  /** Absolute progress at the end of this chunk. */
  progressTo: number;
}

export interface AllotmentResult {
  allottedProgress: number;
  allottedRealtimeSeconds: number;
  remainingProgress: number;
  rate: number;
}

function safeNum(n: number | null | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Remaining progress units from current toward the task target (never negative). */
export function remainingProgressUnits(
  task: Pick<
    Task,
    | 'type'
    | 'current_progress'
    | 'scaling_modifier'
    | 'scripting_modifier'
    | 'script_length'
    | 'unit_count'
    | 'unit_length'
    | 'manual_length'
    | 'complex_mode'
    | 'id'
  >,
  project: Pick<Project, 'video_length'>,
): number {
  const target = progressTarget(task, project);
  const current = safeNum(task.current_progress);
  return Math.max(0, target - current);
}

/**
 * Convert an allotment request into capped progress + unbuffered realtime.
 * Progress mode: `amount` is progress units (or seconds for timecode types).
 * Realtime mode: `amount` is realtime seconds of work.
 */
export function computeAllotment(
  task: Pick<
    Task,
    | 'type'
    | 'current_progress'
    | 'scaling_modifier'
    | 'scripting_modifier'
    | 'unit_length'
    | 'script_length'
    | 'unit_count'
    | 'manual_length'
    | 'complex_mode'
    | 'id'
  >,
  project: Pick<Project, 'video_length'>,
  mode: ChunkAllotmentMode,
  amount: number,
): AllotmentResult {
  const remaining = remainingProgressUnits(task, project);
  const rate = unbufferedProgressRate(task);
  const requested = Number.isFinite(amount) && amount > 0 ? amount : 0;

  let allottedProgress: number;
  if (mode === 'progress') {
    allottedProgress = Math.min(requested, remaining);
    if (task.type === 'custom') {
      allottedProgress = Math.floor(allottedProgress);
    }
  } else {
    if (rate <= 0) {
      return {
        allottedProgress: 0,
        allottedRealtimeSeconds: 0,
        remainingProgress: remaining,
        rate,
      };
    }
    let fromRealtime = requested / rate;
    if (task.type === 'custom') {
      fromRealtime = Math.floor(fromRealtime);
    }
    allottedProgress = Math.min(fromRealtime, remaining);
  }

  const allottedRealtimeSeconds = allottedProgress * rate;
  return {
    allottedProgress,
    allottedRealtimeSeconds,
    remainingProgress: remaining,
    rate,
  };
}

/** Split allotted realtime into fixed-size chunks (last may be shorter). */
export function splitIntoChunks(
  entryId: string,
  startProgress: number,
  allottedRealtimeSeconds: number,
  rate: number,
  chunkLengthSeconds: number,
): ChunkPlannerChunk[] {
  const chunkLen =
    Number.isFinite(chunkLengthSeconds) && chunkLengthSeconds > 0
      ? chunkLengthSeconds
      : DEFAULT_CHUNK_LENGTH_SECONDS;
  const total =
    Number.isFinite(allottedRealtimeSeconds) && allottedRealtimeSeconds > 0
      ? allottedRealtimeSeconds
      : 0;
  if (total <= 0) return [];

  const base = Number.isFinite(startProgress) ? startProgress : 0;
  const chunks: ChunkPlannerChunk[] = [];
  let remaining = total;
  let cursor = base;
  let index = 0;
  while (remaining > 0) {
    const realtimeSeconds = Math.min(chunkLen, remaining);
    const progressAmount = rate > 0 ? realtimeSeconds / rate : 0;
    const progressFrom = cursor;
    const progressTo = cursor + progressAmount;
    chunks.push({
      id: `${entryId}-chunk-${index}`,
      entryId,
      index,
      realtimeSeconds,
      progressAmount,
      progressFrom,
      progressTo,
    });
    cursor = progressTo;
    remaining -= realtimeSeconds;
    index += 1;
  }
  return chunks;
}

export function chunksForEntry(
  entry: ChunkPlannerEntry,
  chunkLengthSeconds: number,
): ChunkPlannerChunk[] {
  const rate =
    entry.allottedProgress > 0
      ? entry.allottedRealtimeSeconds / entry.allottedProgress
      : 0;
  return splitIntoChunks(
    entry.id,
    entry.startProgress,
    entry.allottedRealtimeSeconds,
    rate,
    chunkLengthSeconds,
  );
}

export function readStoredEntries(): ChunkPlannerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CHUNK_PLANNER_ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is ChunkPlannerEntry => isValidEntry(row))
      .map((row) => ({
        ...row,
        startProgress:
          typeof row.startProgress === 'number' && Number.isFinite(row.startProgress)
            ? row.startProgress
            : 0,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

export function writeStoredEntries(entries: ChunkPlannerEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHUNK_PLANNER_ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    /* localStorage may be unavailable */
  }
}

export function readStoredChunkLength(): number {
  if (typeof window === 'undefined') return DEFAULT_CHUNK_LENGTH_SECONDS;
  try {
    const raw = window.localStorage.getItem(CHUNK_PLANNER_CHUNK_LENGTH_KEY);
    const num = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(num) && num > 0 ? num : DEFAULT_CHUNK_LENGTH_SECONDS;
  } catch {
    return DEFAULT_CHUNK_LENGTH_SECONDS;
  }
}

export function writeStoredChunkLength(seconds: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHUNK_PLANNER_CHUNK_LENGTH_KEY,
      String(Math.max(1, Math.floor(seconds))),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function isValidEntry(row: unknown): row is ChunkPlannerEntry {
  if (!row || typeof row !== 'object') return false;
  const e = row as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.projectId === 'string' &&
    typeof e.projectName === 'string' &&
    typeof e.taskId === 'string' &&
    typeof e.taskName === 'string' &&
    typeof e.taskType === 'string' &&
    typeof e.allottedProgress === 'number' &&
    typeof e.allottedRealtimeSeconds === 'number' &&
    typeof e.sortOrder === 'number' &&
    (e.startProgress == null ||
      (typeof e.startProgress === 'number' && Number.isFinite(e.startProgress)))
  );
}

export function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chunk-entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
