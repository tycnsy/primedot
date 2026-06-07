import ModalShell from '../goals/ModalShell';
import type { IncomeEntry } from '../../features/budget';
import {
  cutoffIncomeTotal,
  formatDisplayDate,
  formatMoney,
  type SourceIncomeHistoryResult,
} from '../../features/budget';
import IncomeTimeline from './IncomeTimeline';

interface SourceIncomeHistoryModalProps {
  open: boolean;
  entry: IncomeEntry | null;
  history: SourceIncomeHistoryResult | null;
  currency: string;
  today?: string;
  onClose: () => void;
}

export default function SourceIncomeHistoryModal({
  open,
  entry,
  history,
  currency,
  today,
  onClose,
}: SourceIncomeHistoryModalProps) {
  if (!open || !entry || !history) return null;

  const cutoffLabel =
    entry.status === 'received' && entry.receivedDate
      ? formatDisplayDate(entry.receivedDate)
      : 'today';

  return (
    <ModalShell
      open={open}
      title={`${entry.sourceName} projection history`}
      onClose={onClose}
      maxWidthClassName="max-w-[760px]"
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Tracking from creation date ({formatDisplayDate(entry.createdAt.slice(0, 10))}) through{' '}
          {formatDisplayDate(history.horizonEnd)}. Future days are shaded.
        </p>
        <IncomeTimeline
          points={history.points}
          currency={currency}
          today={today}
          ariaLabel={`${entry.sourceName} projected income history`}
          emptyLabel="No source projection points available for this period."
        />
        <p className="text-xs text-muted">
          Total shown at cutoff ({cutoffLabel}):{' '}
          <span className="font-semibold text-fg">
            {formatMoney(cutoffIncomeTotal(history.points, history.cutoffDate), currency)}
          </span>
        </p>
      </div>
    </ModalShell>
  );
}
