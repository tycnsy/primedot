import type { Habit, HabitEntry } from '../../features/habits/types';
import Check from './Check';
import Counter from './Counter';
import DotsScale from './DotsScale';
import WeekStrip from './WeekStrip';

interface HabitRowProps {
  habit: Habit;
  entry: HabitEntry | null;
  onToggle: () => void;
  onCount: (n: number) => void;
  onScale: (n: number) => void;
  onNoteOpen: () => void;
  showWeekStrip?: boolean;
  showStreak?: boolean;
  draggable?: boolean;
  weekData?: ('done' | 'partial' | 'skip' | 'idle' | 'future')[];
  todayIdx?: number;
  streak?: number;
  notDueToday?: boolean;
  notDueLabel?: string | null;
  focused?: boolean;
  onFocus?: () => void;
  onOpenDetail?: () => void;
}

function isDone(habit: Habit, entry: HabitEntry | null): boolean {
  if (!entry) return false;
  switch (habit.kind) {
    case 'check':
      return entry.done === true;
    case 'count':
      return (entry.count ?? 0) >= (habit.target ?? 1);
    case 'scale':
      return (entry.scale ?? 0) > 0;
    case 'note':
      return Boolean(entry.noteText?.trim());
    default:
      return false;
  }
}

export default function HabitRow({
  habit,
  entry,
  onToggle,
  onCount,
  onScale,
  onNoteOpen,
  showWeekStrip = false,
  showStreak = true,
  draggable = false,
  weekData = ['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'future'],
  todayIdx = 6,
  streak = 0,
  notDueToday = false,
  notDueLabel = null,
  focused = false,
  onFocus,
  onOpenDetail,
}: HabitRowProps) {
  const done = isDone(habit, entry);
  const countValue = entry?.count ?? 0;
  const scaleValue = entry?.scale ?? 0;

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onOpenDetail}
      className={`grid grid-cols-[auto_1fr_auto] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors sm:grid-cols-[auto_1fr_auto_auto_auto] ${
        focused
          ? 'border-accent/60 bg-surface2 ring-1 ring-inset ring-accent/40'
          : notDueToday
            ? 'border-border/80 bg-surface2/70'
          : 'border-border bg-surface hover:border-accent/35 hover:bg-surface2/60'
      }`}
    >
      <span
        aria-hidden
        className={`text-muted ${draggable ? 'opacity-100' : 'opacity-0'}`}
        title="Drag to reorder"
      >
        ≡
      </span>

      <div className="min-w-0">
        <p
          className={`truncate text-sm font-medium ${
            done ? 'text-muted line-through' : notDueToday ? 'text-muted' : 'text-fg'
          }`}
        >
          {habit.name}
        </p>
        <p className="truncate text-xs text-muted">
          {notDueToday && notDueLabel
            ? notDueLabel
            : `${habit.kind}${habit.kind === 'count' && habit.target ? ` · target ${habit.target}` : ''}${habit.unit ? ` ${habit.unit}` : ''}`}
        </p>
      </div>

      {showWeekStrip ? <WeekStrip data={weekData} todayIdx={todayIdx} /> : null}

      {showStreak ? (
        <span className="hidden text-xs text-muted sm:inline">{streak} day streak</span>
      ) : null}

      <div className="justify-self-end" onClick={(event) => event.stopPropagation()}>
        {habit.kind === 'check' ? (
          <Check
            on={entry?.done === true}
            onClick={onToggle}
            label={
              entry?.done ? `Mark ${habit.name} as not done` : `Mark ${habit.name} as done`
            }
          />
        ) : null}
        {habit.kind === 'count' ? (
          <Counter
            value={countValue}
            target={habit.target}
            unit={habit.unit}
            onChange={onCount}
          />
        ) : null}
        {habit.kind === 'scale' ? (
          <DotsScale
            value={scaleValue}
            max={habit.scaleMax ?? 5}
            onChange={onScale}
            label={habit.name}
          />
        ) : null}
        {habit.kind === 'note' ? (
          <button type="button" onClick={onNoteOpen} className="btn-secondary">
            {entry?.noteText?.trim() ? 'Edit note' : 'Add note'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
