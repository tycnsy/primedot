import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import type { RealtimeLog } from './types';

export type HeatmapView = 'yearly' | 'rolling3' | 'rolling5' | 'weekly' | 'monthly';

export const HEATMAP_VIEWS: { value: HeatmapView; label: string }[] = [
  { value: 'yearly', label: 'Yearly' },
  { value: 'rolling3', label: 'Rolling 3-day' },
  { value: 'rolling5', label: 'Rolling 5-day' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function heatmapViewLabel(view: HeatmapView): string {
  return HEATMAP_VIEWS.find((v) => v.value === view)?.label ?? 'Yearly';
}

const HEATMAP_VIEW_STORAGE_KEY = 'prime:heatmap-view';

/** Map legacy `daily` (pre-yearly rename) to `yearly`. */
function normalizeHeatmapView(raw: string | null): HeatmapView | null {
  if (raw === 'daily') return 'yearly';
  return HEATMAP_VIEWS.some((v) => v.value === raw) ? (raw as HeatmapView) : null;
}

export function parseHeatmapView(raw: string | null): HeatmapView | null {
  return normalizeHeatmapView(raw);
}

export function readPersistedHeatmapView(): HeatmapView {
  if (typeof window === 'undefined') return 'yearly';
  try {
    const stored = window.localStorage.getItem(HEATMAP_VIEW_STORAGE_KEY);
    const resolved = normalizeHeatmapView(stored) ?? 'yearly';
    if (stored === 'daily') {
      writePersistedHeatmapView('yearly');
    }
    return resolved;
  } catch {
    return 'yearly';
  }
}

export function writePersistedHeatmapView(view: HeatmapView): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HEATMAP_VIEW_STORAGE_KEY, view);
  } catch {
    // localStorage may be unavailable; ignore persistence.
  }
}

/** URL param wins when present; otherwise fall back to the last saved preference. */
export function resolveHeatmapView(urlParam: string | null): HeatmapView {
  return parseHeatmapView(urlParam) ?? readPersistedHeatmapView();
}

/**
 * How cells are colored:
 * - `relative`: intensity relative to the busiest day in the visible range (default).
 * - `goal`: progress toward a per-day target (per-tag goal, or summed goals for "all").
 */
export type HeatmapColorMode = 'relative' | 'goal';

export const HEATMAP_COLOR_MODES: { value: HeatmapColorMode; label: string }[] = [
  { value: 'relative', label: 'Relative' },
  { value: 'goal', label: 'Goal' },
];

const HEATMAP_CALC_STORAGE_KEY = 'prime:heatmap-calc-mode';

export function parseHeatmapColorMode(raw: string | null): HeatmapColorMode | null {
  return HEATMAP_COLOR_MODES.some((m) => m.value === raw)
    ? (raw as HeatmapColorMode)
    : null;
}

export function readPersistedHeatmapColorMode(): HeatmapColorMode {
  if (typeof window === 'undefined') return 'relative';
  try {
    return (
      parseHeatmapColorMode(window.localStorage.getItem(HEATMAP_CALC_STORAGE_KEY)) ??
      'relative'
    );
  } catch {
    return 'relative';
  }
}

export function writePersistedHeatmapColorMode(mode: HeatmapColorMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HEATMAP_CALC_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable; ignore persistence.
  }
}

/** URL param wins when present; otherwise fall back to the last saved preference. */
export function resolveHeatmapColorMode(urlParam: string | null): HeatmapColorMode {
  return parseHeatmapColorMode(urlParam) ?? readPersistedHeatmapColorMode();
}

export interface HeatmapColorOptions {
  mode: HeatmapColorMode;
  /** Daily target in seconds, used when `mode === 'goal'`. */
  goalSecondsPerDay: number;
}

export const DEFAULT_COLOR_OPTIONS: HeatmapColorOptions = {
  mode: 'relative',
  goalSecondsPerDay: 0,
};

export interface HeatmapDayCell {
  dateKey: string;
  date: Date;
  /** Realtime logged on this specific day. */
  totalSeconds: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** True when the day falls before the user's yearly tracking start date. */
  preStart?: boolean;
  /** True when the day is after today (future dates in the current year). */
  future?: boolean;
}

export interface HeatmapWeekColumn {
  weekStart: Date;
  days: (HeatmapDayCell | null)[];
}

export interface HeatmapGridData {
  weeks: HeatmapWeekColumn[];
  maxSeconds: number;
  totalSeconds: number;
}

/** A contiguous run of day cells (chronological) for the non-year views. */
export interface HeatmapRange {
  cells: HeatmapDayCell[];
  start: Date;
  end: Date;
  maxSeconds: number;
  totalSeconds: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function bucketLogsByLocalDay(
  logs: RealtimeLog[],
): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const log of logs) {
    const key = localDayKey(new Date(log.logged_at));
    buckets.set(key, (buckets.get(key) ?? 0) + Number(log.realtime_delta_seconds));
  }
  return buckets;
}

