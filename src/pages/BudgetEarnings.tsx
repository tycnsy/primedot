import { useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import EarningsChart from '../components/budget/EarningsChart';
import EditSnapshotModal from '../components/budget/EditSnapshotModal';
import AddIncomeModal from '../components/budget/AddIncomeModal';
import PeriodSelector from '../components/budget/PeriodSelector';
import {
  buildMonthlyEarningsChartData,
  earningsForMonth,
  earningsPaceDelta,
  formatDisplayDate,
  formatEarnedMonth,
  formatMoney,
  formatSignedMoney,
  isInMonth,
  isoDate,
  monthKey,
  paceComparisonDate,
  useAccounts,
  useBudgetPreferences,
  useEarnings,
  useIncome,
} from '../features/budget';
import type { IncomeEntry, MonthlyEarningsSnapshot } from '../features/budget';

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

export default function BudgetEarnings() {
  const { currency } = useBudgetPreferences();
  const { accounts } = useAccounts();
  const { incomeEntries, addIncome, updateIncome, deleteIncome, markReceived } = useIncome();
  const { snapshots, goalsByMonth, setGoal, deleteSnapshot, updateSnapshot } = useEarnings();

  const currentMonth = monthKey(new Date());
  const today = isoDate(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<IncomeEntry | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<MonthlyEarningsSnapshot | null>(null);
  const [goalInput, setGoalInput] = useState('');

  const isCurrentMonth = monthKey(month) === currentMonth;

  const chartData = useMemo(
    () =>
      buildMonthlyEarningsChartData({
        snapshots,
        month,
        goalAmount: goalsByMonth.get(monthKey(month))?.goalAmount,
      }),
    [snapshots, month, goalsByMonth],
  );

  const paceAsOfDate = useMemo(
    () => paceComparisonDate(month, currentMonth, today),
    [month, currentMonth, today],
  );

  const monthTotal = useMemo(
    () => earningsForMonth(month, incomeEntries),
    [incomeEntries, month],
  );

  const monthGoal = goalsByMonth.get(monthKey(month))?.goalAmount;
  const deltaVsPace =
    paceAsOfDate != null && monthGoal != null
      ? earningsPaceDelta(monthTotal, monthGoal, paceAsOfDate, month)
      : null;

  const paceLabel = isCurrentMonth ? 'vs pace today' : 'vs goal';

  const monthEntries = useMemo(
    () =>
      incomeEntries
        .filter((entry) => isInMonth(entry.earnedMonth, month))
        .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    [incomeEntries, month],
  );

  const monthSnapshots = useMemo(
    () =>
      snapshots
        .filter((snapshot) => isInMonth(snapshot.earnedMonth, month))
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [month, snapshots],
  );

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.type !== 'credit'),
    [accounts],
  );

  const syncGoalInput = (value: number | undefined) => {
    setGoalInput(value != null ? String(value) : '');
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Earnings"
        subtitle="Track income by the month it was earned, not when it was paid out."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector month={month} currentMonth={currentMonth} onChange={setMonth} />
        <p className="text-xs text-muted">
          {month === currentMonth ? 'Current month' : 'Viewing earned month'}
        </p>
      </div>

      <section className="card space-y-3">
        <p className="label">{formatEarnedMonth(month)} earnings over time</p>
        <EarningsChart
          data={chartData}
          currency={currency}
          paceMarkerDate={isCurrentMonth ? paceAsOfDate : null}
          onDeleteSnapshot={(id) => {
            if (window.confirm('Delete this data point from the chart?')) {
              void deleteSnapshot(id);
            }
          }}
        />
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label">{formatEarnedMonth(month)} earnings</p>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {formatMoney(monthTotal, currency)}
            </p>
            {deltaVsPace != null ? (
              <p
                className={`text-sm tabular-nums ${deltaVsPace >= 0 ? 'text-success' : 'text-danger'}`}
              >
                {formatSignedMoney(deltaVsPace, currency)} {paceLabel}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="label">Goal for this month</label>
            <div className="flex gap-2">
              <input
                className="input w-32"
                inputMode="decimal"
                placeholder="0.00"
                value={goalInput || (monthGoal != null ? String(monthGoal) : '')}
                onChange={(e) => setGoalInput(e.target.value)}
                onFocus={() => syncGoalInput(monthGoal)}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const amount = Number(goalInput || monthGoal);
                  if (!Number.isFinite(amount) || amount <= 0) return;
                  void setGoal(month, amount);
                  setGoalInput('');
                }}
              >
                Save goal
              </button>
            </div>
          </div>
        </div>
      </section>

      {monthEntries.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">No income earned in this month yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="label">Contributing income</p>
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
                  Payout {formatDisplayDate(entry.expectedDate)}
                  {entry.receivedDate ? ` · received ${formatDisplayDate(entry.receivedDate)}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                {formatMoney(entry.amount, currency)}
              </p>
              <div className="flex shrink-0 gap-1">
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

      {monthSnapshots.length > 0 ? (
        <section className="card space-y-2">
          <p className="label">Update history</p>
          <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_7rem_4.5rem] items-center gap-x-3 gap-y-1 border-b border-border/60 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            <span>Time</span>
            <span>Note</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="space-y-0">
            {monthSnapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_7rem_4.5rem] items-center gap-x-3 gap-y-1 border-b border-border/40 py-2 text-sm last:border-b-0"
              >
                <span className="tabular-nums text-muted">
                  {new Date(snapshot.recordedAt).toLocaleString()}
                </span>
                <span className="truncate text-muted">{snapshot.note ?? '—'}</span>
                <span className="text-right tabular-nums text-fg">
                  {formatMoney(snapshot.totalAmount, currency)}
                </span>
                <div className="flex justify-end gap-0.5">
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    aria-label="Edit update"
                    title="Edit update"
                    onClick={() => setEditSnapshot(snapshot)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs text-danger"
                    aria-label="Delete update"
                    title="Delete update"
                    onClick={() => {
                      if (window.confirm('Delete this data point?')) {
                        void deleteSnapshot(snapshot.id);
                      }
                    }}
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AddIncomeModal
        open={modalOpen}
        entry={editEntry}
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

      <EditSnapshotModal
        open={!!editSnapshot}
        snapshot={editSnapshot}
        onClose={() => setEditSnapshot(null)}
        onSave={(patch) => {
          if (!editSnapshot) return;
          void updateSnapshot(editSnapshot.id, patch);
        }}
      />
    </div>
  );
}
