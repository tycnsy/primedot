import { Link } from 'react-router-dom';
import { useHabits } from '../hooks/useHabits';

export default function HabitsArchive() {
  const { archivedHabits, isLoading, error, updateHabit } = useHabits();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/habits/today"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Habits
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Archived habits
        </h1>
        <p className="text-sm text-muted">
          Archive scaffold is ready for future persistence.
        </p>
      </div>

      <div className="card space-y-2">
        {isLoading ? <p className="text-sm text-muted">Loading archived habits…</p> : null}
        {error ? (
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : 'Failed to load archived habits.'}
          </p>
        ) : null}
        {!isLoading && archivedHabits.length === 0 ? (
          <p className="text-sm text-muted">No archived habits.</p>
        ) : null}
        {archivedHabits.map((habit) => (
          <div
            key={habit.id}
            className="flex items-center justify-between rounded-md bg-surface2 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-fg">{habit.name}</p>
              <p className="text-xs text-muted">{habit.kind}</p>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void updateHabit(habit.id, { archivedAt: null })}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
