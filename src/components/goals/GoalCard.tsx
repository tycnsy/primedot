import type { ReactNode } from 'react';
import type { LongGoal, Tag } from '../../features/goals';
import { accumulationStats, milestoneStats, trendStats } from '../../features/goals';
import GoalTypeBadge from './GoalTypeBadge';
import MiniTrend from './MiniTrend';
import TagChip from './TagChip';

interface GoalCardProps {
  goal: LongGoal;
  tags: Tag[];
  onOpen: () => void;
  onLog: () => void;
  showPaceLine?: boolean;
}

const numberFormatter = new Intl.NumberFormat();

function formatUnitValue(value: number, unit: string): string {
  if (unit === '$') return `$${numberFormatter.format(value)}`;
  return `${numberFormatter.format(value)}${unit}`;
}

function PacingPill({ text, positive }: { text: string; positive: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
        positive
          ? 'bg-[rgb(var(--success)/0.12)] text-[rgb(var(--success))]'
          : 'bg-[rgb(var(--warn)/0.12)] text-[rgb(var(--warn))]'
      }`}
    >
      {text}
    </span>
  );
}

export default function GoalCard({
  goal,
  tags,
  onOpen,
  onLog,
  showPaceLine = true,
}: GoalCardProps) {
  let stat: ReactNode = null;
  let preview: ReactNode = null;
  let pacePill: ReactNode = null;

  if (goal.type === 'trend') {
    const stats = trendStats(goal);
    stat = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold tracking-tight tabular-nums text-fg">
          {formatUnitValue(stats.last, goal.unit)}
        </span>
        <span className="text-xs text-muted">
          {'->'} {formatUnitValue(goal.targetValue, goal.unit)} by{' '}
          {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
            new Date(goal.targetDate),
          )}
        </span>
      </div>
    );
    preview = <MiniTrend goal={goal} height={66} showPaceLine={showPaceLine} />;
    pacePill = (
      <PacingPill
        positive={stats.onPace}
        text={`${stats.onPace ? 'Ahead of pace' : 'Behind pace'} · ${stats.aheadBy.toFixed(1)}${goal.unit}`}
      />
    );
  } else if (goal.type === 'accumulation') {
    const stats = accumulationStats(goal);
    stat = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold tracking-tight tabular-nums text-fg">
          {formatUnitValue(stats.total, goal.unit)}
        </span>
        <span className="text-xs text-muted">/ {formatUnitValue(goal.targetTotal, goal.unit)}</span>
      </div>
    );
    preview = (
      <div className="mt-2 space-y-1.5">
        <div className="h-2 rounded-full bg-surface2 ring-1 ring-inset ring-border/70">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-300"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="tabular-nums">{Math.round(stats.pct)}%</span>
          <span>
            {stats.remaining > 0 ? `${formatUnitValue(stats.remaining, goal.unit)} to go` : 'Complete!'}
          </span>
        </div>
      </div>
    );
    pacePill = (
      <PacingPill
        positive={stats.onPace}
        text={`${stats.onPace ? 'Ahead' : 'Behind'} · ${stats.daysLeft}d left`}
      />
    );
  } else {
    const stats = milestoneStats(goal);
    stat = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold tracking-tight tabular-nums text-fg">
          {stats.done}/{stats.total}
        </span>
        <span className="text-xs text-muted">milestones</span>
      </div>
    );
    preview = (
      <div className="mt-2 space-y-2">
        <div className="h-2 rounded-full bg-surface2 ring-1 ring-inset ring-border/70">
          <div
            className="h-full rounded-full bg-[rgb(var(--success))] transition-[width] duration-300"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <div className="flex gap-1">
          {goal.milestones.map((milestone) => (
            <span
              key={milestone.id}
              className={`h-[5px] flex-1 rounded-sm ${
                milestone.done
                  ? 'bg-[rgb(var(--accent))]'
                  : 'bg-surface2 ring-1 ring-inset ring-border/70'
              }`}
              title={milestone.name}
            />
          ))}
        </div>
      </div>
    );
    pacePill = stats.next ? (
      <span className="inline-flex max-w-full items-center rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-muted">
        Next: {stats.next.name}
      </span>
    ) : (
      <PacingPill text="Complete" positive />
    );
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="card flex cursor-pointer flex-col gap-2.5 transition duration-150 hover:-translate-y-[1px] hover:border-border hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <GoalTypeBadge type={goal.type} />
        <div className="flex items-center gap-1.5">
          {tags.slice(0, 2).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      </div>
      <h3 className="text-base font-semibold tracking-tight text-fg">{goal.name}</h3>
      {stat}
      {preview}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {pacePill}
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1.5 text-xs"
          onClick={(event) => {
            event.stopPropagation();
            onLog();
          }}
        >
          + Log
        </button>
      </div>
    </article>
  );
}
