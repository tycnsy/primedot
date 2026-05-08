import { Link } from 'react-router-dom';
import type { DailyGoal, DailyGoalEntry } from '../../features/goals';
import Check from '../habits/Check';
import Counter from '../habits/Counter';

interface GoalRowProps {
  goal: DailyGoal;
  entry: DailyGoalEntry | undefined;
  streak: number;
  focused: boolean;
  linkedGoalName?: string;
  metaTagName?: string;
  onToggle: () => void;
  onCount: (n: number) => void;
  onOpenDetail: () => void;
}

function isDone(goal: DailyGoal, entry: DailyGoalEntry | undefined): boolean {
  if (!entry) return false;
  if (goal.kind === 'count') return (entry.count ?? 0) >= (goal.target ?? 1);
  return entry.done === true;
}

export default function GoalRow({
  goal,
  entry,
  streak,
  focused,
  linkedGoalName,
  metaTagName,
  onToggle,
  onCount,
  onOpenDetail,
}: GoalRowProps) {
  const done = isDone(goal, entry);
  const countValue = entry?.count ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpenDetail();
        }
      }}
      className={`goal-row grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        focused
          ? 'border-accent/60 bg-surface2 ring-1 ring-inset ring-accent/40'
          : 'border-border bg-surface hover:bg-surface2/55'
      }`}
      style={{ minHeight: 'var(--row-h, 44px)' }}
    >
      <div onClick={(event) => event.stopPropagation()}>
        <Check
          on={done}
          onClick={goal.kind === 'check' ? onToggle : () => onCount(goal.target ?? 1)}
          label={done ? `Mark ${goal.name} as pending` : `Mark ${goal.name} as done`}
          size={18}
        />
      </div>

      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${done ? 'text-muted line-through' : 'text-fg'}`}>
          {goal.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {goal.linkedTo && linkedGoalName ? (
            <Link
              to={`/goals/long/${goal.linkedTo}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-0.5 text-[11px] hover:text-fg"
            >
              ↗ {linkedGoalName}
            </Link>
          ) : null}
          <span>
            {goal.schedule} · {goal.kind}
            {goal.kind === 'count' ? ` · ${goal.target ?? 1} ${goal.unit ?? ''}`.trim() : ''}
            {metaTagName ? ` · ${metaTagName}` : ''}
          </span>
        </div>
      </div>

      <span className={`hidden text-xs sm:inline ${streak > 0 ? 'text-accent' : 'text-muted'}`}>
        🔥 {streak}
      </span>

      <div className="justify-self-end" onClick={(event) => event.stopPropagation()}>
        {goal.kind === 'count' ? (
          <Counter value={countValue} target={goal.target} unit={goal.unit} onChange={onCount} />
        ) : null}
      </div>
    </div>
  );
}
