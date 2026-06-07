import { useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import IncomeTimeline from '../components/budget/IncomeTimeline';
import AddIncomeModal from '../components/budget/AddIncomeModal';
import PeriodSelector from '../components/budget/PeriodSelector';
import SourceIncomeHistoryModal from '../components/budget/SourceIncomeHistoryModal';
import {
  formatDisplayDate,
  formatEarnedMonth,
  formatMoney,
  isInMonth,
  isoDate,
  monthKey,
  projectMonthlyIncome,
  projectSourceIncomeHistory,
  useAccounts,
  useBudgetPreferences,
  useIncome,
} from '../features/budget';
import type { IncomeEntry } from '../features/budget';

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M3 16.5h14M5 13l3-3 2.5 2.5L15 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="13" r="1.1" fill="currentColor" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="15" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M11.5 4.5l4 4M4.5 15.5l2.8-.5 7.9-7.9a1.4 1.4 0 0 0 0-2l-.3-.3a1.4 1.4 0 0 0-2 0L5 12.7l-.5 2.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4.5 6h11M7.5 6V4.8c0-.4.3-.8.8-.8h3.4c.4 0 .8.4.8.8V6M7 9v5.5M10 9v5.5M13 9v5.5M6.5 6l.6 9.2c0 .4.4.8.8.8h4.2c.4 0 .8-.4.8-.8l.6-9.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BudgetIncome() {
  const { currency } = useBudgetPreferences();
  const { accounts } = useAccounts();
  const { incomeEntries, adjustmentsByEntryId, addIncome, updateIncome, deleteIncome, markReceived } =
    useIncome();

  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<IncomeEntry | null>(null);
  const [historyEntry, setHistoryEntry] = useState<IncomeEntry | null>(null);

  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const today = isoDate(new Date());

  const monthEntries = useMemo(
    () =>
      incomeEntries
        .filter((entry) => isInMonth(entry.expectedDate, month))
        .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    [incomeEntries, month],
  );

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.type !== 'credit'),
    [accounts],
  );

  const monthlyProjection = useMemo(
    () =>
      projectMonthlyIncome({
        incomeEntries: monthEntries,
        month,
        today,
      }),
    [month, monthEntries, today],
  );

  const sourceHistoryProjection = useMemo(() => {
    if (!historyEntry) return null;
    return projectSourceIncomeHistory({
      entry: historyEntry,
      incomeEntries,
      adjustments: adjustmentsByEntryId.get(historyEntry.id) ?? [],
      today,
    });
  }, [adjustmentsByEntryId, historyEntry, incomeEntries, today]);

  const openCreate = () => {
    setEditEntry(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Income Planner"
        subtitle="Plan, project, and confirm income by payout month."
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            + Income
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector month={month} currentMonth={currentMonth} onChange={setMonth} />
        <p className="text-xs text-muted">
          {month === currentMonth ? 'Current month' : 'Viewing payout month'}
        </p>
      </div>

      <section className="card space-y-3">
        <p className="label">Projected income</p>
        <IncomeTimeline
          points={monthlyProjection}
          currency={currency}
          today={today}
          ariaLabel="Projected monthly income timeline"
        />
      </section>

      {monthEntries.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">No income planned for this month yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-fg">{entry.sourceName}</p>
                  <span
                    className={`pill text-[10px] ${
                      entry.status === 'received' ? 'text-success' : ''
                    }`}
                  >
                    {entry.status === 'received' ? 'Received' : 'Expected'}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Earned {formatEarnedMonth(entry.earnedMonth)} · Expected{' '}
                  {formatDisplayDate(entry.expectedDate)}
                  {entry.receivedDate ? ` · received ${formatDisplayDate(entry.receivedDate)}` : ''}
                  {entry.updatedAt ? ` · adjusted ${new Date(entry.updatedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                {formatMoney(entry.amount, currency)}
              </p>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs"
                  aria-label="View source graph"
                  title="View source graph"
                  onClick={() => setHistoryEntry(entry)}
                >
                  <ChartIcon />
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs"
                  aria-label="Edit income"
                  title="Edit income"
                  onClick={() => {
                    setEditEntry(entry);
                    setModalOpen(true);
                  }}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs text-danger"
                  aria-label="Delete income"
                  title="Delete income"
                  onClick={() => {
                    if (window.confirm('Delete this income entry?')) {
                      void deleteIncome(entry.id, entry.earnedMonth);
                    }
                  }}
                >
                  <DeleteIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddIncomeModal
        open={modalOpen}
        entry={editEntry}
        defaultExpectedDate={month}
        assetAccounts={assetAccounts}
        onClose={() => {
          setModalOpen(false);
          setEditEntry(null);
        }}
        onSave={(input) => {
          if (editEntry) {
            void updateIncome(editEntry.id, input, editEntry);
          } else {
            void addIncome(input);
          }
        }}
        onMarkReceived={
          editEntry
            ? (entry, accountId) => {
                void markReceived(entry, accountId);
              }
            : undefined
        }
      />

      <SourceIncomeHistoryModal
        open={!!historyEntry}
        entry={historyEntry}
        history={sourceHistoryProjection}
        currency={currency}
        today={today}
        onClose={() => setHistoryEntry(null)}
      />
    </div>
  );
}
