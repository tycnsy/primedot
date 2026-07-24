import { describe, expect, it } from 'vitest';
import {
  applyPaceSplitWithMarginLimit,
  buildMarginPreservingRebalanceOutcome,
  buildRebalanceOutcome,
  buildRebalancePredictionOutcome,
  computePaceSplitAllocationMinutes,
  unbufferedProgressRate,
} from './pace';
import { currentPace, paceMargin } from './calc';
import type { PaceSettings, Project, Task } from './types';

const baseProject: Project = {
  id: 'p1',
  user_id: 'u1',
  name: 'project',
  video_length: 1200,
  due_date: null,
  sync_true_deadline_with_due_date: false,
  buffer_modifier: 2,
  pace_split_percentage: 0,
  pace_margin_limit_seconds: null,
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
  video_rate: null,
  sort_order: 0,
  parent_id: null,
  complex_mode: null,
  grouping_progress: null,
  groupable: true,
  subsplit_length: 60,
  source_timecode_based: false,
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

describe('buildMarginPreservingRebalanceOutcome', () => {
  const now = new Date('2026-05-22T09:00:00.000Z');
  // Remaining unbuffered = 2h (manual_length 7200 at buffer 1).
  // true = now + 30h, limit 24h, desired pace 2h → offset 26h
  // hourDiff = 4h, remaining unbuffered 2h → buffer = 2.
  const trueDeadlineIso = '2026-05-23T15:00:00.000Z'; // now + 30h

  it('sets target = true − limit and solves buffer for limit + desired pace', () => {
    const outcome = buildMarginPreservingRebalanceOutcome([baseTask], baseProject, {
      marginLimitSeconds: 24 * 3600,
      desiredPaceSeconds: 2 * 3600,
      trueDeadlineIso,
      now,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.marginLimitSeconds).toBe(24 * 3600);
    expect(outcome.result.desiredPaceSeconds).toBe(2 * 3600);
    expect(outcome.result.hourDifferenceHours).toBe(4);
    expect(outcome.result.remainingHoursUnbuffered).toBe(2);
    expect(outcome.result.bufferModifier).toBe(2);
    expect(outcome.result.targetDeadlineIso).toBe('2026-05-22T15:00:00.000Z'); // true − 24h

    const rebalanced: Project = {
      ...baseProject,
      buffer_modifier: outcome.result.bufferModifier,
    };
    const pace: PaceSettings = {
      id: 'pace1',
      project_id: 'p1',
      target_deadline: outcome.result.targetDeadlineIso,
      true_deadline: trueDeadlineIso,
    };
    expect(paceMargin(pace)).toBe(24 * 3600);
    expect(currentPace([baseTask], rebalanced, pace, now)).toBe(2 * 3600);
  });

  it('fails when remaining unbuffered hours are not positive', () => {
    const completeTask: Task = { ...baseTask, current_progress: 7200 };
    const outcome = buildMarginPreservingRebalanceOutcome([completeTask], baseProject, {
      marginLimitSeconds: 24 * 3600,
      desiredPaceSeconds: 2 * 3600,
      trueDeadlineIso,
      now,
    });
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'invalid_remaining_hours',
    });
  });

  it('fails when computed buffer modifier is not positive', () => {
    // offset larger than window to true → negative hourDiff → buffer ≤ 0
    const outcome = buildMarginPreservingRebalanceOutcome([baseTask], baseProject, {
      marginLimitSeconds: 24 * 3600,
      desiredPaceSeconds: 10 * 3600,
      trueDeadlineIso: '2026-05-22T15:00:00.000Z', // now + 6h; offset = 34h
      now,
    });
    expect(outcome).toMatchObject({
      ok: false,
      reason: 'invalid_buffer_modifier',
    });
  });
});

