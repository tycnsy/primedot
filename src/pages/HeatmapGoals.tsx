import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TagPill from '../components/TagPill';
import { useProjectTags } from '../hooks/useProjects';
import { useTagGoals, useUpsertTagGoal } from '../hooks/useTagGoals';
import { formatHMS } from '../lib/time';
import type { ProjectTag } from '../lib/types';

function hoursFromSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const hours = seconds / 3600;
  return String(Math.round(hours * 100) / 100);
}

function GoalRow({
  tag,
  goalSeconds,
  onSave,
  saving,
}: {
  tag: ProjectTag;
  goalSeconds: number;
  onSave: (tagName: string, seconds: number) => Promise<void>;
  saving: boolean;
}) {
  const [hoursInput, setHoursInput] = useState(() => hoursFromSeconds(goalSeconds));

  useEffect(() => {
    setHoursInput(hoursFromSeconds(goalSeconds));
  }, [goalSeconds]);

  const parsedSeconds = useMemo(() => {
    const trimmed = hoursInput.trim();
    if (trimmed === '') return 0;
    const hours = Number(trimmed);
    if (!Number.isFinite(hours) || hours < 0) return null;
    return Math.round(hours * 3600);
  }, [hoursInput]);

  const isValid = parsedSeconds !== null;
  const isDirty = isValid && parsedSeconds !== goalSeconds;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <TagPill name={tag.name} color={tag.color} />
        <span className="text-xs text-muted tabular-nums">
          {goalSeconds > 0 ? `${formatHMS(goalSeconds)}/day` : 'No goal'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input
            className="input w-24 py-1"
            type="number"
            min="0"
            step="0.25"
            inputMode="decimal"
            placeholder="0"
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
          />
          hrs/day
        </label>
        <button
          type="button"
          className="btn-primary px-3 py-1 text-xs"
          disabled={!isValid || !isDirty || saving}
          onClick={() => {
            if (parsedSeconds === null) return;
            void onSave(tag.name, parsedSeconds);
          }}
        >
          Save
        </button>
      </div>
    </li>
  );
}

export default function HeatmapGoals() {
  const tagsQuery = useProjectTags();
  const goalsQuery = useTagGoals();
  const upsertGoal = useUpsertTagGoal();

  const goalByTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const goal of goalsQuery.data ?? []) {
      map.set(goal.tag_name, Number(goal.daily_goal_seconds));
    }
    return map;
  }, [goalsQuery.data]);

  const activeTags = useMemo(
    () => (tagsQuery.data ?? []).filter((tag) => !tag.archived_at),
    [tagsQuery.data],
  );

  const totalGoalSeconds = useMemo(() => {
    let sum = 0;
    for (const seconds of goalByTag.values()) sum += seconds;
    return sum;
  }, [goalByTag]);

  const isLoading = tagsQuery.isLoading || goalsQuery.isLoading;
  const error = tagsQuery.error ?? goalsQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Heatmap</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Channel goals</h1>
          <p className="max-w-lg text-sm text-muted">
            Set a daily realtime goal (in hours) for each channel (tag). The heatmap's
            Goal calculation colors each day by how close you got to the goal. With the
            All filter, the day is compared against the summed goals below.
          </p>
        </div>
        <Link to="/heatmap?calc=goal" className="btn-ghost">
          Back to heatmap
        </Link>
      </div>

      <div className="card space-y-4">
        {isLoading ? (
          <p className="text-muted">Loading goals…</p>
        ) : error ? (
          <p className="text-danger">{error.message}</p>
        ) : activeTags.length === 0 ? (
          <p className="text-muted">
            No tags yet. Add tags to your projects (or in Settings → Tags) to set channel
            goals.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>Daily goal per channel</span>
              <span className="tabular-nums">
                All-channels goal:{' '}
                <span className="font-medium text-fg">
                  {totalGoalSeconds > 0 ? `${formatHMS(totalGoalSeconds)}/day` : '—'}
                </span>
              </span>
            </div>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-surface/50">
              {activeTags.map((tag) => (
                <GoalRow
                  key={tag.id}
                  tag={tag}
                  goalSeconds={goalByTag.get(tag.name) ?? 0}
                  saving={upsertGoal.isPending}
                  onSave={async (tagName, seconds) => {
                    await upsertGoal.mutateAsync({
                      tagName,
                      dailyGoalSeconds: seconds,
                    });
                  }}
                />
              ))}
            </ul>
            {upsertGoal.error ? (
              <p className="text-sm text-danger">{upsertGoal.error.message}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
