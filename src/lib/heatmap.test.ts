import { describe, expect, it } from 'vitest';
import {
  ALL_CHANNELS,
  UNTAGGED_CHANNEL,
  buildHeatmapGrid,
  bucketLogsByLocalDay,
  dailyGoalSecondsForChannel,
  getViewRange,
  goalLevel,
  localDayKey,
  parseHeatmapView,
} from './heatmap';
import type { RealtimeLog } from './types';

function makeLog(
  overrides: Partial<RealtimeLog> & Pick<RealtimeLog, 'logged_at' | 'realtime_delta_seconds'>,
): RealtimeLog {
  return {
    id: overrides.id ?? 'log-1',
    user_id: 'user-1',
    project_id: 'project-1',
    task_id: 'task-1',
    change_kind: 'current_progress',
    old_value: '0',
    new_value: '10',
    task_name: 'Task',
    task_type: 'custom',
    project_name: 'Project',
    project_tag: null,
    project_series: null,
    video_length: 600,
    scaling_modifier: null,
    scripting_modifier: null,
    script_length: null,
    unit_count: 20,
    unit_length: 30,
    current_progress: 10,
    ...overrides,
  };
}

describe('heatmap', () => {
  it('maps legacy daily view value to yearly', () => {
    expect(parseHeatmapView('daily')).toBe('yearly');
    expect(parseHeatmapView('yearly')).toBe('yearly');
    expect(parseHeatmapView('rolling3')).toBe('rolling3');
  });

  it('buckets logs by local day and sums deltas', () => {
    const day = '2026-06-28T15:00:00.000Z';
    const buckets = bucketLogsByLocalDay([
      makeLog({ logged_at: day, realtime_delta_seconds: 300 }),
      makeLog({ id: 'log-2', logged_at: day, realtime_delta_seconds: -60 }),
    ]);
    const key = localDayKey(new Date(day));
    expect(buckets.get(key)).toBe(240);
  });

  it('builds a grid with non-zero totals', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const grid = buildHeatmapGrid(
      [makeLog({ logged_at: now.toISOString(), realtime_delta_seconds: 600 })],
      4,
      now,
    );
    expect(grid.totalSeconds).toBe(600);
    expect(grid.weeks.length).toBeGreaterThan(0);
  });

  it('maps progress-vs-goal into levels, peaking when the goal is met', () => {
    const goal = 4 * 3600;
    expect(goalLevel(0, goal)).toBe(0);
    expect(goalLevel(3600, goal)).toBe(1); // 25%
    expect(goalLevel(2 * 3600, goal)).toBe(2); // 50%
    expect(goalLevel(3.5 * 3600, goal)).toBe(3); // 87.5%
    expect(goalLevel(4 * 3600, goal)).toBe(4); // 100%
    expect(goalLevel(8 * 3600, goal)).toBe(4); // over goal
    expect(goalLevel(3600, 0)).toBe(0); // no goal set
  });

  it('resolves the goal denominator per channel', () => {
    const goalByTag = new Map([
      ['Main', 4 * 3600],
      ['Side', 1 * 3600],
    ]);
    expect(dailyGoalSecondsForChannel(goalByTag, ALL_CHANNELS)).toBe(5 * 3600);
    expect(dailyGoalSecondsForChannel(goalByTag, 'Main')).toBe(4 * 3600);
    expect(dailyGoalSecondsForChannel(goalByTag, 'Missing')).toBe(0);
    expect(dailyGoalSecondsForChannel(goalByTag, UNTAGGED_CHANNEL)).toBe(0);
  });

  it('colors the grid by goal progress when in goal mode', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const grid = buildHeatmapGrid(
      [makeLog({ logged_at: now.toISOString(), realtime_delta_seconds: 2 * 3600 })],
      4,
      now,
      { mode: 'goal', goalSecondsPerDay: 4 * 3600 },
    );
    const activeCell = grid.weeks
      .flatMap((week) => week.days)
      .find((day) => day != null && day.totalSeconds > 0);
    expect(activeCell?.totalSeconds).toBe(2 * 3600);
    expect(activeCell?.level).toBe(2); // 2h of a 4h goal = 50%
  });

  it('marks days before yearly start as preStart and excludes them from totals', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const yearlyStart = new Date('2026-06-27T12:00:00.000Z');
    const grid = buildHeatmapGrid(
      [
        makeLog({ logged_at: '2026-06-26T12:00:00.000Z', realtime_delta_seconds: 1000 }),
        makeLog({ logged_at: now.toISOString(), realtime_delta_seconds: 600 }),
      ],
      4,
      now,
      undefined,
      yearlyStart,
    );
    const preStartCell = grid.weeks
      .flatMap((week) => week.days)
      .find((day) => day?.dateKey === '2026-06-26');
    const activeCell = grid.weeks
      .flatMap((week) => week.days)
      .find((day) => day?.dateKey === '2026-06-28');
    expect(preStartCell?.preStart).toBe(true);
    expect(preStartCell?.level).toBe(0);
    expect(grid.totalSeconds).toBe(600);
    expect(activeCell?.totalSeconds).toBe(600);
  });

  it('shifts rolling view ranges by offset days', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const range = getViewRange('rolling3', now, -1);
    expect(range.end.toISOString().slice(0, 10)).toBe('2026-06-27');
    expect(range.start.toISOString().slice(0, 10)).toBe('2026-06-25');
  });
});