function intensityLevel(seconds: number, maxSeconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  if (maxSeconds <= 0) return seconds > 0 ? 1 : 0;
  const ratio = seconds / maxSeconds;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

/**
 * Level from progress toward a daily goal. Fully colored (level 4) once the goal
 * is met. When no goal is set, everything stays at level 0.
 */
export function goalLevel(seconds: number, goalSeconds: number): 0 | 1 | 2 | 3 | 4 {
  if (goalSeconds <= 0 || seconds <= 0) return 0;
  const ratio = seconds / goalSeconds;
  if (ratio >= 1) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

function cellLevel(
  seconds: number,
  maxSeconds: number,
  color: HeatmapColorOptions,
): 0 | 1 | 2 | 3 | 4 {
  return color.mode === 'goal'
    ? goalLevel(seconds, color.goalSecondsPerDay)
    : intensityLevel(seconds, maxSeconds);
}

function makeDayCell(day: Date, dayBuckets: Map<string, number>): HeatmapDayCell {
  const dateKey = localDayKey(day);
  return {
    dateKey,
    date: day,
    totalSeconds: dayBuckets.get(dateKey) ?? 0,
    level: 0,
  };
}

/**
 * Build a GitHub-style calendar grid: columns = weeks, rows = Sun–Sat.
 * Used by the year-spanning "Yearly" view. Only progress deltas contribute to
 * cell totals (caller passes the relevant logs and we sum realtime_delta_seconds).
 */
export function buildHeatmapGrid(
  logs: RealtimeLog[],
  weeks = 52,
  now: Date = new Date(),
  color: HeatmapColorOptions = DEFAULT_COLOR_OPTIONS,
  yearlyStart: Date | null = null,
): HeatmapGridData {
  const end = startOfDay(now);
  const start = subDays(end, weeks * 7 - 1);
  const dayBuckets = bucketLogsByLocalDay(logs);
  const startBoundary = yearlyStart ? startOfDay(yearlyStart) : null;

  const allDays = eachDayOfInterval({ start, end });
  let maxSeconds = 0;
  let totalSeconds = 0;

  const cellsByKey = new Map<string, HeatmapDayCell>();
  for (const day of allDays) {
    const cell = makeDayCell(day, dayBuckets);
    const isPreStart = startBoundary != null && startOfDay(day) < startBoundary;
    if (isPreStart) {
      cell.preStart = true;
      cell.level = 0;
    } else {
      if (cell.totalSeconds > maxSeconds) maxSeconds = cell.totalSeconds;
      totalSeconds += cell.totalSeconds;
    }
    cellsByKey.set(cell.dateKey, cell);
  }

  for (const cell of cellsByKey.values()) {
    if (!cell.preStart) {
      cell.level = cellLevel(cell.totalSeconds, maxSeconds, color);
    }
  }

  const weeksOut: HeatmapWeekColumn[] = [];
  const lastWeekStart = startOfWeek(end, { weekStartsOn: 0 });
  let cursor = startOfWeek(start, { weekStartsOn: 0 });
  while (cursor <= lastWeekStart) {
    const weekStart = cursor;
    const days: (HeatmapDayCell | null)[] = [];
    for (let row = 0; row < 7; row += 1) {
      const day = addDays(weekStart, row);
      if (day < start || day > end) {
        days.push(null);
      } else {
        days.push(cellsByKey.get(localDayKey(day)) ?? null);
      }
    }
    weeksOut.push({ weekStart, days });
    cursor = addDays(cursor, 7);
  }

  return { weeks: weeksOut, maxSeconds, totalSeconds };
}

/** Inclusive calendar-year span (Jan 1 – Dec 31). */
export function getYearRange(year: number): { start: Date; end: Date } {
  return {
    start: startOfDay(new Date(year, 0, 1)),
    end: startOfDay(new Date(year, 11, 31)),
  };
}

/**
 * Build a GitHub-style calendar grid for a full calendar year (Jan–Dec).
 * Future days (after `now`) are marked but excluded from totals and coloring.
 */
export function buildYearGrid(
  logs: RealtimeLog[],
  year: number,
  now: Date = new Date(),
  color: HeatmapColorOptions = DEFAULT_COLOR_OPTIONS,
  yearlyStart: Date | null = null,
): HeatmapGridData {
  const { start, end } = getYearRange(year);
  const today = startOfDay(now);
  const dayBuckets = bucketLogsByLocalDay(logs);
  const startBoundary = yearlyStart ? startOfDay(yearlyStart) : null;

  const allDays = eachDayOfInterval({ start, end });
  let maxSeconds = 0;
  let totalSeconds = 0;

  const cellsByKey = new Map<string, HeatmapDayCell>();
  for (const day of allDays) {
    const cell = makeDayCell(day, dayBuckets);
    const isFuture = startOfDay(day) > today;
    const isPreStart = startBoundary != null && startOfDay(day) < startBoundary;

    if (isFuture) {
      cell.future = true;
      cell.level = 0;
    } else if (isPreStart) {
      cell.preStart = true;
      cell.level = 0;
    } else {
      if (cell.totalSeconds > maxSeconds) maxSeconds = cell.totalSeconds;
      totalSeconds += cell.totalSeconds;
    }
    cellsByKey.set(cell.dateKey, cell);
  }

  for (const cell of cellsByKey.values()) {
    if (!cell.preStart && !cell.future) {
      cell.level = cellLevel(cell.totalSeconds, maxSeconds, color);
    }
  }

  const weeksOut: HeatmapWeekColumn[] = [];
  const lastWeekStart = startOfWeek(end, { weekStartsOn: 0 });
  let cursor = startOfWeek(start, { weekStartsOn: 0 });
  while (cursor <= lastWeekStart) {
    const weekStart = cursor;
    const days: (HeatmapDayCell | null)[] = [];
    for (let row = 0; row < 7; row += 1) {
      const day = addDays(weekStart, row);
      if (day < start || day > end) {
        days.push(null);
      } else {
        days.push(cellsByKey.get(localDayKey(day)) ?? null);
      }
    }
    weeksOut.push({ weekStart, days });
    cursor = addDays(cursor, 7);
  }

  return { weeks: weeksOut, maxSeconds, totalSeconds };
}

/**
 * The inclusive date span a view covers. The shorter views show a small,
 * recent window so the grid renders fewer (and larger) squares.
 */
export function getViewRange(
  view: HeatmapView,
  now: Date = new Date(),
  offsetDays = 0,
): { start: Date; end: Date } {
  const today = startOfDay(now);
  switch (view) {
    case 'rolling3': {
      const end = addDays(today, offsetDays);
      return { start: subDays(end, 2), end };
    }
    case 'rolling5': {
      const end = addDays(today, offsetDays);
      return { start: subDays(end, 4), end };
    }
    case 'weekly':
      return {
        start: startOfWeek(today, { weekStartsOn: 0 }),
        end: endOfWeek(today, { weekStartsOn: 0 }),
      };
    case 'monthly':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'yearly':
    default:
      return { start: subDays(today, 52 * 7 - 1), end: today };
  }
}

/** Build a flat, chronological list of day cells for the given inclusive span. */
export function buildHeatmapRange(
  logs: RealtimeLog[],
  start: Date,
  end: Date,
  color: HeatmapColorOptions = DEFAULT_COLOR_OPTIONS,
): HeatmapRange {
  const dayBuckets = bucketLogsByLocalDay(logs);
  const days = eachDayOfInterval({
    start: startOfDay(start),
    end: startOfDay(end),
  });

  const cells = days.map((day) => makeDayCell(day, dayBuckets));
  const maxSeconds = cells.reduce((max, cell) => Math.max(max, cell.totalSeconds), 0);
  let totalSeconds = 0;
  for (const cell of cells) {
    cell.level = cellLevel(cell.totalSeconds, maxSeconds, color);
    totalSeconds += cell.totalSeconds;
  }

  return {
    cells,
    start: days[0] ?? startOfDay(start),
    end: days[days.length - 1] ?? startOfDay(end),
    maxSeconds,
    totalSeconds,
  };
}

/** Short human label for the time span a view covers, used in the summary line. */
export function viewRangeLabel(
  view: HeatmapView,
  range?: { start: Date; end: Date },
  year?: number,
): string {
  if (range && (view === 'rolling3' || view === 'rolling5')) {
    const startLabel = format(range.start, 'MMM d');
    const endLabel = format(range.end, 'MMM d, yyyy');
    return `${startLabel} – ${endLabel}`;
  }
  switch (view) {
    case 'rolling3':
      return 'in the last 3 days';
    case 'rolling5':
      return 'in the last 5 days';
    case 'weekly':
      return 'this week';
    case 'monthly':
      return 'this month';
    case 'yearly':
      return year != null ? `in ${year}` : 'this year';
    default:
      return 'this year';
  }
}

/** Rolling window size for navigation (3 or 5 days). */
export function rollingWindowSize(view: HeatmapView): number | null {
  if (view === 'rolling3') return 3;
  if (view === 'rolling5') return 5;
  return null;
}

export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? '';
}

export interface LogsByDayGroup {
  dateKey: string;
  date: Date;
  logs: RealtimeLog[];
  dayTotalSeconds: number;
}

export function groupLogsByLocalDay(logs: RealtimeLog[]): LogsByDayGroup[] {
  const map = new Map<string, RealtimeLog[]>();
  for (const log of logs) {
    const key = localDayKey(new Date(log.logged_at));
    const arr = map.get(key) ?? [];
    arr.push(log);
    map.set(key, arr);
  }

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayLogs]) => ({
      dateKey,
      date: new Date(`${dateKey}T12:00:00`),
      logs: dayLogs.sort(
        (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
      ),
      dayTotalSeconds: dayLogs.reduce(
        (sum, log) => sum + Number(log.realtime_delta_seconds),
        0,
      ),
    }));
}

