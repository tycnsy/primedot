import { useState } from 'react';
import DailySpendingRow from './DailySpendingRow';
import type { CategoryDailyState } from '../../features/budget';

interface HiddenSpendingSectionProps {
  categories: CategoryDailyState[];
  currency: string;
  onShow: (categoryId: string) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 8l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HiddenSpendingSection({
  categories,
  currency,
  onShow,
}: HiddenSpendingSectionProps) {
  const [open, setOpen] = useState(false);

  if (categories.length === 0) return null;

  return (
    <div className="card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-fg">
          Hidden categories ({categories.length})
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          {categories.map((state) => (
            <DailySpendingRow
              key={state.categoryId}
              state={state}
              currency={currency}
              onToggleHidden={() => onShow(state.categoryId)}
              hiddenActionLabel="Show"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
