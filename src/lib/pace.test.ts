import { describe, expect, it } from 'vitest';
import {
  buildRebalanceOutcome,
  buildRebalancePredictionOutcome,
  computePaceSplitAllocationMinutes,
  unbufferedProgressRate,
} from './pace';
import { currentPace } from './calc';
import type { Project, Task } from './types';

const baseProject: Project = {
  id: 'p1',
  user_id: 'u1',
  name: 'project',
  video_length: 1200,
  due_date: null,
  sync_true_deadline_with_due_date: false,
  buffer_modifier: 2,
  tag: null,
  series: null,
  notes: null,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  start_date: '2026-01-01T05:00:00Z',
  archived_at: null,
  pace_hidden: false,
  parent_id: null,
};

const baseTask: Task = {
  id: 't1',
  project_id: 'p1',
  name: 'task',
  status: 'in_progress',
  type: 'manual',
  current_progress: 0,
  scaling_modifier: null,
  scripting_modifier: null,
  script_length: null,
  unit_count: null,
  unit_length: null,
  manual_length: 7200,
  sort_order: 0,
  parent_id: null,
  complex_mode: null,
  grouping_progress: null,
  groupable: true,
  created_at: '2026-01-01T00:00:00Z',
};

describe('buildRebalanceOutcome', () => {
  it('computes rounded buffer and sets target so current pace matches modal offset', () => {
    const now = new Date('2026-05-22T09:00:00.000Z');
    const project = {
      ...baseProject,
      due_date: '2026-05-22T19:00:00.000Z',
    };

    const outcome = buildRebalanceOutcome([baseTask], project, 2 * 3600, now);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.targetDeadlineIso).toBe('2026-05-22T19:00:00.000Z');
    expect(outcome.result.currentPaceSeconds).toBe(7200);
    expect(outcome.result.hourDifferenceHours).toBe(8);
    expect(outcome.result.remainingHoursUnbuffered).toBe(2);
    expect(outcome.result.bufferModifier).toBe(4);

    const rebalancedProject: Project = { ...project, buffer_modifier: outcome.result.bufferModifier };
    const simulatedPace = {
      id: 'pace1',
      project_id: project.id,
      target_deadline: outcome.result.targetDeadlineIso,
      true_deadline: outcome.result.targetDeadlineIso,
    };
    expect(currentPace([baseTask], rebalancedProject, simulatedPace, now)).toBe(7200);
  });

  it('rounds buffer modifier to nearest hundredth', () => {
    const now = new Date('2026-05-22T09:00:00.000Z');
    const project = {
      ...baseProject,
      due_date: '2026-05-22T12:30:00.000Z',
    };

    const outcome = buildRebalanceOutcome([baseTask], project, 3600, now);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.hourDifferenceHours).toBe(2.5);
    expect(outcome.result.bufferModifier).toBe(1.25);
    expect(outcome.result.targetDeadlineIso).toBe('2026-05-22T12:30:00.000Z');
  });

  it('fails when due date is missing', () => {
    const outcome = buildRebalanceOutcome([baseTask], baseProject, 3600);
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'missing_due_date',
    });
  });

  it('fails when remaining unbuffered hours are not positive', () => {
    const project = {
      ...baseProject,
      due_date: '2026-05-22T19:00:00.000Z',
    };
    const completeTask: Task = {
      ...baseTask,
      current_progress: 7200,
    };

    const outcome = buildRebalanceOutcome([completeTask], project, 3600);
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'invalid_remaining_hours',
    });
  });

  it('fails when computed buffer modifier is not positive', () => {
    const now = new Date('2026-05-22T09:00:00.000Z');
    const project = {
      ...baseProject,
      due_date: '2026-05-22T09:15:00.000Z',
    };

    const outcome = buildRebalanceOutcome([baseTask], project, 2 * 3600, now);
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'invalid_buffer_modifier',
    });
  });
});