/**
 * Channels map to a project's tag. Logs without a tag are grouped under this
 * sentinel so an "Untagged" channel still appears in breakdowns and filters.
 */
export const UNTAGGED_CHANNEL = '__untagged__';

/** Resolve the channel (tag) a log belongs to; null means untagged. */
export function logChannel(log: RealtimeLog): string | null {
  return log.project_tag && log.project_tag.length > 0 ? log.project_tag : null;
}

export const ALL_CHANNELS = 'all';

/**
 * The daily goal (seconds) used as the coloring denominator for a channel filter:
 * - "all": the sum of every tag's daily goal (matches "compare progress to the
 *   total hours set across all tags").
 * - a specific tag: that tag's goal.
 * - untagged: no goal (0), since goals are per tag.
 */
export function dailyGoalSecondsForChannel(
  goalByTag: Map<string, number>,
  channel: string,
): number {
  if (channel === ALL_CHANNELS) {
    let sum = 0;
    for (const seconds of goalByTag.values()) sum += seconds;
    return sum;
  }
  if (channel === UNTAGGED_CHANNEL) return 0;
  return goalByTag.get(channel) ?? 0;
}

export interface ProjectDaySummary {
  projectId: string;
  projectName: string;
  totalSeconds: number;
  logs: RealtimeLog[];
}

