import { compareMonths, monthKey, nextMonth, previousMonth } from '../../features/budget';

interface PeriodSelectorProps {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(`${monthKey(month)}T00:00:00`),
  );
}

function periodSubtitle(month: string, currentMonth: string): string {
  const cmp = compareMonths(month, currentMonth);
  if (cmp === 0) return 'Current · editable';
  if (cmp < 0) return 'Past · read-only';
  return 'Future · planning';
}

export default function PeriodSelector({ month, currentMonth, onChange }: PeriodSelectorProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost !px-2 !py-1"
        aria-label="Previous month"
        onClick={() => onChange(previousMonth(month))}
      >
        ←
      </button>
      <div className="min-w-[160px] text-center">
        <p className="text-sm font-semibold text-fg">{monthLabel(month)}</p>
        <p className="text-[11px] text-muted">{periodSubtitle(month, currentMonth)}</p>
      </div>
      <button
        type="button"
        className="btn-ghost !px-2 !py-1"
        aria-label="Next month"
        onClick={() => onChange(nextMonth(month))}
      >
        →
      </button>
    </div>
  );
}