describe('buildRebalancePredictionOutcome', () => {
  const now = new Date('2026-05-22T09:00:00.000Z');
  const project = {
    ...baseProject,
    due_date: '2026-05-22T19:00:00.000Z',
  };

  it('estimates resulting buffer modifier from planned work hours', () => {
    const outcome = buildRebalancePredictionOutcome(
      [baseTask],
      project,
      2 * 3600,
      { mode: 'hours_to_buffer', plannedWorkHours: 1 },
      now,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.mode).toBe('hours_to_buffer');
    if (outcome.result.mode !== 'hours_to_buffer') return;

    expect(outcome.result.hourDifferenceHours).toBe(8);
    expect(outcome.result.remainingHoursUnbuffered).toBe(2);
    expect(outcome.result.currentProjectBufferModifier).toBe(2);
    expect(outcome.result.plannedWorkHoursBuffered).toBe(1);
    expect(outcome.result.plannedWorkHoursUnbuffered).toBe(0.5);
    expect(outcome.result.remainingHoursAfterPlannedWork).toBe(1.5);
    expect(outcome.result.predictedBufferModifier).toBe(5.33);
  });

  it('estimates required work from a target buffer modifier', () => {
    const outcome = buildRebalancePredictionOutcome(
      [baseTask],
      project,
      2 * 3600,
      { mode: 'buffer_to_hours', targetBufferModifier: 8 },
      now,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.mode).toBe('buffer_to_hours');
    if (outcome.result.mode !== 'buffer_to_hours') return;

    expect(outcome.result.currentProjectBufferModifier).toBe(2);
    expect(outcome.result.requiredWorkHoursUnbuffered).toBe(1);
    expect(outcome.result.requiredWorkHours).toBe(2);
    expect(outcome.result.requiredWorkHoursClamped).toBe(2);
    expect(outcome.result.clampedToZero).toBe(false);
  });

  it('clamps negative reverse estimate to zero hours', () => {
    const outcome = buildRebalancePredictionOutcome(
      [baseTask],
      project,
      2 * 3600,
      { mode: 'buffer_to_hours', targetBufferModifier: 2 },
      now,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.mode).toBe('buffer_to_hours');
    if (outcome.result.mode !== 'buffer_to_hours') return;

    expect(outcome.result.requiredWorkHoursUnbuffered).toBe(-2);
    expect(outcome.result.requiredWorkHours).toBe(-4);
    expect(outcome.result.requiredWorkHoursClamped).toBe(0);
    expect(outcome.result.clampedToZero).toBe(true);
  });

  it('fails on non-positive target buffer modifier', () => {
    const outcome = buildRebalancePredictionOutcome(
      [baseTask],
      project,
      2 * 3600,
      { mode: 'buffer_to_hours', targetBufferModifier: 0 },
      now,
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: 'invalid_target_buffer',
    });
  });
});

describe('computePaceSplitAllocationMinutes', () => {
  // Example project: buffer_modifier = 3.0, paceSplitPercentage = 35%
  const buffer = 3;
  const splitPct = 35;

  it('TaskA scaling: 5min progress × 5.0 → allocate 18 minutes', () => {
    // Progress 00:10:00 → 00:15:00 = +300s video; rate = scaling_modifier 5.0
    // true = 300×5 = 1500s (25min); buffer = 4500s (75min); diff = 3000s (50min)
    // 50min × 35% = 17.5 → round 18
    const rate = unbufferedProgressRate({
      type: 'scaling',
      scaling_modifier: 5,
      scripting_modifier: null,
      unit_length: null,
    });
    expect(rate).toBe(5);
    expect(
      computePaceSplitAllocationMinutes({
        progressDelta: 300,
        rate,
        bufferModifier: buffer,
        paceSplitPercentage: splitPct,
      }),
    ).toBe(18);
  });

  it('TaskB custom: 5 units × 35s → allocate 2 minutes', () => {
    // true = 5×35 = 175s; buffer = 525s; diff = 350s (5m50s)
    // 350 × 0.35 / 60 = 2.041… → round 2
    const rate = unbufferedProgressRate({
      type: 'custom',
      scaling_modifier: null,
      scripting_modifier: null,
      unit_length: 35,
    });
    expect(rate).toBe(35);
    expect(
      computePaceSplitAllocationMinutes({
        progressDelta: 5,
        rate,
        bufferModifier: buffer,
        paceSplitPercentage: splitPct,
      }),
    ).toBe(2);
  });

  it('reverses allocation when progress decreases', () => {
    const rate = unbufferedProgressRate({
      type: 'scaling',
      scaling_modifier: 5,
      scripting_modifier: null,
      unit_length: null,
    });
    expect(
      computePaceSplitAllocationMinutes({
        progressDelta: -300,
        rate,
        bufferModifier: buffer,
        paceSplitPercentage: splitPct,
      }),
    ).toBe(-18);
  });

  it('returns 0 when pace split percentage is 0', () => {
    expect(
      computePaceSplitAllocationMinutes({
        progressDelta: 300,
        rate: 5,
        bufferModifier: buffer,
        paceSplitPercentage: 0,
      }),
    ).toBe(0);
  });

  it('returns 0 when buffer modifier is 1 (no buffer difference)', () => {
    expect(
      computePaceSplitAllocationMinutes({
        progressDelta: 300,
        rate: 5,
        bufferModifier: 1,
        paceSplitPercentage: splitPct,
      }),
    ).toBe(0);
  });
});