export interface ChannelDaySummary {
  /** Tag name, or null for untagged work. */
  channel: string | null;
  totalSeconds: number;
  projects: ProjectDaySummary[];
}

export interface DaySummary {
  totalSeconds: number;
  channels: ChannelDaySummary[];
}

/**
 * Break a single day's logs down by channel (tag) and then by project, summing
 * realtime deltas. Channels and projects are sorted by total time, descending.
 */
export function summarizeDay(logs: RealtimeLog[]): DaySummary {
  const logsByChannel = new Map<string, RealtimeLog[]>();
  for (const log of logs) {
    const key = logChannel(log) ?? '';
    const bucket = logsByChannel.get(key) ?? [];
    bucket.push(log);
    logsByChannel.set(key, bucket);
  }

  let totalSeconds = 0;
  const channels: ChannelDaySummary[] = [];
  for (const [key, channelLogs] of logsByChannel) {
    const logsByProject = new Map<string, RealtimeLog[]>();
    for (const log of channelLogs) {
      const bucket = logsByProject.get(log.project_id) ?? [];
      bucket.push(log);
      logsByProject.set(log.project_id, bucket);
    }

    const projects: ProjectDaySummary[] = [...logsByProject.entries()]
      .map(([projectId, projectLogs]) => ({
        projectId,
        projectName: projectLogs[0]?.project_name ?? 'Unknown project',
        totalSeconds: projectLogs.reduce(
          (sum, log) => sum + Number(log.realtime_delta_seconds),
          0,
        ),
        logs: projectLogs.sort(
          (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
        ),
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    const channelTotal = projects.reduce((sum, project) => sum + project.totalSeconds, 0);
    totalSeconds += channelTotal;
    channels.push({
      channel: key === '' ? null : key,
      totalSeconds: channelTotal,
      projects,
    });
  }

  channels.sort((a, b) => b.totalSeconds - a.totalSeconds);
  return { totalSeconds, channels };
}

export function changeKindLabel(kind: RealtimeLog['change_kind']): string {
  switch (kind) {
    case 'current_progress':
      return 'Progress';
    case 'task_name':
      return 'Task name';
    case 'task_type':
      return 'Task type';
    case 'scaling_modifier':
      return 'Scaling modifier';
    case 'scripting_modifier':
      return 'Scripting modifier';
    case 'script_length':
      return 'Script length';
    case 'unit_count':
      return 'Unit count';
    case 'unit_length':
      return 'Unit length';
    case 'video_length':
      return 'Video length';
    case 'project_name':
      return 'Project name';
    case 'project_tag':
      return 'Project tag';
    case 'project_series':
      return 'Project series';
    case 'task_created':
      return 'Task created';
    case 'task_deleted':
      return 'Task deleted';
    default:
      return kind;
  }
}