describe('applyPaceSplitWithMarginLimit', () => {
  const now = new Date('2026-05-22T09:00:00.000Z');

  /**
   * Constructed so normal 100% split yields pace 3h / margin 25h from start 2h / 24h:
   * buffer=2, progressDelta=3600 manual → B=2h buffered, A=1h at 100% split.
   * Before: rem_buf=10h, pace=2h → target=now+12h, true=now+36h.
   * After progress (tasks already updated): rem_buf=8h; without split pace=4h.
   * After full split A=1h: target=now+11h → pace=3h, margin=25h.
   */
  function buildMarginLimitFixture() {
    const taskAfter: Task = {
      ...baseTask,
      manual_length: 18_000,
      current_progress: 3600,
    };
    const project: Project = {
      ...baseProject,
      buffer_modifier: 2,
      due_date: '2026-05-24T00:00:00.000Z',
    };
    const pace: PaceSettings = {
      id: 'pace1',
      project_id: 'p1',
      target_deadline: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      true_deadline: new Date(now.getTime() + 36 * 3600 * 1000).toISOString(),
    };
    return { taskAfter, project, pace };
  }

  it('split 0%: never changes margin / buffer / target from progress', () => {
    const { taskAfter, project, pace } = buildMarginLimitFixture();
    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 0,
      marginLimitSeconds: 24 * 3600,
      now,
    });
    expect(result).toEqual({ kind: 'noop' });
  });

  it('limit null/off: identical to today split-only behavior', () => {
    const { taskAfter, project, pace } = buildMarginLimitFixture();
    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: null,
      now,
    });
    expect(result.kind).toBe('split');
    if (result.kind !== 'split') return;
    // Alloc = 60 minutes → target 1h earlier
    expect(result.targetDeadline).toBe(
      new Date(now.getTime() + 11 * 3600 * 1000).toISOString(),
    );
  });

  it('below limit: normal split applies; buffer unchanged by this feature', () => {
    const { taskAfter, project, pace } = buildMarginLimitFixture();
    // Limit 48h > prospective margin 25h
    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 48 * 3600,
      now,
    });
    expect(result.kind).toBe('split');
    if (result.kind !== 'split') return;
    expect(result.targetDeadline).toBe(
      new Date(now.getTime() + 11 * 3600 * 1000).toISOString(),
    );
  });

  it('would exceed limit: margin at limit, pace = desired 3h, buffer increases, true unchanged', () => {
    const { taskAfter, project, pace } = buildMarginLimitFixture();
    const trueBefore = pace.true_deadline;

    // Sanity: normal split would be pace 3h / margin 25h
    const alloc = computePaceSplitAllocationMinutes({
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
    });
    expect(alloc).toBe(60);
    const splitPace: PaceSettings = {
      ...pace,
      target_deadline: new Date(
        new Date(pace.target_deadline).getTime() - 60 * 60 * 1000,
      ).toISOString(),
    };
    expect(paceMargin(splitPace)).toBe(25 * 3600);
    expect(currentPace([taskAfter], project, splitPace, now)).toBe(3 * 3600);

    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 24 * 3600,
      now,
    });

    expect(result.kind).toBe('rebalance');
    if (result.kind !== 'rebalance') return;

    // target = true − 24h = now + 12h
    expect(result.targetDeadline).toBe(
      new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
    );
    expect(result.bufferModifier).toBeGreaterThan(2);

    const rebalanced: Project = { ...project, buffer_modifier: result.bufferModifier };
    const endPace: PaceSettings = {
      ...pace,
      target_deadline: result.targetDeadline,
      true_deadline: trueBefore,
    };
    expect(paceMargin(endPace)).toBe(24 * 3600);
    expect(currentPace([taskAfter], rebalanced, endPace, now)).toBe(3 * 3600);
    // true_deadline never written / unchanged
    expect(endPace.true_deadline).toBe(trueBefore);
  });

  it('rebalance equivalence: matches rebalance(limit+desired_pace) then target=true−limit', () => {
    const { taskAfter, project, pace } = buildMarginLimitFixture();
    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 24 * 3600,
      now,
    });
    expect(result.kind).toBe('rebalance');
    if (result.kind !== 'rebalance') return;

    const desiredPaceSeconds = 3 * 3600;
    const equivalent = buildMarginPreservingRebalanceOutcome([taskAfter], project, {
      marginLimitSeconds: 24 * 3600,
      desiredPaceSeconds,
      trueDeadlineIso: pace.true_deadline,
      now,
    });
    expect(equivalent.ok).toBe(true);
    if (!equivalent.ok) return;
    expect(result.targetDeadline).toBe(equivalent.result.targetDeadlineIso);
    expect(result.bufferModifier).toBe(equivalent.result.bufferModifier);
  });

  it('already at limit: positive alloc does not grow margin; excess via rebalance', () => {
    const { taskAfter, project } = buildMarginLimitFixture();
    // Margin already exactly 24h
    const pace: PaceSettings = {
      id: 'pace1',
      project_id: 'p1',
      target_deadline: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      true_deadline: new Date(now.getTime() + 36 * 3600 * 1000).toISOString(),
    };
    expect(paceMargin(pace)).toBe(24 * 3600);

    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfter],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 24 * 3600,
      now,
    });
    expect(result.kind).toBe('rebalance');
    if (result.kind !== 'rebalance') return;

    const endPace: PaceSettings = {
      ...pace,
      target_deadline: result.targetDeadline,
    };
    expect(paceMargin(endPace)).toBe(24 * 3600);
    expect(result.bufferModifier).toBeGreaterThan(2);
  });

  it('progress decrease: does not force margin up to the limit', () => {
    const { project } = buildMarginLimitFixture();
    // Margin currently 20h (below 24h limit); decrease would shrink margin further
    const pace: PaceSettings = {
      id: 'pace1',
      project_id: 'p1',
      target_deadline: new Date(now.getTime() + 16 * 3600 * 1000).toISOString(),
      true_deadline: new Date(now.getTime() + 36 * 3600 * 1000).toISOString(),
    };
    expect(paceMargin(pace)).toBe(20 * 3600);

    const taskAfterDecrease: Task = {
      ...baseTask,
      manual_length: 18_000,
      current_progress: 0,
    };

    const result = applyPaceSplitWithMarginLimit({
      tasks: [taskAfterDecrease],
      project,
      pace,
      progressDelta: -3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 24 * 3600,
      now,
    });

    expect(result.kind).toBe('split');
    if (result.kind !== 'split') return;
    // Alloc = -60 min → target moves later by 1h (margin shrinks, not forced up)
    expect(result.targetDeadline).toBe(
      new Date(now.getTime() + 17 * 3600 * 1000).toISOString(),
    );
  });

  it('edge: no remaining unbuffered hours → fail soft to plain split', () => {
    const completeTask: Task = {
      ...baseTask,
      manual_length: 3600,
      current_progress: 3600,
    };
    const project: Project = { ...baseProject, buffer_modifier: 2 };
    const pace: PaceSettings = {
      id: 'pace1',
      project_id: 'p1',
      target_deadline: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      true_deadline: new Date(now.getTime() + 36 * 3600 * 1000).toISOString(),
    };

    const result = applyPaceSplitWithMarginLimit({
      tasks: [completeTask],
      project,
      pace,
      progressDelta: 3600,
      rate: 1,
      bufferModifier: 2,
      paceSplitPercentage: 100,
      marginLimitSeconds: 24 * 3600,
      now,
    });

    // Would exceed limit, but rebalance fails → fall back to split
    expect(result.kind).toBe('split');
    if (result.kind !== 'split') return;
    expect(result.targetDeadline).toBe(
      new Date(now.getTime() + 11 * 3600 * 1000).toISOString(),
    );
  });
});
