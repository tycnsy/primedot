import { describe, expect, it } from 'vitest';
import {
  calculatedProgress,
  currentPace,
  currentPaceEnd,
  deriveTaskStatus,
  estimatedCompletion,
  goalProgress,
  paceMargin,
  progressDelta,
  progressTarget,
  projectProgress,
  remainingProgress,
  taskLength,
  totalTaskLength,
} from './calc';
import type { PaceSettings, Project, Task } from './types';

const baseProject: Project = {
  id: 'p',
  user_id: 'u',
  name: 'demo',
  video_length: 1200,
  due_date: null,
  sync_true_deadline_with_due_date: false,
  buffer_modifier: 3,
  tag: null,
  series: null,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
};

const baseTask = (overrides: Partial<Task>): Task => ({
  id: 't',
  project_id: 'p',
  name: 'task',
  status: 'in_progress',
  type: 'scaling',
  current_progress: 0,
  scaling_modifier: null,
  scripting_modifier: null,
  script_length: null,
  unit_count: null,
  unit_length: null,
  manual_length: null,
  sort_order: 0,
  parent_id: null,
  complex_mode: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('taskLength', () => {
  it('scaling: video_length * scaling_modifier * buffer', () => {
    const task = baseTask({ type: 'scaling', scaling_modifier: 3 });
    expect(taskLength(task, baseProject)).toBe(1200 * 3 * 3);
  });
  it('scripting: script_length * scripting_modifier * buffer', () => {
    const task = baseTask({
      type: 'scripting',
      scripting_modifier: 4,
      script_length: 600,
    });
    expect(taskLength(task, baseProject)).toBe(600 * 4 * 3);
  });
  it('custom: unit_count * unit_length * buffer', () => {
    const task = baseTask({ type: 'custom', unit_count: 10, unit_length: 30 });
    expect(taskLength(task, baseProject)).toBe(10 * 30 * 3);
  });
  it('manual: manual_length * buffer', () => {
    const task = baseTask({ type: 'manual', manual_length: 500 });
    expect(taskLength(task, baseProject)).toBe(500 * 3);
  });
});

describe('progressTarget', () => {
  it('scaling uses project video length', () => {
    const task = baseTask({ type: 'scaling', scaling_modifier: 3 });
    expect(progressTarget(task, baseProject)).toBe(1200);
  });
  it('scripting uses task script length', () => {
    const task = baseTask({
      type: 'scripting',
      scripting_modifier: 4,
      script_length: 600,
    });
    expect(progressTarget(task, baseProject)).toBe(600);
  });
  it('custom uses unit count', () => {
    const task = baseTask({ type: 'custom', unit_count: 10, unit_length: 30 });
    expect(progressTarget(task, baseProject)).toBe(10);
  });
  it('manual uses manual length', () => {
    const task = baseTask({ type: 'manual', manual_length: 500 });
    expect(progressTarget(task, baseProject)).toBe(500);
  });
});

describe('calculatedProgress', () => {
  it('100%+ progress always returns task_length', () => {
    const task = baseTask({
      type: 'scaling',
      scaling_modifier: 2,
      current_progress: 1200,
      status: 'not_started',
    });
    expect(calculatedProgress(task, baseProject)).toBe(taskLength(task, baseProject));
  });
  it('scaling current_progress * scaling_modifier * buffer', () => {
    const task = baseTask({
      type: 'scaling',
      scaling_modifier: 2,
      current_progress: 60,
    });
    expect(calculatedProgress(task, baseProject)).toBe(60 * 2 * 3);
  });
  it('custom current_progress * unit_length * buffer', () => {
    const task = baseTask({
      type: 'custom',
      unit_count: 10,
      unit_length: 30,
      current_progress: 4,
    });
    expect(calculatedProgress(task, baseProject)).toBe(4 * 30 * 3);
  });
});

describe('deriveTaskStatus', () => {
  it('returns not_started at exactly 0 progress', () => {
    const task = baseTask({
      type: 'manual',
      manual_length: 600,
      current_progress: 0,
    });
    expect(deriveTaskStatus(task, baseProject)).toBe('not_started');
  });

  it('returns in_progress between 0 and 100%', () => {
    const task = baseTask({
      type: 'manual',
      manual_length: 600,
      current_progress: 300,
    });
    expect(deriveTaskStatus(task, baseProject)).toBe('in_progress');
  });

  it('returns complete at 100% and above for numeric tasks', () => {
    const atTarget = baseTask({
      type: 'custom',
      unit_count: 10,
      unit_length: 30,
      current_progress: 10,
    });
    const aboveTarget = baseTask({
      type: 'custom',
      unit_count: 10,
      unit_length: 30,
      current_progress: 15,
    });
    expect(deriveTaskStatus(atTarget, baseProject)).toBe('complete');
    expect(deriveTaskStatus(aboveTarget, baseProject)).toBe('complete');
  });

  it('handles hh:mm:ss-style tasks by stored seconds', () => {
    const task = baseTask({
      type: 'scripting',
      scripting_modifier: 2,
      script_length: 600,
      current_progress: 1,
    });
    expect(deriveTaskStatus(task, baseProject)).toBe('in_progress');
  });
});

describe('progressDelta + goalProgress (SPEC worked example)', () => {
  it('540s timer with scaling=3, buffer=3 gives 60s delta', () => {
    const task = baseTask({
      type: 'scaling',
      scaling_modifier: 3,
      current_progress: 300,
    });
    expect(progressDelta(task, baseProject, 540)).toBe(60);
    expect(goalProgress(task, baseProject, 300, 540)).toBe(360);
  });
  it('paceModifier=1 preserves current projection behavior', () => {
    const task = baseTask({
      type: 'manual',
      manual_length: 600,
      current_progress: 120,
    });
    expect(progressDelta(task, baseProject, 600, 1)).toBe(200);
    expect(goalProgress(task, baseProject, 120, 600, 1)).toBe(320);
  });
  it('paceModifier=2 doubles delta and goal projections', () => {
    const scalingTask = baseTask({
      type: 'scaling',
      scaling_modifier: 3,
      current_progress: 300,
    });
    const scriptingTask = baseTask({
      id: 'script',
      type: 'scripting',
      script_length: 600,
      scripting_modifier: 2,
      current_progress: 90,
    });
    const manualTask = baseTask({
      id: 'manual',
      type: 'manual',
      manual_length: 900,
      current_progress: 120,
    });

    expect(progressDelta(scalingTask, baseProject, 540, 2)).toBe(120);
    expect(goalProgress(scalingTask, baseProject, 300, 540, 2)).toBe(420);

    expect(progressDelta(scriptingTask, baseProject, 600, 2)).toBe(200);
    expect(goalProgress(scriptingTask, baseProject, 90, 600, 2)).toBe(290);

    expect(progressDelta(manualTask, baseProject, 600, 2)).toBe(400);
    expect(goalProgress(manualTask, baseProject, 120, 600, 2)).toBe(520);
  });
  it('manual: timer / buffer', () => {
    const task = baseTask({ type: 'manual', manual_length: 600 });
    expect(progressDelta(task, baseProject, 600)).toBe(200);
  });
  it('custom: floor to whole units', () => {
    const task = baseTask({
      type: 'custom',
      unit_count: 100,
      unit_length: 30,
      current_progress: 5,
    });
    expect(progressDelta(task, baseProject, 100)).toBe(1);
    expect(goalProgress(task, baseProject, 5, 100)).toBe(6);
  });
  it('custom paceModifier keeps whole-unit goal output', () => {
    const task = baseTask({
      type: 'custom',
      unit_count: 100,
      unit_length: 30,
      current_progress: 5,
    });

    expect(progressDelta(task, baseProject, 100, 2)).toBe(2);
    expect(goalProgress(task, baseProject, 5, 100, 2)).toBe(7);

    expect(progressDelta(task, baseProject, 100, 1.5)).toBe(1.5);
    expect(goalProgress(task, baseProject, 5, 100, 1.5)).toBe(6);
  });
});

describe('session delta baseline semantics', () => {
  it('delta is anchored to session start progress, not live edits', () => {
    const task = baseTask({
      type: 'scaling',
      scaling_modifier: 3,
      current_progress: 300,
    });
    const projectedGoal = goalProgress(task, baseProject, 300, 540);
    const normalizedGoal = Math.max(0, Math.round(projectedGoal));
    const frozenDelta = normalizedGoal - 300;

    // Simulate a mid-session progress update after projection snapshot.
    const liveProgressAfterEdit = 330;
    const legacyLiveDelta = normalizedGoal - liveProgressAfterEdit;

    expect(frozenDelta).toBe(60);
    expect(legacyLiveDelta).toBe(30);
    expect(frozenDelta).not.toBe(legacyLiveDelta);
  });
});

describe('project totals', () => {
  it('sums task length and progress', () => {
    const tasks: Task[] = [
      baseTask({ id: 'a', type: 'scaling', scaling_modifier: 3, current_progress: 60 }),
      baseTask({
        id: 'b',
        type: 'manual',
        manual_length: 300,
        current_progress: 100,
      }),
    ];
    expect(totalTaskLength(tasks, baseProject)).toBe(1200 * 3 * 3 + 300 * 3);
    expect(projectProgress(tasks, baseProject)).toBe(60 * 3 * 3 + 100 * 3);
    expect(remainingProgress(tasks, baseProject)).toBe(
      totalTaskLength(tasks, baseProject) - projectProgress(tasks, baseProject),
    );
  });
});

describe('pace', () => {
  const tasks: Task[] = [
    baseTask({ type: 'manual', manual_length: 1200, current_progress: 0 }),
  ];
  const pace: PaceSettings = {
    id: 'pa',
    project_id: 'p',
    target_deadline: '2026-05-06T18:00:00Z',
    true_deadline: '2026-05-06T20:00:00Z',
  };

  it('estimatedCompletion = now + remaining_progress', () => {
    const now = new Date('2026-05-06T15:00:00Z');
    const remaining = remainingProgress(tasks, baseProject);
    expect(estimatedCompletion(tasks, baseProject, now).getTime()).toBe(
      now.getTime() + remaining * 1000,
    );
  });

  it('currentPace = target - estimatedCompletion (signed seconds)', () => {
    const now = new Date('2026-05-06T15:00:00Z');
    const target = new Date('2026-05-06T18:00:00Z').getTime();
    const completion = estimatedCompletion(tasks, baseProject, now).getTime();
    expect(currentPace(tasks, baseProject, pace, now)).toBe(
      Math.round((target - completion) / 1000),
    );
  });

  it('paceMargin = true_deadline - target_deadline', () => {
    expect(paceMargin(pace)).toBe(7200);
  });

  it('currentPaceEnd is stable across now()', () => {
    const a = currentPaceEnd(tasks, baseProject, pace).getTime();
    const b = currentPaceEnd(tasks, baseProject, pace).getTime();
    expect(a).toBe(b);
  });
});
