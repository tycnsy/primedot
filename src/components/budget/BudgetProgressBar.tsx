import type { BudgetStatus } from '../../features/budget';

interface BudgetProgressBarProps {
  pctUsed: number;
  status: BudgetStatus;
}

const STATUS_CLASS: Record<BudgetStatus, string> = {
  under: 'bg-success',
  near: 'bg-warn',
  over: 'bg-danger',
};

export default function BudgetProgressBar({ pctUsed, status }: BudgetProgressBarProps) {
  const width = Math.min(100, Math.max(0, pctUsed * 100));
  return (
    <div className="progress-track">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${STATUS_CLASS[status]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
